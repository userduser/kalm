const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const settings = require("../src/comments/settings.js");
const { connect } = require("../src/comments/bridge.js");
const flush = () => new Promise(setImmediate);

test("site input normalizes URL hostnames and rejects unsupported or ambiguous rules", () => {
  assert.equal(settings.normalizeDomain(" HTTPS://Spam.Example.COM./offer?q=1 "), "spam.example.com");
  assert.equal(settings.normalizeDomain("bücher.example"), "xn--bcher-kva.example");
  assert.deepEqual(settings.normalizeList(["TINYURL.COM", "tinyurl.com", "blogspot.com"]), ["blogspot.com", "tinyurl.com"]);
  for (const value of ["", "*.example.com", "localhost", "127.0.0.1", "https://user@example.com", "https://example.com:9000", "ftp://example.com", "example.com other.org", "-bad.example", "a..example"]) {
    assert.throws(() => settings.normalizeDomain(value), undefined, value);
  }
});

test("local settings persist additions, removals, and an explicitly empty list", async () => {
  const data = {};
  const area = { get: async () => data, set: async value => Object.assign(data, value) };
  assert.deepEqual(await settings.createStore(area).read(), ["blogspot.com", "tinyurl.com"]);
  await settings.createStore(area).write(["tinyurl.com", "https://spam.example/path"]);
  assert.deepEqual(await settings.createStore(area).read(), ["spam.example", "tinyurl.com"]);
  await settings.createStore(area).write([]);
  assert.deepEqual(await settings.createStore(area).read(), []);
  assert.deepEqual(data, { [settings.KEY]: [] });
  await assert.rejects(settings.createStore({ get: async () => ({ [settings.KEY]: "broken" }) }).read());
});

test("master switch defaults on and persists independently from the site list", async () => {
  const data = {}, area = { get: async () => data, set: async next => Object.assign(data, next) };
  const store = settings.createStore(area);
  assert.equal((await store.readConfig()).enabled, true);
  await store.writeEnabled(false);
  await store.write(["example.org"]);
  assert.deepEqual(await store.readConfig(), { domains: ["example.org"], enabled: false });
  await store.writeEnabled(true);
  assert.deepEqual(await store.readConfig(), { domains: ["example.org"], enabled: true });
  await assert.rejects(store.writeEnabled("false"));
  data[settings.ENABLED_KEY] = "false";
  await assert.rejects(store.readConfig(), /master switch/);
});

test("Safari settings preserve both the master switch and saved domains", async () => {
  const data = new Map(), storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const store = settings.createPageStore(storage);
  await store.writeEnabled(false); await store.write(["example.org"]);
  assert.deepEqual(await settings.createPageStore(storage).readConfig(), { domains: ["example.org"], enabled: false });
  assert.equal(data.get(settings.ENABLED_KEY), "false");
});

function page(doc) {
  const warnings = [];
  const scope = vm.createContext({ document: doc, CustomEvent, URL, performance, console: { warn: text => warnings.push(text) } });
  for (const file of ["settings.js", "rules.js", "filter.js", "runtime.js", "extension-start.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/comments", file), "utf8"), scope, { filename: file });
  }
  return { scope, warnings };
}

test("delayed extension storage never starts screening under the default list", async () => {
  const doc = new EventTarget();
  const { scope } = page(doc);
  let loaded;
  connect(doc, { readConfig: () => new Promise(resolve => { loaded = resolve; }) });
  assert.equal(scope.__YTCommentFilter, undefined);
  loaded({ domains: ["spam.example"], enabled: true }); await flush();
  assert.deepEqual(Array.from(scope.__YTCommentFilter.blockedDomains), ["spam.example"]);
  assert.equal(scope.__YTCommentFilter.classifyBody("https://tinyurl.com/now-allowed"), null);
  assert.equal(scope.__YTCommentFilter.classifyBody("https://sub.spam.example/offer"), "blockedDomains");
  assert.equal(scope.__YTCommentFilter.classifyProfile("https://spam.example/bio"), "blockedDomains");
  assert.equal(scope.__YTCommentFilter.classifyBody("https://spam.example.safe.org"), null);
});

test("settings handshake works when isolated storage loads before the page-world listener", async () => {
  const doc = new EventTarget();
  connect(doc, { readConfig: async () => ({ domains: [], enabled: true }) }); await flush();
  const { scope } = page(doc); await flush();
  assert.deepEqual(Array.from(scope.__YTCommentFilter.blockedDomains), []);
  assert.equal(scope.__YTCommentFilter.classifyProfile("tinyurl.com"), null);
});

test("failed storage and invalid settings never approve comments using fallback rules", async () => {
  const doc = new EventTarget();
  const { scope, warnings } = page(doc);
  connect(doc, { readConfig: async () => { throw new Error("Storage failure"); } }); await flush();
  assert.equal(scope.__YTCommentFilter, undefined); assert.equal(warnings.length, 1);
  doc.dispatchEvent(new CustomEvent("ycf-settings-response-v1", { detail: '{"domains":["*.example"]}' }));
  assert.equal(scope.__YTCommentFilter, undefined);
  assert.equal(warnings.length, 2);
});

test("explicitly disabled settings release the gate without installing parsing hooks", async () => {
  const doc = new EventTarget(), attributes = new Map();
  doc.documentElement = { setAttribute: (key, value) => attributes.set(key, value) };
  const { scope } = page(doc);
  const nativeParse = vm.runInContext("JSON.parse", scope);
  connect(doc, { readConfig: async () => ({ domains: ["tinyurl.com"], enabled: false }) }); await flush();
  assert.equal(scope.__YTCommentFilter.enabled, false);
  assert.deepEqual(Array.from(scope.__YTCommentFilter.hooks), []);
  assert.equal(vm.runInContext("JSON.parse", scope), nativeParse);
  assert.equal(attributes.has("data-ycf-off"), true);
  assert.equal(scope.__YTCommentFilter.stats().ui.active, false);
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { createFilter, installHooks } = require("../src/comments/filter.js");
const { entity, batch, ids } = require("./fixtures.cjs");
function realm() {
  const context = vm.createContext({});
  return vm.runInContext("({ JSON })", context);
}
function example() { return batch([entity("good", "Good comment"), entity("bad", "https://tinyurl.com/x")]); }

test("JSON.parse returns the filtered object synchronously before the caller renders it", () => {
  const scope = realm();
  const original = scope.JSON.parse;
  const filter = createFilter();
  const hooks = installHooks(scope, filter);
  const parsed = scope.JSON.parse(JSON.stringify(example()));
  assert.deepEqual(Array.from(ids(parsed)), ["good"]);
  assert.equal(scope.JSON.parse.length, original.length);
  assert.equal(scope.JSON.parse.name, original.name);
  assert.equal(scope.JSON.parse("3"), 3);
  assert.throws(() => scope.JSON.parse("{"), { name: "SyntaxError" });
  assert.equal(scope.JSON.parse('{"x":1}', (key, value) => key === "x" ? 2 : value).x, 2);
  hooks.restore();
  assert.equal(scope.JSON.parse, original);
});

test("native Response.json performs one body read without cloning or serialization", async () => {
  const scope = realm();
  let reads = 0;
  class ResponseFixture {
    constructor(value) { this.value = value; }
    async json() { reads++; return this.value; }
    clone() { throw new Error("Must never clone"); }
    text() { throw new Error("Must never read text"); }
  }
  scope.Response = ResponseFixture;
  const payload = example();
  installHooks(scope, createFilter());
  const parsed = await new ResponseFixture(payload).json();
  assert.equal(parsed, payload);
  assert.deepEqual(ids(parsed), ["good"]);
  assert.equal(reads, 1);
});

test("Response.json rejections remain rejections", async () => {
  const scope = realm();
  class ResponseFixture { json() { return Promise.reject(new SyntaxError("Invalid JSON")); } }
  scope.Response = ResponseFixture;
  installHooks(scope, createFilter());
  await assert.rejects(new ResponseFixture().json(), SyntaxError);
});

test("browser-parsed XHR JSON is filtered before reading; text responses remain text", () => {
  const scope = realm();
  class XHRFixture {
    constructor(value, type = "json") { this.value = value; this.responseType = type; }
    get response() { return this.value; }
  }
  scope.XMLHttpRequest = XHRFixture;
  const original = Object.getOwnPropertyDescriptor(XHRFixture.prototype, "response").get;
  const filter = createFilter();
  const hooks = installHooks(scope, filter);
  const xhr = new XHRFixture(example());
  assert.deepEqual(ids(xhr.response), ["good"]);
  assert.equal(xhr.response, xhr.value);
  assert.equal(filter.getStats().screened, 2);
  const text = JSON.stringify(example());
  assert.equal(new XHRFixture(text, "text").response, text);
  hooks.restore();
  assert.equal(Object.getOwnPropertyDescriptor(XHRFixture.prototype, "response").get, original);
});

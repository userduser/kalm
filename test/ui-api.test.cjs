const { test } = require('node:test');
const assert = require('node:assert/strict');
const api = () => import('../src/ui/api.mjs');
function environment(granted = true) {
  const events = [], tab = { id: 7, url: 'https://www.youtube.com/watch?v=TEST' };
  const browser = {
    runtime: { sendMessage: async message => { events.push(['message', message]); return message.what === 'setFilteringMode' || message.what === 'setDefaultFilteringMode' ? message.level : undefined; }, getURL: path => 'moz-extension://test/' + path },
    permissions: { request: origins => { events.push(['permission', origins]); return Promise.resolve(granted); } },
    tabs: { query: async () => [tab], get: async () => tab, update: async (...args) => events.push(['update', ...args]), reload: async id => events.push(['reload', id]), create: async args => events.push(['create', args]) },
    scripting: { executeScript: async args => events.push(['script', args]) },
    storage: { local: { set: async args => events.push(['storage', args]) } },
  };
  return { browser, tab, events };
}
test('per-site mode requests permissions within the click and commits the engine-confirmed mode', async () => {
  const { createClient } = await api(), { browser, tab, events } = environment();
  assert.equal(await createClient(browser).setMode(tab, 1, 3, true), 3);
  assert.equal(events[1][0], 'permission');
  assert.deepEqual(events[1][1].origins, ['*://*.www.youtube.com/*']);
  assert.deepEqual(events[2], ['message', { what: 'setFilteringMode', hostname: 'www.youtube.com', level: 3 }]);
  assert.deepEqual(events.at(-1), ['reload', 7]);
});
test('denied permissions leave the existing filtering mode and tab untouched', async () => {
  const { createClient } = await api(), { browser, tab, events } = environment(false);
  assert.equal(await createClient(browser).setMode(tab, 1, 3, true), 1);
  assert.equal(events.some(([type, value]) => type === 'message' && value.what === 'setFilteringMode'), false);
  assert.equal(events.some(([type]) => type === 'reload'), false);
});
test('element tools inject the actual upstream tool into the original website tab, not setup', async () => {
  const { createClient } = await api(), { browser, tab, events } = environment();
  await createClient(browser).tool('picker', tab);
  assert.equal(events[0][0], 'permission');
  assert.deepEqual(events.at(-1), ['script', { files: ['/js/scripting/css-procedural-api.js', '/js/scripting/tool-overlay.js', '/js/scripting/picker.js'], target: { tabId: 7 } }]);
  assert.deepEqual(events.at(-2), ['update', 7, { active: true }]);
});
test('a website navigation between setup and picking cannot redirect a tool to another origin', async () => {
  const { createClient } = await api(), { browser, tab, events } = environment();
  browser.tabs.get = async () => ({ id: 7, url: 'https://example.org/' });
  await assert.rejects(createClient(browser).tool('zapper', tab), /target tab changed/);
  assert.equal(events.some(([type]) => type === 'script'), false);
});
test('setup preserves the website tab ID and global-mode permissions use all URLs', async () => {
  const { createClient } = await api(), { browser, tab, events } = environment();
  const client = createClient(browser);
  await client.setup('comments', tab);
  assert.equal(events[0][1].url, 'moz-extension://test/kalm/ui/options.html?section=comments&tab=7');
  await client.setDefaultMode(2);
  assert.deepEqual(events[1][1].origins, ['<all_urls>']);
});

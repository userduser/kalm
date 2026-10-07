const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const pin = require('../tools/upstream.json');
const platforms = Object.keys(pin.packages);
const flush = () => new Promise(setImmediate);
for (const platform of platforms) {
  const output = path.join(root, 'dist', platform);
  const available = fs.existsSync(path.join(output, 'manifest.json'));
  test(`${platform}: package preserves its platform background, permissions, DNR rules, and distinct script worlds`, { skip: !available && 'Run npm run build to test packages' }, () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json')));
    const original = JSON.parse(execFileSync('unzip', ['-p', path.join(root, '.cache/upstream', pin.packages[platform].file), 'manifest.json']));
    assert.equal(manifest.name, 'Kalm'); assert.equal(manifest.manifest_version, 3);
    assert.deepEqual(manifest.background, original.background);
    assert.deepEqual(manifest.permissions, original.permissions);
    assert.deepEqual(manifest.declarative_net_request, original.declarative_net_request);
    const [main, bridge] = manifest.content_scripts.slice(-2);
    assert.equal(main.run_at, 'document_start'); assert.equal(bridge.run_at, 'document_start');
    assert.equal(main.world, 'MAIN'); assert.equal(bridge.world, 'ISOLATED');
    assert.equal(main.js.some(file => bridge.js.includes(file)), false);
    for (const file of [...main.js, ...bridge.js, ...main.css, manifest.action.default_popup]) assert.ok(fs.existsSync(path.join(output, file)));
    assert.ok(fs.existsSync(path.join(output, 'LICENSE.txt')));
    if (platform === 'firefox') { assert.equal(manifest.browser_specific_settings.gecko.id, 'kalm@userduser.github.io'); assert.equal(fs.existsSync(path.join(output, 'META-INF')), false); }
    if (platform === 'safari') assert.equal(manifest.browser_specific_settings.safari.strict_min_version, '18.6');
    for (const ruleset of manifest.declarative_net_request.rule_resources) {
      const filename = ruleset.path.replace(/^\//, '');
      assert.deepEqual(fs.readFileSync(path.join(output, filename)), execFileSync('unzip', ['-p', path.join(root, '.cache/upstream', pin.packages[platform].file), filename], { maxBuffer: 20 * 1024 * 1024 }));
    }
    for (const filename of ['js/background.js', 'js/mode-manager.js', 'js/ext-compat.js', 'js/scripting/picker.js', 'js/scripting/zapper.js']) assert.deepEqual(fs.readFileSync(path.join(output, filename)), execFileSync('unzip', ['-p', path.join(root, '.cache/upstream', pin.packages[platform].file), filename]));
  });
  for (const storageFirst of [true, false]) test(`${platform}: actual built world bridge passes saved link/keyword rules (${storageFirst ? 'storage first' : 'page first'})`, { skip: !available && 'Run npm run build to test packages' }, async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json')));
    const [main, bridge] = manifest.content_scripts.slice(-2);
    const doc = new EventTarget();
    const page = vm.createContext({ URL, document: doc, CustomEvent, performance, console });
    const extension = vm.createContext({ URL, document: doc, CustomEvent, console,
      [platform === 'chromium' ? 'chrome' : 'browser']: { storage: { local: { get: async () => ({ 'ycf.blockedDomains.v1': [], 'kalm.keywords.v1': ['bot'], 'kalm.allLinks.v1': true }) } } } });
    function run(files, context) { for (const file of files) vm.runInContext(fs.readFileSync(path.join(output, file), 'utf8'), context, { filename: file }); }
    // Profile and gate browser APIs are purposefully withheld here: this checks
    // the actual startup handshake, not a pretend native extension installation.
    const pageFiles = main.js.filter(file => !/\/(?:profiles|gate)\.js$/.test(file));
    if (storageFirst) { run(bridge.js, extension); await flush(); run(pageFiles, page); }
    else { run(pageFiles, page); run(bridge.js, extension); }
    await flush();
    assert.equal(page.__YTCommentFilter.classifyBody('www.example.org'), 'allLinks');
    assert.equal(page.__YTCommentFilter.classifyBody('BOT!'), 'keywords');
    assert.equal(page.__YTCommentFilter.classifyBody('HTTPS helps'), null);
    assert.equal(page.__YTCommentFilter.classifyProfile('https://example.org/bio'), null);
    assert.equal(page.__YTCommentFilter.classifyProfile('bot'), null);
  });
}

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { describe } = require('../src/comments/gate.js');
const A = 'UC' + 'a'.repeat(22), B = 'UC' + 'b'.repeat(22);
const content = { content: 'Ordinary comment', commandRuns: [] };
const api = { authorFor: key => key === 'author-a' ? A : undefined };
function makeRow(properties = {}, href, parent = null) {
  const body = { textContent: 'Ordinary comment', querySelectorAll: () => [] };
  const author = href ? { getAttribute: () => href } : null;
  const row = { ...properties, closest: () => parent, querySelector: selector => selector.includes('content-text') ? body : author };
  return row;
}
test('normal-video viewModel and commentEntity supply identity and body without an author anchor', () => {
  const row = makeRow({ polymerController: { viewModel: { commentKey: 'fresh' }, commentEntity: { author: { channelId: B }, properties: { content } } } });
  const result = describe(row, api);
  assert.equal(result.id, B); assert.equal(result.path, null); assert.equal(result.contents[0], content);
  assert.equal(describe(makeRow({ viewModel: { commentKey: 'author-a' } }), api).id, A);
});
test('creator and legacy author endpoints work even if the thumbnail is a button', () => {
  assert.equal(describe(makeRow({ inst: { authorNameEndpoint: { browseEndpoint: { browseId: B } } } }), api).id, B);
  assert.equal(describe(makeRow({ data: { authorEndpoint: { browseEndpoint: { browseId: A } } } }), api).id, A);
});
test('thread identity is available only to its primary comment, never inherited by replies', () => {
  const thread = { data: { commentViewModel: { commentViewModel: { commentKey: 'author-a' } } }, querySelector: () => primary };
  const primary = makeRow({}, undefined, thread), reply = makeRow({}, undefined, thread);
  assert.equal(describe(primary, api).id, A); assert.equal(describe(reply, api).id, null);
});
test('a recycled entity changes the fingerprint even when its rendered text and handle are unchanged', () => {
  const row = makeRow({ viewModel: { commentKey: 'old' }, commentEntity: { author: { channelId: A }, properties: { content } } }, '/@same-handle');
  const first = describe(row, api);
  row.commentEntity = { author: { channelId: B }, properties: { content: { ...content, commandRuns: [{ onTap: { browseEndpoint: { browseId: A } } }] } } };
  const next = describe(row, api);
  assert.equal(next.id, B); assert.notEqual(next.fingerprint, first.fingerprint);
});
test('handle fallback accepts only YouTube author links and ignores malformed model IDs', () => {
  assert.equal(describe(makeRow({ data: { author: { channelId: 'bad' } } }, '/@nesgabri'), api).path, '/@nesgabri');
  const external = describe(makeRow({}, 'https://example.org/channel/' + B), api);
  assert.equal(external.id, null); assert.equal(external.path, null);
});

test('a recycled handle does not borrow the approval of a stale entity with another canonical handle', () => {
  const row = makeRow({ commentEntity: { author: { channelId: A, channelCommand: { innertubeCommand: { browseEndpoint: { browseId: A, canonicalBaseUrl: '/@old-author' } } } }, properties: { content } } }, '/@nesgabri');
  const result = describe(row, api);
  assert.equal(result.id, null); assert.equal(result.path, '/@nesgabri');
});
test('conflicting model and entity identities stay unresolved until native stamping completes', () => {
  const row = makeRow({ viewModel: { commentKey: 'author-a' }, commentEntity: { author: { channelId: B }, properties: { content } } }, '/@someone');
  const stale = describe(row, api);
  assert.equal(stale.id, null); assert.equal(stale.path, null);
  row.commentEntity.author.channelId = A;
  const settled = describe(row, api);assert.equal(settled.id, A);assert.notEqual(settled.fingerprint, stale.fingerprint);
});

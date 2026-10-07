// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Kalm contributors.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFilter } = require('../src/comments/filter.js');
const settings = require('../src/comments/settings.js');
const { batch, entity, ids, bodyItems } = require('./fixtures.cjs');

test('all-links toggle removes URLs, bare site names and clickable video links without rejecting prose or emails', () => {
  const on = createFilter({ blockAllLinks: true, blockedDomains: [], blockChannelLinks: false });
  for (const value of [
    'https://example.com/path',
    'www.example.org',
    'Go to example.com/offer',
    'http://example.xyz',
    'https://example.com/?q=word',
  ]) {
    assert.equal(on.classifyContent(value), 'allLinks', value);
  }
  for (const value of [
    'HTTPS is secure',
    'www is a prefix',
    'Version 3.0.1',
    'user@example.com',
    'Useful real comment',
    'Read notes.txt',
    '@someone',
  ]) {
    assert.equal(on.classifyContent(value), null, value);
  }
  assert.equal(
    on.classifyContent({
      runs: [{ text: 'my video', navigationEndpoint: { watchEndpoint: { videoId: 'VIDEO' } } }],
    }),
    'allLinks',
  );
  assert.equal(on.classifyContent('https://'), null);
  assert.equal(createFilter({ blockedDomains: [] }).classifyContent('https://example.com'), null);
});

test('keywords are literal, Unicode-aware whole words and phrases, not regular expressions', () => {
  const filter = createFilter({ blockedKeywords: ['bot', 'find your partner', 'c++', 'café'] });
  for (const value of [
    'BOT!',
    'Please Find  Your\nPartner here',
    'I love c++!',
    'Try café',
    'ＢＯＴ',
  ])
    assert.equal(filter.classifyContent(value), 'keywords', value);
  for (const value of ['robot', 'botanical', 'cafe', 'real comment', 'find your partnership'])
    assert.equal(filter.classifyContent(value), null, value);
});

test('new body rules remove rows and entities before rendering while keeping pagination', () => {
  const input = batch([
    entity('keep', 'An ordinary comment'),
    entity('url', 'www.example.org'),
    entity('word', 'Find your partner!'),
  ]);
  const filter = createFilter({ blockAllLinks: true, blockedKeywords: ['find your partner'] });
  filter.filterPayload(input);
  assert.deepEqual(ids(input), ['keep']);
  assert.equal(filter.getStats().allLinks, 1);
  assert.equal(filter.getStats().keywords, 1);
  assert.ok(bodyItems(input).at(-1).continuationItemRenderer);
});

test('new options persist independently and old saved lists migrate without losing rules', async () => {
  const data = { [settings.KEY]: ['example.org'] };
  const store = settings.createStore({
    get: async () => data,
    set: async (next) => Object.assign(data, next),
  });
  await store.writeKeywords([' Bot ', 'BOT', 'Find   your partner']);
  await store.writeToggle(settings.LINKS_KEY, true);
  await store.writeToggle(settings.CHANNELS_KEY, false);
  assert.deepEqual(await store.readConfig(), {
    domains: ['example.org'],
    enabled: true,
    keywords: ['bot', 'find your partner'],
    blockAllLinks: true,
    blockChannelLinks: false,
  });
  await assert.rejects(store.writeKeywords(['']));
  await assert.rejects(store.writeToggle('bad.key', true));
  await assert.rejects(store.writeKeywords(Array(257).fill('bot')));
});

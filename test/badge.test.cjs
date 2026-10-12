// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Kalm contributors.
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('badge styling uses the native API without changing its count or enabled state', async () => {
  const { colorBadge } = await import('../src/ui/badge.mjs');
  const calls = [];
  await colorBadge({
    setBadgeBackgroundColor: async (details) => calls.push(['background', details]),
    setBadgeTextColor: async (details) => calls.push(['text', details]),
    setBadgeText: () => assert.fail('The engine owns the count'),
    disable: () => assert.fail('Styling must not disable the action'),
  });
  assert.deepEqual(calls, [
    ['background', { color: '#2d7046' }],
    ['text', { color: '#f2fff4' }],
  ]);
});

test('missing or failing badge APIs never reject background initialization', async () => {
  const { colorBadge } = await import('../src/ui/badge.mjs');
  await colorBadge();
  await colorBadge({});
  let textApplied = false;
  await colorBadge({
    setBadgeBackgroundColor: () => {
      throw new Error('Unsupported');
    },
    setBadgeTextColor: async () => {
      textApplied = true;
    },
  });
  assert.equal(textApplied, true);
  await colorBadge({
    setBadgeBackgroundColor: async () => {
      throw new Error('Unavailable');
    },
  });
});

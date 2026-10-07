// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Kalm contributors.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFilter } = require('../src/comments/filter.js');
const {
  createProfileService,
  createYoutubeLoader,
  readProfile,
  hasChannelSection,
  profileSignature,
} = require('../src/comments/profiles.js');
const channelSection = require('./fixtures/channel-section.json');
const A = 'UC' + 'a'.repeat(22),
  B = 'UC' + 'b'.repeat(22),
  C = 'UC' + 'c'.repeat(22);
const flush = () => new Promise(setImmediate);
const matcher = createFilter({ blockChannelLinks: false }).classifyContent;
const about = (id, description = '', links = []) => ({
  onResponseReceivedEndpoints: [
    {
      appendContinuationItemsAction: {
        continuationItems: [
          {
            aboutChannelRenderer: {
              metadata: {
                aboutChannelViewModel: {
                  channelId: id,
                  description,
                  canonicalChannelUrl: `https://www.youtube.com/channel/${id}`,
                  links: links.map((url) => ({
                    channelExternalLinkViewModel: {
                      link: {
                        content: 'Website',
                        commandRuns: [{ onTap: { innertubeCommand: { urlEndpoint: { url } } } }],
                      },
                    },
                  })),
                },
              },
            },
          },
        ],
      },
    },
  ],
});

test('profile screening checks descriptions, header links, and secondary external links by destination', () => {
  assert.equal(
    readProfile(about(A, 'See my blog: example.blogspot.com'), A, matcher).blocked,
    true,
  );
  assert.equal(
    readProfile(
      about(A, '', [
        'https://example.org',
        'https://www.youtube.com/redirect?q=https%3A%2F%2Ftinyurl.com%2Fx',
      ]),
      A,
      matcher,
    ).blocked,
    true,
  );
  const header = {
    metadata: { channelMetadataRenderer: { externalId: A, description: 'Normal description' } },
    header: {
      pageHeaderRenderer: {
        content: {
          pageHeaderViewModel: {
            attribution: { attributionViewModel: { text: { content: 'tinyurl.com/x' } } },
          },
        },
      },
    },
  };
  assert.equal(readProfile(header, A, matcher).blocked, true);
  assert.equal(
    readProfile(
      about(A, 'https://www.youtube.com/@somebody', ['https://notblogspot.com']),
      A,
      matcher,
    ).blocked,
    false,
  );
  assert.throws(() => readProfile(about(B, 'tinyurl.com/x'), A, matcher), /identity mismatch/);
  assert.equal(readProfile({}, A, matcher).complete, false);
});

test('the captured channel Home section blocks its author even with an empty bio and site list', () => {
  const id = channelSection.metadata.channelMetadataRenderer.externalId;
  const result = readProfile(
    channelSection,
    id,
    createFilter({ blockedDomains: [], blockChannelLinks: false }).classifyContent,
  );
  assert.equal(result.blocked, true);
  assert.equal(result.reason, 'channelSection');
  // A new author and unrelated title/card IDs receive the same automatic rule.
  const generic = structuredClone(channelSection);
  generic.metadata.channelMetadataRenderer.externalId = A;
  const tab = generic.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer;
  tab.title = 'Startseite';
  tab.endpoint.browseEndpoint.browseId = A;
  const shelf =
    tab.content.sectionListRenderer.contents[0].itemSectionRenderer.contents[0].shelfRenderer;
  shelf.title = { simpleText: 'Friends' };
  shelf.content.horizontalListRenderer.items = [
    {
      gridChannelRenderer: {
        channelId: B,
        navigationEndpoint: { browseEndpoint: { browseId: B } },
      },
    },
  ];
  assert.equal(readProfile(generic, A, matcher).blocked, true);
  assert.throws(() => readProfile(generic, B, matcher), /identity mismatch/);
  delete generic.metadata;
  assert.throws(() => readProfile(generic, A, matcher), /identity missing/);
});

test('channel sections exclude video-owner links, sidebars, inactive tabs, invalid cards, and self links', () => {
  const id = channelSection.metadata.channelMetadataRenderer.externalId;
  const shelved = () => structuredClone(channelSection);
  const tabFor = (data) => data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer;
  const shelfFor = (data) =>
    tabFor(data).content.sectionListRenderer.contents[0].itemSectionRenderer.contents[0]
      .shelfRenderer;
  const hidden = shelved();
  tabFor(hidden).selected = false;
  assert.equal(hasChannelSection(hidden, id), false);
  const unrelated = shelved();
  tabFor(unrelated).endpoint.browseEndpoint.browseId = B;
  assert.equal(hasChannelSection(unrelated, id), false);
  const videoOnly = shelved();
  shelfFor(videoOnly).content.horizontalListRenderer.items = [
    {
      gridVideoRenderer: {
        ownerText: {
          runs: [{ text: 'A channel', navigationEndpoint: { browseEndpoint: { browseId: B } } }],
        },
      },
    },
  ];
  videoOnly.guide = channelSection.contents;
  videoOnly.sidebar = channelSection.contents;
  assert.equal(hasChannelSection(videoOnly, id), false);
  const noCards = shelved();
  shelfFor(noCards).content.horizontalListRenderer.items = [];
  assert.equal(hasChannelSection(noCards, id), false);
  for (const card of [
    { channelId: 'invalid', navigationEndpoint: { browseEndpoint: { browseId: 'invalid' } } },
    { channelId: B, navigationEndpoint: { browseEndpoint: { browseId: C } } },
    { channelId: id, navigationEndpoint: { browseEndpoint: { browseId: id } } },
  ]) {
    const data = shelved();
    shelfFor(data).content.horizontalListRenderer.items = [{ gridChannelRenderer: card }];
    assert.equal(hasChannelSection(data, id), false);
  }
  const direct = shelved();
  tabFor(direct).content.sectionListRenderer.contents = [{ shelfRenderer: shelfFor(direct) }];
  assert.equal(hasChannelSection(direct, id), true);
});

test('channel-section decisions stop after one parent request and repeated authors need no requests', async () => {
  const id = channelSection.metadata.channelMetadataRenderer.externalId;
  const requests = [];
  const loader = createYoutubeLoader(
    {
      ytcfg: { get: () => ({ client: { clientVersion: 'test' } }) },
      fetch: async (url, options) => {
        requests.push({ url, body: JSON.parse(options.body) });
        return { ok: true, json: async () => structuredClone(channelSection) };
      },
    },
    matcher,
  );
  const service = createProfileService({
    lookup: loader.lookup,
    signature: profileSignature(['tinyurl.com']),
  });
  assert.equal((await service.check(id)).blocked, true);
  assert.equal((await service.check(id)).blocked, true);
  assert.deepEqual(
    requests.map((request) => request.body.browseId),
    [id],
  );
  assert.equal(loader.stats().channelSections, 1);
});

test('the new automatic channel-section rule invalidates old saved approvals', async () => {
  const domains = ['tinyurl.com', 'blogspot.com'],
    id = channelSection.metadata.channelMetadataRenderer.externalId;
  let lookups = 0;
  const service = createProfileService({
    signature: profileSignature(domains),
    now: () => 1000,
    storage: {
      load: async () => [
        {
          id,
          signature: JSON.stringify([2, [...domains].sort()]),
          blocked: false,
          expiresAt: 2000,
        },
      ],
      save: async () => {},
    },
    lookup: async () => {
      lookups++;
      return readProfile(channelSection, id, matcher);
    },
  });
  assert.equal((await service.check(id)).blocked, true);
  assert.equal(lookups, 1);
  assert.equal(profileSignature(domains), profileSignature([...domains].reverse()));
});

test('one lookup per author, shared in-flight checks, and bounded concurrency', async () => {
  const releases = new Map();
  const service = createProfileService({
    signature: 'rules',
    concurrency: 2,
    lookup: (id) => new Promise((resolve) => releases.set(id, resolve)),
  });
  const calls = [service.check(A), service.check(A), service.check(B), service.check(C)];
  await flush();
  assert.equal(releases.size, 2);
  assert.equal(service.stats().active, 2);
  assert.equal(service.stats().queued, 1);
  assert.equal(service.stats().sharedLookups, 1);
  releases.get(A)({ blocked: false });
  await flush();
  assert.ok(releases.has(C));
  releases.get(B)({ blocked: true });
  releases.get(C)({ blocked: false });
  const results = await Promise.all(calls);
  assert.equal(results[0], results[1]);
  assert.equal((await service.check(B)).blocked, true);
  assert.equal(service.stats().lookups, 3);
});

test('cached decisions expire, changed rules invalidate saved decisions, and cache size is bounded', async () => {
  let time = 100,
    lookups = 0;
  const service = createProfileService({
    signature: 'new',
    ttlMs: 10,
    maxEntries: 2,
    now: () => time,
    storage: {
      load: async () => [{ id: A, signature: 'old', blocked: false, expiresAt: 105 }],
      save: async () => {},
    },
    lookup: async () => {
      lookups++;
      return { blocked: false };
    },
  });
  await service.check(A);
  assert.equal(lookups, 1);
  await service.check(A);
  assert.equal(lookups, 1);
  time = 111;
  await service.check(A);
  assert.equal(lookups, 2);
  await service.check(B);
  await service.check(C);
  assert.equal(service.stats().cachedAuthors, 2);
  assert.equal(service.peek(A), undefined);
});

test('persisted valid decisions require no network and failed checks never become approvals', async () => {
  let lookups = 0;
  const service = createProfileService({
    signature: 'same',
    ttlMs: 1000,
    now: () => 100,
    storage: {
      load: async () => [{ id: A, signature: 'same', blocked: true, expiresAt: 500 }],
      save: async () => {},
    },
    lookup: async () => {
      lookups++;
      throw new Error('Offline');
    },
  });
  assert.equal((await service.check(A)).blocked, true);
  assert.equal(lookups, 0);
  await assert.rejects(service.check(B), /Offline/);
  assert.equal(service.peek(B), undefined);
  await assert.rejects(service.check(B), /awaiting retry/);
  assert.equal(lookups, 1);
  service.retry();
  await assert.rejects(service.check(B), /Offline/);
  assert.equal(lookups, 2);
});

test('network loader follows the actual about token and never visits external links or sends cookies', async () => {
  const requests = [];
  const first = {
    metadata: { channelMetadataRenderer: { externalId: A, description: 'Normal' } },
    header: {
      pageHeaderRenderer: {
        content: {
          pageHeaderViewModel: {
            description: {
              descriptionPreviewViewModel: {
                rendererContext: {
                  commandContext: { onTap: { continuationCommand: { token: 'ACTUAL_TOKEN' } } },
                },
              },
            },
          },
        },
      },
    },
  };
  const loader = createYoutubeLoader(
    {
      ytcfg: { get: () => ({ client: { clientVersion: 'test-version' } }) },
      fetch: async (url, options) => {
        requests.push({ url, options });
        return {
          ok: true,
          json: async () =>
            requests.length === 1 ? first : about(A, '', ['https://tinyurl.com/x']),
        };
      },
    },
    matcher,
  );
  assert.equal((await loader.lookup(A)).blocked, true);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.options.credentials, 'omit');
    assert.equal(request.url, '/youtubei/v1/browse?prettyPrint=false');
  }
  assert.equal(JSON.parse(requests[1].options.body).continuation, 'ACTUAL_TOKEN');
});

test('unknown profile schemas and network failures remain errors', async () => {
  const loader = createYoutubeLoader(
    {
      ytcfg: { get: () => ({ client: { clientVersion: 'test' } }) },
      fetch: async () => ({ ok: true, json: async () => ({}) }),
    },
    matcher,
  );
  await assert.rejects(loader.lookup(A), /metadata unavailable/);
});

test('profile and handle requests share the same concurrency budget', async () => {
  const requests = [];
  const loader = createYoutubeLoader(
    {
      ytcfg: {
        get: (key) =>
          key === 'INNERTUBE_CONTEXT' ? { client: { clientVersion: 'test' } } : undefined,
      },
      fetch: (url, options) => new Promise((resolve) => requests.push({ url, options, resolve })),
    },
    matcher,
    { concurrency: 2 },
  );
  const results = Promise.all([
    loader.lookup(A),
    loader.lookup(B),
    loader.resolveHandle('/@example'),
  ]);
  await flush();
  assert.equal(requests.length, 2);
  assert.equal(loader.stats().networkActive, 2);
  requests[0].resolve({ ok: true, json: async () => about(A, 'tinyurl.com/x') });
  await flush();
  assert.equal(requests.length, 3);
  assert.equal(loader.stats().networkActive, 2);
  requests[1].resolve({ ok: true, json: async () => about(B, 'tinyurl.com/x') });
  requests[2].resolve({
    ok: true,
    json: async () => ({ endpoint: { browseEndpoint: { browseId: C } } }),
  });
  const values = await results;
  assert.equal(values[2], C);
  for (const request of requests) assert.equal(request.options.credentials, 'omit');
});

test('the supplied nesgabri profile is rejected by its three channel-card sections without inspecting images or child profiles', async () => {
  const data = require('./fixtures/nesgabri.json'),
    id = data.metadata.channelMetadataRenderer.externalId;
  let requests = 0;
  const loader = createYoutubeLoader(
    {
      ytcfg: { get: () => ({ client: { clientVersion: 'test' } }) },
      fetch: async () => {
        requests++;
        return { ok: true, json: async () => structuredClone(data) };
      },
    },
    matcher,
  );
  assert.equal((await loader.lookup(id)).reason, 'channelSection');
  assert.equal(requests, 1);
  const service = createProfileService({
    signature: profileSignature(['tinyurl.com', 'blogspot.com']),
    now: () => 1000,
    storage: {
      load: async () => [
        {
          id,
          blocked: false,
          expiresAt: 2000,
          signature: JSON.stringify([3, ['blogspot.com', 'tinyurl.com']]),
        },
      ],
    },
    lookup: loader.lookup,
  });
  assert.equal((await service.check(id)).blocked, true);
  assert.equal(requests, 2);
  assert.equal((await service.check(id)).blocked, true);
  assert.equal(requests, 2);
});

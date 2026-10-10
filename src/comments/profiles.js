// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Kalm contributors.
(function () {
  'use strict';
  const channelId = (id) => typeof id === 'string' && /^UC[\w-]{22}$/.test(id);
  // Changing profile rules must also invalidate previously saved approvals.
  const profileSignature = (domains) =>
    JSON.stringify([5, [...domains].map((x) => x.toLowerCase()).sort()]);

  function hasChannelSection(data, expectedId) {
    const tabs =
      data.contents?.twoColumnBrowseResultsRenderer?.tabs ||
      data.contents?.singleColumnBrowseResultsRenderer?.tabs ||
      [];
    const hasCard = (items) =>
      Array.isArray(items) &&
      items.some((item) => {
        const card = item?.gridChannelRenderer || item?.channelRenderer;
        const destination = card?.navigationEndpoint?.browseEndpoint?.browseId;
        return (
          channelId(card?.channelId) &&
          card.channelId !== expectedId &&
          destination === card.channelId
        );
      });
    const hasShelf = (item) => {
      const content = item?.shelfRenderer?.content;
      return (
        hasCard(content?.horizontalListRenderer?.items) ||
        hasCard(content?.expandedShelfContentsRenderer?.items) ||
        hasCard(content?.verticalListRenderer?.items) ||
        hasCard(content?.gridRenderer?.items)
      );
    };
    // Only visible channel-page content counts. Do not walk video owners, sidebar
    // subscriptions, hidden tab endpoints, or recommended-video metadata.
    return tabs.some((wrapper) => {
      const tab = wrapper?.tabRenderer;
      if (!tab?.selected || tab.endpoint?.browseEndpoint?.browseId !== expectedId) return false;
      const sections = tab.content?.sectionListRenderer?.contents;
      return (
        Array.isArray(sections) &&
        sections.some(
          (section) =>
            hasShelf(section) ||
            (Array.isArray(section?.itemSectionRenderer?.contents) &&
              section.itemSectionRenderer.contents.some(hasShelf)),
        )
      );
    });
  }

  function find(value, key) {
    const stack = [value];
    for (let visited = 0; stack.length && visited < 20000; visited++) {
      const item = stack.pop();
      if (!item || typeof item !== 'object') continue;
      if (item[key]) return item[key];
      for (const child of Object.values(item))
        if (child && typeof child === 'object') stack.push(child);
    }
    return undefined;
  }

  function readProfile(data, expectedId, classify) {
    const meta = data.metadata?.channelMetadataRenderer;
    if (meta?.externalId && meta.externalId !== expectedId)
      throw new Error('Profile identity mismatch');
    if (hasChannelSection(data, expectedId)) {
      if (!meta?.externalId) throw new Error('Profile identity missing');
      return { complete: true, blocked: true, id: meta.externalId, reason: 'channelSection' };
    }
    const about =
      find(data, 'aboutChannelViewModel') || find(data, 'channelAboutFullMetadataRenderer');
    const id = about?.channelId || meta?.externalId;
    if (id && id !== expectedId) throw new Error('Profile identity mismatch');
    const header = data.header?.pageHeaderRenderer?.content?.pageHeaderViewModel;
    const sameAs =
      data.microformat?.microformatDataRenderer?.channelProfileMicroformatDetails?.profilePage
        ?.mainEntity?.sameAs;
    const fields = [
      about?.description,
      about?.descriptionText,
      meta?.description,
      header?.description?.descriptionPreviewViewModel?.description,
      header?.attribution?.attributionViewModel?.text,
    ];
    for (const link of about?.links || []) fields.push(link.channelExternalLinkViewModel?.link);
    for (const link of about?.primaryLinks || [])
      fields.push({
        runs: [{ text: link.title?.simpleText || '', navigationEndpoint: link.navigationEndpoint }],
      });
    for (const url of sameAs || []) fields.push(url);
    if (fields.some((field) => field && classify(field) === 'blockedDomains')) {
      if (!id) throw new Error('Profile identity missing');
      return { complete: true, blocked: true, id };
    }
    if (about && id === expectedId) return { complete: true, blocked: false, id };
    const description = header?.description?.descriptionPreviewViewModel;
    const continuation = find(description, 'continuationCommand')?.token;
    return { complete: false, continuation };
  }

  function createProfileService({
    lookup,
    storage,
    signature,
    now = Date.now,
    ttlMs = 86400000,
    // A previously clean author can add a promotion shelf or bot link later.
    // Refresh approvals sooner, only when their comments are encountered again.
    approvalTtlMs = Math.min(ttlMs, 1800000),
    maxEntries = 2000,
    concurrency = 3,
  }) {
    const cache = new Map(),
      pending = new Map(),
      failures = new Map(),
      queue = [];
    const counts = {
      lookups: 0,
      cacheHits: 0,
      sharedLookups: 0,
      allowed: 0,
      blocked: 0,
      errors: 0,
      persistence: false,
    };
    let active = 0,
      stopped = false,
      generation = 0;
    const lifetime = (blocked) => (blocked ? ttlMs : Math.min(ttlMs, approvalTtlMs));
    function valid(entry) {
      return (
        entry &&
        channelId(entry.id) &&
        typeof entry.blocked === 'boolean' &&
        entry.signature === signature &&
        Number.isFinite(entry.expiresAt) &&
        entry.expiresAt > now() &&
        entry.expiresAt <= now() + lifetime(entry.blocked) + 60000
      );
    }
    function insert(entry) {
      cache.delete(entry.id);
      cache.set(entry.id, entry);
      while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
    }
    const ready = (async () => {
      try {
        const entries = (await storage?.load()) || [];
        for (const entry of entries) if (valid(entry)) insert(entry);
        counts.persistence = Boolean(storage);
      } catch {
        counts.persistence = false;
      }
    })();
    function peek(id) {
      const entry = cache.get(id);
      if (entry && !valid(entry)) {
        cache.delete(id);
        return undefined;
      }
      return entry;
    }
    function pump() {
      while (!stopped && active < concurrency && queue.length) {
        const job = queue.shift();
        active++;
        counts.lookups++;
        const startedGeneration = generation;
        Promise.resolve()
          .then(() => lookup(job.id))
          .then((result) => {
            if (typeof result?.blocked !== 'boolean') throw new Error('Incomplete profile check');
            if (stopped || generation !== startedGeneration)
              throw new Error('Profile check cancelled');
            const entry = {
              id: job.id,
              blocked: result.blocked,
              expiresAt: now() + lifetime(result.blocked),
              signature,
            };
            insert(entry);
            counts[result.blocked ? 'blocked' : 'allowed']++;
            Promise.resolve()
              .then(() => storage?.save(entry, maxEntries))
              .catch(() => {
                counts.persistence = false;
              });
            job.resolve(entry);
          })
          .catch((error) => {
            counts.errors++;
            failures.set(job.id, now() + 30000);
            while (failures.size > maxEntries) failures.delete(failures.keys().next().value);
            job.reject(error);
          })
          .finally(() => {
            active--;
            pending.delete(job.id);
            pump();
          });
      }
    }
    async function check(id) {
      if (!channelId(id)) throw new Error('Channel ID missing');
      await ready;
      if (stopped) throw new Error('Profile checks disabled');
      const hit = peek(id);
      if (hit) {
        counts.cacheHits++;
        return hit;
      }
      if (pending.has(id)) {
        counts.sharedLookups++;
        return pending.get(id);
      }
      if ((failures.get(id) || 0) > now()) throw new Error('Profile check awaiting retry');
      const promise = new Promise((resolve, reject) => queue.push({ id, resolve, reject }));
      pending.set(id, promise);
      pump();
      return promise;
    }
    return {
      peek,
      check,
      ready,
      retry: () => failures.clear(),
      clear: async () => {
        await ready;
        generation++;
        cache.clear();
        failures.clear();
        await storage?.clear();
      },
      stop: () => {
        stopped = true;
        generation++;
        for (const job of queue.splice(0)) {
          pending.delete(job.id);
          job.reject(new Error('Profile checks disabled'));
        }
      },
      stats: () => ({
        ...counts,
        active,
        queued: queue.length,
        pending: pending.size,
        cachedAuthors: cache.size,
      }),
    };
  }

  function createIndexedDbStore(indexedDB) {
    if (!indexedDB) return undefined;
    let connection;
    function open() {
      if (connection) return connection;
      connection = new Promise((resolve, reject) => {
        const request = indexedDB.open('yt-comment-filter-profiles-v2', 1);
        const timer = setTimeout(() => reject(new Error('Profile cache unavailable')), 2000);
        request.onupgradeneeded = () =>
          request.result.createObjectStore('decisions', { keyPath: 'id' });
        request.onsuccess = () => {
          clearTimeout(timer);
          const db = request.result;
          db.onversionchange = () => db.close();
          resolve(db);
        };
        request.onerror = () => {
          clearTimeout(timer);
          reject(request.error);
        };
        request.onblocked = () => {
          clearTimeout(timer);
          reject(new Error('Profile cache blocked'));
        };
      });
      return connection;
    }
    return {
      async load() {
        const db = await open();
        return new Promise((resolve, reject) => {
          const request = db.transaction('decisions', 'readonly').objectStore('decisions').getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      },
      async save(entry, limit) {
        const db = await open();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('decisions', 'readwrite'),
            store = tx.objectStore('decisions');
          store.put(entry);
          const all = store.getAll();
          all.onsuccess = () => {
            const entries = all.result.sort((a, b) => a.expiresAt - b.expiresAt);
            for (const item of entries.slice(0, Math.max(0, entries.length - limit)))
              store.delete(item.id);
          };
          tx.oncomplete = resolve;
          tx.onabort = tx.onerror = () => reject(tx.error);
        });
      },
      async clear() {
        const db = await open();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('decisions', 'readwrite');
          tx.objectStore('decisions').clear();
          tx.oncomplete = resolve;
          tx.onabort = tx.onerror = () => reject(tx.error);
        });
      },
    };
  }

  function createYoutubeLoader(scope, classify, options = {}) {
    const nativeFetch = scope.fetch.bind(scope);
    const counts = { requests: 0, channelSections: 0 };
    const networkQueue = [],
      aborts = new Set();
    let networkActive = 0,
      stopped = false;
    function pump() {
      while (!stopped && networkActive < (options.concurrency || 3) && networkQueue.length) {
        const job = networkQueue.shift();
        networkActive++;
        Promise.resolve()
          .then(() => {
            if (stopped) throw new Error('Profile requests disabled');
            return job.task();
          })
          .then(job.resolve, job.reject)
          .finally(() => {
            networkActive--;
            pump();
          });
      }
    }
    function limited(task) {
      if (stopped) return Promise.reject(new Error('Profile requests disabled'));
      const promise = new Promise((resolve, reject) =>
        networkQueue.push({ task, resolve, reject }),
      );
      pump();
      return promise;
    }
    async function request(payload) {
      return limited(async () => {
        const version =
          scope.ytcfg?.get?.('INNERTUBE_CONTEXT')?.client?.clientVersion ||
          scope.ytcfg?.get?.('INNERTUBE_CLIENT_VERSION');
        if (!version) throw new Error('YouTube client configuration unavailable');
        const abort = new AbortController();
        aborts.add(abort);
        const timer = setTimeout(() => abort.abort(), options.timeoutMs || 10000);
        try {
          counts.requests++;
          const response = await nativeFetch('/youtubei/v1/browse?prettyPrint=false', {
            method: 'POST',
            credentials: 'omit',
            signal: abort.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              context: {
                client: { clientName: 'WEB', clientVersion: version, hl: 'en', gl: 'US' },
              },
              ...payload,
            }),
          });
          if (!response.ok) throw new Error('Profile request failed');
          const data = await response.json();
          if (data.error) throw new Error('Profile response failed');
          return data;
        } finally {
          clearTimeout(timer);
          aborts.delete(abort);
        }
      });
    }
    async function lookup(id) {
      if (!channelId(id)) throw new Error('Invalid channel ID');
      const first = await request({ browseId: id });
      const profile = readProfile(first, id, classify);
      if (profile.reason === 'channelSection') counts.channelSections++;
      if (profile.complete) return profile;
      if (!profile.continuation) throw new Error('Full profile metadata unavailable');
      const result = readProfile(
        await request({ continuation: profile.continuation }),
        id,
        classify,
      );
      if (!result.complete) throw new Error('Unrecognized profile response');
      return result;
    }
    async function resolveHandle(path) {
      if (!/^\/@[^/?#]+\/?$/.test(path)) throw new Error('Unsupported author URL');
      const data = await requestResolve(path);
      const id = data.endpoint?.browseEndpoint?.browseId;
      if (!channelId(id)) throw new Error('Author ID could not be resolved');
      return id;
    }
    async function requestResolve(path) {
      return limited(async () => {
        const version =
          scope.ytcfg?.get?.('INNERTUBE_CLIENT_VERSION') ||
          scope.ytcfg?.get?.('INNERTUBE_CONTEXT')?.client?.clientVersion;
        if (!version) throw new Error('YouTube client configuration unavailable');
        const abort = new AbortController(),
          timer = setTimeout(() => abort.abort(), options.timeoutMs || 10000);
        aborts.add(abort);
        try {
          counts.requests++;
          const response = await nativeFetch(
            '/youtubei/v1/navigation/resolve_url?prettyPrint=false',
            {
              method: 'POST',
              credentials: 'omit',
              signal: abort.signal,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                context: { client: { clientName: 'WEB', clientVersion: version } },
                url: `https://www.youtube.com${path}`,
              }),
            },
          );
          if (!response.ok) throw new Error('Author resolution failed');
          return await response.json();
        } finally {
          clearTimeout(timer);
          aborts.delete(abort);
        }
      });
    }
    return {
      lookup,
      resolveHandle,
      stats: () => ({ ...counts, networkActive, networkQueued: networkQueue.length }),
      stop: () => {
        stopped = true;
        for (const abort of aborts) abort.abort();
        for (const job of networkQueue.splice(0))
          job.reject(new Error('Profile requests disabled'));
      },
    };
  }

  const exports = {
    createProfileService,
    createYoutubeLoader,
    createIndexedDbStore,
    readProfile,
    channelId,
    hasChannelSection,
    profileSignature,
  };
  if (typeof module === 'object' && module.exports) {
    module.exports = exports;
    return;
  }
  globalThis.__YTCommentFilterStarters.push(function () {
    if (!globalThis.__YTCommentFilter || globalThis.__YTCommentFilterProfiles) return;
    const config = globalThis.__YT_COMMENT_FILTER_RULES__;
    if (config.enabled === false) return;
    const loader = createYoutubeLoader(globalThis, globalThis.__YTCommentFilter.classifyProfile, {
      timeoutMs: config.profileTimeoutMs,
      concurrency: config.profileConcurrency,
    });
    const service = createProfileService({
      lookup: loader.lookup,
      storage: createIndexedDbStore(globalThis.indexedDB),
      signature: profileSignature(config.blockedDomains),
      ttlMs: config.profileCacheHours * 3600000,
      maxEntries: config.profileCacheMaxEntries,
      concurrency: config.profileConcurrency,
    });
    const aliases = new Map();
    Object.defineProperty(globalThis, '__YTCommentFilterProfiles', {
      configurable: true,
      value: {
        ...service,
        stop: () => {
          service.stop();
          loader.stop();
        },
        clear: async () => {
          aliases.clear();
          await service.clear();
        },
        resolveHandle: (path) => {
          if (aliases.get(path)?.expiresAt <= Date.now()) aliases.delete(path);
          if (!aliases.has(path)) {
            if (aliases.size >= 2000) aliases.delete(aliases.keys().next().value);
            const promise = loader.resolveHandle(path).catch((error) => {
              if (aliases.get(path)?.promise === promise) aliases.delete(path);
              throw error;
            });
            aliases.set(path, {
              promise,
              expiresAt: Date.now() + config.profileCacheHours * 3600000,
            });
          }
          return aliases.get(path).promise;
        },
        stats: () => ({ ...service.stats(), ...loader.stats() }),
      },
    });
  });
})();

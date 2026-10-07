// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Kalm contributors.
(function () {
  'use strict';
  const KEY = 'ycf.blockedDomains.v1';
  const ENABLED_KEY = 'ycf.enabled.v1';
  const KEYWORDS_KEY = 'kalm.keywords.v1';
  const LINKS_KEY = 'kalm.allLinks.v1';
  const CHANNELS_KEY = 'kalm.channelLinks.v1';
  const DEFAULT_DOMAINS = Object.freeze(['tinyurl.com', 'blogspot.com']);
  const MAX_DOMAINS = 256;

  // Accept a hostname or a pasted HTTP(S) URL; store only its hostname.
  function normalizeDomain(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 2048)
      throw new Error('Enter a domain, such as example.com.');
    const input = value.trim();
    if (/\s|\\/.test(input)) throw new Error('Enter one domain or URL without spaces.');
    let url;
    try {
      url = new URL(input.includes('://') ? input : `https://${input}`);
    } catch {
      throw new Error('Enter a valid domain or HTTP(S) URL.');
    }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port)
      throw new Error('Use an HTTP(S) domain without a username or port.');
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const labels = host.split('.');
    if (
      host.length > 253 ||
      labels.length < 2 ||
      /^\d+(?:\.\d+){3}$/.test(host) ||
      labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
      /^\d+$/.test(labels.at(-1))
    ) {
      throw new Error(
        'Enter a site domain, such as example.com; wildcards and IP addresses are not supported.',
      );
    }
    return host;
  }

  function normalizeList(values) {
    if (!Array.isArray(values) || values.length > MAX_DOMAINS)
      throw new Error(`Use no more than ${MAX_DOMAINS} sites.`);
    return [...new Set(values.map(normalizeDomain))].sort();
  }
  function normalizeKeyword(value) {
    if (typeof value !== 'string') throw new Error('Enter a keyword or phrase.');
    const term = value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
    if (!term || term.length > 120 || /[\u0000-\u001f\u007f]/u.test(term))
      throw new Error('Use a keyword or phrase of up to 120 characters.');
    return term;
  }
  function normalizeKeywords(values) {
    if (!Array.isArray(values) || values.length > MAX_DOMAINS)
      throw new Error(`Use no more than ${MAX_DOMAINS} keywords.`);
    return [...new Set(values.map(normalizeKeyword))].sort();
  }
  function boolean(data, key, fallback) {
    const value = data[key] === undefined ? fallback : data[key];
    if (typeof value !== 'boolean')
      throw new Error(`Invalid setting: ${key === ENABLED_KEY ? 'master switch' : key}.`);
    return value;
  }
  function createStore(area) {
    const store = {
      readConfig: async () => {
        if (!area) throw new Error('Settings storage is unavailable.');
        const data = await area.get([KEY, ENABLED_KEY, KEYWORDS_KEY, LINKS_KEY, CHANNELS_KEY]);
        return {
          domains: normalizeList(data[KEY] === undefined ? DEFAULT_DOMAINS : data[KEY]),
          enabled: boolean(data, ENABLED_KEY, true),
          keywords: normalizeKeywords(data[KEYWORDS_KEY] ?? []),
          blockAllLinks: boolean(data, LINKS_KEY, false),
          blockChannelLinks: boolean(data, CHANNELS_KEY, true),
        };
      },
      read: async () => (await store.readConfig()).domains,
      write: async (domains) => {
        const normalized = normalizeList(domains);
        if (!area) throw new Error('Settings storage is unavailable.');
        await area.set({ [KEY]: normalized });
        return normalized;
      },
      writeEnabled: async (enabled) => {
        if (typeof enabled !== 'boolean') throw new Error('Invalid master switch setting.');
        if (!area) throw new Error('Settings storage is unavailable.');
        await area.set({ [ENABLED_KEY]: enabled });
        return enabled;
      },
      writeKeywords: async (values) => {
        const keywords = normalizeKeywords(values);
        if (!area) throw new Error('Settings storage is unavailable.');
        await area.set({ [KEYWORDS_KEY]: keywords });
        return keywords;
      },
      writeToggle: async (key, value) => {
        if (![LINKS_KEY, CHANNELS_KEY].includes(key) || typeof value !== 'boolean')
          throw new Error('Invalid toggle.');
        if (!area) throw new Error('Settings storage is unavailable.');
        await area.set({ [key]: value });
        return value;
      },
    };
    return store;
  }
  function createPageStore(storage) {
    return createStore({
      get: (keys) =>
        Object.fromEntries(
          (Array.isArray(keys) ? keys : [keys]).map((key) => {
            const value = storage.getItem(key);
            return [key, value === null ? undefined : JSON.parse(value)];
          }),
        ),
      set: (data) => {
        for (const [key, value] of Object.entries(data))
          storage.setItem(key, JSON.stringify(value));
      },
    });
  }
  const api = {
    KEY,
    ENABLED_KEY,
    KEYWORDS_KEY,
    LINKS_KEY,
    CHANNELS_KEY,
    DEFAULT_DOMAINS,
    MAX_DOMAINS,
    normalizeDomain,
    normalizeList,
    normalizeKeyword,
    normalizeKeywords,
    createStore,
    createPageStore,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.__YTCommentFilterSettings = Object.freeze(api);
})();

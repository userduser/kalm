// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Kalm contributors.
// Local UI-only adapter. Never included in extension distributions.
// It models API responses for visual tests, not native browser ad blocking.
(function () {
  const params = new URLSearchParams(location.search),
    safari = params.get('browser') === 'safari';
  const events = [],
    website = { id: 7, url: 'https://www.youtube.com/watch?v=LOCAL_FIXTURE' };
  const data = {
    defaultFilteringMode: 2,
    level: 2,
    autoReload: true,
    showBlockedCount: true,
    canShowBlockedCount: !safari,
    disabledFeatures: [],
  };
  function record(type, detail) {
    events.push({ type, detail });
    const node = document.querySelector('#demo-diagnostics');
    if (node) node.textContent = JSON.stringify(events);
  }
  window.browser = {
    runtime: {
      getManifest: () => ({ version: '0.1.0 · UI preview' }),
      getURL: (value) => '/' + value,
      sendMessage: async (message) => {
        record('message', message);
        if (['popupPanelData', 'getOptionsPageData'].includes(message.what)) return { ...data };
        if (message.what === 'getFilteringMode') return data.level;
        if (message.what === 'setFilteringMode') {
          data.level = message.level;
          return data.level;
        }
        if (message.what === 'setDefaultFilteringMode') {
          data.defaultFilteringMode = message.level;
          return data.defaultFilteringMode;
        }
        if (message.what === 'setShowBlockedCount') data.showBlockedCount = message.state;
      },
    },
    storage: {
      local: {
        get: async (keys) =>
          Object.fromEntries(
            keys.map((key) => [key, JSON.parse(localStorage.getItem(key) || 'null') ?? undefined]),
          ),
        set: async (values) => {
          for (const [key, value] of Object.entries(values))
            localStorage.setItem(key, JSON.stringify(value));
          record('storage', values);
        },
      },
    },
    permissions: {
      request: async (fields) => {
        record('permission', fields);
        return params.get('deny') !== 'true';
      },
    },
    tabs: {
      query: async () => [website],
      get: async () => website,
      reload: async (id) => record('reload', id),
      update: async (id, fields) => record('update', { id, ...fields }),
      create: async (fields) => {
        record('create', fields);
      },
    },
    scripting: { executeScript: async (fields) => record('script', fields) },
  };
  document.addEventListener('DOMContentLoaded', () => {
    const note = document.createElement('p');
    note.textContent = 'Local UI preview · browser APIs simulated';
    note.style = 'color:#94a29a;font:11px system-ui;position:fixed;bottom:8px;right:12px;margin:0';
    const diagnostics = document.createElement('pre');
    diagnostics.id = 'demo-diagnostics';
    diagnostics.hidden = true;
    diagnostics.textContent = JSON.stringify(events);
    document.body.append(note, diagnostics);
  });
})();

// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Kalm contributors.
(function () {
  'use strict';
  // This file runs in the isolated extension world, which can read storage.
  // The page world receives only serialized comment settings, never extension APIs.
  function connect(doc, store, makeEvent = (name, detail) => new CustomEvent(name, { detail })) {
    const loaded = store.readConfig().then(
      (config) => JSON.stringify(config),
      () => JSON.stringify({ error: true }),
    );
    const send = () =>
      loaded.then((detail) => doc.dispatchEvent(makeEvent('ycf-settings-response-v1', detail)));
    doc.addEventListener('ycf-settings-request-v1', send);
    send(); // Also covers a request made before this isolated script loaded.
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = { connect };
    return;
  }
  connect(
    document,
    globalThis.__YTCommentFilterSettings.createStore(
      (globalThis.browser || globalThis.chrome)?.storage?.local,
    ),
  );
})();

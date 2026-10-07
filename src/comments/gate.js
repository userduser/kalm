// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Kalm contributors.
(function () {
  'use strict';
  const THREAD = 'ytd-comment-thread-renderer';
  const VIEW = 'ytd-comment-view-model,yt-comment-view-model,ytd-comment-renderer';
  const ROOT =
    'ytd-comments,ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]';
  const channelId = (id) => typeof id === 'string' && /^UC[\w-]{22}$/.test(id);
  const controller = (element) => element?.polymerController || element?.inst || element;
  function endpointId(endpoint) {
    return (
      endpoint?.browseEndpoint?.browseId || endpoint?.innertubeCommand?.browseEndpoint?.browseId
    );
  }
  function describe(row, api) {
    const body = row.querySelector('#content-text,.yt-comment-view-model__comment-text');
    if (!body) return null;
    const owner = controller(row),
      thread = row.closest(THREAD),
      parent = controller(thread);
    const model = owner.viewModel || owner.data?.commentViewModel || owner.data || {};
    const parentModel =
      parent?.commentViewModel?.commentViewModel ||
      parent?.commentViewModel ||
      parent?.data?.commentViewModel?.commentViewModel ||
      parent?.data?.commentViewModel;
    // A reply must never inherit its parent's author identity.
    const primary = thread?.querySelector(VIEW) === row;
    const entity = owner.commentEntity || (primary ? parent?.commentEntity : null);
    const mappedId = api.authorFor(model.commentKey) || api.authorFor(model.commentId);
    const entityId =
      entity?.author?.channelId ||
      endpointId(entity?.author?.channelPageEndpoint) ||
      endpointId(entity?.author?.channelCommand);
    let id =
      mappedId ||
      entityId ||
      model.author?.channelId ||
      endpointId(model.authorEndpoint) ||
      endpointId(owner.authorNameEndpoint);
    if (!channelId(id) && primary)
      id = api.authorFor(parentModel?.commentKey) || api.authorFor(parentModel?.commentId);
    if (!channelId(id)) id = null;
    const author = row.querySelector(
      '#author-text[href],a.yt-comment-view-model__author-text,#author-thumbnail[href],#author-thumbnail a[href]',
    );
    let path = null;
    if (author) {
      try {
        const url = new URL(author.getAttribute('href'), 'https://www.youtube.com');
        if (['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)) {
          const match = url.pathname.match(/^\/channel\/(UC[\w-]{22})(?:\/|$)/);
          if (match) id = match[1];
          else if (/^\/@[^/]+\/?$/.test(url.pathname)) path = url.pathname;
        }
      } catch {
        /* Unknown author URLs stay hidden. */
      }
    }
    const text = body.textContent || '';
    const links = [...body.querySelectorAll('a[href]')].map((link) => link.getAttribute('href'));
    const content =
      entity?.properties?.content ||
      model.contentText ||
      owner.contentText ||
      controller(body)?.data;
    // Native rows can briefly contain a new model/anchor and the old entity.
    // Do not reveal a new author's comment using the old author's approval.
    if (channelId(mappedId) && channelId(entityId) && mappedId !== entityId) {
      id = null;
      path = null;
    }
    if (path && id) {
      const command =
        entity?.author?.channelPageEndpoint ||
        entity?.author?.channelCommand ||
        owner.authorNameEndpoint;
      const endpoint = command?.innertubeCommand || command;
      const canonical =
        endpoint?.browseEndpoint?.canonicalBaseUrl ||
        endpoint?.commandMetadata?.webCommandMetadata?.url;
      if (canonical) {
        try {
          const expected = new URL(canonical, 'https://www.youtube.com').pathname;
          if (
            expected.startsWith('/@') &&
            decodeURIComponent(expected).replace(/\/$/, '').toLowerCase() !==
              decodeURIComponent(path).replace(/\/$/, '').toLowerCase()
          )
            id = null;
        } catch {
          id = null;
        }
      }
    }
    // Include the comment key and underlying link commands when YouTube recycles a row.
    return {
      id,
      path,
      fingerprint: JSON.stringify([
        model.commentKey,
        model.commentId,
        mappedId,
        entityId,
        id,
        path,
        text,
        links,
        content,
      ]),
      contents: [
        content,
        { content: text, commandRuns: links.map((url) => ({ onTap: { urlEndpoint: { url } } })) },
      ].filter(Boolean),
    };
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = { describe };
    return;
  }
  globalThis.__YTCommentFilterStarters.push(function () {
    const api = globalThis.__YTCommentFilter,
      profiles = globalThis.__YTCommentFilterProfiles;
    if (!api || (api.enabled && !profiles) || globalThis.__YTCommentFilterGate) return;
    const screening = api.enabled;
    if (!screening && !globalThis.__YTCommentFilterOpenSettings) return;
    const states = new WeakMap(),
      rows = new Set(),
      roots = new Map();
    const counts = { approved: 0, removed: 0, errors: 0 };
    let running = true;

    function wrapper(row) {
      const thread = row.closest(THREAD);
      return thread?.querySelector(VIEW) === row ? thread : row;
    }
    function mark(row, state) {
      for (const target of new Set([row, wrapper(row)])) {
        target.toggleAttribute('data-ycf-approved', state === 'approved');
        target.toggleAttribute('data-ycf-blocked', state === 'blocked');
        target.setAttribute('data-ycf-check', state);
      }
    }
    function reject(row) {
      // Keep native-owned renderers connected so YouTube can finish the batch,
      // update replies, and recycle its list. CSS removes them entirely from view.
      mark(row, 'blocked');
      counts.removed++;
    }
    function updateStatus() {
      for (const [root, info] of roots) {
        if (!root.isConnected) {
          info.observer.disconnect();
          roots.delete(root);
          continue;
        }
        const unknown = screening
          ? [...root.querySelectorAll(VIEW)].filter(
              (row) =>
                !row.hasAttribute('data-ycf-approved') &&
                !row.hasAttribute('data-ycf-blocked') &&
                !row.closest('[hidden],[data-ycf-blocked]'),
            )
          : [];
        const failed = unknown.some((row) => row.getAttribute('data-ycf-check') === 'error');
        info.status.hidden = unknown.length === 0 && !info.settings;
        info.label.hidden = unknown.length === 0;
        const message = failed
          ? 'Some comments are waiting for a profile check.'
          : 'Checking comment profiles…';
        if (info.label.textContent !== message) info.label.textContent = message;
        info.retry.hidden = !failed;
      }
    }
    async function process(row, force = false) {
      if (!screening || !running || !row.isConnected) return;
      if (rows.size >= 4000 && !rows.has(row)) rows.delete(rows.values().next().value);
      rows.add(row);
      const description = describe(row, api),
        previous = states.get(row);
      if (
        !force &&
        previous &&
        previous.fingerprint === description?.fingerprint &&
        (!row.hasAttribute('data-ycf-approved') || profiles.peek(previous.id))
      ) {
        // A native list can move an already checked view into a new thread.
        mark(row, row.getAttribute('data-ycf-check') || 'unresolved');
        return;
      }
      mark(row, 'pending');
      const state = { fingerprint: description?.fingerprint };
      states.set(row, state);
      if (!description || (!description.id && !description.path)) {
        mark(row, 'unresolved');
        return;
      }
      if (description.contents.some((content) => api.classifyBody(content))) {
        reject(row);
        updateStatus();
        return;
      }
      try {
        const id = description.id || (await profiles.resolveHandle(description.path));
        const decision = await profiles.check(id);
        if (!running || !row.isConnected || states.get(row) !== state) return;
        if (describe(row, api)?.fingerprint !== state.fingerprint) {
          process(row, true);
          return;
        }
        state.id = id;
        if (decision.blocked) reject(row);
        else {
          mark(row, 'approved');
          counts.approved++;
        }
      } catch {
        if (running && row.isConnected && states.get(row) === state) {
          mark(row, 'error');
          counts.errors++;
        }
      }
      updateStatus();
    }
    function scan(node, force = false) {
      if (!screening || !(node instanceof Element)) return;
      const candidates = new Set();
      if (node.matches(VIEW)) candidates.add(node);
      for (const row of node.querySelectorAll(VIEW)) candidates.add(row);
      const parent = node.closest(VIEW);
      if (parent) candidates.add(parent);
      for (const row of candidates) process(row, force);
    }
    function attach(root) {
      if (roots.has(root) || [...roots.keys()].some((existing) => existing.contains(root))) return;
      for (const [child, info] of roots)
        if (root.contains(child)) {
          info.observer.disconnect();
          info.status.remove();
          roots.delete(child);
        }
      const status = document.createElement('div');
      status.className = 'ycf-status';
      status.setAttribute('role', 'status');
      status.style.cssText =
        'font:14px system-ui;padding:12px;color:var(--yt-spec-text-secondary,#888)';
      const label = document.createElement('span');
      label.textContent = 'Checking comment profiles…';
      const retry = document.createElement('button');
      retry.textContent = 'Retry';
      retry.hidden = true;
      retry.style.cssText = 'margin-left:12px;cursor:pointer';
      retry.onclick = () => api.retry();
      const settings = globalThis.__YTCommentFilterOpenSettings
        ? document.createElement('button')
        : null;
      if (settings) {
        settings.textContent = 'Blocked sites';
        settings.style.cssText = 'margin-left:12px;cursor:pointer';
        settings.onclick = () => globalThis.__YTCommentFilterOpenSettings();
      }
      status.append(label, retry);
      if (settings) status.append(settings);
      root.prepend(status);
      const observer = new MutationObserver((records) => {
        const changed = new Set();
        let relevant = false;
        for (const record of records) {
          const element =
            record.target instanceof Element ? record.target : record.target.parentElement;
          if (element?.closest('.ycf-status')) continue;
          relevant = true;
          if (record.type === 'childList')
            for (const node of record.addedNodes) if (node instanceof Element) changed.add(node);
          // Native stamping often updates a sibling of the comment view.
          const row = element?.closest(VIEW) || element?.closest(THREAD);
          if (row) changed.add(row);
        }
        for (const node of changed) scan(node);
        // A batch can contain only removals, including an old pending placeholder.
        if (relevant) updateStatus();
      });
      if (screening)
        observer.observe(root, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['href', 'hidden'],
        });
      roots.set(root, { observer, status, label, retry, settings });
      scan(root);
      updateStatus();
    }
    function discover(node) {
      if (!(node instanceof Element)) return;
      if (node.matches(ROOT)) attach(node);
      for (const root of node.querySelectorAll(ROOT)) attach(root);
    }
    const discovery = new MutationObserver((records) => {
      for (const record of records) {
        if ([...roots.keys()].some((root) => root.contains(record.target))) continue;
        for (const node of record.addedNodes) discover(node);
      }
    });
    discovery.observe(document, { childList: true, subtree: true });
    if (document.documentElement) discover(document.documentElement);
    function navigate() {
      for (const row of rows) if (!row.isConnected) rows.delete(row);
      for (const [root, info] of roots)
        if (!root.isConnected) {
          info.observer.disconnect();
          roots.delete(root);
        }
      discover(document.documentElement);
      for (const root of roots.keys()) scan(root);
      updateStatus();
    }
    // These native events also catch entity/property updates without a DOM mutation.
    const events = [
      'yt-navigate-finish',
      'yt-page-data-updated',
      'yt-next-continuation-data-updated',
      'yt-append-continuation-items-action-finished',
    ];
    for (const name of events) document.addEventListener(name, navigate, true);
    Object.defineProperty(globalThis, '__YTCommentFilterGate', {
      configurable: true,
      value: {
        rescan: () => {
          for (const root of roots.keys()) scan(root, true);
          updateStatus();
        },
        stats: () => {
          let waiting = 0,
            unresolved = 0;
          for (const row of rows) {
            if (!row.isConnected) {
              rows.delete(row);
              continue;
            }
            if (row.closest('[hidden],[data-ycf-blocked]')) continue;
            if (!row.hasAttribute('data-ycf-approved')) waiting++;
            if (row.getAttribute('data-ycf-check') === 'unresolved') unresolved++;
          }
          return {
            ...counts,
            waiting,
            unresolved,
            roots: roots.size,
            active: running && screening,
          };
        },
        stop: () => {
          running = false;
          discovery.disconnect();
          for (const name of events) document.removeEventListener(name, navigate, true);
          for (const info of roots.values()) {
            info.observer.disconnect();
            info.status.remove();
          }
          roots.clear();
          rows.clear();
          document.documentElement?.setAttribute('data-ycf-off', '');
        },
      },
    });
  });
})();

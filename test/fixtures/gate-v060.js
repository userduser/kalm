globalThis.__YTCommentFilterStarters.push(function () {
  "use strict";
  const ROW = "ytd-comment-thread-renderer,ytd-comment-view-model,yt-comment-view-model,ytd-comment-renderer";
  const VIEW = "ytd-comment-view-model,yt-comment-view-model,ytd-comment-renderer";
  const ROOT = 'ytd-comments,ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]';
  const api = globalThis.__YTCommentFilter, profiles = globalThis.__YTCommentFilterProfiles;
  if (!api || (api.enabled && !profiles) || globalThis.__YTCommentFilterGate) return;
  const screening = api.enabled;
  // Keep the Safari editor reachable while filtering is disabled.
  if (!screening && !globalThis.__YTCommentFilterOpenSettings) return;
  const states = new WeakMap(), rows = new Set(), roots = new Map();
  const counts = { approved: 0, removed: 0, errors: 0 };
  let running = true;

  function describe(row) {
    const primary = row.matches("ytd-comment-thread-renderer") ? row.querySelector(VIEW) : row;
    if (!primary) return null;
    const body = primary.querySelector("#content-text,.yt-comment-view-model__comment-text");
    if (!body) return null;
    const author = primary.querySelector('#author-text[href],a.yt-comment-view-model__author-text,#author-thumbnail[href],#author-thumbnail a[href]');
    const model = primary.data?.commentViewModel || primary.data || {};
    let id = api.authorFor(model.commentKey) || api.authorFor(model.commentId) || model.author?.channelId ||
      model.authorEndpoint?.browseEndpoint?.browseId;
    let path = null;
    if (author) {
      try {
        const url = new URL(author.getAttribute("href"), "https://www.youtube.com");
        if (url.hostname === "www.youtube.com" || url.hostname === "youtube.com" || url.hostname === "m.youtube.com") {
          const match = url.pathname.match(/^\/channel\/(UC[\w-]{22})(?:\/|$)/);
          if (match) id = match[1];
          else if (/^\/@[^/]+\/?$/.test(url.pathname)) path = url.pathname;
        }
      } catch { /* Unknown author URLs stay hidden. */ }
    }
    const text = body.textContent || "";
    const links = [...body.querySelectorAll("a[href]")].map(link => link.getAttribute("href"));
    return { id, path, fingerprint: JSON.stringify([id, path, text, links]),
      content: { content: text, commandRuns: links.map(url => ({ onTap: { urlEndpoint: { url } } })) } };
  }

  function remove(row) {
    const thread = row.closest("ytd-comment-thread-renderer");
    const target = thread?.querySelector(VIEW) === row ? thread : row;
    target.remove(); rows.delete(target); rows.delete(row); counts.removed++;
  }
  function updateStatus() {
    for (const [root, info] of roots) {
      if (!root.isConnected) { info.observer.disconnect(); roots.delete(root); continue; }
      const unknown = screening ? [...root.querySelectorAll(ROW)].filter(row => !row.hasAttribute("data-ycf-approved")) : [];
      const failed = unknown.some(row => row.getAttribute("data-ycf-check") === "error");
      info.status.hidden = unknown.length === 0 && !info.settings;
      info.label.hidden = unknown.length === 0;
      const message = failed ? "Some comments are waiting for a profile check." : "Checking comment profiles…";
      if (info.label.textContent !== message) info.label.textContent = message;
      info.retry.hidden = !failed;
    }
  }
  async function process(row, force = false) {
    if (!screening || !running || !row.isConnected) return;
    if (rows.size >= 4000 && !rows.has(row)) rows.delete(rows.values().next().value);
    rows.add(row);
    const description = describe(row);
    const previous = states.get(row);
    if (!force && previous && previous.fingerprint === description?.fingerprint &&
      (!row.hasAttribute("data-ycf-approved") || profiles.peek(previous.id))) return;
    row.removeAttribute("data-ycf-approved");
    row.setAttribute("data-ycf-check", "pending");
    const state = { fingerprint: description?.fingerprint };
    states.set(row, state);
    if (!description || (!description.id && !description.path)) { row.setAttribute("data-ycf-check", "unresolved"); return; }
    if (api.classifyBody(description.content)) { remove(row); updateStatus(); return; }
    try {
      const id = description.id || await profiles.resolveHandle(description.path);
      const decision = await profiles.check(id);
      if (!running || !row.isConnected || states.get(row) !== state) return;
      if (describe(row)?.fingerprint !== state.fingerprint) { process(row, true); return; }
      if (decision.blocked) remove(row);
      else { state.id = id; row.setAttribute("data-ycf-approved", ""); row.setAttribute("data-ycf-check", "approved"); counts.approved++; }
    } catch {
      if (running && row.isConnected && states.get(row) === state) { row.setAttribute("data-ycf-check", "error"); counts.errors++; }
    }
    updateStatus();
  }

  function scan(node, force = false) {
    if (!screening || !(node instanceof Element)) return;
    const candidates = new Set();
    if (node.matches(ROW)) candidates.add(node);
    for (const row of node.querySelectorAll(ROW)) candidates.add(row);
    let parent = node.closest(ROW);
    while (parent) { candidates.add(parent); parent = parent.parentElement?.closest(ROW); }
    for (const row of candidates) process(row, force);
  }
  function attach(root) {
    if (roots.has(root) || [...roots.keys()].some(existing => existing.contains(root))) return;
    for (const [child, info] of roots) if (root.contains(child)) { info.observer.disconnect(); info.status.remove(); roots.delete(child); }
    const status = document.createElement("div"); status.className = "ycf-status"; status.setAttribute("role", "status");
    status.style.cssText = "font:14px system-ui;padding:12px;color:var(--yt-spec-text-secondary,#888)";
    const label = document.createElement("span"); label.textContent = "Checking comment profiles…";
    const retry = document.createElement("button"); retry.textContent = "Retry"; retry.hidden = true;
    retry.style.cssText = "margin-left:12px;cursor:pointer"; retry.onclick = () => api.retry();
    const settings = globalThis.__YTCommentFilterOpenSettings ? document.createElement("button") : null;
    if (settings) {
      settings.textContent = "Blocked sites"; settings.style.cssText = "margin-left:12px;cursor:pointer";
      settings.onclick = () => globalThis.__YTCommentFilterOpenSettings();
    }
    status.append(label, retry); if (settings) status.append(settings); root.prepend(status);
    const observer = new MutationObserver(records => {
      const changed = new Set();
      for (const record of records) {
        const element = record.target instanceof Element ? record.target : record.target.parentElement;
        if (element?.closest(".ycf-status")) continue;
        if (record.type === "childList") for (const node of record.addedNodes) if (node instanceof Element) changed.add(node);
        if (element) {
          let row = element.closest(ROW);
          while (row) { changed.add(row); row = row.parentElement?.closest(ROW); }
        }
      }
      for (const node of changed) scan(node);
      if (changed.size) updateStatus();
    });
    if (screening) observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href"] });
    roots.set(root, { observer, status, label, retry, settings }); scan(root); updateStatus();
  }
  function discover(node) {
    if (!(node instanceof Element)) return;
    if (node.matches(ROOT)) attach(node);
    for (const root of node.querySelectorAll(ROOT)) attach(root);
  }
  const discovery = new MutationObserver(records => {
    for (const record of records) {
      if ([...roots.keys()].some(root => root.contains(record.target))) continue;
      for (const node of record.addedNodes) discover(node);
    }
  });
  discovery.observe(document, { childList: true, subtree: true });
  if (document.documentElement) discover(document.documentElement);
  function navigate() {
    for (const row of rows) if (!row.isConnected) rows.delete(row);
    for (const [root, info] of roots) if (!root.isConnected) { info.observer.disconnect(); roots.delete(root); }
    discover(document.documentElement);
  }
  document.addEventListener("yt-navigate-finish", navigate);
  Object.defineProperty(globalThis, "__YTCommentFilterGate", { configurable: true, value: {
    rescan: () => { for (const root of roots.keys()) scan(root, true); updateStatus(); },
    stats: () => {
      let waiting = 0, unresolved = 0;
      for (const row of rows) {
        if (!row.isConnected) { rows.delete(row); continue; }
        if (!row.hasAttribute("data-ycf-approved")) waiting++;
        if (row.getAttribute("data-ycf-check") === "unresolved") unresolved++;
      }
      return { ...counts, waiting, unresolved, roots: roots.size, active: running && screening };
    },
    stop: () => {
      running = false; discovery.disconnect(); document.removeEventListener("yt-navigate-finish", navigate);
      for (const info of roots.values()) { info.observer.disconnect(); info.status.remove(); }
      roots.clear(); rows.clear(); document.documentElement?.setAttribute("data-ycf-off", "");
    },
  } });
});

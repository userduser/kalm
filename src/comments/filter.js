(function () {
  "use strict";

  const VERSION = "0.7.0";
  const DEFAULTS = { blockedDomains: ["tinyurl.com", "blogspot.com"], blockChannelLinks: true, urlCacheSize: 256 };
  const isObject = value => value !== null && typeof value === "object";

  function createFilter(options = {}) {
    const config = { ...DEFAULTS, ...options };
    const authorDecision = options.getAuthorDecision || (() => undefined);
    const authors = new Map();
    function rememberAuthor(key, id) {
      if (!key || !id) return;
      if (authors.size >= 4000 && !authors.has(key)) authors.delete(authors.keys().next().value);
      authors.set(key, id);
    }
    const domains = new Set(config.blockedDomains.map(domain => {
      try { return new URL(`https://${domain.trim()}`).hostname.toLowerCase().replace(/\.$/, ""); }
      catch { throw new TypeError(`Invalid blocked domain: ${domain}`); }
    }));
    const escapedDomains = [...domains].map(domain => domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const plainDomain = domains.size ? new RegExp(
      `(?:^|[^\\p{L}\\p{N}_@.-])(?:[\\p{L}\\p{N}-]+\\.)*(?:${escapedDomains.join("|")})(?=$|[^\\p{L}\\p{N}_.-])`, "iu"
    ) : null;
    const urls = new Map();
    const seenPayloads = new WeakSet();
    const counters = { batches: 0, screened: 0, removed: 0, channelLinks: 0, blockedDomains: 0, blockedAuthors: 0, unresolvedViews: 0, errors: 0, totalMs: 0 };

    function classifyUrl(raw) {
      if (typeof raw !== "string" || !raw) return null;
      if (urls.has(raw)) return urls.get(raw);
      let reason = null;
      try {
        let url = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw, "https://www.youtube.com");
        for (let depth = 0; depth < 3; depth++) {
          const host = url.hostname.toLowerCase().replace(/\.$/, "");
          const youtube = host === "youtube.com" || host.endsWith(".youtube.com");
          if (youtube && url.pathname === "/redirect") {
            const destination = url.searchParams.get("q") || url.searchParams.get("url");
            if (destination) { url = new URL(destination, url); continue; }
          }
          if (config.blockChannelLinks && youtube && /^\/(?:@[^/]+|(?:channel|user|c)\/[^/]+)(?:\/|$)/i.test(url.pathname)) {
            reason = "channelLinks";
          }
          let suffix = host;
          while (suffix) {
            if (domains.has(suffix)) { reason = "blockedDomains"; break; }
            const dot = suffix.indexOf(".");
            if (dot < 0) break;
            suffix = suffix.slice(dot + 1);
          }
          break;
        }
      } catch { /* Malformed links are not grounds to remove a comment. */ }
      if (raw.length <= 2048 && config.urlCacheSize > 0) {
        if (urls.size >= config.urlCacheSize) urls.delete(urls.keys().next().value);
        urls.set(raw, reason);
      }
      return reason;
    }

    function classifyCommand(command, depth = 0) {
      if (!isObject(command) || depth > 5) return null;
      if (config.blockChannelLinks && /^UC[\w-]+$/.test(command.browseEndpoint?.browseId || "")) return "channelLinks";
      const rawUrls = [command.urlEndpoint?.url, command.urlCommand?.url,
        command.commandMetadata?.webCommandMetadata?.url, command.browseEndpoint?.canonicalBaseUrl];
      for (const url of rawUrls) {
        const reason = classifyUrl(url);
        if (reason) return reason;
      }
      for (const key of ["innertubeCommand", "navigationEndpoint", "onTap", "command"]) {
        const reason = classifyCommand(command[key], depth + 1);
        if (reason) return reason;
      }
      for (const child of command.commandExecutorCommand?.commands || []) {
        const reason = classifyCommand(child, depth + 1);
        if (reason) return reason;
      }
      return null;
    }

    function screenBody(content, count = true) {
      if (!content) return null;
      if (count) counters.screened++;
      for (const run of content.commandRuns || []) {
        const reason = classifyCommand(run.onTap);
        if (reason) return reason;
      }
      for (const run of content.runs || []) {
        const reason = classifyCommand(run.navigationEndpoint);
        if (reason) return reason;
      }
      const text = typeof content === "string" ? content :
        content.content ?? content.simpleText ?? (content.runs || []).map(run => run.text || "").join("");
      if (typeof text !== "string") return null;
      // Actual links and navigation commands identify mentions. An email or bare @word does not.
      // Inspect complete URLs first, so a domain appearing only in an allowed URL's
      // path/query cannot accidentally match the bare-domain rule.
      let cursor = 0;
      for (const match of text.matchAll(/(?:https?:\/\/|www\.)[^\s<>"()]+/gi)) {
        if (plainDomain?.test(text.slice(cursor, match.index))) return "blockedDomains";
        const reason = classifyUrl(match[0].replace(/[.,!;:]+$/, ""));
        if (reason) return reason;
        cursor = match.index + match[0].length;
      }
      if (plainDomain?.test(text.slice(cursor))) return "blockedDomains";
      return null;
    }

    function filterPayload(root) {
      if (!isObject(root)) return root;
      if (Array.isArray(root)) { for (const item of root) filterPayload(item); return root; }
      if (seenPayloads.has(root)) return root;
      const mutations = root.frameworkUpdates?.entityBatchUpdate?.mutations;
      const actions = root.onResponseReceivedEndpoints || root.onResponseReceivedActions || root.onResponseReceivedCommands;
      const continuation = root.continuationContents;
      const watch = root.contents?.twoColumnWatchNextResults || root.contents?.singleColumnWatchNextResults;
      if (!mutations && !actions && !continuation && !watch) return root;

      const start = performance.now();
      const bodyReasons = new Map();
      const bodyIds = new Map();
      const availableKeys = new Set();
      const removedKeys = new Set();
      const removedIds = new Set();
      let foundComments = false;

      if (Array.isArray(mutations)) {
        for (const mutation of mutations) {
          const entity = mutation.payload?.commentEntityPayload;
          if (!entity) continue;
          foundComments = true;
          availableKeys.add(entity.key);
          const bodyReason = screenBody(entity.properties?.content);
          const authorId = entity.author?.channelId || entity.author?.channelCommand?.innertubeCommand?.browseEndpoint?.browseId;
          rememberAuthor(entity.key, authorId);
          rememberAuthor(entity.properties?.commentId, authorId);
          const reason = authorDecision(authorId)?.blocked ? "blockedAuthors" : bodyReason;
          if (reason) {
            if (entity.key) bodyReasons.set(entity.key, reason);
            if (entity.properties?.commentId) bodyIds.set(entity.properties.commentId, reason);
          }
        }
      }

      function reject(wrapper) {
        const view = wrapper?.commentViewModel || wrapper;
        if (!view) return false;
        foundComments = true;
        const legacy = view.commentRenderer || (view.contentText ? view : null);
        let reason;
        if (legacy) {
          const bodyReason = screenBody(legacy.contentText);
          const authorId = legacy.authorEndpoint?.browseEndpoint?.browseId || legacy.authorEndpoint?.innertubeCommand?.browseEndpoint?.browseId;
          rememberAuthor(legacy.commentId, authorId);
          reason = authorDecision(authorId)?.blocked ? "blockedAuthors" : bodyReason;
        } else {
          reason = bodyReasons.get(view.commentKey) || bodyIds.get(view.commentId);
        }
        if (!legacy && view.commentKey && !availableKeys.has(view.commentKey)) counters.unresolvedViews++;
        if (!reason) return false;
        if (view.commentKey) removedKeys.add(view.commentKey);
        if (view.commentId || legacy?.commentId) removedIds.add(view.commentId || legacy.commentId);
        counters.removed++;
        counters[reason]++;
        return true;
      }

      function editList(list) {
        if (!Array.isArray(list)) return;
        let write = 0;
        for (const item of list) {
          if (!isObject(item)) { list[write++] = item; continue; }
          const thread = item.commentThreadRenderer;
          if (thread) {
            if (reject(thread.commentViewModel || thread.comment)) continue;
            editList(thread.replies?.commentRepliesRenderer?.contents);
          } else if (item.commentViewModel) {
            if (reject(item.commentViewModel)) continue;
          } else if (item.commentRenderer) {
            if (reject(item)) continue;
          } else if (item.itemSectionRenderer) {
            const section = item.itemSectionRenderer;
            if (section.targetId === "comments-section" || section.sectionIdentifier === "comment-item-section") editList(section.contents);
          }
          list[write++] = item;
        }
        list.length = write;
      }

      if (Array.isArray(actions)) {
        for (const action of actions) {
          editList(action.appendContinuationItemsAction?.continuationItems);
          editList(action.reloadContinuationItemsCommand?.continuationItems);
          editList(action.appendContinuationItemsCommand?.continuationItems);
        }
      }
      editList(continuation?.itemSectionContinuation?.contents);
      editList(continuation?.commentRepliesContinuation?.contents);
      editList(watch?.results?.results?.contents);
      editList(watch?.results?.contents);

      // Delete body entities only after deleting their render-list references.
      // Keep pagination, headers, counts, toolbar state, and unrelated entities intact.
      if (removedKeys.size || removedIds.size) {
        let write = 0;
        for (const mutation of mutations || []) {
          const entity = mutation.payload?.commentEntityPayload;
          if (entity && (removedKeys.has(entity.key) || removedIds.has(entity.properties?.commentId))) continue;
          mutations[write++] = mutation;
        }
        if (mutations) mutations.length = write;
      }
      if (foundComments) counters.batches++;
      seenPayloads.add(root);
      counters.totalMs += performance.now() - start;
      return root;
    }

    return { filterPayload, classifyUrl, classifyContent: content => screenBody(content, false), authorFor: key => authors.get(key),
      getStats: () => ({ ...counters, cachedUrls: urls.size }),
      recordError: () => { counters.errors++; } };
  }

  function installHooks(scope, filter) {
    const hooks = [];
    const restores = [];
    function screen(value) {
      try { return filter.filterPayload(value); }
      catch { filter.recordError(); return value; }
    }
    function patch(owner, key, makeProxy) {
      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
      if (!descriptor || typeof descriptor.value !== "function") return;
      const original = descriptor.value;
      const proxy = makeProxy(original);
      Object.defineProperty(owner, key, { ...descriptor, value: proxy });
      restores.push(() => { if (owner[key] === proxy) Object.defineProperty(owner, key, descriptor); });
      hooks.push(key);
    }

    patch(scope.JSON, "parse", original => new Proxy(original, {
      apply(target, receiver, args) { return screen(Reflect.apply(target, receiver, args)); }
    }));
    if (scope.Response) {
      patch(scope.Response.prototype, "json", original => new Proxy(original, {
        apply(target, receiver, args) {
          const result = Reflect.apply(target, receiver, args);
          // The browser still performs its original, single body read and JSON parse.
          return result.then(screen);
        }
      }));
    }
    if (scope.XMLHttpRequest) {
      const owner = scope.XMLHttpRequest.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(owner, "response");
      if (descriptor?.get && descriptor.configurable) {
        const getter = new Proxy(descriptor.get, {
          apply(target, receiver, args) {
            const value = Reflect.apply(target, receiver, args);
            return receiver.responseType === "json" ? screen(value) : value;
          }
        });
        Object.defineProperty(owner, "response", { ...descriptor, get: getter });
        restores.push(() => {
          if (Object.getOwnPropertyDescriptor(owner, "response")?.get === getter) Object.defineProperty(owner, "response", descriptor);
        });
        hooks.push("xhr-json-response");
      }
    }
    return { hooks, restore: () => { for (const restore of restores.reverse()) restore(); } };
  }

  if (typeof module === "object" && module.exports) {
    module.exports = { createFilter, installHooks, VERSION };
    return;
  }
  globalThis.__YTCommentFilterStarters.push(function () {
  if (globalThis.__YTCommentFilter) return;
  const config = globalThis.__YT_COMMENT_FILTER_RULES__;
  const filter = createFilter({ ...config, getAuthorDecision: id => globalThis.__YTCommentFilterProfiles?.peek(id) });
  const profileMatcher = createFilter({ ...config, blockChannelLinks: false });
  const installation = config.enabled === false ? { hooks: [], restore: () => {} } : installHooks(globalThis, filter);
  Object.defineProperty(globalThis, "__YTCommentFilter", { configurable: true, value: Object.freeze({
    version: VERSION,
    enabled: config.enabled !== false,
    blockedDomains: config.blockedDomains,
    hooks: installation.hooks,
    stats: () => ({ enabled: config.enabled !== false, ...filter.getStats(), profiles: globalThis.__YTCommentFilterProfiles?.stats(), ui: globalThis.__YTCommentFilterGate?.stats() || { active: false } }),
    authorFor: filter.authorFor,
    classifyBody: filter.classifyContent,
    classifyProfile: profileMatcher.classifyContent,
    retry: () => { globalThis.__YTCommentFilterProfiles?.retry(); globalThis.__YTCommentFilterGate?.rescan(); },
    clearCache: () => globalThis.__YTCommentFilterProfiles?.clear(),
    disable: () => { installation.restore(); globalThis.__YTCommentFilterGate?.stop(); globalThis.__YTCommentFilterProfiles?.stop(); },
  }) });
  });
})();

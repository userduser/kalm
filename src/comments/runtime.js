(function () {
  "use strict";
  // No comment can be approved until the saved rules have been validated.
  globalThis.__YTCommentFilterStart = (domains, enabled = true, options = {}) => {
    if (globalThis.__YTCommentFilter) return;
    if (typeof enabled !== "boolean") throw new Error("Invalid master switch setting.");
    const blockedDomains = Object.freeze(globalThis.__YTCommentFilterSettings.normalizeList(domains));
    const blockedKeywords = Object.freeze(globalThis.__YTCommentFilterSettings.normalizeKeywords(options.keywords ?? []));
    const blockAllLinks = options.blockAllLinks ?? false, blockChannelLinks = options.blockChannelLinks ?? true;
    if (typeof blockAllLinks !== "boolean" || typeof blockChannelLinks !== "boolean") throw new Error("Invalid link settings.");
    globalThis.__YT_COMMENT_FILTER_RULES__ = Object.freeze({ ...globalThis.__YT_COMMENT_FILTER_RULES__, blockedDomains, blockedKeywords, blockAllLinks, blockChannelLinks, enabled });
    if (!enabled) {
      // The stylesheet can load before <html> exists. Release it only after
      // the saved setting explicitly disables filtering.
      const release = () => {
        if (!document.documentElement) return false;
        document.documentElement.setAttribute("data-ycf-off", ""); return true;
      };
      if (!release()) {
        const observer = new MutationObserver(() => { if (release()) observer.disconnect(); });
        observer.observe(document, { childList: true });
      }
    }
    for (const start of globalThis.__YTCommentFilterStarters.splice(0)) start();
  };
})();

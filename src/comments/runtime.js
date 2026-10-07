(function () {
  "use strict";
  // No comment can be approved until the saved rules have been validated.
  globalThis.__YTCommentFilterStart = (domains, enabled = true) => {
    if (globalThis.__YTCommentFilter) return;
    if (typeof enabled !== "boolean") throw new Error("Invalid master switch setting.");
    const blockedDomains = Object.freeze(globalThis.__YTCommentFilterSettings.normalizeList(domains));
    globalThis.__YT_COMMENT_FILTER_RULES__ = Object.freeze({ ...globalThis.__YT_COMMENT_FILTER_RULES__, blockedDomains, enabled });
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

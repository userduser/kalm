(function () {
  "use strict";
  const EVENT = "ycf-settings-response-v1";
  function receive(event) {
    if (typeof event.detail !== "string" || event.detail.length > 120000) return;
    try {
      const data = JSON.parse(event.detail);
      if (data.error) {
        console.warn("Kalm: blocklist could not be loaded. Comments remain hidden; reload this tab to retry.");
        return;
      }
      globalThis.__YTCommentFilterStart(data.domains, data.enabled === undefined ? true : data.enabled, data);
      document.removeEventListener(EVENT, receive);
    } catch (error) {
      // Invalid settings and startup errors never release unchecked comments.
      console.warn("Kalm: startup failed. Comments remain hidden; reload the extension and this tab.", error);
    }
  }
  document.addEventListener(EVENT, receive);
  document.dispatchEvent(new CustomEvent("ycf-settings-request-v1"));
})();

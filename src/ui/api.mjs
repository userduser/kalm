// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Kalm contributors.
// Kalm overlay. Copyright (C) 2026 Kalm contributors. GPL-3.0-or-later.
export const webext = globalThis.browser || globalThis.chrome;
export function createClient(browser) {
  const message = async (what, fields = {}) => {
    if (!browser?.runtime) throw new Error('Extension connection unavailable.');
    return browser.runtime.sendMessage({ what, ...fields });
  };
  const isPage = (url) => {
    try {
      return /^https?:$/.test(new URL(url).protocol);
    } catch {
      return false;
    }
  };
  return {
    message,
    isPage,
    activeTab: async () => (await browser.tabs.query({ active: true, currentWindow: true }))[0],
    async targetTab(id) {
      if (!Number.isInteger(id) || id < 0)
        throw new Error('Open setup from the toolbar on a website.');
      const tab = await browser.tabs.get(id);
      if (!isPage(tab?.url)) throw new Error('Choose a website tab first.');
      return tab;
    },
    async setMode(tab, before, after, autoReload) {
      if (!isPage(tab?.url)) throw new Error('Open a website first.');
      const url = new URL(tab.url);
      // Call request immediately during the user gesture; do not await another
      // message first. Firefox and Safari require this ordering.
      if (after > 1) {
        if (before <= 1)
          message('setPendingFilteringMode', {
            tabId: tab.id,
            url: tab.url,
            hostname: url.hostname,
            beforeLevel: before,
            afterLevel: after,
          }).catch(() => {});
        if (!(await browser.permissions.request({ origins: [`*://*.${url.hostname}/*`] })))
          return before;
      }
      const actual = await message('setFilteringMode', { hostname: url.hostname, level: after });
      if (!Number.isInteger(actual) || actual < 0 || actual > 3)
        throw new Error('The blocking engine did not confirm the change.');
      if (actual !== before && autoReload) await browser.tabs.reload(tab.id);
      return actual;
    },
    async setDefaultMode(after) {
      if (after > 1 && !(await browser.permissions.request({ origins: ['<all_urls>'] })))
        throw new Error('Website access was not granted.');
      const actual = await message('setDefaultFilteringMode', { level: after });
      if (!Number.isInteger(actual))
        throw new Error('The blocking engine did not confirm the change.');
      return actual;
    },
    async setup(section, tab) {
      const query = new URLSearchParams({ section });
      if (Number.isInteger(tab?.id)) query.set('tab', String(tab.id));
      return browser.tabs.create({ url: browser.runtime.getURL(`kalm/ui/options.html?${query}`) });
    },
    async tool(kind, tab) {
      if (!['picker', 'zapper'].includes(kind) || !isPage(tab?.url))
        throw new Error('Choose a website tab first.');
      // Request from the click, before async target validation loses the gesture.
      const host = new URL(tab.url).hostname;
      if (!(await browser.permissions.request({ origins: [`*://*.${host}/*`] })))
        throw new Error('Website access was not granted.');
      const current = await this.targetTab(tab.id);
      if (new URL(current.url).origin !== new URL(tab.url).origin)
        throw new Error('The target tab changed. Reopen setup on that website.');
      if (kind === 'picker') {
        const level = await message('getFilteringMode', { hostname: host });
        if (!Number.isInteger(level)) throw new Error('Blocking engine unavailable.');
        if (level < 2 && (await message('setFilteringMode', { hostname: host, level: 2 })) !== 2)
          throw new Error('Custom filters need Optimal or Complete filtering.');
      }
      await browser.tabs.update(tab.id, { active: true });
      const files =
        kind === 'picker'
          ? [
              '/js/scripting/css-procedural-api.js',
              '/js/scripting/tool-overlay.js',
              '/js/scripting/picker.js',
            ]
          : ['/js/scripting/tool-overlay.js', '/js/scripting/zapper.js'];
      return browser.scripting.executeScript({ files, target: { tabId: tab.id } });
    },
    async dashboard(pane) {
      await browser.storage.local.set({ 'dashboard.activePane': pane });
      return browser.tabs.create({ url: browser.runtime.getURL('dashboard.html') });
    },
    async reloadYoutube(tab) {
      if (isPage(tab?.url) && /(^|\.)youtube\.com$/.test(new URL(tab.url).hostname))
        await browser.tabs.reload(tab.id);
    },
  };
}
export const client = createClient(webext);
export const levels = ['Off', 'Basic', 'Optimal', 'Complete'];
export function renderMode(input, output, value) {
  input.value = String(value);
  input.setAttribute('aria-valuetext', levels[value]);
  output.textContent = levels[value];
  input.parentElement
    .querySelectorAll('.ticks span')
    .forEach((el, i) => el.toggleAttribute('data-selected', i === value));
}

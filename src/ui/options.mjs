// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Kalm contributors.
import { webext, client, renderMode } from './api.mjs';
const $ = (selector) => document.querySelector(selector),
  settings = globalThis.__YTCommentFilterSettings;
const store = settings.createStore(webext?.storage?.local);
const status = (text, error = false) => {
  $('#status').textContent = text;
  $('#status').toggleAttribute('data-error', error);
};
let config, data, tab, defaultLevel;
const params = new URLSearchParams(location.search);
function section(name) {
  if (!['ads', 'comments', 'about'].includes(name)) name = 'ads';
  document.querySelectorAll('.pane').forEach((el) => {
    el.hidden = el.id !== name;
  });
  document.querySelectorAll('[data-section]').forEach((el) => {
    el.setAttribute('aria-selected', String(el.dataset.section === name));
    el.tabIndex = el.dataset.section === name ? 0 : -1;
  });
  params.set('section', name);
  history.replaceState(null, '', `${location.pathname}?${params}`);
  status('');
}
document.querySelectorAll('[data-section]').forEach((button) => {
  button.addEventListener('click', () => section(button.dataset.section));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const buttons = [...document.querySelectorAll('[data-section]')];
    const next = buttons[(buttons.indexOf(button) + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
    section(next.dataset.section);
    next.focus();
    event.preventDefault();
  });
});
section(params.get('section'));
$('.brand').addEventListener('click', (event) => {
  event.preventDefault();
  section('ads');
});
function saved() {
  $('#reload-row').hidden = false;
  status('');
}
function renderRules() {
  $('#rules').replaceChildren();
  const rules = [
    ...config.domains.map((value) => ({ kind: 'site', value })),
    ...config.keywords.map((value) => ({ kind: 'keyword', value })),
  ];
  $('#rule-count').textContent = `(${rules.length})`;
  $('#empty').hidden = rules.length !== 0;
  for (const rule of rules) {
    const row = document.createElement('li'),
      kind = document.createElement('span'),
      value = document.createElement('span'),
      remove = document.createElement('button');
    kind.className = 'kind';
    kind.textContent = rule.kind === 'site' ? 'SITE' : 'KEYWORD';
    value.className = 'rule-text';
    value.textContent = rule.value;
    remove.className = 'icon';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove ${rule.value}`);
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      try {
        const latest = await store.readConfig();
        if (rule.kind === 'site')
          await store.write(latest.domains.filter((item) => item !== rule.value));
        else await store.writeKeywords(latest.keywords.filter((item) => item !== rule.value));
        config = await store.readConfig();
        renderRules();
        saved();
      } catch (error) {
        status(error.message, true);
        remove.disabled = false;
      }
    });
    row.append(kind, value, remove);
    $('#rules').append(row);
  }
}
$('#rule-kind').addEventListener('change', () => {
  const keyword = $('#rule-kind').value === 'keyword';
  $('#rule-input').placeholder = keyword ? 'Enter keyword or phrase' : "Enter bot's link";
  $('#rule-input').setAttribute('aria-label', $('#rule-input').placeholder);
  $('#rule-input').maxLength = keyword ? 120 : 2048;
  $('#rule-input').focus();
});
$('#add-rule').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#add-rule button');
  button.disabled = true;
  try {
    const latest = await store.readConfig();
    if ($('#rule-kind').value === 'site')
      await store.write([...latest.domains, settings.normalizeDomain($('#rule-input').value)]);
    else
      await store.writeKeywords([
        ...latest.keywords,
        settings.normalizeKeyword($('#rule-input').value),
      ]);
    config = await store.readConfig();
    renderRules();
    $('#rule-input').value = '';
    $('#rule-input').focus();
    saved();
  } catch (error) {
    status(error.message, true);
  } finally {
    button.disabled = false;
  }
});
for (const [id, key] of [
  ['enabled', settings.ENABLED_KEY],
  ['all-links', settings.LINKS_KEY],
  ['channel-links', settings.CHANNELS_KEY],
]) {
  $(`#${id}`).addEventListener('change', async (event) => {
    const input = event.target;
    input.disabled = true;
    try {
      if (key === settings.ENABLED_KEY) await store.writeEnabled(input.checked);
      else await store.writeToggle(key, input.checked);
      saved();
    } catch (error) {
      input.checked = !input.checked;
      status(error.message, true);
    } finally {
      input.disabled = false;
    }
  });
}
for (const [id, tool] of [
  ['picker', 'picker'],
  ['zapper', 'zapper'],
]) {
  $(`#${id}`).addEventListener('click', () =>
    client
      .tool(tool, tab)
      .then(() => status(''))
      .catch((error) => status(error.message, true)),
  );
}
$('#reload').addEventListener('click', async () => {
  try {
    const tabs = await webext.tabs.query({
      url: ['https://www.youtube.com/*', 'https://m.youtube.com/*', 'https://youtube.com/*'],
    });
    await Promise.all(tabs.map((tab) => webext.tabs.reload(tab.id)));
    $('#reload-row').hidden = true;
    status(tabs.length ? 'Applied' : 'Saved. Applies when you open YouTube.');
  } catch (error) {
    status(error.message, true);
  }
});
$('#show-count').addEventListener('change', async (event) => {
  const input = event.target;
  input.disabled = true;
  try {
    await client.message('setShowBlockedCount', { state: input.checked });
    status('Saved');
  } catch (error) {
    input.checked = !input.checked;
    status(error.message, true);
  } finally {
    input.disabled = false;
  }
});
$('#default-mode').addEventListener('input', () =>
  renderMode($('#default-mode'), $('#default-name'), Number($('#default-mode').value)),
);
$('#default-mode').addEventListener('change', async () => {
  const after = Number($('#default-mode').value);
  $('#default-mode').disabled = true;
  try {
    defaultLevel = await client.setDefaultMode(after);
    renderMode($('#default-mode'), $('#default-name'), defaultLevel);
    status('Saved');
  } catch (error) {
    renderMode($('#default-mode'), $('#default-name'), defaultLevel);
    status(error.message, true);
  } finally {
    $('#default-mode').disabled = false;
  }
});
$('#lists').addEventListener('click', () =>
  client.dashboard('rulesets').catch((error) => status(error.message, true)),
);
document.querySelectorAll('[data-feedback]').forEach((button) => {
  button.addEventListener('click', () => {
    const url = new URL('https://kalm-feedback.ahamed-a-1235.workers.dev/');
    url.searchParams.set('area', button.dataset.feedback);
    url.searchParams.set('version', webext.runtime.getManifest().version);
    webext.tabs.create({ url: url.href }).catch((error) => status(error.message, true));
  });
});
(async () => {
  $('#version').textContent = webext.runtime.getManifest().version;
  config = await store.readConfig();
  renderRules();
  for (const [id, field] of [
    ['enabled', 'enabled'],
    ['all-links', 'blockAllLinks'],
    ['channel-links', 'blockChannelLinks'],
  ]) {
    $(`#${id}`).checked = config[field];
    $(`#${id}`).disabled = false;
  }
  const id = params.get('tab');
  try {
    tab = id === null ? await client.activeTab() : await client.targetTab(Number(id));
    if (!client.isPage(tab?.url)) tab = undefined;
  } catch {
    tab = undefined;
  }
  $('#target-label').textContent = tab
    ? new URL(tab.url).hostname.replace(/^www\./, '')
    : 'Open setup from the toolbar on a website.';
  $('#picker').disabled = !tab;
  $('#zapper').disabled = !tab;
  data = await client.message('getOptionsPageData');
  if (!Number.isInteger(data?.defaultFilteringMode))
    throw new Error('Blocking engine unavailable. Reload the extension.');
  defaultLevel = data.defaultFilteringMode;
  renderMode($('#default-mode'), $('#default-name'), defaultLevel);
  $('#default-mode').disabled = data.disabledFeatures?.includes('filteringMode') || false;
  $('#show-count').checked = Boolean(data.canShowBlockedCount && data.showBlockedCount);
  $('#show-count').disabled = !data.canShowBlockedCount;
  $('#count-note').hidden = Boolean(data.canShowBlockedCount);
  const forbidden = data.disabledFeatures || [];
  for (const [id, feature] of [
    ['picker', 'picker'],
    ['zapper', 'zapper'],
    ['lists', 'dashboard'],
  ])
    if (forbidden.includes(feature)) $(`#${id}`).disabled = true;
})().catch((error) => status(error.message, true));

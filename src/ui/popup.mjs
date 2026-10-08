// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Kalm contributors.
import { webext, client, renderMode } from './api.mjs';
const $ = (selector) => document.querySelector(selector);
const status = (text, error = false) => {
  $('#status').textContent = text;
  $('#status').toggleAttribute('data-error', error);
};
const store = globalThis.__YTCommentFilterSettings.createStore(webext?.storage?.local);
let tab, data, level;
function showLevel(value) {
  renderMode($('#mode'), $('#mode-name'), value);
}
$('#mode').addEventListener('input', () => showLevel(Number($('#mode').value)));
$('#mode').addEventListener('change', async () => {
  const after = Number($('#mode').value);
  $('#mode').disabled = true;
  try {
    level = await client.setMode(tab, level, after, data.autoReload);
    showLevel(level);
    status(level === after ? '' : 'Website access was not granted.');
  } catch (error) {
    showLevel(level);
    status(error.message, true);
  } finally {
    $('#mode').disabled = false;
  }
});
$('#comments-enabled').addEventListener('change', async () => {
  const input = $('#comments-enabled');
  input.disabled = true;
  try {
    await store.writeEnabled(input.checked);
    await client.reloadYoutube(tab);
    status('Saved');
  } catch (error) {
    input.checked = !input.checked;
    status(error.message, true);
  } finally {
    input.disabled = false;
  }
});
$('.donate').addEventListener('click', (event) => {
  event.preventDefault();
  webext.tabs
    .create({ url: event.currentTarget.href })
    .then(() => window.close())
    .catch((error) => status(error.message, true));
});
for (const [id, section] of [
  ['ad-setup', 'ads'],
  ['comment-setup', 'comments'],
  ['about', 'about'],
]) {
  $(`#${id}`).addEventListener('click', (event) => {
    event.preventDefault();
    client
      .setup(section, tab)
      .then(() => window.close())
      .catch((error) => status(error.message, true));
  });
}
(async () => {
  const config = await store.readConfig();
  $('#comments-enabled').checked = config.enabled;
  $('#comments-enabled').disabled = false;
  tab = await client.activeTab();
  if (client.isPage(tab?.url)) {
    const url = new URL(tab.url);
    $('#hostname').textContent = url.hostname.replace(/^www\./, '');
    data = await client.message('popupPanelData', { origin: url.origin, hostname: url.hostname });
    if (!Number.isInteger(data?.level))
      throw new Error('Blocking engine unavailable. Reload the extension.');
    level = data.level;
    showLevel(level);
    $('#mode').disabled = data.disabledFeatures?.includes('filteringMode') || false;
  } else {
    $('#hostname').textContent = 'Open a website';
    $('#mode-name').textContent = '—';
  }
  $('#connection').replaceChildren();
  const dot = document.createElement('span');
  dot.className = 'indicator';
  $('#connection').append(dot, 'Ready');
})().catch((error) => {
  $('#connection').textContent = 'Connection failed';
  status(error.message, true);
});

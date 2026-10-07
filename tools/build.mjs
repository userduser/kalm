// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Kalm contributors.
// Reuse checksum-pinned platform packages. Do not reimplement the blocking engine.
import { readFile, writeFile, mkdir, rm, cp, readdir, utimes } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pin = JSON.parse(await readFile(path.join(root, 'tools/upstream.json')));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json')));
const description =
  'A quieter web. Ad blocking and YouTube comment screening, with simple controls.';
const mainFiles = ['settings', 'rules', 'filter', 'profiles', 'gate', 'runtime', 'extension-start'];
const platforms = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(pin.packages);
const cache = path.join(root, '.cache/upstream');
await mkdir(cache, { recursive: true });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function files(dir) {
  const out = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...(await files(full)));
    else if (item.isFile()) out.push(full);
  }
  return out.sort();
}
const sums = [];
for (const platform of platforms) {
  const item = pin.packages[platform];
  if (!item) throw new Error(`Unknown platform: ${platform}`);
  const archive = path.join(cache, item.file);
  let bytes = await readFile(archive).catch(() => undefined);
  if (!bytes) {
    console.log(`Downloading pinned ${platform} engine`);
    const response = await fetch(`${pin.repository}/releases/download/${pin.release}/${item.file}`);
    if (!response.ok) throw new Error(`Engine download failed: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== item.sha256) throw new Error(`Engine checksum mismatch: ${platform}`);
    await writeFile(archive, bytes);
  }
  if (hash(bytes) !== item.sha256) throw new Error(`Cached engine checksum mismatch: ${platform}`);
  const output = path.join(root, 'dist', platform);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  execFileSync('unzip', ['-q', archive, '-d', output]);
  await rm(path.join(output, 'META-INF'), { recursive: true, force: true });
  await cp(path.join(root, 'src'), path.join(output, 'kalm'), { recursive: true });
  // Chromium can deduplicate a path listed in both worlds. The isolated bridge
  // therefore includes its own settings helper under a unique bundle filename.
  const bridge =
    (await readFile(path.join(root, 'src/comments/settings.js'), 'utf8')) +
    '\n' +
    (await readFile(path.join(root, 'src/comments/bridge.js'), 'utf8'));
  await writeFile(path.join(output, 'kalm/comments/isolated-bridge.js'), bridge);
  const manifestPath = path.join(output, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath));
  manifest.name = 'Kalm';
  manifest.short_name = 'Kalm';
  manifest.description = description;
  manifest.version = pkg.version;
  manifest.author = 'Kalm contributors';
  manifest.homepage_url = 'https://github.com/userduser/kalm';
  manifest.action.default_popup = 'kalm/ui/popup.html';
  manifest.icons = Object.fromEntries(
    [16, 32, 64, 128, ...(platform === 'safari' ? [512] : [])].map((size) => [
      size,
      `img/icon_${size}.png`,
    ]),
  );
  manifest.action.default_icon = platform === 'safari' ? '/img/icon_64.png' : manifest.icons;
  if (manifest.options_ui) manifest.options_ui.page = 'kalm/ui/options.html';
  if (manifest.options_page) manifest.options_page = 'kalm/ui/options.html';
  if (platform === 'firefox') {
    manifest.browser_specific_settings.gecko.id = 'kalm@userduser.github.io';
    manifest.browser_specific_settings.gecko.strict_min_version = '140.0';
    if (manifest.browser_specific_settings.gecko_android)
      manifest.browser_specific_settings.gecko_android.strict_min_version = '142.0';
    delete manifest.browser_specific_settings.gecko.update_url;
  }
  const matches = ['https://www.youtube.com/*', 'https://m.youtube.com/*', 'https://youtube.com/*'];
  manifest.content_scripts = [
    ...(manifest.content_scripts || []),
    {
      matches,
      css: ['kalm/comments/gate.css'],
      js: mainFiles.map((file) => `kalm/comments/${file}.js`),
      run_at: 'document_start',
      world: 'MAIN',
    },
    {
      matches,
      js: ['kalm/comments/isolated-bridge.js'],
      run_at: 'document_start',
      world: 'ISOLATED',
    },
  ];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  for (const locale of await readdir(path.join(output, '_locales'))) {
    const file = path.join(output, '_locales', locale, 'messages.json');
    const messages = JSON.parse(await readFile(file));
    messages.extName.message = 'Kalm';
    messages.extShortDesc.message = description;
    await writeFile(file, JSON.stringify(messages, null, 2) + '\n');
  }
  for (const size of [16, 32, 64, 128, 512])
    await cp(
      path.join(root, `src/ui/assets/logo-${size}.png`),
      path.join(output, `img/icon_${size}.png`),
    );
  for (const size of [16, 32, 64, 128])
    await cp(
      path.join(root, `src/ui/assets/logo-${size}-off.png`),
      path.join(output, `img/icon_${size}_off.png`),
    );
  await cp(path.join(root, 'src/ui/assets/logo.svg'), path.join(output, 'img/ublock.svg'));
  // Modification notice for the only upstream HTML overlay.
  const dashboard = path.join(output, 'dashboard.html');
  const html = (await readFile(dashboard, 'utf8'))
    .replace('alt="uBO Lite"', 'alt="Kalm"')
    .replace(
      '<head>',
      '<head>\n<!-- Kalm modification, 2026-10-07: branding and link to compact setup. -->',
    )
    .replace(
      '<nav id="dashboard-nav">',
      '<nav id="dashboard-nav"><a href="kalm/ui/options.html" style="align-self:center;padding:0 12px">Kalm setup</a>',
    );
  await writeFile(dashboard, html);
  for (const file of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md'])
    await cp(path.join(root, file), path.join(output, file === 'LICENSE' ? 'LICENSE.txt' : file));
  await writeFile(
    path.join(output, 'BUILD.json'),
    JSON.stringify(
      {
        project: 'Kalm',
        version: pkg.version,
        platform,
        upstreamRelease: pin.release,
        upstreamCommit: pin.commit,
        uBlockCommit: pin.uBlockCommit,
        packageSHA256: item.sha256,
        modifications:
          'Own UI, icons, product metadata and YouTube comment scripts. Engine JavaScript and rulesets unchanged.',
      },
      null,
      2,
    ) + '\n',
  );
  const list = await files(output),
    date = new Date('1980-01-01T00:00:00Z');
  for (const file of list) await utimes(file, date, date);
  const zip = path.join(root, 'dist', `kalm-${pkg.version}-${platform}.zip`);
  await rm(zip, { force: true });
  execFileSync('zip', ['-X', '-q', zip, ...list.map((file) => path.relative(output, file))], {
    cwd: output,
    env: { ...process.env, TZ: 'UTC' },
    maxBuffer: 10 * 1024 * 1024,
  });
  sums.push(`${hash(await readFile(zip))}  ${path.basename(zip)}`);
  console.log(`Built ${platform}: ${(await readFile(zip)).length} bytes`);
}
await writeFile(path.join(root, 'dist/SHA256SUMS'), sums.join('\n') + '\n');

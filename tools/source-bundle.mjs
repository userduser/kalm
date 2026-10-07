// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Kalm contributors.
// Include every Git-tracked Kalm file and the complete pinned source trees.
// Cached official packages make the exact overlay build possible offline.
import { execFileSync } from 'node:child_process';
import { mkdir, rm, cp, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json')));
const pin = JSON.parse(await readFile(path.join(root, 'tools/upstream.json')));
for (const [directory, expected] of [
  ['third_party/engine', pin.commit],
  ['third_party/engine/uBlock', pin.uBlockCommit],
]) {
  const actual = execFileSync('git', ['-C', path.join(root, directory), 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (actual !== expected)
    throw new Error(
      'Initialize the exact pinned source with git submodule update --init --recursive before creating a source release.',
    );
}
for (const file of [
  'third_party/engine/uBlock/platform/mv3/extension/lib/codemirror/codemirror-ubol/src/editor.ubol.js',
  'third_party/engine/uBlock/platform/mv3/extension/lib/s14e-serializer/s14e-serializer.js',
])
  await access(path.join(root, file));
const staging = path.join(root, '.artifacts/source');
const destination = path.join(staging, `kalm-${pkg.version}`);
await rm(staging, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root })
  .toString()
  .split('\0')
  .filter(Boolean);
for (const file of tracked) {
  if (file === 'third_party/engine') continue;
  const target = path.join(destination, file);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(root, file), target);
}
await cp(path.join(root, 'third_party/engine'), path.join(destination, 'third_party/engine'), {
  recursive: true,
  filter: (source) =>
    path.basename(source) !== '.git' && !source.includes(`${path.sep}node_modules${path.sep}`),
});
for (const item of Object.values(pin.packages)) {
  const source = path.join(root, '.cache/upstream', item.file),
    target = path.join(destination, '.cache/upstream', item.file);
  const bytes = await readFile(source);
  if (createHash('sha256').update(bytes).digest('hex') !== item.sha256)
    throw new Error('Source package checksum mismatch.');
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target);
}
await writeFile(
  path.join(destination, 'SOURCE-BUNDLE.txt'),
  'Complete Kalm and pinned upstream sources, including nested CodeMirror and serializer sources. The three checksum-pinned original platform packages provide the exact JSON rule datasets and generated runtime scripts used by this release. Build offline with Node 22.13+: node tools/build.mjs. npm ci is needed only for formatting and Mozilla lint. Git history is available in the public repository and upstream repositories.\n',
);
const archive = path.join(root, 'dist', `kalm-${pkg.version}-source.tar.gz`);
execFileSync('tar', [
  '--exclude=.DS_Store',
  '-czf',
  archive,
  '-C',
  staging,
  path.basename(destination),
]);
const digest = createHash('sha256')
  .update(await readFile(archive))
  .digest('hex');
const sumsFile = path.join(root, 'dist/SHA256SUMS');
const previous = (await readFile(sumsFile, 'utf8'))
  .split('\n')
  .filter((line) => line && !line.endsWith(`  ${path.basename(archive)}`));
await writeFile(sumsFile, [...previous, `${digest}  ${path.basename(archive)}`].join('\n') + '\n');
console.log(`Source bundle: ${archive}`);

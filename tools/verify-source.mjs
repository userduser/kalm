import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const { version } = JSON.parse(await readFile(path.join(root, 'package.json')));
const staging = path.join(root, '.artifacts/offline-rebuild');
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
execFileSync('tar', ['-xzf', path.join(root, `dist/kalm-${version}-source.tar.gz`), '-C', staging]);
const extracted = path.join(staging, `kalm-${version}`);
const guard = path.join(staging, 'offline-guard.mjs');
await writeFile(
  guard,
  'globalThis.fetch = () => { throw new Error("Network access disabled for source rebuild"); };\n',
);
const build = execFileSync(process.execPath, ['--import', guard, 'tools/build.mjs'], {
  cwd: extracted,
  encoding: 'utf8',
});
const packages = [];
for (const browser of ['chromium', 'firefox', 'safari']) {
  const name = `kalm-${version}-${browser}.zip`;
  const expected = await readFile(path.join(root, 'dist', name));
  const actual = await readFile(path.join(extracted, 'dist', name));
  assert.deepEqual(actual, expected, `${browser} differs after offline source rebuild`);
  packages.push({
    browser,
    bytes: expected.length,
    sha256: createHash('sha256').update(expected).digest('hex'),
    offlineRebuildIdentical: true,
  });
}
const tests = (await readdir(path.join(extracted, 'test')))
  .filter((name) => name.endsWith('.test.cjs'))
  .map((name) => `test/${name}`);
const testOutput = execFileSync(process.execPath, ['--test', '--test-reporter=tap', ...tests], {
  cwd: extracted,
  encoding: 'utf8',
});
await writeFile(path.join(root, '.artifacts/offline-rebuild.log'), build + '\n' + testOutput);
const pass = Number(testOutput.match(/^# pass (\d+)$/m)?.[1]);
const fail = Number(testOutput.match(/^# fail (\d+)$/m)?.[1]);
assert.ok(pass > 0 && fail === 0, 'No successful extracted-source test summary.');
await writeFile(
  path.join(root, 'dist/source-validation.json'),
  JSON.stringify({ version, downloadAPIBlocked: true, packages, tests: { pass, fail } }, null, 2) +
    '\n',
);
console.log(
  `All three packages rebuild byte-for-byte offline; ${pass} extracted-source tests pass.`,
);
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Kalm contributors.
// Prove the published source builds without downloads or development dependencies.

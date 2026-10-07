// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Kalm contributors.
// Generate the small native host with Apple's own converter. Never require users
// to disable Safari's protections; temporary folder loading works without it.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const generated = path.join(root, '.artifacts/safari-xcode');
await mkdir(generated, { recursive: true });
execFileSync(
  'xcrun',
  [
    'safari-web-extension-converter',
    path.join(root, 'dist/safari'),
    '--project-location',
    generated,
    '--app-name',
    'Kalm',
    '--bundle-identifier',
    'io.github.userduser.kalm',
    '--swift',
    '--macos-only',
    '--copy-resources',
    '--no-open',
    '--no-prompt',
    '--force',
  ],
  { stdio: 'inherit' },
);
const project = path.join(generated, 'Kalm/Kalm.xcodeproj/project.pbxproj');
// Xcode 26.5 converter changes only the parent identifier's capitalization.
// Correct the generated parent so the extension identifier retains its prefix.
const text = (await readFile(project, 'utf8'))
  .replaceAll(
    'PRODUCT_BUNDLE_IDENTIFIER = io.github.userduser.Kalm;',
    'PRODUCT_BUNDLE_IDENTIFIER = io.github.userduser.kalm;',
  )
  .replace(/MACOSX_DEPLOYMENT_TARGET = [\d.]+;/g, 'MACOSX_DEPLOYMENT_TARGET = 14.0;');
await writeFile(project, text);
execFileSync(
  'xcodebuild',
  [
    '-project',
    path.join(generated, 'Kalm/Kalm.xcodeproj'),
    '-scheme',
    'Kalm',
    '-configuration',
    'Debug',
    '-destination',
    'generic/platform=macOS',
    '-derivedDataPath',
    path.join(root, '.artifacts/safari-build'),
    'CODE_SIGNING_ALLOWED=NO',
    'build',
  ],
  { stdio: 'inherit' },
);

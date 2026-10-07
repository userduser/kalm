# Third-party notices

Kalm is an independent derivative of uBlock Origin Lite. Modifications dated
2026-10-07 replace the product interface, icons and metadata, and add the
YouTube comment filter. Engine JavaScript and compiled rule datasets are unchanged.

## Blocking engine

Copyright (C) 2022–present Raymond Hill; uBlock Origin includes earlier copyrights
and contributions. GPL-3.0-or-later. Full license: `LICENSE`. Original notices
are preserved in every source file. Pinned source and nested library sources:
`third_party/engine`, with exact commits in `tools/upstream.json` and Git submodules.

- [uBlock Origin Lite](https://github.com/uBlockOrigin/uBOL-home)
- [uBlock Origin](https://github.com/gorhill/uBlock)

The release source bundle includes the pinned upstream source and libraries,
the complete rule datasets in the pinned platform packages, and Kalm's source
and build scripts. It can rebuild the overlays without downloading packages.

## Filter lists

Filter data is not relicensed by Kalm. The engine packages include default and
optional lists. Their original names, support/home URLs and rule metadata remain
in `rulesets/ruleset-details.json` and the pinned engine's asset definitions.

- uBlock filters: GPL v3; [uAssets](https://github.com/uBlockOrigin/uAssets).
- EasyList / EasyPrivacy: GPL v3 or CC BY-SA 3.0; [license](https://easylist.to/pages/licence.html).
- Peter Lowe's list: [original license](https://pgl.yoyo.org/adservers/#license).
- URLhaus: [original use terms](https://urlhaus.abuse.ch/api/).
- Optional regional, annoyance and third-party lists: retain their own terms;
  [upstream license inventory](https://github.com/gorhill/uBlock/wiki/Filter-list-licenses).

## Fonts and libraries

Google Sans © Google LLC: SIL Open Font License 1.1. Full license and source
metadata: `kalm/ui/assets/OFL-GoogleSans.txt`, `font-source.json` in builds
(`src/ui/assets/` in the repository). No remote font requests are made.

The upstream package also includes Inter (SIL OFL), FontAwesome (font SIL OFL /
code MIT), CodeMirror (MIT), csstree (MIT), punycode.js (MIT), and other credited
libraries/resources. Their original license files, notices and source headers
remain in the packages and corresponding-source bundle. The engine dashboard's
About pane preserves its detailed contributor credits.

Kalm's logo is original vector artwork, Copyright (C) 2026 Kalm contributors,
distributed under the repository's GPL-3.0-or-later license.

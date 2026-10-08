# Changelog

## Unreleased

- Move feedback hosting to the maintainer's personal Cloudflare account.

- Add a small Feedback button in ad and comment setup, opening a private form
  for bug reports, feature requests and other messages without a GitHub login.
- Shorten the popup donation button to “Donate.”
- Add one optional donation button to the main popup, opening the separate
  Kalm support site at https://kalm-support.pages.dev.
- Clarify local website URL, page-content and request-match handling in the
  privacy policy for the Chrome Web Store submission.

## 0.1.0 — 2026-10-07 (development preview)

- Introduce Kalm: original vector logo, bundled Google Sans and compact dark UI.
- Integrate the real MV3 ad-blocking engine with a four-level per-site slider and
  default filtering setting. Add persistent element filters, page-only removal,
  native request badge controls and access to advanced filter lists.
- Add optional all-links comment blocking and literal word/phrase rules.
- Combine bot domains and keywords in one collapsed list; use “Enter bot's link”
  for site input. Retain the comment master switch and zero-flash visibility gate.
- Build Chromium 122+, Firefox desktop 140+ and Safari macOS 18.6+ packages from
  checksum-pinned upstream 2026.1006.1931 platform assets.
- Keep engine JavaScript and blocking datasets unchanged. Preserve GPL notices,
  upstream/library credits, font licenses and a full source bundle.
- Add 62 passing regressions, Firefox static validation (0 errors / 12 upstream
  warnings), local UI/lifecycle checks and a successful Safari host build.
- Add CI, readable source formatting, installation/privacy/maintenance documents,
  contribution and security policies, and real incremental Git history.
- Verify the extracted source builds all three packages byte-for-byte offline
  and passes the full regression suite; keep this check in CI.
- Live combined-build Chromium/Firefox/Safari verification, permanent Firefox
  signing and Safari signing/notarization remain pending. This is a preview.

Kalm development starts from the working YouTube Comment Filter 0.7.0 snapshot. Earlier work was not tracked in Git; this repository preserves that snapshot and records each subsequent change without inventing earlier commits.

## Comment filter 0.7.0 — 2026-10-07 (imported baseline)

- Screen comments before revealing them on videos and Shorts.
- Screen cached author bios for blocked domains and channel promotion shelves.
- Preserve native pagination and comment lifecycle behavior.
- Handle modern comment models, recycled rows, replies, and author identities.
- Include a master switch and editable domain blocklist.

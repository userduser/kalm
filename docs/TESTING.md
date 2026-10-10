# Verification and release status

## 0.1.1 development build — 2026-10-10

- 65 regressions pass, including the captured `@Raisyaangel` promotion shelf,
  expiration of passed-author approvals after 30 minutes, and cache migration.
- A fresh public YouTube browse response for `@Raisyaangel` is rejected by the
  existing shelf rule after one parent-profile request. No linked profiles or
  avatar images are fetched. Its three visible channel cards use the supported
  `gridChannelRenderer` schema.
- Chromium, Firefox and Safari packages build successfully. Firefox static
  validation reports 0 errors and the same 12 upstream warnings.
- The reported miss in the installed Chrome extension has not been reproduced.
  An older build or saved approval may explain it; the Chrome diagnostic is
  still needed to establish the cause. Native Firefox/Safari checks remain pending.

## 0.1.0 preview — 2026-10-07

| Check                                | Result                          | Scope                                                                                               |
| ------------------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------- |
| Node regressions                     | 62 pass                         | Body rules, bios/shelves/cache, startup bridges, native API contract                                |
| Three browser packages               | Pass                            | Platform manifests, DNR data, world ordering and engine-file preservation                           |
| Downloadable source rebuild          | Pass                            | Three byte-identical packages offline; 62 extracted-source tests pass                               |
| Local browser comment lifecycle      | Pass                            | 0 unchecked/rejected visible frames; both loading controls settle; 4 profile requests for 3 authors |
| Compact UI interactions              | Pass                            | Add/remove sites and keywords, persistence, collapsed list, slider and toolbar messages             |
| Mozilla add-on validator             | Pass, 12 upstream warnings      | Static validation; not Mozilla signing or native installation                                       |
| Safari macOS wrapper                 | Build succeeds                  | Xcode 26.5 converter + unsigned Debug compilation; not Safari runtime testing                       |
| Native Chromium on real websites     | Pending for combined Kalm build | Earlier standalone comment-filter use was user-confirmed                                            |
| Native Firefox on real websites      | Pending                         | No Firefox browser connected to this session                                                        |
| Native Safari on real websites       | Pending                         | No Safari browser connected to this session                                                         |
| Browser store signing / distribution | Pending                         | No AMO signature, notarization or App Store submission                                              |

The preview is suitable for source review and development testing. Passing mocks
or a compile does not prove native extension behavior. Do not advertise full
Firefox/Safari verification until the checks below have actual recorded results.

The Firefox validator's remaining warnings refer to unmodified upstream engine
code/data: conditional API calls, eval-prevention scriptlets and coin-miner strings
inside blocking rules. They are not silently suppressed. Minimum Firefox versions
are 140 desktop / 142 Android to support the metadata and APIs declared by Kalm;
mobile has not been tested. See the release's validation reports for exact counts.

Apple's converter reports `type`, `world` and `persistent` schema warnings even
with its current SDK. The pinned Safari upstream package contains the background
keys; Safari 18+ documents main-world content scripts. Retaining the supported
main-world declaration is required to screen page objects. A successful build
does not settle runtime behavior; real Safari startup/reload testing remains a
release gate. [Manifest compatibility](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_scripts),
[Apple compatibility guide](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility).

## Native release gate (every browser)

Record browser/OS version, package SHA-256 and pass/fail in a GitHub issue or PR.

1. Install through the documented flow; ensure the background has no startup error.
2. On a real website, confirm **Ready**, exercise all four modes and denied/granted
   permission paths. Confirm requests actually block in the network panel when
   filtering is enabled and return when Off. Reload after changing modes.
3. Pick an element and create a persistent filter. Reload to check it persists.
   Use Remove an element and confirm this removal lasts only for the current page.
4. Toggle request counts where supported. Confirm the badge changes without
   adding a polling service. Unsupported controls must stay disabled.
5. On a normal YouTube video and Shorts, test initial comments, replies and at
   least three subsequent batches. No rejected/unchecked comment may flash.
   Native spinners must settle and further pagination must remain possible.
6. Add a bot domain that appears only in an author's bio. Confirm that author's
   comments disappear; then test visible channel promotion shelves.
7. Enable all-links blocking and verify a clickable link, `https://example.org`,
   `www.example.org` and a common bare domain are hidden. Ordinary prose about
   HTTPS, version numbers and plain email addresses should pass this body check.
8. Add a literal phrase and test case/whitespace variants. Remove the rule and
   reload to confirm restoration. The shared blocklist starts collapsed.
9. Turn the comment filter off, reload and confirm normal comments return without
   author metadata requests. Turn it on again and verify screening resumes.
10. Restart the browser / update the preview and verify settings, background
    wakeups, permissions and caches. Temporary extensions may need reloading.

YouTube's private renderer/metadata APIs change. Unknown schemas and failed
profile checks stay hidden while filtering is on; this can delay or hide benign
comments. Tests cannot guarantee every real comment passes. Screenshots/diagnostic
logs should exclude unrelated browsing and personal information.

## Local checks

```sh
npm run check
npm run demo
```

Visit `http://127.0.0.1:8770/demo/lifecycle-test.html` for the actual comment code
against local metadata fixtures. `/popup-preview` and `/options-preview` use a
clearly marked UI-only browser API adapter; they do not run a native ad blocker.
Use `/options-preview?section=ads&tab=7&browser=safari` to check unsupported badge
controls. `npm run build:safari` checks native host compilation on macOS/Xcode.

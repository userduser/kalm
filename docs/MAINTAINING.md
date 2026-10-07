# Maintenance

## Keep upstream separate

Kalm changes live in `src/` and `tools/`. Do not modify blocking engine algorithms
or compiled lists in place. `third_party/engine` is a pinned Git submodule with
the matching upstream runtime source, build tools and nested libraries.

`tools/upstream.json` locks the release, parent/source commits and SHA-256 hashes
of all three official platform packages. The overlay keeps platform backgrounds,
permissions, lists and runtime JavaScript. Allowed changes are product metadata,
icons/localized product name, one dashboard navigation/branding overlay, original
signature removal and Kalm's own UI/comment scripts. Firefox has its own ID.

## Update the engine

1. Choose an upstream release with Chromium, Firefox and Safari assets. Read its
   changes and browser/API minimums. Download from official release URLs.
2. Verify the parent tag/commit and its exact `uBlock` submodule commit. Update
   the engine checkout and initialize its CodeMirror/serializer submodules.
3. Compute SHA-256 hashes of those original assets and update the lock file.
   Build only after verifying these pins. Hashes are committed for review.
4. Run `npm run check`, review validator warnings, compile the Safari host, and
   complete native browser checks in `TESTING.md`. Compare package size and rule
   counts. Check upstream license/list inventory for changes.
5. Update the changelog and notices. Commit the pin and implementation changes
   separately where useful. Never overwrite or fabricate historical commits.

The overlay build reuses the exact release datasets. Upstream's independent
`uBlock/tools/make-mv3.sh` regenerates rules from source/list URLs; those remote
lists move, so that process is not the bit-for-bit Kalm release build. Kalm's
source bundle includes the exact original packages for an offline overlay build,
plus the corresponding engine/compiler/library source and unmodified rule data.

## Release

1. Set `package.json` version, update `CHANGELOG.md` and validation status.
2. `npm ci`, `npm run check`, `npm run format:check`; inspect all reports.
3. Commit every release source/document change. Confirm `git status` is clean.
4. `npm run source` includes tracked files, pinned nested sources and cached
   original packages. Verify an extracted source bundle builds offline.
5. Tag the exact commit and upload three ZIPs, complete source archive,
   `SHA256SUMS` and validation reports. Mark unverified releases as prereleases.
6. Obtain Kalm-specific AMO signing for permanent Firefox installation and a
   signed/notarized Safari host for permanent public distribution. Never reuse
   upstream identities/signatures or describe development ZIPs as store releases.

The GitHub CI builds all platforms, tests them, validates Firefox and retains
artifacts. Its macOS job compiles the Safari host. CI does not silently publish
releases or store submissions. Release signing credentials belong in narrowly
scoped repository secrets, not source or pasted logs.

## Comment rules

Site rules accept one domain or HTTP(S) URL, normalize to a hostname and match
subdomains. `tinyurl.com` and `blogspot.com` start enabled. Empty lists are valid.
Keywords are Unicode-normalized, case-insensitive literal words/phrases with
word boundaries; no regex or substring matching inside larger words. Whitespace
in a phrase is normalized. Body-only toggles never affect ordinary author bios.

All-links blocking checks body navigation commands, HTTP(S)/`www.` text and common
bare domains. It is a conservative detector, not a full natural-language link
classifier; an unlinked uncommon-TLD domain may pass. Existing blocked domain
entries still match any valid configured hostname. Real clickable links are
screened independently of text formatting.

The profile cache signature depends on domain rules, because words/all-links
apply only to bodies. If profile rules change, bump `profileSignature` to
invalidate stored approvals. Preserve the visibility gate and native list nodes:
detaching a YouTube-owned renderer can leave pagination/loading state stuck.

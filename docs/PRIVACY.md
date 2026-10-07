# Privacy

Kalm has no account, analytics, telemetry or hosted screening service. It does
not send comments, keywords, blocklist entries or browsing history to Kalm's
maintainers. The UI and fonts load from the extension package.

The browser's declarative request engine applies bundled ad/tracker rules.
Enabling imported filter lists in the advanced engine dashboard fetches the URLs
you choose. Any upstream filter-update/resource behavior remains in the pinned
engine; see its source and upstream privacy documentation.

On YouTube, the comment filter sends additional same-origin requests to YouTube's
channel metadata endpoints to screen uncached authors. Requests use
`credentials: omit`; external destinations, linked channels and avatars are not
fetched for screening. YouTube can observe these requests as normal server traffic.

Channel IDs, allow/block decisions, expiry times and a rules signature are cached
in YouTube-origin IndexedDB, for up to 24 hours and 2,000 authors. Comment body
text is not persisted. In-memory URL/author maps are bounded. Decisions are reused
across repeated authors; changing domain rules invalidates old profile approvals.

Domains, literal keywords and switches are stored in extension-local storage.
These values are serialized into the YouTube page world because screening must
run before YouTube renders comments. The page can observe/interfere with this
code and its settings; do not enter secrets as keywords. This is filtering for
the user, not a security boundary against the website itself.

The comment switch stops profile screening and releases the visibility gate on
the next page reload. Comment options include a Reload button. You can delete
YouTube's site data to clear its decision cache and uninstall Kalm to remove
extension-local settings. Site data deletion is not needed for normal updates.

Permissions include website access, declarative network rules, script injection,
local storage and upstream engine capabilities. Website access is necessary for
cosmetic filtering/element tools and YouTube screening. Optional user-script
access enables supported advanced engine features. No additional Kalm API
credentials are requested.

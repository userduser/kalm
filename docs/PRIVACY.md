# Privacy

Last updated: 8 October 2026.

Kalm has no account, analytics, telemetry or hosted screening service. It does
not automatically send comments, keywords, blocklist entries or browsing history
to Kalm's maintainers. The UI and fonts load from the extension package.

To filter content, Kalm processes the current website's URL, network request
matches, page elements, YouTube comments and public channel information on your
device. Public channel information can include channel IDs, handles, descriptions
and links. Website URLs select the site's filtering level; page content and
request matches determine what to block or hide. The toolbar can show a local
blocked-request count. Kalm does not build or transmit a browsing-history log,
record keystrokes, or collect private messages or login credentials.

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

Kalm uses this information only for its content-filtering features, consistent
with the Chrome Web Store User Data Policy, including its Limited Use
requirements. It does not sell user data, use it for advertising, determine
creditworthiness, or make it available for maintainers to read. Public information
that you choose to include in a GitHub issue is handled by GitHub under its own
policies; reporting an issue is optional.

The optional Feedback button opens a separate hosted form. Only the message and
type you choose, the setup section and Kalm's version are sent. Reports become
labelled issues in a private GitHub inbox, accessible to the maintainer; they are
not published as public Kalm issues. No reply address or browsing data is
automatically attached. Cloudflare hosts the form, uses your IP address for
short-lived rate limits and may retain operational records. The service caches
only request IDs and message hashes for up to a day to reduce duplicate sends.
GitHub retains reports until the maintainer deletes them. Do not include passwords,
payment details or personal information. Sending feedback is entirely optional;
opening setup sends no requests to this service.

The comment switch stops profile screening and releases the visibility gate on
the next page reload. Comment options include a Reload button. You can delete
YouTube's site data to clear its decision cache and uninstall Kalm to remove
extension-local settings. Site data deletion is not needed for normal updates.

Permissions include website access, declarative network rules, script injection,
local storage and upstream engine capabilities. Website access is necessary for
cosmetic filtering/element tools and YouTube screening. Optional user-script
access enables supported advanced engine features. No additional Kalm API
credentials are requested.

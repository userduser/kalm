# Security

Kalm is a user-side content filter, not a security boundary against a hostile
website. Main-world comment scripts/settings can be observed or modified by the
page. Unknown YouTube schemas and profile failures leave comments hidden rather
than silently approving them. Do not store secrets as filter terms.

For a vulnerability that could expose user data or cross extension trust
boundaries, use the repository's **Report a vulnerability** / private advisory
feature when available. Do not post exploit details or personal data in public
issues. Other functional failures belong in normal issues with a minimal example.

The currently maintained line is the latest 0.1.x development preview. Dependency
and engine pins are reviewed on update. Signing and native browser verification
are required before labeling a release ready for general public installation.

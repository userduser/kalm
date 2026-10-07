# Contributing

Use an issue for a reproducible failure or a concrete change proposal. Include
the Kalm version, browser/OS version, install method and smallest example. Avoid
private comments, cookies, credentials and unrelated browsing logs.

Fork the repository, clone with submodules, use Node 22.13+ and run `npm ci`.
Change Kalm files under `src/`; keep upstream code and data pinned and separate.
Use `npm run format`, `npm run check`, and the relevant native checks in
[TESTING](docs/TESTING.md). Add meaningful regressions for behavior changes.

Describe the trigger, resulting behavior and actual validation in a PR. Do not
present mocked APIs or builds as native browser testing. Keep changes focused
and commit messages concrete. Add a changelog entry for user-visible changes.

Contributions are provided under GPL-3.0-or-later, consistent with the repository.
No contributor license agreement is required. Credit remains in Git history and
original source/license notices.

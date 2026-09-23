# Retired historical clinical-date fix snapshot

The earlier default-login test commands, automatic deployment advice and blanket timezone correctness claims are removed. They do not describe the full current API or prove the meaning of legacy timestamps.

Use [AUDIT_API_INVENTORY.md](AUDIT_API_INVENTORY.md) and [OPERATIONS.md](OPERATIONS.md): calendar dates are `YYYY-MM-DD`; impossible dates are rejected; note updates use revision checks and conflicts must preserve the unsaved draft. Never convert historical timestamps by guessing their original timezone.

For synthetic verification use [SETUP.md](SETUP.md): Node 22.12+, repository-root `npm ci`, exact origins and required integration/release commands. There is no public HTTP seed route or default production login. New evidence belongs in [docs/verification/track-a-release.md](docs/verification/track-a-release.md), not historical prechecked results.

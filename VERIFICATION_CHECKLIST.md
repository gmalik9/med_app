# Release verification checklist

This is a checklist, **not a record of completed checks**. The old prechecked seed/demo/auto-detection assertions are retired. Actual dated results belong in [docs/verification/track-a-release.md](docs/verification/track-a-release.md).

- [ ] Node 22.12+ on the 22 line; clean repository-root `npm ci`; root lock and manifests agree.
- [ ] `npm run test:unit` passes without a database. Missing/unapproved test URLs fail required integration and `verify` before any build.
- [ ] `npm run verify:release` passes against the guarded synthetic URL in [SETUP.md](SETUP.md), with a supported Playwright browser.
- [ ] Required integration runs in each PostgreSQL 15/17 × UTC/America/New_York CI cell. No skipped suite is reported as a pass.
- [ ] Exact-origin, production signing-secret/distinctness, signup/AI defaults and production seed rejection tests pass.
- [ ] Frontend receives an explicit API origin or a real same-origin `/api` proxy; actual built-asset response headers and proxy behavior are checked, not just a build.
- [ ] Migration reruns preserve synthetic records; a synthetic restore into an isolated destination is verified without changing existing data/volumes.
- [ ] Full-history **redacted** secret scanning, CodeQL/SAST, dependency audit, image/native dependency scans and SBOM generation pass in observed hosted runs. Review findings; never auto-suppress them to pass a release.
- [ ] Verified immutable action/image references and update automation reviewed; required branch checks configured by repository owners.
- [ ] Approved infrastructure TLS/encryption, backups/restore, RPO/RTO, account provisioning, access model, audit retention and vendor contracts independently verified before real ePHI.

Normal `npm test` is unit-friendly and excludes database integration. The release commands deliberately require it. No hosting plan is endorsed; no public HTTP seed endpoint or default production login exists. Use [OPERATIONS.md](OPERATIONS.md) and [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md), not historical shell-manager reset/deploy recipes.

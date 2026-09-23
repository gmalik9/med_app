# Deployment guide — superseded procedures retired

Use [SETUP.md](SETUP.md), [OPERATIONS.md](OPERATIONS.md) and [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md). The old free-plan assumptions, default-login examples, production seed calls, automatic-push helper and destructive reset recipes are removed, not alternative deployment options.

The current contract is Node 22.12+ on the 22 line and `npm ci` at the repository root, exact HTTPS browser origins, an explicit build-time API origin for a separate static frontend (or an actual same-origin `/api` proxy), and `npm run verify:release` with the guarded synthetic test database. A normal unit-friendly `npm test` excludes integration and is not release evidence.

Keep deployed signup/seeding/external AI off. No public HTTP seed route or default production account exists. Cloud plan/vendor suitability, durable backups/audit retention and approved account provisioning remain blockers. Refer to [QUALITY_AUDIT.md](QUALITY_AUDIT.md) and [docs/verification/track-a-release.md](docs/verification/track-a-release.md); no hosted deployment is claimed here.

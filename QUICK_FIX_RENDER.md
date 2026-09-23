# Retired: seed-based Render quick fix

The former public-seed/default-login recipe is removed. There is **no public HTTP seed endpoint**. Empty data or a rejected signup is not permission to seed production or enable public enrollment.

Use [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) and [SETUP.md](SETUP.md): Node 22.12+, root `npm ci`, exact HTTPS `ALLOWED_ORIGINS`, explicit build-time `VITE_API_URL` for a separate static frontend (or a real same-origin `/api` proxy). Do not guess backend hostnames. Keep production seed/signup/external AI disabled.

Troubleshoot sanitized `/health` and `/ready` results, the actual browser request destination, configured origins and approved account provisioning. Verify DB TLS certificates; do not bypass verification or reset volumes. A static frontend build does not prove API access or hosted headers. See [track A evidence](docs/verification/track-a-release.md); no live deployment was contacted.

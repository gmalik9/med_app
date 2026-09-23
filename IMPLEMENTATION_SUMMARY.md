# Retired historical implementation summary

The earlier hostname-detection, public-seeding, default-login and deployment recipes are removed. Historical feature and performance checkmarks are not current acceptance evidence.

Current guidance: [README.md](README.md), [SETUP.md](SETUP.md), [OPERATIONS.md](OPERATIONS.md) and [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md). Use Node 22.12+ on the 22 line, root `npm ci`, exact HTTPS origins and an explicit API destination or configured same-origin `/api` proxy. There is no public HTTP seed route or recommended production demo account. Deployed signup, seeding and external AI stay disabled.

Consult [AUDIT_API_INVENTORY.md](AUDIT_API_INVENTORY.md) for current behavior and [docs/verification/track-a-release.md](docs/verification/track-a-release.md). This historical entrypoint does not authorize deployment, account provisioning or real-data use.

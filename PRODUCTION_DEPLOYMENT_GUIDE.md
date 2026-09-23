# Production deployment prerequisites

The former shell-manager deployment procedure is **retired**. Do not run destructive clean/rebuild helpers or treat a successful build as production approval.

Use [SETUP.md](SETUP.md) for the current Node 22.12+ / root `npm ci` / required-integration command contract, [OPERATIONS.md](OPERATIONS.md) for environment and rollout controls, and [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) for separate API/static-host configuration. Exact HTTPS origins and an explicit API destination or same-origin `/api` proxy are mandatory; no guessed hosts or wildcard CORS.

Production signup, seeding and external AI stay disabled. There is no public HTTP seed route or shared production login. Use approved provisioning; it is not yet implemented. Never put backend secrets in frontend configuration.

Before deployment, obtain reviewed evidence of TLS (including DB certificate verification), approved vendors/contracts, private networking, encryption at rest and backups, an isolated restore, access policy, durable audit retention, least privilege, monitoring/alert delivery, and RPO/RTO. [QUALITY_AUDIT.md](QUALITY_AUDIT.md) records unresolved blockers; [docs/verification/track-a-release.md](docs/verification/track-a-release.md) separates local results from unexecuted hosted checks.
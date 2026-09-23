# Deployment entry point

The previous “running/live/production ready” snapshot and reset-volume recipes are **retired and removed**. They were not current deployment evidence.

- [SETUP.md](SETUP.md): current Node 22.12+ on the 22 line, root `npm ci`, unit and required integration/release commands.
- [OPERATIONS.md](OPERATIONS.md): authoritative environment, migration, backup/restore and release safety contract.
- [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md): explicit API origin, exact HTTPS CORS origins and provider-specific prerequisites.
- [PRODUCTION_DEPLOYMENT_GUIDE.md](PRODUCTION_DEPLOYMENT_GUIDE.md): approvals still needed before real ePHI.
- [APP_MANAGER.md](APP_MANAGER.md): historical helper hazards; no destructive reset as troubleshooting.

Local Compose is synthetic-only, not production infrastructure. Do not reuse its public credentials, seed a deployed system, enable public signup to bootstrap a clinician, or attach existing volumes to another PostgreSQL major version. Never infer running services or passing tests from this guide. See actual [track A evidence](docs/verification/track-a-release.md).

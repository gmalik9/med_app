# Historical shell managers — not the release interface

[app.sh](app.sh) and [deploy.sh](deploy.sh) are legacy helpers, not approved production automation. Their implementation is outside this documentation batch. Previous “quick start,” default-login and reset-volume recipes have been removed.

**Do not use clean/rebuild/reset operations on data that must be retained.** Some helper paths remove volumes or rewrite local settings; deployment preparation can commit/push. Do not run these commands as a workaround for configuration or database failures. Do not print application logs/configuration containing secrets or PHI into tickets.

Use Node **22.12+ (22 line)**, `npm ci` from the repository root, and the explicit npm commands in [SETUP.md](SETUP.md) instead. That guide separates units from required synthetic integration tests, documents exact origins/API destination and keeps deployed seed/signup/external AI disabled. The [docker-compose.yml](docker-compose.yml) template is local synthetic-only; it is not a production stack or permission to recreate an existing database.

Use `/health` for liveness and `/ready` for database readiness. Diagnose failures using sanitized status metadata. If retained data or unknown infrastructure is involved, stop and obtain the database owner's backup/restore and maintenance approval; do not delete data. See [OPERATIONS.md](OPERATIONS.md) and [docs/verification/track-a-release.md](docs/verification/track-a-release.md).

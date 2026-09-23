# Retired: legacy Render deployment fixes

The previous wildcard CORS, hostname detection, seed calls and shared-login instructions have been removed. They are not fallback options.

Follow [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md), [RENDER_QUICK_START.md](RENDER_QUICK_START.md) and [SETUP.md](SETUP.md). Use Node 22.12+ on the 22 line, repository-root `npm ci`, actual exact HTTPS origins, and a build-time API origin for a separate static frontend. An unset API destination requires an explicit same-origin `/api` proxy; it does not activate auto-detection.

Production seed/signup/external AI stay disabled; no public HTTP seed route or default production login exists. Diagnose liveness, readiness, TLS, proxy/header behavior and approved provisioning without disclosing tokens/configuration, resetting data or disabling certificate checks. Provider eligibility and backup/restore evidence remain approval requirements. No remote execution is claimed by this guide.

# Render quick start — engineering checklist, not production authorization

The former five-minute/free-plan/demo-login procedure is **retired and removed**. Follow [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) and the current [SETUP.md](SETUP.md) command contract. Hosting eligibility, encryption, backups, account provisioning and vendor agreements require separate approval before real ePHI.

1. Select approved database/API/static hosting and obtain the **actual** frontend and API origins from platform metadata. Reserve/configure service addresses first; do not enable wildcard CORS temporarily or derive one host from another.
2. Set the repository root as the build directory and Node **22.12+ (22 line)** for both services. Backend build: `npm ci && npm run build --workspace=backend`; start: `npm start --workspace=backend`. Static frontend build: `npm ci && npm run build --workspace=frontend`; publish the frontend build output.
3. Configure `NODE_ENV=production`, `HOST=0.0.0.0`, platform `PORT`, a certificate-verified TLS `DATABASE_URL`, independent strong signing secrets, and `ALLOWED_ORIGINS` containing only the exact HTTPS frontend origin(s). No credentials, paths, query strings, fragments, trailing slashes or wildcards.
4. Keep `ALLOW_SELF_REGISTRATION=false`, `SEED_DATABASE=false`, and `ENABLE_EXTERNAL_AI=false`. There is no public HTTP seed route or recommended demo production account. Approved enrollment is a release blocker, not a reason to enable public registration.
5. For the separate static site, set `VITE_API_URL` to the actual HTTPS API origin before building, without `/api`. Leaving it unset is valid only with a configured same-origin `/api` proxy. There is **no hostname auto-detection**. Never put backend secrets in frontend variables.
6. Run the guarded `npm run verify:release` on synthetic infrastructure, then verify actual hosted `/health`, `/ready`, TLS, response headers, proxy behavior and approved synthetic login/workflows. Configure static-host headers explicitly; the repository nginx settings do not apply automatically to a hosted static site.

No cloud services or hosted checks were executed for this documentation update. See [docs/verification/track-a-release.md](docs/verification/track-a-release.md).

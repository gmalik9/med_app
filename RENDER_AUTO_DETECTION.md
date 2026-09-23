# Retired: Render hostname auto-detection

**Do not use the former procedure.** Hostname substitution and wildcard-origin recommendations have been removed. They are not supported behavior and do not establish control of other hosted subdomains.

Use [RENDER_QUICK_START.md](RENDER_QUICK_START.md), [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) and [SETUP.md](SETUP.md): Node 22.12+ on the 22 line, root `npm ci`, exact HTTPS `ALLOWED_ORIGINS`, and an explicit build-time `VITE_API_URL` for a separately hosted frontend. Obtain actual service origins first; never guess them. An unset API destination is valid only with a deliberately configured same-origin `/api` proxy.

There is no default production login or public HTTP seed route. Keep production signup, seeding and external AI disabled. Old instructions remain in version history only, not as runnable deployment guidance. Hosting/vendor approval and operational evidence are still required.

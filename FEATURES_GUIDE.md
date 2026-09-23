# Synthetic workflow navigation

First follow [SETUP.md](SETUP.md): Node 22.12+, root `npm ci`, explicit origins/API proxy and a disposable local database. Use a unique synthetic account. The former shared-login instructions and restart-with-seed troubleshooting are retired. This guide does not claim a service is currently running or authorize real patient data.

- **Dashboard:** inspect summary counts, scheduled visits, appointments and available templates. Compare against records created by the test, not fixed demo counts.
- **Patient directory/search:** select or create a synthetic patient; inspect demographics, note dates/history, vitals, visits and appointments. Bounded history results are not archival exports.
- **Notes:** verify a successful save and a conflicting revision. Preserve the draft when resolving a conflict; AI output requires human review and external AI stays disabled unless separately approved.
- **Profile:** inspect and edit the synthetic user's profile. A profile field or stored role is not evidence of complete clinical authorization.
- **Logout:** verify the session ends and protected resources remain inaccessible with revoked credentials.

For failures inspect sanitized request status, actual API destination, `/health` and `/ready`. Never copy tokens or PHI into logs/issues, enable production registration/seeding to make a test pass, or reset retained data. Current API boundaries and remaining shared-clinic access limitations are in [AUDIT_API_INVENTORY.md](AUDIT_API_INVENTORY.md); automated results are in [docs/verification/track-a-release.md](docs/verification/track-a-release.md).

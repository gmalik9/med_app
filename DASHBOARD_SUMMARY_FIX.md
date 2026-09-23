# Retired historical dashboard verification snapshot

The old seeded-account commands and automatic deployment instructions are removed. Historical screenshot counts and checked boxes are not current test results.

Verify dashboard behavior using unique synthetic accounts and freshly created test schemas through [SETUP.md](SETUP.md): Node 22.12+, root `npm ci`, explicit origins, and required integration/release checks. Do not seed a deployed database, use shared production credentials or reset existing volumes to populate the dashboard.

See [FEATURES_GUIDE.md](FEATURES_GUIDE.md), [AUDIT_API_INVENTORY.md](AUDIT_API_INVENTORY.md) and [docs/verification/track-a-release.md](docs/verification/track-a-release.md). Calendar-date and legacy timestamp semantics still require the decisions in [HARDENING_PLAN.md](HARDENING_PLAN.md); no universal timezone-correctness claim is made here.

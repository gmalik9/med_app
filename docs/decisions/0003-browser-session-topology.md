# ADR 0003 — browser credentials, topology and CSRF (Q3 / P05)

## Current pilot status and scope addendum — 2026-09-20 local

**APPROVED FOR SYNTHETIC PILOT DESIGN; IMPLEMENTATION PENDING;
INFRASTRUCTURE/CONTRACTUAL VERIFICATION PENDING.** Q3's selected topology design is
unblocked; see the [approved pilot scope](APPROVED_PILOT_SCOPE.md).

- Select same-origin option A: **one Render HTTPS web service serves UI and API,
  with PostgreSQL**. Use a same-origin HttpOnly session/refresh-cookie design with
  Secure/host scope, suitable SameSite settings and explicit CSRF protections, not
  browser-readable access/refresh credentials. No managed IdP/BFF dependency is implied
  by choosing the direct same-origin service with Q2 local accounts.
- Cover login, refresh, logout, profile, uploads and admin mutations with the CSRF
  contract. Preserve exact-session revocation/expiry and stale-response/account-switch
  safety; define shared-cookie multi-tab behavior. No silent bearer-storage fallback.
- Exact service origins, project/region/plan, proxy trust, cookie details and secret-
  manager configuration remain implementation inputs. Secrets are secure direct entry,
  never chat. Actual HTTPS/cookie/browser behavior requires independent verification.
- This choice authorizes no cloud provisioning, purchase or deployed-secret changes
  and proves no TLS configuration, BAA or provider healthcare eligibility. Existing
  JavaScript-readable credential code remains pending replacement, not certified safe.

Historical B/C/SSO alternatives and related tests below are not selected pilot work.
No source/transport change or new test result is recorded here. The historical-key
security gate remains FAIL.

## Historical initial proposal — retained unchanged

The remainder is the pre-approval snapshot; its no-approval and PENDING wording
describes the earlier decision state, not the current limited pilot selection.

<!-- BEGIN HISTORICAL ADR SNAPSHOT -->

**Status: PENDING — NOT IMPLEMENTED.** No cookie transport or deployment approval recorded.
Date: 2026-09-20. Owners to designate: platform, identity/security, frontend/API owners.
Gate register: [Track H](../verification/track-h-decisions.md).

## Evidence and minimal decision

[API client](../../frontend/src/utils/apiClient.ts) stores access/refresh credentials
in JavaScript-readable `sessionStorage` and sends Bearer headers. Session generation
guards are useful but do not protect tokens from XSS. [Application CORS](../../backend/src/app.ts)
uses exact origins, not a credentialed-cookie/CSRF protocol. [Nginx](../../frontend/nginx.conf)
already offers a same-origin API proxy, but that alone does not implement cookies.

**Question Q3:** Which exact HTTPS frontend/API/IdP callback origins and trusted proxy
path will be used: (A) same-origin API/BFF, (B) cross-origin but same-site subdomains,
or (C) genuinely cross-site browser/API? Is a BFF deployable at the frontend origin?

Recommend A with a BFF: browser holds only an opaque session handle; BFF retains IdP
tokens server-side. A direct same-origin API with an opaque HttpOnly server session
is also viable. B has more CORS/CSRF and subdomain trust surface; C has third-party
cookie blocking and should use a same-origin BFF rather than weaken browser privacy.
Different origins are not necessarily different schemeful sites. Validate the actual
registrable domains/public suffixes and browsers, not assumed hosting suffix behavior.

## Cookie / topology contract — proposal only

| Topology | Proposed cookie and routing | CSRF / browser requirements |
| --- | --- | --- |
| A: same-origin browser → API/BFF | `__Host-medapp_session`; `Secure; HttpOnly; Path=/; SameSite=Lax`; **no Domain**. TLS at approved ingress and protected backend hop. BFF downstream tokens never leave server. | Synchronizer CSRF token bound to server session, exact allowed Origin on all unsafe methods, Fetch Metadata defense in depth. No cross-origin credentials needed. |
| B: same-site, different origin | Host-only cookie on API host, same flags as A; never `Domain=.example...`. Frontend fetch uses credentials; API allows only exact approved origin with credentials, `Vary: Origin`, fixed methods/headers. | SameSite is not a same-origin barrier: malicious sibling origin is denied by exact Origin + CSRF, including multipart/form requests. Preflight is not sole protection. |
| C: cross-site direct API (not recommended) | `Secure; HttpOnly; SameSite=None`, host-only cookie, exact credentialed CORS. Document and test third-party cookie failure; no silent token-storage fallback. | Same explicit CSRF policy; full real-browser interoperability required. Prefer BFF to avoid unsupported third-party cookie dependency. |

`SameSite=Strict` is an alternative only after testing inbound navigation/SSO flows;
Lax is not CSRF protection for unsafe GET handlers, which must not exist. The `__Host-`
prefix requires `Path=/`; don't claim it also has a narrow refresh-only path. If
separate cookies with narrower paths are chosen, specify different compliant names
and identical host/security semantics. No wildcard CORS or permissive origin reflection.

## Schema and endpoint proposal

- Extend/reuse server session storage with a digest of a high-entropy opaque handle,
  user/credential version, assurance from Q2, idle and absolute expiration instants,
  revocation time and anti-CSRF binding. If BFF stores provider refresh credentials,
  encrypt them using Q7-approved key custody; don't put them in audit/outbox.
- `GET /api/auth/session` and `GET /api/auth/csrf` are **proposed**, no-store,
  same-origin/allowlisted credentialed CORS only, returning safe state/CSRF nonce,
  never bearer/refresh credentials. A CSRF nonce can be JavaScript-readable;
  an authentication credential cannot. No nonce in query strings or logs.
- Require constant-time nonce verification plus exact Origin on POST/PUT/PATCH/DELETE,
  including refresh, logout, profile, OCR multipart, AI and future admin endpoints.
  Missing/`null` Origin rejects for browser unsafe routes by default. If a browser
  compatibility fallback is necessary, explicitly approve strict HTTPS Referer-origin
  validation; non-browser clients need a separate explicit contract, not an exemption.
- Login has a pre-auth CSRF session/challenge and Origin check; otherwise login CSRF
  can bind a victim to an attacker's account. OIDC callback is a narrow exception to
  unsafe-origin rules only with one-use state/nonce/PKCE. Prefer GET code callback
  compatible with Lax; cross-site POST callback requires a reviewed short-lived
  correlation-cookie design, not changing all session cookies to None blindly.
- Rotate session handle at authentication/elevation; invalidate predecessor with
  bounded concurrency semantics. Revoke server state on logout; clear cookie using
  the same name/host/path attributes. Browser removal alone is not revocation.
  Preserve exact-session idle/absolute expiry and Track B's stale-response guards;
  HttpOnly cookies do not eliminate cross-account asynchronous UI races.
- Define multi-tab behavior: same-origin cookies share identity across tabs, unlike
  current tab-local tokens. Notify tabs of session change with non-secret signals,
  clear old PHI, cancel stale work and require current-session confirmation. Never
  replay an old account's clinical write after login/switch/refresh.

CSRF controls do not prevent XSS from making authenticated same-origin requests.
Keep CSP/output encoding and no-store; never cache PHI in a service worker. Test
Secure attributes over real local HTTPS, not by disabling Secure to make tests pass.

## Negative acceptance specs — NOT RUN / controls absent

| ID | Real-browser / API scenario | Required result |
| --- | --- | --- |
| H3.1 | Inspect login/refresh bodies, JS storage and `document.cookie` | No auth/IdP tokens or session handle exposed to JS; Secure/HttpOnly/host/path/SameSite match chosen topology. |
| H3.2 | Evil-site and sibling-site form, JSON and multipart requests; missing/wrong/replayed cross-session CSRF; `Origin: null` | 403 before mutation/provider call; no PHI via CORS, no reflected credentials. Test login/logout/refresh too. |
| H3.3 | HTTP ingress, forged forwarded protocol/host, direct backend bypass | Redirect/reject per approved ingress; never downgrade Secure or trust attacker forwarding headers. |
| H3.4 | OIDC state/code replay, invalid callback origin/method, third-party cookies blocked | No login/assurance bypass or fallback to sessionStorage; explicit recoverable unavailable UX. |
| H3.5 | Concurrent refresh/logout/account switch in two tabs; stale response sets state after a newer login | No old identity resurrection, no old write under new identity; completed logout invalidates server authorization. |
| H3.6 | Session fixation, CSRF nonce bound to other session, logout cookie deletion | Fresh login handle, reject mismatched nonce, exact cookie expiry and server revocation verified. |

## Rollout and rollback

Approve an exact origin/proxy/callback diagram, then implement server session + CSRF
before migrating browser transport. Rehearse HTTPS and supported browsers under A/B/C
as selected. Drain in-flight work and require re-login; remove legacy browser tokens
without copying PHI. Do not support a silent browser Bearer fallback that bypasses
the new assurance/CSRF policy. Any temporary non-browser Bearer bridge needs explicit
scope, expiry, audit and owner approval. Update Track E grants for any new storage.

Rollback to a cookie-capable compatible release or maintenance; don't restore old
JS-readable tokens to regain availability. Preserve session revocation/assurance
state and clinical writes. Define changed multi-tab UX before workforce cutover.

## Unblocking evidence

Owners approve A/B/C, exact domains/proxy trust, cookie attributes, SSO callback,
CSRF/non-browser rules and multi-tab/session limits. H3 must pass on actual HTTPS
ingress and supported browsers; Q2 assurance and Q7 infrastructure evidence required.
No cookie implementation or production topology was activated by this ADR.

# Historical secret findings — K triage

> **Current status — 2026-09-23: HISTORY SCAN PASS, rewritten advertised history only.**
> See [authorized remediation and evidence](history-remediation-20260923.md), which
> supersedes the historical gate FAIL below without changing its recorded facts.
> Revocation is **owner attestation, not provider-verified**. Old-commit API lookup
> still returned **HTTP 200**; GitHub cleanup and retained-copy risks remain unwaived.
> Hosted Security succeeded; Verify was in progress at handoff, not a final PASS.
> **Q1–Q7 production gates remain open**: the selected synthetic-pilot design is
> approved, **not implemented or accepted**. No production/ePHI authorization.
> All following findings and statuses are the preserved, dated historical report.

Scan session: **2026-09-20**. Owner: **SECURITY IMPLEMENTER K / triage coordinator**.
Scope: one new documentation file; no credential, application, workflow, ignore-rule,
Git index, commit, remote, or history changes.

## Disposition

**Security readiness BLOCKED; history-secret gate FAIL (scanner exit 1).**
Eight reported locations contain **two distinct values**, not eight distinct credentials:

- **Two Google-key-shaped exposures, one repeated value:** historical exposure
  confirmed; credential authenticity, validity, restrictions, ownership, use and
  revocation are **UNKNOWN**. Requires credential-owner/security review. A shape
  match alone does not establish that Google ever issued or accepted the value.
- **Six truncated JWT documentation examples, one repeated value:** all six are
  demonstrably incomplete as compact JWTs as written. This is a structural triage
  classification, **not authorization to suppress findings or mark the scan passed**.
- Independent K evaluator: **UNAVAILABLE / PENDING MAIN assignment or metadata
  review**. These are implementer observations, not independent sign-off.
- Other local verification may continue. Its success cannot clear this security
  blocker. This report makes **no HIPAA-breach or other legal determination**.

## Scanner evidence and provenance

Main supplied the completed, pinned Gitleaks **8.30.1** history scan and exit **1**.
K did not rerun it. The retained log independently confirms **51 commits scanned**
and **8 findings**. The invocation requests all local refs with `--log-opts=--all`.

External evidence locations (not copied into the repository):

```text
report: /tmp/medapp-orchestrator-security-20260920/history-redacted.json
log: /tmp/medapp-orchestrator-security-20260920/history-scan.log
```

| Evidence | SHA-256 |
| --- | --- |
| Pinned scanner image | `c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f` |
| Redacted report, 7,682 bytes | `5552e73118497ccf36ca53354e6b003de999beeca86cb38a13723d78fc7e85ed` |
| Scanner log, 192 bytes | `f6920c8e0099208b4004bfd2ed56908baae636376bc18ede78fadc6255a3dba6` |
| Scanner invocation below, UTF-8 without trailing newline | `565d1ad71c0c796133aad4e30ac30b607239c4de490270c6e952e11684c07330` |

Recorded invocation, **not executed by K**; digest excludes the original shell's
output redirection and subsequent metadata-printing commands. The working directory
was the repository root. It intentionally preserves scanner exit **1** on findings:

```sh
docker run --rm --read-only --cap-drop=ALL --security-opt=no-new-privileges --network=none --tmpfs /tmp:rw,noexec,nosuid,size=64m --env GIT_CONFIG_COUNT=1 --env GIT_CONFIG_KEY_0=safe.directory --env GIT_CONFIG_VALUE_0=/repo --volume "$PWD:/repo:ro" --volume /tmp/medapp-orchestrator-security-20260920:/scan ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f git /repo --log-opts=--all --redact=100 --no-banner --exit-code=1 --report-format=json --report-path=/scan/history-redacted.json
```

At K's metadata check, HEAD was
`724080a179010e4c6d0903ceaf10dc7ecbe4d009`; Git counted **53 reachable commits**
across local refs (**52 non-merge, 1 merge**). This differs from the scanner's logged
51. The cause was not established; main must reconcile scan coverage against its
intended refs/snapshot. Do not relabel the retained scan as a verified 53-commit scan
or claim coverage of remote-only refs, other clones, unreachable objects or forks.

## Sanitized finding inventory

Line numbers below belong to the **specified historical commit**, not today's file.
File links are navigation only. `VALUE-01` and `VALUE-02` are arbitrary equality-group
IDs, **not credential hashes or value fragments**. `Duplicated value` means exact
equality with another reported location, checked internally without printing values.

| ID | Historical file | Historical line | Commit | Scanner type | Value group | Duplicated value |
| --- | --- | --- | --- | --- | --- | --- |
| HIST-01 | [backend/.env.example](../../backend/.env.example) | 8 | `8553de892fc4bbe2f24cc0c56c926dc880de24e5` | `gcp-api-key` | VALUE-01 | true |
| HIST-02 | [docker-compose.yml](../../docker-compose.yml) | 35 | `8553de892fc4bbe2f24cc0c56c926dc880de24e5` | `gcp-api-key` | VALUE-01 | true |
| HIST-03 | [API.md](../../API.md) | 42 | `57771fb7f785557dcbfb7fc94a941497e9a8c41a` | `generic-api-key` | VALUE-02 | true |
| HIST-04 | [API.md](../../API.md) | 43 | `57771fb7f785557dcbfb7fc94a941497e9a8c41a` | `generic-api-key` | VALUE-02 | true |
| HIST-05 | [API.md](../../API.md) | 68 | `57771fb7f785557dcbfb7fc94a941497e9a8c41a` | `generic-api-key` | VALUE-02 | true |
| HIST-06 | [API.md](../../API.md) | 69 | `57771fb7f785557dcbfb7fc94a941497e9a8c41a` | `generic-api-key` | VALUE-02 | true |
| HIST-07 | [API.md](../../API.md) | 81 | `57771fb7f785557dcbfb7fc94a941497e9a8c41a` | `generic-api-key` | VALUE-02 | true |
| HIST-08 | [API.md](../../API.md) | 88 | `57771fb7f785557dcbfb7fc94a941497e9a8c41a` | `generic-api-key` | VALUE-02 | true |

### Classification proof and current-tree comparison

- **VALUE-01 / HIST-01–02:** two equal 39-character values satisfy the full Google
  API-key format check. No truncation marker was present. Exposure of that literal
  in the two historical blobs is confirmed. No exact occurrence was found in the
  eligible current tracked working files or corresponding HEAD blobs checked.
  Absence there does **not** establish revocation, lack of previous use, or safety
  of copies outside that scope. Treat as a potentially real exposed credential
  pending owner review, not a proven harmless fixture.
- **VALUE-02 / HIST-03–08:** six equal 23-character documentation literals contain
  a literal ellipsis, three period characters, and only one nonempty period-delimited
  segment. Each extracted candidate was verified to be the entire quoted token
  literal or entire token following a quoted Bearer prefix, not merely a regex
  substring of a longer token. A complete signed compact JWT needs three nonempty
  base64url segments separated by two periods; these literals fail that structural
  requirement. They cannot be used **as complete JWTs as written**. This does not
  identify any original full token or prove facts about arbitrary opaque-token
  systems. No JWT header/payload was decoded, signature checked, token reconstructed,
  expiration inferred, or authentication attempted. Six exact occurrences remain
  in [API.md](../../API.md), both the working copy and its HEAD blob.

Comparison scope: **76 index-tracked paths**, none reported ignored or excluded by
the sensitive-environment-path filter; **75 existing working files read**, one
missing working path, no symlinks followed. Existing corresponding HEAD blobs were
also compared. Untracked files, ignored environment files, secret directories,
deployed configuration and external systems were **not inspected**. In particular,
the current example environment file was not read merely because its historical
version was a finding. The existence of its link is not a current-content check.
This was exact-value comparison for these two groups, not a new full-tree scan.

## Safe handling and reproducibility boundary

K processed only the three allowlisted historical commit/file blobs using captured
`git show` subprocess output. All historical content stayed inside the local
process: only allowlisted locations, counts, lengths, structural booleans and opaque
equality-group IDs were emitted. Values were hashed internally for equality grouping;
**no credential hashes, token fragments, raw historical lines, or raw files were
returned to the model/tool output or added here**. Subprocess stderr was captured
rather than forwarded. Unexpected locations or ambiguous extraction failed closed.

The report was checked programmatically: every `Secret` field was the redaction
marker, and no Google-key/JWT-shaped value was found in its `Match` fields. Neither
field's contents were printed. No ignored environment files, live secrets, provider
endpoints, production databases or clinical payloads were read or tested. No network
request, credential rotation/revocation, history filtering, allowlist addition,
commit or push was performed by K.

## Owner-controlled incident and remediation plan

1. **Assign accountable owners and preserve evidence.** Main/security must assign
   the repository and credential/project owners; independently review these eight
   locations, equality groups, structural proof, report/log digests and scan scope.
   Keep evidence access restricted; do not paste credentials or raw historical blobs
   into issues, chat, CI artifacts or this document. Record decisions, approvers and
   timestamps without secret values. No independent approval is recorded yet.
2. **Review exposure and permissions.** Authorized owners should establish repository
   visibility and access history, collaborators, forks/clones, CI logs/artifacts,
   releases and cached copies. Establish the Google project/key ownership, enabled
   services, API/application restrictions, quotas, billing exposure and relevant
   IAM permissions through approved administrative access. These are review actions
   for owners, not permission for this agent to call a provider or test the key.
3. **Review provider/access logs.** Authorized security/provider administrators should
   preserve and examine available usage, audit and access logs for the possible
   exposure window and unexpected requests or spend. Determine scope and needed
   escalation from evidence. Missing logs are not proof of no use. Route any
   privacy/notification/legal assessment to the responsible teams; no breach
   conclusion follows from this scanner result alone.
4. **Rotate/revoke only with explicit owner approval.** Record approved scope,
   dependencies, deployment order and rollback/continuity plan. The authorized owner
   performs replacement, secure configuration distribution and old-key revocation,
   then records administrative verification without disclosing values. No such
   operation is authorized or claimed completed by this triage.
5. **Coordinate repository remediation separately.** After containment and explicit
   repository-owner approval, agree how to replace current documentation examples
   with unmistakably non-secret notation and, if approved, clean affected history.
   Preserve required evidence first; coordinate branches, tags, forks, clones,
   caches and downstream consumers before any disruptive rewrite/force-push.
   **Rotation/revocation does not remove old history scanner entries.** Editing
   today's files alone also does not remove the two historical exposures. K has
   not modified examples, rewritten history, committed or pushed.
6. **Reverify without hiding findings.** Rerun the pinned redacted full-history gate
   over explicitly documented refs/snapshot after authorized remediation; reconcile
   commit counts and retain sanitized exit/result evidence. The six structurally
   truncated examples still remain scanner findings until explicitly reviewed and
   remediated; their classification is not a gate waiver. Obtain independent/main
   metadata review and owner closure. Additional unknown findings must be triaged,
   not automatically ignored.

## CI and release handoff

The existing [security workflow](../../.github/workflows/security.yml#L22-L32)
contains full-depth checkout, the same pinned scanner digest, all-ref history scan,
`--redact=100` and `--exit-code=1`. K's source check found no `continue-on-error` or
shell failure-swallowing `|| true`/equivalent pattern in that workflow. It was not
edited. Its inspected SHA-256 was
`91687e6c4ee1ea6243468c2e4ca072ccf7df260b97ad431a35732adce925a7ba`.
This is source inspection, **not a hosted-CI run or branch-protection verification**.

**Keep the history-secret gate FAIL until explicit authorized remediation and a
reviewed rerun justify closure.** Do not change the exit code, skip history, add
blanket/baseline/path/value ignores, mask genuine findings, or reinterpret the
truncated-example classification as a passing scan. Main owns required-check/branch
protection confirmation and the independent metadata review. Other local tests may
proceed, but neither their results nor this documentation unblock security readiness.

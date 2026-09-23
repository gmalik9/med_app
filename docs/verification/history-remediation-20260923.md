# Authorized history remediation — 2026-09-23

**HISTORY SCAN PASS — scoped to the rewritten, advertised repository history.**
This supersedes the earlier history-secret gate FAIL for that scope only; it does
not erase the [historical findings](history-secret-findings.md) or certify complete
GitHub erasure, provider revocation, production readiness or real-ePHI use.
**Residual copies remain an unwaived risk.** The owner explicitly attests that the
historical Google key was revoked and authorized the affected-branch history rewrite
and force-push. Revocation is **owner attestation, not independent provider
verification**; no key was tested, rotated or revoked by this remediation.

Provenance: completed execution/evaluation facts supplied by MAIN, including the
independent HISTORY receipt and fresh post-push remote-mirror proof. This is a
documentation handoff, not a new execution of those scans. Evidence applies to the
revisions below, before any subsequent documentation commit.

## Completed rewrite and preservation evidence

MAIN completed **one atomic two-ref push with explicit old-OID force-with-lease
checks**, then compare-and-swap synchronized the local branch pointers. No index or
working-tree reset was used. This report does not authorize another rewrite.

| Branch | Original tip | Rewritten tip |
| --- | --- | --- |
| camera | `81c4a64ed97027102bf37d7f959e74055e6ac1d6` | `bf4b70fdd7a91a9911483e58a49d45672b8bc25c` |
| main | `02580943e3ab614a694bc39f83627416d8ed1e67` | `93917775adcbb3f7ba11dc05ddf99eacf0779b4f` |

- **54 commits retained; 53 rewritten, one unchanged.** Topology, authors,
  committers, timestamps and messages were preserved; no commits were pruned.
- **camera: all 235 tracked entries identical**, with unchanged tree
  `2037433c9a434d20fb63533b5b2d9e9590a9da52`. The application/runtime content did
  not change. At the latest main tip, only [API.md](../../API.md) changed: six
  truncated JWT examples were replaced by exact non-secret placeholders.
- The prepared bare repository had **723 stored objects, all reachable**; neither
  of the two removed literal values remained in that object set. This is not a
  claim about every old clone, reflog, stash or backup.
- Independent HISTORY evaluation: **52 checks PASS**, recorded in its private
  receipt. Recovery material and receipts remain outside the publishable repository;
  no secret values, secret hashes, replacement material or recovery attachments are
  included here.
- Fresh remote mirror after the push: **fsck PASS**, both new heads verified.
  Pinned **Gitleaks 8.30.1**, stock rules, no exceptions, all-ref history, full
  redaction and no scanner network access: **54 commits / 2.71 MB / zero findings /
  exit 0**. No ignore, false-positive prefix or failure suppression was added.
- Remote advertisement showed **default HEAD main**, with no advertised tags or
  pull-request refs. Advertisement and a fresh mirror do **not** prove absence of
  hidden refs, unreachable server objects, cached views or forks.
- Live ignored secrets/configuration, databases and containers were untouched.
  The local stash was deliberately retained, not inspected or applied. Old local
  objects, reflogs and private recovery copies were not automatically purged or
  garbage-collected.

## Hosted checks at documentation assignment

| Evidence | Observed status | Limit |
| --- | --- | --- |
| [Security run 35912411152](https://github.com/gmalik9/med_app/actions/runs/35912411152) | **Conclusion: success** | Hosted result for the rewritten camera tip; not proof of removal from all GitHub storage. |
| [Verify run 35912411195](https://github.com/gmalik9/med_app/actions/runs/35912411195) | **In progress at handoff** | No final PASS claimed; MAIN must check completion and the later documentation commit's checks. |

Earlier hosted failures and historical local PASS tables retain their original
dates, counts and meaning. A documentation-only candidate check is not a replacement
for hosted Verify, a full application release gate or a production authorization.

## Unwaived residual exposure and copy risks

After the rewrite, a status-only GitHub commit API request for old commit
`8553de892fc4bbe2f24cc0c56c926dc880de24e5` returned **HTTP 200**. No response
contents were printed. **Old-object lookup/cached accessibility remains; GitHub
erasure is not complete or established.** A successful reachable-history scan
does not contradict this observation or clear it.

GitHub Support follow-up is needed from the owner. No external contact was
authorized or submitted. Hidden/server refs, cached commit/diff views, forks,
collaborator clones, logs/artifacts and downloaded copies remain outside the clean
mirror's proof. Revocation attestation does not prove absence of prior use or
complete deletion; any provider usage/incident review belongs to authorized owners.

Local `refs/stash` at `b165d3b7ba75b2477a9feb40797655678ab9ef2f`, reflogs, old
objects and private recovery copies may retain the old history. The recovery parent
is mode **0700**, with recovery files **0600**; this restricts access, not retention
or erasure. Do not publish/upload them, restore their refs to the remote, or treat
them as covered by the passing fresh-mirror scan. Retention or deletion requires
separate owner review; no automatic stash deletion, reflog expiry or GC is advised.

Historical documentation intentionally still cites original commit IDs. These are
no longer reachable from the rewritten advertised heads and may fail to resolve or
resolve through cached/unreachable lookup. They are provenance identifiers, not
current ancestors. Do not substitute new IDs into old evidence or fabricate a new
graph for historical runs. No old sensitive-source page is linked here.

### Sanitized GitHub Support draft — owner review only, NOT SUBMITTED

Submit only through the [GitHub Support portal](https://support.github.com/), after
separate owner authorization. Suggested metadata and request:

> Repository: gmalik9/med_app. On 2026-09-23, the owner-authorized remediation
> atomically replaced camera and main using explicit old-tip leases (mapping above).
> The owner attests revocation of the historical Google credential; this has not
> been independently provider-verified. A fresh mirror passes fsck and a pinned,
> fully redacted all-ref secret scan (54 commits, zero findings). Nevertheless,
> status-only lookup of old commit 8553de892fc4bbe2f24cc0c56c926dc880de24e5 still
> returned HTTP 200 after the push. Please assess retained cached views and
> inaccessible-to-client refs/objects, perform eligible sensitive-data cleanup,
> and confirm the scope and limits of removal and any further owner action needed.

Owner checklist: include the branch mapping, rewrite date, observed HTTP status and
safe scanner counts; the original first-changed commit is
`57771fb7f785557dcbfb7fc94a941497e9a8c41a`. Ask Support to identify any additional
affected refs/fork coordination it requires. **Do not attach credentials, credential
hashes, raw historical blobs, replacement files or recovery bundles.** Record a
sanitized ticket outcome and recheck accessibility before claiming cache cleanup;
do not treat a submitted request as completed removal.

## Safe collaborator re-clone / resynchronization

1. **Back up uncommitted work first**, including needed untracked files, to a private
   access-controlled location outside the repository. Treat patches/backups as
   potentially sensitive. Do not upload them or assume a clean working tree; preserve
   the old clone until local work and evidence-retention needs are reviewed.
2. Prefer a **fresh clone into a new, unused directory** from the existing repository
   URL. Select camera explicitly for ongoing camera work; the remote default is
   main. Verify the branch against the rewritten tip above, or a later MAIN-approved
   descendant if a normal documentation commit has since landed. A later descendant
   must contain the rewritten tip, not the old history.
3. **Do not pull/merge old and rewritten histories together, force-push an old
   branch, push all refs/a mirror, or apply/pop/merge an old stash into the new
   baseline.** Preserve the old clone/stash privately for review. Existing-clone
   resynchronization needs a reviewed local-work inventory and an explicit ref plan;
   no blanket reset, clean, stash deletion or reflog/GC command is safe to prescribe.
4. Port only individually reviewed, sanitized changes onto a branch based on the
   fresh rewritten history. Prefer reviewed file-level edits; do not import old
   refs, bundles or unreviewed commits. Scan candidate changes before a normal push
   and have MAIN review their ancestry. Do not copy ignored live credentials into
   tracked files or reuse historical credentials.
5. Collaborators/fork owners must coordinate the same migration and review their
   retained copies. Re-cloning avoids importing old refs; it does not remove old
   copies elsewhere. Any later cleanup requires separate approval and preservation
   of uncommitted work and required evidence.

## Production boundaries and approved pilot design

The [approved synthetic pilot scope](../decisions/APPROVED_PILOT_SCOPE.md) remains
the design authority. Its older pending-key/rewrite statements are superseded only
by this dated remediation evidence, not by a claim that pilot controls were built.
**Selected pilot design approved; implementation and acceptance NOT IMPLEMENTED /
PENDING. Q1–Q7 production gates remain open**, including:

- **Q1–Q3:** enforced clinic isolation/roles; invitation-only universal TOTP and
  controlled recovery; same-origin HttpOnly cookies/CSRF and actual HTTPS verification.
- **Q4–Q6:** durable fail-closed disclosure audit; every committed note version,
  disabled application export and retention controls; UTC new instants with calendar
  dates preserved. Signing/finalization is deferred; legacy-time conversion is not
  approved. No signing/runtime change is made here.
- **Q7:** actual provider/contracts/security controls, encrypted backup/key custody,
  no automatic expiry and a demonstrated restore meeting the selected objectives.
  External services remain disabled under the pilot design; provisioning and real
  clinical use are not authorized by this history result.

Existing databases must be preserved; the selected pilot requires a new empty
isolated synthetic target. Neither scan success nor owner revocation attestation is
production/ePHI authorization or HIPAA certification. MAIN owns staged-candidate
scanning, the subsequent normal documentation commit/push and final hosted checks;
this documentation implementer does not stage, commit, push or contact Support.

## Documentation-only validation

Node **22.23.2** focused checks: **29/29 PASS** (5 root-guide contracts, 13 link-safety
cases, 11 publication/privacy cases), zero failed/skipped/todo. Structured candidate
secret-pattern check: **zero matches**, not a new history scan. All five changed
documents' **123 local links** passed the existing publishable-target checks; three
external links were classified without network access. The four historical report
bodies were verified byte-for-byte unchanged after removing only the new banners.
No editor errors or diff whitespace errors; HEAD unchanged and nothing staged.
No application build, DB/container operation or full release suite was run here.
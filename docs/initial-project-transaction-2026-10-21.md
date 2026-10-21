# T-1108 — Atomic first-save server checkpoint

Parent `ae656da2b4acb627de91565e3323a16f3f1b8c72`.
Branch `codex/T-1108-initial-project-transaction`.
Runtime `370fd41942afbcef53839a96c751f2a3c49d93d2`;
gate-contract repair `1ab22399626688b8432858900e21ed8b0329c7eb`.

This is the server prerequisite for crash-safe creation, not completion of
T-1108. The iPhone client still uses two requests until its durable creation
intent and response binding are wired. Do not deploy or label the phone fixed
from this checkpoint. Production hold remains unchanged.

## Reproduction and root-cause repair

VERIFIED parent route reproduction: **0 pass /4 fail**, 68 unselected cases,
Node20.20.2. A collection upsert ignored the initial draft; changed intent got
an update acknowledgement; failed persistence left empty metadata in the live
owner; missing durable creation identity was accepted.

Extend the existing authenticated collection route and canonical
`commitScreenplayOwnerMutation` transaction, including CAS/ambiguous-commit
reconciliation. Do not create a second store, auth scheme or retry lock.

- Metadata and first version become visible together, only after persistence.
- Exact UTF8 draft bytes are stored, not whitespace/Unicode normalized.
- Durable owner-scoped project/request IDs allow restart-safe replay. A domain-
  versioned SHA256 covers the project ID and normalized metadata plus raw draft.
- Same intent returns the same version without another write. Changed intent,
  a reused project ID or a superseded initial version fails closed with409.
- A replay does not reactivate or roll back a newer project/version.
- Existing metadata-only callers retain their route/shape. The opt-in parser
  limit matches the existing version-save limit (2MiB).
- Extract one shared version record/normalizer used by ordinary saves, initial
  saves and restored storage. `index.js` shrinks19 lines,33557→33538.

## Additive contract — next client must actually use this

`POST /screenplay/projects`, ordinary authenticated headers, body:

```json
{
  "project_id": "persisted-client-generated-project-id",
  "title": "The Reel",
  "phase": "scene_draft",
  "activate": true,
  "initial_draft": {
    "draft": "exact original screenplay bytes",
    "client_request_id": "persisted-creation-request-id",
    "source": "studio_initial_create",
    "notes": "Initial Studio draft"
  }
}
```

Project ID ≤64 characters; request ID ≤96, both required/nonblank. Draft must
be a nonblank string, preserved verbatim. Source/notes are optional. Unknown
initialization metadata is rejected rather than silently dropped. The hash is
internal storage evidence, not a client-supplied authorization boundary.

- 201: created, project/version IDs plus full project and initial version.
- 200: replayed, same project/version IDs and bytes; no mutation.
- 400: missing/invalid identity, blank draft or unsupported initial metadata.
- 401: unauthenticated. All ownership resolves server-side.
- 409: `screenplay_initial_request_reused` or
  `screenplay_initial_request_superseded`; never overwrite to make retry pass.
- 503: persistence failed/unknown; no success acknowledgement.

Without `initial_draft`, existing metadata-only behavior is unchanged. Old
two-step callers are not magically crash-safe and historical empty projects
are not repaired or deleted by this change.

## Proof ledger

- New/legacy handler cohort **72/0/0** under Node20.20.2.
- Actual-backend restart/raw-version/store cohort **64/0/0**. Initial-create
  integration kills only its own backend child after a committed request,
  restarts on the same durable data, retries the discarded receipt, verifies
  exactly one project/version and original CRLF/NFD/trailing whitespace. A
  later ordinary version survives late initialization replay; two authenticated
  writers using the same project ID stay isolated.
- First full run **2776 pass /12 fail /2 skip**. Nine failures came from the
  read-only proof mount lacking writable `backend/data/persistence`; one stale
  redirect lint required71 duplicate HTTP calls after consolidation reduced
  direct calls to46; two save-evidence fixtures emitted2 cases while the real
  runner now requires3. Retain that failed run, do not call it green.
- Replace the obsolete count floor with a reviewed five-file transport
  inventory while retaining delegate validation on every request. Derive fake
  Xcode summaries from actual requested identifiers, and assert all three
  required recovery identifiers explicitly. No runtime guard, required case,
  failure/skip check or native test is removed or loosened.
- Corrected focused cohort **87/0/0** (includes the held-transaction visibility
  case). Final full **2911 pass /0 fail /2 skip**, Node20.20.2, all47 suites.
  Skips are the live Postgres prefix query without DATABASE_URL and the existing
  skipped talk page-write preview-header case. No skip was added here.
- Final source `/tmp/them-1108-verified-server-source.juGduC/source`; all8 changed
  source/test files byte-match it. Syntax and diff checks pass. D009 exact-parent
  index33538(-19); Studio17337, Root14959, bridge12872, MemoryAPI10553(all0).
- One preliminary container invocation failed before tests: missing dependency
  mount-point under a read-only source mount. Corrected the disposable snapshot;
  the actual red reproduction is the0/4 result above, not that setup failure.
- Source frozen without .env, release inputs, signing material or keys. Node
  container external network disabled, source/dependencies read-only, generated
  `backend/data` on an ephemeral writable mount. No paid provider calls.
- No Swift changed. Inherited signed902/0/0, recovery UI1/0/0, writer UI1/0/0
  and macOS0 belong to T-1111; not fresh native tests of a client first-save fix.

Permanent source archive, red/green logs, gate, source comparison and GitHub
receipt: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1108-server-20261021.hMERcR/`.

## Exact files and adversarial scope

- `backend/index.js`: delegate stored-version normalization to the shared owner.
- `backend/lib/screenplay_project_initialization.js`: atomic first-save contract.
- `backend/lib/screenplay_version_record.js`: shared record builder/normalizer.
- `backend/lib/screenplay_projects_routes.js`: opt-in wiring, legacy factory reuse.
- `backend/tests/screenplay_initial_project.integration.test.mjs`: actual server,
  restart, concurrent/lost-receipt replay, exact bytes and owner namespace.
- `backend/tests/screenplay_projects_routes.test.mjs`: first-save/error boundaries.
- `backend/tests/ios_http_redirect_boundary_contract.test.mjs`: transport inventory.
- `backend/tests/screenplay_save_evidence_contract.test.mjs`: actual case selection.
- `TASKS.md` and this report: continuation/evidence. No native files changed.

Answered for this contract: concurrent retry; changed payload/metadata;
failed/delayed commit; lost receipt after an acknowledged commit and abrupt
backend restart; replay after a newer saved version; actual authenticated
owner isolation. The canonical transaction still owns CAS and tombstones.

Not covered: physical-phone/app-kill recovery; durable client intent; explicit
new-project versus edited-page semantics; repairing/deleting historical orphan
metadata; live Postgres/service rollback; production deployment; paid models.
The backend checkpoint cannot establish those client or operational outcomes.

No main merge or original PR head changed. Save only by scoped commits and a
normal fast-forward of the existing authorized backup branch; the proof folder's
GitHub receipt records the actual head and hosted-check availability, not assumed
CI green. Production/App Store-credentials hold remains in place.

## Required client follow-through

Persist a stable creation intent before HTTP in the existing owner-scoped
recovery capability. Bind account/login intent, backend origin and an actual
document identity, not just a text hash. Distinguish a deliberate new project
from an edited unbound page. Preserve original creation bytes and any newer
manual edits through interruption; never replace them with an old receipt.
Explicit `createProject()` currently trims `fountainDraft` into `seededDraft`;
use trimming for eligibility only and save the original bytes. Preserve
intentional empty/title-only creation without manufacturing filler text to pass
the nonblank initial-draft contract. Audit unbound-journal equality against UTF8
identity rather than assuming Swift's canonical String equality preserves bytes.
Wire auto-promotion and explicit creation to the atomic contract, without a
silent fallback to the unsafe two-step path. Bind the real returned version
only to the initiating current document; reconcile lost receipts on relaunch.
Prove app kill/relaunch and one-project semantics against the actual backend,
then signed units, essential UI, macOS and D009. T-1112 remains queued after it.

Copy-and-paste continuation: T-1108 server prerequisite is verified at370fd419
(parentae656da, gate repair1ab2239). New opt-in POST /screenplay/projects
initial_draft commits metadata+version using canonical owner CAS, preserves exact
bytes and replays stable IDs once. Node20 final2911/0/2, focused87/0/0,
actual restart/store cohort64/0/0. Index-19/other god deltas0. Native unchanged;
inherited902 units/2 UI/macOS are not fresh creation-client proof. Client still
uses two requests: next persist owner/origin/document-bound creation intent in
the canonical recovery capability, wire both creation paths to this contract,
and prove app interruption/relaunch without duplicates or lost manual edits.
Keep orb/Clementine; no paid calls, main merge, deploy or completion claim.

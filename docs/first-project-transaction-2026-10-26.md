# T-1167 — Atomic first-project server checkpoint

October 26, 2026. Branch `codex/T-1167-first-project-transaction`.
Parent `f7ebad7c550c328f36ae9bfb0f7d30bfa50a816d`.
Current reproduction `0d8e85e6d10469363b1cfcf3d739a7988175b464`;
runtime `77da2e6f4ef21066d18a743de55f3fffe2e8f087`.
This server prerequisite is complete locally. The overall product goal and
iPhone durable-creation follow-through remain incomplete. Production is held.

## 1. Completed and root issue

VERIFIED current handler reproduction **0 passed / 5 failed**, with 68 existing
cases unselected by the diagnostic name filter. The collection upsert ignored
the first draft, accepted changed creation intent, exposed empty metadata when
persistence failed, accepted missing durable identity, and completed before its
transaction gate. Keep the original red evidence, not only the green result.

Reuse preserved canonical `370fd41942afbcef53839a96c751f2a3c49d93d2`; all six
implementation/test files byte-match that reviewed commit. Extend the existing
authenticated owner transaction and its CAS/ambiguous-commit reconciliation.
Metadata and exact first version publish together only after persistence.
Stable owner-scoped project/request IDs and a domain-versioned hash make retries
idempotent. Original CRLF, decomposed Unicode and trailing whitespace remain
verbatim. A changed intent or superseded initial version fails closed with409.
No second store, transaction lock, authentication boundary or HTTP framework.

The opt-in `initial_draft` body uses the existing collection route. Existing
metadata-only callers keep their behavior. The parser's2MiB limit matches the
version-save limit. Share the stored version record/normalizer with ordinary
saves so restart retains the internal initialization hash. `index.js` shrinks
19 lines instead of gaining another persistence implementation.

## 2. Verification

- Fresh signed-unit rerun: **not run**, because no Swift, project or UI source
  changed. Parent T-1166's **850/0/0** is inherited evidence, not a new result
  or proof that the phone now uses atomic first creation.
- Focused current handler/store/raw-version/restart cohort: **137/0/0** under
  Node20.20.2. Actual authenticated integration abruptly terminates only its
  disposable backend child, restarts on the same durable data, and retries a
  discarded receipt. One project/version and exact bytes survive. Concurrent
  retry, later-version refusal and two real authenticated owner namespaces
  using the same project ID are checked.
- First full run: **2874 passed / 7 failed / 2 skipped**, 47 suites. The seven
  failures were generated shell/Apple-tool fixtures blocked by this task's
  non-executable Docker `/tmp` mount. Retain this failed run. Do not change
  application code, assertions, required cases or retry timing to hide it.
- Correct only that disposable mount to `/tmp:rw,exec`. The two affected
  harness files then pass **19/0/0**. Final full `npm test`, same frozen runtime:
  **2881 passed / 0 failed / 2 skipped**, 47 suites, exit0. Counts describe this
  current prefix, not the older canonical branch's different full total.
- The existing skips remain: live Postgres prefix query without DATABASE_URL;
  existing skipped talk page-write preview-header case. No new skip added.
- Containers have external network disabled, read-only public source and
  dependencies, isolated writable fixture data and no private environment or
  release inputs. Existing proof image runs Node20.20.2. No paid model call.
- D009 against the actual fetched parentf7ebad7: index **33,557 -> 33,538(-19)**;
  Studio **17,345**, Root **14,953**, bridge **12,864**, Memory API **10,553**, all
  other deltas0. Syntax checks and `git diff --check` pass. An initial unsupported
  environment variable fell back to main; the proper parent comparison then
  failed closed on its missing tracking ref. Fetch the exact parent and retain
  the corrected passing comparison, without a gate exception or padding.

## 3. Adversarial disposition and compatibility

Answered for this server contract: changed draft/title under a reused identity;
concurrent retry; missing identity/blank draft; failed and delayed persistence;
lost acknowledgement after commit; abrupt server restart; exact stored bytes;
late initialization after a newer version; authenticated owner isolation.
Ordinary metadata-only/version route cohorts remain green.

Not covered: iPhone app-kill recovery, durable client intent, newly typed words
while a receipt is held, physical microphone/reply relevance, real Postgres
deployment, collaborator authorization, historical orphan repair/deletion,
power-loss/fsync guarantees, shipping backend or physical-phone proof.

The current client still makes separate metadata/first-version calls. Do not
claim this server checkpoint fixes that phone path. Next reuse canonical
`2b51d72`: dedicated additive initialization endpoint, immutable client intent
in the existing draft-save outbox, durable receipt, guarded page binding and
connected Finish setup action. No unsafe fallback to two requests.

## 4. Exact changed files

- `backend/index.js`: delegate stored-version normalization.
- `backend/lib/screenplay_project_initialization.js`: atomic creation contract.
- `backend/lib/screenplay_version_record.js`: shared version record owner.
- `backend/lib/screenplay_projects_routes.js`: opt-in wiring/shared factory.
- `backend/tests/screenplay_projects_routes.test.mjs`: five actual handler cases.
- `backend/tests/screenplay_initial_project.integration.test.mjs`: authenticated
  restart, lost receipt, concurrent retry, exact bytes and owner isolation.
- `TASKS.md` and this report: scoped task, proof and remaining boundary.

## 5. GitHub and retained evidence

Use only a normal scoped backup push, preserving every original commit and PR.
No main merge, original647 advancement, replacement PR, review/protection bypass,
force/squash, deployment, DNS, secret or accepted-decision change. Publication
and final remote refs are recorded separately in the proof folder; publishing
this branch does not prove hosted CI or shipping readiness.

Permanent folder:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1167-20261026.l42vfZ/`.
Contains the actual red, first failed full, corrected harness and final full
logs, public source snapshots, corrected offline proof recipe, image identity,
D009 comparisons and SHA256 readback verification. No private env file copied.

## 6. Next active task

Port the preserved durable first-creation client capability `2b51d72`, adapting
its UI fixture to the current dedicated-backend configuration owner. Reproduce
the interrupted committed-first-save/newer-edit/relaunch boundary and retain
exact words, IDs and version counts. Then integrate interrupted talk enqueue
reconciliation `c1e9255`. Original647 remains held until its safety chain passes.

## 7. Continue status

READY FOR CONTINUE. Overall product goal active and incomplete. No physical-
phone, live provider, external screenplay export, integrated-main or release
completion claim follows from this server result.

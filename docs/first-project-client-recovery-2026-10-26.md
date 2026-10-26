# T-1168 — Connected iPhone first-save recovery

October 26, 2026. Branch `codex/T-1168-first-project-client`.
Parent `5b0049d9d1dda985972e8c7bcc6bb1875cc16373`.
Current UI reproduction `d50344b`; runtime `a846dc3`.
Overall product goal remains active; production and original647 remain held.

## 1. Completed and root issue

VERIFIED actual signed iPhone simulator reproduction **0 passed / 1 failed /
0 skipped**. While the real successful metadata response was held, the backend
contained an empty project with **zero first versions**. The old client used
separate metadata and version requests. The test's first-version-count failure
is retained with its source location. This current red establishes the missing
first draft; do not relabel it as the historical newer-text-overwrite failure.

Reuse preserved canonical `2b51d72` through the existing draft-save outbox,
request ownership/HTTP helpers, bridge journal and local recovery slots.

- Persist immutable original draft bytes, stable project/request IDs, owner,
  backend origin and document UUID before HTTP. Newer edits resume the same
  setup; deliberately different documents retain separate identities.
- Use additive `POST /screenplay/projects/initialize`, backed by T-1167's
  existing owner transaction. A missing capability fails with local work kept;
  there is no fallback to separate unsafe metadata/version requests.
- Validate the returned project, version identity and original raw draft.
  Persist its receipt before binding; recheck account/login, backend, document,
  selected page and exact bytes across suspension and publication.
- Preserve newer manual text in the target recovery slot before binding.
  The original receipt acknowledges only the original draft. Startup project
  list hydration waits while that document's first setup remains unresolved.
- Show a connected **Finish setup** action. Save now resumes the same intent,
  then saves newer edits through the ordinary version outbox. Initial entries
  cannot drain as ordinary versions. Intentional blank/title setup keeps the
  existing metadata-only route; it is not a failed atomic-save fallback.
- Preserve raw bridge adoption and unbound journal bytes, including decomposed
  Unicode, CRLF and trailing whitespace. Share the project-write capability
  instead of duplicating another auth/client/store implementation.

## 2. Verification — final runtime a846dc3

- Same previously failed interrupted-creation UI **1/0/0**: actual first draft
  commits while the reply is held; type newer native edits, terminate, restore
  actual disk state without reseeding, release the resumed receipt, retain one
  project/one original version and dirty newer text, save the edit once, then
  relaunch with exactly two versions and exact newer bytes. Assertions and
  deadlines unchanged. Provider fixture ASR/chat/TTS **0/0/0**.
- Full signed native units **859/0/0**, erased task-owned simulator
  `91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A`, iPhone17Pro/iOS26.2 (23C54), normal
  signing. New cases cover durable initial identity/bytes, document distinction,
  owner/origin refusal, receipt persistence, title conflict, missing-endpoint
  refusal, checked headers and raw bridge adoption.
- Explicit named-project UI **1/0/0**: actual authenticated source selection,
  clone exact CRLF/NFD/trailing bytes into one initial version, leave the source
  version unchanged, then relaunch the named project. Providers **0/0/0**.
- Existing blank-project writer UI **1/0/0**: actual Create, typing, keyboard
  Save, saved version and restored draft. Provider fixture ASR/chat/TTS **0/1/0**.
  T-1169's source audit clarifies that its export assertion receives a DEBUG-
  made local Markdown artifact, bypassing backend export. It does not prove
  the production export path, native Files Save or external screenplay opening.
- Raw-audio Home -> formatted page -> one project/save -> restored draft UI
  **1/0/0**, intercepted ASR/chat/TTS **1/2/1**. Not real microphone, audible
  reply, live model quality or paid-provider evidence.
- Actual authenticated offline/refresh/conflict recovery UI **3/0/0**. Exact
  queued text survives termination/reconnect; conflict choice resolves once;
  real local save401 -> refresh200 -> returned-bearer save201 occurs once and
  survives another relaunch. Seven final UI cases total; no skips.
- Full Node20.20.2 `npm test` **2882 passed /0 failed /2 existing skips**, 47
  suites, exit0. External network disabled, public source/dependencies read-
  only, isolated writable fixture data and executable temporary command
  fixtures. Existing skips: live Postgres prefix query without DATABASE_URL;
  skipped talk page-write preview-header case. No new skip or paid call.
- Proof barrier cohort **3/0/0** under pinned Node20: old creation and new
  initialization/replay responses are held after the actual server commit.
- macOS desktop scaffold **BUILD SUCCEEDED**, exit0. Existing concurrency and
  deprecation warnings remain; no macOS UI or warning-free claim.
- D009 against exact fetched parent5b0049d: Root **14953 -> 14933(-20)**,
  bridge **12864 -> 12852(-12)**, Memory API **10553 -> 10463(-90)**; index
  **33538** and Studio **17345** unchanged. An initial missing parent tracking
  ref failed closed; fetch it and retain the corrected passing comparison.
  Syntax and diff checks pass; no gate waiver or line padding.

Native proofs ran serially on the same frozen runtime, erasing only the owned
simulator. Backend proof used its immutable public source snapshot. No repeated
unchanged full-unit/backend runs, private environment reads or release inputs.

## 3. Integration decisions and adversarial disposition

Keep this prefix's existing first-active ordinary queue selection and queued
hydration regression; add only initialization exclusion and the canonical
creation methods. Do not overwrite that policy with a later prefix's last/
parked selection rule. Adapt Root's existing one-line guard and insert the raw
adoption test without replacing existing recovery cases. Append the two new UI
allowlist entries so the default Home proof's first two selections stay intact.
The current dedicated-backend configuration worked unchanged; no speculative
configuration layer was added. Preserve the existing native Files helper.

Answered for this boundary: interrupted successful first commit; stable replay
identity; newer manual edits and real relaunch; exact raw bytes; explicit named
creation versus source project; blank creation; login/backend refusal; missing
atomic endpoint; receipt-before-binding; ordinary version/recovery regressions.

Not covered: power-loss/fsync guarantees, historical orphan cleanup, deliberate
blank-setup crash idempotency, interrupted multi-file talk enqueue, real Postgres
deployment/collaborator authorization, real microphone/model/audible quality,
physical iPhone, external screenplay-file opening or integrated-main proof.
T-1112's preserved `c1e9255` addresses the next queued-body/index/settlement
boundary and adds the existing redirect guard to that live queue transport.

## 4. Exact files changed

- `backend/evals/promotion_delay_proxy.mjs`
- `backend/evals/run_home_voice_handoff_ui_smoke.mjs`
- `backend/lib/method_not_allowed_routes.js`
- `backend/lib/screenplay_projects_routes.js`
- `backend/tests/method_not_allowed_routes.test.mjs`
- `backend/tests/promotion_delay_proxy.test.mjs`
- `backend/tests/screenplay_initial_project.integration.test.mjs`
- `them/BackendMemoryAPI.swift`
- `them/BackendScreenplayProjectCreation.swift`
- `them/RootExperienceView.swift`
- `them/ScreenplayDraftSaveOutbox.swift`
- `them/ScreenplayInitialProjectCreation.swift`
- `them/ScreenplayLiveDraftBridge.swift`
- `them/ScreenplayProjectPromotion.swift`
- `them/ScreenplayStudioScreen.swift`
- `them/ScreenplayStudioViewModel.swift`
- `themTests/BackendProjectWriteOwnershipTests.swift`
- `themTests/ScreenplayInitialProjectCreationTests.swift`
- `themTests/ScreenplayStudioDraftRecoveryTests.swift`
- `themUITests/V1SmokeUITests.swift`
- `TASKS.md` and this report.

## 5. GitHub and retained evidence

Permanent folder:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1168-20261026.Zq2ObA/`.
Retain current red, final native/UI bundles, full backend and Mac logs, exact
public source, source comparison, serialized command recipe, final remote refs
and SHA256 readback verification. Publication is recorded separately there.

Only a normal scoped backup push; no original PR advancement, replacement PR,
main merge, forced/squashed history, protection/review bypass, deployment, DNS,
secret or accepted-decision change. Clementine, the orb and aesthetic preserved.

## 6. Next active task

Integrate preserved `c1e9255` interrupted talk enqueue/orphan reconciliation and
settlement, using the current real-filesystem failure as the first boundary.
Then finish original647's connected proof before advancing it; follow actual
next PR bases. Keep main/release/real-phone requirements separate and explicit.

## 7. Continue status

READY FOR CONTINUE. Overall goal active and incomplete. No additional paid
model call is authorized by these local results; production hold remains.

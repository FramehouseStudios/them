# T-1108 — Durable first-save client checkpoint

Parent `d3af0c3f488cba2ecf30d2d65b39c75c63009447`.
Branch `codex/T-1108-client-creation-recovery`.
Runtime `2b51d72b28518012531afffb7e149f1686d1bd65`.
Production remains held; main and original PR heads are unchanged. No paid
provider calls. This is local integration evidence, not physical-phone proof.

## Actual bug and connected repair

VERIFIED: the initial signed iPhone crash/relaunch workflow failed **0/1/0**.
The first version really committed while the transport withheld its receipt.
After a manual edit and app termination, startup selected the server's active
project and hydrated the older first version over the newer unbound page.
The corrected same workflow passed **1/0/0** without increasing its deadlines
or weakening its word, identity, version-count or dirty-state assertions.

Extend the existing `ScreenplayDraftSaveOutbox`, live-draft origin journal,
project-write SDK and local recovery slots. Do not add another writer store,
HTTP/auth stack or fallback from atomic initialization to two unsafe requests.

- Before HTTP, persist an immutable original draft, stable project/request IDs,
  owner, sanitized backend origin and document UUID in the existing outbox.
- Keep that identity across relaunch and newer local edits. Identical words in
  a deliberately different document do not share an intent. A changed explicit
  title cannot silently replace a pending setup.
- Auto-promotion and nonblank explicit creation use the same atomic server
  initializer through `POST /screenplay/projects/initialize`. The dedicated
  additive endpoint makes an old backend fail without creating empty metadata.
  The original collection route's opt-in and metadata-only contracts remain.
- Validate the actual returned project, version ID and original raw draft;
  persist the receipt before binding it. Recheck current login intent, origin,
  document UUID, selected project and page bytes around suspension/binding.
- Preserve newer text in the canonical target recovery slot before publishing
  the binding. An old receipt acknowledges only its original draft, not newer
  edits. Remove only the exact initial row after the binding is persisted.
- Initial rows cannot enter the ordinary version drain. Startup project-list
  hydration waits while the current document has unresolved initialization.
- The page exposes a connected **Finish setup** action for its own pending
  setup rather than inviting another project. The existing Save now handler
  resumes the same intent, then saves newer edits through the normal outbox.
- Keep deliberate blank/title-only creation working on the existing metadata
  path. It is not an atomic-first-draft fallback and is not yet crash-idempotent.
- Preserve raw bytes in explicit creation and bridge adoption; trimming decides
  eligibility only. Bridge journal comparison uses UTF8 rather than Unicode
  canonical String equality. Persist unbound edits to the existing file journal.

## Evidence and failures retained

Permanent proof folder:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1108-client-20261021.6x5xJd/`.
Backend proof snapshot: `/tmp/them-1108-client-connected.86ERuj/source`;
all seven changed backend files byte-match the runtime commit. Native final
units/UI/macOS built the working tree now committed as2b51d72, not the earlier
native files in that backend snapshot. Permanent `verified-public-source.tar`
records the final tracked source; private environment/signing inputs excluded.

- Early signed affected cohort **119/0/0** preceded the final SDK cases and
  startup/action refinements; it is not the final full-unit result.
- Actual authenticated backend initialization/restart cohort **2/0/0**; the
  transport barrier cohort **3/0/0**, including a held HTTP200 replay receipt.
- First full Node20.20.2 run **2911 pass /1 fail /2 skip**. The sole failure
  was the explicit method-guard inventory missing the new POST-only endpoint.
  Add that exact guard to the expected inventory; remove no existing checks.
- Corrected full Node20.20.2 run **2912 pass /0 fail /2 skip**, 47 suites.
  Existing skips: live Postgres prefix query without DATABASE_URL and the
  pre-existing talk page-write preview-header case. No new skip added.
- First named-project UI **0/1/0** used a debug load ID without its required
  load token, leaving an unbound page that correctly auto-promoted. Correct the
  setup to load the source via actual authenticated server selection, not debug
  binding. Also compare draft strings directly, never the ID helper that trims.
- Corrected named-project UI **1/0/0**: create a new named project from an
  existing page, keep CRLF/NFD/trailing whitespace, exactly one initial version,
  leave the source project's version unchanged, relaunch the new project.
- macOS desktop scaffold build exits0. Existing Swift concurrency/deprecation
  warnings remain; a successful build does not mean those warnings were fixed.
- D009 versus the actual saved parent: index33538 delta0; Studio17337 delta0;
  Root14937 delta-22; bridge12860 delta-12; MemoryAPI10463 delta-90. Extract the
  project-write capability and origin value type, not arbitrary line ranges.
- First full signed units **910/1/0**: the new status refresh used request
  identity admission even for the existing anonymous/quarantined recovery
  counter. That hid a retained parked row from the conflict-handler status.
  Keep UI status on the canonical Studio auth context (including session intent)
  while network initialization still requires its strict nonblank owner. Keep
  the original parked-count assertion and all retained-word assertions.
- Corrected full signed units **911/0/0**, erased task-owned
  `7F1A14C1-B379-4417-AFE9-331810CD9CD3`, iPhone17Pro/iOS26.2; normal signing.
- Final interrupted setup/edit/termination/relaunch/Finish setup/new-version UI
  **1/0/0**. Final raw-audio-to-page/save/one-project/relaunch UI **1/0/0**,
  intercepted provider counts STT1/chat2/TTS1. Those are fixture calls, not paid
  model or physical-microphone evidence. Final authenticated writer/create/
  manual-save/real Files export/relaunch UI **1/0/0**. Final macOS scaffold exits0.
- Named-project UI1/0/0 above preceded only the final status-context correction;
  do not describe it as a fresh rerun after that correction. Its creation,
  binding and exact-byte implementation is unchanged, and the corrected full
  signed gate covers the final SDK/outbox/bridge code.
- Outside THEM, manually opened `writer-loop-f2a2e1c60e8b.md` in Files Quick Look
  on the same owned simulator. The displayed synthetic marker matches the
  saved export; exact35 bytes verified, SHA256
  `90ad20a380fb2ae8c2f5b96fe2539f88f4749547b52594c78803f73522218cba`.
  Visual observation is in the computer-use transcript; native result bundles
  retain the actual picker/cancel/save workflow. This is not PDF or phone proof.

Node container network is disabled; source/dependencies are read-only and
generated backend data uses ephemeral writable storage. UI fixtures use the
actual authenticated HTTP/server/store with intercepted provider responses.
Those fixtures do not prove live model quality, a microphone, or a physical phone.

## Adversarial scope and remaining work

Answered locally: server restart/concurrent retry/lost receipt; immutable retry
body; changed intent rejected; initial versions never rolled back over newer
versions; current-page app termination/relaunch; newer manual text remains dirty;
separate deliberate document IDs; owner/origin admission; unavailable atomic
endpoint has no unsafe fallback; scoped receipt cleanup and ordinary-drain
exclusion. Retain the initial failures alongside corrected evidence.

Partially addressed: document/account/navigation changes retain old initial
rows instead of applying stale replies. Their bytes remain durable, but a
dedicated owner/origin-scoped recovery/export path for retired documents is still
needed (T-1113). Do not claim every retained historical setup is discoverable.

Not covered: crash-idempotent blank/title-only metadata creation (T-1114),
historical orphan metadata cleanup, disk-full/fsync/power-loss guarantees,
unbound journal per-keystroke latency at feature length (T-1115), live Postgres
rollback, production deployment, physical iPhone/microphone/live providers.
UserDefaults and the existing file journal retain their pre-existing IO failure
semantics; do not turn this proof into an absolute “words can never be lost.”

T-1112 interrupted talk enqueue and T-1113 initial-setup recovery remain ahead
of original #648. Preserve original PRs/history, review protections, Clementine,
the orb and the established aesthetic. Do not mark the product complete.

## Exact changed-file inventory

- `backend/lib/screenplay_projects_routes.js`
- `backend/lib/method_not_allowed_routes.js`
- `backend/evals/promotion_delay_proxy.mjs`
- `backend/evals/run_home_voice_handoff_ui_smoke.mjs`
- `backend/tests/screenplay_initial_project.integration.test.mjs`
- `backend/tests/method_not_allowed_routes.test.mjs`
- `backend/tests/promotion_delay_proxy.test.mjs`
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
- `docs/initial-project-transaction-2026-10-21.md`
- `docs/initial-project-client-recovery-2026-10-21.md`
- `TASKS.md`

## Copy-and-paste continuation

T-1108 nonblank first-save client checkpoint: both Root auto-promotion and
explicit creation now use durable owner/origin/document-bound immutable intents
in the existing draft outbox and the additive atomic initialization endpoint.
Reproduced/fixed startup hydration overwriting newer unbound edits after a lost
receipt. Same-document retry keeps one project/version; newer text stays dirty
until its normal Save now acknowledgement. Finish setup is connected. Keep
intentional blank creation, raw CRLF/NFD/whitespace and original history.
Final signed911/0/0, Node20 backend2912/0/2, interrupted-recovery UI1/0/0,
raw-voice transport UI1/0/0, writer/export/relaunch UI1/0/0, macOS/D009/diff pass.
Named-project raw-byte UI1/0/0 preceded the status-only identity correction;
its implementation is unchanged. Actual Markdown opened in Files outside THEM
and exact35 bytes verified. No paid provider, physical phone or production claim.
Next T-1112 interrupted talk enqueue, then T-1113 retained initial-setup recovery;
blank metadata idempotency T-1114 and long-draft journal IO T-1115 remain tracked.
No main merge, original-head update, deployment, review bypass or app-complete claim.

Publication uses only a normal fast-forward of the already-authorized backup
branch `codex/T-1084-security-foundation-sync`; the permanent proof folder's
GitHub receipt records the actual resulting head/check availability. Main was
freshly verified at `78b8c94f43b4a11f18c2e61df556b9cd7370e735` before publication.
An absent hosted check is not hosted green and does not satisfy merge protections.

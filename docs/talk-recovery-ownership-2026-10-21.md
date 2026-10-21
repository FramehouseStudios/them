# T-1111 — Owner-scoped offline talk recovery

October 21, 2026. Branch `codex/T-1111-owned-talk-recovery`.
Parent `edd5a66eb0342cea67878290f33c995ad87cf37c`.
Verified runtime commit `aa913dfa2e10c5a0a640d4deaaa7e22ef5b9d829`.
Local integration work, not protected-main, production or physical-phone proof.

## Exact files changed

Runtime and connected tests (all11 match the verified source archive):

- `them/BackendClient.swift`
- `them/BackendMemoryAPI.swift`
- `them/BackendNotifications.swift`
- `them/DataControlsScreen.swift`
- `them/OfflineTalkOutbox.swift`
- `them/OfflineTalkRecovery.swift` (new, existing capability's recovery values)
- `them/RootExperienceView.swift`
- `themTests/BackendProjectWriteOwnershipTests.swift`
- `themTests/OfflineTalkOutboxTests.swift`
- `themTests/OfflineTalkRecoveryOwnershipTests.swift` (new)
- `themUITests/V1SmokeUITests.swift`

Tracking: `TASKS.md` and this report. No unrelated working-tree files changed.

## Reproduced failures and implementation

VERIFIED parent red: signed recovery ownership cases **0 pass / 3 fail / 0 skip**.
Device-wide recovery exposed/deleted other accounts' parked turns; a request ID
with different bytes falsely acknowledged the old body; another backend's work
consumed retry state despite not being sent. Artifact `/tmp/them-1111-red-native`.

- Extend the existing outbox, canonical auth snapshots, origin validator and
  notification dispatcher. No second auth store, queue or HTTP architecture.
- Scope presentation, replay, exports and confirmed deletion by account and
  backend origin. Bind confirmations and deferred UI delivery to the login intent.
  Unknown legacy owners remain unassigned and retained, not silently adopted.
- Compare exact body bytes for deduplication. A conflicting body is separately
  parked and reported as a conflict, never acknowledged as the original turn.
- Export exact body bytes in a versioned JSON recovery artifact, excluding HTTP
  credential headers. User-provided payload content is still private and may
  itself contain sensitive text. No automatic import or reassignment is claimed.
- Persist the remaining manifest before unlinking accepted/deleted bodies;
  reject malformed manifests rather than dropping unreadable rows. Serialize
  drains; pin current replay credentials and allow one canonical 401 refresh.
- Pin clear-history, clear-memory and account-export requests across bootstrap
  and response delivery; reject superseded account actions/results. Their only
  production callers pass the backend captured by the UI confirmation/export.
  Validate the built request against it before HTTP; do not retarget on a backend
  change during bootstrap. Existing account-deletion ownership guards are kept.

## Evidence ledger

- First compile/focused signed cohort: **48/0/0** on erased task-owned
  `7F1A14C1-B379-4417-AFE9-331810CD9CD3`, iOS 26.2, normal signing.
  `/tmp/them-1111-compile-native/v1-ui-smoke-local-1-18893.xcresult`.
- Expanded focused cohort: **56/0/0**. Adds stale login confirmation, exact
  confirmed-ID deletion, credential-free exact-byte export, malformed manifest,
  failed manifest write, overlapping/late replay and account-switch-during-401
  cases, plus destructive data-control bootstrap/response supersession.
  `/tmp/them-1111-adversarial-native/v1-ui-smoke-local-1-20279.xcresult`.
- First full signed boundary: **901 pass /1 fail /0 skip**. The new 401 replay
  test found that a decoded entry's durable request key was not explicitly
  restored to HTTP headers. Canonical replay now reasserts the durable request
  key and current user, access and client credentials; absent current client
  credentials do not inherit an old header. Body bytes remain unchanged.
  `/tmp/them-1111-final-native/v1-ui-smoke-local-1-23573.xcresult`.
- Final full signed **902 pass /0 fail /0 skip**, erased owned simulator above:
  `/tmp/them-1111-final-native-corrected/` (one native result bundle).
  This includes successful 401 token rotation, unchanged body/request key,
  invalid/shared body references, owner/origin guards and deferred notifications.
- Recovery UI: initial **0/1/0** queried a nonexistent Cancel button. The native
  picker had opened; its hierarchy exposed the misleading Cancel label as an
  Other element. Second **0/1/0** exposed a helper race: the leading control was
  Back, not Close. Direct CUA inspection verified Back then Close works. Fix the
  existing helper to wait for Back's presence/disappearance, not a filename field
  that persists through folder navigation. No arbitrary sleep or assertion skip.
- Final recovery UI **1/0/0**: current-owner row only, real native Files export
  cancel, delete-confirmation cancel, real Files save, exact confirmed deletion,
  retained legacy notice. Independent on-disk read after the UI verifies exactly
  two foreign/unassigned records with unchanged body bytes; the saved JSON's
  base64 body exactly matches the synthetic owned payload and has no headers.
  Export SHA256 `e8cf2e78563015b4521ab2423404a8163836d30e73165ebbd404376e0243ba5f`.
  `/tmp/them-1111-recovery-ui-final/v1-ui-smoke-local-1-25141.xcresult`.
- Final authenticated actual-app writer workflow **1/0/0**: project/type/save,
  native export cancel/save, exact restored draft and matching server version.
  `/tmp/them-1111-writer-ui.xcresult`. Intercepted provider counts: chat1/STT0/TTS0.
  Frozen backend has no private .env. Not live model/microphone/audible proof.
- Final runtime source: `/tmp/them-1111-replay-fixed-source.L1ENkX/source`.
  Runtime files match that archive. Final macOS scaffold build exit0;
  `/tmp/them-1111-replay-fixed-macos.log`. Existing Swift concurrency/deprecation
  warnings remain; this is not a warning-free or Swift6 migration claim.
- D009 passes against exact parent `edd5a66e`: index33557, Studio17337,
  Root14959, bridge12872, BackendMemoryAPI10553; all five deltas0. Diff check
  passes. One local gate attempt lacked its base ref and returned null baselines;
  that was not proof. Fetch the verified refs explicitly and rerun the real gate.
  An early summary-read also targeted a nonexistent bundle; actual bundle paths
  and terminal summaries above are the evidence, not that failed read.
- No backend JavaScript changed. Inherited last full Node20 backend result is
  2900/0/2 from T-1104, not a fresh T-1111 run. No paid providers called.

Permanent source, red/green bundles, logs, byte checks, retained synthetic
records and external-open screenshot:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1111-20261021.rv6sDp/`.

## Adversarial disposition

- Answered for the tested owner-scoped queue: wrong account/origin presentation,
  replay, export and deletion; stale login confirmation; late replay and scoped
  notification delivery; concurrent drains; duplicate body/key ambiguity;
  401 refresh; malformed/ambiguous manifests; manifest failure before unlink.
- Partially addressed: disk failures preserve referenced bodies before deletion,
  but multi-file enqueue crash atomicity and orphan reconciliation are not proven.
- Not covered here: broad app-wide account isolation, historical script repair,
  physical-phone microphone/speaker, paid provider quality/latency, production
  persistence/rollback, or hosted required checks. No blanket security claim.

## External-open observation completed after Mac unlock

VERIFIED: opened Files on preserved simulator
`11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, selected
`writer-loop-2f1a1ae5a51f.md`, and visually observed its synthetic writer marker
rendered in Files Quick Look, outside THEM. Screenshot
`/tmp/them-1111-external-files-open.png`. The AX tree did not refresh after the
transition, so the screenshot, not a stale accessibility tree, is the open proof.

The 35-byte File Provider Storage file's current SHA256 is
`9c3445b717eb501b8683a2d4a7e9c874e9ed29fac6bc8a4d76bedb558e6df765`, matching
the retained T-1100 byte check. No file moved, overwritten or deleted. This
closes T-1100's external-open observation gap for that synthetic Markdown export;
it does not prove screenplay PDF formatting, a real microphone/provider journey,
physical iPhone, or shipping backend readiness.

## Remaining boundaries

- New body file and manifest are not a single filesystem transaction. A crash
  between them can leave an unreferenced blob; T-1112 tracks reconciliation.
- Legacy unassigned bytes are retained but cannot be exported/replayed from a
  different account; recovering their ownership requires a deliberate policy.
- T-1108 initial project metadata/version creation remains non-atomic and next.
- No production deployment, main merge, original-PR head rewrite, independent
  approval, hosted-green or app-complete claim. Production hold is unchanged.
- GitHub readback: main `78b8c94f43b4a11f18c2e61df556b9cd7370e735`, backup
  `codex/T-1084-security-foundation-sync` at parent `edd5a66e`. Original #648 is
  open/draft, head `210c5ef02d075b0bd359d4c55f5b8c0917d15554`, base
  `claude/project-auto-title`. Preserve it after current safety work.

Saving uses scoped local commits and the existing authorized
`codex/T-1084-security-foundation-sync` backup branch only, normal fast-forward.
No new/replacement PR or original PR-head update. See the permanent proof folder's
GitHub readback for the actual published tip; do not infer hosted green from push.

## Copy-and-paste continuation brief

T-1111 owner-scoped talk recovery checkpoint is verified. Preserve parent
edd5a66e and all original PR heads. Root causes reproduced red0/3; focused48/0/0
then56/0/0; first full901/1 exposed replay request-key restoration, fixed at the
canonical replay builder. Final signed902/0/0, recovery UI1/0/0, authenticated
writer/save/Files export/relaunch1/0/0, macOS0, real-parent D009 all0, diff clean.
Recovery export bytes exact, foreign+legacy records retained. T-1100's prior
35-byte Markdown export now visually opened in Files Quick Look with matching
hash. No paid model calls, phone, production, main merge or hosted-green claim.
Next: T-1108 crash-safe initial metadata/version creation, then T-1112 orphan
payload recovery before original #648 (210c5ef0, base claude/project-auto-title).
Production hold and independent review/check protections remain unchanged.

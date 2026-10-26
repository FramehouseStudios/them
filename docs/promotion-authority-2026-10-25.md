# T-1162 — A late creation reply does not own the current writer page

## 1. Completed

VERIFIED runtime2020f8a on `codex/T-1162-promotion-authority`, worktree
`/Users/halfmutantfilms/io.them-worktrees/codex-promotion-authority`.
Base saved647 safetyb3024bc plus preserving no-ff bd4d738 of published645
92b55f7. Only task-ledger conflict; retained both records. Original645/646/647
heads are not replaced by this safety branch. No main mutation or deployment.

Read b65a52f's full repair and T1105 report before reuse. Retain its canonical
StudioActionDocumentContext owner: initiating user/login generation, project,
authenticated state and exact UTF8 document must still match, Studio must be
active and task not cancelled. Recheck before metadata creation, after its
await before version submission, and before binding/status/error publication.
Require a nonempty version ID. Release existing busy state without replacing
newer status. No new auth framework or product state added to Root.

Creation no longer starts from planned merged text at synced playback start;
existing authoritative committed-write/restored-page hooks remain. An empty
project selection is not an empty saved version: keep an unbound writer page,
detach only a draft actually loaded from a previous project. Current raw
retention and queued-before-hydration guards remain in their canonical owners.

## 2. Exact files changed versus b3024bc

```text
TASKS.md
backend/evals/promotion_delay_proxy.mjs
backend/evals/run_home_voice_handoff_ui_smoke.mjs
backend/tests/promotion_delay_proxy.test.mjs
docs/original-645-parent-refresh-2026-10-25.md
docs/promotion-authority-2026-10-25.md
them/RootExperienceView.swift
them/ScreenplayProjectPromotion.swift
them/ScreenplayProjectPromotionDiagnostics.swift
them/ScreenplayStudioViewModel.swift
themTests/ScreenplayProjectPromotionTests.swift
themUITests/V1SmokeUITests.swift
```

The645 report is preserving-merge documentation. Small eligibility capability
extracted from Root, not duplicated. Delete its unnecessary title-forwarding
wrapper; callers still use canonical ScreenplayProjectAutoTitle. DEBUG-only
read-only phase witness uses design typography, no text/credential disclosure
or writer command. Outer Root observer is already DEBUG-conditional; diagnostic
is not referenced by its Release counterpart. One duplicate runner selector
removed while touching the owner; default Home cases stay unchanged.

## 3. Actual root failure and correction

Current pre-fix commit012b023: signed native held-response UI **0/1/0** at
V1SmokeUITests line871. Actual authenticated local backend commits metadata;
loopback proxy holds the successful create reply. Edit the real native page,
then release that reply and observe Root complete. Counter reports **one stale
Root-source version submission**, expected0. Not a fake policy-versus-itself
test, metadata misclassification, arbitrary negative-only sleep, proven
cross-account leak or claim of observed server-side text replacement.

Reused b65a52f at current owners, retaining all newer safety work. Final
unchanged delayed UI **1/0/0**: no stale Root-source version request, exact
edited page retained. If ordinary autosave independently binds the new page,
verify its actual saved bytes rather than reject legitimate metadata/autosave.
Readonly `studio.promotion.phase` witnesses completion. New test reuses the
green visible-page/focused-app typing interaction and keyboard preconditions;
no retry, relaxed assertion or increased allowance.

## 4. Verification and claim boundaries

- Full signed erased native **780 pass /0 fail /0 skip**, Xcode26.3,
  iOS26.2/23C54, owned91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A. Direct cases cover
  unbound retention versus previous-project detachment and context rejection:
  changed user/generation/project/bytes, unauthenticated state, cancellation
  and Studio closure. These are not real suspended sign-out/401 experiments.
- Final delayed real HTTP/native UI **1/0/0**, positive exact promotion/
  termination/relaunch UI **1/0/0**, no seed override on relaunch. Positive
  checks title, raw CRLF/trailing/decomposed bytes, same binding, one version,
  no duplicate project. Both provider counters ASR0/chat0/TTS0.
- Existing active-turn Stop UI **1/0/0** after removing planned-text creation.
  Reuse b65's measured7.704-second audio asset selection for this case, not the
 0.168-second silence race; production timing unchanged. Counters ASR1/chat2/
  TTS1, all intercepted. It proves capture/preview cancellation and no late
  insertion, not server orphan counts, real microphone or audible voice quality.
- Proxy checks pinned Node20.20.2 **2/0/0**, actual held/unheld HTTP, source-
  scoped version counting and non-loopback rejection. Proof-only module, no
  production import or deployed endpoint. Final runner syntax/diff pass.
- Backend production byte-identical to b3024bc (retained zero-byte diff).
  Its full Node20 **2869/0/2** remains parent evidence; the new proof-only test
  was run separately. Do not invent a new full2871-pass suite or live golden.
- macOS scaffold **BUILD SUCCEEDED**, build only. Existing actor/Sendable/
  Swift6 warnings retained, not resolved or suppressed. No Mac user journey.
- D009 vs published b3024bc passes: Root14963→14955(-8); index33557,
  Studio17345, bridge12926, Memory10845 unchanged. Reserved7F1A14C1 untouched.

Permanent explicit archive:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1162-20261025.GgxFFW/`.
Keep actual red,780 bundle, all three final UI bundles, logs, patches, proxy
checks and runtime-equivalence evidence. No private env, provider key, signing
material or temporary auth/persistence store copied. Remove only task-owned
borrowed dependency symlink, not parent641 dependencies.

## 5. GitHub status

Scoped backup branch only; original646/647 heads remain gated behind exact
published64592b55f7. Its backend/D009/Docker checks green; Quality last observed
in V1 stage of run40258575199, not yet terminal. No protected main landing,
approval submission, force/squash, replacement PR, secret or domain change.

## 6. Next active task and residual risk

T1107/T1163 transport ownership is next: BackendMemoryAPI awaits bootstrap
before constructing current-identity headers;401 can reconstruct them, and
sync publication precedes Root's callback. Reuse8fba5bb only after reading its
full source/report64d56c2 and address the recorded masked-refresh proof gap.
Callback checks alone do NOT establish request/sync isolation across those
awaits. T1108 atomic/idempotent metadata+initial-version and crash/orphan client
reconciliation remain separate; no autonomous deletion was added. Keep prior
save-drain/conflict repair requirements and physical-phone journey open.

Advance original646 only when exact645 is green; stop at its first actual
failure. This backup is not permission to skip original bases or ship an
intermediate prefix. Legacy unsigned recovery-script entry remains tracked,
not invoked or silently trusted. No paid calls made by these local proofs.

## 7. Continue status

READY FOR CONTINUE. Full THEM goal active/incomplete. Intended shipping-backend
phone sign-in/mic/reply/specific rewrite/offline/restore/external export is not
proved by intercepted simulator runs. Production hold remains unchanged.

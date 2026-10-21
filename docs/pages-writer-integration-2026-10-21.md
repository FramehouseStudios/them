# T-1096 — Original Pages work on the current writer candidate

Started October20; final audio proof completed October21, America/Los_Angeles.
Branch `codex/T-1096-pages-writer-sync`, parent `e3faeca6`.
Runtime checkpoint `0f67802a1f7c981fbe570eb7efdf4ace69c7ea85`.

## Preserved work and root fixes

Original PR bodies, comments, exact commits and current bases were read first.
This is not the old cumulative T-951 rehearsal or a replacement Pages PR.

- #642 `7c40428b5ded625b703f9ca538d8a7539b5d2ea7`: preserving merge `b154881`.
  Both original commits retained. One UI insertion conflict resolved by
  keeping the original Pages scenario AND both current keyboard/typing tests.
- #893 `58c3ff335d7baaee9a0c9940b94ba05969366b5e`: preserving merge `c2786f0`;
  original iOS-only inline-title modifier guard, not a recreated Mac repair.
- Existing isolated repairs `964bb7a7` and `eddb2ed5` replayed as `6a71245` and
  `2f8260a`: bounded repeated speech continuations, Unicode/full-line fixtures,
  and avoiding per-word ICU work for ASCII. Historical T-951 proof retained,
  not presented as proof of this candidate. Only task-ledger context conflicted.
- Original heads remain ancestors, and remote original refs remain unchanged.
  OpenDraft notice/attribution is retained; no new framework/dependency.

VERIFIED current integration defects corrected:

1. New header used the54-line element-aware engine, while existing counts used
   cached server results or raw55-line division. Header, overview, inspector
   data and Craft fallback now read one current draft/density snapshot. Default
   comes from the existing Letter engine; explicit custom density is retained.
   A stale server page array cannot supply a newer draft's visible count.
2. Recalculation success/error and loading completion now belong to a request
   ID and exact draft/density. Older completion cannot retire newer loading.
3. Direct engine probe showed two leading blank lines returned source1–3
   instead of3–5; CR-only import became one merged line. Both implementations
   and the mounted HTTP route now preserve original source line numbers while
   retaining the legacy trimmed-content line_count. Draft bytes are not edited.
4. First full signed gate failed777/2/0. One was a new cache deallocation crash:
   retained stack ends in Cache.__deallocating_deinit / TaskLocal / malloc.
   The pure bounded snapshot is now a value type, eliminating that reference
   lifecycle. Same cache assertions pass; no leak/skip workaround.
5. Other failure exposed T-1094's Home-opening gap: `Don't write a story; open
   Studio instead.` was incorrectly denied. Navigation can now open Studio
   without granting Page permission. Existing assertion retained, with an
   additional nil Page-permission assertion. Separate fix commit `2b95140`.

The cache is not Observable or published view state. It is owned by the
existing model; unrelated status renders reuse its current draft/density
snapshot. This is a source-level reduction of repeated work, not a measured
physical-iPhone performance claim.

## Exact retained evidence

`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1096-20261020.tK7ZQO/`

Includes source archive/patch, runtime-changed-files.txt, failed/corrected signed
bundles, isolated crash attachment, native summaries, Pages screenshot, writer
and audio UI bundles, Node logs, final macOS log and D009 JSON. Documentation
checkpoint changes do not alter the proven runtime. Source archives exclude
private environment files and signing material.

| Check | Actual result / scope |
| --- | --- |
| Full backend, Node20.20.2 | 2,851 pass / 0 fail / 2 skip; isolated frozen public source, external network disabled. `them-1096-node20-full.log`. |
| Supplemental mounted pagination HTTP + engine | 28/0/0 under the same Node20 image, including the subsequently added LF/CRLF/CR source-range regression. Runtime unchanged after full backend; no invented combined full-suite count. |
| Full signed current themTests | Initial777/2/0 retained; corrected779/0/0 on erased owned Pro11CF5EFB-D8C3-4F19-8062-28AF37F27D93, iOS26.2/23C54. `units-fixed/v1-ui-smoke-local-1-12748.xcresult`. |
| Numbered Pages + native typing UI | 2/0/0; same owned Pro erased first. Original chip/overview/page-jump scenario plus uninterrupted native typing. `pages-ui/v1-ui-smoke-local-1-13485.xcresult`. One-heading screenshot inspected; not a full-length dialogue-layout proof. |
| Authenticated writer UI | 1/0/0: create project, exact marker typing/save, native Files export, relaunch and exact editor/server version checks against isolated auth-required backend. `writer-ui/writer-ui.xcresult`. STT/chat/TTS0; not a spoken-writing test. |
| Longer-audio Home writer UI | 1/0/0: current server transcript opens Studio, complete generated native scene, one marker, independently found saved version and exact editor restoration after relaunch. `voice-ui/voice-ui.xcresult`. Synthetic ASR1/chat2/TTS1, no paid model or real microphone. |
| macOS scaffold | Final BUILD SUCCEEDED after value-cache correction, `macos/scaffold.log`; build-only signing behavior unchanged. |
| Mentor golden | Offline40 exemplar pairs /8 prompt checks, MENTOR GOLDEN SET OK. Not live model quality/scores. |
| D009 / diff | Pass. index33,557(-69), Studio17,408(-27), Root14,992(-120), bridge12,934(-18), memory10,865(0) vs main78b8c94f. No new god-view state; Studio shrank13 vs task parent. |

The backend skips are the real PostgreSQL prefix query (DATABASE_URL not
configured) and the existing skipped talk page-write preview-header test.
They are not claimed covered by green unit counts. Existing Swift actor/
Sendable warnings remain. Host fixture regeneration/listening required sandbox
escalation; an unprivileged HTTP run failed EPERM and was replaced with the
network-isolated Node20 run, not a changed product assertion. A mistyped result
filename lookup was corrected to the runner's actual12748 bundle.

## What remains false or unproven

- This candidate is not main or production. Full current bundle779 is not the
  later stack tip's historical952 count. Fresh head/scope matters, not totals.
- #613's lossless title-page/body mapping is not integrated. Printed-preview
  source ranges here do not exclude title metadata. Existing continuous-editor
  versus exported-element disagreement (#80) remains unresolved.
- The legacy live-paper page_flip path still splits scenes into pages. Its
  line-edit consumer rebuilds a draft from page strings; changing display
  pagination underneath it without source mapping would risk source loss.
  Reconcile that contract deliberately; do not blindly wire the orphan edit
  helper or save rendered continuation markers into writer text.
- Narrow inspector still has fixed-width side-by-side thumbnail/metadata;
  this imported overview is not the requested entire Pages-tab redesign.
  Full120-page UI responsiveness and full-page visual/export parity unmeasured.
- No real microphone/model/physical-iPhone/shipping-backend journey is proven
  by synthetic providers. No paid provider calls or deployment requested.

## GitHub and next action

Normal save target remains existing `codex/T-1084-security-foundation-sync`.
Before save, fresh remote reads confirmed main78b8c94f, backup e3faeca6, original
#6427c40428b and #89358c3ff33 unchanged. Original #964 exact5faa43d6 remains
REVIEW_REQUIRED / BLOCKED. No approval impersonation, original-head rewrite,
squash, replacement PR, protection bypass or main merge.

Codex's attempt to attach #642 to this chat hit the app's100-attachment limit;
no existing attachment was removed. The original PR remains accessible:
https://github.com/FramehouseStudios/them/pull/642 .

Next: T-1097 preserves/reconciles original #6134143d9c3 and source-safe live
page semantics; T-1098 fixes the narrow Pages inspector. Actual original child
is still #64386cc5b24, base claude/pages-port, with existing #879 and later
safety repairs to read/preserve before integration. Production hold, genuine
review and physical-phone/live-provider clearances remain unchanged. Orb,
Clementine and established aesthetic are preserved. Goal remains active.

# #641 filmmaker/dialogue correction evidence

## Scope and decisions

- DECIDED: original `claude/filmmaker-dialogue-port` head `232098ba` is preserved; corrections live on `codex/T-947-filmmaker-review-fixes`. No replacement PR, squash, original-head rewrite, or main merge.
- Removed the broad `asksForStoryHelp` promotion from director advice. Rewrite/revise/punch-up commands are no longer converted into advice by that addition.
- Home mode now depends on the actual Studio surface or explicit script/open intent, never a remembered script or incidental story words. Speculative and final preparation share the same policy. Page routing and both live insertion boundaries require Studio to be active.
- The server owns dialogue-notes detection and output. The competing Swift detector/overlay is removed; the legacy additive Boolean is ignored rather than breaking call sites. `dialogue_notes.js` owns the notes contract and its compact form; general persona prose points to the selected server task instead of forcing notes globally.
- `screenplay_project_memory_policy.js` is imported by both prompt routes and the talk facade. Notes can use authenticated project continuity under the same policy as other screenplay tasks.
- Freshness reaches `beginPageWork` through the original lane hints; the real talk adapter now presents a fresh greeting as pitch / Companion / low, not greeting / Reflex. Its diagnostic branch matches pitch.
- Explicit distress precedes incidental story-help cues. Two historical golden labels were corrected to their actual writer-block intent/lane; case IDs remain stable.
- `conversation_freshness.js` owns the recent-conversation wire marker; Swift mirrors it under a parity test.
- D009 allows shrinking god files. Existing exact line-count assertions were corrected to the current 33,626-line ceiling rather than padding the extracted facade with whitespace. Later stack-specific 33,603 requirements are not established here.

## Verification ledger

- VERIFIED: focused Node 20.20.2 regression suite: **61 passed, 0 failed, 0 skipped**. Log: `/tmp/them-947-focused-backend-final.log`.
- VERIFIED: first full regression exposed **2,763 passed, 3 failed, 2 skipped**. Failures were two exact-count assertions after legitimate extraction and an overbroad exclusion of ordinary line judgment. Each was corrected; the final full run is recorded separately below, not hidden by retries.
- VERIFIED: final full backend under Node **20.20.2**, whole-checkout container mount and network disabled: **2,768 passed, 0 failed, 2 skipped**; offline **MENTOR GOLDEN SET OK**. Log: `/tmp/them-947-backend-final.log`. The two skips are existing live-only gates, not hidden failures.
- VERIFIED: D009 versus `claude/three-act-port`: `index.js` 33,626 → **33,602**; `RootExperienceView` 15,112 → **15,032**; the other monitored god files are unchanged.
- VERIFIED: `git diff --check` passed before evidence capture.
- VERIFIED: signed full Swift units on the erased task-owned simulator
  `11CF5EFB-D8C3-4F19-8062-28AF37F27D93`: **637 passed, zero failures/skips**.
  `/tmp/them-947-units.xcresult`, `/tmp/them-947-units.log`.
- VERIFIED: macOS scaffold build succeeds (`/tmp/them-947-mac.log`; unsigned
  build only). Existing actor/Sendable warnings remain; this is not a
  warning-free build claim. Writer UI and final preserving-tree proof follow.
- No provider calls, secrets, production mutations, GitHub pushes, or main merges were performed by this correction lane. Offline exemplar scores are not live model scores.

## Not covered

Physical shipping-backend voice generation, export opened outside THEM, paid live golden scores, hosted required checks, and independent non-author approval remain separate gates. These corrections are not evidence that the app is releasable or complete.

### Confirmed Home-to-Studio first-turn boundary — not covered

Read-only audit: realtime and turn-based handlers prepare the prompt before
auto-opening Studio. The new active-surface guard intentionally prohibits a
page target while closed. The writer UI starts in Studio and does not prove
first-utterance Home writing. In turn-based microphone capture, effectiveText
can be a previous transcript; opening on that stale value would be unsafe.
Track T-949: prove current final transcript -> authenticated Studio open ->
prompt preparation, with no opening for partial-only/stale/everyday words and
no page target when authentication refuses. This is an unproven integration
edge, not a claim that a physical-phone failure was reproduced.

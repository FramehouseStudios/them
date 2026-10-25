# T-945 — Original #640 review corrections

## Scope and history

Original #640 `claude/three-act-port` head
`c8eb36bad5979748130e2da7ed9ea2b9b6abe061` is retained as an ancestor of
`codex/T-945-three-act-review-fixes`. No original head, main, or public history
is rewritten; this is a correction branch, not a replacement PR.

## Root-cause corrections

1. Remove the screenplay-word additions from `asksKnowledge`. Four exact
   conversational messages retain their pre-#640 intents; the inciting-incident
   question remains knowledge-answer. VERIFIED: with production flags the exact
   milestone message was already motivation-coaching on the proven pre-#640 tree;
   without flags it was reflective-checkin. Do not confuse these contexts.
2. Protect `<craft>` during rich-budget trimming. Behavioral tests assert all
   five turn ranges and the actual persona/mentor output contracts survive at
   6,200 characters, rather than checking source literals.
3. `DEFAULT_FRAMEWORK_ID` owns the JavaScript default. Talk, prompt routes and
   logline distillation import it; framework discovery lists it first. Swift
   mirrors the three-act wire ID, preserves explicit selections and chooses
   the default even if an older server lists Save the Cat first.
4. DECIDED: target-scaled `<feature_film_map>` takes precedence over generic
   fixed-110-page `<craft>`. Both append paths share the precedence predicate.
   Without a feature map, mentor turns retain craft guidance.
5. Register craft topic keywords in lexical retrieval. The exact dialogue
   query now returns craft cards with embeddings disabled.
6. The original formatting claim was incomplete and is superseded: restore
   main's exact spaces and nine topic separators, plus twenty craft cards.
   VERIFIED: diff against origin/main is +21/-1; all 110 cards and metadata
   remain deeply equal to original #640. Deployment copy says 110, not 90.

## Reopened independent review — second correction pass

- Replace front-to-back protected shares with capped weighted redistribution.
  Unused space returns to longer contracts. A production-order test compares
  the complete normalized core and mentor contents, not just tag presence.
  The full protected pool may use available space above the former fixed 82%.
- Real HTTP `/talk` reaches a mocked provider and inspects its system prompt.
  Removing mentor routing fails; reverting the append guard fails on the
  competing craft block. Mutation fixtures were restored. One initial mutation
  accidentally produced invalid syntax and is NOT behavioral evidence; the
  corrected, syntax-checked mutation fails on the actual prompt assertion.
- Extract lexical topic weights into their canonical capability module.
  Both requested scene/setup queries retrieve craft cards without embeddings;
  relationship subtext and Plato dialogue queries retain their own domains.
- Final prompt assembly removes craft whenever a feature map arrives later.
  This makes precedence independent of assembly order.
- Track the minor persisted-report framework rail mismatch separately below;
  do not present the earlier Swift default-selection tests as covering it.
- D009 permits shrinking. Two inherited exact-count tests now assert the
  current 33,626 ceiling, rather than require padding after extraction. The
  later stack's exact 33,603 rule is not established at this boundary.

### Remaining tracked rail issue

T-948: when a report is loaded and no framework was explicitly selected,
reconcile the chip and override request to that report's framework. Required
proof: stored Save the Cat report loads as Save the Cat; Save Override succeeds;
explicit new Three-Act selection remains unchanged. This is a known minor
limitation, not a completed correction. The human explicitly allowed tracking.

### Second-pass verification

- Focused Node 20: 49 passed, zero failed, zero skipped.
  `/tmp/them-948-focused-final2.log`.
- Full Node 20.20.2, network disabled: 2,771 passed, zero failed, two skipped;
  offline MENTOR GOLDEN SET OK. `/tmp/them-948-backend.log`.
- Both real-talk mutations fail on behavior after syntax checking; no real
  provider calls occur. Synthetic TTS bytes are not voice-quality proof.
- D009 vs mentor-golden: index 33,626 -> 33,581; other monitored files unchanged.
- Signed full units, writer UI and scaffold proof are pending below. Earlier
  integration readiness is superseded until these current proofs finish.

## Verification

- Original behavior: 29 focused tests, 22 pass / 7 fail / 0 skip.
  `/tmp/them-945-red.log`.
- First corrected pass: 65 pass / 2 fail. One assertion still expected the
  deliberately removed conflicting block; the milestone expected intent used
  the review's no-flags context rather than production flags. Both expectations
  were corrected against measured behavior, not by changing product routing.
- Final focused Node 20.20.2 tests: 68 pass / 0 fail / 0 skip;
  `/tmp/them-945-focused-final.log`. Additional actual-persona tests: 3/3;
  `/tmp/them-945-real-mentor.log`.
- Signed Swift selection/resilience tests after task-owned simulator erase:
  9 pass / 0 fail / 0 skip; `/tmp/them-945-craft.xcresult`.
- First full backend: 2,764 pass / 0 fail / 2 skip. The actual-persona regression
  was added afterward; final full-tree proof is recorded below when finished.
- D009 vs `claude/mentor-golden-port` passes: all five monitored files unchanged,
  including index.js exactly 33,626 lines. `git diff --check` passes.
- Final full backend Node 20.20.2, with network disabled and the whole checkout
  mounted: 2,765 pass / 0 fail / 2 skip. Offline golden gate passes separately
  from live model output. `/tmp/them-945-backend-final.log`.
- macOS scaffold build succeeds: `/tmp/them-945-mac.log` (unsigned build only).

## Boundaries

No paid model calls for these corrections. #639's one live attempt was blocked
before provider calls by missing process credentials; it is not live proof.
Local deterministic results do not prove physical-phone or shipping-backend
voice behavior. Original #639/#640 hosted checks currently display failed runs
from September 22; recent successful Actions runs on other branches do not clear
those checks. Independent non-author approvals still apply.

VERIFIED next original boundary: #641 `claude/filmmaker-dialogue-port`
`232098ba46d1572fdb86f2c64490e3d997e66092`, based on `claude/three-act-port`.
Its body has been read, but its readiness has not yet been independently proven.

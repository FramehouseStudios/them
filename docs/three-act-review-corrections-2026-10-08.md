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
6. Restore one-card-per-line JSON, with all 110 cards and metadata verified
   deeply equal to original #640. Deployment copy now says 110, not 90.

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

## Exact correction-file manifest

- `TASKS.md`
- `backend/.dockerignore`
- `backend/DEPLOY.md`
- `backend/index.js`
- `backend/knowledge_cards.json`
- `backend/lib/craft_frameworks.js`
- `backend/lib/craft_prompts.js`
- `backend/lib/logline_distiller.js`
- `backend/lib/prompt_routes.js`
- `backend/lib/system_prompt_trim.js`
- `backend/tests/craft_three_act_default.test.mjs`
- `backend/tests/logline_distiller.test.mjs`
- `backend/tests/persona_mentor_contract.test.mjs`
- `backend/tests/prompt_routes.test.mjs`
- `backend/tests/talk_routing_quality_guard.test.mjs`
- `docs/T21-craft-prompts-and-classification.md`
- `docs/three-act-review-corrections-2026-10-08.md`
- `them/ScreenplayStudioViewModel.swift`
- `them/StudioCraftResilience.swift`
- `themTests/StudioCraftFrameworkSelectionTests.swift`

The rehearsal additionally updates `docs/integration-rehearsal-2026-10-08.md`.

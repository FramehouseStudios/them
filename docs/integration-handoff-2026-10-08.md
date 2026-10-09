# THEM integration — end-of-session briefing, 2026-10-08
## 1. Completed
VERIFIED: reopened #640 corrections and corrected #641 are preserving-integrated into codex/T-943-integration-rehearsal. Tested combined code source: aef7d390e3c5ec9d61fbd9f0c12994a9176c11bc. Documentation-only commits follow. Original heads c8eb36ba / 232098ba and rehearsal starting tip 44729296 remain ancestors. No replacement PR, squash, original-head rewrite or main merge.

## 2. Files changed
Exact tracked integration scope relative to starting rehearsal 44729296, including original #641 work retained:
- TASKS.md
- backend/evals/clementine/scenes.jsonl
- backend/index.js
- backend/knowledge_cards.json
- backend/lib/clementine/intents.js
- backend/lib/clementine/lanes.js
- backend/lib/clementine/page_lane_adapter.js
- backend/lib/clementine/talk_edge_adapter.js
- backend/lib/conversation_freshness.js
- backend/lib/craft_prompts.js
- backend/lib/dialogue_notes.js
- backend/lib/knowledge_topic_weights.js
- backend/lib/persona.js
- backend/lib/prompt_assembly.js
- backend/lib/prompt_routes.js
- backend/lib/screenplay_project_memory_policy.js
- backend/lib/system_prompt_trim.js
- backend/tests/clementine_intents_story.test.mjs
- backend/tests/clementine_reflex_lane.test.mjs
- backend/tests/clementine_voice_eval_scenes.test.mjs
- backend/tests/coverage.test.mjs
- backend/tests/craft_three_act_default.test.mjs
- backend/tests/dialogue_notes_intent.test.mjs
- backend/tests/persona_mentor_contract.test.mjs
- backend/tests/prompt_routes.test.mjs
- backend/tests/studio_actions.test.mjs
- backend/tests/talk_mentor_craft.integration.test.mjs
- backend/tests/talk_routing_quality_guard.test.mjs
- docs/filmmaker-review-corrections-2026-10-08.md
- docs/integration-rehearsal-2026-10-08.md
- docs/three-act-review-corrections-2026-10-08.md
- them/HerDirectorContext.swift
- them/HerVoiceSpec.swift
- them/RootExperienceView+ScreenplayIntent.swift
- them/RootExperienceView.swift
- them/ScreenplayIntentClassifier.swift
- themTests/HerVoiceSpecMentorCoreParityTests.swift
- themTests/ScreenplayIntentClassifierTests.swift
- docs/integration-handoff-2026-10-08.md (this report)

The two dedicated correction ledgers retain independent branch results, initial failures, fixes, and proof limitations.

## 3. Root issues fixed
- Protected prompt allocation returns unused shares and preserves complete production-order core and mentor content.
- Real HTTP talk tests inspect provider prompts; mentor routing and feature-map append regressions are behaviorally mutation-guarded. One malformed mutation was excluded, not counted as evidence.
- Lexical craft retrieval is scoped to writing context; relationship and Plato questions retain their domains with embeddings disabled.
- Knowledge cards preserve main's exact formatting plus 20 cards (+21/-1), contents unchanged. Late feature maps remove contradictory generic craft.
- Explicit rewrites no longer become director advice. Home incidental words no longer promote screenplay mode; page commits require active Studio.
- Dialogue notes have one server detection/output owner, shared project-memory policy and trim contract.
- Fresh pitch hints reach the real page-lane adapter; distress precedes story-help; recent conversation marker is parity-tested.

## 4. Verification
All below are VERIFIED on combined code aef7d390:
- Full backend npm test: Node20.20.2 container, network disabled, 2,785 passed / 0 failed / 2 skipped; /tmp/them-950-combined-backend.log. Existing live-only skips are not passes.
- Offline mentor golden: MENTOR GOLDEN SET OK. Exemplar gate is not live model quality.
- Signed full themTests: 644 passed / 0 failed / 0 skipped; /tmp/them-950-combined-units.xcresult.
- Signed writer UI: 1 passed / 0 failed / 0 skipped; /tmp/them-950-combined-writer.xcresult. Typed draft -> authenticated save -> Markdown export -> relaunch restore, auth-on local fixture backend (host Node26.7). Task-owned simulator erased before each proof; no human device erased.
- macOS scaffold build passed, /tmp/them-950-combined-mac.log. Unsigned build-only; existing actor/Sendable warnings remain.
- D009 versus claude/three-act-port passed: index 33,557 (-69), Root 15,032 (-80); other monitored files unchanged. git diff --check passed.
- Backend fixture stopped and temporary xcconfig removed. No paid provider calls or live-golden retry.

Standalone #640 correction: backend 2,771/0/2; signed units 631/0/0; writer UI 1/0/0.
#640 plus prior safety rehearsal: backend 2,771/0/2; signed units 635/0/0; writer UI 1/0/0.
Standalone #641 correction: backend 2,768/0/2; signed units 637/0/0; writer UI 1/0/0.
All have separate retained artifacts and scaffold/offline/D009 proof.

## 5. GitHub status
- Published codex/T-945-three-act-review-fixes at 2757b8d6.
- Published codex/T-947-filmmaker-review-fixes at b85e391f.
- Rehearsal branch is published after this ledger commit; resolve its final evidence-only tip via git log.
- Original #640/#641 heads remain unchanged. Their uncorrected remote heads must not be merged as though they contain these fixes.
- Main verified unchanged at 647e01fcf17730d301aaa8a5072255ca7494c53c.
- Current hosted runs on scoped correction branches: none; not proof of green CI or a current billing failure. #766 remains draft/REVIEW_REQUIRED.
- Evidence comments are posted on original #640/#641 after publishing. No new PRs.
- GitHub reports 15 dependency alerts (13 high, 2 low); not investigated/resolved in this scoped integration pass.

## 6. Next active task and gaps
Next verified stack boundary: #642 claude/pages-port @7c40428b5ded625b703f9ca538d8a7539b5d2ea7, actual base claude/filmmaker-dialogue-port. Body and both commits read; not independently proven/integrated.

Tracked product proof:
- T-948: stored craft-report framework rail/override reconciliation; minor issue explicitly allowed to be tracked.
- T-949: confirmed Home first-script-utterance -> Studio open -> prepare ordering. Existing UI starts in Studio; do not claim this transition works. Do not open on a stale prior microphone transcript.
- Physical shipping-backend speech -> reply -> formatted draft -> specific rewrite -> offline/relaunch exact restoration -> external file open remains unproven.

HUMAN_INPUT_REQUIRED:
- Live golden: securely provision OPENAI_API_KEY in the evaluation process, never chat/logs; authorize a new scoped attempt. Current instruction is no retry.
- Landing: genuine authorized non-author GitHub approval and fresh required exact-head checks; never bypass protection. #766 then #770 remains the safety-first order.
- Release: intended backend/deployed identity, signing/TestFlight and physical-phone access/proof must be cleared; no shipping completion claim.

## 7. Continue status
READY FOR CONTINUE on #642 review/rehearsal and tracked local product proof. Main landing and live/physical shipping validation remain separately gated.

## Copy and paste to Claude
Codex reopened T945 and preserving-integrated corrected #640/#641 into T943 rehearsal. Tested combined source aef7d390; original heads unchanged; no main merge, squash or replacement PR.

T945 @2757b8d6: allocator content preservation, real /talk prompt + mutation proof, scoped craft retrieval, exact main JSON +21/-1, and order-independent feature-map precedence. T947 @b85e391f: rewrite/Home surface routing, single-owner dialogue notes + memory/trim contract, fresh pitch lane, distress and freshness parity.

Combined proof: Node20 backend 2785/0/2; signed erased-sim units 644/0/0; authenticated local writer UI 1/0/0; macOS scaffold/offline golden/D009/diff pass. index33557, Root15032. Initial failures and excluded malformed mutation remain documented.

T948 persisted-report rail remains tracked; T949 Home first-turn ordering remains unproven. No live golden retry or paid calls. Hosted approvals/checks and shipping/physical-phone voice/external-export proof remain separate. Main647e01fc unchanged. Next actual boundary #642 pages-port @7c40428b, based on filmmaker-dialogue-port; body and both commits read, not proven yet.


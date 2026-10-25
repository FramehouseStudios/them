# T-1143 — Preserved original641, dialogue repair and Home handoff boundary

## Identity and ownership

VERIFIED: original641232098ba still targets `claude/three-act-port`; its body
and all four correction/follow-up comments were read. Worktree
`/Users/halfmutantfilms/io.them-worktrees/codex-original-641-routing`, branch
`codex/T-1143-original-641-routing`, base22bf182 (prepared640). Local merge
060bf00 preserves original641232098ba, its corrected descendantb85e391f and
the complete current parent. No original public head/base or main was changed.

Four merge conflicts: retain both canonical-default/craft and project-memory
imports in prompt_routes; preserve both historical task-ledger sides; resolve
the two count-test wording conflicts without changing either no-growth ceiling.
No assertion relaxation, whitespace padding or broad rehearsal merge occurred.
The historical T-947/T-949 handoffs remain dated context, not fresh proof.

## Reproduced dialogue-content bug and existing fix

VERIFIED production-function result on the merged tree:
`Does this line work? She says: Rewrite the ending.` selected rewrite_scene
and page_rewrite. The command words inside the supplied line were treated as
writer instructions. Conversely, `Read this line: "Stay." Tighten it.` remained
dialogue_notes rather than selecting the requested rewrite.

Reapply the isolated existing T-1092 correction from
b04e16c249689c0a078edd3507df3f79f0f07ef3, not its broad writer-candidate tree.
The three production files and regression file are byte-identical to that
existing source. Dialogue-notes owns content masking and the shared revision
policy; task selection and cost-lane classification consume the same owner.
Balanced-quote trailing directions remain instructions, and explicit Page/
Continue hints retain priority. Unquoted colon-attributed/read-back lines are
handled by the existing policy. This is not an authorization or billing change.

## Current proof — scopes kept separate

- Signed/native/UI/macOS proof for this641tree has NOT run yet. Do not claim
  historical637/644 or inherited parent646 units as new combined-tree proof.
- Node20.20.2 focused before:5 pass/2 fail/0 skip, exit1. Both are real
  classification assertion failures, not missing dependencies or a zero-test run.
- Same seven focused regressions after:7 pass/0 fail/0 skip, exit0. Includes
  quoted/unquoted imperative dialogue, ASCII/curly quotes and contractions,
  trailing rewrite/tighten/shorter/another-pass directions and explicit hints.
- Complete exact-lock Node20.20.2 backend:2795 pass/0 fail/2 skip, exit0.
  Skips: real PostgreSQL query without DATABASE_URL, opt-in Page-response case.
  This was a host Node20 run, not a network-disabled-container claim. Live paid
  flags/key were absent; no real provider or private environment was used.
- JavaScript syntax and diff checks pass.
- First D009 invocation properly refused the missing local parent reference as
  unverified. Fetch the actual unchanged parentc8eb36b; corrected comparison
  passes with numeric deltas: index33557(-69), Studio17431(-4), Root15032(-80),
  bridge12952(0), memory10865(0). These are versus the actual public PR parent,
  not a claim that later exact33603 rules are established. No padding added.

Commands from this worktree, with provider/database overrides removed:

```sh
/private/tmp/node-v20.20.2-verified/bin/node --test backend/tests/dialogue_notes_intent.test.mjs
# Full run used the same verified Node20 PATH and isolated exact-lock install:
cd backend && npm test
# From repository root:
GITHUB_BASE_REF=claude/three-act-port /private/tmp/node-v20.20.2-verified/bin/node scripts/check_god_files.mjs --json
```

Permanent local artifacts:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1143-20261025.i4Tf9z/`.
Separate before/fixed/full logs are retained; no failed run was overwritten.
That archive also retains this turn's parent639 offline40pairs/8prompt checks,
scorer/approval guards8/0/0 and D009 deltas0, plus parent640 gate regressions
7/0/0 and numeric D009. Their updated local heads are4c61d5a and22bf182;
neither public child was advanced or given an unchanged fresh native-suite claim.

## First remaining integration failure — Home voice preparation order

VERIFIED source ordering still prepares turn-based/realtime requests before
opening Studio. The newly protected page-routing boundary correctly requires
Studio to be active. Raw audio can select the previous global `transcript`
before current ASR arrives. This is source evidence plus the retained earlier
T-949 reproduction, not a new physical-phone observation in this session.

Next: reconcile isolated existing6e7138b1 (T-949) and its documented later
Home-open/refusal, barge-in and stop/preview ownership corrections. Preserve
current confirmed words, authentication refusal, native text ownership and
immutable save receipts; do not merely open on a speculative partial or relax
the active-Studio guard. The complete T-949 handoff was read, including its
earlier failed proofs, binding crash, save lag and explicit two-call limitation.
Do not merge a broad backup or call the Home journey fixed before real local
authenticated UI proof. Later original807 is the canonical transcribe-first
boundary and must be reconciled in order, not replaced by a second STT service.

Original641 remains NOT READY for publication. Fresh native/integration proof,
parent hosted clearance and independent human review remain separate holds.
Original638run40176990546 and974run40175219157 are live, not declared green.
No paid model, physical microphone/phone, shipping backend, production change,
integrated-main or whole-product completion claim follows from this checkpoint.

## Exact final diff manifest versus prepared640 parent22bf182

- TASKS.md
- backend/evals/clementine/scenes.jsonl
- backend/index.js
- backend/lib/clementine/intents.js
- backend/lib/clementine/lanes.js
- backend/lib/clementine/page_lane_adapter.js
- backend/lib/clementine/talk_edge_adapter.js
- backend/lib/conversation_freshness.js
- backend/lib/dialogue_notes.js
- backend/lib/persona.js
- backend/lib/prompt_assembly.js
- backend/lib/prompt_routes.js
- backend/lib/screenplay_project_memory_policy.js
- backend/lib/system_prompt_trim.js
- backend/tests/clementine_intents_story.test.mjs
- backend/tests/clementine_reflex_lane.test.mjs
- backend/tests/clementine_voice_eval_scenes.test.mjs
- backend/tests/dialogue_notes_intent.test.mjs
- backend/tests/prompt_routes.test.mjs
- docs/filmmaker-review-corrections-2026-10-08.md (historical)
- docs/original-641-routing-2026-10-25.md
- them/HerDirectorContext.swift
- them/HerVoiceSpec.swift
- them/RootExperienceView+ScreenplayIntent.swift
- them/RootExperienceView.swift
- them/ScreenplayIntentClassifier.swift
- themTests/HerVoiceSpecMentorCoreParityTests.swift
- themTests/ScreenplayIntentClassifierTests.swift

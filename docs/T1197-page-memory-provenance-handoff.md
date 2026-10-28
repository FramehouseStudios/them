# T1197 — Page memory provenance

## Completed / boundary

- Base: `57106a3dfad51c1b63a6c9af5edc7e1573dba999`.
- Worktree: `/Users/halfmutantfilms/io.them-worktrees/codex-page-memory-provenance`.
- Branch: `codex/T-1197-page-memory-provenance`. Local source lane only; parent checkout, original heads, native jobs and production were untouched.
- Files changed: `backend/lib/realtime_studio_render_routes.js`, `backend/tests/realtime_studio_render_routes.test.mjs`, this handoff.

VERIFIED from source: both Page handlers call `studioRenderQualityBody`, which uses the same `studioMomentumMeta` hydration as prompt construction. Omitted/empty request fields previously fell back to persisted `currentBeat`, `nextScenePlan`, `nextSceneMoves` and `nextThreeTurns`. A graph's `currentState` copies those fields and its `causalHandoff` can be the already-written final action. Thus old observations could become mandatory future events, even after the current client stopped sending them.

VERIFIED source lifecycle: atomic `screenplay_project_initialization.js` creates the project and exact first version only; it has no creative-memory writer dependency. `/prompt/build` reads creative memory. `index.js`'s creative-memory trigger copies incoming Studio metadata into project continuity; `creative_memory_store.js` stores those fields and accepted scenes, whose `nextScenePlan` may fall back to deterministic accepted-page `causalHandoff`. That deterministic handoff describes inherited pressure/observed outcome, not an approved new event. No actual private store contents were inspected by this lane.

## Root fix and compatibility

A single Page-only read projection now runs before prompt assembly. Its projected memory is also retained in the existing memory context for quality evaluation, so prompt and gate agree. It:

- removes unproven project current-beat/next-plan/moves/turns/beat-sequence fields and graph current-beat/next-plan/causal-handoff fields from mandatory mission slots;
- retains their bounded contents in explicitly labeled historical continuity in the model prompt; never mutates or deletes durable memory;
- uses canonical `buildProjectFieldProvenance` for an actual confirmed writer question answer, promoting only supported next-plan/next-move values that still match their learned value; current explicit assignments outrank prior confirmations;
- excludes the fetched memory payload when its known project or graph ID disagrees with the explicit requested project; the same writer's other project's story/character material must not enter even as advisory context;
- leaves companion-only momentum behavior, accepted causal facts, accepted obligations, character facts, explicit request/outline metadata, quality algorithms, public envelopes and provider retry limits unchanged.

The existing graph-to-first-pass-brief test now supplies its intended next-scene assignment explicitly in the current request instead of treating an unproven cached graph field as author approval. Its consequence, changed-behavior and payoff assertions remain. New negative tests prove unrelated output is still rejected for explicit and confirmed plans; accepted canon contradictions still reject an unsuccessful repair.

## Verification

VERIFIED cached `them-foundation-proof-tools:node20` reports **v20.20.2**. Task backend and lock-identical existing dependencies were mounted read-only; `docker run --rm --network none --entrypoint node` ran `--test tests/realtime_studio_render_routes.test.mjs`. All model functions were injected fixtures. **0 paid/provider calls**.

- Final focused handler file: **58 passed / 0 failed / 0 skipped**, 430.450709 ms. Log: `/private/tmp/them-1197-focused-final-node20.log`.
- Prior expanded checkpoint: **57/0/0**; adding current-assignment precedence motivated the final run, rather than rerunning an unchanged suite.
- First construction run: **51 passed / 4 failed / 0 skipped**. The four failures were new assertions assuming `_to_spend`/`_to_render` prompt variants and `memory_applied:null`; the existing contract uses either prompt label variant and omits absent metadata. Assertions were corrected; runtime rejection/acceptance results were already as intended. That initial tool output was not saved as a full log.
- Exact base route mounted over the changed route, same new observed/project-ID regressions selected: **0 passed / 4 failed / 53 filtered skips**. Both sync and SSE reject the unrelated historical event with `missing_act_one_commitment`; both wrong-project variants also fail. This is the intentional red control, not a passing whole-suite claim. Log: `/private/tmp/them-1197-baseline-negative-node20.log`.
- Host syntax checks for both changed JS files and `git diff --check`: pass.
- `node scripts/check_god_files.mjs`: pass versus `origin/main`; all five watched files unchanged from this task's base. `backend/index.js` remains 33,494 lines.
- Full backend, native units/UI, live models, shipping backend and physical iPhone: **UNRUN in this lane**. Parent owns combined proof.

## Required parent integration / remaining risks

This backend slice alone does **not** close the updated-client legacy gap. At this base, Root's `screenplayPromptContinuityContext` backfills old session snapshot fields into apparently explicit request metadata. Parent owns this hunk:

1. Only consume `sessionContinuitySnapshot` when canonical `ScreenplayProjectScopedState.matches(snapshot.projectId, selectedProjectId: committedWriteProjectIDSnapshot())` accepts the current project. Same-writer global continuity is not automatically the active screenplay.
2. Keep factual/historical notes, scene summary, last outcome and core character/story facts; remove snapshot-to-mandatory backfills for `featureObligation`, `currentBeat`, `actPressureState`, `nextScenePlan`, and every snapshot merge into `nextSceneMoves`/`nextThreeTurns`. Preserve actual current bound-outline targets and accepted `featureWorkflowContext` plan-fact overrides.
3. `sessionContinuityPromptNotes` currently calls old values a `First restored-response target` and commands `start from this page move before inventing a new lane`. Relabel auto-restored values as historical context/prior suggestions, rather than future instructions. Keep accepted causal canon and evidence-grounded accepted story obligations authoritative.

Old clients can still explicitly send ambiguous historical metadata or a preassembled system prompt. Without provenance that content cannot be distinguished safely from the writer's explicit current plan; no schema migration/heuristic was invented here. Untagged persisted future plans now remain advisory until the current request or existing confirmed-question provenance supplies authority. A fetched memory record with no project identity still relies on canonical server-side scoped selection; this additive guard rejects known mismatches, not a replacement authorization layer.

## GitHub / next / continue

No push, PR, merge, deployment, provider run or independent-approval substitution. Preserve this local commit when integrating after the parent's native job terminates. Run combined backend proof and the actual owner UI repro on the combined Root+server tree. **READY FOR CONTINUE** with parent integration; no claim that THEM or the legacy Page path is fully complete.

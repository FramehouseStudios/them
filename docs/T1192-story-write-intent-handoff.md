# T1192 — explicit story writing intent

- Base: `fcfad13e19a82fcfea5673f0421b67df5efe5461`.
- Branch/worktree: `codex/T-1192-story-write-intent`, `/Users/halfmutantfilms/io.them-worktrees/codex-story-write-intent`.
- Ownership: only `backend/lib/prompt_assembly.js`, its existing focused test file, and this handoff. Previous helper branches and the parent checkout were untouched.

## Cause and fix

VERIFIED: the exact UI request “Write a story about two astronauts who discover the observatory sky is a painted set. Put HOME VOICE HANDOFF on the panel.” classified as `dialogue_punchup`. Bare `voice` matched the dialogue fallback; the explicit writing branch omitted story requests. This occurred with or without Swift's Rewrite instruction preamble.

Inference now unwraps that existing client envelope and reuses canonical `requestsStoryPages` permission/grammar. Explicit story creation joins the existing `write_scene` branch before incidental character/dialogue fallback. A conceptual artifact immediately following the story noun, such as a story outline or premise, does not qualify through the new story path. Existing explicit dialogue notes/punchup, revision, feature, continuation, and refusal precedence remains intact. The model-bound writer input is unchanged; this only corrects task inference.

This is separate from the UI's Page-to-Rewrite intent coercion and the proven `missing_character_arc_memory` rejection. Neither UI intent policy nor any server quality gate was changed here.

## Proof

- VERIFIED cached `them-foundation-proof-tools:node20` reports `v20.20.2`.
- VERIFIED focused `node --test tests/creative_memory_and_prompt_assembly.test.mjs`: **58 passed, 0 failed, 0 skipped**, 838.864251 ms reported test duration.
- Run used `docker run --rm --network none --entrypoint node`, task backend mounted read-only at `/repo/backend`, existing lock-identical dependencies mounted read-only at `/node_modules`, and workdir `/repo/backend`. No environment/key files were copied or loaded; no provider/network calls were possible.
- Regression coverage includes exact raw/Swift-prepared prompts, incidental voice/character terms, polite story commands, planning, how-to/advice, actual dialogue/voice polishing, and write refusal.
- `git diff --check` passed. No full backend/native/UI suite, push, merge, deployment, or live-model proof was performed in this lane.

## Next

Preserve the local commit when integrating into Jarvis's combined tree. Run the parent's required combined checkpoints before publishing or merging. This helper freezes after handoff.

# T1196 — workflow guidance is not accepted story canon

- Base: `1586cc02a1dee70ee5369dd24c76b8db5bee1db9`.
- Branch/worktree: `codex/T-1196-workflow-guidance-provenance`, `/Users/halfmutantfilms/io.them-worktrees/codex-workflow-guidance-provenance`.
- Owned files: planner, existing planner tests, this handoff. No Root/Bridge, backend quality gate, provider fixture, parent source, network, push or native action was changed/performed.

## Proven cause

The parent's synthetic authenticated UI artifact `/private/tmp/them-1187-publication-proof/grounded-write-ui-quality-diagnostic.json` records HTTP200 SSE quality rejection `missing_next_turn_continuation`. SessionContext promoted the UI suggestion `Write the next scene: Continue the unfinished page with a concrete emotional turn.` into mandatory next-three-turn metadata. UI sequence/act advice also became scene objectives, current beat and character-turn inputs, despite no outline scene/beat source.

## Fix and compatibility

`ScreenplayFeatureWorkflowPlanFacts` projects only real outline scene, beat and act records. The existing planner builder attaches it to its snapshot; a fresh no-outline snapshot has an empty-but-provenanced projection. SessionContext derives mandatory scene/beat/next-turn fields only from these facts. The original scene objective and summary remain separate. Scene and beat order is retained. Accepted-batch line counts remain UI inventory, not a narrative outcome.

All visible Compass suggestions, cards and operation prompts remain unchanged. Generic advice is retained as explicitly labeled continuity guidance. Explicit selected operations still retain submittedPrompt; original screenplay text is untouched. Feature-spine facts remain available.

The additive Codable facts projection survives new roundtrips. Legacy contexts keep project/version, submitted operation, feature facts and continuity notes; unverifiable flat auto-plan fields are not promoted. Arbitrary legacy plans cannot be claimed recovered without rederiving them from current outline records.

## Required parent-owned integration hunk

Jarvis approved and will apply this single existing-line change in `ScreenplayFeatureWorkflowContextPersistencePolicy.shouldRefreshProjectRestoreContext` inside Bridge:

`guard let current, !current.isEmpty, current.planFacts != nil else { return true }`

The new legacy refresh assertion intentionally depends on that reserved Bridge hunk. A fresh provenanced empty-outline context must not repeatedly refresh. This helper did not edit Bridge.

## Verification

- VERIFIED: `git diff --check` passed; canonical god-file gate passed. No god files changed in this lane.
- Source regressions cover actual planner-builder scene/beat provenance, the exact generic UI turn remaining visible without becoming a requirement, core feature facts and selected operation preservation, new Codable roundtrip, legacy suppression/rederivation, and no empty-outline refresh loop.
- Swift compilation, focused/full tests, UI and live model proof: **UNRUN here**. Do not call the UI rejection fixed until the parent integrates the required hunk and proves the combined path. No native pass count is claimed.

Preserve this local commit, apply the approved Bridge hunk, then run the parent's combined signed/full/UI/macOS checkpoints. Helper freezes at handoff.

---
id: T-eval-gate-add-canon-evals
title: Umbrella `npm run eval:canon` for canonical-contract evals
owner: support
status: merged
branch: support/T-eval-gate-add-canon-evals
pillar: evals (contract stability)
---

## Scope

Several canon-pinning evals already ship on main:

- `eval:creative-memory` — single-turn cold-vs-seeded prompt path
- `eval:creative-memory-version` — envelope `version` field
- `eval:block-signal-history-bounds` — pathological-input guard
- `eval:block-signal-block-cap` — `<block_signal>` block size cap
- `eval:archetype-canon` — archetype bucket stability
- `eval:backend-surface-smoke` — backend feature route surface
- `eval:ops-health-summary` — ops summary envelope
- `eval:trait-library-canon` — trait schema and prompt summary stability
- `eval:twist-engine-canon` — twist IDs across frameworks
- `eval:block-detector-canon` — block signal vocabulary and thresholds
- `eval:format-linter-canon` — screenplay format lint rule IDs

Today running them all requires many separate invocations. This PR
adds an umbrella `npm run eval:canon` that chains them, so a single
command exercises every merged canon eval. CI gates can switch from
listing individual scripts to this one umbrella.

Future canon evals get appended to this script as their PRs land,
keeping the umbrella in lockstep with the canon-pinning surface area.

No production code change. `eval:gate` is unchanged in this PR;
a follow-up will wire `eval:canon` into the gate.

## Done when

`npm run eval:canon` exits 0 against current main, running every
merged canon eval end-to-end.

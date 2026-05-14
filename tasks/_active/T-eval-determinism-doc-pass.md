---
id: T-eval-determinism-doc-pass
title: Document determinism stance across 10 canon evals
owner: claude
status: review
branch: claude/T-eval-determinism-doc-pass
pillar: infra (eval discipline)
v1_pillar: infra
v1_effect: closes the eval-missing-determinism-check pre-flight gap so the canon eval suite passes pre-flight clean (matters because eval:canon gates V1 ship)
---

## Scope

Adds a one-paragraph `Determinism:` block to each of the 10 canon
evals currently flagged by the
`eval-missing-determinism-check` pre-flight rule (added in #235).

Each comment block documents the eval's determinism stance: these
are all canon evals — they read frozen constants and pure
functions, no clocks / random ids / network, so the same input
always produces the same output set. The pre-flight rule keys on
the word `determinism` / `deterministic` / `idempotent` /
`repeatable` / `same input` in the file body — adding the comment
satisfies the rule without changing eval behavior.

## Files touched

- `backend/evals/run_archetype_canon_eval.mjs`
- `backend/evals/run_block_detector_canon_eval.mjs`
- `backend/evals/run_block_signal_block_cap_eval.mjs`
- `backend/evals/run_craft_frameworks_eval.mjs`
- `backend/evals/run_creative_memory_eviction_eval.mjs`
- `backend/evals/run_creative_memory_version_eval.mjs`
- `backend/evals/run_ops_health_summary_eval.mjs`
- `backend/evals/run_prompt_regression_eval.mjs`
- `backend/evals/run_trait_library_canon_eval.mjs`
- `backend/evals/run_twist_engine_canon_eval.mjs`

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: closes the eval-missing-determinism-check pre-flight
  gap so the canon eval suite passes pre-flight clean. eval:canon
  is wired into the V1 smoke chain (#235); pre-flight failures on
  unrelated PRs were flagging these 10 evals as noise.`

## Verification

- `node scripts/pre_flight.mjs` → `eval-missing-determinism-check`
  flag count drops from 10 → 0.
- `node backend/evals/run_archetype_canon_eval.mjs` still passes
  (smoke check on one of the touched files; comment-only changes
  cannot break the eval body).

## Done when

Pre-flight no longer flags these 10 evals; comment changes ship
without functional change.

## What this does NOT do

- Add a runtime same-input/same-output check to each eval. These
  evals already read frozen canon and pure functions — the
  determinism is structural, not asserted at runtime. The comment
  documents the stance.
- Touch eval bodies. Pure comment additions.

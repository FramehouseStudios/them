# Page craft eval (F1)

Measurable owner bar for page/scriptwriting craft: aim for the smartest creative writer at top-class literary/screen craft. Speed only enables draft-to-revise loops.

## What shipped in F1

See backend/evals/page_craft/ for RUBRIC.md, score_page.js, fixtures/, and run_page_craft_eval.mjs.
Unit tests: backend/tests/page_craft_eval.test.mjs

## Rubric dimensions (1-5 + overall mean)

1. Distinct character voice
2. Subtext density
3. Continuity of want / obstacle / cost
4. Motif / image echo
5. Anti-cliche
6. Format / playability

## How to run

Use the eval:page-craft package script from backend.

Optional model judge: set PAGE_CRAFT_LLM_JUDGE=1 and pass --mode=llm (skipped when unavailable).

## Gate thresholds

- PASS fixtures: overall >= 3.5
- FAIL fixtures: overall <= 2.8
- Runner exits non-zero on threshold breach or insufficient fixtures.

Summary artifact: backend/evals/page_craft/last_page_craft_summary.json

## CI path

quality_gate.sh runs heuristic-only when RUN_PAGE_CRAFT=1 (default). Also wired into eval:canon. No live model call required.

## Fixtures

Synthetic Fountain/page excerpts only. Labels pass|fail with optional fail_modes.

## How this feeds F2

F2 multi-pass (`docs/product/page-multipass.md`) consumes this scorer as an acceptance signal between draft → critique → revise (and optional repair when `PAGE_MULTIPASS_REPAIR=1`). Heuristic `scorePageHeuristic` / PASS floor `overall >= 3.5` is the MVP gate. F1 remains measurement + goldens; F2 productizes the craft loop behind `CLEMENTINE_PAGE_MULTIPASS`.

## Change log

- 2026-09-01 — F1 started: rubric, heuristic scorer, optional model-judge seam, 14 fixtures, CI heuristic gate.
- 2026-09-01 — F2 multipass wired to consume heuristic scorer as acceptance seam.

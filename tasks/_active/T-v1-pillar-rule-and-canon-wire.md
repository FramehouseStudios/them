---
id: T-v1-pillar-rule-and-canon-wire
title: Pre-flight V1 pillar rule + wire 4 V1 smokes into eval:canon
owner: support
status: review
branch: support/T-v1-pillar-rule-and-canon-wire
pillar: infra
v1_pillar: infra
v1_effect: infrastructure for every V1 checklist item; pre-flight enforces V1 pillar declarations on new tasks + canon umbrella runs all 4 V1 smoke fixtures
---

## Scope

Two infra wins bundled together:

### 1. Pre-flight `task-missing-v1-pillar` rule

Every active task file in `tasks/_active/T-*.md` that uses YAML
front matter must carry a `v1_pillar` + `v1_effect` declaration
(YAML or body-line) per `docs/v1-definition.md`'s PR Rule.

**Grandfather rules** (skipped by the check):
- Files without YAML front matter (pre-V1-doc style).
- Files with `status: merged` (shipped before the V1 rule could
  apply).
- Coord-refresh tasks (matched by "Refresh coordination after PR").

**Invalid-pillar check**: if `v1_pillar` is present but not one of
`talk`, `screenplay`, `memory`, `realtime`, `ios`, `infra`, the
rule flags it.

Current main produces 13 `task-missing-v1-pillar` findings against
non-merged, non-grandfathered task files. They are warn-only;
they should be backfilled as those PRs cycle through.

### 2. `eval:canon` wired with V1 smokes

The 4 V1 deterministic smokes (voice-to-page #224, screenplay +
memory recall + realtime failover #231) are now part of the
umbrella. New `npm` scripts:

- `npm run eval:v1-voice-to-page-smoke`
- `npm run eval:v1-screenplay-smoke`
- `npm run eval:v1-memory-recall-smoke`
- `npm run eval:v1-realtime-failover-smoke`
- `npm run eval:v1-smokes` (chains all 4)

The `eval:canon` umbrella appends `&& npm run eval:v1-smokes` so
the canon gate fails on any V1 smoke regression. `quality_gate.sh`
runs `eval:canon` in strict mode already (`set -euo pipefail`), so
this lands as an actual merge-blocking gate for V1 regressions.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: infrastructure for every V1 checklist item.
  Pre-flight enforces V1 pillar declarations on new tasks (so the
  V1 rule actually applies); canon umbrella now runs all 4 V1
  smoke fixtures (so V1 regressions block merge).`

## Verification

- `node scripts/pre_flight.mjs` → 23 findings: 10 pre-existing
  eval-determinism warnings + 13 task-missing-v1-pillar warnings
  against legacy non-merged tasks.
- `node --test scripts/pre_flight.test.mjs` → 33/33 pass
  (includes 7 new tests for the V1 pillar rule).
- `cd backend && npm run eval:v1-smokes` → all 4 V1 smokes PASS.
- The 4 new individual scripts run independently.

## Done when

The pre-flight rule is wired + tested; the canon umbrella runs
the V1 smoke chain on every gate run.

## Followups

- Backfill V1 pillar/effect lines on the 13 legacy non-merged task
  files (each PR can include the line as it ships).
- Once the V1 doc has more checklist items closed, audit the smoke
  fixtures and add new ones to the canon chain.

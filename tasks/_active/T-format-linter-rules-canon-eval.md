---
id: T-format-linter-rules-canon-eval
title: Pin canonical rule_id set + envelope for format_linter
owner: claude
status: merged
branch: claude/T-format-linter-rules-canon-eval
pillar: evals (contract stability)
---

## Scope

`lib/format_linter.js`'s `lintScreenplay()` emits suggestions whose
`rule` field is a stable string ID. iOS T28 reads each `rule` and
renders a Studio card with that ID as the dedupe / dismiss key.
A silent rename would regress every iOS consumer + every analytics
counter.

This eval pins:

- Empty input → canonical zero envelope (`schemaVersion`,
  `ruleSetVersion`, `totalSuggestions`, `suggestions[]`,
  `bySeverity{hard,medium,soft}`).
- Noisy fixture → ≥ 3 suggestions, all from the canonical 8-rule
  set: `scene_heading_shape`, `character_cue_caps`,
  `parenthetical_density`, `parenthetical_count`,
  `action_voice_present`, `action_adverb_density`,
  `page_economy_overlong`, `blank_lines_around_headings`.
- Every suggestion has `rule` (canonical), `severity ∈ {hard,
  medium, soft}`, positive `line`, non-empty `message`.
- `bySeverity` totals sum to `totalSuggestions`.
- Suggestions are sorted by line ascending.
- Determinism: same input → same output.

Wired via `npm run eval:format-linter-canon`.

## Done when

`backend/evals/run_format_linter_canon_eval.mjs` exits 0 with all
checks passing; `npm test` still green.

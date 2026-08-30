# T-format-linter — Hollywood Format Linter (rules v1)

**Status:** in-progress
**Owner:** support
**Branch:** `support/T-format-linter`
**Pillar:** voice-to-scene + living companion (Craft Intelligence Suite, Layer 2)

## Goal

A pure rule-based Hollywood format linter. Every page-write turn can route through this and receive structured suggestions with severity. The linter does not reject writing — it surfaces what submission readers reach for first.

No LLM dependency. No environment dependency. No decision blockers (industry rules are codified). Ships independent of every other open PR.

## Rule set v1

Eight rules, three severity tiers:

| Rule | Severity | Detection |
|---|---|---|
| `scene_heading_shape` | hard | All-caps line with INT/EXT/I/E marker but missing the well-formed `INT./EXT. <LOCATION> - <TIME>` shape. |
| `character_cue_caps` | hard | Mixed-case line in a cue position (≤40 chars, followed by mixed-case prose) — submission readers' #1 rejection trigger. |
| `blank_lines_around_headings` | hard | Scene heading missing a blank line immediately before or after. |
| `character_cue_isolation` | medium | (Reserved for v2) Character cue not surrounded by blank lines. |
| `action_voice_present` | medium | Action line ending in `-ed.`, OR containing `was/were/had + <verb>ed`, OR containing 2+ `\b\w{3,}ed\b` words. False positives expected at this severity by design. |
| `parenthetical_density` | soft | Parenthetical body > 30 chars; convention prefers terse cues. |
| `parenthetical_count` | soft | More than one parenthetical stacked under a single character cue. |
| `action_adverb_density` | soft | Action line containing 2+ adverbs from a curated list (the "show, don't tell" tells). |
| `page_economy_overlong` | soft | 5+ consecutive non-blank lines without a beat break (cue, parenthetical, scene heading). Industry advice: come in late, leave early. |

## Output envelope

```jsonc
{
  "schemaVersion": 1,
  "ruleSetVersion": "v1",
  "frameworkId": "save-the-cat" | null,
  "totalSuggestions": 3,
  "bySeverity": { "hard": 1, "medium": 1, "soft": 1 },
  "suggestions": [
    {
      "rule": "scene_heading_shape",
      "severity": "hard",
      "line": 1,
      "range": [0, 17],
      "excerpt": "INT KITCHEN NIGHT",
      "message": "Scene heading does not start with a well-formed INT./EXT. prefix.",
      "suggestion": "Use 'INT. <LOCATION> - <TIME>' or 'EXT. <LOCATION> - <TIME>'."
    }
  ]
}
```

`line` is 1-indexed for display. `range` is 0-indexed character offsets in the original input. `excerpt` is bounded to 120 chars. Suggestions are sorted by line, then by severity (hard first).

## Endpoint

```
POST /craft/format/lint
  body: { text: string, frameworkId?: string }
  ok:   200 with the envelope above
  err:  400 craft_invalid_screenplay (text missing or empty)
        400 craft_schema_version_unsupported (X-Craft-Schema-Version header > 1)
```

## What's NOT in this PR (explicit follow-ups)

- **iOS surface.** Codex's `T-format-iOS` row consumes the endpoint and renders banners. Not on this branch.
- **Rule severity gating defaults.** The proposed-decisions doc proposes hard/medium/soft severity policy; this PR ships all three but does not gate them — every suggestion comes back, the iOS surface filters by user preference.
- **Genre-aware rule weights.** A noir screenplay's "show don't tell" tolerance differs from a romantic comedy's. v2 may take genre into account; v1 applies one rule-weight set across all genres.
- **Per-rule allow/deny.** Configurable per-screenplay opt-out for specific rules. Not in v1.
- **Caching.** Rule-only and fast (millisecond order). No cache needed yet.

## Verification

- `cd backend && node --test tests/format_linter.test.mjs` → **24 pass, 0 fail** (rule-by-rule coverage).
- `cd backend && node --test tests/craft_endpoints.test.mjs` → **19 pass, 0 fail** (3 new endpoint tests for `/craft/format/lint`).
- `cd backend && npm test` → **128 pass / 1 skipped / 0 fail**. No regressions.
- `npm run eval:gate` → not run; requires backend boot with secrets.

## How this fits the Craft Intelligence Suite

This is **Layer 2 — Industry Rule Enforcement** from the 2-week sprint plan in `io.them_Craft_Intelligence_Suite_2_Week_Plan.pdf`. Layer 2's other modules (logline distiller, coverage simulator, genre classifier) follow this PR with the same pattern: a pure-data backend module + an endpoint + tests + a thin iOS surface.

## Done when (recap)

- [x] Rule set v1 implemented with 8 rules across 3 severities.
- [x] Endpoint `POST /craft/format/lint` mounted in `craft_routes.js`.
- [x] 24 rule-level unit tests + 3 endpoint integration tests.
- [x] Full suite passes (128 / 1 / 0).
- [x] No iOS work (Codex's row).
- [x] No DECISIONS.md edits (proposals only, in `docs/proposed-decisions.md`).
- [ ] iOS surface (Codex follow-up).
- [ ] Genre-aware rule weights (v2 follow-up).

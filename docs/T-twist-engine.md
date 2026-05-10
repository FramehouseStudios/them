# T-twist-engine — Beat-aware reversal suggestions

Layer 2 of the Craft Intelligence Suite. Given a framework + the beat
the writer is currently on, returns structured reversal suggestions
the iOS companion can surface as cards on the beat timeline.

## North-star pillar
**Voice→scene** + **living creative companion**. A companion that
can suggest "what if the villain was right?" at the all-is-lost beat
is meaningfully different from a typing surface.

## Architecture

Two pieces, both backend-only:

1. **`backend/lib/twist_engine.js`** — pure module:
   - `suggestTwists({ frameworkId, currentBeatId, sceneSummary?, count?, classifier?, forceMode? })`
   - Deterministic stub (default) — canonical twist library keyed by
     `frameworkId.beatId`.
   - LLM mode — when a T21-style classifier with `kind: "openai"` is
     supplied, route through `classifier.classifyScene` with a
     twist-prompt and parse the structured response. Mirrors the
     `logline_distiller` pattern.
2. **`POST /craft/twist/suggest`** — mounted alongside the existing
   `/craft/*` routes via `mountCraftRoutes`.

No new persistence domain — twist suggestions are derived on each
request from the canonical framework library + the beat the iOS
Studio reports.

## Twist shape

```
{
  id: string,        // stable; iOS can dedupe / pin / dismiss
  label: string,
  hook: string,
  severity: "high" | "medium" | "low",
  rationale: string
}
```

Severity is the narrative weight of the reversal — `high` is a major
identity-level twist, `medium` is a redirect, `low` is a flavor twist.
iOS can use it to gate card prominence.

## Endpoint contract

### `POST /craft/twist/suggest`

```
Request:
  frameworkId   string (required, one of:
                  "save-the-cat" | "three-act" | "story-circle" | "hero-journey")
  currentBeatId string (required, must be a known beat for the framework)
  sceneSummary  string?  (optional context for the LLM mode)
  count         number?  (1..6, default 3)

Response (200):
  {
    schemaVersion: 1,
    frameworkId, currentBeatId,
    source: "stub" | "openai",
    twists: [{ id, label, hook, severity, rationale }]
  }

Errors:
  400 craft_invalid_framework_id   unknown frameworkId
  400 craft_invalid_screenplay     unknown / missing currentBeatId
```

## Library coverage

Twists are seeded for the canonical **major-turn beats** of each
framework:

| Framework      | Beats with twists                                                   |
|----------------|----------------------------------------------------------------------|
| `save-the-cat` | catalyst, midpoint, all-is-lost, finale                              |
| `three-act`    | inciting-incident, midpoint-twist, climax                            |
| `story-circle` | need, go, find, return-changed                                       |
| `hero-journey` | call-to-adventure, crossing-first-threshold, ordeal, resurrection    |

Each beat carries at least three seed twists; the suite asserts every
canonical major-turn beat has at least one entry.

## LLM mode

Requesting LLM mode (`classifier.kind === "openai"`) sends a single
classifier call with a twist-formatted prompt; the classifier's
`rationale` field is JSON-stringified twist array, parsed and
shape-coerced. Any classifier failure (no method, invalid JSON, empty
array) falls back to the deterministic library — the request never
fails because the model misbehaved.

## Tests

`backend/tests/twist_engine.test.mjs` — 18 tests:
- Deterministic happy path + receipt shape.
- Every canonical major-turn beat has at least one twist (coverage
  assertion).
- All library entries have well-formed fields (id, label, hook,
  severity, rationale).
- Count clamping (max + min).
- Unknown framework / unknown beat / missing input typed errors.
- Pure determinism (same call twice = same array).
- LLM mode: fallback when classifier lacks classifyScene, valid
  classifier response parsed, invalid JSON falls back.
- 5 endpoint integration tests (happy path, unknown frameworkId →
  400, unknown beat → 400, missing frameworkId → 400, count
  honored).

## iOS follow-up (Codex)

Natural Codex follow-ups (out of scope for this PR):
1. Studio beat-timeline cards consuming `POST /craft/twist/suggest`
   when the writer pauses on a major beat.
2. A "save twist for later" path that POSTs the chosen twist back to
   a (future) twist log so accepted reversals influence the next-scene
   prompt context.

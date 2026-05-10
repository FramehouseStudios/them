# T-block-detector — Writer's-block signal detector

Layer 2 of the Craft Intelligence Suite. Surfaces a structured
writer's-block signal the iOS companion can use to nudge — without
guessing at LLM-grade text generation and without introducing a new
persistence domain.

## North-star pillar
**Living creative companion** + **longitudinal learning**. The signal
makes the companion responsive to creative state in addition to scene
text — the difference between a tool and a companion.

## Architecture

Three small pieces, all backend-only:

1. **`backend/lib/block_detector.js`** — pure analysis. Takes a
   snapshot of the user's `habits` plus the current time, returns a
   structured `{ score, level, signals, summary, habitsObserved }`.
2. **Four additive `creative_memory.habits` fields**, written by the
   existing triggers (`recordSceneAttempt`, `recordSceneCompletion`,
   the new `recordTalkTurnForBlockSignal`):
   - `last_scene_attempt_at` — ms timestamp
   - `last_scene_completion_at` — ms timestamp
   - `last_talk_turn_at` — ms timestamp
   - `recent_short_turns` — small rolling counter (0–8)
3. **`GET /memory/block-signal`** — reads `habits`, runs the analyzer,
   returns the signal. Unauthenticated requests get the empty
   snapshot (block-signal is a best-effort hint, never a hard
   authentication gate).

## Signal components

| Key                              | Range | Weight | Computes                                                       |
|----------------------------------|-------|--------|----------------------------------------------------------------|
| `scene_completion_gap`           | 0..1  | 0.40   | days since last scene activity / 14, clamped                  |
| `attempt_completion_dropoff`     | 0..1  | 0.30   | inversely scaled `completed/attempted`, gated on ≥3 attempts  |
| `short_turn_ratio`               | 0..1  | 0.20   | `recent_short_turns / 8`                                       |
| `talk_turn_gap`                  | 0..1  | 0.10   | hours since last /talk turn / 72, clamped                     |

Weights sum to 1.0 so the composite score is naturally normalized.

## Levels

| Score range         | Level   | iOS UX intent (Codex)                  |
|---------------------|---------|----------------------------------------|
| `< 0.25`            | `low`   | No nudge.                              |
| `0.25 ≤ s < 0.55`   | `medium`| Soft companion prompt.                  |
| `≥ 0.55`            | `high`  | Stronger nudge / pivot suggestion.     |

The `summary` field is composed from the dominant signal so the iOS
surface can echo the explanation without phrasing it itself.

## Trigger hooks (backward-compatible)

```
recordSceneCompletion(...)     → stamps last_scene_completion_at + last_scene_attempt_at,
                                 clears recent_short_turns
recordSceneAttempt(...)        → stamps last_scene_attempt_at
recordTalkTurnForBlockSignal() → stamps last_talk_turn_at,
                                 increments recent_short_turns on short transcripts,
                                 decays it on long ones
```

The last hook is also wired into `recordTriggersFromTalkTurn` so any
existing `/talk` turn that runs the creative-memory triggers
automatically updates the block-signal state. Cold users (no habits
record yet) get the empty snapshot — no code path can fail loudly.

## Why no new persistence domain

The block signal is derived data, not a separate stream. Storing four
small fields on the existing `habits` object lets the analyzer read
the data it needs with the same query the prompt-assembly path
already runs. Promote to a new domain only if cross-user block-pattern
training data becomes needed (a Codex/ML decision, not a backend
plumbing one).

## Contract (response shape)

```json
{
  "schemaVersion": 1,
  "score": 0.625,
  "level": "high",
  "signals": [
    { "key": "scene_completion_gap", "value": 1.0, "weight": 0.4 },
    { "key": "attempt_completion_dropoff", "value": 1.0, "weight": 0.3 }
  ],
  "summary": "It's been a while since you finished a scene. Try a low-stakes warm-up.",
  "habitsObserved": {
    "last_scene_attempt_at": 1714752000000,
    "last_scene_completion_at": null,
    "last_talk_turn_at": 1714838400000,
    "scenes_attempted": 8,
    "scenes_completed": 1,
    "recent_short_turns": 5
  }
}
```

## Tests

- `backend/tests/block_detector.test.mjs` — 19 tests:
  - 11 pure analyzer unit tests (cold habits, gap saturation, dropoff,
    short-turn, talk-turn-gap, high-block composite, level boundaries,
    weight sum, habitsObserved echo).
  - 3 trigger-effect tests (completion stamps + clears short-turn,
    attempt stamps only, long-turn decay).
  - 4 endpoint integration tests (unknown user → empty snapshot,
    populated user → expected signal, unauthenticated → empty,
    endpoint↔analyzer round-trip).

## iOS follow-up (Codex)

Out of scope for this PR. Natural Codex follow-up: a left-rail
indicator that consumes `GET /memory/block-signal`, renders the
`summary`, and uses `level` to gate the nudge tone. The endpoint is
stable and forward-compatible — additional signals can land without
breaking the existing iOS decoder.

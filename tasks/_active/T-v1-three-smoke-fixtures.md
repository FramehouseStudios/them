---
id: T-v1-three-smoke-fixtures
title: V1 smoke fixtures — screenplay export + memory recall + realtime failover
owner: claude
status: review
branch: claude/T-v1-screenplay-smoke
pillar: infra (V1 smoke)
v1_pillar: infra
v1_effect: closes the automatable subset of 3 V1 manual-smoke checklist items at once (lines 39, 55, 67)
---

## Scope

Three V1 smoke fixtures shipped together because they share the
same deterministic-no-external-API pattern set by #224 (the V1
voice-to-page smoke):

| V1 line | Manual smoke item | Smoke script |
| --- | --- | --- |
| 39 | Create project → write scene → save → export → reopen | `scripts/v1_screenplay_smoke.mjs` |
| 55 | Mention character → later suggestion recalls them | `scripts/v1_memory_recall_smoke.mjs` |
| 67 | Primary mint works; forced primary failure shows fallback | `scripts/v1_realtime_failover_smoke.mjs` |

Each is the **automatable cheap subset** of the matching manual
smoke. The manual smoke still needs the human to drive an actual
TestFlight build; these scripts catch the upstream regressions
that would make the manual smoke fail before a human even gets to
it.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: closes the automatable subset of 3 V1 manual-smoke
  checklist items at once (lines 39, 55, 67). Each script is the
  cheap tripwire; the full manual smoke still gates V1 sign-off.`

## What each script catches

### v1_screenplay_smoke (line 39)

- Fountain emitter regressions (scene heading format, character
  cue casing, dialogue indentation, title-page order).
- Non-determinism in `exportToFountain(...)`.

Fixture: `backend/fixtures/v1_screenplay_export.json` — a 2-scene
screenplay with title page, action, character cue, dialogue.
8 substring checks + 5 ordering checks + 1 determinism check.

### v1_memory_recall (line 55)

- Creative-memory write regressions (character not persisted).
- Creative-memory read regressions (character missing from prompt
  payload).
- Sanitize-on-read regressions that drop voice/tags iOS depends on.
- Non-determinism across reads.
- Cross-user isolation (other user's memory must not leak).

Runs `recordCharacterMention` → `getCreativeMemoryForPrompt` on
an in-memory JSON persistence and verifies JUNE round-trips with
voice + tags.

### v1_realtime_failover (line 67)

- Failover state-machine regressions on all 4 paths:
  1. `primary_ok` (no fallback attempted)
  2. `primary_fail_fallback_ok` (unpinned primary fail → stub mints)
  3. `primary_fail_fallback_fail` (`supplier_fallback_failed` wrap)
  4. `pinned_provider_fail` (no fallback ever, re-throw as-is)

Uses fake suppliers + stubbed loader. No network. No OpenAI key.

## What none of these catch

- Real iOS-side rendering / playback.
- Real LLM / STT / TTS / WebRTC behavior.
- End-to-end TestFlight smoke (still required for V1 sign-off).

## Verification

- `node scripts/v1_screenplay_smoke.mjs` → PASS
- `node scripts/v1_memory_recall_smoke.mjs` → PASS (recalled
  JUNE with `voice="wry"`, `tags=["protagonist"]`).
- `node scripts/v1_realtime_failover_smoke.mjs` → PASS (4/4
  cases).
- `node --test scripts/v1_screenplay_smoke.test.mjs
     scripts/v1_memory_recall_smoke.test.mjs
     scripts/v1_realtime_failover_smoke.test.mjs` → 7/7 pass.

## Done when

The 3 scripts + their test wrappers ship and pass in CI. The V1
doc's 3 manual-smoke checklist items now have automatable
tripwires above the human-driven smoke.

## Followups

- Wire the 3 scripts into the `eval:canon` umbrella so a single
  command runs them all (separate PR, listed as item 15 in the
  current 15-move queue).
- Add a 4th smoke once Phase 7 talk-pipeline lands — end-to-end
  through the extracted handler, byte-comparable.

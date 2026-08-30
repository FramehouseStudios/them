---
id: T-v1-voice-to-page-smoke
title: V1 voice-to-page smoke fixture + automated subset
owner: support
status: review
branch: support/T-v1-voice-to-page-smoke
pillar: infra (V1 smoke)
v1_pillar: talk
v1_effect: infrastructure for "Manual smoke: record voice -> get reply -> hear reply -> saved turn" (docs/v1-definition.md line 26)
---

## Scope

Ships the deterministic, network-free subset of the V1 voice-to-page
manual smoke. The full manual smoke (real audio → STT → LLM → TTS)
requires `OPENAI_API_KEY` and a recorded audio file; that path stays
in `backend/smoke.sh`. This PR adds the **automatable tripwire**
that catches prompt-path regressions every time tests run.

Three deliverables:

1. **`backend/fixtures/v1_voice_to_page.json`** — canonical fixture:
   simulated STT transcript, persona, creative-memory shape,
   session context, expected prompt substring set + ordering.

2. **`scripts/v1_voice_to_page_smoke.mjs`** — runs `buildModelPrompt`
   on the fixture, verifies:
   - Every `expected_prompt_contains` substring appears.
   - `expected_prompt_ordering` substrings appear in order.
   - Determinism: two consecutive runs produce byte-identical
     prompts.

3. **`scripts/v1_voice_to_page_smoke.test.mjs`** — node:test wrapper
   so the smoke runs as part of `npm test`.

## What this catches

- Re-ordered prompt blocks (e.g. session before memory).
- Missing creative-memory rendering (character name + voice drop).
- Persona leaking into a memory block.
- Non-deterministic prompt assembly (same input → different output).

## What this does NOT catch

- Real STT errors (no audio).
- Real LLM behavior or quality (no API call).
- Real TTS regressions (no audio out).
- End-to-end turn metadata storage / retrieval.

Pair with `backend/smoke.sh` for full end-to-end coverage. This
script is the cheap fast tripwire that fails fast when the prompt
path drifts. Catching prompt-path drift in CI saves the manual
smoke from regressing on something a determinism check could have
caught for free.

## V1 pillar / effect

- `V1 pillar: talk`
- `V1 effect: infrastructure for "Manual smoke: record voice ->
  get reply -> hear reply -> saved turn" (docs/v1-definition.md
  line 26).`

## Verification

- `node scripts/v1_voice_to_page_smoke.mjs` exits 0 against the
  canonical fixture; 7 contains + 6 ordering checks pass;
  determinism check passes.
- `node --test scripts/v1_voice_to_page_smoke.test.mjs` → 3/3
  pass (canonical fixture, --json output, failing-fixture
  regression).
- The failing-fixture test asserts a non-existent substring and
  expects exit 1 — proves the script actually fails when it
  should.

## Followups

- Extend the fixture set with one cold-state turn (no memory) and
  one block-signal turn so the smoke covers more prompt paths.
- Wire into `quality_gate.sh` once the canon umbrella's
  composition is settled.

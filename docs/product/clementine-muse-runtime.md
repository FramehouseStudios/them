# Clementine Muse runtime

> Accepted under **D008**. Product-facing: intent-first. Cost: Reflex / Companion / Page / Deep. Page never shares a bill with chit-chat.

## Goal

Clementine is a **router + memory + taste + wallet** that uses Muse Spark when thinking is worth paying for. She is not Muse Code embedded in the app.

## Stack

| Piece | Choice |
| --- | --- |
| API | Meta Model API `https://api.meta.ai/v1` |
| Brain | `muse-spark-1.2` **Standard** (never default Contributor) |
| Protocol | Responses API |
| ASR | `muse-voice-transcribe-1.0` |
| TTS | third-party (stream on first sentence) |
| Privacy | companion chat `store: false`; hashed safety id |
| Cache | frozen persona + voice-spec prefix; app `prompt_cache_key` e.g. `them-clementine-vN`; dynamic junk at **end** |
| Packaging | Markdown skills under `skills/clementine/`; rare tools via `tool_search` / defer_loading |

## Intent → lane

Product classifies **intent** first, then maps to a cost lane:

| Intent examples | Lane | Brain / effort |
| --- | --- | --- |
| greeting, check-in, known fact, thanks/ack | **Reflex** | tiny local templates (`reflex_lane.js`); later optional server Glimmer |
| normal talk, light tools, memory write | Companion | Spark `minimal` → `low` |
| voice→scene, continue, short rewrite, page propose | **Page** | Spark `low`; `medium` for multi-beat; **own cancel + own meter** |
| plan, conflict, “think hard”, failed first pass | Deep | Spark `medium`; `high` only if user asked or visible “thinking longer” mode |

See **`docs/product/clementine-reflex.md`** for Reflex short-circuit behavior at the talk edge (before wallet/Spark).

## Hard rules

1. **Page is sacred.** Barge-in / manual typing cancels in-flight Page work and drops the reservation. Never finish the paragraph after the writer took the page back.
2. **Spoken ≠ state.** One streamed free-text reply. Hidden second structured call for mood / memory / next-action when needed. Never one generation that is poetry + DB write + screenplay insert.
3. **Page never shares a bill with “how was your day.”** Separate wallet meter from Companion.
4. **Don’t break the cache.** Persona/voice-spec first; no date/user-id/mood in the instructions prefix; don’t rotate tool schemas mid-session.
5. **Wallet caps the meter.** Reserve from `max_output_tokens`. Sell weeks of Clementine; never show TPM. Hard stop at zero; fail like a person.
6. **Glimmer truth.** 30B open weights run on *our* hardware if used. iPhone V1 Reflex = tiny on-device classifier/templates first — not Glimmer-on-device.
7. **Eval before tuning.** ~50 companion scenes including barge-in cancel and page propose. Ship the policy the eval wins.
8. **Reflex before Spark.** Greetings must not burn Companion turns or hit Muse.

## Build order

1. Legal ToS/geo + CORS probe (web BYOK gate)
2. Router + cache-stable runtime
3. Cancel-on-barge-in end-to-end (Page lane)
4. Memory structured tools + background compaction
5. Wallet in turns
6. Voice spec + eval set
7. Reflex lane (tiny local → optional server Glimmer) ← **this step**
8. Skills markdown pack
9. Native BYOK power-user; proxied BYOK only after legal review

## Non-goals

- Embedding Muse Code in the iOS app
- Contributor as default companion traffic
- Dumping 1M context as personality
- Spark on every “gm”
- Skinning Clementine as Meta AI (disclose once, cleanly)

## Change log

- 2026-09-01 — architecture note accepted with D008.
- 2026-09-01 — Reflex lane wired (`T-clementine-reflex-lane`); see `clementine-reflex.md`.

# Clementine Reflex lane — D008

> Build-order step **Reflex lane** (tiny local → optional server Glimmer). Companion to `clementine-muse-runtime.md` / voice spec. **No Spark. No TPM. No wallet debit.**

## What it is

Reflex answers greetings, thanks, check-ins, soft acknowledgements, silence yields, and ultra-short known-fact callbacks with **templates** — short, warm, not needy (Clementine voice).

Complex asks (page work, plans, advice, long recall) return `handled: false` and fall through to Companion / Page / Deep.

## Modules

| File | Role |
| --- | --- |
| `backend/lib/clementine/reflex_classifier.js` | Pure heuristics → `{ isReflex, templateId?, confidence }` |
| `backend/lib/clementine/reflex_templates.js` | Template bank + `{{var}}` interpolation |
| `backend/lib/clementine/reflex_lane.js` | `tryReflexReply({ text, knownFacts, voiceSpecHints? })` |
| `backend/lib/clementine/talk_edge_adapter.js` | Talk-edge helper: eligible lane → short-circuit response |
| `page_lane_adapter.js` | Calls Reflex **before** wallet / Page reserve / `handleTalkRequest` |

## Talk-edge order

1. `classifyIntent` → `laneForIntent`
2. If lane is **Reflex** or **Companion** and `tryReflexReply` succeeds → HTTP 200 with `reply`, headers `x-clementine-reflex: 1`, **skip Spark + wallet**
3. Else continue Page reservation / talk_handler as today

Intent map already sends `greeting` / `check_in` / `silence` → Reflex (`lanes.js`). Thanks / acks may classify as Companion `unknown` but still short-circuit when the Reflex classifier matches.

## Stubs (explicit)

- **No on-device CoreML** classifier yet (iPhone V1 still = these JS heuristics/templates).
- **No server Glimmer** fallback yet.
- Known-fact path only for short probes against caller-supplied `knownFacts` — not full memory tools.

## Change log

- 2026-09-01 — v0 scaffold (T-clementine-reflex-lane).

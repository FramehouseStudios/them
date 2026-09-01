# Clementine memory tools (D008)

> Scaffold for build-order step **Memory write/read as structured tools + compaction in background**. Companion to `clementine-muse-runtime.md`. Standard Muse only — never Contributor as default.

## Four memory tiers

| Tier | Lives where | Cache / prompt role |
| --- | --- | --- |
| **Always-on prefix** | Persona + voice-spec (`cache_policy.buildCacheStablePrefix`) | Frozen instructions; never compacted; no date/user-id/mood; tool schemas that rotate mid-session stay out |
| **Working set** | Recent turns → digest (`memory_working_set.js`) | Dynamic tail only; `shouldCompact` / `compactWorkingSet`; background job may summarize |
| **Episodic** | Scene/session notes (`memory_write` kind `episodic_note` → creative_memory episodic when injected) | Retrieved via `memory_read` / `memory_search` (keyword stub OK) |
| **Semantic profile** | Durable taste/habits (`memory_write` kind `semantic_profile`) | Small patch surface; hooks `recordToneSignal` / lexical fingerprint when store DI is present |

Spoken reply stays separate from machine state (D008): memory ops are structured tools / hidden second call — not poetry + DB write in one generation.

## Modules

- `backend/lib/clementine/memory_tools.js` — OpenAI/Muse tool schemas (`memory_write`, `memory_read`, `memory_search`) with `defer_loading`; thin DI over creative_memory
- `backend/lib/clementine/memory_working_set.js` — compact recent turns; leave always-on prefix untouched
- `backend/lib/clementine/memory_compaction_job.js` — process-local `enqueueCompaction` / `runCompactionOnce`; Spark path may no-op; request shape marks `background: true`

No rewrite of `creative_memory_store.js`. talk_handler wiring is intentionally minimal/zero in this PR.

## Change log

- 2026-09-01 — v0 scaffold (T-clementine-memory-tools).

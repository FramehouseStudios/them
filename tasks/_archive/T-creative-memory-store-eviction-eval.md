---
id: T-creative-memory-store-eviction-eval
title: Pathological-input guard on creative-memory character roster
owner: claude
status: merged
branch: claude/T-creative-memory-store-eviction-eval
pillar: evals (contract stability)
---

## Scope

`recordCharacterMention()` is called from /talk turn handling and
from the iOS character mention path. Without bounds, a heavy user
could grow the per-user character array unbounded — every line of
dialogue introducing a new name.

This eval pins the load-bearing safety nets:

- **De-dup**: 50 mentions of "June" → exactly 1 record.
- **Whitespace-tolerant de-dup**: `"June"`, `"  June  "`, `"June"`
  all collapse to one record.
- **Store cap**: 200 unique names → store keeps exactly
  `CHARACTERS_MAX = 32` records (the most-recently-referenced);
  oldest 168 are dropped. Verified by asserting the most-recent
  name is kept and the oldest is dropped.
- **last_referenced freshness**: Re-mentioning an older record
  updates its `last_referenced` so it ranks above newer records
  for prompt-projection purposes.
- **Empty / whitespace-only / undefined name**: no-op (returns
  `{ action: "skipped" }`).

Wired via `npm run eval:creative-memory-eviction`.

## Done when

`backend/evals/run_creative_memory_eviction_eval.mjs` exits 0 with
all checks passing; `npm test` still green.

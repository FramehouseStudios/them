---
id: T-creative-memory-stats-route
title: GET /memory/stats content-free summary
owner: claude
status: merged
branch: claude/T-creative-memory-stats-route
pillar: layer-3-living (creative-memory surfaces)
---

## Scope

`GET /memory/stats` returns counts and high-level shape of the
authenticated user's creative memory — **without** exposing names,
voice lines, lexical fingerprints, or twist content. iOS uses this
to badge the "what does the companion remember?" sidebar; the user
opens the existing per-domain endpoints (character traits, archetypes,
etc.) for full content.

Response shape:

```json
{
  "schemaVersion": 1,
  "hasMemory": true,
  "counts": {
    "characters": 3,
    "charactersWithVoice": 2,
    "charactersWithTraits": 1,
    "toneSignals": 2,
    "habitSignals": 1
  },
  "lastUpdatedMs": 1715000000000
}
```

Privacy posture: zero leakage by construction — `summarizeMemory()`
emits only numeric counts. Unauthenticated requests return the
zero-state envelope (same conservative pattern as `/memory/block-signal`).

## Done when

`GET /memory/stats` returns the summary; tests cover the summarizer
(no-leakage assertion), the integration path (cold/seeded/unauth),
and the mount guards; `npm test` green.

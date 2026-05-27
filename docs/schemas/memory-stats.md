# memory-stats envelope schema

Canonical shape for `GET /memory/stats`.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/memory/stats` | memory-stats envelope (200), auth error (401) |

## Schema version

`1` (explicit `schemaVersion: 1`).

## Owner

- **Backend**: Claude. `backend/lib/creative_memory_stats_route.js`.
- **Consumer**: iOS plain-language memory summary (V1 line 53).

## Access-control posture

**PER-USER, CONTENT-FREE**. The endpoint resolves the caller's
memory record but returns counts only: no character names, no
traits, no phrases, no themes, and no per-project content.
Trusted authenticated identity is required; caller-supplied
`X-User-Id` is ignored. Unauthenticated callers receive HTTP 401:

```json
{ "stage": "memory_stats", "error": "user_auth_required" }
```

## Fields

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | int | yes (`1`) | |
| `hasMemory` | boolean | yes | false for cold authenticated users |
| `counts` | object | yes | content-free memory shape counts |
| `lastUpdatedMs` | int \| null | yes | epoch ms of the memory record's update time |
| `error` | string | optional | present only when summarization fails; zero envelope still returned |

### counts object

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `characters` | int | yes | number of character records |
| `charactersWithVoice` | int | yes | character records carrying a voice summary |
| `charactersWithTraits` | int | yes | character records carrying trait inventory |
| `toneSignals` | int | yes | number of tone signal buckets |
| `habitSignals` | int | yes | number of habit signal buckets |

## Sample response

```json
{
  "schemaVersion": 1,
  "hasMemory": true,
  "counts": {
    "characters": 3,
    "charactersWithVoice": 2,
    "charactersWithTraits": 1,
    "toneSignals": 4,
    "habitSignals": 2
  },
  "lastUpdatedMs": 1700000000000
}
```

## Compatibility rules

- Additive optional fields are fine within v1.
- Adding user-derived content text or names is not additive. It
  changes the access-control posture and requires a new review.
- iOS treats missing `counts` values as zero for display.

## Changelog

- 2026-05-14 — Corrected to match
  `backend/lib/creative_memory_stats_route.js`.
- 2026-05-26 — Auth/privacy hardening: unauthenticated reads now
  return 401 instead of a zero envelope.

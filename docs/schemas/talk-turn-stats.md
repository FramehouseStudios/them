# talk-turn-stats envelope schema

Canonical response shape for `GET /talk/stats` — the
operator-facing aggregate over talk-turn metadata fed by
`backend/lib/talk_turn_stats.js`.

## Endpoint

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/talk/stats` | aggregate snapshot (see below) |

## Schema version

`1`. Envelope carries an explicit `schemaVersion` field
(`TALK_TURN_STATS_SCHEMA_VERSION`).

## Owner

- **Backend**: Claude. Aggregator + envelope shape in
  `talk_turn_stats.js`.
- **iOS**: not consumed by iOS — operator dashboard only.

## Access-control posture

**SAFE-PUBLIC**. Counts + percentiles + cardinalities only.
Never raw transcript content, raw reply content, or user IDs.
The aggregator is pure: same input → same output, no I/O, no
PII leakage.

## Response shape

```json
{
  "schemaVersion": 1,
  "total": 156,
  "audioDurationMs": { "median": 2400, "p90": 8500, "max": 22_000 },
  "transcriptChars": { "median": 84, "p90": 220, "max": 612 },
  "replyChars": { "median": 142, "p90": 380, "max": 1_244 },
  "uniqueUserCount": 12,
  "uniqueSessionCount": 47,
  "replyRoleCounts": { "preview": 33, "final": 123 },
  "authoritativePageTextRate": 0.78,
  "syncReadyRate": 0.92,
  "ageBuckets": { "last5min": 4, "last1h": 28, "last24h": 89, "older": 35 },
  "newestCreatedAtMs": 1715620920000,
  "oldestCreatedAtMs": 1715000000000
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | int | yes | constant `1` |
| `total` | int | yes | turn count in the aggregation window |
| `audioDurationMs` | object | yes | `{ median, p90, max }` of audio durations |
| `transcriptChars` | object | yes | `{ median, p90, max }` of transcript lengths |
| `replyChars` | object | yes | `{ median, p90, max }` of reply lengths |
| `uniqueUserCount` | int | yes | distinct `userId` values |
| `uniqueSessionCount` | int | yes | distinct `sessionId` values |
| `replyRoleCounts` | object | yes | `{ preview, final }` split |
| `authoritativePageTextRate` | number | yes | 0..1; hits / total |
| `syncReadyRate` | number | yes | 0..1; hits / total |
| `ageBuckets` | object | yes | `{ last5min, last1h, last24h, older }` |
| `newestCreatedAtMs` | int | yes | most recent turn timestamp |
| `oldestCreatedAtMs` | int | yes | earliest turn timestamp |

## Invariants

- Empty input returns a zero-state envelope (all numeric fields
  are 0, both rate fields are 0).
- `ageBuckets` partition is mutually exclusive — a turn lands in
  exactly one bucket.
- Rates use `total` as denominator; both are 0 when `total` is 0.
- Percentiles use linear interpolation; single-element arrays
  return the same value for median / p90 / max.

## Compatibility rules

- New optional aggregate fields are tolerated by operator
  dashboards.
- New `ageBuckets` entries can be added at the high end (e.g.
  `last7d`); existing buckets stay stable.
- Removing or renaming a top-level field requires a schema bump.

## Changelog

- v1 — initial documented shape, matched against the envelope
  built by `summarizeTalkTurns` in
  `backend/lib/talk_turn_stats.js`. `authoritativePageTextRate`
  and `syncReadyRate` reflect screenplay-render-contract usage.
  Earlier draft listed the endpoint as `GET /talk/turn/stats`;
  the live route is `GET /talk/stats` (corrected here).

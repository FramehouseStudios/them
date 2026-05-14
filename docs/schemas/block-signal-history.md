# block-signal-history envelope schema

Canonical response shape for `GET /memory/block-signal/history` —
the bounded read-only projection of `habits.block_signal_history`
populated by `T-block-signal-history-tracking` (#103).

## Endpoint

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/memory/block-signal/history` | history envelope (see below) |

Separate from `/memory/block-signal` (the polling endpoint) so
dashboards / sparklines can read the buffer without triggering
the same-level debounce or adding a new sample on every render.

## Schema version

`1`. Envelope carries an explicit `schemaVersion` field
(camelCase, matching `BLOCK_SIGNAL_HISTORY_SCHEMA_VERSION` in
`backend/lib/block_signal_history_route.js`).

## Owner

- **Backend**: Claude. Envelope built by `summarizeHistory()` in
  `backend/lib/block_signal_history_route.js`.
- **iOS**: Codex. Surfaces block-signal trends on the writer
  view.

## Access-control posture

**PER-USER**. History is keyed by the user id resolved from the
request (bearer token / `X-User-Id` header). The unauthenticated
case returns the zero envelope, not an error — same posture as
`/memory/block-signal`.

## Response shape

```json
{
  "schemaVersion": 1,
  "entries": [
    { "at": 1715620920000, "score": 0.84, "level": "high" },
    { "at": 1715620900000, "score": 0.42, "level": "medium" }
  ],
  "counts": {
    "total": 2,
    "byLevel": { "low": 0, "medium": 1, "high": 1 }
  },
  "newestAt": 1715620920000,
  "oldestAt": 1715620900000
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | int | yes | constant `1` |
| `entries` | array | yes | history records; emitted in source-array order from `habits.block_signal_history` |
| `entries[].at` | int | yes | epoch ms of the sample |
| `entries[].score` | number | yes | 0..1 block-signal score for the sample |
| `entries[].level` | string | yes | normalized level; one of `low`, `medium`, `high` (any unknown string is coerced to `"low"`) |
| `counts` | object | yes | `{ total, byLevel: { low, medium, high } }` rollup |
| `counts.total` | int | yes | `entries.length` |
| `counts.byLevel` | object | yes | per-level integer counts; fixed shape with all three keys always present |
| `newestAt` | int \| null | yes | max `at` across entries; `null` only for empty history |
| `oldestAt` | int \| null | yes | min `at` across entries; `null` only for empty history |

Field-name casing: the live route uses **camelCase**
(`schemaVersion`, `newestAt`, `oldestAt`, `byLevel`) — never
snake_case. Match exactly when consuming.

## Zero envelope

When no user id is resolved (unauthenticated) OR when the user
has no recorded history, the route returns:

```json
{
  "schemaVersion": 1,
  "entries": [],
  "counts": { "total": 0, "byLevel": { "low": 0, "medium": 0, "high": 0 } },
  "newestAt": null,
  "oldestAt": null
}
```

with HTTP 200 — never 401/403/404 for this surface.

## Error envelope

On unexpected backend failure (creative_memory_store throws):

```json
{
  "schemaVersion": 1,
  "entries": [],
  "counts": { "total": 0, "byLevel": { "low": 0, "medium": 0, "high": 0 } },
  "newestAt": null,
  "oldestAt": null,
  "error": "<message>"
}
```

HTTP 500. The shape stays compatible with the zero envelope so
iOS decoders don't need a separate error path; the `error` key
is the discriminator.

## Invariants

- `entries.length === counts.total`.
- `counts.byLevel` always has the three keys `low / medium /
  high`, even when empty (no missing keys).
- `entries` order is whatever the source array produced — the
  route does NOT sort. Producers (the tracking lib) write in
  approximately-chronological order; consumers should not assume
  strictly descending or ascending.
- A future schema bump (v2) is required to add new level values
  or rename any top-level key.

## Compatibility rules

- New optional fields on `entries[]` items are tolerated by
  consumers (extra fields are ignored).
- The level set `low / medium / high` is fixed at v1; adding a
  fourth level requires a v2 bump.
- Removing or renaming `schemaVersion`, `entries`, `counts`,
  `newestAt`, or `oldestAt` requires a schema bump.

## Changelog

- v1 — initial documented shape, matched line-by-line against
  `summarizeHistory()` in
  `backend/lib/block_signal_history_route.js`. Earlier draft
  invented snake_case fields (`schema_version`, `total_seen`,
  `history_cap`, `observed_at`), a different endpoint path,
  and a richer level set (`flow / pending / block`) that the
  live code does not emit; this version corrects all of those
  against the actual route.

# block-signal-history envelope schema

Canonical response shape for `GET /block-signal/history` — the
bounded history of block-signal stamps for the current user.

## Endpoint

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/block-signal/history` | history envelope (see below) |

## Schema version

`1`. Envelope carries an explicit `schema_version` field.

## Owner

- **Backend**: Claude. History store + envelope in
  `backend/lib/block_signal_history_route.js`.
- **iOS**: Codex. Surfaces block-signal trends on the writer view.

## Access-control posture

**PER-USER**. History is scoped to the requesting user (via IP +
session). Authenticated read; never bulk-exposed.

## Response shape

```json
{
  "schema_version": 1,
  "items": [
    {
      "atMs": 1715620920000,
      "level": "block",
      "signals": ["transcript_short", "no_movement"],
      "confidence": 0.84,
      "turn_id": "t_..."
    }
  ],
  "total_seen": 42,
  "history_cap": 200,
  "observed_at": 1715620920000
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `schema_version` | int | yes | constant `1` |
| `items` | array | yes | history entries, most recent first |
| `items[].atMs` | int | yes | epoch ms of the stamp |
| `items[].level` | string | yes | one of `low`, `flow`, `pending`, `block` |
| `items[].signals` | array | yes | named signals that fired |
| `items[].confidence` | number | yes | 0..1 |
| `items[].turn_id` | string \| null | yes | turn that triggered the stamp |
| `total_seen` | int | yes | lifetime count for the user (may exceed `items.length`) |
| `history_cap` | int | yes | bounded retention (typically 200) |
| `observed_at` | int | yes | epoch ms when snapshot was taken |

## Invariants

- `items.length <= history_cap`. Older entries are evicted on
  bounded write.
- `items` is sorted by `atMs` descending (most recent first).
- `total_seen >= items.length`. The gap is the eviction-discarded
  history.
- `level` values are stable across schema versions; new levels
  require a schema bump.

## Compatibility rules

- iOS keys on `items[].level` + `items[].atMs` for the timeline
  view. Other fields are presented as available.
- New optional fields on items (`payoff`, `archetype`, etc.) are
  tolerated.
- Removing or renaming `items`, `level`, or `atMs` requires a
  schema bump.

## Changelog

- v1 — initial documented shape.

# screenplay-companion envelope schemas

Canonical request + response shapes for the screenplay Studio
companion surface — three sibling routes that power the
real-time Studio assistance experience:

- `GET /screenplay/companion/state` — read companion state
- `POST /screenplay/companion/state` — write companion state
- `POST /screenplay/paginate` — compute pagination for a draft
- `POST /screenplay/revision-colors` — compute revision color
  diff between two drafts

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/screenplay/companion/state` | 200 state envelope |
| POST | `/screenplay/companion/state` | 200 `status: "saved"` envelope |
| POST | `/screenplay/paginate` | 200 pagination envelope, 400 missing draft |
| POST | `/screenplay/revision-colors` | 200 revision-color payload, 400 missing draft |

Body limits:
- companion/state: 256kb
- paginate: 2mb
- revision-colors: 2mb

## Schema version

`1`. State envelope embeds the read-meta `schema_version` field
from `buildScreenplayReadMeta`.

## Owner

- **Backend**: Claude. Routes in
  `backend/lib/screenplay_companion_routes.js`.
- **iOS**: Codex. Powers the Studio companion sidebar +
  pagination overlay + revision-mark UI.

## Access-control posture

**PER-USER**. Owner record resolved via
`getOrCreateScreenplayOwnerRecord`. Same scope as
`screenplay-project.md` / `screenplay-version.md`.

## `GET /screenplay/companion/state` response (200)

```json
{
  "stage": "screenplay_companion_state",
  "status": "ok",
  "source": "screenplay_store",
  "source_ip": "10.0.0.1",
  /* ... screenplay-owner envelope fields from buildScreenplayEnvelope ... */
  "companion_state": { /* toScreenplayCompanionStatePayload output */ }
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `stage` | string | yes | constant `"screenplay_companion_state"` |
| `status` | string | yes | `"ok"` on GET, `"saved"` on POST |
| `source` | string | yes | constant `"screenplay_store"` |
| `source_ip` | string | yes | normalized requester IP |
| envelope fields | various | yes | from `buildScreenplayEnvelope` (owner_key, screenplay_projects, active_project_id, schema_version, etc.) |
| companion_state | object | yes | normalized via `normalizeStoredScreenplayCompanionState`. Carries `mode_raw`, `recent_turns`, `analytics`, `signals`. |

## `POST /screenplay/companion/state` request

```json
{
  "mode_raw": "draft",
  "recent_turns": [ /* turn entries */ ],
  "analytics": { /* analytics rollup */ },
  "signals": { /* signal rollup */ }
}
```

All four fields are optional — the route merges with the
prior state and re-normalizes via
`normalizeStoredScreenplayCompanionState`.

## `POST /screenplay/companion/state` response (200)

Same envelope as GET, with `status: "saved"`. The
`companion_state` echoed back is the post-write normalized
state.

## `POST /screenplay/paginate` request

```json
{
  "draft": "FADE IN:\n\nINT. ROOFTOP - NIGHT\n\n...",
  "title": "Rooftop",
  "phase": "scene_draft",
  "lines_per_page": 55,
  "target_pages": 90
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `draft` | string | yes | screenplay draft (CRLF normalized to LF, trimmed). 400 when empty. |
| `title` | string | no | `normalizeSnippet` clamped to 160 chars |
| `phase` | string | no | `normalizeScreenplayPhaseValue` clamped value |
| `lines_per_page` | int | no | `parsePositiveInt(.., 55)`; further clamped to `[24, 120]` |
| `target_pages` | int | no | passed through; `0` → `null` in response |

## `POST /screenplay/paginate` response (200)

```json
{
  "stage": "screenplay_paginate",
  "mode": "computed",
  "title": "Rooftop",
  "phase": "scene_draft",
  "target_pages": 90,
  "page_count": 4,
  "line_count": 220,
  "lines_per_page": 55,
  "pages": [
    { "page": 1, "start_line": 1, "end_line": 55, "line_count": 55, "preview": "...", "est_minutes": 1.00 }
  ],
  "length_profile": "standard"
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `stage` | string | yes | constant `"screenplay_paginate"` |
| `mode` | string | yes | constant `"computed"` |
| `title` / `phase` | string | yes | echoed normalized values |
| `target_pages` | int \| null | yes | echo of request (0 → null) |
| `page_count` | int | yes | `pages.length` (at least 1 — empty draft produces a single placeholder page) |
| `line_count` | int | yes | source line count |
| `lines_per_page` | int | yes | resolved value (clamped) |
| `pages` | array | yes | per-page descriptor objects |
| `length_profile` | string | yes | `"short"` (≤2), `"standard"` (≤6), or `"long"` (>6) based on `page_count` |

Per-page descriptor: `{ page, start_line, end_line, line_count, preview, est_minutes }`. `est_minutes` = `line_count / 55` (rounded to 2 decimals).

## `POST /screenplay/paginate` errors

| HTTP | `error` | Cause |
| --- | --- | --- |
| 400 | `draft_required` | `draft` empty after trim |

Stage on error: `"screenplay_paginate"`.

## `POST /screenplay/revision-colors` request

```json
{
  "draft": "<current draft>",
  "base_draft": "<prior draft to diff against>",
  "revision_color": "blue"
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `draft` | string | yes | current draft; 400 when empty |
| `base_draft` | string | no | prior draft; CRLF-normalized; defaults to empty |
| `revision_color` | string | no | clamped to 24 chars; defaults to `"blue"` |

## `POST /screenplay/revision-colors` response (200)

The response is whatever `buildScreenplayRevisionPayload`
returns — typically `{ stage, color, marks, ... }`. iOS
should treat the marks list as the primary payload for
rendering revision-color stripes alongside the draft.

## `POST /screenplay/revision-colors` errors

| HTTP | `error` | Cause |
| --- | --- | --- |
| 400 | `draft_required` | `draft` empty after trim |

Stage on error: `"screenplay_revision"`.

## Invariants

- `companion/state` POST persists via `markScreenplayOwnerDirty`
  (writes to the screenplay store on disk).
- The POST merges into the prior state — first-page-written
  analytics are preserved across writes (sticky).
- `paginate` always returns at least one page (placeholder
  when the draft has no lines).
- `lines_per_page` is clamped to `[24, 120]` even if the
  request supplies a lower/higher value.
- `revision-colors` defaults to `"blue"` when no color is
  supplied — matches industry-standard revision color codes.

## Compatibility rules

- iOS keys on `companion_state` (for the state surface),
  `pages[]` (for pagination), and the marks list (for
  revision colors).
- Adding new optional fields is tolerated.
- Adding new `length_profile` values is additive — iOS should
  treat unknowns as opaque.
- Removing any of the documented stage / status / count fields
  requires a schema bump.

## Changelog

- v1 — initial documented shape, matched line-by-line against
  the four handlers in `backend/lib/screenplay_companion_routes.js`.

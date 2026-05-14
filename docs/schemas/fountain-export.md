# fountain-export envelope schema

Canonical response shape for the screenplay Fountain export
endpoint and the underlying `exportToFountain` library function.

## Endpoint

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/screenplays/{id}/export?format=fountain` | Fountain envelope (see below) |

## Schema version

`1`. Envelope carries an explicit `schema_version` field.

## Owner

- **Backend**: Claude. `exportToFountain` in
  `backend/lib/fountain_export.js`; route in
  `fountain_export_route.js`.
- **iOS**: Codex. Consumes the Fountain text for share / save UI.

## Access-control posture

**PER-USER**. Screenplay content is user-authored; never expose
across users. Same posture as `screenplay-project.md` /
`screenplay-version.md`.

## Response shape

```json
{
  "schema_version": 1,
  "format": "fountain",
  "project_id": "p_...",
  "version_id": "v_...",
  "title": "My Screenplay",
  "fountain_text": "Title: My Screenplay\n\nFADE IN:\n\nINT. ROOM - DAY\n\n...",
  "scene_count": 12,
  "character_count": 4,
  "line_count": 248,
  "exported_at": 1715620920000
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `schema_version` | int | yes | constant `1` |
| `format` | string | yes | constant `"fountain"` |
| `project_id` | string | yes | id of the source project |
| `version_id` | string | yes | id of the source version |
| `title` | string | yes | project title (may be empty for untitled) |
| `fountain_text` | string | yes | the full Fountain-formatted screenplay text |
| `scene_count` | int | yes | scenes in the export |
| `character_count` | int | yes | distinct character names |
| `line_count` | int | yes | output line count (informational) |
| `exported_at` | int | yes | epoch ms |

## Ordering invariants

These are pinned by `v1_screenplay_smoke` (#231) and must not
regress:

- **Scenes render in document order** (sorted by scene index).
- **Within a scene**: scene heading → action lines → character →
  parentheticals → dialogue → transitions.
- **Character lines render before action lines** under the same
  scene block.
- **Transitions render between scenes**, not within.
- **Determinism**: two consecutive runs on the same input produce
  byte-identical `fountain_text`.

## Errors

| HTTP | `error` | When |
| --- | --- | --- |
| 404 | `project_not_found` | unknown project id |
| 404 | `version_not_found` | unknown version id |
| 400 | `format_unsupported` | format param != "fountain" (other formats route to their own envelopes) |
| 403 | `forbidden_owner_mismatch` | requester is not the project owner |

## Compatibility rules

- iOS keys on `fountain_text` as the primary payload; metadata
  fields are presented when available.
- Adding optional metadata fields (e.g. `compile_status`) is
  tolerated.
- Changing the Fountain text generation rules requires:
  1. A note on the agent-event lane.
  2. A bump of the relevant invariant in the v1_screenplay_smoke
     fixture if behavior changes.
- Removing `fountain_text`, `format`, `schema_version`, or any
  count field requires a schema bump.

## Changelog

- v1 — initial documented shape. Ordering invariants pinned by
  `v1_screenplay_smoke`.

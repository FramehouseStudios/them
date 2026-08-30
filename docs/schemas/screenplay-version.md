# screenplay-version envelope schema

Canonical shape for `POST /screenplay/projects/:projectId/version`.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| POST | `/screenplay/projects/:projectId/version` | 201 on save; 409 on stale conflict; 400 on bad input; 404 on missing project |

## Schema version

`1`.

## Owner

- **Backend**: support agent. `mountScreenplayProjectsRoutes` in
  `backend/lib/screenplay_projects_routes.js` (PR #197).
- **iOS decoder**: Codex.

## Access-control posture

**PER-USER**.

## Success envelope (201 created or 200 conflict)

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `ok` | boolean | yes | constant `true` |
| `stage` | string | yes | `"screenplay_version"` |
| `status` | string | yes | `"saved"` or `"conflict"` |
| `created_project` | boolean | yes | constant `false` (project must exist) |
| `project_id` | string | yes | echoes path param |
| `version_id` | string | yes | newly-created version's id |
| `version` | object | yes | `screenplay-version` object (see below) |
| `project` | object | yes | project payload with `includeVersions: true, includeDrafts: true, versionLimit: 24` |
| `format_score` | number | yes | 0-1 |
| `story_score` | number | yes | 0-1 |
| `confidence_class` | string | yes | `"low"` / `"medium"` / `"high"` |
| `warnings` | array | yes | any score warnings |
| `base_version_id` | string | yes | echoes request body |
| `server_version_id` | string | yes | actual stored version id |
| `server_version` | object | yes | the full stored version |
| `conflict` | boolean | yes | `false` on save; `true` on 409 |

## Version object shape

| Key | Type | Notes |
| --- | --- | --- |
| `id` | string | unique id |
| `projectId` | string | parent project |
| `phase` | string | normalized phase |
| `source` | string | typically `"studio_autosave"` or `"manual_save"` |
| `createdAt` | int | epoch ms |
| `updatedAt` | int | epoch ms |
| `prompt` | string | reserved for future prompt-traceability; empty today |
| `notes` | string | ≤240 chars |
| `formatScore` | number | from `scoreScreenplayDraft` |
| `storyScore` | number | from `scoreScreenplayDraft` |
| `confidenceClass` | string | from `scoreScreenplayDraft` |
| `warnings` | array | from `scoreScreenplayDraft` |
| `draft` | string | full draft text |
| `draftExcerpt` | string | ≤220 chars |
| `studioWriteAnchors` | array | iOS Studio per-write anchors |
| `screenplayBindings` | array | iOS Studio bindings |

## Stale-base-version handling (409 conflict)

When `conflict_strategy === "reject_if_stale"` (default) and
`base_version_id` doesn't match the project's `activeVersionId`,
return 409 with `conflict: true` and the server's current version
under `server_version` + `server_version_id`. iOS uses this to
prompt the user to reconcile (merge / discard / overwrite).

## Error responses

| Code | HTTP | Notes |
| --- | --- | --- |
| `project_not_found` | 404 | `:projectId` missing |
| `draft_required` | 400 | empty draft body |

## Compatibility rules

- Additive fields fine.
- `confidence_class` adding new values is additive; removing is v2.
- The conflict envelope's keys (`server_version_id`,
  `server_version`, `conflict`) are load-bearing for iOS reconcile
  UI; never rename.

## Changelog

- 2026-05-14 — Doc created. Reflects PR #197 shape.

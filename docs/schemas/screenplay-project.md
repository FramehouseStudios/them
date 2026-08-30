# screenplay-project envelope schema

Canonical shape for `GET /screenplay/projects` (list) and
`GET /screenplay/projects/:projectId` (detail) and the project
field that appears inside `POST /screenplay/projects` /
`POST .../version` envelopes.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/screenplay/projects` | `{ ok, stage, screenplay_projects: [project, …], screenplay_project_count, screenplay_active_project_id, ... }` |
| GET | `/screenplay/projects/:projectId` | `{ ok, stage, project, screenplay_project_count, screenplay_active_project_id }` |
| POST | `/screenplay/projects` | same shape as `GET .../:projectId` plus `status, created, project_id, screenplay_projects` |

## Schema version

`1`. No explicit `schemaVersion` field today.

## Owner

- **Backend / envelope shape**: support agent.
  `backend/lib/screenplay_projects_routes.js` (PR #192, #197).
- **iOS decoder**: Codex.

## Access-control posture

**PER-USER**. The owner record is resolved from the request; reads
and writes are scoped to that owner. Trusted auth identity is required
for every `/screenplay/projects*` request. Caller-supplied
`X-User-Id` is ignored; unauthenticated callers receive HTTP 401:

```json
{ "stage": "screenplay_projects", "error": "user_auth_required" }
```

## Project object shape

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | canonical project id |
| `title` | string | yes | display title |
| `tags` | string[] | yes | normalized, ≤24 items |
| `characters` | string[] | yes | normalized, ≤24 items |
| `setting` | string | yes | ≤120 chars |
| `tone` | string | yes | ≤120 chars |
| `lastPhase` | string | yes | one of canonical phase values; default `"scene_draft"` |
| `createdAt` | int | yes | epoch ms |
| `updatedAt` | int | yes | epoch ms; bumped on any write |
| `versionCount` | int | yes | derived count |
| `lastVersionId` | string | yes | most-recent version id; empty when no versions |
| `lastVersionAt` | int | yes | epoch ms of last version |
| `activeVersionId` | string | yes | currently-active version |
| `formatScore` | number | yes | 0-1; from latest version |
| `storyScore` | number | yes | 0-1; from latest version |
| `confidenceClass` | string | yes | `"low"` / `"medium"` / `"high"` |
| `latestExcerpt` | string | yes | up to 220 chars of latest draft |
| `actCount` | int | yes | outline.acts.length |
| `sceneCount` | int | yes | outline.scenes.length |
| `beatCount` | int | yes | outline.beats.length |
| `outlineUpdatedAt` | int | yes | epoch ms |
| `collaboratorCount` | int | yes | approved collaborators |
| `approvedEmails` | string[] | yes | approved collaborator emails |
| `commentCount` | int | yes | non-deleted comments |
| `lastCommentAt` | int | yes | most-recent comment timestamp |
| `studioThreadViewState` | object \| null | optional | iOS Studio state, opaque to backend |
| `studioDiffAcknowledgedKeys` | string[] | optional | iOS Studio state, opaque |
| `studioDiffAcknowledgedEntries` | array | optional | iOS Studio state, opaque |
| `archived` | boolean | yes | soft-archive flag |
| `versions` | array | when `includeVersions: true` | version objects; see `screenplay-version.md` |
| `outline` | object | when `includeVersions: true` | acts + scenes + beats |
| `collaborators` | array | when included | collaborator objects |
| `comments` | array | when included | comment objects |

## Sample list response

```json
{
  "ok": true,
  "stage": "screenplay_projects",
  "source": "screenplay_store",
  "screenplay_active_project_id": "p1",
  "screenplay_project_count": 2,
  "screenplay_projects": [
    {
      "id": "p1",
      "title": "Rooftop",
      "tags": ["noir"],
      "characters": ["JUNE"],
      "setting": "City rooftop, rainy night",
      "tone": "wry",
      "lastPhase": "rewrite",
      "createdAt": 1700000000000,
      "updatedAt": 1700009000000,
      "versionCount": 3,
      "lastVersionId": "v3",
      "lastVersionAt": 1700009000000,
      "activeVersionId": "v3",
      "formatScore": 0.8,
      "storyScore": 0.7,
      "confidenceClass": "high",
      "latestExcerpt": "EXT. ROOFTOP - NIGHT...",
      "actCount": 3,
      "sceneCount": 12,
      "beatCount": 8,
      "outlineUpdatedAt": 1700005000000,
      "collaboratorCount": 1,
      "approvedEmails": ["alice@example.com"],
      "commentCount": 4,
      "lastCommentAt": 1700008500000,
      "archived": false
    }
  ]
}
```

## Compatibility rules

- Additive new optional fields are fine.
- Field type narrowing (e.g. `string | null` → `string`) is v2.
- iOS decoders must tolerate unknown keys (drop them, don't fail).

## Error responses

| Code | HTTP | Notes |
| --- | --- | --- |
| `user_auth_required` | 401 | Missing trusted auth identity; `X-User-Id` is ignored. |
| `screenplay_persistence_failed` | 503 | A project write could not be durably saved. |

## Changelog

- 2026-05-27 — Screenplay project routes require trusted auth
  identity and surface write persistence failures.
- 2026-05-14 — Doc created. Reflects shape produced by
  `mountScreenplayProjectsRoutes` (PR #192, #197).

# Blank project initialization reliability

Blank Studio projects use the atomic initialization route, not the ordinary
project metadata upsert:

```json
{
  "project_id": "project-<stable client UUID>",
  "title": "Untitled",
  "phase": "scene_draft",
  "blank_project": { "client_request_id": "<stable request UUID>" }
}
```

The canonical project stores the request ID and a SHA-256 hash of the immutable
creation intent. Successful and replayed responses include a top-level
`blank_creation` receipt containing `client_request_id`, `project_id`, and
`creation_request_hash`. A client must match both echoed IDs to its durable
outbox row before retiring that row. The hash lets the server reject changed or
corrupted replays; it is not a substitute for the client's ID checks.

## Rollback limitations

- Server versions predating this contract do not preserve
  `initialCreationRequestId` or `initialCreationRequestHash` when they normalize
  and rewrite a screenplay owner. If an older server rewrites a newly created
  project, rolling forward again cannot prove the original replay. The new
  server will return `409 screenplay_initial_request_reused`; operators must
  reconcile the project and the retained client outbox entry manually.
- New clients must call `/screenplay/projects/initialize` and must not fall back
  to the collection metadata-upsert route. An older server rejects the explicit
  initialization envelope instead of safely replaying it. The older collection
  route does not understand the receipt and can treat an explicit project ID as
  an ordinary metadata update.
- Deploy the receipt-preserving server before the client starts emitting blank
  initialization envelopes. A rollback after client rollout requires draining
  or pausing blank-project creation first.

The receipt fields remain internal project metadata and are not exposed by the
ordinary project payload. Only the bounded top-level `blank_creation` receipt is
public.

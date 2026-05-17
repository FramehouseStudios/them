# T-accepted-twist-log — Persist accepted twist cards for prompt context

Layer 2 follow-up of the Craft Intelligence Suite. When a writer
accepts a twist surfaced by `POST /craft/twist/suggest`
(T-twist-engine), the choice persists so future prompt-assembly can
reference the chosen reversal. Pure persistence + a small prompt
helper. No LLM mode.

## North-star pillar
**Living creative companion** + **longitudinal learning**. A twist
the writer accepted yesterday should still be part of how the
companion thinks about today's scene.

## Architecture

Three pieces, all backend-only:

1. **`backend/lib/accepted_twist_log.js`** — pure module:
   - `recordAcceptedTwist({ persistence, projectId, versionId?, frameworkId?, beatId?, twist, userId?, sceneId?, note? })`
   - `getAcceptedTwistsForProject({ persistence, projectId, limit? })`
   - `removeAcceptedTwist({ persistence, projectId, versionId?, twistId })`
   - `buildAcceptedTwistsBlockForPrompt(entries)` — compact one-line
     summary for embedding in a system prompt.
2. **New persistence domain `accepted_twists`** + migration
   `006_accepted_twists.sql` (mirrors the `005_logline_history.sql`
   shape).
3. **Three endpoints under `/craft/twist/accepted*`**:
   - `POST /craft/twist/accepted` — record an acceptance (idempotent
     on `twistId`).
   - `GET /craft/twist/accepted?projectId=` — chronological log.
   - `DELETE /craft/twist/accepted/:twistId?projectId=&versionId=`
     — un-accept.

## Storage shape

```
key:  entry:<projectId>:<versionId|->:<twistId>
value: {
  schemaVersion: 1,
  projectId, versionId, frameworkId, beatId,
  twist: { id, label, hook, severity, rationale },
  acceptedAt, acceptedAtMs,
  lastUpdatedAt, lastUpdatedAtMs,
  userId, sceneId, note
}
```

One row per `twistId` per `(projectId, versionId)`. Re-POSTing the
same twistId preserves the original `acceptedAt` and only refreshes
`lastUpdatedAt` + mutable fields — iOS can call POST on every
acceptance event without double-counting.

## Endpoint contracts

### `POST /craft/twist/accepted`

```
Request:
  projectId    string  (required)
  versionId    string?
  frameworkId  string?  (e.g. "save-the-cat")
  beatId       string?  (e.g. "midpoint")
  twist        { id, label, hook, severity?, rationale? }  (required;
               severity coerces to "medium" if invalid)
  userId       string?  (falls back to req.user.id)
  sceneId      string?
  note         string?  (≤240 chars)

Response (200):
  {
    schemaVersion: 1,
    ok: true,
    action: "recorded" | "updated",
    entry: { ...storage shape }
  }

Errors:
  400 craft_invalid_screenplay  missing projectId / malformed twist /
                                persistence not configured
```

### `GET /craft/twist/accepted?projectId=<id>`

```
Response (200):
  { schemaVersion: 1, projectId, entries: [<storage shape>] }

  entries are sorted by acceptedAtMs ascending — oldest first — so a
  prompt-assembly path can fold newest-N off the tail without
  re-sorting.

Errors:
  400 craft_invalid_screenplay  missing projectId
```

### `DELETE /craft/twist/accepted/:twistId?projectId=<id>&versionId=<v>`

```
Response (200):
  { schemaVersion: 1, ok: true, action: "removed" }

Errors:
  400 craft_invalid_screenplay  missing projectId / twist not found
```

## Prompt integration

`buildAcceptedTwistsBlockForPrompt(entries)` returns a one-line-per-
twist string suitable for the existing prompt-assembly path:

```
- False Victory @midpoint (high): The win at midpoint is real, but the cost was paid by the wrong person.
- Villain Was Right @all-is-lost (high): The hero realizes the antagonist's framing of the problem was correct.
```

Newest first, capped at `PROMPT_BLOCK_ITEM_CAP` (6) entries so older
context doesn't crowd out the active reversal. The block is not
auto-wired into the prompt today; the prompt-assembly path can opt in
when iOS surfaces are ready to consume the impact.

## Tests

`backend/tests/accepted_twist_log.test.mjs` — 17 tests:
- 11 pure module unit tests (storageKey shape, _sanitizeTwist
  rejection + severity coercion, recordAcceptedTwist input
  validation, round-trip, idempotent re-acceptance, chronological
  sort, removeAcceptedTwist + not_found, prompt-block newest-first +
  cap + cold input, MAX_LOG_ENTRIES floor).
- 6 endpoint integration tests (POST happy path, POST missing
  projectId, POST malformed twist, GET chronological order, DELETE
  removed + second delete 400, GET missing projectId).

Plus the existing `KNOWN_DOMAINS` invariant in
`backend/tests/persistence_adapter.test.mjs` is updated to assert the
new `accepted_twists` domain.

## iOS follow-up (Codex)

Natural Codex follow-ups (out of scope for this PR):
1. Studio twist-card UI calls `POST /craft/twist/accepted` when the
   writer taps "Keep this twist" on a `POST /craft/twist/suggest`
   card; calls `DELETE` on dismiss.
2. Beat timeline shows accepted twists as small pinned cards under
   each beat; uses `GET /craft/twist/accepted?projectId=`.
3. The prompt-assembly path on the backend can opt into emitting the
   `buildAcceptedTwistsBlockForPrompt` summary inside its existing
   system-prompt block once iOS-side acceptance flow is live.

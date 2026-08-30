---
id: T-decisions-queue-route
title: GET /coordination/decisions-queue returns the queue as JSON
owner: support
status: merged
branch: support/T-decisions-queue-route
pillar: coordination
---

## Scope

`docs/decisions-queue.md` is the single-file queue of items waiting on
the human's decision (per T-decisions-queue). Today it's markdown-only,
which means iOS / dashboards / Codex's automation cannot surface
"unanswered for N days" without re-implementing the parser.

This PR adds a thin read-only projection of the file:

- `backend/lib/decisions_queue_route.js` exports a pure
  `parseDecisionsQueueMarkdown(text)` plus `mountDecisionsQueueRoute(app)`.
- The parser reads `### D-<slug> — <title>` entries under `## Open`
  and `## Resolved` headings, capturing each `- **Field name:**`
  bullet as a snake_cased key on the entry.
- The route returns `{ schemaVersion, open[], resolved[], counts }`
  with `Cache-Control: no-store`.
- A missing file is treated as an empty queue (200 + empty arrays),
  matching the conservative-defaults posture of other coordination
  surfaces.

The route resolves the queue path relative to the module via
`fileURLToPath(import.meta.url)`, so it's robust to whichever working
directory the server is launched from.

## Done when

`GET /coordination/decisions-queue` returns the parsed queue;
`backend/tests/decisions_queue_route.test.mjs` covers parser shape +
endpoint integration + missing-file fallback; `npm test` green.

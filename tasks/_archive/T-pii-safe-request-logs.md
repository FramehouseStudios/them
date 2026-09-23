---
id: T-pii-safe-request-logs
title: Redact PII from structured request logs
owner: codex
status: merged
branch: codex/T-pii-safe-request-logs
pillar: infra
v1_pillar: infra
v1_effect: prevents collaborator emails, tokens, prompts, screenplay content, and dynamic path values from entering backend access logs before release
---

## Scope

- Replace the two-line access logger that copied `req.url`, including query
  parameters, into backend logs.
- Emit one structured completion record containing only the request method,
  developer-defined route template, response status, latency, safe response
  metadata, and a strictly validated request identifier.
- Never log concrete URLs, query strings, bodies, request headers, or arbitrary
  request identifiers; use a neutral marker for unmatched and early-rejected
  requests.
- Keep failed health probes visible while filtering successful probe noise, and
  support JSON/text formats plus severity thresholds.

## Done When

- Raw and percent-encoded query PII cannot reach either log format.
- Dynamic path values and attacker-shaped request IDs cannot reach access logs.
- A real Express request proves the middleware resolves the matched route
  template only after routing completes.
- Focused and full backend tests, strict pre-flight, task-frontmatter
  validation, syntax checks, and `git diff --check` pass.

## Verification

- `cd backend && node --test tests/request_logger.test.mjs`
  - Passed 16/16, including live Express route-template, CORS rejection, and
    aborted-response regressions.
- `cd backend && npm test`
  - Passed 1234, skipped 1, failed 0.
- `node scripts/pre_flight.mjs --strict`
  - Passed with no findings.
- `node scripts/tasks_active_frontmatter_eval.mjs --strict`
  - Passed 94 task files.
- `node --check backend/lib/request_logger.js`
  - Passed.
- `node --check backend/middleware/auth.js`
  - Passed.
- `git diff --check`
  - Passed.

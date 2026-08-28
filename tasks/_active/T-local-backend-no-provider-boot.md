---
id: T-local-backend-no-provider-boot
title: Keep local backend bootable without provider credentials
owner: codex
status: review
branch: codex/T-local-backend-no-provider-boot
pillar: infra
v1_pillar: realtime
v1_effect: lets the real app reach local auth, memory, and degraded realtime surfaces before private provider credentials are configured
---

## Scope

- Normalize the optional local `OPENAI_API_KEY` configuration to the
  string-valued dependency contract used by extracted realtime routes.
- Reserve the process-level missing-provider-key refusal for production; local
  development must boot so auth, persistence, diagnostics, and degraded states
  remain testable without private credentials.
- Preserve the documented request-time 503 response for provider-backed paths
  when the key is unavailable.
- Add a process-level regression that starts the real development backend with
  `OPENAI_API_KEY` absent.

## Done When

- The development backend reaches `/health` without `OPENAI_API_KEY`.
- `POST /realtime/call` returns the documented 503 envelope instead of
  crashing during route mount.
- Focused backend tests, strict pre-flight, task-frontmatter validation, and
  `git diff --check` pass.

## Verification

- `node --test backend/tests/backend_startup_without_openai_key.test.mjs backend/tests/realtime_call_route.test.mjs`
  - Passed 19/19.
- `cd backend && npm test`
  - Passed 1217, skipped 1, failed 0.
- `node scripts/pre_flight.mjs --strict`
  - Passed with no findings.
- `node scripts/tasks_active_frontmatter_eval.mjs --strict`
  - Passed 93 task files.
- Live Mac app smoke against the repaired local startup behavior
  - Local backend reached `http://127.0.0.1:3001` without a provider key.
  - Account creation/sign-in succeeded.
  - Data Controls changed from connection/auth failures to `No companion memory yet.`

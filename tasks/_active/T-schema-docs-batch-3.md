---
id: T-schema-docs-batch-3
title: Schema doc batch 3 + docs/schemas/INDEX.md
owner: claude
status: review
branch: claude/T-schema-docs-batch-3
pillar: infra (schema discipline)
v1_pillar: infra
v1_effect: closes the remaining auth + internal-record schema gaps and gives iOS one INDEX entry point for every documented envelope
---

## Scope

Adds 5 new envelope docs under `docs/schemas/` and a top-level
`INDEX.md` that lists every schema doc with its surface, posture,
and a one-line summary.

### New docs

- `apple-auth.md` — `POST /auth/apple` request + response.
- `password-reset.md` — `request_password_reset` + `reset_password`.
- `email-verification.md` — `request_email_verification` + `verify_email`.
- `outbox-event.md` — outbox store record shape (internal).
- `persona-snapshot.md` — persona record shape.

### INDEX

Groups all 16 schema docs by surface (auth / talk / screenplay /
memory / realtime / ops / internal) with posture column.
Includes the schema-versioning rule + the "how to add a new
schema doc" recipe.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: closes the remaining auth + internal-record schema
  gaps. Every documented envelope iOS depends on now has a
  canonical doc, and the INDEX gives Codex one entry point to
  audit envelope drift instead of grepping the docs tree.`

## Verification

- All 5 new docs follow the existing schema-doc pattern
  (Endpoints, Schema version, Owner, Access-control posture,
  Fields, Errors, Invariants, Compatibility, Changelog).
- INDEX.md cross-references every doc in `docs/schemas/`.
- No live route is touched; pure documentation.

## Done when

5 new schema docs + INDEX land. Codex can audit envelope drift
from one file.

## Followups (not in this PR)

- Pre-flight rule that flags `backend/lib/*.js` exporting a route
  whose envelope is not referenced in any `docs/schemas/*.md`.
  Out of scope here — needs a static-scan rule design.
- Optional `--check` mode for `scripts/v1_status.mjs` that fails
  CI when an envelope changes without a schema-doc update. Out
  of scope here.

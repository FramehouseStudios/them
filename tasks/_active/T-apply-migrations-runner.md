---
id: T-apply-migrations-runner
title: scripts/apply_migrations.mjs — apply all backend/migrations/*.sql in order
owner: support
status: review
branch: support/backend-apply-migrations
pillar: infra (enables all)
v1_pillar: infra
v1_effect: closes V1 deploy gap; before this script, only migrations/001 was ever applied by automation. Migrations 002-007 had to be applied manually.
---

## Scope

- `scripts/apply_migrations.mjs`: discovers `backend/migrations/*.sql`,
  applies them in numeric order inside a transaction each, tracks
  applied set in a new `_schema_migrations` table, supports `--dry-run`
  and `--status` flags.
- Idempotent: re-running is a no-op.
- Detects checksum drift (an applied migration file changed in source)
  and exits non-zero with a clear message.

## Done when

- `DATABASE_URL=... node scripts/apply_migrations.mjs --status` lists
  every migration as PENDING on a fresh DB.
- After one apply run, the same command lists every migration as applied.
- Re-running is a no-op.
- Editing an applied migration file → next run errors out with the
  checksum mismatch.

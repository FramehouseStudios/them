#!/usr/bin/env node
//
// scripts/apply_migrations.mjs — repo-root entrypoint for the migration runner.
// The canonical implementation lives at backend/scripts/apply_migrations.mjs so
// it ships inside the Docker image (build context is backend/) and can run as a
// render.yaml preDeployCommand. This shim delegates to it, so existing callers
// that reference the repo-root path (CI, local `node scripts/apply_migrations.mjs
// [--status|--dry-run]`) keep working against a single implementation. Flags in
// process.argv and DATABASE_URL pass through unchanged.

import { run } from "../backend/scripts/apply_migrations.mjs";

run().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});

#!/usr/bin/env node
// Compatibility entry point for operators and existing CI. The canonical
// implementation lives inside backend/ so the same code ships in its image.

import { runCli } from "../backend/ops/apply_migrations.mjs";

process.exitCode = await runCli();

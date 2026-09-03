#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { runMigrations } from "./apply_migrations.mjs";
import { initializeEmptyAuthStore } from "./initialize_empty_auth_store.mjs";

async function runRenderPredeploy({
  databaseUrl = process.env.DATABASE_URL || "",
  confirmation = process.env.AUTH_STORE_EMPTY_INIT_CONFIRMATION || "",
  migrate = runMigrations,
  initializeAuth = initializeEmptyAuthStore,
  logger = console,
} = {}) {
  await migrate({ databaseUrl, logger });
  await initializeAuth({ databaseUrl, confirmation, logger });
}

async function runCli({ logger = console } = {}) {
  try {
    await runRenderPredeploy({ logger });
    return 0;
  } catch (error) {
    logger.error(error?.stack || error?.message || error);
    return Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

export { runCli, runRenderPredeploy };

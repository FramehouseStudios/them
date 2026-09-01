import assert from "node:assert/strict";
import { test } from "node:test";

import { createPostgresPersistence } from "../lib/persistence_postgres.js";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();

test("[postgres-live] prefix metacharacters are literal in a real Postgres query", {
  skip: databaseUrl ? false : "DATABASE_URL is not configured",
}, async () => {
  const persistence = createPostgresPersistence({ databaseUrl });
  const runId = `${process.pid}-${Date.now()}`;
  const prefix = `like-audit-${runId}%_\\folder`;
  const exactKeys = [`${prefix}:alpha`, `${prefix}:beta`];
  const wildcardOnlyKey = `like-audit-${runId}-anythingXfolder:wrong`;
  const keys = [...exactKeys, wildcardOnlyKey];

  try {
    for (const key of keys) {
      await persistence.put({ domain: "screenplay", key, value: { key } });
    }

    const records = await persistence.list({ domain: "screenplay", prefix });
    assert.deepEqual(records.map((record) => record.key), exactKeys);
  } finally {
    for (const key of keys) {
      await persistence.delete({ domain: "screenplay", key });
    }
    await persistence.close();
  }
});

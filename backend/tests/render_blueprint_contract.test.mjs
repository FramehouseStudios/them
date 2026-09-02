import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const blueprint = readFileSync(new URL("../render.yaml", import.meta.url), "utf8");
const databaseBlock = blueprint.match(/^databases:\n([\s\S]*)$/m)?.[1] ?? "";

test("[render-blueprint] production Postgres uses a supported flexible compute plan", () => {
  assert.match(databaseBlock, /^\s+- name: them-postgres$/m);
  assert.match(databaseBlock, /^\s+plan: 0\.1c-256mb$/m);
  assert.doesNotMatch(databaseBlock, /^\s+plan: starter$/m);
});

test("[render-blueprint] production resources remain single-region and manually promoted", () => {
  assert.match(blueprint, /^\s+autoDeploy: false\b/m);
  assert.match(blueprint, /^\s+plan: 0\.5c-512mb$/m);
  assert.doesNotMatch(blueprint, /^\s+plan: starter$/m);
  assert.equal((blueprint.match(/^\s+- type: web$/gm) ?? []).length, 1);
  assert.equal((blueprint.match(/^\s+- name: them-postgres$/gm) ?? []).length, 1);
  assert.equal((blueprint.match(/^\s+region: oregon$/gm) ?? []).length, 2);
});

test("[render-blueprint] production database and JWT credentials are provisioned safely", () => {
  assert.match(
    blueprint,
    /- key: DATABASE_URL\n\s+fromDatabase:\n\s+name: them-postgres\n\s+property: connectionString/,
  );
  assert.match(blueprint, /- key: JWT_SECRET\n\s+generateValue: true/);
  assert.doesNotMatch(blueprint, /- key: DATABASE_URL\n\s+sync: false/);
  assert.doesNotMatch(blueprint, /- key: JWT_SECRET\n\s+sync: false/);
});

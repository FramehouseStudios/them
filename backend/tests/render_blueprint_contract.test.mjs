import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const blueprint = readFileSync(new URL("../render.yaml", import.meta.url), "utf8");
const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
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
  assert.match(blueprint, /^\s+dockerfilePath: \.\/backend\/Dockerfile$/m);
  assert.match(blueprint, /^\s+dockerContext: \.\/backend$/m);
  assert.match(blueprint, /^\s+preDeployCommand: node \/app\/ops\/render_predeploy\.mjs$/m);
  assert.match(blueprint, /^\s+numInstances: 1$/m);
  assert.equal((blueprint.match(/^\s+- type: web$/gm) ?? []).length, 2);
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

test("[render-blueprint] empty auth bootstrap remains explicit and one-time", () => {
  assert.match(blueprint, /- key: AUTH_STORE_EMPTY_INIT_CONFIRMATION\n\s+sync: false/);
  assert.doesNotMatch(blueprint, /AUTH_STORE_EMPTY_INIT_CONFIRMATION\n\s+value:/);
  assert.doesNotMatch(blueprint, /migrate_stores_to_postgres|allow-empty-auth/);
});

test("[render-blueprint] non-root runtime can create crash-safe local recovery mirrors", () => {
  assert.match(dockerfile, /mkdir -p \/app/);
  assert.match(dockerfile, /chown them:them \/app/);
  assert.match(dockerfile, /^USER them$/m);
});

test("[render-blueprint] public policy is a manually promoted static service", () => {
  assert.match(blueprint, /name: them-public\n\s+runtime: static/);
  assert.match(
    blueprint,
    /buildCommand: test -f site\/index\.html && test -f site\/privacy\/index\.html/,
  );
  assert.match(blueprint, /staticPublishPath: \.\/site/);
  assert.match(blueprint, /domains:\n\s+- them\.io/);
  assert.equal((blueprint.match(/^\s+autoDeploy: false\b/gm) ?? []).length, 2);
});

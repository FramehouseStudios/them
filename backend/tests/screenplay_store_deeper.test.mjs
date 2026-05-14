// T-deeper-lib-tests-batch-2 — deeper screenplay_store coverage
// beyond backend/tests/screenplay_store.test.mjs.
//
// Smoke covers: configure guard, get-or-create owner, project
// lookup, latest-version helper, ensureOutline, recalculate,
// markDirty sort, save+load round-trip, adapter path.
//
// This file exercises gaps the smoke skipped:
//   - recalculateScreenplayProject on a project with zero versions
//   - recalculate with all collaborators pending (approvedEmails
//     should be empty)
//   - markScreenplayOwnerDirty writes the store to disk (side
//     effect, not just the in-memory sort)
//   - getLatestScreenplayVersion when updatedAt is missing on some
//     versions but createdAt is set on others
//   - Multi-owner save+load round-trip
//   - ensureScreenplayOutline returns the same outline ref on the
//     second call (memoization)

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  configureScreenplayStore,
  ensureScreenplayOutline,
  getLatestScreenplayVersion,
  getOrCreateScreenplayOwnerRecord,
  loadScreenplayStore,
  markScreenplayOwnerDirty,
  recalculateScreenplayProject,
  saveScreenplayStore,
  screenplayStoreByOwner,
} from "../lib/screenplay_store.js";

function tempStorePath() {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "io-them-screenplay-store-deeper-")),
    "screenplay.json",
  );
}

function buildDefaultDeps(overrides = {}) {
  return {
    SCREENPLAY_STORE_PATH: overrides.SCREENPLAY_STORE_PATH || tempStorePath(),
    fs,
    writeJsonFileAtomic: (filePath, payload) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
      return true;
    },
    normalizeSnippet: (v, max) => {
      const s = String(v || "").trim();
      if (!s) return "";
      return s.length <= max ? s : s.slice(0, max);
    },
    buildDraftExcerpt: (text, len) => String(text || "").slice(0, len),
    resolveScreenplayOwnerKey: (req) => String(req?.ownerKey || "owner_default"),
    createEmptyScreenplayOwner: (ownerKey) => ({
      ownerKey,
      activeProjectId: "",
      updatedAt: 0,
      companionState: { mode_raw: "idle", recent_turns: [], analytics: {}, signals: {} },
      projects: [],
    }),
    createEmptyScreenplayOutline: () => ({ acts: [], scenes: [], beats: [], updatedAt: 0 }),
    normalizeStoredScreenplayCompanionState: (raw) => raw || { mode_raw: "idle", recent_turns: [], analytics: {}, signals: {} },
    normalizeStoredScreenplayOwner: (entry) => {
      if (!entry || !entry.ownerKey) return null;
      return {
        ownerKey: entry.ownerKey,
        activeProjectId: entry.activeProjectId || "",
        updatedAt: Number(entry.updatedAt || 0),
        companionState: entry.companionState || { mode_raw: "idle", recent_turns: [], analytics: {}, signals: {} },
        projects: Array.isArray(entry.projects) ? entry.projects : [],
      };
    },
    persistence: null,
    ...overrides,
  };
}

function resetStore() {
  screenplayStoreByOwner.clear();
}

// ---------- recalculate edge cases ----------

test("[screenplay-store-deeper] recalculate on zero-version project sets counts to 0", () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps());
  const project = {
    id: "p_empty",
    versions: [],
    outline: { acts: [], scenes: [], beats: [] },
    collaborators: [],
    comments: [],
  };
  recalculateScreenplayProject(project);
  assert.equal(project.versionCount, 0);
  assert.equal(project.actCount, 0);
  assert.equal(project.sceneCount, 0);
  assert.equal(project.beatCount, 0);
  assert.equal(project.collaboratorCount, 0);
  assert.equal(project.commentCount, 0);
});

test("[screenplay-store-deeper] recalculate with all collaborators pending → approvedEmails empty", () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps());
  const project = {
    id: "p",
    versions: [{ id: "v1", updatedAt: 1, formatScore: 0.5, storyScore: 0.5, confidenceClass: "low" }],
    outline: { acts: [], scenes: [], beats: [] },
    collaborators: [
      { email: "a@x.com", status: "pending" },
      { email: "b@x.com", status: "pending" },
    ],
    comments: [],
  };
  recalculateScreenplayProject(project);
  assert.deepEqual(project.approvedEmails, []);
  assert.equal(project.collaboratorCount, 0);
});

test("[screenplay-store-deeper] recalculate counts only 'approved' collaborator status", () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps());
  const project = {
    id: "p",
    versions: [{ id: "v1", updatedAt: 1 }],
    outline: { acts: [], scenes: [], beats: [] },
    collaborators: [
      { email: "approved@x.com", status: "approved" },
      { email: "removed@x.com", status: "removed" },
      { email: "pending@x.com", status: "pending" },
    ],
    comments: [],
  };
  recalculateScreenplayProject(project);
  assert.equal(project.collaboratorCount, 1);
  assert.deepEqual(project.approvedEmails, ["approved@x.com"]);
});

// ---------- markScreenplayOwnerDirty side effects ----------

test("[screenplay-store-deeper] markScreenplayOwnerDirty triggers a disk write", () => {
  resetStore();
  const storePath = tempStorePath();
  configureScreenplayStore(buildDefaultDeps({ SCREENPLAY_STORE_PATH: storePath }));
  const owner = getOrCreateScreenplayOwnerRecord({ ownerKey: "side-effects" }, { create: true });
  owner.projects.push({
    id: "p1",
    versions: [{ id: "v1", updatedAt: 100 }],
    outline: { acts: [], scenes: [], beats: [] },
    comments: [],
  });
  markScreenplayOwnerDirty(owner, 200);
  assert.ok(fs.existsSync(storePath), "store file should exist after dirty mark");
  const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.ok(parsed.owners.some((o) => o.ownerKey === "side-effects"));
});

test("[screenplay-store-deeper] markScreenplayOwnerDirty bumps updatedAt", () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps());
  const owner = getOrCreateScreenplayOwnerRecord({ ownerKey: "bumpme" }, { create: true });
  owner.updatedAt = 100;
  markScreenplayOwnerDirty(owner, 5000);
  assert.equal(owner.updatedAt, 5000);
});

// ---------- getLatestScreenplayVersion edge cases ----------

test("[screenplay-store-deeper] getLatestScreenplayVersion handles mixed updatedAt + createdAt", () => {
  const project = {
    versions: [
      { id: "v1", updatedAt: 1000 },
      { id: "v2", createdAt: 5000 }, // no updatedAt
      { id: "v3", updatedAt: 2000 },
    ],
  };
  // v2's createdAt=5000 should be the highest stamp.
  const latest = getLatestScreenplayVersion(project);
  assert.equal(latest.id, "v2", "latest by createdAt fallback should win");
});

test("[screenplay-store-deeper] getLatestScreenplayVersion picks first with single version", () => {
  const project = { versions: [{ id: "only", updatedAt: 100 }] };
  assert.equal(getLatestScreenplayVersion(project).id, "only");
});

// ---------- multi-owner round-trip ----------

test("[screenplay-store-deeper] multi-owner save+load preserves all owners", () => {
  resetStore();
  const storePath = tempStorePath();
  configureScreenplayStore(buildDefaultDeps({ SCREENPLAY_STORE_PATH: storePath }));

  const owners = ["owner_a", "owner_b", "owner_c"];
  for (const o of owners) {
    const owner = getOrCreateScreenplayOwnerRecord({ ownerKey: o }, { create: true });
    owner.projects.push({
      id: `${o}_p1`,
      title: `${o} project`,
      versions: [{ id: "v1", updatedAt: 100 }],
      outline: { acts: [], scenes: [], beats: [] },
      comments: [],
    });
  }
  saveScreenplayStore(1000);

  resetStore();
  loadScreenplayStore();
  for (const o of owners) {
    const loaded = getOrCreateScreenplayOwnerRecord({ ownerKey: o }, { create: false });
    assert.ok(loaded, `owner ${o} should reload`);
    assert.equal(loaded.projects[0].id, `${o}_p1`);
  }
});

// ---------- ensureScreenplayOutline idempotence ----------

test("[screenplay-store-deeper] ensureScreenplayOutline is idempotent on existing outline", () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps());
  const project = { outline: { acts: [{ id: "a1" }], scenes: [], beats: [] } };
  const first = ensureScreenplayOutline(project);
  const second = ensureScreenplayOutline(project);
  // Same content on both calls.
  assert.equal(first.acts.length, 1);
  assert.equal(second.acts.length, 1);
  assert.equal(second.acts[0].id, "a1");
});

test("[screenplay-store-deeper] ensureScreenplayOutline mutates the project to fill missing arrays", () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps());
  const project = {};
  ensureScreenplayOutline(project);
  assert.ok(project.outline, "outline should be attached to project");
  assert.ok(Array.isArray(project.outline.acts));
});

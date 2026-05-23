// T-screenplay-store-smoke-test — direct tests for backend/lib/screenplay_store.js.
//
// Phase 2 of the decomposition (#192, #197) exercised this store
// indirectly through the route tests. This adds direct coverage
// for the store's own API surface:
//
//   - configureScreenplayStore / screenplayStoreDeps
//   - getOrCreateScreenplayOwnerRecord (create + lookup)
//   - getScreenplayProjectRecord
//   - getLatestScreenplayVersion (sort by updatedAt desc)
//   - ensureScreenplayOutline (fills missing arrays)
//   - recalculateScreenplayProject (derived counts + scores)
//   - markScreenplayOwnerDirty (sorts projects, updates timestamp,
//     triggers saveScreenplayStore)
//   - loadScreenplayStore / saveScreenplayStore round-trip on a
//     temp JSON file
//   - loadScreenplayStoreFromAdapter when persistence.list is
//     mocked

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
  getScreenplayProjectRecord,
  loadScreenplayStore,
  loadScreenplayStoreFromAdapter,
  markScreenplayOwnerDirty,
  recalculateScreenplayProject,
  saveScreenplayStore,
  screenplayStoreByOwner,
} from "../lib/screenplay_store.js";

// ---------- shared helpers ----------

function tempStorePath() {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "io-them-screenplay-store-")),
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

// ---------- configureScreenplayStore + screenplayStoreDeps ----------

test("[screenplay-store] uncalled API throws 'not configured'", () => {
  resetStore();
  // Reset to uninitialized state by passing in an invalid configure
  // and verifying load path errors loudly. Note: we can't actually
  // un-configure in this module's contract; getOrCreate would also
  // throw. The point: deps MUST be supplied.
  configureScreenplayStore(buildDefaultDeps());
  // OK — recreate the throw-on-missing-deps path by passing partial
  // deps and triggering a code path that needs the missing key.
  configureScreenplayStore({});
  assert.throws(
    () => getOrCreateScreenplayOwnerRecord({ ownerKey: "x" }, { create: true }),
    // Either "not configured" or a TypeError because functions are undefined.
    /not configured|is not a function/,
  );
});

// ---------- core lookups ----------

test("[screenplay-store] getOrCreateScreenplayOwnerRecord creates an owner when absent", () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps());
  const owner = getOrCreateScreenplayOwnerRecord({ ownerKey: "alpha" }, { create: true });
  assert.equal(owner.ownerKey, "alpha");
  assert.deepEqual(owner.projects, []);
});

test("[screenplay-store] getOrCreateScreenplayOwnerRecord returns null when create=false and owner is absent", () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps());
  const owner = getOrCreateScreenplayOwnerRecord({ ownerKey: "missing" }, { create: false });
  assert.equal(owner, null);
});

test("[screenplay-store] getOrCreateScreenplayOwnerRecord returns existing owner on re-lookup", () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps());
  const o1 = getOrCreateScreenplayOwnerRecord({ ownerKey: "stable" }, { create: true });
  o1.projects.push({ id: "p1", title: "Test", versions: [], outline: { acts: [], scenes: [], beats: [] } });
  const o2 = getOrCreateScreenplayOwnerRecord({ ownerKey: "stable" }, { create: true });
  assert.equal(o2.projects.length, 1);
  assert.equal(o2.projects[0].id, "p1");
});

test("[screenplay-store] getScreenplayProjectRecord finds by id", () => {
  const owner = {
    projects: [
      { id: "p1", title: "First" },
      { id: "p2", title: "Second" },
    ],
  };
  assert.equal(getScreenplayProjectRecord(owner, "p2").title, "Second");
  assert.equal(getScreenplayProjectRecord(owner, "missing"), null);
  assert.equal(getScreenplayProjectRecord(null, "p1"), null);
  assert.equal(getScreenplayProjectRecord({}, "p1"), null);
});

// ---------- version + outline helpers ----------

test("[screenplay-store] getLatestScreenplayVersion picks most recently updated", () => {
  const project = {
    versions: [
      { id: "v1", updatedAt: 1000 },
      { id: "v2", updatedAt: 3000 },
      { id: "v3", updatedAt: 2000 },
    ],
  };
  assert.equal(getLatestScreenplayVersion(project).id, "v2");
});

test("[screenplay-store] getLatestScreenplayVersion returns null for empty/missing versions", () => {
  assert.equal(getLatestScreenplayVersion(null), null);
  assert.equal(getLatestScreenplayVersion({}), null);
  assert.equal(getLatestScreenplayVersion({ versions: [] }), null);
});

test("[screenplay-store] getLatestScreenplayVersion falls back to createdAt", () => {
  const project = {
    versions: [
      { id: "v1", createdAt: 1000 },
      { id: "v2", createdAt: 5000 },
    ],
  };
  assert.equal(getLatestScreenplayVersion(project).id, "v2");
});

test("[screenplay-store] ensureScreenplayOutline fills missing arrays", () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps());
  const project = {};
  const outline = ensureScreenplayOutline(project);
  assert.ok(Array.isArray(outline.acts));
  assert.ok(Array.isArray(outline.scenes));
  assert.ok(Array.isArray(outline.beats));
});

test("[screenplay-store] ensureScreenplayOutline preserves existing arrays", () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps());
  const project = {
    outline: {
      acts: [{ id: "act1" }],
      scenes: [],
      beats: [{ id: "b1" }],
    },
  };
  const outline = ensureScreenplayOutline(project);
  assert.equal(outline.acts.length, 1);
  assert.equal(outline.beats.length, 1);
});

// ---------- recalculate + markDirty ----------

test("[screenplay-store] recalculateScreenplayProject computes derived counts", () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps());
  const project = {
    id: "p1",
    versions: [
      { id: "v1", updatedAt: 1000, draftExcerpt: "first", formatScore: 0.8, storyScore: 0.7, confidenceClass: "high", phase: "scene_draft" },
      { id: "v2", updatedAt: 2000, draftExcerpt: "second", formatScore: 0.6, storyScore: 0.5, confidenceClass: "medium", phase: "rewrite" },
    ],
    outline: {
      acts: [{ id: "a1" }, { id: "a2" }],
      scenes: [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
      beats: [{ id: "b1" }],
      updatedAt: 1500,
    },
    collaborators: [
      { email: "alice@example.com", status: "approved" },
      { email: "bob@example.com", status: "pending" },
    ],
    comments: [
      { id: "c1", createdAt: 500, updatedAt: 600 },
    ],
  };
  recalculateScreenplayProject(project);
  assert.equal(project.versionCount, 2);
  assert.equal(project.lastVersionId, "v2");
  assert.equal(project.lastVersionAt, 2000);
  assert.equal(project.actCount, 2);
  assert.equal(project.sceneCount, 3);
  assert.equal(project.beatCount, 1);
  assert.equal(project.collaboratorCount, 1);
  assert.deepEqual(project.approvedEmails, ["alice@example.com"]);
  assert.equal(project.commentCount, 1);
  assert.equal(project.formatScore, 0.6);
  assert.equal(project.storyScore, 0.5);
});

test("[screenplay-store] recalculateScreenplayProject resets stale active version to latest", () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps());
  const project = {
    id: "p_restore",
    activeVersionId: "missing_version",
    versions: [
      { id: "v1", updatedAt: 100 },
      { id: "v2", updatedAt: 200 },
    ],
    outline: { acts: [], scenes: [], beats: [] },
    collaborators: [],
    comments: [],
  };

  recalculateScreenplayProject(project);

  assert.equal(project.lastVersionId, "v2");
  assert.equal(project.activeVersionId, "v2");
});

test("[screenplay-store] markScreenplayOwnerDirty sorts projects by updatedAt desc", () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps());
  const owner = getOrCreateScreenplayOwnerRecord({ ownerKey: "sortme" }, { create: true });
  owner.projects.push(
    { id: "p_old", versions: [{ updatedAt: 100 }], outline: { acts: [], scenes: [], beats: [] }, comments: [] },
    { id: "p_new", versions: [{ updatedAt: 9999 }], outline: { acts: [], scenes: [], beats: [] }, comments: [] },
    { id: "p_mid", versions: [{ updatedAt: 5000 }], outline: { acts: [], scenes: [], beats: [] }, comments: [] },
  );
  markScreenplayOwnerDirty(owner, 10_000);
  assert.equal(owner.projects[0].id, "p_new");
  assert.equal(owner.projects[1].id, "p_mid");
  assert.equal(owner.projects[2].id, "p_old");
});

// ---------- save + load round-trip ----------

test("[screenplay-store] save + load round-trip preserves owners + projects", () => {
  resetStore();
  const storePath = tempStorePath();
  configureScreenplayStore(buildDefaultDeps({ SCREENPLAY_STORE_PATH: storePath }));

  const owner = getOrCreateScreenplayOwnerRecord({ ownerKey: "roundtrip" }, { create: true });
  owner.projects.push({
    id: "p1",
    title: "Round-trip test",
    versions: [{ id: "v1", updatedAt: 2000, formatScore: 0.5, storyScore: 0.5, confidenceClass: "medium" }],
    outline: { acts: [], scenes: [], beats: [] },
    comments: [],
  });
  owner.activeProjectId = "p1";
  saveScreenplayStore(3000);

  // Verify the JSON was written to disk with the expected shape.
  assert.ok(fs.existsSync(storePath));
  const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.equal(parsed.version, 1);
  assert.equal(parsed.owners.length, 1);
  assert.equal(parsed.owners[0].ownerKey, "roundtrip");
  assert.equal(parsed.owners[0].projects[0].id, "p1");

  // Reset + reload from disk.
  resetStore();
  loadScreenplayStore();
  const reloaded = getOrCreateScreenplayOwnerRecord({ ownerKey: "roundtrip" }, { create: false });
  assert.ok(reloaded);
  assert.equal(reloaded.activeProjectId, "p1");
  assert.equal(reloaded.projects[0].title, "Round-trip test");
});

test("[screenplay-store] loadScreenplayStore is a no-op when file is missing", () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps({ SCREENPLAY_STORE_PATH: "/tmp/io-them-doesnt-exist.json" }));
  loadScreenplayStore();
  assert.equal(screenplayStoreByOwner.size, 0);
});

// ---------- adapter path ----------

test("[screenplay-store] loadScreenplayStoreFromAdapter returns false when no records", async () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps({
    persistence: {
      async list() { return []; },
    },
  }));
  const ok = await loadScreenplayStoreFromAdapter();
  assert.equal(ok, false);
});

test("[screenplay-store] loadScreenplayStoreFromAdapter hydrates from adapter records", async () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps({
    persistence: {
      async list() {
        return [
          {
            key: "adapter_owner",
            value: {
              ownerKey: "adapter_owner",
              activeProjectId: "adapter_p1",
              updatedAt: 1000,
              projects: [{ id: "adapter_p1", title: "From adapter" }],
            },
          },
        ];
      },
    },
  }));
  const ok = await loadScreenplayStoreFromAdapter();
  assert.equal(ok, true);
  const owner = getOrCreateScreenplayOwnerRecord({ ownerKey: "adapter_owner" }, { create: false });
  assert.equal(owner.projects[0].title, "From adapter");
});

test("[screenplay-store] loadScreenplayStoreFromAdapter returns false when persistence is missing", async () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps({ persistence: null }));
  const ok = await loadScreenplayStoreFromAdapter();
  assert.equal(ok, false);
});

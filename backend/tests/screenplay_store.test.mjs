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
  commitScreenplayOwnerMutation,
  configureScreenplayStore,
  ensureScreenplayOutline,
  getLatestScreenplayVersion,
  getOrCreateScreenplayOwnerRecord,
  getScreenplayProjectRecord,
  loadScreenplayStore,
  loadScreenplayStoreFromAdapter,
  markScreenplayOwnerDirty,
  recalculateScreenplayProject,
  refreshScreenplayOwnerRecord,
  saveScreenplayStore,
  screenplayStoreByOwner,
  tombstoneScreenplayOwnerRecord,
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

function inMemoryCASPersistence(initialValue = null) {
  let value = initialValue == null ? null : structuredClone(initialValue);
  const stats = { gets: 0, puts: 0, swaps: 0 };
  return {
    kind: "memory-cas",
    stats,
    async get() {
      stats.gets += 1;
      return value == null ? null : structuredClone(value);
    },
    async put({ value: nextValue }) {
      stats.puts += 1;
      value = structuredClone(nextValue);
    },
    async compareAndSwap({ expectedValue, value: nextValue }) {
      stats.swaps += 1;
      if (JSON.stringify(value) !== JSON.stringify(expectedValue)) return false;
      value = structuredClone(nextValue);
      return true;
    },
    async delete() {
      value = null;
    },
    async list() {
      return value == null ? [] : [{ key: value.ownerKey, value: structuredClone(value) }];
    },
    current() {
      return value == null ? null : structuredClone(value);
    },
  };
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
  assert.equal(parsed.version, 2);
  assert.deepEqual(parsed.adapterBackedOwnerKeys, []);
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

test("[screenplay-store] saveScreenplayStore reports disk write failure", () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps({
    writeJsonFileAtomic: () => false,
  }));
  const owner = getOrCreateScreenplayOwnerRecord({ ownerKey: "fail-write" }, { create: true });
  owner.projects.push({ id: "p1", versions: [], outline: { acts: [], scenes: [], beats: [] }, comments: [] });

  const result = saveScreenplayStore(4000);

  assert.equal(result.ok, false);
  assert.equal(result.fileOk, false);
  assert.equal(result.persistencePromise, null);
});

test("[screenplay-store] mirror-only saves never bulk-put cached owners", () => {
  resetStore();
  let puts = 0;
  const storePath = tempStorePath();
  configureScreenplayStore(buildDefaultDeps({
    SCREENPLAY_STORE_PATH: storePath,
    persistence: {
      kind: "postgres",
      async put() { puts += 1; },
    },
  }));
  const owner = getOrCreateScreenplayOwnerRecord({ ownerKey: "mirror-only" });
  owner.projects.push({ id: "p1", title: "Cached", outline: {}, versions: [], comments: [] });

  const result = saveScreenplayStore(4100, {
    persistAdapter: false,
    preferPersistedOwners: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.persistenceStatus, "skipped");
  assert.equal(result.persistencePromise, null);
  assert.equal(puts, 0);
});

test("[screenplay-store] markScreenplayOwnerDirty exposes adapter persistence failures", async () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps({
    persistence: {
      kind: "postgres",
      async put() {
        throw new Error("postgres down");
      },
    },
  }));
  const owner = getOrCreateScreenplayOwnerRecord({ ownerKey: "adapter-fail" }, { create: true });
  owner.projects.push({ id: "p1", versions: [], outline: { acts: [], scenes: [], beats: [] }, comments: [] });

  const result = markScreenplayOwnerDirty(owner, 5000);
  const persisted = await result.persistencePromise;

  assert.equal(result.ok, true);
  assert.equal(result.fileOk, true);
  assert.equal(result.persistenceKind, "postgres");
  assert.equal(persisted.ok, false);
  assert.equal(persisted.persistenceFailureCount, 1);
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

test("[screenplay-store] adapter hydration paginates beyond the 10k persistence cap", async () => {
  resetStore();
  const firstPage = Array.from({ length: 10_000 }, (_, index) => ({
    key: `owner-${String(index).padStart(5, "0")}`,
    value: null,
  }));
  const finalOwner = {
    ownerKey: "owner-10000",
    activeProjectId: "p-final",
    updatedAt: 2000,
    projects: [{ id: "p-final", title: "Beyond first page" }],
  };
  const cursors = [];
  configureScreenplayStore(buildDefaultDeps({
    persistence: {
      async list({ afterKey }) {
        cursors.push(afterKey);
        return afterKey ? [{ key: finalOwner.ownerKey, value: finalOwner }] : firstPage;
      },
    },
  }));

  const ok = await loadScreenplayStoreFromAdapter();

  assert.equal(ok, true);
  assert.deepEqual(cursors, ["", "owner-09999"]);
  assert.equal(screenplayStoreByOwner.get(finalOwner.ownerKey).projects[0].title, "Beyond first page");
});

test("[screenplay-store] loadScreenplayStoreFromAdapter returns false when persistence is missing", async () => {
  resetStore();
  configureScreenplayStore(buildDefaultDeps({ persistence: null }));
  const ok = await loadScreenplayStoreFromAdapter();
  assert.equal(ok, false);
});

test("[screenplay-store] adapter hydration overlays matching owners without hiding file-only owners", async () => {
  resetStore();
  const storePath = tempStorePath();
  configureScreenplayStore(buildDefaultDeps({ SCREENPLAY_STORE_PATH: storePath }));
  const ownerA = getOrCreateScreenplayOwnerRecord({ ownerKey: "owner-a" });
  ownerA.projects.push({ id: "a-file", title: "A from file", outline: {}, versions: [], comments: [] });
  const ownerB = getOrCreateScreenplayOwnerRecord({ ownerKey: "owner-b" });
  ownerB.projects.push({ id: "b-file", title: "B from file", outline: {}, versions: [], comments: [] });
  saveScreenplayStore(1000);

  resetStore();
  configureScreenplayStore(buildDefaultDeps({
    SCREENPLAY_STORE_PATH: storePath,
    persistence: {
      async list() {
        return [{
          key: "owner-a",
          value: {
            ownerKey: "owner-a",
            activeProjectId: "a-adapter",
            updatedAt: 2000,
            projects: [{ id: "a-adapter", title: "A from adapter" }],
          },
        }];
      },
    },
  }));
  loadScreenplayStore();
  await loadScreenplayStoreFromAdapter();

  assert.equal(screenplayStoreByOwner.size, 2);
  assert.equal(screenplayStoreByOwner.get("owner-a").projects[0].title, "A from adapter");
  assert.equal(screenplayStoreByOwner.get("owner-b").projects[0].title, "B from file");
});

test("[screenplay-store] owner mutation commits through CAS and mirrors the durable winner", async () => {
  resetStore();
  const storePath = tempStorePath();
  const canonical = {
    ownerKey: "cas-owner",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{
      id: "p1",
      title: "Before",
      outline: { revision: 0, acts: [], scenes: [], beats: [] },
      versions: [],
      comments: [],
    }],
  };
  const persistence = inMemoryCASPersistence(canonical);
  configureScreenplayStore(buildDefaultDeps({
    SCREENPLAY_STORE_PATH: storePath,
    persistence,
  }));
  screenplayStoreByOwner.set(canonical.ownerKey, structuredClone(canonical));

  const committed = await commitScreenplayOwnerMutation({
    ownerKey: "cas-owner",
    now: 3000,
    mutate(nextOwner) {
      nextOwner.projects[0].title = "After";
      nextOwner.projects[0].outlineRevision = 1;
      nextOwner.projects[0].outline.revision = 1;
      nextOwner.projects[0].outlineMutationReceipts = [{
        requestId: "outline-1",
        requestHash: "hash-1",
        committedRevision: 1,
      }];
      return { kind: "saved" };
    },
  });

  assert.equal(committed.ok, true);
  assert.equal(committed.committed, true);
  assert.equal(persistence.stats.swaps, 1);
  assert.equal(persistence.stats.puts, 0);
  assert.equal(persistence.current().projects[0].title, "After");
  assert.equal(persistence.current().projects[0].outlineRevision, 1);
  assert.equal(persistence.current().projects[0].outlineMutationReceipts[0].requestId, "outline-1");
  const mirror = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.equal(mirror.owners[0].projects[0].title, "After");
});

test("[screenplay-store] canonical CAS acknowledgement survives a legacy mirror failure", async () => {
  resetStore();
  const canonical = {
    ownerKey: "mirror-fail",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{ id: "p1", title: "Before", outline: {}, versions: [], comments: [] }],
  };
  const persistence = inMemoryCASPersistence(canonical);
  let mirrorFails = true;
  configureScreenplayStore(buildDefaultDeps({
    persistence,
    writeJsonFileAtomic: (filePath, payload) => {
      if (mirrorFails) return false;
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
      return true;
    },
  }));
  screenplayStoreByOwner.set(canonical.ownerKey, structuredClone(canonical));

  const committed = await commitScreenplayOwnerMutation({
    ownerKey: "mirror-fail",
    mutate(nextOwner) {
      nextOwner.projects[0].title = "Durable";
      return { kind: "saved" };
    },
  });

  assert.equal(committed.ok, true);
  assert.equal(committed.committed, true);
  assert.equal(committed.fileOk, false);
  assert.equal(committed.persistenceFailureCount, 0);
  assert.equal(committed.mirrorFailureCount, 1);
  assert.equal(persistence.current().projects[0].title, "Durable");

  mirrorFails = false;
  const replayed = await commitScreenplayOwnerMutation({
    ownerKey: "mirror-fail",
    mutate(nextOwner) {
      if (nextOwner.projects[0].title === "Durable") {
        return { commit: false, kind: "replayed" };
      }
      throw new Error("durable winner was not reloaded");
    },
  });
  assert.equal(replayed.ok, true);
  assert.equal(replayed.committed, true);
  assert.equal(replayed.result.kind, "replayed");
});

test("[screenplay-store] legacy CAS writes acknowledge the canonical adapter when only the mirror fails", async () => {
  resetStore();
  const canonical = {
    ownerKey: "legacy-mirror-fail",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{ id: "p1", title: "Before", outline: {}, versions: [], comments: [] }],
  };
  const persistence = inMemoryCASPersistence(canonical);
  configureScreenplayStore(buildDefaultDeps({
    persistence,
    writeJsonFileAtomic: () => false,
  }));
  await loadScreenplayStoreFromAdapter();
  const owner = screenplayStoreByOwner.get(canonical.ownerKey);
  owner.projects[0].comments.push({ id: "comment-durable", text: "Keep this once" });

  const saved = markScreenplayOwnerDirty(owner, 2000);
  const persisted = await saved.persistencePromise;

  assert.equal(persisted.ok, true);
  assert.equal(persisted.persistenceStatus, "mirror_failed");
  assert.equal(persisted.persistenceFailureCount, 0);
  assert.equal(persisted.mirrorFailureCount, 1);
  assert.equal(persistence.current().projects[0].comments.length, 1);
});

test("[screenplay-store] replay from a file-only migration owner heals the CAS adapter before acknowledgement", async () => {
  resetStore();
  const storePath = tempStorePath();
  const baseline = {
    ownerKey: "file-only-replay",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{
      id: "p1",
      title: "Migrating",
      outlineRevision: 1,
      outline: { revision: 1, acts: [], scenes: [], beats: [] },
      outlineMutationReceipts: [{
        requestId: "outline-file-only",
        hashVersion: 1,
        operation: "replace",
        requestHash: "file-only-hash",
        baseRevision: 0,
        committedRevision: 1,
      }],
      versions: [],
      comments: [],
    }],
  };
  configureScreenplayStore(buildDefaultDeps({ SCREENPLAY_STORE_PATH: storePath }));
  screenplayStoreByOwner.set(baseline.ownerKey, structuredClone(baseline));
  saveScreenplayStore(1000);

  const persistence = inMemoryCASPersistence();
  resetStore();
  configureScreenplayStore(buildDefaultDeps({ SCREENPLAY_STORE_PATH: storePath, persistence }));
  loadScreenplayStore();
  const replayed = await commitScreenplayOwnerMutation({
    ownerKey: baseline.ownerKey,
    retryAmbiguousCommit: true,
    mutate(nextOwner) {
      assert.equal(nextOwner.projects[0].outlineMutationReceipts[0].requestId, "outline-file-only");
      return { commit: false, kind: "replayed" };
    },
  });

  assert.equal(replayed.ok, true);
  assert.equal(replayed.committed, true);
  assert.equal(persistence.stats.swaps, 1);
  assert.equal(persistence.current().projects[0].outlineRevision, 1);
  const mirror = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.deepEqual(mirror.adapterBackedOwnerKeys, [baseline.ownerKey]);
});

test("[screenplay-store] repeated CAS loss leaves cached owner unchanged", async () => {
  resetStore();
  const canonical = {
    ownerKey: "cas-loser",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{ id: "p1", title: "Canonical", outline: {}, versions: [], comments: [] }],
  };
  const persistence = inMemoryCASPersistence(canonical);
  persistence.compareAndSwap = async () => {
    persistence.stats.swaps += 1;
    return false;
  };
  configureScreenplayStore(buildDefaultDeps({ persistence }));
  screenplayStoreByOwner.set("cas-loser", structuredClone(canonical));

  const result = await commitScreenplayOwnerMutation({
    ownerKey: "cas-loser",
    maxAttempts: 2,
    mutate(nextOwner) {
      nextOwner.projects[0].title = "Losing write";
      return { kind: "saved" };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(persistence.stats.swaps, 2);
  assert.equal(screenplayStoreByOwner.get("cas-loser").projects[0].title, "Canonical");
});

test("[screenplay-store] non-CAS file failure restores the prior in-memory owner", async () => {
  resetStore();
  const storePath = tempStorePath();
  let failWrites = false;
  configureScreenplayStore(buildDefaultDeps({
    SCREENPLAY_STORE_PATH: storePath,
    persistence: null,
    writeJsonFileAtomic: (filePath, payload) => {
      if (failWrites) return false;
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
      return true;
    },
  }));
  const owner = getOrCreateScreenplayOwnerRecord({ ownerKey: "file-rollback" });
  owner.projects.push({ id: "p1", title: "Before", outline: {}, versions: [], comments: [] });
  saveScreenplayStore(1000);
  failWrites = true;

  const failed = await commitScreenplayOwnerMutation({
    ownerKey: "file-rollback",
    mutate(nextOwner) {
      nextOwner.projects[0].title = "Should roll back";
      return { kind: "saved" };
    },
  });

  assert.equal(failed.ok, false);
  assert.equal(failed.committed, false);
  assert.equal(screenplayStoreByOwner.get("file-rollback").projects[0].title, "Before");
  const mirror = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.equal(mirror.owners[0].projects[0].title, "Before");
});

test("[screenplay-store] ambiguous CAS commit is resolved as replay on the next read", async () => {
  resetStore();
  const canonical = {
    ownerKey: "ambiguous-cas",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{ id: "p1", title: "Before", outline: {}, versions: [], comments: [] }],
  };
  const persistence = inMemoryCASPersistence(canonical);
  const originalSwap = persistence.compareAndSwap;
  let throwAfterCommit = true;
  persistence.compareAndSwap = async (input) => {
    const swapped = await originalSwap(input);
    if (swapped && throwAfterCommit) {
      throwAfterCommit = false;
      throw new Error("connection dropped after commit");
    }
    return swapped;
  };
  configureScreenplayStore(buildDefaultDeps({ persistence }));
  screenplayStoreByOwner.set(canonical.ownerKey, structuredClone(canonical));

  const result = await commitScreenplayOwnerMutation({
    ownerKey: "ambiguous-cas",
    retryAmbiguousCommit: true,
    mutate(nextOwner) {
      if (nextOwner.projects[0].title === "After") {
        return { commit: false, kind: "replayed" };
      }
      nextOwner.projects[0].title = "After";
      return { kind: "saved" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.result.kind, "replayed");
  assert.equal(persistence.current().projects[0].title, "After");
  assert.equal(screenplayStoreByOwner.get("ambiguous-cas").projects[0].title, "After");
});

test("[screenplay-store] ambiguous CAS does not rerun an unprotected mutation", async () => {
  resetStore();
  const canonical = {
    ownerKey: "ambiguous-unprotected",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{
      id: "p1",
      title: "Before",
      outlineRevision: 0,
      outline: { revision: 0, acts: [], scenes: [], beats: [] },
      versions: [],
      comments: [],
    }],
  };
  const persistence = inMemoryCASPersistence(canonical);
  const originalSwap = persistence.compareAndSwap;
  persistence.compareAndSwap = async (input) => {
    const swapped = await originalSwap(input);
    if (swapped) throw new Error("connection dropped after commit");
    return swapped;
  };
  configureScreenplayStore(buildDefaultDeps({ persistence }));
  screenplayStoreByOwner.set(canonical.ownerKey, structuredClone(canonical));
  let mutationCalls = 0;

  const result = await commitScreenplayOwnerMutation({
    ownerKey: canonical.ownerKey,
    mutate(nextOwner) {
      mutationCalls += 1;
      const project = nextOwner.projects[0];
      project.outline.scenes.push({ id: `scene-${mutationCalls}` });
      project.outlineRevision += 1;
      project.outline.revision = project.outlineRevision;
      return { kind: "saved" };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.committed, false);
  assert.equal(mutationCalls, 1);
  assert.deepEqual(persistence.current().projects[0].outline.scenes.map((scene) => scene.id), ["scene-1"]);
  assert.equal(persistence.current().projects[0].outlineRevision, 1);
});

test("[screenplay-store] protected CAS cannot absorb a queued legacy tentative mutation", async () => {
  resetStore();
  const storePath = tempStorePath();
  configureScreenplayStore(buildDefaultDeps({ SCREENPLAY_STORE_PATH: storePath }));
  const initialOwner = getOrCreateScreenplayOwnerRecord({ ownerKey: "stable-cas-baseline" });
  initialOwner.activeProjectId = "p1";
  initialOwner.projects.push({
    id: "p1",
    title: "Before",
    outline: { acts: [], scenes: [], beats: [] },
    versions: [],
    comments: [],
  });
  saveScreenplayStore(1000);

  let releaseGet;
  let signalGetEntered;
  const getGate = new Promise((resolve) => { releaseGet = resolve; });
  const getEntered = new Promise((resolve) => { signalGetEntered = resolve; });
  const persistence = inMemoryCASPersistence();
  const originalGet = persistence.get;
  let gateFirstGet = true;
  persistence.get = async (input) => {
    if (gateFirstGet) {
      gateFirstGet = false;
      signalGetEntered();
      await getGate;
    }
    return originalGet(input);
  };
  configureScreenplayStore(buildDefaultDeps({
    SCREENPLAY_STORE_PATH: storePath,
    persistence,
  }));
  loadScreenplayStore();

  const protectedCommit = commitScreenplayOwnerMutation({
    ownerKey: "stable-cas-baseline",
    mutate(nextOwner) {
      nextOwner.projects[0].title = "Protected winner";
      return { kind: "saved" };
    },
  });
  await getEntered;

  const tentativeOwner = screenplayStoreByOwner.get("stable-cas-baseline");
  tentativeOwner.projects[0].comments.push({ id: "tentative-comment", text: "must not leak" });
  const legacySave = markScreenplayOwnerDirty(tentativeOwner, 2000);
  releaseGet();

  const protectedResult = await protectedCommit;
  const legacyResult = await legacySave.persistencePromise;
  assert.equal(protectedResult.ok, true);
  assert.equal(legacyResult.ok, false);
  assert.equal(legacyResult.persistenceStatus, "stale_owner");
  assert.equal(persistence.current().projects[0].title, "Protected winner");
  assert.deepEqual(persistence.current().projects[0].comments, []);
});

test("[screenplay-store] a hung CAS times out and releases the owner write chain", async () => {
  resetStore();
  const canonical = {
    ownerKey: "cas-timeout",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{ id: "p1", title: "Before", outline: {}, versions: [], comments: [] }],
  };
  const persistence = inMemoryCASPersistence(canonical);
  const workingSwap = persistence.compareAndSwap;
  persistence.compareAndSwap = async () => new Promise(() => {});
  configureScreenplayStore(buildDefaultDeps({
    persistence,
    screenplayPersistenceTimeoutMs: 25,
  }));
  screenplayStoreByOwner.set(canonical.ownerKey, structuredClone(canonical));

  const timedOut = await commitScreenplayOwnerMutation({
    ownerKey: canonical.ownerKey,
    mutate(nextOwner) {
      nextOwner.projects[0].title = "Timed out";
      return { kind: "saved" };
    },
  });
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.error?.code, "SCREENPLAY_PERSISTENCE_TIMEOUT");

  persistence.compareAndSwap = workingSwap;
  const recovered = await commitScreenplayOwnerMutation({
    ownerKey: canonical.ownerKey,
    mutate(nextOwner) {
      nextOwner.projects[0].title = "Recovered";
      return { kind: "saved" };
    },
  });
  assert.equal(recovered.ok, true);
  assert.equal(persistence.current().projects[0].title, "Recovered");
});

test("[screenplay-store] a losing legacy CAS never leaves its tentative value in the mirror", async () => {
  resetStore();
  const storePath = tempStorePath();
  const canonical = {
    ownerKey: "legacy-loser",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{ id: "p1", title: "Canonical", outline: {}, versions: [], comments: [] }],
  };
  const persistence = inMemoryCASPersistence(canonical);
  persistence.compareAndSwap = async () => false;
  configureScreenplayStore(buildDefaultDeps({
    SCREENPLAY_STORE_PATH: storePath,
    persistence,
  }));
  screenplayStoreByOwner.set("legacy-loser", structuredClone(canonical));
  const owner = screenplayStoreByOwner.get("legacy-loser");
  owner.projects[0].title = "Tentative loser";

  const save = markScreenplayOwnerDirty(owner, 2000);
  const persisted = await save.persistencePromise;

  assert.equal(persisted.ok, false);
  assert.equal(screenplayStoreByOwner.get("legacy-loser").projects[0].title, "Canonical");
  const mirror = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.equal(mirror.owners[0].projects[0].title, "Canonical");
});

test("[screenplay-store] a stale legacy owner cannot replace a newer remote CAS winner", async () => {
  resetStore();
  const baseline = {
    ownerKey: "legacy-remote-winner",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{
      id: "p1",
      title: "Baseline",
      outlineRevision: 1,
      outline: { revision: 1, acts: [], scenes: [], beats: [] },
      outlineMutationReceipts: [{
        requestId: "outline-1",
        hashVersion: 1,
        requestHash: "hash-1",
        committedRevision: 1,
      }],
      versions: [],
      comments: [],
    }],
  };
  const persistence = inMemoryCASPersistence(baseline);
  configureScreenplayStore(buildDefaultDeps({ persistence }));
  await loadScreenplayStoreFromAdapter();
  const localOwner = screenplayStoreByOwner.get(baseline.ownerKey);

  const remoteWinner = structuredClone(baseline);
  remoteWinner.updatedAt = 2000;
  remoteWinner.projects[0].title = "Remote winner";
  remoteWinner.projects[0].outlineRevision = 2;
  remoteWinner.projects[0].outline.revision = 2;
  remoteWinner.projects[0].outlineMutationReceipts.unshift({
    requestId: "outline-2",
    hashVersion: 1,
    requestHash: "hash-2",
    committedRevision: 2,
  });
  await persistence.put({ value: remoteWinner });

  localOwner.projects[0].comments.push({ id: "stale-comment", text: "must not overwrite" });
  const save = markScreenplayOwnerDirty(localOwner, 3000);
  const result = await save.persistencePromise;

  assert.equal(result.ok, false);
  assert.equal(result.persistenceStatus, "conflict");
  assert.equal(persistence.current().projects[0].title, "Remote winner");
  assert.equal(persistence.current().projects[0].outlineRevision, 2);
  assert.equal(persistence.current().projects[0].outlineMutationReceipts[0].requestId, "outline-2");
  assert.deepEqual(persistence.current().projects[0].comments, []);
  assert.equal(screenplayStoreByOwner.get(baseline.ownerKey).projects[0].title, "Remote winner");
});

test("[screenplay-store] observed adapter deletion is never resurrected by protected or legacy writes", async () => {
  resetStore();
  const baseline = {
    ownerKey: "deleted-owner",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{
      id: "p1",
      title: "Private screenplay",
      outlineRevision: 1,
      outline: { revision: 1, acts: [], scenes: [], beats: [] },
      outlineMutationReceipts: [{
        requestId: "outline-private",
        hashVersion: 1,
        requestHash: "private-hash",
        committedRevision: 1,
      }],
      versions: [],
      comments: [],
    }],
  };
  const persistence = inMemoryCASPersistence(baseline);
  configureScreenplayStore(buildDefaultDeps({ persistence }));
  await loadScreenplayStoreFromAdapter();
  const staleOwner = screenplayStoreByOwner.get(baseline.ownerKey);
  await persistence.delete();

  const protectedWrite = await commitScreenplayOwnerMutation({
    ownerKey: baseline.ownerKey,
    mutate(nextOwner) {
      nextOwner.projects[0].title = "Must not return";
      return { kind: "saved" };
    },
  });
  assert.equal(protectedWrite.ok, false);
  assert.equal(protectedWrite.conflict, true);
  assert.equal(protectedWrite.error?.code, "SCREENPLAY_OWNER_DELETED");
  assert.equal(persistence.current(), null);
  assert.equal(screenplayStoreByOwner.has(baseline.ownerKey), false);

  staleOwner.projects[0].comments.push({ id: "resurrection", text: "must not return" });
  const legacySave = markScreenplayOwnerDirty(staleOwner, 2000);
  const legacyWrite = await legacySave.persistencePromise;
  assert.equal(legacyWrite.ok, false);
  assert.equal(legacyWrite.persistenceStatus, "deleted");
  assert.equal(persistence.current(), null);
  assert.equal(screenplayStoreByOwner.has(baseline.ownerKey), false);
});

test("[screenplay-store] final CAS repair removes an owner purged after a lost swap", async () => {
  resetStore();
  const storePath = tempStorePath();
  const baseline = {
    ownerKey: "purged-after-cas-loss",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{ id: "p1", title: "Private", outline: {}, versions: [], comments: [] }],
  };
  const persistence = inMemoryCASPersistence(baseline);
  configureScreenplayStore(buildDefaultDeps({
    SCREENPLAY_STORE_PATH: storePath,
    persistence,
  }));
  await loadScreenplayStoreFromAdapter();
  saveScreenplayStore(1000, { persistAdapter: false, preferPersistedOwners: true });
  persistence.compareAndSwap = async () => {
    await persistence.delete();
    return false;
  };

  const result = await commitScreenplayOwnerMutation({
    ownerKey: baseline.ownerKey,
    maxAttempts: 1,
    mutate(nextOwner) {
      nextOwner.projects[0].title = "Must not survive purge";
      return { kind: "saved" };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(persistence.current(), null);
  assert.equal(screenplayStoreByOwner.has(baseline.ownerKey), false);
  const mirror = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.deepEqual(mirror.owners, []);
});

test("[screenplay-store] adapter provenance survives restart and blocks stale-mirror resurrection", async () => {
  resetStore();
  const storePath = tempStorePath();
  const baseline = {
    ownerKey: "deleted-while-down",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{ id: "p1", title: "Private", outline: {}, versions: [], comments: [] }],
  };
  const persistence = inMemoryCASPersistence(baseline);
  configureScreenplayStore(buildDefaultDeps({
    SCREENPLAY_STORE_PATH: storePath,
    persistence,
  }));
  await loadScreenplayStoreFromAdapter();
  saveScreenplayStore(1000, { persistAdapter: false, preferPersistedOwners: true });
  const firstMirror = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.deepEqual(firstMirror.adapterBackedOwnerKeys, [baseline.ownerKey]);

  await persistence.delete();
  resetStore();
  configureScreenplayStore(buildDefaultDeps({
    SCREENPLAY_STORE_PATH: storePath,
    persistence,
  }));
  loadScreenplayStore();
  const staleMirrorOwner = structuredClone(screenplayStoreByOwner.get(baseline.ownerKey));
  const adapterLoaded = await loadScreenplayStoreFromAdapter();
  assert.equal(adapterLoaded, true);
  assert.equal(screenplayStoreByOwner.has(baseline.ownerKey), false);

  const protectedWrite = await commitScreenplayOwnerMutation({
    ownerKey: baseline.ownerKey,
    mutate(nextOwner) {
      nextOwner.projects.push({ id: "resurrected" });
      return { kind: "saved" };
    },
  });
  assert.equal(protectedWrite.ok, false);
  assert.equal(protectedWrite.error?.code, "SCREENPLAY_OWNER_DELETED");

  staleMirrorOwner.projects[0].comments.push({ id: "legacy-resurrection" });
  const legacySave = markScreenplayOwnerDirty(staleMirrorOwner, 2000);
  const legacyWrite = await legacySave.persistencePromise;
  assert.equal(legacyWrite.ok, false);
  assert.equal(legacyWrite.persistenceStatus, "deleted");
  assert.equal(persistence.current(), null);
  const repairedMirror = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.deepEqual(repairedMirror.owners, []);
  assert.deepEqual(repairedMirror.adapterBackedOwnerKeys, [baseline.ownerKey]);
});

test("[screenplay-store] canonical owner refresh replaces a stale multi-instance cache", async () => {
  resetStore();
  const baseline = {
    ownerKey: "refresh-owner",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{ id: "p1", title: "Revision zero", outline: { revision: 0 }, versions: [], comments: [] }],
  };
  const persistence = inMemoryCASPersistence(baseline);
  configureScreenplayStore(buildDefaultDeps({ persistence }));
  await loadScreenplayStoreFromAdapter();

  const remote = structuredClone(baseline);
  remote.updatedAt = 2000;
  remote.projects[0].title = "Revision one";
  remote.projects[0].outline = { revision: 1, acts: [], scenes: [], beats: [] };
  remote.projects[0].outlineRevision = 1;
  await persistence.put({ value: remote });

  const refreshed = await refreshScreenplayOwnerRecord(baseline.ownerKey);

  assert.equal(refreshed.ok, true);
  assert.equal(refreshed.authoritative, true);
  assert.equal(refreshed.owner.projects[0].title, "Revision one");
  assert.equal(screenplayStoreByOwner.get(baseline.ownerKey).projects[0].outlineRevision, 1);
});

test("[screenplay-store] legacy dirty writes use CAS instead of a later unconditional put", async () => {
  resetStore();
  const persistence = inMemoryCASPersistence();
  configureScreenplayStore(buildDefaultDeps({ persistence }));
  const owner = getOrCreateScreenplayOwnerRecord({ ownerKey: "legacy-cas" });
  owner.projects.push({ id: "p1", title: "Legacy", outline: {}, versions: [], comments: [] });

  const save = markScreenplayOwnerDirty(owner, 5000);
  const persisted = await save.persistencePromise;

  assert.equal(persisted.ok, true);
  assert.equal(persistence.stats.swaps, 1);
  assert.equal(persistence.stats.puts, 0);
  assert.equal(persistence.current().projects[0].title, "Legacy");
});

test("[screenplay-store] durable tombstones erase owners and reject stale writers", async () => {
  resetStore();
  const storePath = tempStorePath();
  const baseline = {
    ownerKey: "user:hard-delete",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{ id: "p1", title: "Private", outline: {}, versions: [], comments: [] }],
  };
  const persistence = inMemoryCASPersistence(baseline);
  configureScreenplayStore(buildDefaultDeps({
    SCREENPLAY_STORE_PATH: storePath,
    persistence,
  }));
  await loadScreenplayStoreFromAdapter();
  const staleOwner = structuredClone(screenplayStoreByOwner.get(baseline.ownerKey));

  const deletion = await tombstoneScreenplayOwnerRecord(baseline.ownerKey, 5000);

  assert.equal(deletion.ok, true);
  assert.equal(deletion.tombstoned, true);
  assert.equal(deletion.deleted, true);
  assert.deepEqual(persistence.current(), {
    screenplayOwnerTombstone: true,
    version: 1,
    deletedAt: 5000,
  });
  assert.equal(screenplayStoreByOwner.has(baseline.ownerKey), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(storePath, "utf8")).owners, []);

  const protectedWrite = await commitScreenplayOwnerMutation({
    ownerKey: baseline.ownerKey,
    mutate(nextOwner) {
      nextOwner.projects.push({ id: "resurrected" });
      return { kind: "saved" };
    },
  });
  assert.equal(protectedWrite.ok, false);
  assert.equal(protectedWrite.error?.code, "SCREENPLAY_OWNER_DELETED");

  staleOwner.projects[0].title = "Resurrected";
  const legacyWrite = markScreenplayOwnerDirty(staleOwner, 6000);
  assert.equal(legacyWrite.ok, false);
  assert.equal(legacyWrite.persistenceStatus, "deleted");
  assert.equal(persistence.current().screenplayOwnerTombstone, true);
});

test("[screenplay-store] tombstone wins before a successful CAS is acknowledged", async () => {
  resetStore();
  const storePath = tempStorePath();
  const baseline = {
    ownerKey: "user:cas-delete-race",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{ id: "p1", title: "Before", outline: {}, versions: [], comments: [] }],
  };
  const persistence = inMemoryCASPersistence(baseline);
  const compareAndSwap = persistence.compareAndSwap.bind(persistence);
  persistence.compareAndSwap = async (args) => {
    const swapped = await compareAndSwap(args);
    if (swapped) {
      await persistence.put({
        value: { screenplayOwnerTombstone: true, version: 1, deletedAt: 7000 },
      });
    }
    return swapped;
  };
  configureScreenplayStore(buildDefaultDeps({
    SCREENPLAY_STORE_PATH: storePath,
    persistence,
  }));
  await loadScreenplayStoreFromAdapter();

  const result = await commitScreenplayOwnerMutation({
    ownerKey: baseline.ownerKey,
    mutate(nextOwner) {
      nextOwner.projects[0].title = "After";
      return { kind: "saved" };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "SCREENPLAY_OWNER_DELETED");
  assert.equal(persistence.current().screenplayOwnerTombstone, true);
  assert.equal(screenplayStoreByOwner.has(baseline.ownerKey), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(storePath, "utf8")).owners, []);
});

test("[screenplay-store] adapter hydration classifies a tombstone as an authoritative deletion", async () => {
  resetStore();
  const storePath = tempStorePath();
  const baseline = {
    ownerKey: "user:adapter-tombstone",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{ id: "p1", title: "Stale mirror", outline: {}, versions: [], comments: [] }],
  };
  fs.writeFileSync(storePath, JSON.stringify({
    version: 2,
    updatedAt: 1000,
    adapterBackedOwnerKeys: [],
    owners: [baseline],
  }), "utf8");
  const tombstone = {
    screenplayOwnerTombstone: true,
    version: 1,
    deletedAt: 5000,
  };
  const persistence = {
    kind: "memory-tombstone",
    async list() {
      return [{ key: baseline.ownerKey, value: structuredClone(tombstone) }];
    },
  };
  configureScreenplayStore(buildDefaultDeps({
    SCREENPLAY_STORE_PATH: storePath,
    persistence,
  }));
  loadScreenplayStore();
  assert.equal(screenplayStoreByOwner.has(baseline.ownerKey), true);

  const loaded = await loadScreenplayStoreFromAdapter();

  assert.equal(loaded, true);
  assert.equal(screenplayStoreByOwner.has(baseline.ownerKey), false);
  const repairedMirror = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.deepEqual(repairedMirror.owners, []);
  assert.deepEqual(repairedMirror.adapterBackedOwnerKeys, [baseline.ownerKey]);
});

test("[screenplay-store] canonical refresh classifies a tombstone as an authoritative deletion", async () => {
  resetStore();
  const storePath = tempStorePath();
  const baseline = {
    ownerKey: "user:refresh-tombstone",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{ id: "p1", title: "Before deletion", outline: {}, versions: [], comments: [] }],
  };
  const persistence = inMemoryCASPersistence(baseline);
  configureScreenplayStore(buildDefaultDeps({
    SCREENPLAY_STORE_PATH: storePath,
    persistence,
  }));
  await loadScreenplayStoreFromAdapter();
  await persistence.put({
    value: { screenplayOwnerTombstone: true, version: 1, deletedAt: 6000 },
  });

  const refreshed = await refreshScreenplayOwnerRecord(baseline.ownerKey);

  assert.equal(refreshed.ok, true);
  assert.equal(refreshed.authoritative, true);
  assert.equal(refreshed.deleted, true);
  assert.equal(refreshed.tombstoned, true);
  assert.equal(refreshed.owner, null);
  assert.equal(screenplayStoreByOwner.has(baseline.ownerKey), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(storePath, "utf8")).owners, []);
});

test("[screenplay-store] tombstoning an already tombstoned owner is idempotent", async () => {
  resetStore();
  const storePath = tempStorePath();
  const baseline = {
    ownerKey: "user:idempotent-tombstone",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{ id: "p1", title: "Erase once", outline: {}, versions: [], comments: [] }],
  };
  const persistence = inMemoryCASPersistence(baseline);
  configureScreenplayStore(buildDefaultDeps({
    SCREENPLAY_STORE_PATH: storePath,
    persistence,
  }));
  await loadScreenplayStoreFromAdapter();

  const first = await tombstoneScreenplayOwnerRecord(baseline.ownerKey, 7000);
  const second = await tombstoneScreenplayOwnerRecord(baseline.ownerKey, 9000);

  assert.equal(first.ok, true);
  assert.equal(first.deleted, true);
  assert.equal(second.ok, true);
  assert.equal(second.deleted, false);
  assert.equal(persistence.stats.puts, 1);
  assert.deepEqual(persistence.current(), {
    screenplayOwnerTombstone: true,
    version: 1,
    deletedAt: 7000,
  });
  assert.equal(screenplayStoreByOwner.has(baseline.ownerKey), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(storePath, "utf8")).owners, []);
});

test("[screenplay-store] an adapter tombstone fences mutation from an unprovenanced stale mirror", async () => {
  resetStore();
  const storePath = tempStorePath();
  const baseline = {
    ownerKey: "user:stale-mirror-tombstone",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{ id: "p1", title: "Stale private data", outline: {}, versions: [], comments: [] }],
  };
  fs.writeFileSync(storePath, JSON.stringify({
    version: 2,
    updatedAt: 1000,
    adapterBackedOwnerKeys: [],
    owners: [baseline],
  }), "utf8");
  const tombstone = {
    screenplayOwnerTombstone: true,
    version: 1,
    deletedAt: 8000,
  };
  const persistence = inMemoryCASPersistence(tombstone);
  configureScreenplayStore(buildDefaultDeps({
    SCREENPLAY_STORE_PATH: storePath,
    persistence,
  }));
  loadScreenplayStore();
  let mutationCalled = false;

  const result = await commitScreenplayOwnerMutation({
    ownerKey: baseline.ownerKey,
    mutate(nextOwner) {
      mutationCalled = true;
      nextOwner.projects[0].title = "Must not resurrect";
      return { kind: "saved" };
    },
  });

  assert.equal(mutationCalled, false);
  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(result.error?.code, "SCREENPLAY_OWNER_DELETED");
  assert.equal(screenplayStoreByOwner.has(baseline.ownerKey), false);
  assert.deepEqual(persistence.current(), tombstone);
  const repairedMirror = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.deepEqual(repairedMirror.owners, []);
  assert.deepEqual(repairedMirror.adapterBackedOwnerKeys, [baseline.ownerKey]);
});

test("[screenplay-store] an unknown future tombstone version remains terminal", async () => {
  resetStore();
  const storePath = tempStorePath();
  const ownerKey = "user:future-tombstone";
  const futureTombstone = {
    screenplayOwnerTombstone: true,
    version: 99,
    deletedAt: 10_000,
    futureMetadata: { reason: "privacy-erasure" },
  };
  const persistence = inMemoryCASPersistence(futureTombstone);
  configureScreenplayStore(buildDefaultDeps({
    SCREENPLAY_STORE_PATH: storePath,
    persistence,
  }));
  const cachedOwner = getOrCreateScreenplayOwnerRecord({ ownerKey });
  cachedOwner.projects.push({
    id: "p1",
    title: "Stale local copy",
    outline: {},
    versions: [],
    comments: [],
  });
  let mutationCalled = false;

  const result = await commitScreenplayOwnerMutation({
    ownerKey,
    mutate(nextOwner) {
      mutationCalled = true;
      nextOwner.projects[0].title = "Must not resurrect";
      return { kind: "saved" };
    },
  });

  assert.equal(mutationCalled, false);
  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(result.error?.code, "SCREENPLAY_OWNER_DELETED");
  assert.equal(persistence.stats.swaps, 0);
  assert.deepEqual(persistence.current(), futureTombstone);
  assert.equal(screenplayStoreByOwner.has(ownerKey), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(storePath, "utf8")).owners, []);
});

test("[screenplay-store] a failed canonical read cannot suppress the tombstone privacy write", async () => {
  resetStore();
  const storePath = tempStorePath();
  const baseline = {
    ownerKey: "user:tombstone-read-failure",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{ id: "p1", title: "Private", outline: {}, versions: [], comments: [] }],
  };
  const persistence = inMemoryCASPersistence(baseline);
  configureScreenplayStore(buildDefaultDeps({
    SCREENPLAY_STORE_PATH: storePath,
    persistence,
  }));
  await loadScreenplayStoreFromAdapter();
  const first = await tombstoneScreenplayOwnerRecord(baseline.ownerKey, 11_000);
  assert.equal(first.ok, true);
  assert.equal(persistence.current().screenplayOwnerTombstone, true);

  const canonicalOwner = structuredClone(baseline);
  canonicalOwner.updatedAt = 12_000;
  canonicalOwner.projects[0].title = "Canonical owner reappeared";
  await persistence.put({ value: canonicalOwner });
  const putsBeforeRetry = persistence.stats.puts;
  persistence.get = async () => {
    persistence.stats.gets += 1;
    throw new Error("canonical read unavailable");
  };

  const retried = await tombstoneScreenplayOwnerRecord(baseline.ownerKey, 13_000);

  assert.equal(retried.ok, true);
  assert.equal(retried.tombstoned, true);
  assert.equal(persistence.stats.puts, putsBeforeRetry + 1);
  assert.deepEqual(persistence.current(), {
    screenplayOwnerTombstone: true,
    version: 1,
    deletedAt: 13_000,
  });
  assert.equal(screenplayStoreByOwner.has(baseline.ownerKey), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(storePath, "utf8")).owners, []);
});

test("[screenplay-store] failed post-CAS reconciliation never caches content over a remote tombstone", async () => {
  resetStore();
  const storePath = tempStorePath();
  const baseline = {
    ownerKey: "user:protected-post-cas-tombstone",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{ id: "p1", title: "Before", outline: {}, versions: [], comments: [] }],
  };
  const tombstone = {
    screenplayOwnerTombstone: true,
    version: 1,
    deletedAt: 14_000,
  };
  const persistence = inMemoryCASPersistence(baseline);
  configureScreenplayStore(buildDefaultDeps({
    SCREENPLAY_STORE_PATH: storePath,
    persistence,
  }));
  await loadScreenplayStoreFromAdapter();
  const canonicalGet = persistence.get.bind(persistence);
  const canonicalSwap = persistence.compareAndSwap.bind(persistence);
  let postCasReadFails = false;
  persistence.get = async (args) => {
    if (postCasReadFails) {
      persistence.stats.gets += 1;
      throw new Error("post-CAS canonical read unavailable");
    }
    return canonicalGet(args);
  };
  persistence.compareAndSwap = async (args) => {
    const swapped = await canonicalSwap(args);
    if (swapped) {
      await persistence.put({ value: tombstone });
      postCasReadFails = true;
    }
    return swapped;
  };

  const result = await commitScreenplayOwnerMutation({
    ownerKey: baseline.ownerKey,
    now: 13_000,
    mutate(nextOwner) {
      nextOwner.projects[0].title = "Committed snapshot";
      return { kind: "saved" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.committed, true);
  assert.equal(result.persistenceStatus, "cache_reconciliation_pending");
  assert.equal(result.owner.projects[0].title, "Committed snapshot");
  assert.equal(persistence.stats.swaps, 1);
  assert.deepEqual(persistence.current(), tombstone);
  assert.equal(screenplayStoreByOwner.has(baseline.ownerKey), false);
  const mirror = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.deepEqual(mirror.owners, []);
  assert.deepEqual(mirror.adapterBackedOwnerKeys, [baseline.ownerKey]);
});

test("[screenplay-store] legacy post-CAS reconciliation failure also leaves no cached owner", async () => {
  resetStore();
  const storePath = tempStorePath();
  const baseline = {
    ownerKey: "user:legacy-post-cas-tombstone",
    activeProjectId: "p1",
    updatedAt: 1000,
    companionState: {},
    projects: [{ id: "p1", title: "Before", outline: {}, versions: [], comments: [] }],
  };
  const tombstone = {
    screenplayOwnerTombstone: true,
    version: 1,
    deletedAt: 16_000,
  };
  const persistence = inMemoryCASPersistence(baseline);
  configureScreenplayStore(buildDefaultDeps({
    SCREENPLAY_STORE_PATH: storePath,
    persistence,
  }));
  await loadScreenplayStoreFromAdapter();
  const owner = screenplayStoreByOwner.get(baseline.ownerKey);
  const canonicalGet = persistence.get.bind(persistence);
  const canonicalSwap = persistence.compareAndSwap.bind(persistence);
  let postCasReadFails = false;
  persistence.get = async (args) => {
    if (postCasReadFails) {
      persistence.stats.gets += 1;
      throw new Error("post-CAS canonical read unavailable");
    }
    return canonicalGet(args);
  };
  persistence.compareAndSwap = async (args) => {
    const swapped = await canonicalSwap(args);
    if (swapped) {
      await persistence.put({ value: tombstone });
      postCasReadFails = true;
    }
    return swapped;
  };
  owner.projects[0].title = "Legacy committed snapshot";

  const save = markScreenplayOwnerDirty(owner, 15_000);
  const result = await save.persistencePromise;

  assert.equal(result.ok, true);
  assert.equal(result.persistenceStatus, "cache_reconciliation_pending");
  assert.equal(result.owner.projects[0].title, "Legacy committed snapshot");
  assert.equal(persistence.stats.swaps, 1);
  assert.deepEqual(persistence.current(), tombstone);
  assert.equal(screenplayStoreByOwner.has(baseline.ownerKey), false);
  const mirror = JSON.parse(fs.readFileSync(storePath, "utf8"));
  assert.deepEqual(mirror.owners, []);
  assert.deepEqual(mirror.adapterBackedOwnerKeys, [baseline.ownerKey]);
});

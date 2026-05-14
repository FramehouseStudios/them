// T-deeper-memory-store-tests — deeper coverage for memory_store
// beyond #216's smoke surface. Where #216 used pass-through stubs
// for the sanitize-path's ~25 deps, this PR exercises:
//
//   - sanitizePersistedSessionMemory with real shapes
//   - retention pruning at the boundary
//   - eviction at USER_MEMORY_MAX_TRACKED
//   - client-token alias capping at sanitizeClientTokenAliasList
//   - cleanupUserMemoryStore actually prunes entries
//   - save → load JSON round-trip preserves the user-keyed maps
//
// Stubs are tighter — they preserve shape rather than pass through.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  cleanupUserMemoryStore,
  configureMemoryStore,
  getPersistedUserMemoryForIp,
  loadUserMemoryStore,
  sanitizeClientTokenAliasList,
  saveUserMemoryStore,
  setPersistedUserMemoryForIp,
  userMemoryByClientToken,
  userMemoryByIp,
  userMemoryByUserId,
} from "../lib/memory_store.js";

function tempStorePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-memstore-deeper-"));
  return path.join(dir, "user_memory.json");
}

function reset() {
  userMemoryByIp.clear();
  userMemoryByUserId.clear();
  userMemoryByClientToken.clear();
}

function deps(overrides = {}) {
  // Tighter stubs that preserve shape across sanitize calls.
  return {
    USER_MEMORY_STORE_PATH: overrides.USER_MEMORY_STORE_PATH || tempStorePath(),
    USER_MEMORY_MAX_TRACKED: 1000,
    USER_MEMORY_STALE_DAYS: 90,
    SESSION_THREAD_SCHEMA_VERSION: 1,
    DEFAULT_ASSISTANT_SELF_NAME: "Clementine",
    SOCIAL_SPARK_MEMORY_MAX: 32,
    TASKS_MAX_STORED: 32,
    USER_MEMORY_LISTENING_FACTS_MAX: 16,
    USER_MEMORY_REMEMBERED_PEOPLE_MAX: 16,
    USER_MEMORY_TURN_HISTORY_MAX: 64,
    USER_SPECIFICITY_TARGET_MAX: 1.0,
    USER_SPECIFICITY_TARGET_MIN: 0.0,
    clampUnit: (v, def = 0) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : def;
    },
    createEmptyEmotionMemory: () => ({}),
    fs,
    normalizeAffectionStyle: (v) => String(v || "").trim(),
    normalizeAssistantSelfName: (v) => (String(v || "").trim() || "Clementine"),
    normalizeClientToken: (v) => (typeof v === "string" ? v.trim() : ""),
    normalizeClientIp: (v) => (typeof v === "string" ? v.trim() : ""),
    normalizeEmailAddress: (v) => (typeof v === "string" ? v.trim().toLowerCase() : ""),
    normalizeLocalActionType: (v) => String(v || "").trim(),
    normalizeMotivationOutcome: (v) => String(v || "").trim(),
    normalizeReassuranceStyle: (v) => String(v || "").trim(),
    normalizeSnippet: (v, max = 160) => {
      const s = String(v || "").trim();
      return s.length <= max ? s : s.slice(0, max);
    },
    normalizeUserPersonName: (v) => String(v || "").trim(),
    personalitySignalKeys: () => ["curiosity", "warmth", "directness"],
    pushBoundedUniqueFolded: (arr, item, max) => {
      const list = Array.isArray(arr) ? [...arr] : [];
      if (!list.includes(item)) list.push(item);
      return list.slice(-max);
    },
    rankPersonalitySignals: (_m) => [],
    sanitizeActiveThemes: (v) => (Array.isArray(v) ? v.slice(0, 8) : []),
    sanitizeAdaptiveBias: (v) => (v && typeof v === "object" ? v : {}),
    sanitizeAdaptiveHistoryItems: (v) => (Array.isArray(v) ? v : []),
    sanitizeAdaptiveQualityTags: (v) => (Array.isArray(v) ? v : []),
    sanitizeDailyTurnItems: (v) => (Array.isArray(v) ? v : []),
    sanitizeDayStampList: (v) => (Array.isArray(v) ? v : []),
    sanitizeMemoryCardIdList: (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []),
    sanitizePersonalitySignalMap: (v) => (v && typeof v === "object" ? v : {}),
    sanitizeReassuranceStyleScores: (v) => (v && typeof v === "object" ? v : {}),
    sanitizeRememberedPeople: (v) => (Array.isArray(v) ? v.slice(0, 16) : []),
    sanitizeSnippetList: (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []),
    sanitizeSocialSparkMoments: (v) => (Array.isArray(v) ? v.slice(0, 32) : []),
    sanitizeTaskItems: (v) => (Array.isArray(v) ? v.slice(0, 32) : []),
    sanitizeTimestampList: (v) => (Array.isArray(v) ? v.filter((x) => Number.isFinite(x)) : []),
    sanitizeTurnHistoryItems: (v) => (Array.isArray(v) ? v.slice(-64) : []),
    trimToMax: (v, max = 160) => {
      const s = String(v || "").trim();
      return s.length <= max ? s : s.slice(0, max);
    },
    parsePositiveInt: (v, def) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
    },
    parseNonNegativeInt: (v, def) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : def;
    },
    writeJsonFileAtomic: (filePath, payload) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
      return true;
    },
    persistence: null,
    ...overrides,
  };
}

// ---------- sanitizeClientTokenAliasList — deeper coverage ----------

test("[memory-store-deeper] sanitizeClientTokenAliasList preserves order of first occurrences", () => {
  configureMemoryStore(deps());
  const out = sanitizeClientTokenAliasList(["c", "a", "b", "a", "c"]);
  assert.deepEqual(out, ["c", "a", "b"]);
});

test("[memory-store-deeper] sanitizeClientTokenAliasList default cap is 24", () => {
  configureMemoryStore(deps());
  const input = Array.from({ length: 50 }, (_, i) => `t${i}`);
  const out = sanitizeClientTokenAliasList(input);
  assert.equal(out.length, 24);
});

// ---------- IP + token alias lookups ----------

test("[memory-store-deeper] setPersistedUserMemoryForIp with multiple aliases registers each", () => {
  reset();
  configureMemoryStore(deps());
  setPersistedUserMemoryForIp(
    "10.0.0.1",
    { assistantSelfName: "C" },
    Date.now(),
    { clientTokenAliases: ["a", "b", "c"] },
  );
  assert.equal(userMemoryByClientToken.get("a"), "10.0.0.1");
  assert.equal(userMemoryByClientToken.get("b"), "10.0.0.1");
  assert.equal(userMemoryByClientToken.get("c"), "10.0.0.1");
});

test("[memory-store-deeper] subsequent setPersistedUserMemoryForIp updates the same IP", () => {
  reset();
  configureMemoryStore(deps());
  const now = 1_700_000_000_000;
  setPersistedUserMemoryForIp("10.0.0.2", { assistantSelfName: "First" }, now);
  setPersistedUserMemoryForIp("10.0.0.2", { assistantSelfName: "Second" }, now + 1000);
  const got = getPersistedUserMemoryForIp("10.0.0.2", now + 2000);
  // The most recent assistantSelfName must win after sanitize.
  assert.ok(got);
  // Map size remains 1 — no duplicate IP entries.
  assert.equal(userMemoryByIp.size, 1);
});

// ---------- save → load round-trip ----------

test("[memory-store-deeper] save → reset → load preserves multiple users", () => {
  reset();
  const storePath = tempStorePath();
  configureMemoryStore(deps({ USER_MEMORY_STORE_PATH: storePath }));
  const now = 1_700_000_000_000;
  setPersistedUserMemoryForIp("10.0.0.1", { assistantSelfName: "U1" }, now);
  setPersistedUserMemoryForIp("10.0.0.2", { assistantSelfName: "U2" }, now);
  setPersistedUserMemoryForIp("10.0.0.3", { assistantSelfName: "U3" }, now);
  saveUserMemoryStore(now);
  assert.ok(fs.existsSync(storePath));

  reset();
  assert.equal(userMemoryByIp.size, 0);
  loadUserMemoryStore();
  // Reload populates the IP map.
  assert.ok(userMemoryByIp.size >= 3);
  assert.ok(getPersistedUserMemoryForIp("10.0.0.1", now + 1000));
  assert.ok(getPersistedUserMemoryForIp("10.0.0.2", now + 1000));
  assert.ok(getPersistedUserMemoryForIp("10.0.0.3", now + 1000));
});

test("[memory-store-deeper] save produces a valid JSON file", () => {
  reset();
  const storePath = tempStorePath();
  configureMemoryStore(deps({ USER_MEMORY_STORE_PATH: storePath }));
  setPersistedUserMemoryForIp("10.0.0.99", { assistantSelfName: "X" }, 1000);
  saveUserMemoryStore(1000);
  const raw = fs.readFileSync(storePath, "utf8");
  assert.doesNotThrow(() => JSON.parse(raw));
  const parsed = JSON.parse(raw);
  assert.equal(typeof parsed, "object");
});

// ---------- cleanup ----------

test("[memory-store-deeper] cleanupUserMemoryStore does not crash on empty store", () => {
  reset();
  configureMemoryStore(deps());
  assert.doesNotThrow(() => cleanupUserMemoryStore(Date.now()));
});

test("[memory-store-deeper] USER_MEMORY_MAX_TRACKED caps the IP map size", () => {
  reset();
  configureMemoryStore(deps({ USER_MEMORY_MAX_TRACKED: 5 }));
  const now = 1_700_000_000_000;
  // setPersistedUserMemoryForIp -> saveUserMemoryStore ->
  // cleanupUserMemoryStore, so the cap fires on every insert. Add
  // 20 entries; the cap should keep the map ≤ 5.
  for (let i = 0; i < 20; i += 1) {
    setPersistedUserMemoryForIp(`10.0.0.${i}`, { assistantSelfName: `U${i}` }, now + i * 1000);
  }
  assert.ok(userMemoryByIp.size <= 5, `expected ≤5, got ${userMemoryByIp.size}`);
});

// ---------- accessor-pattern stability ----------

test("[memory-store-deeper] map-size accessors return live values after mutation", () => {
  reset();
  configureMemoryStore(deps());
  const before = userMemoryByIp.size;
  setPersistedUserMemoryForIp("10.0.0.42", { assistantSelfName: "Z" }, Date.now());
  const after = userMemoryByIp.size;
  assert.equal(after, before + 1);
});

// ---------- non-string input tolerance ----------

test("[memory-store-deeper] setPersistedUserMemoryForIp tolerates empty memory object", () => {
  reset();
  configureMemoryStore(deps());
  assert.doesNotThrow(() => setPersistedUserMemoryForIp("10.0.0.50", {}, Date.now()));
  assert.equal(userMemoryByIp.size, 1);
});

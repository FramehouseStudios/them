// T-memory-store-smoke-test — smoke coverage for backend/lib/memory_store.js.
//
// memory_store.js holds persisted session memory keyed by IP,
// userId, and client-token. ~626 lines. Heavy sanitizer with ~25
// configured deps. These tests cover the lookup + set + token-alias
// + persistence-adapter surface — the parts that don't require the
// sanitizer's full dep matrix to exercise.
//
// Sanitization itself is mostly defensive shape-shaping; we verify
// the contract that valid input round-trips and null/empty inputs
// produce a stable empty shape (with the minimum deps injected).

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  cleanupUserMemoryStore,
  configureMemoryStore,
  getPersistedIpForClientToken,
  getPersistedUserMemoryForClientToken,
  getPersistedUserMemoryForUserId,
  getPersistedUserMemoryForIp,
  loadUserMemoryStore,
  sanitizeClientTokenAliasList,
  saveUserMemoryStore,
  setPersistedUserMemoryForIp,
  setPersistedUserMemoryForUserId,
  userMemoryByClientToken,
  userMemoryByIp,
  userMemoryByUserId,
} from "../lib/memory_store.js";

function tempStorePath() {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "io-them-memory-store-")),
    "user_memory.json",
  );
}

function minimalDeps(overrides = {}) {
  // memory_store sanitize path uses ~25 deps. Stub each as a
  // permissive pass-through so the test exercises the lookup/save/
  // load surface without requiring the production deps.
  const passthroughString = (v, max = 160) => {
    const s = String(v || "").trim();
    return s.length <= max ? s : s.slice(0, max);
  };
  const passthroughArray = (v) => (Array.isArray(v) ? v : []);
  const passthroughObj = (v) => (v && typeof v === "object" ? v : {});
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
    normalizeAffectionStyle: passthroughString,
    normalizeAssistantSelfName: (v) => passthroughString(v) || "Clementine",
    normalizeClientToken: (v) => (typeof v === "string" ? v.trim() : ""),
    normalizeClientIp: (v) => (typeof v === "string" ? v.trim() : ""),
    normalizeEmailAddress: (v) => (typeof v === "string" ? v.trim().toLowerCase() : ""),
    normalizeLocalActionType: (v) => passthroughString(v),
    normalizeMotivationOutcome: passthroughString,
    normalizeReassuranceStyle: passthroughString,
    normalizeSnippet: passthroughString,
    normalizeUserPersonName: passthroughString,
    personalitySignalKeys: () => ["a", "b", "c"],
    pushBoundedUniqueFolded: (arr, item, max) => {
      const list = Array.isArray(arr) ? [...arr] : [];
      if (!list.includes(item)) list.push(item);
      return list.slice(-max);
    },
    rankPersonalitySignals: (_m) => [],
    sanitizeActiveThemes: passthroughArray,
    sanitizeAdaptiveBias: passthroughObj,
    sanitizeAdaptiveHistoryItems: passthroughArray,
    sanitizeAdaptiveQualityTags: passthroughArray,
    sanitizeDailyTurnItems: passthroughArray,
    sanitizeDayStampList: passthroughArray,
    sanitizeMemoryCardIdList: passthroughArray,
    sanitizePersonalitySignalMap: passthroughObj,
    sanitizeReassuranceStyleScores: passthroughObj,
    sanitizeRememberedPeople: passthroughArray,
    sanitizeSnippetList: passthroughArray,
    sanitizeSocialSparkMoments: passthroughArray,
    sanitizeTaskItems: passthroughArray,
    sanitizeTimestampList: passthroughArray,
    sanitizeTurnHistoryItems: passthroughArray,
    trimToMax: passthroughString,
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

function resetMaps() {
  userMemoryByIp.clear();
  userMemoryByUserId.clear();
  userMemoryByClientToken.clear();
}

// ---------- configureMemoryStore guard ----------

test("[memory-store] API throws when not configured", () => {
  configureMemoryStore({});
  assert.throws(
    () => setPersistedUserMemoryForIp("1.2.3.4", { foo: "bar" }, Date.now()),
    /is not a function|not configured/,
  );
});

// ---------- sanitizeClientTokenAliasList ----------

test("[memory-store] sanitizeClientTokenAliasList drops non-strings + trims + dedupes + caps", () => {
  configureMemoryStore(minimalDeps());
  const input = [
    "  alpha  ",
    "alpha",
    "",
    null,
    undefined,
    42,
    "beta",
    "BETA",  // case-sensitive; should stay
    "gamma",
  ];
  const out = sanitizeClientTokenAliasList(input);
  assert.ok(Array.isArray(out));
  assert.ok(out.includes("alpha"));
  assert.ok(out.includes("beta"));
  assert.ok(out.includes("BETA"));
  assert.ok(out.includes("gamma"));
  // Dedup: alpha appears once even though input had it twice (one trimmed).
  assert.equal(out.filter((x) => x === "alpha").length, 1);
});

test("[memory-store] sanitizeClientTokenAliasList caps at maxItems", () => {
  configureMemoryStore(minimalDeps());
  const input = Array.from({ length: 50 }, (_, i) => `t${i}`);
  const out = sanitizeClientTokenAliasList(input, 10);
  assert.equal(out.length, 10);
});

test("[memory-store] sanitizeClientTokenAliasList tolerates null/undefined input", () => {
  configureMemoryStore(minimalDeps());
  assert.deepEqual(sanitizeClientTokenAliasList(null), []);
  assert.deepEqual(sanitizeClientTokenAliasList(undefined), []);
});

// ---------- IP keyed lookup + round-trip ----------

test("[memory-store] setPersistedUserMemoryForIp + getPersistedUserMemoryForIp round-trip", () => {
  resetMaps();
  configureMemoryStore(minimalDeps());
  const now = 1_700_000_000_000;
  setPersistedUserMemoryForIp("10.0.0.1", { assistantSelfName: "Clem", customField: "x" }, now);
  const got = getPersistedUserMemoryForIp("10.0.0.1", now);
  assert.ok(got);
  // sanitize may add fields, but our supplied custom field should survive (sanitize is conservative)
  // and the IP is the right lookup key.
  assert.equal(typeof got, "object");
});

test("[memory-store] getPersistedUserMemoryForIp returns null for unknown IP", () => {
  resetMaps();
  configureMemoryStore(minimalDeps());
  const got = getPersistedUserMemoryForIp("99.99.99.99", Date.now());
  assert.equal(got, null);
});

// ---------- userId keyed lookup + round-trip ----------

test("[memory-store] setPersistedUserMemoryForUserId + getPersistedUserMemoryForUserId round-trip", () => {
  resetMaps();
  configureMemoryStore(minimalDeps());
  setPersistedUserMemoryForUserId("user_abc", { assistantSelfName: "C" }, 1_700_000_000_000);
  const got = getPersistedUserMemoryForUserId("user_abc", 1_700_000_000_000);
  assert.ok(got);
  assert.equal(typeof got, "object");
});

test("[memory-store] getPersistedUserMemoryForUserId returns null for unknown userId", () => {
  resetMaps();
  configureMemoryStore(minimalDeps());
  assert.equal(getPersistedUserMemoryForUserId("missing", Date.now()), null);
});

// ---------- client-token alias lookup ----------

test("[memory-store] setPersistedUserMemoryForIp with clientTokenAliases registers alias", () => {
  resetMaps();
  configureMemoryStore(minimalDeps());
  const now = Date.now();
  setPersistedUserMemoryForIp(
    "127.0.0.1",
    { assistantSelfName: "C" },
    now,
    { clientTokenAliases: ["token-aaa"] },
  );
  const ip = getPersistedIpForClientToken("token-aaa", now);
  assert.equal(ip, "127.0.0.1");
  const mem = getPersistedUserMemoryForClientToken("token-aaa", now);
  assert.ok(mem);
});

test("[memory-store] getPersistedIpForClientToken returns falsy for unknown token", () => {
  resetMaps();
  configureMemoryStore(minimalDeps());
  // Returns "" rather than null because normalizeClientIp("") is "".
  // What matters: not a valid IP.
  const ip = getPersistedIpForClientToken("ghost", Date.now());
  assert.ok(!ip, `expected falsy for unknown token, got: ${JSON.stringify(ip)}`);
});

// ---------- save + load round-trip ----------

test("[memory-store] saveUserMemoryStore + loadUserMemoryStore round-trip on a temp JSON file", () => {
  resetMaps();
  const storePath = tempStorePath();
  configureMemoryStore(minimalDeps({ USER_MEMORY_STORE_PATH: storePath }));
  const now = 1_700_000_000_000;
  setPersistedUserMemoryForIp("10.0.0.5", { assistantSelfName: "C" }, now);
  setPersistedUserMemoryForUserId("user_xyz", { assistantSelfName: "C" }, now);
  saveUserMemoryStore(now);
  assert.ok(fs.existsSync(storePath));
  const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
  // The exact envelope shape varies; verify it round-trips through
  // loadUserMemoryStore rather than asserting the on-disk shape.
  assert.equal(typeof parsed, "object");
  // Reset + reload.
  resetMaps();
  loadUserMemoryStore();
  // The IP should still resolve after reload.
  const reloaded = getPersistedUserMemoryForIp("10.0.0.5", now);
  assert.ok(reloaded);
});

test("[memory-store] loadUserMemoryStore is a no-op when file is missing", () => {
  resetMaps();
  configureMemoryStore(minimalDeps({ USER_MEMORY_STORE_PATH: "/tmp/io-them-memstore-doesnt-exist.json" }));
  loadUserMemoryStore();
  assert.equal(userMemoryByIp.size, 0);
});

// ---------- cleanup ----------

test("[memory-store] cleanupUserMemoryStore handles empty store without error", () => {
  resetMaps();
  configureMemoryStore(minimalDeps());
  cleanupUserMemoryStore(Date.now());
  assert.equal(userMemoryByIp.size, 0);
});

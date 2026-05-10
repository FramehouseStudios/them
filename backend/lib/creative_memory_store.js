// Creative-companion memory store (T08 MVP).
//
// A per-user record capturing the four pillars of longitudinal
// learning: style, characters, tone, habits. The shape mirrors
// the schema in docs/T08-prompt-centralization-and-memory-tier.md.
//
// Persistence is JSON-file-backed for the MVP. When T07's
// canonical persistence adapter merges, this module gets a
// minimal follow-up PR that swaps the file I/O for adapter calls
// without changing the public API.
//
// Concurrency: writes serialize per-user via an in-process mutex
// chain. Cross-process safety is NOT a goal for the MVP file path.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_FILE = path.resolve(__dirname, "..", "creative_memory_store.json");

const SCHEMA_VERSION = 1;
const LEXICAL_FINGERPRINT_MAX = 64;
const CHARACTERS_MAX = 32;
const ABANDONMENT_SIGNALS_MAX = 16;

function nowMs() {
  return Date.now();
}

function makeEmptyMemory(userId) {
  return {
    userId: String(userId || ""),
    version: SCHEMA_VERSION,
    updatedAt: nowMs(),
    style: {
      lexicalFingerprint: [],
    },
    characters: [],
    tone: {},
    habits: {},
  };
}

function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function loadFromFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const text = fs.readFileSync(filePath, "utf8");
    if (!text.trim()) return {};
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : {};
  } catch (_e) {
    return {};
  }
}

function writeToFile(filePath, all) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2));
  fs.renameSync(tmp, filePath);
}

function createCreativeMemoryStore({ filePath = DEFAULT_FILE } = {}) {
  const writeChain = new Map(); // userId -> Promise

  function withUserLock(userId, fn) {
    const prev = writeChain.get(userId) || Promise.resolve();
    const next = prev.then(() => fn());
    writeChain.set(userId, next.catch(() => {}));
    return next;
  }

  function readAll() {
    return loadFromFile(filePath);
  }

  function writeAll(all) {
    writeToFile(filePath, all);
  }

  function readUser(userId) {
    if (!userId) return null;
    const all = readAll();
    const rec = all[userId];
    if (!rec) return null;
    if (rec.version !== SCHEMA_VERSION) {
      // Future migrations live here. For now, refuse stale shapes
      // to avoid silently injecting wrong data into prompts.
      return null;
    }
    return clone(rec);
  }

  async function updateUser(userId, mutator) {
    if (!userId) return;
    await withUserLock(userId, () => {
      const all = readAll();
      const current = all[userId] || makeEmptyMemory(userId);
      const next = mutator(clone(current)) || current;
      next.userId = userId;
      next.version = SCHEMA_VERSION;
      next.updatedAt = nowMs();
      all[userId] = next;
      writeAll(all);
    });
  }

  // ---------- public reads ----------

  function getCreativeMemoryForPrompt({ userId }) {
    const rec = readUser(userId);
    if (!rec) return null;
    // Strip empty containers so prompt assembly omits them cleanly.
    const out = {
      userId: rec.userId,
      version: rec.version,
      updatedAt: rec.updatedAt,
    };
    if (rec.style && Object.keys(rec.style).length) {
      const style = clone(rec.style);
      if (Array.isArray(style.lexicalFingerprint) && style.lexicalFingerprint.length === 0) {
        delete style.lexicalFingerprint;
      }
      if (Object.keys(style).length) out.style = style;
    }
    if (Array.isArray(rec.characters) && rec.characters.length) out.characters = clone(rec.characters);
    if (rec.tone && Object.keys(rec.tone).length) out.tone = clone(rec.tone);
    if (rec.habits && Object.keys(rec.habits).length) out.habits = clone(rec.habits);
    return out;
  }

  function hasMemoryForUser(userId) {
    return readUser(userId) !== null;
  }

  // ---------- write triggers ----------

  async function recordCharacterMention({ userId, characterName, sourceTurn = null, voice = "", tags = [] }) {
    if (!userId || !characterName || typeof characterName !== "string") return;
    const name = characterName.trim();
    if (!name) return;
    await updateUser(userId, (rec) => {
      const characters = Array.isArray(rec.characters) ? rec.characters : [];
      const existingIdx = characters.findIndex((c) => c.name === name);
      const now = nowMs();
      if (existingIdx >= 0) {
        characters[existingIdx].last_referenced = now;
        if (voice) characters[existingIdx].voice = voice;
        if (Array.isArray(tags) && tags.length) {
          const set = new Set([...(characters[existingIdx].tags || []), ...tags]);
          characters[existingIdx].tags = [...set];
        }
      } else {
        characters.push({
          name,
          voice: voice || "",
          first_seen: now,
          last_referenced: now,
          tags: Array.isArray(tags) ? [...new Set(tags)] : [],
        });
      }
      // Cap by recency.
      characters.sort((a, b) => (b.last_referenced || 0) - (a.last_referenced || 0));
      rec.characters = characters.slice(0, CHARACTERS_MAX);
      // sourceTurn is informational; we don't persist a per-mention log
      // in MVP — that lives in the broader conversation store.
      return rec;
    });
  }

  async function recordSceneCompletion({ userId, scenePageCount }) {
    if (!userId || typeof scenePageCount !== "number" || !Number.isFinite(scenePageCount)) return;
    await updateUser(userId, (rec) => {
      rec.habits = rec.habits || {};
      const prev = Number(rec.habits.preferred_scene_length_pages);
      const prevCount = Number(rec.habits._scene_completion_count) || 0;
      const nextCount = prevCount + 1;
      const nextAvg = Number.isFinite(prev) && prev > 0
        ? (prev * prevCount + scenePageCount) / nextCount
        : scenePageCount;
      rec.habits.preferred_scene_length_pages = Math.round(nextAvg * 100) / 100;
      rec.habits._scene_completion_count = nextCount;
      const completed = Number(rec.habits._scenes_completed) || 0;
      rec.habits._scenes_completed = completed + 1;
      const attempted = Math.max(rec.habits._scenes_completed, Number(rec.habits._scenes_attempted) || rec.habits._scenes_completed);
      rec.habits._scenes_attempted = attempted;
      rec.habits.page_completion_rate = Math.round(
        (rec.habits._scenes_completed / Math.max(1, attempted)) * 100,
      ) / 100;
      return rec;
    });
  }

  async function recordSceneAttempt({ userId }) {
    if (!userId) return;
    await updateUser(userId, (rec) => {
      rec.habits = rec.habits || {};
      const attempted = Number(rec.habits._scenes_attempted) || 0;
      rec.habits._scenes_attempted = attempted + 1;
      const completed = Number(rec.habits._scenes_completed) || 0;
      rec.habits.page_completion_rate = Math.round(
        (completed / Math.max(1, rec.habits._scenes_attempted)) * 100,
      ) / 100;
      return rec;
    });
  }

  async function recordToneSignal({ userId, signal }) {
    if (!userId || !signal || typeof signal !== "object") return;
    await updateUser(userId, (rec) => {
      rec.tone = rec.tone || {};
      if (typeof signal.emotional_default === "string" && signal.emotional_default.trim()) {
        rec.tone.emotional_default = signal.emotional_default.trim();
      }
      if (typeof signal.humor_register === "string" && signal.humor_register.trim()) {
        rec.tone.humor_register = signal.humor_register.trim();
      }
      if (typeof signal.violence_tolerance === "string" && signal.violence_tolerance.trim()) {
        rec.tone.violence_tolerance = signal.violence_tolerance.trim();
      }
      if (typeof signal.preferredTone === "string" && signal.preferredTone.trim()) {
        rec.style = rec.style || {};
        rec.style.preferredTone = signal.preferredTone.trim();
      }
      return rec;
    });
  }

  async function recordSessionEnd({ userId, sessionDurationMs, sessionStartedAt }) {
    if (!userId) return;
    await updateUser(userId, (rec) => {
      rec.habits = rec.habits || {};
      if (Number.isFinite(sessionStartedAt)) {
        const hour = new Date(sessionStartedAt).getHours();
        let bucket = "burst";
        if (hour >= 5 && hour < 11) bucket = "morning";
        else if (hour >= 11 && hour < 17) bucket = "afternoon";
        else if (hour >= 17 && hour < 22) bucket = "evening";
        else bucket = "late-night";
        rec.habits.session_pattern = bucket;
      }
      if (Number.isFinite(sessionDurationMs) && sessionDurationMs > 0) {
        rec.habits._last_session_duration_ms = Math.round(sessionDurationMs);
      }
      return rec;
    });
  }

  async function recordLexicalFingerprint({ userId, phrases }) {
    if (!userId || !Array.isArray(phrases) || phrases.length === 0) return;
    await updateUser(userId, (rec) => {
      rec.style = rec.style || {};
      const existing = Array.isArray(rec.style.lexicalFingerprint) ? rec.style.lexicalFingerprint : [];
      const seen = new Set(existing.map((p) => String(p).toLowerCase()));
      for (const raw of phrases) {
        const phrase = String(raw || "").trim();
        if (!phrase) continue;
        const key = phrase.toLowerCase();
        if (seen.has(key)) continue;
        existing.push(phrase);
        seen.add(key);
      }
      // Cap by recency (most recent at end).
      rec.style.lexicalFingerprint = existing.slice(-LEXICAL_FINGERPRINT_MAX);
      return rec;
    });
  }

  async function clearAll() {
    writeAll({});
  }

  return {
    SCHEMA_VERSION,
    getCreativeMemoryForPrompt,
    hasMemoryForUser,
    recordCharacterMention,
    recordSceneCompletion,
    recordSceneAttempt,
    recordToneSignal,
    recordSessionEnd,
    recordLexicalFingerprint,
    _readAll: readAll,
    _clearAll: clearAll,
  };
}

export {
  createCreativeMemoryStore,
  SCHEMA_VERSION as CREATIVE_MEMORY_SCHEMA_VERSION,
};

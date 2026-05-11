// Creative-companion memory store (T08 + T08-postgres).
//
// A per-user record capturing the four pillars of longitudinal
// learning: style, characters, tone, habits. The shape mirrors
// the schema in docs/T08-prompt-centralization-and-memory-tier.md.
//
// Persistence is the canonical T07 adapter (Postgres when DATABASE_URL
// is set, JSON-file-backed otherwise). The store is keyed by userId in
// the `creative_memory` domain — one row per user. The previous file-
// backed MVP (single JSON document at backend/creative_memory_store.json
// containing all users) is superseded by this layout; legacy data can
// be migrated by reading the old file and writing each entry to the
// adapter once at startup if needed.
//
// Concurrency: writes serialize per-user via an in-process mutex chain.
// Cross-process safety comes from the adapter's underlying store
// (Postgres in production; single-process discipline in JSON mode).

import { createPersistence } from "./persistence_adapter.js";
import { mergeTraits as mergeCharacterTraits } from "./trait_library.js";

const SCHEMA_VERSION = 1;
const LEXICAL_FINGERPRINT_MAX = 64;
const CHARACTERS_MAX = 32;
const DOMAIN = "creative_memory";

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

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function createCreativeMemoryStore({ persistence } = {}) {
  const store = persistence || createPersistence();
  const writeChain = new Map(); // userId -> Promise

  function withUserLock(userId, fn) {
    const prev = writeChain.get(userId) || Promise.resolve();
    const next = prev.then(() => fn());
    writeChain.set(userId, next.catch(() => {}));
    return next;
  }

  async function readUser(userId) {
    if (!userId) return null;
    const raw = await store.get({ domain: DOMAIN, key: userId });
    if (!raw) return null;
    if (raw.version !== SCHEMA_VERSION) {
      // Future migrations live here. Refuse stale shapes for now.
      return null;
    }
    return clone(raw);
  }

  async function writeUser(userId, value) {
    await store.put({ domain: DOMAIN, key: userId, value });
  }

  async function updateUser(userId, mutator) {
    if (!userId) return;
    await withUserLock(userId, async () => {
      const current = (await readUser(userId)) || makeEmptyMemory(userId);
      const next = mutator(clone(current)) || current;
      next.userId = userId;
      next.version = SCHEMA_VERSION;
      next.updatedAt = nowMs();
      await writeUser(userId, next);
    });
  }

  // ---------- public reads ----------

  async function getCreativeMemoryForPrompt({ userId }) {
    const rec = await readUser(userId);
    if (!rec) return null;
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

  async function hasMemoryForUser(userId) {
    return (await readUser(userId)) !== null;
  }

  // ---------- write triggers ----------

  // T30: optional `source` and `metadata` thread through so callers can
  // distinguish reply-side rendered mentions (e.g. `ios_screenplay_render`)
  // from user-input mentions. Schema stays backward-compatible: existing
  // callers pass nothing for these fields and the character record adds
  // them only when supplied. Returns a small action receipt so route
  // handlers can build a typed response without a second read; legacy
  // callers can ignore the return value.
  // T30: optional `source` and `metadata` thread through.
  // T-trait-library: optional `traits` delta merges into character.traits
  // (canonical merge via trait_library.mergeTraits). All three fields are
  // additive — existing callers pass nothing and nothing changes.
  async function recordCharacterMention({
    userId,
    characterName,
    voice = "",
    tags = [],
    source = "",
    metadata = null,
    traits = null,
  }) {
    if (!userId || !characterName || typeof characterName !== "string") {
      return { ok: false, action: "skipped", reason: "missing_userId_or_name" };
    }
    const name = characterName.trim();
    if (!name) {
      return { ok: false, action: "skipped", reason: "empty_name" };
    }
    const cleanSource = typeof source === "string" ? source.trim() : "";
    const cleanMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata
      : null;
    const cleanTraits = traits && typeof traits === "object" && !Array.isArray(traits)
      ? traits
      : null;
    let resolvedAction = "recorded";
    await updateUser(userId, (rec) => {
      const characters = Array.isArray(rec.characters) ? rec.characters : [];
      const existingIdx = characters.findIndex((c) => c.name === name);
      const now = nowMs();
      if (existingIdx >= 0) {
        resolvedAction = "updated";
        characters[existingIdx].last_referenced = now;
        if (voice) characters[existingIdx].voice = voice;
        if (Array.isArray(tags) && tags.length) {
          const set = new Set([...(characters[existingIdx].tags || []), ...tags]);
          characters[existingIdx].tags = [...set];
        }
        if (cleanSource) characters[existingIdx].source = cleanSource;
        if (cleanMetadata) {
          characters[existingIdx].metadata = {
            ...(characters[existingIdx].metadata || {}),
            ...cleanMetadata,
          };
        }
        if (cleanTraits) {
          characters[existingIdx].traits = mergeCharacterTraits(
            characters[existingIdx].traits,
            cleanTraits,
          );
        }
      } else {
        const entry = {
          name,
          voice: voice || "",
          first_seen: now,
          last_referenced: now,
          tags: Array.isArray(tags) ? [...new Set(tags)] : [],
        };
        if (cleanSource) entry.source = cleanSource;
        if (cleanMetadata) entry.metadata = { ...cleanMetadata };
        if (cleanTraits) entry.traits = mergeCharacterTraits(null, cleanTraits);
        characters.push(entry);
      }
      characters.sort((a, b) => (b.last_referenced || 0) - (a.last_referenced || 0));
      rec.characters = characters.slice(0, CHARACTERS_MAX);
      return rec;
    });
    return { ok: true, action: resolvedAction, characterName: name, source: cleanSource };
  }

  // T-trait-library: reader for one or all character trait records.
  async function getCharacterTraits({ userId, characterName = null } = {}) {
    if (!userId) return null;
    const rec = await readUser(userId);
    if (!rec || !Array.isArray(rec.characters)) return null;
    if (characterName && typeof characterName === "string") {
      const name = characterName.trim();
      if (!name) return null;
      const found = rec.characters.find((c) => c.name === name);
      if (!found) return null;
      return { name: found.name, traits: found.traits || null };
    }
    return rec.characters.map((c) => ({ name: c.name, traits: c.traits || null }));
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
      // T-block-detector: completing a scene clears the recent-short-turn
      // streak (the writer is no longer stuck) and stamps the activity
      // timestamps the block_detector reads.
      rec.habits.last_scene_completion_at = nowMs();
      rec.habits.last_scene_attempt_at = rec.habits.last_scene_completion_at;
      rec.habits.recent_short_turns = 0;
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
      // T-block-detector: stamp the attempt time so block_detector can
      // measure dry spells. Completion stamps both fields; attempt-only
      // stamps just `last_scene_attempt_at`.
      rec.habits.last_scene_attempt_at = nowMs();
      return rec;
    });
  }

  // T-block-detector: record a /talk turn's contribution to the block
  // signal. Updates `last_talk_turn_at` and maintains a small rolling
  // counter `recent_short_turns` (transcripts under SHORT_TURN_LEN_CHARS).
  // Capped at SHORT_TURN_WINDOW so the counter doesn't grow unbounded.
  // Long turns decay the counter toward zero so the user's recovery is
  // observable in the next signal computation.
  async function recordTalkTurnForBlockSignal({ userId, transcript = "", nowAtMs = nowMs() } = {}) {
    if (!userId) return;
    const len = typeof transcript === "string" ? transcript.trim().length : 0;
    const SHORT_TURN_LEN_CHARS = 40;
    const SHORT_TURN_WINDOW = 8;
    const isShort = len > 0 && len < SHORT_TURN_LEN_CHARS;
    const isLong = len >= SHORT_TURN_LEN_CHARS;
    await updateUser(userId, (rec) => {
      rec.habits = rec.habits || {};
      rec.habits.last_talk_turn_at = Number(nowAtMs) || nowMs();
      const prev = Number(rec.habits.recent_short_turns) || 0;
      if (isShort) {
        rec.habits.recent_short_turns = Math.min(prev + 1, SHORT_TURN_WINDOW);
      } else if (isLong) {
        // Long turn → fade the short-turn signal one step toward zero.
        rec.habits.recent_short_turns = Math.max(prev - 1, 0);
      }
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
      rec.style.lexicalFingerprint = existing.slice(-LEXICAL_FINGERPRINT_MAX);
      return rec;
    });
  }

  // Test seam — clear all entries in this domain.
  async function _clearAll() {
    if (typeof store.clear === "function") {
      await store.clear({ domain: DOMAIN });
    }
  }

  // T-creative-memory-delete-endpoint: delete a single user's record.
  // Public path called by the DELETE /memory/forget route. Returns
  // { ok, deleted } so the route layer can report what happened —
  // `deleted: false` when no record existed (idempotent / safe).
  async function deleteMemoryForUser(userId) {
    const u = userId === null || userId === undefined ? "" : String(userId).trim();
    if (!u) return { ok: false, deleted: false, reason: "missing_userId" };
    if (typeof store.delete !== "function") {
      return { ok: false, deleted: false, reason: "delete_unsupported" };
    }
    const existing = await readUser(u);
    if (!existing) return { ok: true, deleted: false };
    await store.delete({ domain: DOMAIN, key: u });
    return { ok: true, deleted: true };
  }

  // T08w-triggers: extract signals from a /talk turn and fire the
  // appropriate write triggers. Pure-ish: deterministic given inputs;
  // only side effect is the writes through the existing trigger
  // functions above. Safe to call when userId is null (becomes a no-op).
  async function recordTriggersFromTalkTurn({
    userId,
    transcript = "",
    reply = "",
    sessionStartedAt = null,
    sessionDurationMs = null,
  } = {}) {
    if (!userId) return { skipped: true, reason: "no userId" };
    const summary = {
      characterMentions: 0,
      lexicalPhrases: 0,
      sessionRecorded: false,
    };

    const combined = `${String(transcript || "")}\n${String(reply || "")}`;

    // Character mentions: screenplay character cue lines are CAPITALIZED
    // names on their own line, optionally followed by a parenthetical.
    // Allow letters, digits ("GUARD 2"), spaces, periods, apostrophes,
    // and hyphens. Bounded — we cap at 8 unique names per turn.
    // Use [ \t]* (horizontal whitespace) rather than \s* — \s would
    // greedily consume trailing newlines and skip the next cue line.
    const cueRegex = /(?:^|\n)[ \t]*([A-Z][A-Z0-9 .'-]{1,34}[A-Z0-9])(?:[ \t]*\([^)]+\))?[ \t]*\n/g;
    const seen = new Set();
    let match;
    let limit = 8;
    while (limit > 0 && (match = cueRegex.exec(combined)) !== null) {
      const raw = String(match[1] || "").trim();
      if (!raw || raw.length < 2) continue;
      // Skip screenplay scene headings (INT./EXT. + LOCATION) and common
      // transition words. Prefix match catches "INT. KITCHEN - NIGHT".
      if (/^(INT\.|EXT\.|INT\/EXT|INT|EXT|FADE|CUT TO|CUT|END|TITLE|MONTAGE|FLASHBACK|SUPER|SMASH CUT|MATCH CUT|DISSOLVE)/.test(raw)) continue;
      // Skip lines that look like scene actions (multiple spaces after a hyphen).
      if (raw.includes(" - ") && raw.split(" ").length > 4) continue;
      const key = raw.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        await recordCharacterMention({ userId, characterName: raw });
        summary.characterMentions += 1;
      } catch (_e) { /* never block the response on memory writes */ }
      limit -= 1;
    }

    // Lexical fingerprint: capture short evocative phrases from the
    // user's transcript (4-10 words, ending at sentence boundary).
    // Bounded — top 4 sentences from this turn.
    if (transcript && typeof transcript === "string") {
      const sentences = transcript
        .split(/[.!?]\s+/)
        .map((s) => s.trim())
        .filter((s) => {
          const wc = s.split(/\s+/).filter(Boolean).length;
          return wc >= 4 && wc <= 12;
        })
        .slice(0, 4);
      if (sentences.length) {
        try {
          await recordLexicalFingerprint({ userId, phrases: sentences });
          summary.lexicalPhrases = sentences.length;
        } catch (_e) { /* */ }
      }
    }

    // Session pattern: derive from the session start time when supplied.
    if (Number.isFinite(sessionStartedAt)) {
      try {
        await recordSessionEnd({ userId, sessionStartedAt, sessionDurationMs });
        summary.sessionRecorded = true;
      } catch (_e) { /* */ }
    }

    // T-block-detector: stamp last_talk_turn_at and maintain the short-
    // turn counter. Single write; never blocks the response.
    try {
      await recordTalkTurnForBlockSignal({ userId, transcript });
      summary.blockSignalUpdated = true;
    } catch (_e) { /* */ }

    return summary;
  }

  // T-block-detector: expose the raw habits object so the route layer
  // can compute a block signal without re-reading the full record.
  async function getHabitsForUser(userId) {
    const rec = await readUser(userId);
    if (!rec || !rec.habits || typeof rec.habits !== "object") return null;
    return clone(rec.habits);
  }

  return {
    SCHEMA_VERSION,
    DOMAIN,
    getCreativeMemoryForPrompt,
    getCharacterTraits,
    getHabitsForUser,
    hasMemoryForUser,
    recordCharacterMention,
    recordSceneCompletion,
    recordSceneAttempt,
    recordToneSignal,
    recordSessionEnd,
    recordLexicalFingerprint,
    recordTalkTurnForBlockSignal,
    deleteMemoryForUser,
    recordTriggersFromTalkTurn,
    _clearAll,
  };
}

export {
  createCreativeMemoryStore,
  SCHEMA_VERSION as CREATIVE_MEMORY_SCHEMA_VERSION,
};

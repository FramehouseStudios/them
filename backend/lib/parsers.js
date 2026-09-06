// D009 — pure parse* helpers extracted verbatim from backend/index.js.
//
// Every function here reads only its arguments (plus the helpers imported
// below): no module state, no calls back into index.js. Moved verbatim with
// its doc comment; index.js imports it by the same name, so no call site
// changed.

import { normalizeScreenplayCorrectionTerm, normalizeScreenplayStringList } from "./normalizers.js";
import { normalizeSnippet } from "./utils.js";

function parseTalkScreenplayContextList(value, maxItems = 8, maxChars = 180) {
  if (Array.isArray(value)) return normalizeScreenplayStringList(value, maxItems, maxChars);
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  if (raw.startsWith("[") || raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      return normalizeScreenplayStringList(Array.isArray(parsed) ? parsed : [], maxItems, maxChars);
    } catch (_err) {
      // Fall through to delimiter parsing.
    }
  }
  return normalizeScreenplayStringList(
    raw.split(/\r?\n|;|,/).map((item) => item.trim()),
    maxItems,
    maxChars
  );
}

function parseTalkScreenplayCharacterArcMemory(value) {
  if (!value) return null;
  let source = value;
  if (Array.isArray(source)) {
    source = source.find((item) => item && typeof item === "object") || null;
  }
  if (!source) return null;
  if (typeof source === "string") {
    const raw = source.trim();
    if (!raw) return null;
    if (raw.startsWith("{") || raw.startsWith("[")) {
      try {
        return parseTalkScreenplayCharacterArcMemory(JSON.parse(raw));
      } catch (_err) {
        // Fall through to key/value parsing.
      }
    }
    const parsed = {};
    for (const part of raw.split(/\r?\n|;/)) {
      const match = part.match(/^\s*([A-Za-z][A-Za-z0-9_\-\s]{1,40})\s*:\s*(.+?)\s*$/);
      if (!match) continue;
      const key = match[1]
        .trim()
        .replace(/[-\s]+([a-zA-Z0-9])/g, (_all, ch) => ch.toUpperCase())
        .replace(/^([A-Z])/, (_all, ch) => ch.toLowerCase());
      parsed[key] = match[2].trim();
    }
    source = parsed;
  }
  if (!source || typeof source !== "object") return null;

  const arc = source.bible?.arc && typeof source.bible.arc === "object"
    ? source.bible.arc
    : (source.arc && typeof source.arc === "object" ? source.arc : source);
  const clean = {
    character: normalizeSnippet(
      source.character ?? source.characterName ?? source.character_name ?? source.name ?? arc.character ?? arc.characterName ?? arc.character_name ?? "",
      80
    ),
    act: normalizeSnippet(arc.act ?? arc.currentAct ?? arc.current_act ?? "", 80),
    want: normalizeSnippet(arc.want ?? arc.externalWant ?? arc.external_want ?? "", 180),
    need: normalizeSnippet(arc.need ?? arc.innerNeed ?? arc.inner_need ?? "", 180),
    wound: normalizeSnippet(arc.wound ?? arc.ghost ?? arc.trauma ?? "", 180),
    falseBelief: normalizeSnippet(arc.falseBelief ?? arc.false_belief ?? arc.lie ?? arc.misbelief ?? "", 180),
    relationshipPressure: normalizeSnippet(
      arc.relationshipPressure ?? arc.relationship_pressure ?? arc.relationalPressure ?? arc.relational_pressure ?? "",
      180
    ),
    currentTactic: normalizeSnippet(arc.currentTactic ?? arc.current_tactic ?? arc.tactic ?? "", 180),
    nextEmotionalTurn: normalizeSnippet(
      arc.nextEmotionalTurn ?? arc.next_emotional_turn ?? arc.emotionalTurn ?? arc.emotional_turn ?? arc.nextTurn ?? arc.next_turn ?? "",
      180
    ),
  };
  const hasSignal = Object.entries(clean)
    .some(([key, val]) => key !== "character" && key !== "act" && Boolean(val));
  return hasSignal ? clean : null;
}

function parseTalkScreenplayCharacterVoiceMemory(value) {
  if (!value) return null;
  let source = value;
  if (Array.isArray(source)) {
    source = source.find((item) => item && typeof item === "object") || null;
  }
  if (!source) return null;
  if (typeof source === "string") {
    const raw = source.trim();
    if (!raw) return null;
    if (raw.startsWith("{") || raw.startsWith("[")) {
      try {
        return parseTalkScreenplayCharacterVoiceMemory(JSON.parse(raw));
      } catch (_err) {
        return null;
      }
    }
    return null;
  }
  if (!source || typeof source !== "object") return null;

  const nestedTraits = source.traits && typeof source.traits === "object" ? source.traits : null;
  const fingerprint =
    (source.voice_fingerprint && typeof source.voice_fingerprint === "object" ? source.voice_fingerprint : null) ||
    (source.voiceFingerprint && typeof source.voiceFingerprint === "object" ? source.voiceFingerprint : null) ||
    (nestedTraits?.voice_fingerprint && typeof nestedTraits.voice_fingerprint === "object" ? nestedTraits.voice_fingerprint : null) ||
    (nestedTraits?.voiceFingerprint && typeof nestedTraits.voiceFingerprint === "object" ? nestedTraits.voiceFingerprint : null) ||
    source;
  const character = normalizeSnippet(
    source.character ?? source.characterName ?? source.character_name ?? source.name ?? fingerprint.character ?? fingerprint.characterName ?? fingerprint.character_name ?? "",
    80
  );
  const voiceFingerprint = {
    tactics: normalizeScreenplayStringList(
      fingerprint.tactics ?? fingerprint.dialogueTactics ?? fingerprint.dialogue_tactics,
      6,
      80
    ),
    silence: normalizeSnippet(
      fingerprint.silence ?? fingerprint.silencePattern ?? fingerprint.silence_pattern ?? "",
      120
    ),
    emotionalTells: normalizeScreenplayStringList(
      fingerprint.emotional_tells ?? fingerprint.emotionalTells ?? fingerprint.tells,
      6,
      100
    ),
  };
  if (
    !character ||
    (
      voiceFingerprint.tactics.length < 1 &&
      !voiceFingerprint.silence &&
      voiceFingerprint.emotionalTells.length < 1
    )
  ) {
    return null;
  }
  return { character, voiceFingerprint };
}

function parseSimpleDueAt(text, nowTs = Date.now()) {
  const source = String(text || "").toLowerCase();
  if (!source) return 0;
  const now = new Date(nowTs);
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);

  if (source.includes("tomorrow")) {
    base.setDate(base.getDate() + 1);
  } else if (source.includes("tonight")) {
    base.setHours(20, 0, 0, 0);
  } else {
    const weekdayMap = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const weekdayMatch = source.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (weekdayMatch) {
      const target = weekdayMap[String(weekdayMatch[1] || "").toLowerCase()];
      if (Number.isFinite(target)) {
        const current = now.getDay();
        let delta = (target - current + 7) % 7;
        if (delta === 0) delta = 7;
        base.setDate(base.getDate() + delta);
      }
    }
  }

  const timeMatch = source.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (timeMatch) {
    let hour = Number(timeMatch[1] || 9);
    const minute = Math.max(0, Math.min(59, Number(timeMatch[2] || 0)));
    const suffix = String(timeMatch[3] || "").toLowerCase();
    if (suffix === "pm" && hour < 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
    hour = Math.max(0, Math.min(23, hour));
    base.setHours(hour, minute, 0, 0);
  }

  return base.getTime();
}

function parseScreenplayCorrectionReplacement(value = "") {
  const clean = normalizeSnippet(value, 180);
  const parts = clean.split(/\s*->\s*/);
  if (parts.length !== 2) return null;
  const from = normalizeScreenplayCorrectionTerm(parts[0], 90);
  const to = normalizeScreenplayCorrectionTerm(parts[1], 120);
  if (!from || !to || from.toLowerCase() === to.toLowerCase()) return null;
  return { from, to };
}

function parseBoundedFloat(value, min, max) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, parsed));
}

function parseBoundedInt(value, min, max) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, parsed));
}

function parseQueryLimit(value, fallback = 24, max = 200) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function parseTurnIdToNumber(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return 0;
  const normalized = raw.startsWith("turn-") ? raw.slice(5) : raw;
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

export {
  parseBoundedFloat,
  parseBoundedInt,
  parseQueryLimit,
  parseScreenplayCorrectionReplacement,
  parseSimpleDueAt,
  parseTalkScreenplayCharacterArcMemory,
  parseTalkScreenplayCharacterVoiceMemory,
  parseTalkScreenplayContextList,
  parseTurnIdToNumber,
};

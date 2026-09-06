// D009 — parse* helpers that read module limits, extracted verbatim from backend/index.js.
//
// Functions here read only their arguments, the helpers imported below, the
// limits in lib/limits.js, and each other. Moved verbatim with doc comments;
// index.js imports every name unchanged.

import { parseTalkScreenplayCharacterArcMemory, parseTalkScreenplayCharacterVoiceMemory } from "./parsers.js";
import { sanitizeAdaptiveQualityTags } from "./sanitizers_bounded.js";
import { clampUnit } from "./utils.js";

function parseTalkScreenplayCharacterArcMemoryItems(value, maxItems = 8) {
  if (!value) return [];
  const out = [];
  const seen = new Set();
  const push = (candidate) => {
    const clean = parseTalkScreenplayCharacterArcMemory(candidate);
    if (!clean) return;
    const key = [
      clean.character,
      clean.act,
      clean.want,
      clean.need,
      clean.wound,
      clean.falseBelief,
      clean.relationshipPressure,
      clean.currentTactic,
      clean.nextEmotionalTurn,
    ].join("|").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  };

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];
    if (raw.startsWith("[") || raw.startsWith("{")) {
      try {
        return parseTalkScreenplayCharacterArcMemoryItems(JSON.parse(raw), maxItems);
      } catch (_err) {
        push(raw);
        return out;
      }
    }
    push(raw);
    return out.slice(0, Math.max(1, Number(maxItems || 8)));
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      push(item);
      if (out.length >= maxItems) break;
    }
    return out;
  }

  if (value && typeof value === "object") {
    const nested =
      value.characterBibles ??
      value.character_bibles ??
      value.characters ??
      value.arcs ??
      value.items ??
      null;
    if (Array.isArray(nested)) {
      for (const item of nested) {
        push(item);
        if (out.length >= maxItems) break;
      }
      return out;
    }
    push(value);
  }

  return out.slice(0, Math.max(1, Number(maxItems || 8)));
}

function parseTalkScreenplayCharacterVoiceMemoryItems(value, maxItems = 8) {
  if (!value) return [];
  const out = [];
  const seen = new Set();
  const push = (candidate) => {
    const clean = parseTalkScreenplayCharacterVoiceMemory(candidate);
    if (!clean) return;
    const key = [
      clean.character,
      clean.voiceFingerprint.tactics.join(","),
      clean.voiceFingerprint.silence,
      clean.voiceFingerprint.emotionalTells.join(","),
    ].join("|").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  };

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];
    if (raw.startsWith("[") || raw.startsWith("{")) {
      try {
        return parseTalkScreenplayCharacterVoiceMemoryItems(JSON.parse(raw), maxItems);
      } catch (_err) {
        push(raw);
        return out;
      }
    }
    push(raw);
    return out.slice(0, Math.max(1, Number(maxItems || 8)));
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      push(item);
      if (out.length >= maxItems) break;
    }
    return out;
  }

  if (value && typeof value === "object") {
    const nested =
      value.characterVoiceFingerprints ??
      value.character_voice_fingerprints ??
      value.characterVoiceMemories ??
      value.character_voice_memories ??
      value.voiceFingerprints ??
      value.voice_fingerprints ??
      value.characters ??
      value.items ??
      null;
    if (Array.isArray(nested)) {
      for (const item of nested) {
        push(item);
        if (out.length >= maxItems) break;
      }
      return out;
    }
    push(value);
  }

  return out.slice(0, Math.max(1, Number(maxItems || 8)));
}

function parseAdaptiveEvalJson(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return null;
  const parseAttempt = (candidate) => {
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed || typeof parsed !== "object") return null;
      const score = clampUnit(parsed.score, 0.66);
      const tags = sanitizeAdaptiveQualityTags(parsed.tags, 8);
      return { score, tags, source: "llm_eval" };
    } catch (_err) {
      return null;
    }
  };
  const direct = parseAttempt(text);
  if (direct) return direct;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  return parseAttempt(match[0]);
}

export {
  parseAdaptiveEvalJson,
  parseTalkScreenplayCharacterArcMemoryItems,
  parseTalkScreenplayCharacterVoiceMemoryItems,
};

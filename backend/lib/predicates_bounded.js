// D009 — is* helpers that read module limits, extracted verbatim from backend/index.js.
//
// Functions here read only their arguments, the helpers imported below, the
// limits in lib/limits.js, and each other. Moved verbatim with doc comments;
// index.js imports every name unchanged.

import { normalizeLocalActionType } from "./normalizers.js";
import { isTalkParentheticalLine, isTalkSceneHeadingLine, isTalkTransitionLine } from "./predicates.js";
import { LOCAL_ACTION_DEDUPE_WINDOW_MS, TALK_SPECULATIVE_ENABLED } from "./limits.js";

function isSpeculativePrepareRequest(req) {
  if (!TALK_SPECULATIVE_ENABLED) return false;
  return String(req.get("X-Speculative-Mode") || "")
    .trim()
    .toLowerCase() === "prepare";
}

function isTalkUppercaseCueCandidate(line = "") {
  const trimmed = String(line || "").trim();
  if (!trimmed) return false;
  if (isTalkSceneHeadingLine(trimmed) || isTalkTransitionLine(trimmed) || isTalkParentheticalLine(trimmed)) {
    return false;
  }
  if (trimmed.length > 42 || /[.!?]$/.test(trimmed)) return false;
  if (trimmed !== trimmed.toUpperCase()) return false;
  return /[A-Z]/.test(trimmed);
}

function isTalkCharacterCueLine(line = "", nextNonEmpty = "") {
  const trimmed = String(line || "").trim();
  if (!trimmed) return false;
  if (isTalkSceneHeadingLine(trimmed) || isTalkTransitionLine(trimmed) || isTalkParentheticalLine(trimmed)) {
    return false;
  }
  if (trimmed.length > 42 || /[.!?]$/.test(trimmed)) return false;
  if (trimmed !== trimmed.toUpperCase()) return false;
  if (!/[A-Z]/.test(trimmed)) return false;
  const cleanNext = String(nextNonEmpty || "").trim();
  if (!cleanNext) return false;
  return !isTalkSceneHeadingLine(cleanNext) && !isTalkTransitionLine(cleanNext);
}

function isLocalActionDuplicate(memory, {
  type = "",
  signature = "",
  nowTs = Date.now(),
  windowMs = LOCAL_ACTION_DEDUPE_WINDOW_MS,
} = {}) {
  if (!memory || typeof memory !== "object") return false;
  const lastType = normalizeLocalActionType(memory.lastLocalActionType);
  const nextType = normalizeLocalActionType(type);
  if (!nextType || nextType === "none" || !signature) return false;
  if (lastType !== nextType) return false;
  const lastSignature = String(memory.lastLocalActionSignature || "").trim();
  if (!lastSignature || lastSignature !== signature) return false;
  const lastAt = Math.max(0, Number(memory.lastLocalActionAt || 0));
  if (!lastAt) return false;
  const ageMs = Math.max(0, Number(nowTs || Date.now()) - lastAt);
  return ageMs <= Math.max(2_000, Number(windowMs || LOCAL_ACTION_DEDUPE_WINDOW_MS));
}

export {
  isLocalActionDuplicate,
  isSpeculativePrepareRequest,
  isTalkCharacterCueLine,
  isTalkUppercaseCueCandidate,
};

// talk_clementine_headers — D009 strangler: x-suggestion / x-uncertainty / x-collab-cursor + samantha presence/voice for talk_handler.
// No backend/index.js growth. Pure helpers, tested via talk_handler + unit test.
// Wire: talk_handler calls applyClementineTalkHeaders(res, { project, draft, parsed, quality, collabCursor, ownerKey }).
import { shouldSuggest, buildSuggestion } from "./samantha_intuition.js";
import { getSamanthaPresence } from "./samantha_presence.js";
import { getWriterVoiceProfile, buildVulnerabilityAsk } from "./samantha_voice.js";

function toTrimmed(v) { return String(v||"").trim(); }

export function buildSuggestionHeader({ project, draft, parsed } = {}) {
  try {
    if (!shouldSuggest({ project, draft })) return "";
    const s = buildSuggestion({ project, parsed, draft });
    return toTrimmed(s?.xSuggestion || s?.suggestions?.[0] || "");
  } catch { return ""; }
}

export function buildUncertaintyHeader({ quality } = {}) {
  const conf = toTrimmed(quality?.confidence).toLowerCase();
  if (conf === "high") return "0.10";
  if (conf === "medium") return "0.40";
  if (conf === "low") return "0.80";
  // fallback from quality.ok
  if (quality && typeof quality.ok === "boolean") return quality.ok ? "0.20" : "0.70";
  return "0.50";
}

export function buildCollabCursorHeader({ collabCursor, project, draft } = {}) {
  // Prefer explicit cursor from request/body, else derive next page cursor.
  if (collabCursor && typeof collabCursor === "object") {
    const page = Math.max(1, Math.round(Number(collabCursor.page||collabCursor.p||1)));
    const line = Math.max(1, Math.round(Number(collabCursor.line||collabCursor.l||1)));
    const ch = toTrimmed(collabCursor.character||collabCursor.c||"");
    const payload = ch ? { page, line, character: ch } : { page, line };
    try { return JSON.stringify(payload); } catch { return JSON.stringify({ page, line }); }
  }
  // Derive next page from draft pagination (55 lines/page heuristic)
  const lines = String(draft||"").split("\n").length;
  const nextPage = Math.max(1, Math.ceil(lines/55) || 1);
  // include active character if project has one
  const ch = toTrimmed(project?.characterContexts?.[0]?.name || "");
  const payload = ch ? { page: nextPage, line: 1, character: ch } : { page: nextPage, line: 1 };
  return JSON.stringify(payload);
}

export function buildPresenceHeaders({ project } = {}) {
  try {
    const p = getSamanthaPresence(project);
    const state = String(p?.state || "idle");
    const hist = Array.isArray(p?.history) ? p.history.slice(-20) : [];
    return { state, history: hist, lastBargeInAt: p?.lastBargeInAt || null, lastBargeInReason: p?.lastBargeInReason || null };
  } catch { return { state: "idle", history: [] }; }
}

export function buildVoiceHeaders({ project, parsed, draft, quality, ownerKey } = {}) {
  try {
    const voice = ownerKey ? getWriterVoiceProfile(ownerKey) : { voice: "grounded", cadence: "naturalistic pause", learned: 0 };
    const conf = quality?.confidence === "high" ? 0.8 : quality?.confidence === "low" ? 0.4 : 0.6;
    const ask = buildVulnerabilityAsk({ project, parsed, confidence: conf });
    return {
      voice: String(voice.voice || "grounded").slice(0, 40),
      cadence: String(voice.cadence || "naturalistic pause").slice(0, 40),
      learned: Math.max(0, Number(voice.learned || 0)),
      vulnAsk: ask?.question ? String(ask.question).slice(0, 500) : "",
      vulnOptions: Array.isArray(ask?.options) ? ask.options.slice(0,2) : [],
    };
  } catch { return { voice: "grounded", cadence: "naturalistic pause", learned: 0, vulnAsk: "", vulnOptions: [] }; }
}

export function applyClementineTalkHeaders(res, { project, draft, parsed, quality, collabCursor, ownerKey } = {}) {
  const suggestion = buildSuggestionHeader({ project, draft, parsed });
  if (suggestion) {
    // cap encoded length ~800 decoded, encodeURIComponent safe
    const enc = encodeURIComponent(suggestion.slice(0, 800));
    res.setHeader("x-suggestion", enc);
  }
  const uncertainty = buildUncertaintyHeader({ quality });
  res.setHeader("x-uncertainty", uncertainty);
  const cursorJson = buildCollabCursorHeader({ collabCursor, project, draft });
  if (cursorJson) {
    const enc = encodeURIComponent(cursorJson.slice(0, 500));
    res.setHeader("x-collab-cursor", enc);
  }
  // Samantha presence 20-history (header-wired)
  try {
    const pres = buildPresenceHeaders({ project });
    res.setHeader("x-samantha-presence", encodeURIComponent(String(pres.state).slice(0, 40)));
    if (pres.history.length) res.setHeader("x-presence-history", encodeURIComponent(JSON.stringify(pres.history).slice(0, 800)));
    if (pres.lastBargeInAt) res.setHeader("x-presence-barge-at", String(pres.lastBargeInAt));
    if (pres.lastBargeInReason) res.setHeader("x-presence-barge-reason", encodeURIComponent(String(pres.lastBargeInReason).slice(0, 80)));
  } catch {}
  // Samantha voice + vulnerability ask (writer voice learn)
  try {
    const voice = buildVoiceHeaders({ project, parsed, draft, quality, ownerKey });
    res.setHeader("x-voice-learn", encodeURIComponent(`${voice.voice}|${voice.cadence}|${voice.learned}`.slice(0, 120)));
    if (voice.vulnAsk) {
      res.setHeader("x-vuln-ask", encodeURIComponent(voice.vulnAsk.slice(0, 500)));
      if (voice.vulnOptions.length) res.setHeader("x-vuln-options", encodeURIComponent(JSON.stringify(voice.vulnOptions).slice(0, 400)));
    }
  } catch {}
}

export default { buildSuggestionHeader, buildUncertaintyHeader, buildCollabCursorHeader, applyClementineTalkHeaders };

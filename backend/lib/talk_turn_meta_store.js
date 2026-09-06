// D009 — in-memory talk turn-meta store, extracted verbatim from backend/index.js.
//
// Holds the per-turn record that GET /talk/turn/:turnId serves (transcript,
// reply, cues, screenplay output, dialogue timeline, next beats). TTL / size
// limits and the normalizers it needs are passed in; the Map is private to
// the factory so nothing else can reach into it except through `values()`.

import { normalizeSnippet } from "./utils.js";

function createTalkTurnMetaStore({
  ttlMs,
  maxEntries,
  screenplayMaxChars,
  buildTalkScreenplayQualityEnvelope,
  clientIp,
  normalizeClientIp,
  normalizeClientToken,
  normalizeScreenplayOwnerValue,
  normalizeTalkMultilineSnippet,
  sanitizeTalkDialogueTimeline,
} = {}) {
  const required = { ttlMs, maxEntries, screenplayMaxChars, buildTalkScreenplayQualityEnvelope, clientIp, normalizeClientIp, normalizeClientToken, normalizeScreenplayOwnerValue, normalizeTalkMultilineSnippet, sanitizeTalkDialogueTimeline };
  const missing = Object.entries(required).filter(([, v]) => v === undefined).map(([k]) => k);
  if (missing.length) {
    throw new Error(`createTalkTurnMetaStore missing dependencies: ${missing.join(", ")}`);
  }
  const TALK_TURN_META_TTL_MS = ttlMs;
  const TALK_TURN_META_MAX_ENTRIES = maxEntries;
  const TALK_TURN_META_SCREENPLAY_MAX_CHARS = screenplayMaxChars;
  const talkTurnMetaById = new Map();

  function cleanupTalkTurnMetaStore(now = Date.now()) {
    const cutoff = now - Math.max(60_000, Number(TALK_TURN_META_TTL_MS || 0));
    for (const [turnId, entry] of talkTurnMetaById.entries()) {
      const updatedAt = Math.max(
        0,
        Number(entry?.updatedAt || entry?.createdAt || 0)
      );
      if (updatedAt > 0 && updatedAt < cutoff) {
        talkTurnMetaById.delete(turnId);
      }
    }
    if (talkTurnMetaById.size <= TALK_TURN_META_MAX_ENTRIES) return;
    const entries = [...talkTurnMetaById.entries()]
      .map(([turnId, entry]) => ({
        turnId,
        updatedAt: Math.max(0, Number(entry?.updatedAt || entry?.createdAt || 0)),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    for (let i = TALK_TURN_META_MAX_ENTRIES; i < entries.length; i += 1) {
      talkTurnMetaById.delete(entries[i].turnId);
    }
  }

  function storeTalkTurnMeta({
    turnId = "",
    sessionId = "",
    userId = "",
    stateVersion = "",
    transcript = "",
    reply = "",
    audioDurationMs = 0,
    timingSource = "",
    screenplayCues = [],
    screenplayOutput = null,
    dialogueTimeline = null,
    renderContract = null,
    nextBeats = [],
    requestId = "",
    now = Date.now(),
  } = {}) {
    const normalizedTurnId = String(turnId || "").trim();
    if (!normalizedTurnId) return;
    cleanupTalkTurnMetaStore(now);
    talkTurnMetaById.set(normalizedTurnId, {
      turnId: normalizedTurnId,
      nextBeats: Array.isArray(nextBeats)
        ? nextBeats.map((beat) => normalizeSnippet(beat, 180)).filter(Boolean).slice(0, 3)
        : [],
      sessionId: String(sessionId || "").trim(),
      userId: normalizeScreenplayOwnerValue(userId, "user"),
      stateVersion: String(stateVersion || "").trim(),
      transcript: normalizeSnippet(transcript, 6_000),
      reply: normalizeSnippet(reply, 8_000),
      audioDurationMs: Math.max(0, Number(audioDurationMs || 0)),
      timingSource: normalizeSnippet(timingSource, 32),
      screenplayCues: Array.isArray(screenplayCues)
        ? screenplayCues
          .filter((cue) => cue && typeof cue === "object")
          .slice(0, 400)
          .map((cue, index) => ({
            index: Math.max(0, Number(cue.index ?? index)),
            text: normalizeTalkMultilineSnippet(cue.text, 240),
            element: normalizeSnippet(cue.element, 32) || "action",
            start_ms: Math.max(0, Number(cue.start_ms ?? cue.startMs ?? 0)),
            end_ms: Math.max(0, Number(cue.end_ms ?? cue.endMs ?? 0)),
          }))
        : [],
      screenplayOutput: screenplayOutput && typeof screenplayOutput === "object"
        ? {
          target: normalizeSnippet(screenplayOutput.target, 24) || "voice_pin",
          format: normalizeSnippet(screenplayOutput.format, 24) || "note",
          source: normalizeSnippet(screenplayOutput.source, 32) || "unknown",
          quality: screenplayOutput.quality && typeof screenplayOutput.quality === "object"
            ? buildTalkScreenplayQualityEnvelope({
              ok: Boolean(screenplayOutput.quality.ok),
              reason: screenplayOutput.quality.reason,
              source: screenplayOutput.quality.source || screenplayOutput.source,
              quality: {
                reason: screenplayOutput.quality.reason,
                counts: screenplayOutput.quality.counts,
                featureObligation: {
                  featureActKind: screenplayOutput.quality.feature_act,
                  matchedTokens: screenplayOutput.quality.matched_tokens,
                },
              },
            })
            : buildTalkScreenplayQualityEnvelope({
              ok: String(screenplayOutput.target || "").trim().toLowerCase() === "page",
              reason: String(screenplayOutput.target || "").trim().toLowerCase() === "page" ? "ok" : "unavailable",
              source: screenplayOutput.source,
            }),
          text: normalizeTalkMultilineSnippet(
            screenplayOutput.text,
            TALK_TURN_META_SCREENPLAY_MAX_CHARS
          ),
          lines: Array.isArray(screenplayOutput.lines)
            ? screenplayOutput.lines
              .filter((line) => line && typeof line === "object")
              .slice(0, 400)
              .map((line, index) => ({
                index: Math.max(0, Number(line.index ?? index)),
                text: normalizeTalkMultilineSnippet(line.text, 240),
                element: normalizeSnippet(line.element, 32) || "action",
              }))
            : [],
        }
        : null,
      dialogueTimeline: sanitizeTalkDialogueTimeline(dialogueTimeline),
      renderContract: renderContract && typeof renderContract === "object"
        ? {
          reply_role: ["preview", "final"].includes(String(renderContract.reply_role || renderContract.replyRole || "").trim().toLowerCase())
            ? String(renderContract.reply_role || renderContract.replyRole || "").trim().toLowerCase()
            : "final",
          authoritative_page_text_available: Boolean(
            renderContract.authoritative_page_text_available ??
            renderContract.authoritativePageTextAvailable
          ),
          sync_ready: Boolean(renderContract.sync_ready ?? renderContract.syncReady),
        }
        : {
          reply_role: "final",
          authoritative_page_text_available: false,
          sync_ready: false,
        },
      requestId: normalizeSnippet(requestId, 32),
      createdAt: Math.max(0, Number(now || Date.now())),
      updatedAt: Math.max(0, Number(now || Date.now())),
    });
  }

  function readTalkTurnMeta(turnId = "", now = Date.now()) {
    cleanupTalkTurnMetaStore(now);
    const normalizedTurnId = String(turnId || "").trim();
    if (!normalizedTurnId) return null;
    const entry = talkTurnMetaById.get(normalizedTurnId);
    if (!entry) return null;
    return {
      turnId: normalizedTurnId,
      sessionId: String(entry.sessionId || "").trim(),
      userId: normalizeScreenplayOwnerValue(entry.userId, "user"),
      stateVersion: String(entry.stateVersion || "").trim(),
      transcript: String(entry.transcript || ""),
      reply: String(entry.reply || ""),
      audioDurationMs: Math.max(0, Number(entry.audioDurationMs || 0)),
      timingSource: String(entry.timingSource || "").trim(),
      screenplayCues: Array.isArray(entry.screenplayCues) ? entry.screenplayCues : [],
      screenplayOutput: entry.screenplayOutput && typeof entry.screenplayOutput === "object"
        ? entry.screenplayOutput
        : null,
      dialogueTimeline: entry.dialogueTimeline && typeof entry.dialogueTimeline === "object"
        ? entry.dialogueTimeline
        : null,
      renderContract: entry.renderContract && typeof entry.renderContract === "object"
        ? {
          reply_role: ["preview", "final"].includes(String(entry.renderContract.reply_role || "").trim().toLowerCase())
            ? String(entry.renderContract.reply_role || "").trim().toLowerCase()
            : "final",
          authoritative_page_text_available: Boolean(entry.renderContract.authoritative_page_text_available),
          sync_ready: Boolean(entry.renderContract.sync_ready),
        }
        : {
          reply_role: "final",
          authoritative_page_text_available: false,
          sync_ready: false,
        },
      requestId: String(entry.requestId || ""),
      createdAt: Math.max(0, Number(entry.createdAt || 0)),
      updatedAt: Math.max(0, Number(entry.updatedAt || entry.createdAt || 0)),
    };
  }

  function canReadTalkTurnMeta(req, meta) {
    if (!meta || typeof meta !== "object") return false;
    const appToken = String(req.get("X-APP-TOKEN") || "").trim();
    const ip = normalizeClientIp(clientIp(req));
    if (
      process.env.NODE_ENV !== "production"
      && appToken === "them-dev"
      && (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1")
    ) {
      return true;
    }
    const sessionId = String(meta.sessionId || "").trim();
    const metaUserId = normalizeScreenplayOwnerValue(meta.userId, "user");
    const requestUserId = normalizeScreenplayOwnerValue(req.authUser?.id || req.userId, "user");
    if (metaUserId && requestUserId && metaUserId === requestUserId) {
      return true;
    }
    if (!sessionId) return true;
    const token = normalizeClientToken(req.get("X-Client-Token"));
    if (token) {
      return sessionId === token || sessionId === `ip:${ip}`;
    }
    if (sessionId.startsWith("ip:")) {
      return sessionId === `ip:${ip}`;
    }
    return false;
  }

  return {
    cleanupTalkTurnMetaStore,
    storeTalkTurnMeta,
    readTalkTurnMeta,
    canReadTalkTurnMeta,
    values: () => [...talkTurnMetaById.values()],
    size: () => talkTurnMetaById.size,
  };
}

export { createTalkTurnMetaStore };

// T-talk-turn-rate-limit-route: keys the rate limiter on the
// caller — userId when authenticated, else the request IP. Keeps
// unauthenticated traffic from pooling behind a single bucket.
function defaultRateLimitKey(req) {
  const userId = req?.user?.id || req?.authUser?.id || req?.userId;
  if (typeof userId === "string" && userId.length > 0) return `user:${userId}`;
  // Express's req.ip is a string when trust-proxy is configured; fall
  // back to the socket remote address.
  const ip = req?.ip || req?.socket?.remoteAddress || "unknown";
  return `ip:${ip}`;
}

function mountTalkPipelineRoutes(app, {
  talkRateLimitGuard,
  requireClientTokenForTalk,
  talkIdempotencyGuard,
  talkSessionSerialGuard,
  talkConcurrencyGuard,
  talkUpload,
  handleTalkRequest,
  normalizeTalkTurnId,
  getTalkTurnMeta,
  canReadTalkTurnMeta,
  // Optional. If supplied, GET /talk/turn/:turnId gates entry on
  // `rateLimiter.attempt(key)`. Backwards-compatible: omitted →
  // no limiter, current behavior.
  turnReadRateLimiter = null,
  turnReadRateLimitKey = defaultRateLimitKey,
} = {}) {
  app.get("/talk/turn/:turnId", (req, res) => {
    if (turnReadRateLimiter && typeof turnReadRateLimiter.attempt === "function") {
      const key = turnReadRateLimitKey(req);
      const verdict = turnReadRateLimiter.attempt(key);
      if (verdict && verdict.allowed === false) {
        res.setHeader("Cache-Control", "no-store");
        if (Number.isFinite(verdict.retryAfterMs)) {
          res.setHeader("Retry-After", Math.ceil(verdict.retryAfterMs / 1000));
        }
        return res.status(429).json({
          error: "rate_limited",
          retry_after_ms: Number.isFinite(verdict.retryAfterMs) ? verdict.retryAfterMs : null,
        });
      }
    }
    const turnId = normalizeTalkTurnId(req.params?.turnId);
    if (!turnId) {
      return res.status(400).json({ error: "invalid_turn_id" });
    }
    const meta = getTalkTurnMeta(turnId);
    if (!meta) {
      return res.status(404).json({ error: "turn_not_found" });
    }
    if (!canReadTalkTurnMeta(req, meta)) {
      return res.status(403).json({ error: "forbidden" });
    }
    res.setHeader("Cache-Control", "no-store");
    if (meta.sessionId) res.setHeader("x-session-id", meta.sessionId);
    if (meta.stateVersion) res.setHeader("x-state-version", meta.stateVersion);
    return res.status(200).json({
      turn_id: meta.turnId,
      session_id: meta.sessionId || null,
      user_id: meta.userId || null,
      state_version: meta.stateVersion || null,
      transcript: meta.transcript || "",
      reply: meta.reply || "",
      audio_duration_ms: Math.max(0, Number(meta.audioDurationMs || 0)) || null,
      timing_source: String(meta.timingSource || "").trim() || null,
      screenplay_cues: Array.isArray(meta.screenplayCues) ? meta.screenplayCues : [],
      screenplay_output: meta.screenplayOutput || null,
      dialogue_timeline: meta.dialogueTimeline || null,
      render_contract: meta.renderContract || {
        reply_role: "final",
        authoritative_page_text_available: false,
        sync_ready: false,
      },
      request_id: meta.requestId || null,
      updated_at: Math.max(0, Number(meta.updatedAt || meta.createdAt || 0)) || null,
    });
  });

  app.post(
    "/talk",
    talkRateLimitGuard,
    requireClientTokenForTalk,
    talkIdempotencyGuard,
    talkSessionSerialGuard,
    talkConcurrencyGuard,
    talkUpload,
    handleTalkRequest
  );
}

export {
  mountTalkPipelineRoutes,
};

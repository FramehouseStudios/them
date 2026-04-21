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
} = {}) {
  app.get("/talk/turn/:turnId", (req, res) => {
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

// T-talk-turn-rate-limit-route: keys the rate limiter on the
// caller — userId when authenticated, else the request IP. Keeps
// unauthenticated traffic from pooling behind a single bucket.
//
// D008 / T-clementine-page-cancel-e2e + page-abort-midflight: optional
// Page-lane adapter + POST /talk/page-cancel. Cancel aborts the
// reservation AbortController; talk_handler passes the signal into chat.

import express from "express";
import {
  createPageLaneTalkAdapter,
} from "./clementine/page_lane_adapter.js";

function defaultRateLimitKey(req) {
  const userId = req?.user?.id || req?.authUser?.id || req?.userId;
  if (typeof userId === "string" && userId.length > 0) return `user:${userId}`;
  // Express's req.ip is a string when trust-proxy is configured; fall
  // back to the socket remote address.
  const ip = req?.ip || req?.socket?.remoteAddress || "unknown";
  return `ip:${ip}`;
}

const PAGE_CANCEL_BODY_LIMIT = "16kb";

function pickString(...candidates) {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

/**
 * Mount POST /talk/page-cancel.
 * Body: { session_id?, reservation_id?, user_id?, reason? }
 * - reservation_id → cancel(id)
 * - else session_id → cancelByOwner({ sessionId, userId })
 */
function mountPageCancelRoute(app, { pageReservationStore } = {}) {
  if (!app || typeof app.post !== "function") {
    throw new Error("mountPageCancelRoute requires an Express app");
  }
  if (!pageReservationStore) {
    throw new Error("mountPageCancelRoute requires pageReservationStore");
  }

  app.post(
    "/talk/page-cancel",
    express.json({ limit: PAGE_CANCEL_BODY_LIMIT }),
    (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const reservationId = pickString(
        body.reservation_id,
        body.reservationId,
        body.id
      );
      const sessionId = pickString(
        body.session_id,
        body.sessionId,
        req.get?.("x-session-id"),
        req.headers?.["x-session-id"]
      );
      const userId = pickString(
        body.user_id,
        body.userId,
        req?.authUser?.id,
        req?.user?.id
      );
      const reason = pickString(body.reason, body.cancel_reason, body.cancelReason) || "barge_in";

      if (reservationId) {
        const result = pageReservationStore.cancel(reservationId, { reason });
        if (!result) {
          return res.status(404).json({
            ok: false,
            error: "reservation_not_found",
            reservation_id: reservationId,
          });
        }
        return res.status(200).json({
          ok: true,
          cancelled: result.cancelled === true,
          reservation_id: result.id,
          session_id: result.sessionId,
          status: result.status,
          cancel_reason: result.cancelReason,
          dropped: result.cancelled === true ? [result.id] : [],
        });
      }

      if (!sessionId) {
        return res.status(400).json({
          ok: false,
          error: "session_id_or_reservation_id_required",
        });
      }

      const dropped = pageReservationStore.cancelByOwner(
        { sessionId, userId },
        { reason }
      );
      return res.status(200).json({
        ok: true,
        cancelled: dropped.length > 0,
        session_id: sessionId,
        dropped,
        cancel_reason: reason,
      });
    }
  );
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
  // D008 Page cancel-on-barge-in (optional; omit → legacy behavior).
  pageReservationStore = null,
  logger = console,
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

  let talkHandler = handleTalkRequest;
  if (pageReservationStore) {
    talkHandler = createPageLaneTalkAdapter({
      handleTalkRequest,
      pageReservationStore,
      logger,
    });
    mountPageCancelRoute(app, { pageReservationStore });
  }

  app.post(
    "/talk",
    talkRateLimitGuard,
    requireClientTokenForTalk,
    talkIdempotencyGuard,
    talkSessionSerialGuard,
    talkConcurrencyGuard,
    talkUpload,
    talkHandler
  );
}

export {
  mountTalkPipelineRoutes,
  mountPageCancelRoute,
};

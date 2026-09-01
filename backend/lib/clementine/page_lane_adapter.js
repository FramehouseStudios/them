// Thin talk-edge adapter for D008 Page-lane cancel-on-barge-in.
//
// Wires classifyIntent → laneForIntent without rewriting talk_handler.
// When the lane is Page (or explicit page_edit), reserves before the
// expensive path. Downstream must call store.proceed(id) before billing.
// Each reservation owns an AbortController; cancel(id)/cancelByOwner abort
// it. talk_handler injects req.clementine.abortSignal at chat call sites.

import { classifyIntent, INTENT } from "./intents.js";
import { laneForIntent, LANE } from "./lanes.js";

function pickString(...candidates) {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
    if (typeof c === "number" && Number.isFinite(c)) return String(c);
  }
  return "";
}

function peekUtterance(req) {
  const body = req?.body && typeof req.body === "object" ? req.body : {};
  return pickString(
    body.client_transcript,
    body.clientTranscript,
    body.debug_transcript,
    body.debugTranscript,
    body.screenplay_generation_transcript,
    body.screenplayGenerationTranscript,
    body.transcript,
    body.text,
    body.utterance
  );
}

function peekPageHints(req) {
  const body = req?.body && typeof req.body === "object" ? req.body : {};
  const target = pickString(
    body.screenplay_target,
    body.screenplayTarget,
    body.studio_screenplay_target,
    body.studioScreenplayTarget
  ).toLowerCase();
  const forcedIntent = pickString(body.clementine_intent, body.clementineIntent, body.intent);
  const pageMode =
    target === "page" ||
    body.page_mode === true ||
    body.pageMode === true ||
    String(body.page_mode || body.pageMode || "").toLowerCase() === "true";
  const continuePage =
    body.continue_page === true ||
    body.continuePage === true ||
    String(body.continue_page || body.continuePage || "").toLowerCase() === "true";
  const multiBeat =
    body.multi_beat === true ||
    body.multiBeat === true ||
    String(body.multi_beat || body.multiBeat || "").toLowerCase() === "true";
  const maxOutputTokens = Math.max(
    0,
    Math.round(Number(body.max_output_tokens ?? body.maxOutputTokens ?? 0) || 0)
  );
  return {
    intent: forcedIntent,
    pageMode,
    continuePage,
    multiBeat,
    maxOutputTokens,
  };
}

function resolveSessionId(req) {
  const body = req?.body && typeof req.body === "object" ? req.body : {};
  const fromBody = pickString(body.session_id, body.sessionId);
  if (fromBody) return fromBody;
  const fromHeader = pickString(
    req?.get?.("x-session-id"),
    req?.headers?.["x-session-id"]
  );
  if (fromHeader) return fromHeader;
  const clientToken = pickString(
    req?.get?.("x-client-token"),
    req?.headers?.["x-client-token"],
    req?.clientSession?.token,
    req?.clientSession?.id
  );
  if (clientToken) return clientToken;
  const ip = pickString(req?.ip, req?.socket?.remoteAddress) || "unknown";
  return `ip:${ip}`;
}

function resolveUserId(req) {
  return pickString(
    req?.authUser?.id,
    req?.userId,
    req?.user?.id,
    req?.body?.user_id,
    req?.body?.userId
  );
}

/**
 * Classify + map lane at the talk edge. Pure; no store side effects.
 */
function resolveTalkLane(utterance, hints = {}) {
  const intent = classifyIntent(utterance, hints);
  const laneInfo = laneForIntent(intent, {
    multiBeat: hints.multiBeat === true,
  });
  return { intent, ...laneInfo };
}

/**
 * If lane is Page, create a reservation. Returns { lane, reservation|null }.
 * Does not throw on missing session — uses resolveSessionId fallback.
 */
function beginPageWork(store, {
  utterance = "",
  hints = {},
  sessionId = "",
  userId = "",
  meta = null,
} = {}) {
  if (!store || typeof store.reserve !== "function") {
    throw new Error("beginPageWork requires a page reservation store");
  }
  const lane = resolveTalkLane(utterance, hints);
  const isPage =
    lane.lane === LANE.PAGE ||
    lane.intent === INTENT.PAGE_EDIT ||
    lane.intent === INTENT.PAGE_CONTINUE ||
    lane.intent === INTENT.PAGE_REWRITE ||
    hints.pageMode === true;

  if (!isPage) {
    return { lane, reservation: null, reserved: false };
  }

  const reservation = store.reserve({
    sessionId: String(sessionId || "").trim() || "anonymous",
    userId,
    maxOutputTokens: hints.maxOutputTokens || 0,
    reason: lane.intent || "page",
    meta,
  });
  return { lane, reservation, reserved: true };
}

/**
 * Wrap handleTalkRequest: classify → reserve Page → attach req.clementine
 * (including abortSignal from the reservation AbortController).
 */
function createPageLaneTalkAdapter({
  handleTalkRequest,
  pageReservationStore,
  logger = console,
} = {}) {
  if (typeof handleTalkRequest !== "function") {
    throw new Error("createPageLaneTalkAdapter requires handleTalkRequest");
  }
  if (!pageReservationStore || typeof pageReservationStore.reserve !== "function") {
    throw new Error("createPageLaneTalkAdapter requires pageReservationStore");
  }

  return async function handleTalkWithPageLane(req, res) {
    const utterance = peekUtterance(req);
    const hints = peekPageHints(req);
    const sessionId = resolveSessionId(req);
    const userId = resolveUserId(req);

    let lane;
    let reservation = null;
    try {
      const started = beginPageWork(pageReservationStore, {
        utterance,
        hints,
        sessionId,
        userId,
        meta: { source: "talk_edge" },
      });
      lane = started.lane;
      reservation = started.reservation;
    } catch (err) {
      logger?.warn?.(
        `[clementine/page] reserve skipped: ${err?.message || err}`
      );
      lane = resolveTalkLane(utterance, hints);
    }

    req.clementine = {
      intent: lane.intent,
      lane: lane.lane,
      effort: lane.effort,
      walletMeter: lane.walletMeter,
      reservationId: reservation?.id || null,
      reservation,
      abortSignal: reservation?.id
        ? pageReservationStore.getAbortSignal(reservation.id)
        : null,
      /**
       * Billing gate. Call before Muse / wallet debit.
       * talk_handler also gates via gatePageGeneration(req.clementine).
       */
      proceed: reservation
        ? () => pageReservationStore.proceed(reservation.id)
        : () => ({ ok: true, code: "no_page_reservation", reservation: null }),
    };

    if (reservation?.id) {
      try {
        res.setHeader("x-clementine-page-reservation", reservation.id);
        res.setHeader("x-clementine-lane", lane.lane);
      } catch (_e) {
        /* headers may already be sent in edge cases */
      }
    }

    return handleTalkRequest(req, res);
  };
}

export {
  peekUtterance,
  peekPageHints,
  resolveSessionId,
  resolveUserId,
  resolveTalkLane,
  beginPageWork,
  createPageLaneTalkAdapter,
};

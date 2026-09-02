// Thin talk-edge adapter for D008 Page-lane cancel-on-barge-in + Reflex short-circuit.
//
// Wires classifyIntent → laneForIntent without rewriting talk_handler.
// Order at the talk edge:
//   1) classify lane
//   2) if Reflex/Companion and tryReflexReply succeeds → HTTP short-circuit
//      (no wallet reserve, no Spark / handleTalkRequest)
//   3) else if Page → reserve (wallet + page AbortController) then talk_handler
// Downstream must call store.proceed(id) before billing.
// Each reservation owns an AbortController; cancel(id)/cancelByOwner abort
// it. talk_handler injects req.clementine.abortSignal at chat call sites.

import { classifyIntent, INTENT } from "./intents.js";
import { laneForIntent, LANE } from "./lanes.js";
import {
  peekKnownFacts,
  peekVoiceSpecHints,
  tryTalkEdgeReflex,
  sendReflexReply,
} from "./talk_edge_adapter.js";
import {
  isPageMultipassEnabled,
  multipassWalletReserveTokenMultiplier,
} from "./page_multipass.js";

function pickString(...candidates) {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
    if (typeof c === "number" && Number.isFinite(c)) return String(c);
  }
  return "";
}


function expectsAudioTalkResponse(req) {
  if (req?.file) return true;
  if (Array.isArray(req?.files) && req.files.length) return true;
  if (req?.files && typeof req.files === "object") {
    for (const value of Object.values(req.files)) {
      if (value) return true;
    }
  }
  const accept = String(req?.get?.("accept") || req?.headers?.accept || "").toLowerCase();
  if (accept.includes("audio/")) return true;
  const ct = String(req?.headers?.["content-type"] || req?.get?.("content-type") || "").toLowerCase();
  if (ct.includes("multipart/form-data")) return true;
  return false;
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
 *
 * When walletStore is provided, reserves Page-lane turns from max_output_tokens
 * first (hard stop wallet_empty). Links walletReservationId onto the page
 * reservation so cancel → wallet.release.
 *
 * Commit stub: after successful Muse generation, callers should
 *   walletStore.commit(walletReservationId, actualOutputTokens)
 * Prefer doing that in talk_handler (or a thin post-success hook) once
 * usage is known — this adapter has no response-success seam without
 * rewriting handleTalkRequest. See docs/product/clementine-wallet.md.
 */
function beginPageWork(store, {
  utterance = "",
  hints = {},
  sessionId = "",
  userId = "",
  meta = null,
  walletStore = null,
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
    return { lane, reservation: null, reserved: false, walletReservation: null };
  }

  let walletReservation = null;
  const ownerId = String(userId || "").trim() || String(sessionId || "").trim() || "anonymous";
  const multipassOn = isPageMultipassEnabled();
  // Wallet honesty: draft+revise are both metered when multipass is on —
  // reserve 2× max_output_tokens headroom (plan/critique remain unmetered).
  const maxOutputTokens = Math.max(
    0,
    Math.round(Number(hints.maxOutputTokens || 0) || 0)
  ) * (multipassOn ? multipassWalletReserveTokenMultiplier() : 1);
  if (walletStore && typeof walletStore.reserve === "function") {
    walletReservation = walletStore.reserve({
      ownerId,
      lane: "page",
      maxOutputTokens,
      meta: {
        source: "beginPageWork",
        pageMultipass: multipassOn,
      },
    });
  }

  const metaObj = meta && typeof meta === "object" ? { ...meta } : {};
  if (walletReservation?.reservationId) {
    metaObj.walletReservationId = walletReservation.reservationId;
  }

  const reservation = store.reserve({
    sessionId: String(sessionId || "").trim() || "anonymous",
    userId,
    maxOutputTokens,
    reason: lane.intent || "page",
    meta: Object.keys(metaObj).length ? metaObj : null,
  });

  if (
    walletReservation?.reservationId &&
    walletStore &&
    typeof walletStore.linkPageReservation === "function"
  ) {
    walletStore.linkPageReservation(walletReservation.reservationId, reservation.id);
  }

  return { lane, reservation, reserved: true, walletReservation };
}

/**
 * Wrap handleTalkRequest: classify → reserve Page → attach req.clementine
 * (including abortSignal from the reservation AbortController).
 */
function createPageLaneTalkAdapter({
  handleTalkRequest,
  pageReservationStore,
  walletStore = null,
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

    // --- Reflex short-circuit (before wallet / Spark) ---
    // greetings / thanks / check-ins / acks / soft silence via templates.
    // See talk_edge_adapter.js + reflex_lane.js. No CoreML / Glimmer yet.
    const earlyLane = resolveTalkLane(utterance, hints);
    const reflexHit = tryTalkEdgeReflex({
      text: utterance,
      laneInfo: earlyLane,
      knownFacts: peekKnownFacts(req),
      voiceSpecHints: peekVoiceSpecHints(req),
    });
    if (reflexHit?.handled) {
      req.clementine = {
        intent: earlyLane.intent,
        lane: earlyLane.lane,
        effort: earlyLane.effort,
        walletMeter: "none",
        reservationId: null,
        reservation: null,
        walletReservationId: null,
        walletReservation: null,
        commitWallet: null,
        abortSignal: null,
        reflex: reflexHit,
        proceed: () => ({ ok: true, code: "reflex_short_circuit", reservation: null }),
      };
      // Voice /talk (multipart audio) must still TTS the template — JSON short-circuit
      // breaks clients expecting audio/mpeg. Text-shaped requests keep no-Spark JSON path.
      if (!expectsAudioTalkResponse(req)) {
        logger?.log?.(
          `[clementine/reflex] short-circuit template=${reflexHit.templateId} intent=${earlyLane.intent}`
        );
        return sendReflexReply(res, { reflex: reflexHit, laneInfo: earlyLane });
      }
      logger?.log?.(
        `[clementine/reflex] audio path template=${reflexHit.templateId} intent=${earlyLane.intent} (TTS, no Spark)`
      );
      try {
        res.setHeader("x-clementine-lane", earlyLane.lane || LANE.REFLEX);
        res.setHeader("x-clementine-reflex", "1");
        if (reflexHit.templateId) {
          res.setHeader("x-clementine-reflex-template", String(reflexHit.templateId));
        }
      } catch (_e) {
        /* headers may already be sent */
      }
      return handleTalkRequest(req, res);
    }

    let lane;
    let reservation = null;
    let walletReservation = null;
    try {
      const started = beginPageWork(pageReservationStore, {
        utterance,
        hints,
        sessionId,
        userId,
        meta: { source: "talk_edge" },
        walletStore,
      });
      lane = started.lane;
      reservation = started.reservation;
      walletReservation = started.walletReservation || null;
    } catch (err) {
      if (err?.code === "wallet_empty") {
        try {
          res.setHeader("Cache-Control", "no-store");
        } catch (_e) {
          /* ignore */
        }
        return res.status(402).json({
          ok: false,
          error: "wallet_empty",
          message: "You are out of Page turns. Top up to keep writing.",
        });
      }
      logger?.warn?.(
        `[clementine/page] reserve skipped: ${err?.message || err}`
      );
      lane = resolveTalkLane(utterance, hints);
    }

    const pageMultipass = isPageMultipassEnabled();
    req.clementine = {
      intent: lane.intent,
      lane: lane.lane,
      effort: lane.effort,
      walletMeter: lane.walletMeter,
      pageMultipass,
      reservationId: reservation?.id || null,
      reservation,
      walletReservationId: walletReservation?.reservationId || null,
      walletReservation,
      /**
       * STUB — call after successful Muse generation with actual output tokens:
       *   req.clementine.commitWallet?.(actualOutputTokens)
       * No clear success hook in this adapter without rewriting talk_handler;
       * wire commit in talk_handler (or muse_client completion) when usage lands.
       */
      commitWallet:
        walletReservation?.reservationId && walletStore
          ? (actualOutputTokens) =>
              walletStore.commit(walletReservation.reservationId, actualOutputTokens)
          : null,
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
  expectsAudioTalkResponse,
  peekUtterance,
  peekPageHints,
  resolveSessionId,
  resolveUserId,
  resolveTalkLane,
  beginPageWork,
  createPageLaneTalkAdapter,
};

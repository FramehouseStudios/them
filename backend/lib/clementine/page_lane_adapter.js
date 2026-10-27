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
import { currentScreenplayInstruction } from "../screenplay_write_instruction.js";
import { resolveScreenplayTargetFromRequest } from "../screenplay_turn_target.js";
import { createTalkFailureError, buildTalkFailureDiagnostics, buildTalkFailureBody } from "../talk_failure_diagnostics.js";
import {
  peekKnownFacts,
  peekVoiceSpecHints,
  tryTalkEdgeReflex,
  sendReflexReply,
  peekConversationFreshness,
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
  return currentScreenplayInstruction(req?.body);
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
    (!target && resolveScreenplayTargetFromRequest(body) === "page") ||
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
  let intent = classifyIntent(utterance, hints);
  if (hints.intent && (hints.pageMode === true || hints.continuePage === true)
    && laneForIntent(intent).lane !== LANE.PAGE) {
    // A caller's conversational hint is not authority to make page writing
    // free. Current words/Page controls still own the funded writing lane;
    // the classifier's refusal policy continues to outrank stale Page hints.
    const requested = classifyIntent(utterance, { ...hints, intent: "" });
    if (laneForIntent(requested).lane === LANE.PAGE) intent = requested;
  }
  const laneInfo = laneForIntent(intent, {
    multiBeat: hints.multiBeat === true,
  });
  return { intent, ...laneInfo };
}

function markTalkAsDiscussion(req, res) {
  Object.assign(req.clementine, {
    ...resolveTalkLane("", { intent: INTENT.ADVISE }), pageMultipass: false,
    reservationId: null, reservation: null, walletReservationId: null,
    walletReservation: null, commitWallet: null, abortSignal: null, reflex: null,
    proceed: () => ({ ok: true, code: "no_page_reservation", reservation: null }),
  });
  if (!res.headersSent) {
    res.removeHeader("x-clementine-page-reservation");
    res.removeHeader("x-clementine-reflex");
    res.removeHeader("x-clementine-reflex-template");
    res.setHeader("x-clementine-lane", req.clementine.lane);
  }
}

/**
 * If lane is Page, create a reservation. Returns { lane, reservation|null }.
 * Does not throw on missing session — uses resolveSessionId fallback.
 *
 * The HTTP adapter defers the initial wallet budget until the server generation
 * cap is known. Direct callers retain explicit budget reservation. Link the
 * same wallet hold to Page cancellation; record usage during generation and
 * settle only the successful response lifecycle. Durable settlement is separate.
 */
function beginPageWork(store, {
  utterance = "",
  hints = {},
  sessionId = "",
  userId = "",
  meta = null,
  walletStore = null,
  deferWalletBudget = false,
} = {}) {
  if (!store || typeof store.reserve !== "function") {
    throw new Error("beginPageWork requires a page reservation store");
  }
  const lane = resolveTalkLane(utterance, hints);
  const isPage =
    lane.lane === LANE.PAGE ||
    lane.intent === INTENT.PAGE_EDIT ||
    lane.intent === INTENT.PAGE_CONTINUE ||
    lane.intent === INTENT.PAGE_REWRITE;

  if (!isPage) {
    return { lane, reservation: null, reserved: false, walletReservation: null };
  }

  let walletReservation = null;
  const ownerId = String(userId || "").trim() || String(sessionId || "").trim() || "anonymous";
  const multipassOn = isPageMultipassEnabled();
  // Meter draft+revise, plus the optional repair pass. Plan/critique are unmetered.
  const maxOutputTokens = deferWalletBudget ? 0 : Math.max(
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

  async function handleClassifiedTalk(req, res, runHandler) {
    const utterance = peekUtterance(req);
    const hints = peekPageHints(req);
    const sessionId = resolveSessionId(req);
    const userId = resolveUserId(req);

    // --- Reflex short-circuit (before wallet / Spark) ---
    // greetings / thanks / check-ins / acks / soft silence via templates.
    // See talk_edge_adapter.js + reflex_lane.js. No CoreML / Glimmer yet.
    const freshConversation = peekConversationFreshness(req);
    const earlyLane = resolveTalkLane(utterance, { ...hints, fresh: freshConversation });
    const reflexHit = tryTalkEdgeReflex({
      text: utterance,
      laneInfo: earlyLane,
      knownFacts: peekKnownFacts(req),
      voiceSpecHints: peekVoiceSpecHints(req),
      freshConversation,
    });
    if (!reflexHit?.handled && freshConversation && earlyLane?.intent === INTENT.PITCH) {
      logger?.log?.("[clementine/reflex] skipped greeting template on a fresh conversation (scene pitch goes to the model)");
    }
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
        refusePageWrite: () => markTalkAsDiscussion(req, res),
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
      return runHandler(req, res);
    }

    let lane;
    let reservation = null;
    let walletReservation = null;
    try {
      const started = beginPageWork(pageReservationStore, {
        utterance,
        hints: { ...hints, fresh: freshConversation },
        sessionId,
        userId,
        meta: { source: "talk_edge" },
        walletStore,
        deferWalletBudget: true,
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
      const diagnostic = buildTalkFailureDiagnostics(err, { providerStage: "chat", status: 503,
        errorClass: "page_reservation_unavailable" });
      return res.status(503).json(buildTalkFailureBody(diagnostic));
    }

    // Generation only proposes usage. Settle after the handler's quality and
    // response stages; an HTTP 200 recovery reply is still a failed write.
    let pendingOutputTokens = null;
    let walletSettled = false;
    const settleWallet = (delivered) => {
      if (walletSettled || !walletReservation?.reservationId || !walletStore) return;
      walletSettled = true;
      const turnStatus = String(res.getHeader?.('x-turn-status') || '');
      const failed = !delivered || res.statusCode >= 400 ||
        turnStatus.startsWith('error') || turnStatus === 'asked_repeat' ||
        turnStatus === 'continue_listening';
      if (failed || pendingOutputTokens === null) {
        walletStore.release(walletReservation.reservationId);
      } else {
        walletStore.commit(walletReservation.reservationId, pendingOutputTokens);
      }
    };
    if (walletReservation?.reservationId && walletStore) {
      res.once('finish', () => settleWallet(true));
      res.once('close', () => settleWallet(false));
    }
    const pageMultipass = isPageMultipassEnabled();
    req.clementine = {
      intent: lane.intent,
      lane: lane.lane,
      effort: lane.effort,
      walletMeter: lane.walletMeter,
      pageMultipass,
      prepareGenerationBudget: walletStore ? (maxTokens, { requestId = "", passes = 1 } = {}) => {
        try {
          const gate = pageReservationStore.proceed(reservation?.id);
          if (!gate.ok) throw new Error("Page reservation is not active");
          if (!Number.isSafeInteger(passes) || passes <= 0) throw new Error("Invalid metered pass count");
          const budget = Math.ceil(Number(maxTokens)) * passes;
          const held = walletStore.ensureReservationBudget(walletReservation?.reservationId, budget);
          req.clementine.walletReservation = held;
          return held;
        } catch (error) {
          throw createTalkFailureError({ requestId, providerStage: "chat",
            status: error?.code === "wallet_empty" ? 402 : 503,
            errorClass: error?.code === "wallet_empty" ? "wallet_empty" : "page_reservation_unavailable" });
        }
      } : null,
      refusePageWrite: () => {
        // Cancel through the existing owner so linked wallet/cancel observers
        // see the revocation. A conversation must not inherit its aborted signal.
        if (reservation?.id) pageReservationStore.cancel(reservation.id, { reason: "writer_refused" });
        settleWallet(false);
        markTalkAsDiscussion(req, res);
      },
      reservationId: reservation?.id || null,
      reservation,
      walletReservationId: walletReservation?.reservationId || null,
      walletReservation,
      /**
       * Record generation usage; the response lifecycle settles the reservation.
       */
      commitWallet:
        walletReservation?.reservationId && walletStore
          ? (actualOutputTokens) => {
              pendingOutputTokens = Math.max(0, Number(actualOutputTokens) || 0);
            }
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

    try {
      return await runHandler(req, res);
    } catch (error) {
      settleWallet(false);
      throw error;
    }
  }

  return async function handleTalkWithPageLane(req, res) {
    if (expectsAudioTalkResponse(req) && !peekUtterance(req)) {
      // An untranscribed recording is not silence. Prepare its real lane once
      // ASR finishes, before generation; never run the speech pipeline twice.
      let classification;
      req.clementine = {
        resolveTranscript(transcript) {
          if (res.destroyed || res.writableEnded) return;
          if (!classification) {
            req.body = { ...req.body, client_transcript: transcript };
            classification = handleClassifiedTalk(req, res, async () => {});
          }
          return classification;
        },
      };
      return handleTalkRequest(req, res);
    }
    return handleClassifiedTalk(req, res, handleTalkRequest);
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

// D009 B3 — talk generate/stream stage (strangler extract from talk_handler).
//
// Owns the Muse/OpenAI model call seam: page abort gate, stream → chat
// fallback, and commitWallet on successful usage. Behavior matches the
// prior inline block in createTalkHandler.

import {
  buildTalkFailureDiagnostics,
  createTalkFailureError,
} from "./talk_failure_diagnostics.js";
import {
  gatePageGeneration,
  isPageCancelledError,
  mapAbortToPageCancel,
} from "./clementine/page_abort.js";
import {
  shouldRunPageMultipass,
  runTalkGeneratePageMultipass,
} from "./clementine/page_multipass.js";

/**
 * Run the billed chat generation stage (stream optional, then non-stream).
 * Preserves abort mapping, wallet commit, and empty-reply failure classes.
 *
 * @returns {Promise<{
 *   rawReply: string,
 *   streamFirstSentence: string,
 *   streamChatUsed: boolean,
 *   effectiveChatModel: string,
 *   effectiveChatApiMode: string,
 *   effectiveChatReasoningEffort: string,
 *   chatModelFallbackUsed: boolean,
 *   effectiveChatUsage: object,
 *   chatMs: number,
 * }>}
 */
async function runTalkGenerate({
  req,
  rid,
  logger,
  chatSupplier,
  useChatStreaming = false,
  system = "",
  shortTermContextMessages = [],
  talkGenerationTranscript = "",
  chatMessages = [],
  chatModelPlan = null,
  chatTemperature = 0.7,
  chatMaxTokens = 1000,
  chatStart = Date.now(),
  maybeStartEarlyTts = null,
  earlyTtsPromise = null,
} = {}) {
  let rawReply = "";
  let streamFirstSentence = "";
  let streamChatUsed = false;
  let effectiveChatModel = String(chatModelPlan?.model || "unknown");
  let effectiveChatApiMode = String(chatModelPlan?.apiMode || "chat_completions");
  let effectiveChatReasoningEffort = String(chatModelPlan?.reasoningEffort || "");
  let chatModelFallbackUsed = false;
  let effectiveChatUsage = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  };
  let chatMs = 0;

  // D008: Page mid-flight abort — thin inject (gate + AbortSignal).
  let pageAbortSignal = null;
  let pageReservationId = null;
  if (req?.clementine?.reservationId) {
    const pageGate = gatePageGeneration(req.clementine);
    pageAbortSignal = pageGate.signal;
    pageReservationId = pageGate.reservationId;
  }

  // F2: Page multipass (Plan→Draft→Critique→Revise). Flag-gated; thin hook.
  // Skips streaming — craft loop needs discrete stages + abort between them.
  if (shouldRunPageMultipass(req)) {
    return runTalkGeneratePageMultipass({
      req,
      rid,
      logger,
      chatSupplier,
      system,
      shortTermContextMessages,
      talkGenerationTranscript,
      chatMessages,
      chatModelPlan,
      chatTemperature,
      chatMaxTokens,
      chatStart,
    });
  }

  if (useChatStreaming) {
    try {
      const streamStart = Date.now();
      const streamResult = await chatSupplier.stream({
        rid,
        system,
        shortTermContextMessages,
        transcript: talkGenerationTranscript,
        onFirstSentence: maybeStartEarlyTts,
        model: chatModelPlan.model,
        temperature: chatTemperature,
        maxTokens: chatMaxTokens,
        apiMode: chatModelPlan.apiMode,
        reasoningEffort: req.clementine?.effort || chatModelPlan.reasoningEffort,
        fallbackModel: chatModelPlan.fallbackModel,
        signal: pageAbortSignal,
        lane: req.clementine?.lane || "",
        messages: chatMessages,
      });
      rawReply = String(streamResult.reply || "").trim();
      streamFirstSentence = String(streamResult.firstSentence || "").trim();
      streamChatUsed = Boolean(rawReply);
      effectiveChatModel = String(streamResult.model || effectiveChatModel);
      effectiveChatApiMode = String(streamResult.apiMode || effectiveChatApiMode);
      effectiveChatReasoningEffort = String(
        streamResult.reasoningEffort ?? effectiveChatReasoningEffort
      );
      chatModelFallbackUsed = Boolean(streamResult.fallbackUsed);
      effectiveChatUsage = streamResult.usage || effectiveChatUsage;
      chatMs = Date.now() - streamStart;
      if (typeof req.clementine?.commitWallet === "function" && rawReply) {
        try {
          req.clementine.commitWallet(
            Math.max(0, Number(effectiveChatUsage.outputTokens || 0))
          );
        } catch (walletErr) {
          logger?.warn?.(
            `[${rid}] wallet_commit_failed ${walletErr?.message || walletErr}`
          );
        }
      }
      if (streamFirstSentence && !earlyTtsPromise && typeof maybeStartEarlyTts === "function") {
        maybeStartEarlyTts(streamFirstSentence);
      }
    } catch (err) {
      const mapped = mapAbortToPageCancel(err, pageAbortSignal, {
        reservationId: pageReservationId,
      });
      if (isPageCancelledError(mapped)) {
        throw mapped;
      }
      const streamDiagnostic = buildTalkFailureDiagnostics(err, {
        requestId: rid,
        providerStage: "chat",
        status: Number(err?.status || 500),
      });
      logger?.log?.(`[${rid}] CHAT stream fallback ${streamDiagnostic.supportMessage}`);
      rawReply = "";
    }
  }

  if (!rawReply) {
    // Re-gate before non-stream billed call (cancel may have landed during stream attempt).
    if (pageReservationId) {
      gatePageGeneration(req.clementine);
    }
    let chatResult;
    try {
      chatResult = await chatSupplier.chat({
        model: chatModelPlan.model,
        temperature: chatTemperature,
        maxTokens: chatMaxTokens,
        messages: chatMessages,
        apiMode: chatModelPlan.apiMode,
        reasoningEffort: req.clementine?.effort || chatModelPlan.reasoningEffort,
        fallbackModel: chatModelPlan.fallbackModel,
        signal: pageAbortSignal,
        lane: req.clementine?.lane || "",
      });
    } catch (err) {
      const mapped = mapAbortToPageCancel(err, pageAbortSignal, {
        reservationId: pageReservationId,
      });
      if (isPageCancelledError(mapped)) {
        throw mapped;
      }
      throw createTalkFailureError({
        requestId: rid,
        providerStage: "chat",
        status: Number(err?.status || 500),
        message: String(err?.message || "Chat completion failed."),
      });
    }

    const chatResp = chatResult.response;
    const chatText = chatResult.rawText;
    effectiveChatModel = String(chatResult.model || effectiveChatModel);
    effectiveChatApiMode = String(chatResult.apiMode || effectiveChatApiMode);
    effectiveChatReasoningEffort = String(
      chatResult.reasoningEffort ?? effectiveChatReasoningEffort
    );
    chatModelFallbackUsed = Boolean(chatResult.fallbackUsed);
    effectiveChatUsage = chatResult.usage || effectiveChatUsage;
    chatMs = Date.now() - chatStart;
    if (typeof req.clementine?.commitWallet === "function") {
      try {
        req.clementine.commitWallet(
          Math.max(0, Number(effectiveChatUsage.outputTokens || 0))
        );
      } catch (walletErr) {
        logger?.warn?.(
          `[${rid}] wallet_commit_failed ${walletErr?.message || walletErr}`
        );
      }
    }

    if (!chatResp.ok) {
      const diagnostic = buildTalkFailureDiagnostics(
        { stage: "chat", status: chatResp.status, rawBody: chatText },
        {
          requestId: rid,
          providerStage: "chat",
          status: chatResp.status,
          rawBody: chatText,
        }
      );
      logger?.log?.(`[${rid}] CHAT failed ${diagnostic.supportMessage}`);
      throw createTalkFailureError({
        requestId: rid,
        providerStage: "chat",
        status: chatResp.status,
        rawBody: chatText,
      });
    }

    let chatJson;
    try {
      chatJson = JSON.parse(chatText);
    } catch (_) {
      throw createTalkFailureError({
        requestId: rid,
        providerStage: "chat",
        status: 502,
        message: "Chat completion response was invalid JSON.",
        errorClass: "response_invalid",
      });
    }
    rawReply = (chatJson.choices?.[0]?.message?.content || "").trim();
  }

  if (!rawReply) {
    throw createTalkFailureError({
      requestId: rid,
      providerStage: "chat",
      status: 502,
      message: "Chat completion returned an empty reply.",
      errorClass: "response_invalid",
    });
  }

  return {
    rawReply,
    streamFirstSentence,
    streamChatUsed,
    effectiveChatModel,
    effectiveChatApiMode,
    effectiveChatReasoningEffort,
    chatModelFallbackUsed,
    effectiveChatUsage,
    chatMs,
  };
}

export { runTalkGenerate };

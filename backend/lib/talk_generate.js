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
import { isShortFilmBetaEnabled } from "./clementine/short_film_beta.js";
import { parseShortFilmIntent } from "./clementine/short_film_intent.js";
import { runShortFilmLane } from "./clementine/short_film_lane.js";
import { enforceStudioScreenplayQuality } from "./studio_screenplay_quality_gate.js";
import { resolveShortFilmIntent } from "./clementine/short_film_intent_llm.js";

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

  // Beta short-film: flag-gated, before multipass. Gate on page-write turn, not flag alone — chat must never return Fountain.
  const isPageWriteForBeta = String(req.clementine?.lane || "").toLowerCase() === "page";
  if (isShortFilmBetaEnabled(process.env) && isPageWriteForBeta) {
    let betaParsed = parseShortFilmIntent(talkGenerationTranscript || "");
    if (!betaParsed) {
      try {
        betaParsed = await resolveShortFilmIntent(talkGenerationTranscript || "", { chatSupplier });
      } catch {}
    }
    if (betaParsed) {
      const pageAbort = req?.clementine?.abortSignal || null;
      let { draft, usage } = await runShortFilmLane({
        req,
        parsed: betaParsed,
        chatSupplier,
        signal: pageAbort,
        baseSystem: system,
        chatModelPlan,
      });
      // Studio quality gate — use existing gate with reply/transcript/body/systemPrompt and one repair pass
      try {
        const qualityResult = await enforceStudioScreenplayQuality({
          reply: draft,
          transcript: talkGenerationTranscript,
          body: req.body,
          systemPrompt: system,
          renderRepair: async ({ repairPrompt, systemPrompt: repairSystem }) => {
            const repaired = await runShortFilmLane({
              req,
              parsed: betaParsed,
              chatSupplier,
              signal: pageAbort,
              baseSystem: repairSystem || `${system}\n\n${repairPrompt}`,
              chatModelPlan,
            });
            return repaired.draft;
          },
        });
        if (qualityResult && typeof qualityResult.reply === "string") {
          draft = qualityResult.reply;
          // usage stays from first generation; quality gate does not change token count
          if (qualityResult.quality && !qualityResult.ok) {
            logger?.warn?.(`[${rid}] short_film_quality_repaired ok=${qualityResult.ok} reason=${qualityResult.quality?.reason || ""}`);
          }
        }
      } catch (_) {
        // Non-blocking: return draft even if quality gate throws
      }
      // Commit wallet like normal path (~127, ~201) — beta pages are not free
      if (typeof req.clementine?.commitWallet === "function") {
        try {
          req.clementine.commitWallet(Math.max(0, Number(usage.outputTokens || 0)));
        } catch (walletErr) {
          logger?.warn?.(`[${rid}] wallet_commit_failed ${walletErr?.message || walletErr}`);
        }
      }
      // Short-film project id + per-character contexts — singular project holds isolated memory per character
      try {
        const ownerRecord = req.clementine?.screenplayOwnerRecord || req.screenplayOwnerRecord || null;
        if (ownerRecord) {
          const { ensureShortFilmProjectWithContexts, createShortFilmVersion } = await import("./clementine/short_film_store.js");
          const { project } = ensureShortFilmProjectWithContexts({ ownerRecord, parsed: betaParsed, now: Date.now() });
          const version = createShortFilmVersion({ draft, parsed: betaParsed, now: Date.now() });
          if (!Array.isArray(project.versions)) project.versions = [];
          project.versions.push(version);
          project.activeVersionId = version.id;
          project.updatedAt = Date.now();
          // Best-effort persistence via injected committer if available (tests inject, prod has screenplay_store)
          // Attach project for lane prompt per-character block (simultaneous paper, isolated memory)
          req.clementine = req.clementine || {};
          req.clementine.screenplayProjectForPrompt = project;
          const committer = req.clementine?.commitScreenplayOwnerMutation || req.commitScreenplayOwnerMutation;
          if (typeof committer === "function" && ownerRecord.ownerKey) {
            try {
              await committer({
                ownerKey: ownerRecord.ownerKey,
                mutate: async (next) => {
                  // Mirror the in-memory mutation for CAS persistence (with contexts)
                  const { ensureShortFilmProjectWithContexts: ensure2, createShortFilmVersion: ver2 } = await import("./clementine/short_film_store.js");
                  const { project: p2 } = ensure2({ ownerRecord: next, parsed: betaParsed, now: Date.now() });
                  const v2 = ver2({ draft, parsed: betaParsed, now: Date.now() });
                  if (!Array.isArray(p2.versions)) p2.versions = [];
                  p2.versions.push(v2);
                  p2.activeVersionId = v2.id;
                  p2.updatedAt = Date.now();
                },
              });
            } catch (_) {}
          }
          req.clementine = req.clementine || {};
          req.clementine.screenplayProjectId = project.id;
          // Also stash on return for talk_handler to pick up without req mutation reliance
          req.clementine._shortFilmProjectId = project.id;
          // Simultaneous paper: push only immediate dialogue after header (not action lines)
          try {
            const { pushCharacterMemory } = await import("./clementine/short_film_character_context.js");
            const lines = String(draft).split("\n");
            let current = null;
            let expectDialogue = false;
            for (const raw of lines) {
              const up = raw.trim();
              if (!up) { expectDialogue = false; continue; }
              if (/^[A-Z][A-Z \-'0-9]{1,30}$/.test(up) && up === up.toUpperCase() && !up.startsWith("INT.") && !up.startsWith("EXT.")) {
                const name = up.split(" ")[0];
                if (parsed.characters?.some((c)=> String(c).toUpperCase()===name)) { current = name; expectDialogue = true; }
                else { current = null; expectDialogue = false; }
              } else if (current && expectDialogue) {
                // Immediate dialogue line after header — push once then wait for next header
                pushCharacterMemory(project, { name: current, text: up, page: 1 });
                expectDialogue = false;
              }
            }
          } catch {}
        }
      } catch (_) {}
      return {
        rawReply: draft,
        streamFirstSentence: "", // page-write early-TTS: don't speak Fountain
        streamChatUsed: false,
        effectiveChatModel: String(chatModelPlan?.model || "short_film_beta"),
        effectiveChatApiMode: "short_film_beta",
        effectiveChatReasoningEffort: "low",
        chatModelFallbackUsed: false,
        effectiveChatUsage: { inputTokens: 0, outputTokens: usage.outputTokens, reasoningTokens: 0, totalTokens: usage.outputTokens },
        chatMs: Date.now() - chatStart,
        screenplayProjectId: req.clementine?.screenplayProjectId || req.clementine?._shortFilmProjectId || "",
      };
    }
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
      logger?.log?.(
        `[${rid}] CHAT stream fallback ${streamDiagnostic.supportMessage} ` +
        `stream_error=${JSON.stringify(String(err?.message || err).slice(0, 200))}`
      );
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
    logger?.log?.(
      `[${rid}] chat_nonstream_reply chars=${rawReply.length} finish=${chatJson.choices?.[0]?.finish_reason || ""} tail=${JSON.stringify(rawReply.slice(-24))}`
    );
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

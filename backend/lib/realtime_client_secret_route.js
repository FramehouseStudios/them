// T-decompose-phase5b1-realtime-client-secret — extract
// `POST /realtime/client_secret` from backend/index.js.
//
// Phase 5b.1 of the decomposition (spec:
// docs/specs/T-decompose-backend-index.md). Phase 5a (#215)
// extracted the read-only realtime routes; this PR extracts the
// supplier mint + failover state machine. Per spec, max 1 decomp
// PR in flight.
//
// V1 pillar: realtime
// V1 effect: closes prerequisite for "Realtime route decomposition
// lands before talk-pipeline Phase 7" (docs/v1-definition.md line 68)
// by extracting the heaviest realtime route into its own lib.
//
// Behavior is byte-identical with the previous inline handler.
// Same 201 response envelope (per
// docs/schemas/realtime-client-secret.md), same error codes,
// same fallback semantics, **same supplier-rotation scope**: the
// supplier is read from the module-level accessor at request
// start, and any per-request supplier creation OR failover
// rotation stays local to the request — it is NOT written back
// to the module-level supplier. This mirrors the original inline
// handler exactly.
//
// Per Codex review (#238 review_blocker): an earlier version of
// this lib persisted the failover rotation via
// `setRealtimeSupplier(supplier)` at the end of the handler. The
// original inline handler did not do that — its `supplier`
// variable was a request-local `let`. The write-back changed
// behavior in a way that was not byte-identical, so it has been
// removed. Supplier rotation across requests still happens
// through `/realtime/health` or future explicit rotation paths,
// not through this route's silent side-effect.
//
// Access-control posture: TIER-3 SENSITIVE. The client secret value
// MUST NOT leak to logs. Diagnostics log only supplier kind + model
// + voice, never the client secret value.

import express from "express";
import { resolveClementineVoiceDirection } from "./clementine_voice_director.js";
import {
  selectPendingScreenplayLearningQuestion,
  selectProvisionalScreenplayMoveFamilies,
} from "./screenplay_question_planner.js";
import { storyMoveFamilyDirective } from "./story_rescue_move_library.js";

const CLIENT_SECRET_BODY_LIMIT = "512kb";
const PROJECT_GROUNDING_BODY_LIMIT = "512kb";
const REALTIME_PROJECT_GROUNDING_MAX_CHARS = 8_000;

function boundedMultilinePreservingEnds(value, maxChars) {
  const clean = String(value || "").trim();
  if (!clean || maxChars <= 0) return "";
  if (clean.length <= maxChars) return clean;
  const marker = "\n…\n";
  const available = Math.max(2, maxChars - marker.length);
  const headLength = Math.ceil(available * 0.72);
  const tailLength = available - headLength;
  return [
    clean.slice(0, headLength).trimEnd(),
    clean.slice(-tailLength).trimStart(),
  ].join(marker);
}

function buildPendingScreenplayQuestionBlock(pending, projectMemory = null) {
  if (!pending) return "";
  const provisionalOptions = Array.isArray(pending.provisionalOptions)
    ? pending.provisionalOptions
    : [];
  const storedMoveFamilies = provisionalOptions
    .map((option) => option.moveFamily)
    .filter(Boolean);
  const provisionalMoveFamilies = storedMoveFamilies.length === 3
    ? storedMoveFamilies
    : selectProvisionalScreenplayMoveFamilies({
      pending,
      projectMemory,
      transcript: pending.question,
    });
  const lines = [
    "<realtime_screenplay_question>",
    "authority: this is the single project-scoped screenplay question already planned for the writer.",
    `question_id: ${pending.id}`,
    `target_field: ${pending.targetField}`,
  ];
  if (pending.targetLabel) lines.push(`target_label: ${pending.targetLabel}`);
  if (pending.anchor) lines.push(`anchor: ${pending.anchor}`);
  lines.push(`question: ${pending.question}`);
  if (pending.actKey) lines.push(`act: ${pending.actKey}`);
  if (pending.sequenceKey) lines.push(`sequence: ${pending.sequenceKey}`);
  if (provisionalOptions.length === 3) {
    for (const option of provisionalOptions) {
      lines.push(`provisional_option_${option.rank}: ${option.value}`);
      const moveFamily = option.moveFamily || provisionalMoveFamilies[option.rank - 1];
      if (moveFamily) {
        lines.push(`provisional_option_${option.rank}_engine: ${moveFamily}`);
      }
    }
    lines.push(
      "directive: These three choices are proposals, not canon. If the writer explicitly selects one, acknowledge that exact choice and use it as project truth. If they modify a choice, use their wording. Never merge options or imply an unselected option was decided."
    );
  } else {
    for (const [index, family] of provisionalMoveFamilies.entries()) {
      const directive = storyMoveFamilyDirective(family);
      if (directive) {
        lines.push(
          `option_${index + 1}_private_engine: ${family}; ${directive}; never speak the engine label.`
        );
      }
    }
    lines.push(
      "directive: Treat the writer's next relevant statement as a possible answer to this exact question. If they are unsure or ask for ideas, give exactly three mutually exclusive, canon-compatible choices ranked for the current act and sequence using three separate lines: Option 1 (recommended): <complete story fact>; Option 2: <complete story fact>; Option 3: <complete story fact>. Keep all three provisional and end by asking which option should become true. Do not re-ask any resolved or corrected fact. If a substantive answer arrives, acknowledge it briefly, use it as project truth, and continue without another intake question."
    );
  }
  lines.push("</realtime_screenplay_question>");
  return lines.join("\n");
}

function buildRealtimeProjectGroundedInstructions({
  baseInstructions = "",
  creativeMemoryBlock = "",
  pendingQuestion = null,
  projectId = "",
  projectTitle = "",
  projectMemory = null,
} = {}) {
  const headParts = [
    "<realtime_project_grounding>",
    "authority: server-retrieved account memory for the active screenplay. This block overrides older or conflicting project details elsewhere in the prompt. Never invent a remembered fact.",
    projectId ? `project_id: ${projectId}` : "",
    projectTitle ? `project_title: ${projectTitle}` : "",
    buildPendingScreenplayQuestionBlock(
      pendingQuestion
        ? {
          ...pendingQuestion,
          projectId: pendingQuestion.projectId || projectId,
          projectTitle: pendingQuestion.projectTitle || projectTitle,
        }
        : null,
      projectMemory
    ),
  ].filter(Boolean);
  const head = headParts.join("\n");
  const tail = "</realtime_project_grounding>";
  const memoryBudget = Math.max(
    0,
    REALTIME_PROJECT_GROUNDING_MAX_CHARS - head.length - tail.length - 2
  );
  const memory = boundedMultilinePreservingEnds(creativeMemoryBlock, memoryBudget);
  const grounding = [head, memory, tail].filter(Boolean).join("\n");
  return [String(baseInstructions || "").trim(), grounding]
    .filter(Boolean)
    .join("\n\n");
}

function parseProjectGroundingRequest(req, normalizeSnippet) {
  return {
    requestedPrompt: normalizeSnippet(
      req.body?.system_prompt ?? req.body?.instructions ?? "",
      16_000,
    ),
    isScreenplayMode:
      req.body?.is_screenplay_mode === true ||
      req.body?.isScreenplayMode === true,
    screenplayProjectId: normalizeSnippet(
      req.body?.screenplay_project_id ??
        req.body?.screenplayProjectId ??
        req.body?.project_id ??
        req.body?.projectId,
      96,
    ),
    screenplayProjectTitle: normalizeSnippet(
      req.body?.screenplay_project_title ??
        req.body?.screenplayProjectTitle ??
        req.body?.project_title ??
        req.body?.projectTitle,
      160,
    ),
  };
}

function mountRealtimeClientSecretRoute(app, deps = {}) {
  if (!app || typeof app.post !== "function") {
    throw new Error("mountRealtimeClientSecretRoute requires an Express app");
  }
  const {
    // Live state — supplier is read per request via this accessor.
    // No setter: the original inline handler did not write rotation
    // back to module-level state, and neither does this lib.
    getRealtimeSupplier,
    // Factories
    createRealtimeSupplier,
    mintWithFailover,
    loadStubSupplier,
    // Helpers
    incrementErrorCounter,
    createRequestId,
    clientIp,
    getAssistantSelfNameForIp,
    normalizeSnippet,
    resolveUserId = () => "",
    getPersistedUserMemoryForUserId = () => null,
    getCreativeMemoryForPrompt = null,
    buildCreativeMemoryBlock = null,
    logger = console,
    isProduction = () => false,
    // Constants
    OPENAI_API_KEY,
    OPENAI_REALTIME_MODEL,
    OPENAI_REALTIME_VOICE,
    OPENAI_REALTIME_INPUT_TRANSCRIPTION_MODEL,
    OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS,
    // Env reader (provider override). Accessor so tests can inject.
    // Required (no default) — the mount caller must pass it
    // explicitly so a wiring mistake fails loud at startup.
    getRealtimeProviderEnv,
  } = deps;

  const required = {
    getRealtimeSupplier,
    createRealtimeSupplier,
    mintWithFailover,
    loadStubSupplier,
    incrementErrorCounter,
    createRequestId,
    clientIp,
    getAssistantSelfNameForIp,
    normalizeSnippet,
    getRealtimeProviderEnv,
  };
  for (const [key, fn] of Object.entries(required)) {
    if (typeof fn !== "function") {
      throw new Error(`mountRealtimeClientSecretRoute: ${key} is required`);
    }
  }
  if (typeof OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS !== "number") {
    throw new Error("mountRealtimeClientSecretRoute: OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS must be a number");
  }
  if (typeof isProduction !== "function") {
    throw new Error("mountRealtimeClientSecretRoute: isProduction must be a function");
  }

  function realtimeProductionMode() {
    try {
      return Boolean(isProduction());
    } catch (_err) {
      return false;
    }
  }

  function supplierKind(value) {
    return String(value?.kind || value || "unknown").trim().toLowerCase();
  }

  async function resolveProjectGrounding({
    req,
    rid,
    requestedPrompt,
    isScreenplayMode,
    screenplayProjectId,
    screenplayProjectTitle,
    failOnReadError = false,
  }) {
    const emptyResult = {
      instructions: requestedPrompt,
      memoryGrounding: null,
    };
    if (!isScreenplayMode || (!screenplayProjectId && !screenplayProjectTitle)) {
      return emptyResult;
    }

    const userId = String(resolveUserId(req) || "").trim();
    if (!userId) {
      if (failOnReadError) {
        throw new Error("Authenticated user identity was unavailable.");
      }
      return emptyResult;
    }

    try {
      const sessionMemory = getPersistedUserMemoryForUserId(userId) || {};
      const pendingQuestion = selectPendingScreenplayLearningQuestion(
        sessionMemory.pendingScreenplayLearningQuestions,
        {
          projectId: screenplayProjectId,
          projectTitle: screenplayProjectTitle,
        },
      );
      const recallQuery = [
        screenplayProjectTitle,
        pendingQuestion?.question,
        "active screenplay story spine character bible corrected canon unresolved setups",
      ].filter(Boolean).join(" ");
      const creativeMemory = typeof getCreativeMemoryForPrompt === "function"
        ? await getCreativeMemoryForPrompt({
          userId,
          projectId: screenplayProjectId,
          projectTitle: screenplayProjectTitle,
          query: recallQuery,
          maxEpisodicMemories: 2,
          recordEpisodicRecall: false,
        })
        : null;
      const creativeMemoryBlock =
        creativeMemory && typeof buildCreativeMemoryBlock === "function"
          ? buildCreativeMemoryBlock(creativeMemory)
          : "";
      const memoryGrounding = {
        project_id: screenplayProjectId || null,
        project_title: screenplayProjectTitle || null,
        memory_applied: Boolean(creativeMemoryBlock),
        pending_question_id: pendingQuestion?.id || null,
      };
      return {
        instructions:
          pendingQuestion || creativeMemoryBlock
            ? buildRealtimeProjectGroundedInstructions({
              baseInstructions: requestedPrompt,
              creativeMemoryBlock,
              pendingQuestion,
              projectId: screenplayProjectId,
              projectTitle: screenplayProjectTitle,
              projectMemory: creativeMemory?.projectContinuity,
            })
            : requestedPrompt,
        memoryGrounding,
      };
    } catch (error) {
      logger.warn?.(
        `[${rid}] realtime_project_grounding_failed error=${String(error?.message || error)}`,
      );
      if (failOnReadError) throw error;
      return emptyResult;
    }
  }

  app.post(
    "/realtime/project_grounding",
    express.json({ limit: PROJECT_GROUNDING_BODY_LIMIT }),
    async (req, res) => {
      const rid = req.requestId || createRequestId();
      const parsed = parseProjectGroundingRequest(req, normalizeSnippet);
      if (
        !parsed.isScreenplayMode ||
        (!parsed.screenplayProjectId && !parsed.screenplayProjectTitle)
      ) {
        return res.status(400).json({
          stage: "realtime_project_grounding",
          error: "A screenplay project is required.",
        });
      }

      try {
        const grounded = await resolveProjectGrounding({
          req,
          rid,
          ...parsed,
          failOnReadError: true,
        });
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).json({
          ok: true,
          action: "realtime_project_grounding",
          instructions: grounded.instructions,
          memory_grounding: grounded.memoryGrounding,
        });
      } catch (_error) {
        incrementErrorCounter("realtime_project_grounding_failed");
        return res.status(503).json({
          stage: "realtime_project_grounding",
          code: "realtime_project_grounding_failed",
          error: "Realtime project memory could not be refreshed.",
        });
      }
    },
  );

  app.post("/realtime/client_secret", express.json({ limit: CLIENT_SECRET_BODY_LIMIT }), async (req, res) => {
    const rid = req.requestId || createRequestId();
    const requesterIp = clientIp(req);
    const assistantSelfName = getAssistantSelfNameForIp(requesterIp);
    const {
      requestedPrompt,
      isScreenplayMode,
      screenplayProjectId,
      screenplayProjectTitle,
    } = parseProjectGroundingRequest(req, normalizeSnippet);
    const requestedVoice = String(req.body?.voice || "").trim().toLowerCase();
    const requestedEmotionLane = String(
      req.body?.emotion_lane ?? req.body?.emotionLane ?? "",
    ).trim();
    const voiceDirection = resolveClementineVoiceDirection(requestedEmotionLane);
    const resolvedVoice = requestedVoice || (
      requestedEmotionLane ? voiceDirection.voice : OPENAI_REALTIME_VOICE
    );
    const requestedModel = String(req.body?.model || "").trim();
    const rawProvider = String(req.body?.realtime_provider ?? req.body?.provider ?? "").trim().toLowerCase();
    const requestedProvider = ["", "default", "server_default"].includes(rawProvider) ? "" : rawProvider;
    const configuredProvider = String(getRealtimeProviderEnv() || "openai").trim().toLowerCase() || "openai";
    const effectiveProvider = requestedProvider || configuredProvider;
    if (effectiveProvider === "openai" && !String(OPENAI_API_KEY || "").trim()) {
      incrementErrorCounter("realtime_supplier_unauthorized");
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({
        stage: "realtime_auth",
        code: "realtime_supplier_unauthorized",
        realtime_provider: "openai",
        fallback: false,
        degraded: true,
        error: "Realtime provider is not configured.",
      });
    }
    const grounded = await resolveProjectGrounding({
      req,
      rid,
      requestedPrompt,
      isScreenplayMode,
      screenplayProjectId,
      screenplayProjectTitle,
    });
    const sessionPrompt = grounded.instructions;
    const projectGrounding = grounded.memoryGrounding;

    let supplier = getRealtimeSupplier();
    if (!supplier || (requestedProvider && requestedProvider !== String(supplier.kind || "").toLowerCase())) {
      try {
        supplier = await createRealtimeSupplier({
          provider: effectiveProvider,
          apiKey: OPENAI_API_KEY,
          defaultModel: OPENAI_REALTIME_MODEL,
          defaultVoice: OPENAI_REALTIME_VOICE,
          defaultInputTranscriptionModel: OPENAI_REALTIME_INPUT_TRANSCRIPTION_MODEL,
          defaultTtlSeconds: OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS,
        });
      } catch (err) {
        const status = err?.code === "realtime_supplier_unknown_provider"
          ? 400
          : Number(err?.status || 503);
        incrementErrorCounter(err?.code || "realtime_supplier_unavailable");
        return res.status(status).json({
          stage: "realtime_auth",
          code: err?.code || "realtime_supplier_unavailable",
          realtime_provider: requestedProvider || String(supplier?.kind || "unknown"),
          error: String(err?.message || err || "Realtime supplier unavailable."),
        });
      }
    }

    const productionMode = realtimeProductionMode();
    const currentSupplierKind = supplierKind(supplier);
    if (productionMode && currentSupplierKind === "stub") {
      incrementErrorCounter("realtime_stub_disabled_in_production");
      return res.status(503).json({
        stage: "realtime_auth",
        code: "realtime_stub_disabled_in_production",
        realtime_provider: "stub",
        fallback: false,
        degraded: true,
        error: "Stub realtime provider is disabled in production.",
      });
    }

    const allowFallback = !productionMode
      && !requestedProvider
      && currentSupplierKind !== "stub";
    const mintParams = {
      instructions: sessionPrompt,
      voice: resolvedVoice,
      model: requestedModel || OPENAI_REALTIME_MODEL,
      ttlSeconds: OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS,
    };
    let minted;
    let fallbackReason = null;
    const primarySupplierKind = String(supplier?.kind || "unknown");
    try {
      const result = await mintWithFailover({
        primarySupplier: supplier,
        mintParams,
        allowFallback,
        loadStubSupplier,
      });
      minted = result.minted;
      supplier = result.supplierUsed;
      fallbackReason = result.fallbackReason;
      if (fallbackReason) {
        console.warn(`[${rid}] realtime_supplier_fallback from=${primarySupplierKind} reason=${fallbackReason}`);
      }
    } catch (err) {
      incrementErrorCounter(err?.code || "realtime_supplier_request_failed");
      if (err?.code === "supplier_fallback_failed") {
        const cause = err.cause || err;
        return res.status(Number(cause?.status || 502)).json({
          stage: "realtime_auth",
          code: cause?.code || "realtime_supplier_request_failed",
          realtime_provider: primarySupplierKind,
          fallback: false,
          fallback_attempted: true,
          fallback_error: err.message,
          error: String(cause?.message || cause || "Realtime supplier request failed."),
        });
      }
      const status = productionMode ? 503 : Number(err?.status || 502);
      return res.status(status).json({
        stage: "realtime_auth",
        code: err?.code || "realtime_supplier_request_failed",
        realtime_provider: primarySupplierKind,
        ...(productionMode ? { fallback: false, degraded: true } : {}),
        error: String(err?.message || err || "Realtime supplier request failed."),
      });
    }

    // NOTE: do NOT write back to module-level state here. The
    // original inline handler used a request-local `supplier`
    // variable; rotation stays scoped to this request. See the
    // module header for the #238 review-blocker history.

    const sessionConfig = minted?.sessionConfig || supplier.buildSessionConfig({
      instructions: sessionPrompt,
      model: requestedModel || OPENAI_REALTIME_MODEL,
      voice: resolvedVoice,
    });
    const clientSecretValue = String(minted?.value || "").trim();
    const expiresAt = Math.max(0, Number(minted?.expiresAt || 0));
    if (!clientSecretValue || !expiresAt) {
      incrementErrorCounter("realtime_supplier_response_invalid");
      return res.status(502).json({
        stage: "realtime_auth",
        code: "realtime_supplier_response_invalid",
        realtime_provider: String(supplier?.kind || requestedProvider || "unknown"),
        error: "Realtime supplier returned an incomplete client secret payload.",
      });
    }

    const sessionVoice = sessionConfig.audio?.output?.voice || resolvedVoice;
    const sessionModel = sessionConfig.model || requestedModel || OPENAI_REALTIME_MODEL;
    console.warn(`[${rid}] realtime_client_secret supplier=${supplier.kind} model=${sessionModel} voice=${sessionVoice}`);

    res.setHeader("Cache-Control", "no-store");
    return res.status(201).json({
      transport: "webrtc_ephemeral",
      assistant_name: assistantSelfName,
      realtime_provider: String(supplier.kind || "unknown"),
      ...(fallbackReason ? { fallback: true, fallback_reason: fallbackReason, primary_supplier: primarySupplierKind } : {}),
      model: sessionModel,
      voice: sessionVoice,
      emotion_lane: voiceDirection.emotionLane,
      ...(projectGrounding ? { memory_grounding: projectGrounding } : {}),
      session: {
        type: sessionConfig.type || "realtime",
        model: sessionModel,
        voice: sessionVoice,
        instructions: sessionConfig.instructions || sessionPrompt,
        output_modalities: Array.isArray(sessionConfig.output_modalities) ? sessionConfig.output_modalities : ["audio"],
        input_transcription_model: String(
          sessionConfig.audio?.input?.transcription?.model || ""
        ),
      },
      client_secret: {
        value: clientSecretValue,
        expires_at: expiresAt,
        session_expires_at: expiresAt,
      },
      issued_at: Math.floor(Date.now() / 1000),
    });
  });
}

export {
  mountRealtimeClientSecretRoute,
  CLIENT_SECRET_BODY_LIMIT,
  PROJECT_GROUNDING_BODY_LIMIT,
  buildRealtimeProjectGroundedInstructions,
};

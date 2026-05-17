// T-decompose-phase7c-talk-supplier-glue — extract STT/chat/TTS
// supplier glue out of the talk pipeline into 3 factories.
//
// Phase 7c of docs/specs/T-decompose-backend-index.md; design note
// PR #349 (3-factory shape approved by Codex supervisor).
// Phase 7a (talk_state.js #306) + 7b (talk_handler.js #335) merged.
//
// V1 pillar: talk
// V1 effect: infrastructure for the voice/talk pipeline; byte-identical
// supplier glue extraction that makes the V1 talk path easier to test
// and maintain.
//
// BYTE-IDENTICAL. Each supplier method body is the verbatim text moved
// out of its origin (STT: the transcribeWithModel closure in
// backend/lib/talk_handler.js). Stage names, retry, timeouts, error
// codes and audio metadata are unchanged because the bodies are
// unchanged.
//
// No module-level mutable state (#238 inheritance): suppliers close
// over injected config/deps only. No setter-style exports. Dependency
// boundary is proven by backend/tools/freevars.mjs (acorn) in
// backend/tests/talk_supplier_glue.test.mjs.

import { File } from "node:buffer";

function createSttSupplier(deps = {}) {
  const {
    OPENAI_API_KEY,
    STT_MODEL_PRIMARY,
    STT_LANGUAGE,
    STT_TIMEOUT_MS,
    fetchWithTimeout,
    isAbortError,
  } = deps;
  for (const k of ["OPENAI_API_KEY", "STT_TIMEOUT_MS", "fetchWithTimeout", "isAbortError"]) {
    if (deps[k] === undefined) throw new Error("createSttSupplier missing required dep: " + k);
  }
  return {
    kind: "openai-whisper",
    // Byte-identical to the former handleTalkRequest-local
    // transcribeWithModel closure. uploadedFile is the per-request
    // input (was a closed-over handler var); modelName/includeLanguage
    // keep their original semantics.
    async transcribe({ uploadedFile, modelName, includeLanguage = true } = {}) {
        const startedAt = Date.now();
        const sttForm = new FormData();
        sttForm.append("model", String(modelName || STT_MODEL_PRIMARY));
        if (includeLanguage && STT_LANGUAGE) {
          sttForm.append("language", STT_LANGUAGE);
        }

        const file = new File([uploadedFile.buffer], uploadedFile.originalname || "recording.m4a", {
          type: uploadedFile.mimetype || "audio/m4a",
        });
        sttForm.append("file", file);

        let sttResp;
        try {
          sttResp = await fetchWithTimeout(
            "https://api.openai.com/v1/audio/transcriptions",
            {
              method: "POST",
              headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
              body: sttForm,
            },
            STT_TIMEOUT_MS
          );
        } catch (err) {
          if (isAbortError(err)) {
            const timeoutErr = new Error("Transcription timed out.");
            timeoutErr.stage = "stt";
            timeoutErr.status = 504;
            throw timeoutErr;
          }
          throw err;
        }

        const rawText = await sttResp.text();
        return {
          model: String(modelName || STT_MODEL_PRIMARY),
          response: sttResp,
          rawText,
          elapsedMs: Date.now() - startedAt,
        };
    },
  };
}


function createChatSupplier(deps = {}) {
  const {
    CHAT_LOAD_SHED_IN_FLIGHT,
    CHAT_LOAD_SHED_MIN_SAMPLES,
    CHAT_LOAD_SHED_NONCRITICAL_ONLY,
    CHAT_LOAD_SHED_P95_MS,
    CHAT_MAX_TOKENS,
    CHAT_MODEL_FAST,
    CHAT_MODEL_KNOWLEDGE,
    CHAT_MODEL_RICH,
    CHAT_TEMPERATURE,
    CHAT_TIMEOUT_MS,
    OPENAI_API_KEY,
    countWords,
    deriveBackendRuntimeStatus,
    extractFirstSentenceCandidate,
    fetchWithTimeout,
    isLikelyCompleteReply,
    readTalkInFlight,
    summarizeTalkMetrics,
    textContainsAny,
  } = deps;
  for (const k of ["OPENAI_API_KEY","fetchWithTimeout","CHAT_TIMEOUT_MS","CHAT_MODEL_FAST"]) {
    if (deps[k] === undefined) throw new Error("createChatSupplier missing required dep: " + k);
  }

  // Byte-identical: selectChatModelForTurn + streamChatReplyWithFirstSentence
  // are the verbatim functions from backend/index.js. Stateless — no
  // shared/module-level mutable state; they close over injected config +
  // pure helper deps only. They do not reference each other.
  function selectChatModelForTurn({
    transcript,
    turnPlanner,
    flags,
    routingLane,
    runtimeStatus = null,
  }) {
    const t = String(transcript || "").toLowerCase();
    const words = countWords(t);
    const intent = String(turnPlanner?.intent || "reflective_checkin");
    const lane = String(routingLane || "normal_rotation");
    const explicitKnowledgeAsk = textContainsAny(t, [
      "define",
      "what is",
      "what's",
      "what changed between",
      "what changed from",
      "explain",
      "compare",
      "difference between",
      "in plain english",
      "plain english",
      "teach me",
      "why does it matter",
      "why it matters",
      "deeper criticism",
      "evidence-based",
      "fastest way",
      "learn a hard skill",
    ]);
    const therapeuticBlockedByDefinition =
      explicitKnowledgeAsk &&
      !Boolean(flags?.isVenting) &&
      !Boolean(flags?.therapeuticPain) &&
      !Boolean(flags?.therapeuticHeartbreak) &&
      !Boolean(flags?.therapeuticBetrayal) &&
      !Boolean(flags?.therapeuticFamilyTrauma);
    const substantial = Boolean(turnPlanner?.requiresSubstantiveAnswer);
    const therapeutic =
      (Boolean(flags?.therapeuticDepth) || lane === "therapeutic_depth") &&
      !therapeuticBlockedByDefinition;
    const vulnerable = Boolean(flags?.isVulnerable);
    const venting = Boolean(flags?.isVenting);
    const philosophical = lane === "philosophical" || intent === "philosophical_reflection";
    const distress = lane === "high_distress_safety";
    const motivationMode = lane === "motivation_mode" || intent === "motivation_coaching";
    const ideaDevelopmentMode = intent === "idea_development";
    const directSimple =
      intent === "practical_action" ||
      intent === "gratitude_acknowledgment" ||
      (Boolean(flags?.isDirect) && !substantial && words <= 18);
    const knowledgeMode = intent === "knowledge_answer";
    const relationalKnowledge = knowledgeMode && textContainsAny(t, [
      "compatibility",
      "friendship",
      "trust repair",
      "betrayal",
      "empathy",
      "human connection",
      "attachment",
    ]);
    const heavyRelationalTopic = textContainsAny(t, [
      "heartbreak",
      "heartbroken",
      "breakup",
      "break up",
      "broke up",
      "my ex",
      "ex partner",
      "ex-partner",
      "ex boyfriend",
      "ex girlfriend",
      "left me",
      "dumped",
      "dumped me",
      "ghosted me",
      "situationship",
      "no contact",
      "can't move on",
      "cant move on",
      "betray",
      "lied",
      "liar",
      "cheat",
      "trust broken",
      "don't trust",
      "dont trust",
      "avoidant",
      "abandon",
      "childhood",
      "family trauma",
      "family",
      "trauma",
    ]);
    const knowledgeComplex = knowledgeMode && (
      words >= 18 ||
      textContainsAny(t, [
        "compare",
        "difference",
        "timeline",
        "movement",
        "influence",
        "context",
        "attachment",
        "compatibility",
        "betrayal",
        "empathy",
        "human connection",
        "framework",
        "model",
      ])
    );
    const deepEmotionalNeed =
      (vulnerable && (words >= 10 || substantial)) ||
      (venting && (words >= 12 || substantial)) ||
      (therapeutic && words >= 8) ||
      (heavyRelationalTopic && words >= 8);
    const motivationalDepthNeed =
      motivationMode &&
      (words >= 8 || vulnerable || venting || substantial);
    const substantiveNeed = substantial && words >= 16 && !directSimple;
    const richRequired =
      distress ||
      therapeutic ||
      motivationalDepthNeed ||
      philosophical ||
      knowledgeComplex ||
      relationalKnowledge ||
      ideaDevelopmentMode ||
      deepEmotionalNeed ||
      substantiveNeed ||
      heavyRelationalTopic;

    let model = CHAT_MODEL_FAST;
    let tier = "fast";
    let reason = "default_fast";

    if (knowledgeMode && !knowledgeComplex) {
      model = CHAT_MODEL_KNOWLEDGE || CHAT_MODEL_RICH || CHAT_MODEL_FAST;
      tier = "knowledge";
      reason = "knowledge_mode";
    }
    if (knowledgeMode && relationalKnowledge) {
      model = CHAT_MODEL_RICH || CHAT_MODEL_KNOWLEDGE || CHAT_MODEL_FAST;
      tier = "rich";
      reason = "knowledge_relational_depth";
    }
    if (richRequired) {
      model = CHAT_MODEL_RICH || CHAT_MODEL_FAST;
      tier = "rich";
      reason = distress
        ? "distress_safety"
        : therapeutic
          ? "therapeutic_depth"
          : philosophical
            ? "philosophical_depth"
          : knowledgeComplex
              ? "knowledge_complexity"
              : ideaDevelopmentMode
                ? "idea_development_depth"
              : motivationalDepthNeed
                ? "motivation_depth"
              : deepEmotionalNeed
                ? "emotional_depth"
                : heavyRelationalTopic
                  ? "relational_depth"
                  : "substantive_question";
    } else if (directSimple) {
      model = CHAT_MODEL_FAST;
      tier = "fast";
      reason = "direct_or_simple";
    } else if (vulnerable || venting) {
      if (words >= 8) {
        model = CHAT_MODEL_RICH || CHAT_MODEL_FAST;
        tier = "rich";
        reason = "empathetic_precision";
      } else {
        model = CHAT_MODEL_FAST;
        tier = "fast";
        reason = "empathetic_fast_short";
      }
    }

    const runtime = runtimeStatus && typeof runtimeStatus === "object"
      ? runtimeStatus
      : deriveBackendRuntimeStatus();
    const metrics = runtime?.metrics && typeof runtime.metrics === "object"
      ? runtime.metrics
      : summarizeTalkMetrics();
    const loadPressure =
      readTalkInFlight() >= CHAT_LOAD_SHED_IN_FLIGHT ||
      (
        Number(metrics.sampleCount || 0) >= CHAT_LOAD_SHED_MIN_SAMPLES &&
        Number(metrics.p95TotalMs || 0) >= CHAT_LOAD_SHED_P95_MS
      ) ||
      String(runtime?.status || "up") === "degraded";
    const criticalTurn =
      distress ||
      therapeutic ||
      motivationMode ||
      ideaDevelopmentMode ||
      Boolean(flags?.therapeuticDepth) ||
      lane === "high_distress_safety";
    const shouldShed = loadPressure && (!CHAT_LOAD_SHED_NONCRITICAL_ONLY || !criticalTurn);

    if (shouldShed) {
      const shedCause = readTalkInFlight() >= CHAT_LOAD_SHED_IN_FLIGHT
        ? "inflight"
        : (Number(metrics.p95TotalMs || 0) >= CHAT_LOAD_SHED_P95_MS ? "latency" : "runtime");
      model = CHAT_MODEL_FAST;
      tier = "fast";
      reason = `load_shed_${shedCause}`;
      return {
        model: String(model || CHAT_MODEL_FAST),
        tier,
        reason,
        loadShed: true,
        loadShedCause: shedCause,
      };
    }

    return {
      model: String(model || CHAT_MODEL_FAST),
      tier,
      reason,
      loadShed: false,
      loadShedCause: "",
    };
  }

  async function streamChatReplyWithFirstSentence({
    rid,
    system,
    shortTermContextMessages,
    transcript,
    onFirstSentence,
    model = CHAT_MODEL_FAST,
    temperature = CHAT_TEMPERATURE,
    maxTokens = CHAT_MAX_TOKENS,
  }) {
    const resp = await fetchWithTimeout(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: String(model || CHAT_MODEL_FAST),
          temperature,
          max_tokens: Math.max(64, Number(maxTokens || CHAT_MAX_TOKENS)),
          stream: true,
          messages: [
            { role: "system", content: system },
            ...shortTermContextMessages,
            { role: "user", content: transcript },
          ],
        }),
      },
      CHAT_TIMEOUT_MS
    );

    if (!resp.ok) {
      const text = await resp.text();
      const err = new Error(text || "Chat stream failed.");
      err.stage = "chat";
      err.status = resp.status;
      throw err;
    }

    if (!resp.body || typeof resp.body.getReader !== "function") {
      const err = new Error("Chat stream body unavailable.");
      err.stage = "chat";
      err.status = 502;
      throw err;
    }

    const decoder = new TextDecoder();
    const reader = resp.body.getReader();
    let pending = "";
    let fullReply = "";
    let firstSentence = "";
    let sawDoneToken = false;

    const processDataLine = (line) => {
      const trimmed = String(line || "").trim();
      if (!trimmed || trimmed.startsWith(":")) return false;
      if (!trimmed.startsWith("data:")) return false;
      const payload = trimmed.slice(5).trim();
      if (!payload) return false;
      if (payload === "[DONE]") {
        sawDoneToken = true;
        return true;
      }
      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch (_) {
        return false;
      }
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) {
        fullReply += delta;
        if (!firstSentence) {
          const candidate = extractFirstSentenceCandidate(fullReply);
          if (candidate && countWords(candidate) >= 3) {
            firstSentence = candidate;
            if (typeof onFirstSentence === "function") {
              Promise.resolve()
                .then(() => onFirstSentence(candidate))
                .catch(() => {});
            }
          }
        }
      }
      return false;
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let newlineIdx = pending.indexOf("\n");
        while (newlineIdx >= 0) {
          const line = pending.slice(0, newlineIdx);
          pending = pending.slice(newlineIdx + 1);
          const reachedDone = processDataLine(line);
          if (reachedDone) {
            pending = "";
            break;
          }
          newlineIdx = pending.indexOf("\n");
        }
      }
      if (pending.trim()) {
        processDataLine(pending);
      }
    } finally {
      reader.releaseLock();
    }

    const finalReply = String(fullReply || "").trim();
    if (!sawDoneToken || !isLikelyCompleteReply(finalReply)) {
      const err = new Error("Chat stream incomplete reply.");
      err.stage = "chat";
      err.status = 502;
      throw err;
    }

    return {
      reply: finalReply,
      firstSentence: String(firstSentence || "").trim(),
    };
  }

  return { selectChatModelForTurn, streamChatReplyWithFirstSentence };
}

export { createSttSupplier, createChatSupplier };

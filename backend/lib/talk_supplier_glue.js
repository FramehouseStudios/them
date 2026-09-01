// Phase 7c talk supplier glue.
//
// Keeps the /talk handler focused on orchestration while supplier objects own
// the STT/chat/TTS call seams. The factories close over injected deps only:
// no module-level mutable state and no setter-shaped exports.

import { File } from "node:buffer";
import {
  normalizeOpenAIUsage,
  normalizeOpenAITextResponseRaw,
  requestOpenAIText,
} from "./openai_text_generation.js";

function requireFunction(name, fn) {
  if (typeof fn !== "function") {
    throw new Error(`talk_supplier_glue missing required function: ${name}`);
  }
  return fn;
}

function timeoutError(stage, message) {
  const err = new Error(message);
  err.stage = stage;
  err.status = 504;
  return err;
}

function createSttSupplier({
  OPENAI_API_KEY,
  STT_LANGUAGE = "en",
  STT_MODEL_PRIMARY = "stt",
  STT_TIMEOUT_MS = 30_000,
  fetchWithTimeout,
  isAbortError,
} = {}) {
  const fetcher = requireFunction("fetchWithTimeout", fetchWithTimeout);
  const isAbort = requireFunction("isAbortError", isAbortError);

  return Object.freeze({
    kind: "openai-transcription",
    async transcribe({ uploadedFile, modelName, includeLanguage = true } = {}) {
      const startedAt = Date.now();
      const model = String(modelName || STT_MODEL_PRIMARY);
      const sttForm = new FormData();
      sttForm.append("model", model);
      if (includeLanguage && STT_LANGUAGE) {
        sttForm.append("language", STT_LANGUAGE);
      }

      const file = new File([uploadedFile.buffer], uploadedFile.originalname || "recording.m4a", {
        type: uploadedFile.mimetype || "audio/m4a",
      });
      sttForm.append("file", file);

      let sttResp;
      try {
        sttResp = await fetcher(
          "https://api.openai.com/v1/audio/transcriptions",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
            body: sttForm,
          },
          STT_TIMEOUT_MS
        );
      } catch (err) {
        if (isAbort(err)) {
          throw timeoutError("stt", "Transcription timed out.");
        }
        throw err;
      }

      const rawText = await sttResp.text();
      return {
        model,
        response: sttResp,
        rawText,
        elapsedMs: Date.now() - startedAt,
      };
    },
  });
}

function createChatSupplier({
  OPENAI_API_KEY,
  CHAT_TIMEOUT_MS = 30_000,
  fetchWithTimeout,
  isAbortError,
  streamChatReplyWithFirstSentence,
} = {}) {
  const fetcher = requireFunction("fetchWithTimeout", fetchWithTimeout);
  const isAbort = requireFunction("isAbortError", isAbortError);
  const streamFirstSentence = requireFunction(
    "streamChatReplyWithFirstSentence",
    streamChatReplyWithFirstSentence
  );

  return Object.freeze({
    kind: "openai-chat",
    async stream(args = {}) {
      return streamFirstSentence(args);
    },
    async chat({
      model,
      temperature,
      maxTokens,
      messages,
      apiMode = "chat_completions",
      reasoningEffort = "",
      fallbackModel = "",
      signal = null,
    } = {}) {
      let requestResult;
      try {
        requestResult = await requestOpenAIText({
          apiKey: OPENAI_API_KEY,
          apiMode,
          model,
          messages,
          temperature,
          maxTokens,
          reasoningEffort,
          fallbackModel,
          fetchWithTimeout: fetcher,
          timeoutMs: CHAT_TIMEOUT_MS,
          signal,
        });
      } catch (err) {
        if (isAbort(err)) {
          if (signal?.aborted || err?.cancelled || err?.code === "page_generation_cancelled") {
            const cancelErr = new Error("Page generation cancelled");
            cancelErr.name = "AbortError";
            cancelErr.code = "page_generation_cancelled";
            cancelErr.status = 409;
            cancelErr.cancelled = true;
            cancelErr.stage = "chat";
            cancelErr.errorClass = "page_generation_cancelled";
            throw cancelErr;
          }
          throw timeoutError("chat", "Chat completion timed out.");
        }
        throw err;
      }

      const rawText = await requestResult.response.text();
      let usage = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 };
      try {
        usage = normalizeOpenAIUsage(JSON.parse(rawText || "{}"));
      } catch {
        // Malformed provider JSON is handled by the caller's existing response guard.
      }
      return {
        response: requestResult.response,
        rawText: normalizeOpenAITextResponseRaw(rawText, requestResult.apiMode, {
          model: requestResult.model,
        }),
        model: requestResult.model,
        apiMode: requestResult.apiMode,
        reasoningEffort: requestResult.reasoningEffort,
        fallbackUsed: requestResult.fallbackUsed,
        usage,
      };
    },
  });
}

function createTtsSupplier({
  synthesizeSpeechMp3,
  synthesizeSpeechMp3OpenAI,
  synthesizeTalkScreenplayPageAudio,
} = {}) {
  const synthesize = requireFunction("synthesizeSpeechMp3", synthesizeSpeechMp3);
  const synthesizeOpenAI = requireFunction("synthesizeSpeechMp3OpenAI", synthesizeSpeechMp3OpenAI);
  const synthesizeScreenplayPage = requireFunction(
    "synthesizeTalkScreenplayPageAudio",
    synthesizeTalkScreenplayPageAudio
  );

  return Object.freeze({
    kind: "runtime-tts",
    async synthesize(args = {}) {
      return synthesize(args);
    },
    async synthesizeOpenAI(args = {}) {
      return synthesizeOpenAI(args);
    },
    async synthesizeScreenplayPage(args = {}) {
      return synthesizeScreenplayPage(args);
    },
  });
}

export { createSttSupplier, createChatSupplier, createTtsSupplier };

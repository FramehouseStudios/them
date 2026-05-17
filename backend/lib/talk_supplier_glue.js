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

export { createSttSupplier };

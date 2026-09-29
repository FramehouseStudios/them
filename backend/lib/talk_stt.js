// One owner for turning an uploaded utterance into words. POST /talk and
// POST /talk/transcribe both use it, so upload checks, empty-transcript
// retries and failure mapping cannot drift apart.

const TALK_AUDIO_EXTENSIONS = [".m4a", ".mp3", ".wav", ".aac", ".ogg", ".flac", ".webm"];

export function uploadedTalkAudio(req) {
  return req?.file || req?.files?.file?.[0] || req?.files?.audio?.[0] || null;
}

// Returns { status, body } for a request that cannot be transcribed, else null.
export function talkAudioUploadProblem(req, uploadedFile) {
  const contentType = String(req?.headers?.["content-type"] || "").toLowerCase();
  if (!contentType.includes("multipart/form-data")) {
    return { status: 415, body: { stage: "upload", error: "Expected multipart/form-data request." } };
  }
  if (!uploadedFile?.buffer) {
    return { status: 400, body: { stage: "upload", error: "Missing audio file field ('file' or 'audio')." } };
  }
  const mime = String(uploadedFile.mimetype || "").toLowerCase();
  const name = String(uploadedFile.originalname || "").toLowerCase();
  const extOk = TALK_AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext));
  const mimeOk =
    mime.startsWith("audio/") ||
    mime === "application/octet-stream" ||
    mime === "binary/octet-stream" ||
    mime === "";
  if (!mimeOk && !extOk) {
    return { status: 415, body: { stage: "upload", error: `Unsupported file type: ${mime || "unknown"}` } };
  }
  return null;
}

// Transcribes with the primary model; an empty result on a big enough upload
// retries with the fallback model and/or without the language hint.
// Throws a talk failure error (providerStage "stt") when the provider fails.
export async function transcribeTalkAudio({
  sttSupplier,
  uploadedFile,
  rid,
  logger = console,
  config = {},
  buildTalkFailureDiagnostics,
  createTalkFailureError,
}) {
  const {
    STT_MODEL_PRIMARY = "stt",
    STT_MODEL_FALLBACK = "",
    STT_EMPTY_RETRY_ENABLED = false,
    STT_EMPTY_RETRY_MIN_BYTES = 0,
    STT_EMPTY_RETRY_WITHOUT_LANGUAGE = false,
  } = config;
  const startedAt = Date.now();
  let sttResult;
  try {
    sttResult = await sttSupplier.transcribe({ uploadedFile, modelName: STT_MODEL_PRIMARY });
  } catch (err) {
    throw createTalkFailureError({
      requestId: rid,
      providerStage: "stt",
      status: Number(err?.status || 500),
      message: String(err?.message || "Transcription failed."),
    });
  }
  let ms = Date.now() - startedAt;

  if (!sttResult.response.ok) {
    const diagnostic = buildTalkFailureDiagnostics(
      { stage: "stt", status: sttResult.response.status, rawBody: sttResult.rawText },
      { requestId: rid, providerStage: "stt", status: sttResult.response.status, rawBody: sttResult.rawText }
    );
    logger.log(`[${rid}] STT failed model=${sttResult.model} ${diagnostic.supportMessage}`);
    throw createTalkFailureError({
      requestId: rid,
      providerStage: "stt",
      status: sttResult.response.status,
      rawBody: sttResult.rawText,
    });
  }

  let sttJson;
  try {
    sttJson = JSON.parse(sttResult.rawText);
  } catch (_) {
    throw createTalkFailureError({
      requestId: rid,
      providerStage: "stt",
      status: 502,
      message: "Transcription response was invalid JSON.",
      errorClass: "response_invalid",
    });
  }
  let transcript = String(sttJson?.text || "").trim();
  let model = sttResult.model;
  let usedLanguageHint = true;

  const canRetryEmptyTranscript =
    !transcript &&
    STT_EMPTY_RETRY_ENABLED &&
    Number(uploadedFile?.size || 0) >= STT_EMPTY_RETRY_MIN_BYTES;
  if (canRetryEmptyTranscript) {
    const retryAttempts = [];
    if (STT_MODEL_FALLBACK && STT_MODEL_FALLBACK !== STT_MODEL_PRIMARY) {
      retryAttempts.push({ model: STT_MODEL_FALLBACK, includeLanguage: !STT_EMPTY_RETRY_WITHOUT_LANGUAGE });
    }
    if (STT_EMPTY_RETRY_WITHOUT_LANGUAGE) {
      retryAttempts.push({ model: STT_MODEL_PRIMARY, includeLanguage: false });
    }
    for (const attempt of retryAttempts) {
      if (transcript) break;
      logger.log(
        `[${rid}] stt_empty_retry model=${attempt.model} lang=${attempt.includeLanguage ? "on" : "off"} bytes=${Number(uploadedFile?.size || 0)}`
      );
      try {
        const fallbackResult = await sttSupplier.transcribe({
          uploadedFile,
          modelName: attempt.model,
          includeLanguage: attempt.includeLanguage,
        });
        ms += Math.max(0, Number(fallbackResult.elapsedMs || 0));
        if (!fallbackResult.response.ok) {
          const fallbackDiagnostic = buildTalkFailureDiagnostics(
            { stage: "stt", status: fallbackResult.response.status, rawBody: fallbackResult.rawText },
            { requestId: rid, providerStage: "stt", status: fallbackResult.response.status, rawBody: fallbackResult.rawText }
          );
          logger.log(`[${rid}] STT fallback failed model=${fallbackResult.model} ${fallbackDiagnostic.supportMessage}`);
          continue;
        }
        const fallbackJson = JSON.parse(fallbackResult.rawText);
        const fallbackTranscript = String(fallbackJson?.text || "").trim();
        if (fallbackTranscript) {
          transcript = fallbackTranscript;
          sttJson = fallbackJson;
          model = fallbackResult.model;
          usedLanguageHint = attempt.includeLanguage;
        }
      } catch (err) {
        const fallbackDiagnostic = buildTalkFailureDiagnostics(err, {
          requestId: rid,
          providerStage: "stt",
          status: Number(err?.status || 500),
        });
        logger.log(
          `[${rid}] STT fallback error model=${attempt.model} lang=${attempt.includeLanguage ? "on" : "off"} ${fallbackDiagnostic.supportMessage}`
        );
      }
    }
  }

  return { transcript, sttJson, model, usedLanguageHint, ms };
}

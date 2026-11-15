// Support-safe diagnostics for POST /talk provider failures.
//
// The goal is a stable app/support contract without exposing private
// transcript text, generated screenplay, prompt memory, or provider
// credentials. Public surfaces get request_id + provider_stage +
// error_class only; logs get the same plus non-user-derived provider
// type/code/status when available.

const KNOWN_TALK_STAGES = new Set([
  "upload",
  "stt",
  "chat",
  "tts",
  "server",
  "memory",
  "idempotency",
  "rate_limit",
  "session_serial",
  "concurrency",
]);

function trimString(value, max = 180) {
  const clean = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  if (clean.length <= max) return clean;
  return clean.slice(0, Math.max(0, max - 3)).trimEnd() + "...";
}

function normalizeStage(value, fallback = "server") {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^talk_/, "")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!raw) return fallback;
  return KNOWN_TALK_STAGES.has(raw) ? raw : fallback;
}

function normalizeStatus(value, fallback = 500) {
  const status = Number(value);
  if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  return fallback;
}

// Transport-cause additions accept only fixed platform codes. Never retain
// cause messages, stack traces, hostnames or arbitrary custom codes.
const KNOWN_TRANSPORT_CODES = new Set([
  "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT",
  "EHOSTUNREACH", "ENETUNREACH", "EPIPE",
  "ERR_TLS_CERT_ALTNAME_INVALID", "ERR_TLS_HANDSHAKE_TIMEOUT",
  "CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID", "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET", "UND_ERR_ABORTED", "UND_ERR_CLOSED", "UND_ERR_DESTROYED",
]);

function ownDataValue(value, key) {
  try {
    return Object.getOwnPropertyDescriptor(value, key)?.value;
  } catch (_) {
    return undefined;
  }
}

function extractTransportCode(error) {
  try {
    const pending = [{ value: error, depth: 0 }];
    const seen = new Set();
    // Six cause edges, sixteen visited slots, four aggregate children per node.
    // Bounds also apply to cycles and unknown cause entries.
    for (let visited = 0; pending.length && visited < 16; visited += 1) {
      const { value, depth } = pending.shift();
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      const code = ownDataValue(value, "code");
      if (typeof code === "string" && KNOWN_TRANSPORT_CODES.has(code)) return code;
      if (depth >= 6) continue;
      const cause = ownDataValue(value, "cause");
      if (cause && typeof cause === "object") pending.push({ value: cause, depth: depth + 1 });
      if (value instanceof AggregateError) {
        const errors = ownDataValue(value, "errors");
        if (Array.isArray(errors)) {
          const length = ownDataValue(errors, "length");
          if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) continue;
          for (let index = 0; index < Math.min(4, length); index += 1) {
            pending.push({ value: ownDataValue(errors, String(index)), depth: depth + 1 });
          }
        }
      }
    }
    return "";
  } catch (_) {
    // Opaque exceptions must never replace the original failure diagnostic.
    return "";
  }
}

function extractProviderDetails(rawBody) {
  const raw = String(rawBody ?? "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    const providerError = parsed?.error && typeof parsed.error === "object"
      ? parsed.error
      : parsed;
    return {
      providerType: trimString(providerError?.type || providerError?.error?.type || "", 80),
      providerCode: trimString(providerError?.code || providerError?.error?.code || "", 80),
    };
  } catch (_) {
    return {};
  }
}

function classifyTalkFailure({
  status,
  stage,
  message,
  providerType,
  providerCode,
} = {}) {
  const material = [
    message,
    providerType,
    providerCode,
  ].map((part) => String(part || "").toLowerCase()).join(" ");

  if (status === 408 || status === 504 || /\b(timeout|timed out|aborted)\b/.test(material)) {
    return "provider_timeout";
  }
  if (status === 401 || status === 403 || /(auth|api[_ -]?key|permission|forbidden|unauthorized)/.test(material)) {
    return "provider_auth";
  }
  if (/insufficient[_ -]?quota|quota/.test(material)) {
    return "provider_quota";
  }
  if (status === 429 || /rate[_ -]?limit|too many requests/.test(material)) {
    return "provider_rate_limited";
  }
  if (stage === "tts" && /(non-mp3|not mp3|empty audio|invalid audio|returned empty)/.test(material)) {
    return "response_invalid";
  }
  if (stage === "server") {
    return "talk_server_error";
  }
  if (status >= 500 || /(fetch failed|socket|econnreset|network|unavailable|overloaded)/.test(material)) {
    return "provider_unavailable";
  }
  if (status === 400 || status === 422) {
    return "provider_bad_request";
  }
  return `provider_${stage}_failed`;
}

function publicStageLabel(stage) {
  switch (stage) {
    case "stt":
      return "voice transcription";
    case "chat":
      return "response generation";
    case "tts":
      return "voice synthesis";
    case "upload":
      return "audio upload";
    default:
      return "talk";
  }
}

function buildPublicMessage({ requestId = "", stage = "server", errorClass = "" } = {}) {
  const reference = requestId ? ` Reference ${requestId}.` : "";
  if (errorClass === "screenplay_page_quality_failed") {
    return `The screenplay pages did not pass Clementine's quality check, so the draft was left unchanged.${reference}`;
  }
  return `Talk failed during ${publicStageLabel(stage)} (${errorClass}).${reference}`;
}

function buildTalkFailureDiagnostics(error, {
  requestId = "",
  providerStage = "",
  status = null,
  rawBody = "",
  errorClass = "",
} = {}) {
  if (error?.talkFailureDiagnostic && typeof error.talkFailureDiagnostic === "object") {
    const existing = error.talkFailureDiagnostic;
    return {
      ...existing,
      requestId: trimString(existing.requestId || requestId, 120),
    };
  }

  const stage = normalizeStage(providerStage || error?.stage || error?.providerStage || "server");
  const statusCode = normalizeStatus(status ?? error?.status ?? error?.statusCode, 500);
  const providerDetails = extractProviderDetails(rawBody || error?.rawBody || error?.providerBody);
  const providerType = providerDetails.providerType || trimString(error?.providerType || "", 80);
  const providerCode = providerDetails.providerCode || trimString(error?.providerCode || error?.code || "", 80);
  const message = trimString(error?.message || error || "Talk failed.", 180);
  const resolvedClass = trimString(errorClass || error?.errorClass || classifyTalkFailure({
    status: statusCode,
    stage,
    message,
    providerType,
    providerCode,
  }), 80);
  const cleanRequestId = trimString(requestId || error?.requestId || "", 120);
  const publicMessage = buildPublicMessage({
    requestId: cleanRequestId,
    stage,
    errorClass: resolvedClass,
  });
  const transportCode = extractTransportCode(error);
  const supportParts = [
    `stage=${stage}`,
    `class=${resolvedClass}`,
    `status=${statusCode}`,
  ];
  if (providerType) supportParts.push(`provider_type=${providerType}`);
  if (providerCode) supportParts.push(`provider_code=${providerCode}`);
  if (transportCode) supportParts.push(`transport_code=${transportCode}`);

  return {
    requestId: cleanRequestId,
    providerStage: stage,
    status: statusCode,
    errorClass: resolvedClass,
    publicMessage,
    supportMessage: supportParts.join(" "),
    ...(transportCode ? { transportCode } : {}),
  };
}

function createTalkFailureError({
  requestId = "",
  providerStage = "server",
  status = 500,
  message = "",
  rawBody = "",
  errorClass = "",
  cause = null,
} = {}) {
  const diagnostic = buildTalkFailureDiagnostics(
    { stage: providerStage, status, message: message || "Provider request failed.", rawBody, errorClass, cause },
    { requestId, providerStage, status, rawBody, errorClass }
  );
  const err = new Error(diagnostic.publicMessage);
  err.stage = diagnostic.providerStage;
  err.status = diagnostic.status;
  err.errorClass = diagnostic.errorClass;
  err.talkFailureDiagnostic = diagnostic;
  return err;
}

function buildTalkFailureBody(diagnostic) {
  return {
    stage: `talk_${diagnostic.providerStage || "server"}`,
    provider_stage: diagnostic.providerStage || "server",
    error_class: diagnostic.errorClass || "talk_server_error",
    request_id: diagnostic.requestId || "",
    error: diagnostic.publicMessage || "Talk failed.",
  };
}

function applyTalkFailureHeaders(res, diagnostic) {
  if (!res || typeof res.setHeader !== "function") return;
  res.setHeader("x-request-id", encodeURIComponent(diagnostic.requestId || ""));
  res.setHeader("x-turn-error-stage", encodeURIComponent(diagnostic.providerStage || "server"));
  res.setHeader("x-turn-provider-stage", encodeURIComponent(diagnostic.providerStage || "server"));
  res.setHeader("x-turn-error-class", encodeURIComponent(diagnostic.errorClass || "talk_server_error"));
  res.setHeader("x-talk-error-class", encodeURIComponent(diagnostic.errorClass || "talk_server_error"));
  res.setHeader("x-turn-error-message", encodeURIComponent(diagnostic.publicMessage || "Talk failed."));
}

export {
  applyTalkFailureHeaders,
  buildTalkFailureBody,
  buildTalkFailureDiagnostics,
  createTalkFailureError,
  classifyTalkFailure,
};

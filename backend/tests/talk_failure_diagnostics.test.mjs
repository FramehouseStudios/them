import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyTalkFailureHeaders,
  buildTalkFailureBody,
  buildTalkFailureDiagnostics,
  classifyTalkFailure,
  createTalkFailureError,
} from "../lib/talk_failure_diagnostics.js";

test("[talk-diagnostics] provider JSON is reduced to safe class + request id", () => {
  const secretTranscript = "SECRET_TRANSCRIPT_SHOULD_NOT_LEAK";
  const secretKey = "sk-secret-key-should-not-leak";
  const diagnostic = buildTalkFailureDiagnostics(
    {
      stage: "chat",
      status: 429,
      rawBody: JSON.stringify({
        error: {
          type: "rate_limit_error",
          code: "rate_limit_exceeded",
          message: `Provider rejected prompt ${secretTranscript} with key ${secretKey}`,
        },
      }),
    },
    {
      requestId: "req_talk_diag",
      providerStage: "chat",
      status: 429,
      rawBody: JSON.stringify({
        error: {
          type: "rate_limit_error",
          code: "rate_limit_exceeded",
          message: `Provider rejected prompt ${secretTranscript} with key ${secretKey}`,
        },
      }),
    }
  );
  const body = buildTalkFailureBody(diagnostic);
  const serialized = JSON.stringify({ diagnostic, body });

  assert.equal(diagnostic.requestId, "req_talk_diag");
  assert.equal(diagnostic.providerStage, "chat");
  assert.equal(diagnostic.errorClass, "provider_rate_limited");
  assert.equal(body.stage, "talk_chat");
  assert.equal(body.provider_stage, "chat");
  assert.equal(body.error_class, "provider_rate_limited");
  assert.equal(body.request_id, "req_talk_diag");
  assert.ok(!serialized.includes(secretTranscript), "diagnostics must not leak transcript text");
  assert.ok(!serialized.includes(secretKey), "diagnostics must not leak provider credentials");
});

test("[talk-diagnostics] timeout/auth/server classifications are stable", () => {
  assert.equal(
    classifyTalkFailure({ status: 504, stage: "stt", message: "Transcription timed out." }),
    "provider_timeout"
  );
  assert.equal(
    classifyTalkFailure({ status: 401, stage: "chat", providerCode: "invalid_api_key" }),
    "provider_auth"
  );
  assert.equal(
    classifyTalkFailure({ status: 500, stage: "server", message: "Forced /talk failure" }),
    "talk_server_error"
  );
  assert.equal(
    classifyTalkFailure({ status: 502, stage: "tts", message: "Speech synthesis output was not MP3." }),
    "response_invalid"
  );
});

test("[talk-diagnostics] headers expose app-readable safe diagnostics", () => {
  const diagnostic = buildTalkFailureDiagnostics(
    { stage: "tts", status: 502, message: "Speech synthesis failed." },
    { requestId: "req_headers", providerStage: "tts", status: 502 }
  );
  const headers = {};
  applyTalkFailureHeaders({
    setHeader(key, value) {
      headers[String(key).toLowerCase()] = String(value);
    },
  }, diagnostic);

  assert.equal(decodeURIComponent(headers["x-request-id"]), "req_headers");
  assert.equal(decodeURIComponent(headers["x-turn-error-stage"]), "tts");
  assert.equal(decodeURIComponent(headers["x-turn-provider-stage"]), "tts");
  assert.equal(decodeURIComponent(headers["x-turn-error-class"]), "provider_unavailable");
  assert.ok(decodeURIComponent(headers["x-turn-error-message"]).includes("req_headers"));
});

test("[talk-diagnostics] created errors carry canonical diagnostics", () => {
  const err = createTalkFailureError({
    requestId: "req_created",
    providerStage: "chat",
    status: 400,
    rawBody: JSON.stringify({ error: { type: "invalid_request_error", code: "context_length_exceeded" } }),
  });

  assert.equal(err.stage, "chat");
  assert.equal(err.status, 400);
  assert.equal(err.errorClass, "provider_bad_request");
  assert.equal(err.talkFailureDiagnostic.requestId, "req_created");
  assert.equal(err.talkFailureDiagnostic.providerStage, "chat");
});

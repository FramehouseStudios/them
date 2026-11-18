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

test("[talk-diagnostics] screenplay quality failures explain that the draft was not changed", () => {
  const err = createTalkFailureError({
    requestId: "req_screenplay_quality",
    providerStage: "chat",
    status: 502,
    message: "Rejected page output.",
    errorClass: "screenplay_page_quality_failed",
  });

  assert.equal(err.errorClass, "screenplay_page_quality_failed");
  assert.match(err.message, /quality check/i);
  assert.match(err.message, /draft was left unchanged/i);
  assert.match(err.message, /req_screenplay_quality/);
  assert.doesNotMatch(err.message, /Rejected page output/);
});


test("[talk-diagnostics] nested Node and Undici transport codes stay private and allowlisted", () => {
  for (const code of ["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ERR_TLS_CERT_ALTNAME_INVALID", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"]) {
    const leaf = Object.assign(new Error("private socket host and credential"), { code });
    const cause = new TypeError("fetch failed", { cause: new AggregateError([new Error("unknown"), leaf], "private aggregate") });
    const err = createTalkFailureError({ requestId: "req_transport", providerStage: "stt", status: 500, cause });
    const diagnostic = err.talkFailureDiagnostic;
    const baseline = createTalkFailureError({ requestId: "req_transport", providerStage: "stt", status: 500 }).talkFailureDiagnostic;
    assert.equal(diagnostic.transportCode, code);
    assert.match(diagnostic.supportMessage, new RegExp(`transport_code=${code}(?: |$)`));
    assert.equal(err.cause, undefined, "the raw provider exception must not be retained on the converted error");
    assert.deepEqual(buildTalkFailureBody(diagnostic), buildTalkFailureBody(baseline));
    const headers = {}, baselineHeaders = {};
    applyTalkFailureHeaders({ setHeader: (key, value) => { headers[key] = value; } }, diagnostic);
    applyTalkFailureHeaders({ setHeader: (key, value) => { baselineHeaders[key] = value; } }, baseline);
    assert.deepEqual(headers, baselineHeaders);
    assert.ok(!JSON.stringify(diagnostic).includes("private"));
    assert.ok(!JSON.stringify({ body: buildTalkFailureBody(diagnostic), headers }).includes(code));
  }
});

test("[talk-diagnostics] unknown codes and coercible objects add no fields or private content", () => {
  const privateText = "PRIVATE_TRANSPORT_SECRET_DO_NOT_LOG";
  const baseline = createTalkFailureError({ providerStage: "stt" }).talkFailureDiagnostic;
  for (const code of [privateText, "UND_ERR_CUSTOM_PRIVATE", "econnreset", { toString() { throw new Error(privateText); } }]) {
    const cause = Object.assign(new TypeError(privateText), { code, stack: privateText });
    const diagnostic = createTalkFailureError({ providerStage: "stt", cause }).talkFailureDiagnostic;
    assert.deepEqual(diagnostic, baseline, "no recognized transport code must preserve the old diagnostic shape");
    assert.equal(Object.hasOwn(diagnostic, "transportCode"), false);
    assert.ok(!JSON.stringify(diagnostic).includes(privateText));
  }
});

test("[talk-diagnostics] cause cycles and aggregate fanout/depth are bounded", () => {
  const cyclic = new TypeError("private cycle");
  cyclic.cause = cyclic;
  assert.equal(Object.hasOwn(createTalkFailureError({ cause: cyclic }).talkFailureDiagnostic, "transportCode"), false);
  const known = Object.assign(new Error("private leaf"), { code: "ECONNRESET" });
  let deep = known;
  for (let index = 0; index < 8; index += 1) deep = new Error("private wrapper", { cause: deep });
  assert.equal(Object.hasOwn(createTalkFailureError({ cause: deep }).talkFailureDiagnostic, "transportCode"), false);
  const wide = new AggregateError([{}, {}, {}, {}, known], "private aggregate");
  assert.equal(Object.hasOwn(createTalkFailureError({ cause: wide }).talkFailureDiagnostic, "transportCode"), false);
  const aggregateCycle = new AggregateError([], "private aggregate cycle");
  aggregateCycle.errors.push(aggregateCycle, known);
  assert.equal(createTalkFailureError({ cause: aggregateCycle }).talkFailureDiagnostic.transportCode, "ECONNRESET");
});

test("[talk-diagnostics] transport inspection never invokes exception accessors", () => {
  const cause = new Error("private provider cause");
  for (const key of ["code", "cause"]) {
    Object.defineProperty(cause, key, { get() { throw new Error("private getter must not execute"); } });
  }
  const diagnostic = createTalkFailureError({ providerStage: "stt", cause }).talkFailureDiagnostic;
  assert.equal(Object.hasOwn(diagnostic, "transportCode"), false);
});


test("[talk-diagnostics] opaque causes fail closed without array-length coercion", () => {
  const baseline = createTalkFailureError({ providerStage: "stt" }).talkFailureDiagnostic;
  const revoked = Proxy.revocable([], {});
  revoked.revoke();
  const aggregate = new AggregateError([], "private aggregate");
  aggregate.errors = revoked.proxy;
  for (const cause of [revoked.proxy, aggregate]) {
    assert.deepEqual(createTalkFailureError({ providerStage: "stt", cause }).talkFailureDiagnostic, baseline);
  }
  let coercions = 0;
  const hostileLength = { valueOf() { coercions += 1; throw new Error("private coercion must not run"); } };
  const hostileArray = new Proxy([], {
    getOwnPropertyDescriptor(target, key) {
      if (key === "length") return { value: hostileLength, writable: true, enumerable: false, configurable: false };
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  const opaqueAggregate = new AggregateError([], "private length");
  opaqueAggregate.errors = hostileArray;
  assert.deepEqual(createTalkFailureError({ providerStage: "stt", cause: opaqueAggregate }).talkFailureDiagnostic, baseline);
  assert.equal(coercions, 0);
});

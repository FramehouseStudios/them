// T-decompose-phase5b4-realtime-call — extract `POST /realtime/call`
// from backend/index.js.
//
// Phase 5b.4 of the decomposition (spec:
// docs/specs/T-decompose-backend-index.md, design note #227).
// Phase 5b.1 (#238) extracted /realtime/client_secret; Phase
// 5b.2 (#264) extracted /realtime/studio_render +
// /studio_render_stream; Phase 5b.3 (#273) extracted
// /realtime/turn_commit. **This PR completes the 5b chain by
// extracting /realtime/call — the WebRTC SDP proxy.**
//
// V1 pillar: realtime
// V1 effect: closes the realtime route decomposition that V1
// line 68 ("Realtime route decomposition lands before talk-
// pipeline Phase 7") gates on. After this PR merges, the
// realtime sub-chain is complete and Phase 7 (talk-pipeline)
// is unblocked per the spec.
//
// Response behavior is identical with the previous inline handler:
//   - same 503 envelope when OPENAI_API_KEY is missing,
//   - same 400 envelope on empty SDP body,
//   - same 504 envelope on timeout (via isAbortError),
//   - same 502 envelope on generic fetch failure,
//   - same OpenAI-status passthrough on upstream non-2xx
//     (`{ stage, error }` JSON body carries upstream text),
//   - same `Content-Type: application/sdp` on 200,
//   - same `x-realtime-model` + `x-realtime-voice` headers,
//   - same `Cache-Control: no-store`,
//   - diagnostic line moved from inline `console.log` to
//     lib-local `console.warn`, matching the 5b.1 / 5b.2 /
//     5b.3 lib precedent for the pre-flight console-log-in-lib
//     rule,
//   - same body limit (512kb) on `text/plain` and
//     `application/sdp` content types,
//   - same 15-second fetch timeout.
//
// Access-control posture: SAFE-PUBLIC at the HTTP layer (the
// inline handler had no bearer-token guard). The SDP exchange
// negotiates a WebRTC session with OpenAI's realtime API; the
// per-user session ownership happens through the client_secret
// (#238) the caller already minted before invoking /realtime/call.
//
// Per the #238 invariant inheritance: this lib does NOT mutate
// any module-level state. No setter dep is accepted; a
// regression test pins the rule.

import express from "express";

const REALTIME_CALL_BODY_LIMIT = "512kb";
const REALTIME_CALL_TIMEOUT_MS = 15_000;

function mountRealtimeCallRoute(app, deps = {}) {
  if (!app || typeof app.post !== "function") {
    throw new Error("mountRealtimeCallRoute requires an Express app");
  }
  const {
    // ---------- helpers ----------
    createRequestId,
    buildRealtimeSessionConfig,
    fetchWithTimeout,
    isAbortError,
    // ---------- constants ----------
    OPENAI_API_KEY,
    OPENAI_REALTIME_MODEL,
    OPENAI_REALTIME_VOICE,
  } = deps;

  const requiredFns = {
    createRequestId,
    buildRealtimeSessionConfig,
    fetchWithTimeout,
    isAbortError,
  };
  for (const [key, fn] of Object.entries(requiredFns)) {
    if (typeof fn !== "function") {
      throw new Error(`mountRealtimeCallRoute: ${key} is required`);
    }
  }
  // Constants are required; empty string for OPENAI_API_KEY is
  // legitimate (treated as missing at request time, matching
  // the inline `if (!OPENAI_API_KEY)` guard).
  if (typeof OPENAI_API_KEY !== "string") {
    throw new Error("mountRealtimeCallRoute: OPENAI_API_KEY must be a string");
  }
  if (typeof OPENAI_REALTIME_MODEL !== "string" || !OPENAI_REALTIME_MODEL) {
    throw new Error("mountRealtimeCallRoute: OPENAI_REALTIME_MODEL must be a non-empty string");
  }
  if (typeof OPENAI_REALTIME_VOICE !== "string" || !OPENAI_REALTIME_VOICE) {
    throw new Error("mountRealtimeCallRoute: OPENAI_REALTIME_VOICE must be a non-empty string");
  }

  app.post(
    "/realtime/call",
    express.text({ type: ["application/sdp", "text/plain"], limit: REALTIME_CALL_BODY_LIMIT }),
    async (req, res) => {
      const rid = req.requestId || createRequestId();
      if (!OPENAI_API_KEY) {
        return res.status(503).json({
          stage: "realtime_call",
          error: "OpenAI API key is missing for Realtime call setup.",
        });
      }

      const offerSdp = String(req.body || "").trim();
      if (!offerSdp) {
        return res.status(400).json({
          stage: "realtime_call",
          error: "Missing SDP offer body.",
        });
      }

      const sessionConfig = buildRealtimeSessionConfig({
        model: String(req.query?.model || "").trim() || OPENAI_REALTIME_MODEL,
        voice: String(req.query?.voice || "").trim().toLowerCase() || OPENAI_REALTIME_VOICE,
      });
      const form = new FormData();
      form.set("sdp", offerSdp);
      form.set("session", JSON.stringify(sessionConfig));

      let openaiResp;
      try {
        openaiResp = await fetchWithTimeout(
          "https://api.openai.com/v1/realtime/calls",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              "OpenAI-Beta": "realtime=v1",
            },
            body: form,
          },
          REALTIME_CALL_TIMEOUT_MS,
        );
      } catch (err) {
        const message = isAbortError(err)
          ? "Realtime SDP negotiation timed out."
          : String(err?.message || err || "Realtime SDP negotiation failed.");
        return res.status(isAbortError(err) ? 504 : 502).json({
          stage: "realtime_call",
          error: message,
        });
      }

      const answerSdp = await openaiResp.text();
      if (!openaiResp.ok) {
        return res.status(openaiResp.status).json({
          stage: "realtime_call",
          error: answerSdp || "OpenAI Realtime call setup failed.",
        });
      }

      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/sdp");
      res.setHeader("x-realtime-model", sessionConfig.model);
      res.setHeader("x-realtime-voice", sessionConfig.audio?.output?.voice || OPENAI_REALTIME_VOICE);
      // Diagnostic line: inline source used console.log; lib uses
      // console.warn matching the 5b.1 / 5b.2 / 5b.3 precedent
      // for the pre-flight console-log-in-lib rule.
      console.warn(
        `[${rid}] realtime_call established model=${sessionConfig.model} voice=${sessionConfig.audio?.output?.voice || OPENAI_REALTIME_VOICE}`,
      );
      return res.status(200).send(answerSdp);
    },
  );
}

export { mountRealtimeCallRoute, REALTIME_CALL_BODY_LIMIT, REALTIME_CALL_TIMEOUT_MS };

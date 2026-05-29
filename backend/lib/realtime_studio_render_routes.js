// T-decompose-phase5b2-studio-render — extract
// `POST /realtime/studio_render` + `POST /realtime/studio_render_stream`
// from backend/index.js.
//
// Phase 5b.2 of the decomposition (spec:
// docs/specs/T-decompose-backend-index.md, design note
// #227). Phase 5b.1 (#238) extracted the supplier mint
// route; this PR extracts the two Studio-render routes.
//
// V1 pillar: realtime
// V1 effect: closes prerequisite for "Realtime route
// decomposition lands before talk-pipeline Phase 7"
// (docs/v1-definition.md line 68) by continuing the
// realtime extraction chain.
//
// Behavior preserves the previous inline handlers:
//   - same 503 envelope when OPENAI_API_KEY is missing,
//   - same 400 envelope on empty transcript,
//   - same 200 success envelope for sync (`/studio_render`),
//   - same SSE event stream for streaming
//     (`/studio_render_stream`) — meta + trace + delta +
//     done + error events with the same payload shapes,
//     while explicitly keeping the connection alive for
//     SSE clients,
//   - same diagnostic lines (chars_u / chars_a /
//     first_delta_ms / delta_chunks / total_ms). Note:
//     console.log in the inline source → console.warn here.
//     Matches the #238 precedent: pre-flight's
//     console-log-in-lib rule treats console.warn as the
//     correct lib-level diagnostic surface. ops log capture
//     receives both stdout + stderr so output is unchanged
//     for operators.
//   - same body limit (512kb) per route.
//
// Access-control posture: AUTHENTICATED-PAID-PROVIDER.
// `createUserAuthSubsystem().protectPaidProviderRoutes` gates
// `/realtime/studio_render*` before these handlers are mounted in
// backend/index.js. Keep this module focused on render behavior; the
// app/client must send bearer auth plus the active client token.

import express from "express";
import { normalizeScreenplayOutputContractText } from "./screenplay_output_contract.js";

const STUDIO_RENDER_BODY_LIMIT = "512kb";

function normalizeStudioRenderScreenplayTarget(body = {}) {
  const rawTarget = String(
    body?.screenplay_target
    ?? body?.screenplayTarget
    ?? body?.output_target
    ?? body?.outputTarget
    ?? "",
  )
    .trim()
    .toLowerCase();
  if (rawTarget === "page") return "page";
  if (rawTarget === "voicepin" || rawTarget === "voice_pin") return "voice_pin";
  return "";
}

function shouldApplyStudioRenderScreenplayContract(body = {}) {
  return normalizeStudioRenderScreenplayTarget(body) === "page";
}

function contractStudioRenderReply(reply = "", shouldApplyScreenplayContract = false) {
  const normalizedReply = String(reply || "").trim();
  if (!shouldApplyScreenplayContract) return normalizedReply;
  return normalizeScreenplayOutputContractText(normalizedReply);
}

function studioRenderDeltaFromContractedReply(previousReply = "", nextReply = "") {
  const previous = String(previousReply || "");
  const next = String(nextReply || "");
  if (!next || next === previous) return "";
  if (next.startsWith(previous)) {
    return next.slice(previous.length);
  }
  return next;
}

function mountRealtimeStudioRenderRoutes(app, deps = {}) {
  if (!app || typeof app.post !== "function") {
    throw new Error("mountRealtimeStudioRenderRoutes requires an Express app");
  }
  const {
    // Renderer entry points
    renderStudioRealtimeText,
    streamStudioRealtimeText,
    // Helpers
    createRequestId,
    normalizeSnippet,
    // Constants — accessor pattern so a value of "" / falsy
    // is treated as "missing" at request time, matching the
    // inline `if (!OPENAI_API_KEY)` guard.
    getOpenAIApiKey,
  } = deps;

  const required = {
    renderStudioRealtimeText,
    streamStudioRealtimeText,
    createRequestId,
    normalizeSnippet,
    getOpenAIApiKey,
  };
  for (const [key, fn] of Object.entries(required)) {
    if (typeof fn !== "function") {
      throw new Error(`mountRealtimeStudioRenderRoutes: ${key} is required`);
    }
  }

  // ---------- POST /realtime/studio_render (sync) ----------
  app.post("/realtime/studio_render", express.json({ limit: STUDIO_RENDER_BODY_LIMIT }), async (req, res) => {
    const rid = req.requestId || createRequestId();
    if (!getOpenAIApiKey()) {
      return res.status(503).json({
        stage: "studio_render",
        error: "OpenAI API key is missing for Studio render.",
      });
    }

    const transcript = normalizeSnippet(
      req.body?.transcript ?? req.body?.user_message ?? "",
      8_000,
    );
    if (!transcript) {
      return res.status(400).json({
        stage: "studio_render",
        error: "Studio render transcript was empty.",
      });
    }

    const systemPrompt = normalizeSnippet(
      req.body?.system_prompt ?? req.body?.instructions ?? "",
      16_000,
    );
    const shouldApplyScreenplayContract = shouldApplyStudioRenderScreenplayContract(req.body);

    try {
      const rawReply = await renderStudioRealtimeText({
        systemPrompt,
        transcript,
      });
      const reply = contractStudioRenderReply(rawReply, shouldApplyScreenplayContract);
      console.warn(
        `[${rid}] studio_render chars_u=${transcript.length} chars_a=${reply.length}`,
      );
      return res.status(200).json({
        ok: true,
        action: "studio_render",
        reply,
      });
    } catch (error) {
      return res.status(Number(error?.status || 502)).json({
        stage: String(error?.stage || "studio_render"),
        error: String(error?.message || error || "Studio render failed."),
      });
    }
  });

  // ---------- POST /realtime/studio_render_stream (SSE) ----------
  app.post("/realtime/studio_render_stream", express.json({ limit: STUDIO_RENDER_BODY_LIMIT }), async (req, res) => {
    const rid = req.requestId || createRequestId();
    const requestStartedAt = Date.now();
    const requestStartedAtISO8601 = new Date(requestStartedAt).toISOString();
    let firstDeltaMs = null;
    let deltaChunks = 0;
    if (!getOpenAIApiKey()) {
      return res.status(503).json({
        stage: "studio_render",
        error: "OpenAI API key is missing for Studio render.",
      });
    }

    const transcript = normalizeSnippet(
      req.body?.transcript ?? req.body?.user_message ?? "",
      8_000,
    );
    if (!transcript) {
      return res.status(400).json({
        stage: "studio_render",
        error: "Studio render transcript was empty.",
      });
    }

    const systemPrompt = normalizeSnippet(
      req.body?.system_prompt ?? req.body?.instructions ?? "",
      16_000,
    );
    const shouldApplyScreenplayContract = shouldApplyStudioRenderScreenplayContract(req.body);

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("X-Studio-Render-Request-Id", rid);
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    let closed = false;
    req.on("aborted", () => {
      closed = true;
    });
    res.on("close", () => {
      closed = true;
    });

    const pushEvent = (event, payload) => {
      if (closed || res.writableEnded) return;
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload || {})}\n\n`);
      if (typeof res.flush === "function") {
        res.flush();
      }
    };

    try {
      let lastEmittedReply = "";
      pushEvent("meta", {
        ok: true,
        action: "studio_render_stream",
        request_id: rid,
        started_at: requestStartedAtISO8601,
      });
      const rawReply = await streamStudioRealtimeText({
        systemPrompt,
        transcript,
        onDelta: async (delta, fullReply) => {
          const contractedFullReply = contractStudioRenderReply(fullReply, shouldApplyScreenplayContract);
          const outboundDelta = shouldApplyScreenplayContract
            ? studioRenderDeltaFromContractedReply(lastEmittedReply, contractedFullReply)
            : delta;
          if (!outboundDelta) return;
          deltaChunks += 1;
          if (shouldApplyScreenplayContract) {
            lastEmittedReply = contractedFullReply;
          }
          if (firstDeltaMs === null) {
            firstDeltaMs = Math.max(0, Date.now() - requestStartedAt);
            console.warn(
              `[${rid}] studio_render_stream first_delta_ms=${firstDeltaMs} delta_chars=${outboundDelta.length} full_chars=${contractedFullReply.length}`,
            );
            pushEvent("trace", {
              ok: true,
              action: "studio_render_stream",
              kind: "first_delta",
              request_id: rid,
              started_at: requestStartedAtISO8601,
              first_delta_ms: firstDeltaMs,
              delta_chunks: deltaChunks,
              delta_chars: outboundDelta.length,
              full_chars: contractedFullReply.length,
            });
          }
          pushEvent("delta", { delta: outboundDelta });
        },
      });
      const reply = contractStudioRenderReply(rawReply, shouldApplyScreenplayContract);
      if (shouldApplyScreenplayContract) {
        const finalDelta = studioRenderDeltaFromContractedReply(lastEmittedReply, reply);
        if (finalDelta) {
          deltaChunks += 1;
          pushEvent("delta", { delta: finalDelta });
          lastEmittedReply = reply;
        }
      }
      const totalMs = Math.max(0, Date.now() - requestStartedAt);
      console.warn(
        `[${rid}] studio_render_stream chars_u=${transcript.length} chars_a=${reply.length} delta_chunks=${deltaChunks} first_delta_ms=${firstDeltaMs ?? -1} total_ms=${totalMs}`,
      );
      pushEvent("done", {
        ok: true,
        action: "studio_render_stream",
        kind: "done",
        request_id: rid,
        started_at: requestStartedAtISO8601,
        first_delta_ms: firstDeltaMs,
        total_ms: totalMs,
        delta_chunks: deltaChunks,
        reply,
      });
    } catch (error) {
      console.error(
        `[${rid}] studio_render_stream error stage=${String(error?.stage || "studio_render")} message=${String(error?.message || error || "Studio render stream failed.")}`,
      );
      pushEvent("error", {
        request_id: rid,
        stage: String(error?.stage || "studio_render"),
        error: String(error?.message || error || "Studio render stream failed."),
      });
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  });
}

export { mountRealtimeStudioRenderRoutes, STUDIO_RENDER_BODY_LIMIT };

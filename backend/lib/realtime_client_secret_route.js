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

const CLIENT_SECRET_BODY_LIMIT = "512kb";

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

  app.post("/realtime/client_secret", express.json({ limit: CLIENT_SECRET_BODY_LIMIT }), async (req, res) => {
    const rid = req.requestId || createRequestId();
    const requesterIp = clientIp(req);
    const assistantSelfName = getAssistantSelfNameForIp(requesterIp);
    const requestedPrompt = normalizeSnippet(
      req.body?.system_prompt ?? req.body?.instructions ?? "",
      16_000,
    );
    const requestedVoice = String(req.body?.voice || "").trim().toLowerCase();
    const requestedModel = String(req.body?.model || "").trim();
    const rawProvider = String(req.body?.realtime_provider ?? req.body?.provider ?? "").trim().toLowerCase();
    const requestedProvider = ["", "default", "server_default"].includes(rawProvider) ? "" : rawProvider;

    let supplier = getRealtimeSupplier();
    if (!supplier || (requestedProvider && requestedProvider !== String(supplier.kind || "").toLowerCase())) {
      try {
        supplier = await createRealtimeSupplier({
          provider: requestedProvider || getRealtimeProviderEnv() || "openai",
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
      instructions: requestedPrompt,
      voice: requestedVoice || OPENAI_REALTIME_VOICE,
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
      instructions: requestedPrompt,
      model: requestedModel || OPENAI_REALTIME_MODEL,
      voice: requestedVoice || OPENAI_REALTIME_VOICE,
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

    const sessionVoice = sessionConfig.audio?.output?.voice || requestedVoice || OPENAI_REALTIME_VOICE;
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
      session: {
        type: sessionConfig.type || "realtime",
        model: sessionModel,
        voice: sessionVoice,
        instructions: sessionConfig.instructions || requestedPrompt,
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

export { mountRealtimeClientSecretRoute, CLIENT_SECRET_BODY_LIMIT };

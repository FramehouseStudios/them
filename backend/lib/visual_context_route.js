// D009 — POST /visual/context, extracted verbatim from backend/index.js.
//
// The handler body is unchanged; the middlewares (rate limiter, provider
// budget guard, client-token guard) and every index.js helper it used are
// passed in through `deps` and validated at mount. Library imports are
// re-imported here.

import express from "express";
import { OPENAI_API_KEY } from "../config.js";
import { createRequestId, normalizeSnippet, parseBool } from "./utils.js";

const REQUIRED_DEPS = Object.freeze([
  "backendRateLimiter",
  "buildVisualContextAddendum",
  "normalizeVisualContextImageDataUrl",
  "normalizeVisualDescriptor",
  "providerBudgetGuard",
  "requireClientTokenForTalk",
  "summarizeVisualContextFromImage",
]);

function mountVisualContextRoute(app, deps = {}) {
  if (!app || typeof app.post !== "function") {
    throw new Error("mountVisualContextRoute requires an Express app");
  }
  const missing = REQUIRED_DEPS.filter((name) => deps[name] === undefined);
  if (missing.length) {
    throw new Error(`mountVisualContextRoute missing dependencies: ${missing.join(", ")}`);
  }
  const {
    backendRateLimiter,
    buildVisualContextAddendum,
    normalizeVisualContextImageDataUrl,
    normalizeVisualDescriptor,
    providerBudgetGuard,
    requireClientTokenForTalk,
    summarizeVisualContextFromImage,
  } = deps;

  app.post(
    "/visual/context",
    backendRateLimiter.middleware("provider"),
    providerBudgetGuard.middleware("visual_context"),
    requireClientTokenForTalk,
    express.json({ limit: "2mb" }),
    async (req, res) => {
      const rid = req.requestId || createRequestId();
      if (!OPENAI_API_KEY) {
        return res.status(503).json({
          stage: "visual_context",
          error: "OpenAI API key is missing for visual context.",
        });
      }

      const imageDataUrl = normalizeVisualContextImageDataUrl(
        req.body?.image_data_url ?? req.body?.imageDataUrl ?? ""
      );
      if (!imageDataUrl) {
        return res.status(400).json({
          stage: "visual_context",
          error: "Visual context image was empty.",
        });
      }

      const transcript = normalizeSnippet(
        req.body?.transcript ?? req.body?.user_message ?? req.body?.userMessage ?? "",
        2_400
      );
      const isScreenplayMode = parseBool(
        req.body?.is_screenplay_mode ?? req.body?.isScreenplayMode
      );
      const appName = normalizeVisualDescriptor(
        req.body?.app_name ?? req.body?.appName ?? "",
        80
      );
      const windowTitle = normalizeVisualDescriptor(
        req.body?.window_title ?? req.body?.windowTitle ?? "",
        140
      );

      try {
        const context = await summarizeVisualContextFromImage({
          imageDataUrl,
          transcript,
          isScreenplayMode,
          appName,
          windowTitle,
        });
        const promptAddendum = buildVisualContextAddendum(context);
        console.log(
          `[${rid}] visual_context chars_u=${transcript.length} chars_v=${context.summary.length} app=${context.appName || "unknown"}`
        );
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).json({
          ok: true,
          summary: context.summary,
          prompt_addendum: promptAddendum,
          app_name: context.appName,
          window_title: context.windowTitle,
          source: context.source,
          captured_at: Date.now(),
        });
      } catch (error) {
        return res.status(Number(error?.status || 502)).json({
          stage: String(error?.stage || "visual_context"),
          error: String(error?.message || error || "Visual context failed."),
        });
      }
    }
  );
}

export { mountVisualContextRoute, REQUIRED_DEPS as VISUAL_CONTEXT_ROUTE_REQUIRED_DEPS };

// Short-film lane — Page lane for beta (PR3).
// Generates draft via chatSupplier (or injected offline draft in tests),
// respects AbortSignal. Production never falls back to offline draft;
// provider errors surface. System is caller's assembled system + short-film block.

import { buildShortFilmPrompt } from "./short_film_prompt.js";

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

/**
 * Run short-film lane for a beta request.
 * @param {object} opts
 * @param {object} opts.req - talk request with clementine { lane }
 * @param {object} opts.parsed - from parseShortFilmIntent
 * @param {object} [opts.chatSupplier] - live supplier (required in prod, injected in tests)
 * @param {AbortSignal} [opts.signal]
 * @param {Function} [opts.offlineDraftFn] - injected offline draft for tests only (not used in prod)
 * @param {string} [opts.baseSystem] - caller's assembled system (already persona + withOutputContract)
 * @param {object} [opts.chatModelPlan] - model plan from caller (model, apiMode, reasoningEffort, fallbackModel)
 * @returns {Promise<{draft:string, usage:{outputTokens:number}, pages:number}>}
 */
async function runShortFilmLane({ req, parsed, chatSupplier = null, signal = null, offlineDraftFn = null, baseSystem = "", chatModelPlan = null } = {}) {
  if (!parsed) throw new Error("runShortFilmLane requires parsed");
  const reqPages = Number(parsed.requestedPages) || 5;

  if (signal?.aborted) {
    const err = new Error("Page generation cancelled");
    err.code = "page_generation_cancelled";
    err.cancelled = true;
    throw err;
  }

  // Use caller's assembled system (already persona + withOutputContract) + short-film block
  const { system: shortSystem, user } = buildShortFilmPrompt(parsed);
  const system = baseSystem ? `${baseSystem}\n\n${shortSystem}` : shortSystem;

  let draft = "";
  let outputTokens = 0;

  // Require chatSupplier in production; offlineDraftFn is test-only injection
  if (chatSupplier && typeof chatSupplier.chat === "function") {
    try {
      const chatResult = await chatSupplier.chat({
        model: chatModelPlan?.model || process.env.CHAT_MODEL_STRUCTURAL || "gpt-5.6-sol",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        maxTokens: chatModelPlan?.maxTokens || 4000,
        temperature: chatModelPlan?.temperature,
        apiMode: chatModelPlan?.apiMode,
        reasoningEffort: req?.clementine?.effort || chatModelPlan?.reasoningEffort,
        fallbackModel: chatModelPlan?.fallbackModel,
        signal,
        lane: "Page",
      });
      const text = trimToString(chatResult?.text || chatResult?.rawText);
      if (text) {
        draft = text;
        outputTokens = Number(chatResult?.usage?.outputTokens || chatResult?.usage?.output_tokens || 800) || 800;
      }
    } catch (e) {
      if (e?.cancelled || e?.code === "page_generation_cancelled" || signal?.aborted) {
        const err = new Error("Page generation cancelled");
        err.code = "page_generation_cancelled";
        err.cancelled = true;
        throw err;
      }
      // Surface provider errors as talk failures (no offline fallback in prod)
      throw e;
    }
  } else if (typeof offlineDraftFn === "function") {
    // Test-only offline path
    draft = offlineDraftFn(parsed);
    outputTokens = reqPages * 200;
  }

  if (!draft) {
    const err = new Error("Short-film generation failed: no draft");
    err.code = "short_film_no_draft";
    throw err;
  }

  if (signal?.aborted) {
    const err = new Error("Page generation cancelled");
    err.code = "page_generation_cancelled";
    err.cancelled = true;
    throw err;
  }

  // Wallet commit handled by caller (talk_generate) via req.clementine.commitWallet — no reserve/release here

  return { draft, usage: { outputTokens }, pages: reqPages };
}

export {
  runShortFilmLane,
};

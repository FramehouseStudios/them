// F3 — Per-stage model / effort routing for Page multipass.
//
// Cheap scaffolding: plan + critique
// Best craft quality: draft + revise (+ repair)
//
// Does not invent supplier APIs — reuses Muse normalizeEffort and existing
// OpenAI chatSupplier fields (model, apiMode, reasoningEffort, preferProvider).

import { normalizeEffort, DEFAULT_MODEL as MUSE_DEFAULT_MODEL } from "./muse_client.js";
import { isClementineMuseEnabled } from "./muse_provider.js";

const CHEAP_STAGES = new Set(["plan", "critique"]);
const CRAFT_STAGES = new Set(["draft", "revise", "repair"]);

const STAGE_ENV_KEYS = Object.freeze({
  plan: {
    model: "PAGE_MULTIPASS_PLAN_MODEL",
    effort: "PAGE_MULTIPASS_PLAN_EFFORT",
  },
  critique: {
    model: "PAGE_MULTIPASS_CRITIQUE_MODEL",
    effort: "PAGE_MULTIPASS_CRITIQUE_EFFORT",
  },
  draft: {
    model: "PAGE_MULTIPASS_DRAFT_MODEL",
    effort: "PAGE_MULTIPASS_DRAFT_EFFORT",
  },
  revise: {
    model: "PAGE_MULTIPASS_REVISE_MODEL",
    effort: "PAGE_MULTIPASS_REVISE_EFFORT",
  },
  repair: {
    model: "PAGE_MULTIPASS_REPAIR_MODEL",
    effort: "PAGE_MULTIPASS_REPAIR_EFFORT",
  },
});

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function envFlagTruthy(value) {
  const n = trimToString(value).toLowerCase();
  return n === "1" || n === "true" || n === "yes" || n === "on";
}

function cheapDefaultModel(env = process.env) {
  return trimToString(env.CHAT_MODEL_FAST) || "gpt-4o-mini";
}

function museDefaultModel(env = process.env) {
  return trimToString(env.MUSE_MODEL) || MUSE_DEFAULT_MODEL || "muse-spark-1.2";
}

function structuralDefaultModel(env = process.env) {
  return (
    trimToString(env.CHAT_MODEL_STRUCTURAL) ||
    trimToString(env.CHAT_MODEL_RICH) ||
    "gpt-5.6-sol"
  );
}

function structuralDefaultEffort(env = process.env) {
  return trimToString(env.CHAT_STRUCTURAL_REASONING_EFFORT) || "low";
}

function structuralRepairDefaultEffort(env = process.env) {
  return trimToString(env.CHAT_SCREENPLAY_REPAIR_REASONING_EFFORT) || "medium";
}

function structuralReasoningEnabled(env = process.env) {
  if (env.CHAT_STRUCTURAL_REASONING_ENABLED == null) return true;
  return envFlagTruthy(env.CHAT_STRUCTURAL_REASONING_ENABLED);
}

/**
 * Documented F3 choice (evidence: D008 cutover + F2 wallet honesty):
 * When Muse is enabled for the Page lane, plan/critique still prefer OpenAI
 * CHAT_MODEL_FAST so Spark is not burned on unmetered scaffolding. Draft /
 * revise / repair stay on Muse Standard with elevated effort (Page multi-beat
 * / Deep craft patterns in lanes.js + clementine-muse-cutover.md).
 */
function defaultPreferProvider(stage, { museEnabled = false } = {}) {
  if (!museEnabled) return "";
  if (CHEAP_STAGES.has(stage)) return "openai";
  return "";
}

function defaultModelForStage(stage, { env = process.env, museEnabled = false } = {}) {
  if (CHEAP_STAGES.has(stage)) return cheapDefaultModel(env);
  if (museEnabled) return museDefaultModel(env);
  return structuralDefaultModel(env);
}

function defaultEffortForStage(stage, { env = process.env, museEnabled = false, preferProvider = "" } = {}) {
  if (CHEAP_STAGES.has(stage)) {
    // Muse accepts "minimal"; OpenAI Responses set does not — use "low" when
    // forcing OpenAI so we stay inside openai_text_generation.normalizeReasoningEffort.
    if (preferProvider === "openai" || !museEnabled) return "low";
    return "minimal";
  }
  if (stage === "repair") {
    if (museEnabled && preferProvider !== "openai") return "medium";
    return structuralRepairDefaultEffort(env);
  }
  // draft / revise — craft quality
  if (museEnabled && preferProvider !== "openai") return "medium";
  const structural = structuralDefaultEffort(env);
  // Prefer at least medium for multipass craft when structural default is "low"
  // (latency-sensitive single-pass). Multipass already paid plan cost.
  if (structural === "low" || structural === "none" || structural === "") return "medium";
  return structural;
}

function defaultApiModeForStage(stage, { env = process.env, museEnabled = false, preferProvider = "", model = "" } = {}) {
  if (museEnabled && preferProvider !== "openai" && CRAFT_STAGES.has(stage)) {
    return "responses";
  }
  if (CHEAP_STAGES.has(stage) || preferProvider === "openai") {
    // Fast OpenAI path — chat_completions unless caller overrides model to a
    // reasoning/structural id and structural reasoning is on.
    const structuralModel = structuralDefaultModel(env);
    if (
      structuralReasoningEnabled(env) &&
      model &&
      structuralModel &&
      model === structuralModel
    ) {
      return "responses";
    }
    return "chat_completions";
  }
  if (structuralReasoningEnabled(env) && CRAFT_STAGES.has(stage)) {
    return "responses";
  }
  return "chat_completions";
}

function defaultFallbackModel(stage, { env = process.env, museEnabled = false, preferProvider = "" } = {}) {
  if (CHEAP_STAGES.has(stage)) return "";
  if (museEnabled && preferProvider !== "openai") return "";
  return trimToString(env.CHAT_MODEL_STRUCTURAL_FALLBACK) || trimToString(env.CHAT_MODEL_RICH) || "";
}

/**
 * Resolve supplier args for one multipass stage.
 *
 * @returns {{
 *   stage: string,
 *   model: string,
 *   effort: string,
 *   apiMode: string,
 *   fallbackModel: string,
 *   preferProvider: string,
 *   museEnabled: boolean,
 *   family: "cheap"|"craft",
 * }}
 */
function resolvePageMultipassStageRoute(
  stage,
  {
    env = process.env,
    chatModelPlan = null,
    museEnabled = null,
  } = {}
) {
  const name = trimToString(stage).toLowerCase();
  if (!STAGE_ENV_KEYS[name]) {
    throw new Error(`Unknown page multipass stage: ${stage}`);
  }
  const enabled =
    museEnabled == null ? isClementineMuseEnabled(env) : Boolean(museEnabled);
  const keys = STAGE_ENV_KEYS[name];
  const preferProvider = defaultPreferProvider(name, { museEnabled: enabled });
  const family = CHEAP_STAGES.has(name) ? "cheap" : "craft";

  let model = trimToString(env[keys.model]);
  if (!model) {
    // Craft stages may inherit the turn's structural plan model when Muse is off.
    if (
      family === "craft" &&
      !enabled &&
      trimToString(chatModelPlan?.model) &&
      trimToString(chatModelPlan?.tier).toLowerCase() === "structural"
    ) {
      model = trimToString(chatModelPlan.model);
    } else {
      model = defaultModelForStage(name, { env, museEnabled: enabled });
    }
  }

  let effort = trimToString(env[keys.effort]);
  if (!effort) {
    effort = defaultEffortForStage(name, {
      env,
      museEnabled: enabled,
      preferProvider,
    });
  }
  // Normalize via Muse effort set (superset that includes minimal). OpenAI
  // path will re-normalize and drop unsupported values if needed.
  effort = normalizeEffort(effort, family === "cheap" ? "low" : "medium");

  let apiMode = defaultApiModeForStage(name, {
    env,
    museEnabled: enabled,
    preferProvider,
    model,
  });
  // If caller forced a craft model onto chat_completions plan, keep responses
  // when the turn plan already said responses.
  if (
    family === "craft" &&
    !enabled &&
    trimToString(chatModelPlan?.apiMode) === "responses"
  ) {
    apiMode = "responses";
  }

  const fallbackModel =
    trimToString(chatModelPlan?.fallbackModel) ||
    defaultFallbackModel(name, { env, museEnabled: enabled, preferProvider });

  return Object.freeze({
    stage: name,
    model,
    effort,
    apiMode,
    fallbackModel,
    preferProvider,
    museEnabled: enabled,
    family,
    envKeys: keys,
  });
}

function resolveAllPageMultipassStageRoutes(opts = {}) {
  const stages = ["plan", "critique", "draft", "revise", "repair"];
  const out = {};
  for (const s of stages) {
    out[s] = resolvePageMultipassStageRoute(s, opts);
  }
  return Object.freeze(out);
}

export {
  CHEAP_STAGES,
  CRAFT_STAGES,
  STAGE_ENV_KEYS,
  resolvePageMultipassStageRoute,
  resolveAllPageMultipassStageRoutes,
  cheapDefaultModel,
  museDefaultModel,
  structuralDefaultModel,
  defaultPreferProvider,
};

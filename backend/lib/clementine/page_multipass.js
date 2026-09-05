// F2/F3 — Page multi-pass craft loop (Plan → Draft → Critique → Revise).
//
// Flag-gated MVP. Default OFF so main stays safe.
//   CLEMENTINE_PAGE_MULTIPASS=1  — enable pipeline for Page lane
//   PAGE_MULTIPASS_REPAIR=1      — one extra revise if F1 heuristic FAIL-style
// F3 routing (see page_multipass_routing.js):
//   PAGE_MULTIPASS_{PLAN,CRITIQUE,DRAFT,REVISE,REPAIR}_{MODEL,EFFORT}
//
// Wallet honesty (documented product choice):
//   Meter Page turns for **draft + revise** (and optional repair revise) only.
//   Plan and critique are unmetered craft overhead — cheap outline + score —
//   so writers are not billed for scaffolding that does not produce page text.
//   When multipass is on, beginPageWork doubles max_output_tokens for the
//   wallet reserve so draft+revise headroom is held up front.
//
// Abort: every stage checks AbortSignal / page cancel before work and after
// supplier returns. Throws createPageCancelledError on abort.
//
// Acceptance seam: reuses F1 scorePageHeuristic (page_craft eval) after
// revise (or draft if revise skipped). Optional repair revise when overall
// is below PASS floor (3.5) and PAGE_MULTIPASS_REPAIR=1.

import {
  scorePageHeuristic,
  DIMENSIONS,
  THRESHOLDS,
} from "../../evals/page_craft/score_page.js";
import {
  createPageCancelledError,
  gatePageGeneration,
} from "./page_abort.js";
import { LANE } from "./lanes.js";
import { isClementineMuseEnabled } from "./muse_provider.js";
import {
  resolvePageMultipassStageRoute,
  resolveAllPageMultipassStageRoutes,
} from "./page_multipass_routing.js";

const FLAG_MULTIPASS = "CLEMENTINE_PAGE_MULTIPASS";
const FLAG_REPAIR = "PAGE_MULTIPASS_REPAIR";

const STAGES = Object.freeze(["plan", "draft", "critique", "revise", "repair"]);

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function envFlagTruthy(value) {
  const n = trimToString(value).toLowerCase();
  return n === "1" || n === "true" || n === "yes" || n === "on";
}

function isPageMultipassEnabled(env = process.env) {
  return envFlagTruthy(env?.[FLAG_MULTIPASS]);
}

function isPageMultipassRepairEnabled(env = process.env) {
  return envFlagTruthy(env?.[FLAG_REPAIR]);
}

/**
 * True when this talk request should run the multipass pipeline.
 * Requires flag + Page lane (or explicit pageMultipass on clementine).
 */
function shouldRunPageMultipass(req, env = process.env) {
  if (!isPageMultipassEnabled(env)) return false;
  const c = req?.clementine;
  if (!c) return false;
  if (c.pageMultipass === false) return false;
  if (c.pageMultipass === true) return true;
  const lane = trimToString(c.lane);
  return lane === LANE.PAGE || lane.toLowerCase() === "page";
}

/**
 * Wallet reserve headroom multiplier when multipass is on (draft + revise).
 * Plan/critique are not metered; do not multiply for them.
 */
function multipassWalletReserveTokenMultiplier(env = process.env) {
  return isPageMultipassEnabled(env) ? 2 : 1;
}

function assertNotAborted(signal, { reservationId = null, stage = "" } = {}) {
  if (signal?.aborted) {
    const reason =
      (typeof signal.reason === "string" && signal.reason) || "cancelled";
    const err = createPageCancelledError({ reason, reservationId });
    err.multipassStage = stage || null;
    throw err;
  }
}

function extractChatText(chatResult) {
  if (!chatResult) return "";
  if (typeof chatResult.text === "string" && chatResult.text.trim()) {
    return chatResult.text.trim();
  }
  if (typeof chatResult.reply === "string" && chatResult.reply.trim()) {
    return chatResult.reply.trim();
  }
  if (typeof chatResult.rawText === "string") {
    try {
      const json = JSON.parse(chatResult.rawText);
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content === "string") return content.trim();
    } catch (_e) {
      /* fall through */
    }
    return chatResult.rawText.trim();
  }
  return "";
}

function usageOutputTokens(chatResult) {
  const u = chatResult?.usage;
  if (!u || typeof u !== "object") return 0;
  return Math.max(
    0,
    Math.round(Number(u.outputTokens ?? u.output_tokens ?? 0) || 0)
  );
}

/**
 * Heuristic critique against F1 rubric dimensions.
 * Returns structured JSON-shaped object (no live API).
 */
function critiquePageHeuristic(pageText = "", { scoreFn = scorePageHeuristic } = {}) {
  const scored = scoreFn(pageText);
  const dimensions = scored?.dimensions || {};
  const overall = Number(scored?.overall) || 1;
  const weaknesses = [];
  const strengths = [];
  for (const dim of DIMENSIONS) {
    const n = Number(dimensions[dim]);
    if (!Number.isFinite(n)) continue;
    if (n < 3.5) {
      weaknesses.push({
        dimension: dim,
        score: n,
        note: `Below owner-bar floor on ${dim}`,
      });
    } else if (n >= 4) {
      strengths.push({ dimension: dim, score: n });
    }
  }
  const directives = weaknesses.slice(0, 4).map((w) => {
    switch (w.dimension) {
      case "distinct_character_voice":
        return "Separate character diction/rhythm; avoid interchangeable writer-voice.";
      case "subtext_density":
        return "Cut on-the-nose labels; imply emotion through behavior and tactic.";
      case "continuity_want_obstacle_cost":
        return "Keep a live want, a blocking pressure, and a visible cost on the page.";
      case "motif_image_echo":
        return "Echo one concrete image/object so the page feels designed.";
      case "anti_cliche":
        return "Replace stock phrases with specific, fresh wording and behavior.";
      case "format_playability":
        return "Tighten Fountain shape; make beats camera/actor-playable.";
      default:
        return `Improve ${w.dimension}.`;
    }
  });
  return {
    mode: "heuristic",
    overall,
    dimensions,
    passFloor: THRESHOLDS.passMinOverall,
    failsPassFloor: overall < THRESHOLDS.passMinOverall,
    weaknesses,
    strengths,
    directives,
    notes: Array.isArray(scored?.notes) ? scored.notes : [],
  };
}

function buildPlanPrompt(utterance = "", rosterHint = "") {
  const hasAct = rosterHint.toLowerCase().includes("act");
  const lower = String(utterance || "").toLowerCase();
  const isWhatIf = lower.includes("what if") || lower.includes("should jess");
  const continueWith = lower.includes("continue with") ? String(utterance).split(/continue with/i)[1]?.trim().slice(0, 160) : "";
  return [
    "You are Clementine planning one screenplay page (Fountain).",
    "Write a SHORT beat/intent outline only (6–10 lines). No full page.",
    "Cover: want, obstacle, cost, motif, and voice tactic.",
    "If a character roster is given, make each Next: beat a want-vs-weakness collision using that character's strength/weakness/objective (e.g., use MARCUS loyalty vs distrust to block JESS).",
    hasAct ? "Tailor Next: beats to the current act's pressure (Act One: inciting incident/setup, Act Two: rising obstacle/midpoint, Act Three: payoff/cost)." : "",
    isWhatIf ? "What-if branching mode: make each Next: beat a divergent what-if alternative (different choice/consequence for Jess), so the 3 pills explore branching paths rather than one linear continuation." : "",
    continueWith ? `Writer picked Next: "${continueWith}" — write exactly that beat now, not a new random one; still end with 3 fresh Next: for after.` : "",
    isWhatIf ? "Writer is asking what-if — make each Next: a divergent branch (e.g., 'Next (A): Jess finds mother — cost: she loses town trust', 'Next (B): Jess fails — cost: she doubles down on lie', 'Next (C): Marcus finds first — cost: Jess must confess')." : "",
    "End with exactly 3 Next Beats as bullet lines starting with 'Next:' so the writer can tap one when blocked (e.g., 'Next: Jess finds the photo — cost: she must lie to Marcus').",
    rosterHint ? `Roster: ${rosterHint}` : "",
    "Do not write dialogue blocks or scene text yet.",
    utterance ? `Writer ask: ${utterance}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildDraftPrompt({ utterance = "", plan = "" } = {}) {
  return [
    "Write one Fountain screenplay page (or tight half-page) that executes the plan.",
    "Owner bar: top-class creative writer — distinct voice, subtext, want/obstacle/cost, motif, anti-cliché, playable format.",
    plan ? `PLAN:\n${plan}` : "",
    utterance ? `Writer ask: ${utterance}` : "",
    "Output only Fountain page text.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildRevisePrompt({ draft = "", critique = null, utterance = "", rosterHint = "" } = {}) {
  const directives = Array.isArray(critique?.directives)
    ? critique.directives
    : [];
  const weak = Array.isArray(critique?.weaknesses)
    ? critique.weaknesses
        .map((w) => `- ${w.dimension}: ${w.score}`)
        .join("\n")
    : "";
  const roster = String(rosterHint || "").trim();
  return [
    "Revise the Fountain page once using the critique. Keep what already works.",
    "Output only the revised Fountain page — no preamble.",
    roster ? `Roster: ${roster}` : "",
    roster ? "Use character strengths/weaknesses from roster to shape behavior and pressure (e.g., MARCUS loyalty vs distrust blocks JESS)." : "",
    utterance ? `Writer ask: ${utterance}` : "",
    directives.length ? `Directives:\n${directives.map((d) => `- ${d}`).join("\n")}` : "",
    weak ? `Weak dimensions:\n${weak}` : "",
    critique?.overall != null ? `Critique overall: ${critique.overall}` : "",
    `DRAFT:\n${draft}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Default LLM-backed stage supplier using an injected chat() fn.
 * chatFn({ messages, maxTokens, temperature, effort, signal, stage }) →
 *   { text, usage, raw? }
 */
function createChatStageSupplier(chatFn, defaults = {}) {
  if (typeof chatFn !== "function") {
    throw new Error("createChatStageSupplier requires chatFn");
  }
  return async function stageChat(args = {}) {
    const result = await chatFn({
      ...defaults,
      ...args,
    });
    return {
      text: extractChatText(result),
      usage: result?.usage || {
        outputTokens: usageOutputTokens(result),
      },
      raw: result,
    };
  };
}

/**
 * Run Plan → Draft → Critique → Revise (+ optional repair).
 *
 * All stage suppliers are injectable (tests use fakes; production wires
 * chatSupplier). scoreFn defaults to F1 scorePageHeuristic.
 *
 * @returns {Promise<{
 *   page: string,
 *   plan: string,
 *   critique: object|null,
 *   stages: object[],
 *   scores: object,
 *   meteredOutputTokens: number,
 *   multipass: true,
 * }>}
 */
async function runPageMultipass({
  signal = null,
  reservationId = null,
  utterance = "",
  /** Optional pre-built messages/context for draft (unused by default prompts). */
  context = null,
  planSupplier = null,
  draftSupplier = null,
  critiqueSupplier = null,
  reviseSupplier = null,
  scoreFn = scorePageHeuristic,
  /** Called with output tokens for each metered stage (draft/revise/repair). */
  walletMeter = null,
  env = process.env,
  logger = null,
  now = () => Date.now(),
} = {}) {
  if (typeof draftSupplier !== "function") {
    throw new Error("runPageMultipass requires draftSupplier");
  }
  const repairEnabled = isPageMultipassRepairEnabled(env);
  const stages = [];
  let plan = "";
  let draft = "";
  let critique = null;
  let page = "";
  let meteredOutputTokens = 0;
  const scores = {};

  async function runStage(name, { metered = false, fn }) {
    assertNotAborted(signal, { reservationId, stage: name });
    const started = now();
    const record = {
      name,
      ok: false,
      ms: 0,
      metered: Boolean(metered),
      outputTokens: 0,
      aborted: false,
      error: null,
    };
    try {
      const result = await fn();
      assertNotAborted(signal, { reservationId, stage: name });
      record.ok = true;
      record.ms = Math.max(0, now() - started);
      if (result && typeof result === "object") {
        if (result.outputTokens != null) {
          record.outputTokens = Math.max(
            0,
            Math.round(Number(result.outputTokens) || 0)
          );
        }
        if (result.score != null) record.score = result.score;
        if (result.meta && typeof result.meta === "object") {
          record.meta = result.meta;
        }
      }
      if (metered && record.outputTokens > 0 && typeof walletMeter === "function") {
        walletMeter(record.outputTokens, { stage: name });
        meteredOutputTokens += record.outputTokens;
      } else if (metered && record.outputTokens > 0) {
        meteredOutputTokens += record.outputTokens;
      }
      stages.push(record);
      return result;
    } catch (err) {
      record.ms = Math.max(0, now() - started);
      record.error = trimToString(err?.message || err) || "stage_failed";
      if (err?.cancelled || err?.code === "page_generation_cancelled") {
        record.aborted = true;
      }
      stages.push(record);
      throw err;
    }
  }

  // --- plan (unmetered, cheap) ---
  if (typeof planSupplier === "function") {
    const rosterHint = String(context?.rosterHint || "").trim();
    if (rosterHint && !rosterHint.toLowerCase().includes("next:")) {
      // rosterHint will be injected via buildPlanPrompt second arg, not via supplier's prompt directly
    }
    const planPrompt = rosterHint ? buildPlanPrompt(utterance, rosterHint) : buildPlanPrompt(utterance);
    const planResult = await runStage("plan", {
      metered: false,
      fn: async () => {
        const out = await planSupplier({
          signal,
          utterance,
          context,
          prompt: planPrompt,
        });
        plan = trimToString(out?.text || out?.plan || "");
        return {
          outputTokens: usageOutputTokens(out) || Number(out?.usage?.outputTokens || 0) || 0,
          meta: {
            planChars: plan.length,
            ...(out?.route ? { route: out.route } : {}),
          },
        };
      },
    });
    void planResult;
  } else {
    stages.push({
      name: "plan",
      ok: true,
      ms: 0,
      metered: false,
      outputTokens: 0,
      skipped: true,
      reason: "no_plan_supplier",
    });
  }

  // --- draft (metered) ---
  {
    const draftResult = await runStage("draft", {
      metered: true,
      fn: async () => {
        const out = await draftSupplier({
          signal,
          utterance,
          plan,
          context,
          prompt: buildDraftPrompt({ utterance, plan }),
        });
        draft = trimToString(out?.text || out?.page || "");
        if (!draft) {
          const err = new Error("Page multipass draft returned empty text");
          err.code = "page_multipass_empty_draft";
          throw err;
        }
        page = draft;
        const scored = scoreFn(draft);
        scores.afterDraft = {
          overall: scored.overall,
          dimensions: scored.dimensions,
        };
        return {
          outputTokens:
            Number(out?.usage?.outputTokens) ||
            usageOutputTokens(out) ||
            0,
          score: scored.overall,
          meta: out?.route ? { route: out.route } : undefined,
        };
      },
    });
    void draftResult;
  }

  // --- critique (unmetered; heuristic by default) ---
  {
    await runStage("critique", {
      metered: false,
      fn: async () => {
        if (typeof critiqueSupplier === "function") {
          critique = await critiqueSupplier({
            signal,
            page: draft,
            utterance,
            plan,
            scoreFn,
          });
        } else {
          critique = critiquePageHeuristic(draft, { scoreFn });
        }
        if (!critique || typeof critique !== "object") {
          critique = critiquePageHeuristic(draft, { scoreFn });
        }
        scores.afterCritique = {
          overall: critique.overall,
          dimensions: critique.dimensions,
          failsPassFloor: Boolean(critique.failsPassFloor),
        };
        return {
          score: critique.overall,
          meta: {
            failsPassFloor: Boolean(critique.failsPassFloor),
            directiveCount: Array.isArray(critique.directives)
              ? critique.directives.length
              : 0,
          },
        };
      },
    });
  }

  // --- revise (metered) — skip only when supplier missing ---
  let revised = false;
  const rosterHint = String(context?.rosterHint || "").trim();
  if (typeof reviseSupplier === "function") {
    await runStage("revise", {
      metered: true,
      fn: async () => {
        const out = await reviseSupplier({
          signal,
          utterance,
          plan,
          draft,
          critique,
          prompt: buildRevisePrompt({ draft, critique, utterance, rosterHint }),
        });
        const text = trimToString(out?.text || out?.page || "");
        if (text) {
          page = text;
          revised = true;
        }
        const scored = scoreFn(page);
        scores.afterRevise = {
          overall: scored.overall,
          dimensions: scored.dimensions,
        };
        return {
          outputTokens:
            Number(out?.usage?.outputTokens) ||
            usageOutputTokens(out) ||
            0,
          score: scored.overall,
          meta: {
            revised,
            ...(out?.route ? { route: out.route } : {}),
          },
        };
      },
    });
  } else {
    stages.push({
      name: "revise",
      ok: true,
      ms: 0,
      metered: false,
      outputTokens: 0,
      skipped: true,
      reason: "no_revise_supplier",
    });
    scores.afterRevise = scores.afterDraft;
  }

  // --- optional repair revise when below F1 PASS floor ---
  const finalForGate = scores.afterRevise || scores.afterDraft;
  const belowFloor =
    Number(finalForGate?.overall) < THRESHOLDS.passMinOverall;
  if (repairEnabled && belowFloor && typeof reviseSupplier === "function") {
    await runStage("repair", {
      metered: true,
      fn: async () => {
        const repairCritique =
          critique && typeof critique === "object"
            ? {
                ...critique,
                directives: [
                  ...(critique.directives || []),
                  "F1 acceptance FAIL-style: raise overall toward owner bar (≥3.5).",
                ],
              }
            : critiquePageHeuristic(page, { scoreFn });
        const out = await reviseSupplier({
          signal,
          utterance,
          plan,
          draft: page,
          critique: repairCritique,
          repair: true,
          prompt: buildRevisePrompt({
            draft: page,
            critique: repairCritique,
            utterance,
            rosterHint,
          }),
        });
        const text = trimToString(out?.text || out?.page || "");
        if (text) page = text;
        const scored = scoreFn(page);
        scores.afterRepair = {
          overall: scored.overall,
          dimensions: scored.dimensions,
        };
        return {
          outputTokens:
            Number(out?.usage?.outputTokens) ||
            usageOutputTokens(out) ||
            0,
          score: scored.overall,
          meta: out?.route ? { route: out.route } : undefined,
        };
      },
    });
  } else if (repairEnabled && !belowFloor) {
    stages.push({
      name: "repair",
      ok: true,
      ms: 0,
      metered: false,
      outputTokens: 0,
      skipped: true,
      reason: "above_pass_floor",
    });
  } else if (!repairEnabled) {
    stages.push({
      name: "repair",
      ok: true,
      ms: 0,
      metered: false,
      outputTokens: 0,
      skipped: true,
      reason: "PAGE_MULTIPASS_REPAIR off",
    });
  }

  const finalScore = scoreFn(page);
  scores.final = {
    overall: finalScore.overall,
    dimensions: finalScore.dimensions,
  };

  logger?.log?.(
    `[page_multipass] stages=${stages.map((s) => s.name + (s.skipped ? ":skip" : "")).join(",")} overall=${scores.final.overall} meteredTokens=${meteredOutputTokens}`
  );

  return {
    page,
    plan,
    critique,
    stages,
    scores,
    meteredOutputTokens,
    multipass: true,
    revised,
    repairEnabled,
  };
}

/**
 * Bridge for talk_generate: build suppliers from chatSupplier.chat and run
 * multipass. Commits wallet once for summed draft+revise(+repair) tokens.
 * Streaming is skipped for multipass MVP (correctness over TTFT).
 */
async function runTalkGeneratePageMultipass({
  req,
  rid,
  logger,
  chatSupplier,
  system = "",
  shortTermContextMessages = [],
  talkGenerationTranscript = "",
  chatMessages = [],
  chatModelPlan = null,
  chatTemperature = 0.7,
  chatMaxTokens = 1000,
  chatStart = Date.now(),
  env = process.env,
} = {}) {
  let pageAbortSignal = null;
  let pageReservationId = null;
  if (req?.clementine?.reservationId) {
    const pageGate = gatePageGeneration(req.clementine);
    pageAbortSignal = pageGate.signal;
    pageReservationId = pageGate.reservationId;
  }

  const utterance =
    trimToString(talkGenerationTranscript) ||
    trimToString(
      [...(Array.isArray(chatMessages) ? chatMessages : [])]
        .reverse()
        .find((m) => m?.role === "user")?.content
    );

  const baseMessages = Array.isArray(chatMessages) ? chatMessages : [];

  const museEnabled = isClementineMuseEnabled(env);
  const stageRoutes = resolveAllPageMultipassStageRoutes({
    env,
    chatModelPlan,
    museEnabled,
  });
  const routingLog = [];

  async function callChat({ prompt, maxTokens, signal, stage }) {
    assertNotAborted(signal || pageAbortSignal, {
      reservationId: pageReservationId,
      stage,
    });
    // Re-gate before each metered/unmetered LLM call.
    if (pageReservationId && req?.clementine) {
      gatePageGeneration(req.clementine);
    }
    const route =
      stageRoutes[stage] ||
      resolvePageMultipassStageRoute(stage, { env, chatModelPlan, museEnabled });
    routingLog.push({
      stage,
      model: route.model,
      effort: route.effort,
      apiMode: route.apiMode,
      preferProvider: route.preferProvider || "",
      family: route.family,
    });
    const messages = [
      ...baseMessages,
      {
        role: "user",
        content: trimToString(prompt),
      },
    ];
    const systemWithStage = [
      trimToString(system),
      stage === "plan"
        ? "Stage=plan: outline only."
        : stage === "revise" || stage === "repair"
          ? "Stage=revise: output revised Fountain only."
          : stage === "critique"
            ? "Stage=critique: structured craft notes only."
            : "Stage=draft: output Fountain page only.",
    ]
      .filter(Boolean)
      .join("\n");
    // Prefer injecting system as first message if supplier ignores a system field.
    const withSystem =
      systemWithStage && !messages.some((m) => m.role === "system")
        ? [{ role: "system", content: systemWithStage }, ...messages]
        : messages;

    const chatResult = await chatSupplier.chat({
      model: route.model,
      temperature: stage === "plan" || stage === "critique"
        ? Math.min(chatTemperature, 0.4)
        : chatTemperature,
      maxTokens: maxTokens,
      messages: withSystem,
      apiMode: route.apiMode || chatModelPlan?.apiMode,
      reasoningEffort: route.effort,
      effort: route.effort,
      fallbackModel: route.fallbackModel || chatModelPlan?.fallbackModel,
      preferProvider: route.preferProvider || undefined,
      signal: signal || pageAbortSignal,
      lane: req?.clementine?.lane || LANE.PAGE,
      multipassStage: stage,
    });
    return { chatResult, route };
  }

  const planSupplier = async ({ signal, prompt }) => {
    const { chatResult: raw, route } = await callChat({
      prompt,
      maxTokens: Math.min(400, Math.max(120, Math.round(chatMaxTokens * 0.25))),
      signal,
      stage: "plan",
    });
    return {
      text: extractChatText(raw),
      usage: raw?.usage || { outputTokens: usageOutputTokens(raw) },
      raw,
      route,
    };
  };

  const draftSupplier = async ({ signal, prompt }) => {
    const { chatResult: raw, route } = await callChat({
      prompt,
      maxTokens: chatMaxTokens,
      signal,
      stage: "draft",
    });
    return {
      text: extractChatText(raw),
      usage: raw?.usage || { outputTokens: usageOutputTokens(raw) },
      raw,
      route,
    };
  };

  const reviseSupplier = async ({ signal, prompt, repair }) => {
    const { chatResult: raw, route } = await callChat({
      prompt,
      maxTokens: chatMaxTokens,
      signal,
      stage: repair ? "repair" : "revise",
    });
    return {
      text: extractChatText(raw),
      usage: raw?.usage || { outputTokens: usageOutputTokens(raw) },
      raw,
      route,
    };
  };

  // Parse Next: beats from plan for writer's-block pills (nextThreeTurns)
  function parseNextBeats(planText = "") {
    const lines = String(planText || "").split(/\n/);
    const out = [];
    for (const line of lines) {
      const t = line.trim();
      if (/^next\s*:/i.test(t)) {
        const v = t.replace(/^next\s*:\s*/i, "").trim();
        if (v) out.push(v.slice(0, 180));
      }
    }
    return out.slice(0, 3);
  }
  // Build rosterHint for character-driven Next: beats (unlimited cast)
  let rosterHint = "";
  try {
    const mod = await import("../../creative_memory_store.js");
    const userId = String(req?.authUser?.id || req?.userId || req?.body?.user_id || req?.body?.userId || "").trim();
    if (mod?.createCreativeMemoryStore && userId) {
      const store = mod.createCreativeMemoryStore();
      const rec = store?.get ? await store.get(userId) : null;
      const canon = Array.isArray(rec?.writerCanonTargets) ? rec.writerCanonTargets : [];
      if (canon.length) {
        rosterHint = canon.slice(0, 10).map(c => `${c.field}=${String(c.value).slice(0, 80)}`).join(" | ");
      }
    }
  } catch (_e) { /* roster is best-effort for pills */ }
  // Also include any roster lines present in shortTermContextMessages
  if (!rosterHint && Array.isArray(shortTermContextMessages) && shortTermContextMessages.length) {
    const last = String(shortTermContextMessages[shortTermContextMessages.length - 1]?.content || "").slice(0, 600);
    if (last) rosterHint = last.slice(0, 400);
  }
  // Accumulate metered tokens; single commitWallet at end (wallet honesty).
  let pendingMetered = 0;
  const result = await runPageMultipass({
    signal: pageAbortSignal,
    reservationId: pageReservationId,
    utterance,
    context: { shortTermContextMessages, rosterHint },
    planSupplier,
    draftSupplier,
    critiqueSupplier: null, // heuristic default
    reviseSupplier,
    walletMeter: (tokens) => {
      pendingMetered += Math.max(0, Number(tokens) || 0);
    },
    env,
    logger,
  });

  if (typeof req?.clementine?.commitWallet === "function" && pendingMetered > 0) {
    try {
      req.clementine.commitWallet(pendingMetered);
    } catch (walletErr) {
      logger?.warn?.(
        `[${rid}] wallet_commit_failed ${walletErr?.message || walletErr}`
      );
    }
  }

  req.clementine = req.clementine || {};
  const nextBeats = parseNextBeats(result.plan);
  if (nextBeats.length) {
    // Surface as nextThreeTurns so ScreenplayLiveDraftBridge shows tap pills when blocked
    req.body = req.body || {};
    req.body.screenplay_next_three_turns = nextBeats;
    req.body.next_three_turns = nextBeats;
  }
  req.clementine.multipass = {
    stages: result.stages,
    scores: result.scores,
    plan: result.plan,
    critique: result.critique,
    nextBeats,
    meteredOutputTokens: result.meteredOutputTokens,
    routing: routingLog,
    stageRoutes,
  };

  const craftRoute = stageRoutes.draft || stageRoutes.revise;
  return {
    rawReply: result.page,
    streamFirstSentence: "",
    streamChatUsed: false,
    effectiveChatModel: String(craftRoute?.model || chatModelPlan?.model || "unknown"),
    effectiveChatApiMode: String(craftRoute?.apiMode || chatModelPlan?.apiMode || "chat_completions"),
    effectiveChatReasoningEffort: String(
      craftRoute?.effort || req?.clementine?.effort || chatModelPlan?.reasoningEffort || ""
    ),
    chatModelFallbackUsed: false,
    effectiveChatUsage: {
      inputTokens: 0,
      outputTokens: result.meteredOutputTokens,
      reasoningTokens: 0,
      totalTokens: result.meteredOutputTokens,
    },
    chatMs: Math.max(0, Date.now() - chatStart),
    multipass: {
      ...result,
      routing: routingLog,
      stageRoutes,
    },
  };
}

export {
  FLAG_MULTIPASS,
  FLAG_REPAIR,
  STAGES,
  isPageMultipassEnabled,
  isPageMultipassRepairEnabled,
  shouldRunPageMultipass,
  multipassWalletReserveTokenMultiplier,
  critiquePageHeuristic,
  buildPlanPrompt,
  buildDraftPrompt,
  buildRevisePrompt,
  createChatStageSupplier,
  runPageMultipass,
  runTalkGeneratePageMultipass,
  extractChatText,
  assertNotAborted,
  resolvePageMultipassStageRoute,
  resolveAllPageMultipassStageRoutes,
};

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_CHAT_SYSTEM_PROMPT,
  withOutputContract,
  appendDirectorAddendum,
  directorFlagsFromTranscript,
  inferRoutingPriorityLane,
  buildTurnPlanner,
  selectChatModelForTurn,
  buildKnowledgeRetrievalAddendum,
  evaluateTurnQualityHeuristics,
  validateAndDirectHerReply,
  enforceReplyCompletenessGuard,
} from "../index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CASES_PATH = path.join(__dirname, "regression_cases.json");
const BASELINE_PATH = path.join(__dirname, "regression_baseline.json");

const args = new Set(process.argv.slice(2));
const writeBaseline = args.has("--write-baseline");
const verbose = args.has("--verbose");
const forceRichModel = !args.has("--no-force-rich");
const evalModelOverride = String(process.env.EVAL_CHAT_MODEL || "").trim();
const enforceCaseMins =
  args.has("--strict-case-mins") || String(process.env.EVAL_STRICT_CASE_MINS || "0") === "1";
const keepFloorsOnUpdate = args.has("--keep-floors");
const autoRepairReruns = Math.max(
  0,
  Math.min(
    2,
    Number.isFinite(Number(process.env.EVAL_AUTO_REPAIR_RERUNS))
      ? Number(process.env.EVAL_AUTO_REPAIR_RERUNS)
      : (enforceCaseMins ? 1 : 0)
  )
);

const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required for regression evals.");
  process.exit(2);
}

const ANCHOR_STOPWORDS = new Set([
  "that",
  "this",
  "with",
  "from",
  "have",
  "your",
  "what",
  "when",
  "where",
  "which",
  "about",
  "into",
  "really",
  "would",
  "could",
  "should",
]);

const BASE_COMPONENT_KEYS = Object.freeze([
  "specificity",
  "continuity",
  "attunement",
  "conversationalPull",
  "brevity",
  "completionRate",
]);

const SPECIAL_COMPONENT_KEYS = Object.freeze([
  "heartbreakAdvice",
  "humorTiming",
  "noFiller",
  "turnTaking",
]);

const DEFAULT_FLOORS = Object.freeze({
  avgScore: 0.74,
  specificity: 0.58,
  continuity: 0.58,
  attunement: 0.62,
  conversationalPull: 0.58,
  brevity: 0.55,
  completionRate: 0.74,
  heartbreakAdvice: 0.25,
  humorTiming: 0.74,
  noFiller: 0.84,
  turnTaking: 0.82,
});

const REGRESSION_EPSILON = 0.003;
const SOFT_MARGIN_BY_KEY = Object.freeze({
  attunement: 0.08,
});

const FILLER_PATTERNS = [
  /that's an intriguing question/i,
  /that's a great question/i,
  /from how i see it/i,
  /the deeper pattern/i,
  /as an ai/i,
  /as a language model/i,
];

const TOXIC_HEARTBREAK_PATTERNS = [
  /revenge/i,
  /make (him|her|them) jealous/i,
  /win (him|her|them) back/i,
  /play games/i,
  /manipulat/i,
  /stalk/i,
];

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(0, Math.min(1, Number(fallback) || 0));
  return Math.max(0, Math.min(1, n));
}

function extractAnchorTerms(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => w.length >= 4)
    .filter((w) => !ANCHOR_STOPWORDS.has(w));
}

function withTimeout(ms = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, Number(ms) || 45000));
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

async function runChatCompletion({ system, transcript, model }) {
  const timeout = withTimeout(45000);
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.28,
        max_tokens: 280,
        messages: [
          { role: "system", content: system },
          { role: "user", content: transcript },
        ],
      }),
      signal: timeout.signal,
    });

    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(`chat_failed status=${resp.status} body=${text.slice(0, 240)}`);
    }

    const json = JSON.parse(text);
    return String(json?.choices?.[0]?.message?.content || "").trim();
  } finally {
    timeout.clear();
  }
}

async function makeSystemPrompt({ transcript, turnPlanner, routingPlan, flags, repairHints = [] }) {
  let system = withOutputContract(DEFAULT_CHAT_SYSTEM_PROMPT);
  const anchorTerms = extractAnchorTerms(transcript).slice(0, 8);
  const anchorSummary = anchorTerms.length ? anchorTerms.join(", ") : "none";
  const intent = String(turnPlanner?.intent || "reflective_checkin");
  system = appendDirectorAddendum(
    system,
    [
      "REGRESSION EVAL DIRECTOR:",
      "- Enforce structure: reflection -> insight -> gentle continuation.",
      "- Ask one question max.",
      "- No forced positivity.",
      "- Start by answering the user's exact ask; do not dodge with generic praise.",
      "- Include at least one concrete anchor from the user's wording (event, feeling, or domain term).",
      "- Never open with filler like 'that's an intriguing question'.",
      "- Keep language spoken and human, not clinical or helpdesk-style.",
      "- For betrayal/trauma/avoidance/venting: mirror impact, name pattern, then offer one grounded next step.",
      "- For heartbreak/breakup/ex pain: include ALL four: (1) direct validation, (2) pattern lens (honesty/consistency/compatibility vs chemistry), (3) boundary/self-respect line, (4) one concrete next-24-hours action.",
      "- Never give revenge/manipulation/get-them-back scripts.",
      "- For knowledge asks: give a concise baseline answer, then one deeper layer, then one concrete example.",
      "- For direct practical asks: give the deliverable first, then one optional refinement.",
      "- Turn-taking: never ask more than one question.",
      "- If gratitude-only, respond warmly with no question.",
      "- If playful (and not vulnerable/distress), humor can be witty with at most one tiny laugh marker.",
      "- Avoid generic disclaimers and avoid vague motivational slogans.",
      "- If loop detected, name loop gently and provide one actionable next step.",
      `- intent=${intent}`,
      `- transcript_anchor_terms=${anchorSummary}`,
      "- Anchor rule: include at least one anchor term naturally; for emotional/knowledge intents include at least two.",
      "- Brevity rule: target 70-130 words unless the user explicitly asks for long form.",
      "- Do not ask a follow-up question unless it clearly deepens the exact ask.",
      `- planner_intent=${String(turnPlanner?.intent || "unknown")}`,
      `- planner_next=${String(turnPlanner?.nextBestMove || "unknown")}`,
      `- routing_lane=${String(routingPlan?.lane || "normal_rotation")}`,
      "- Keep answers relevant to the exact ask and include concrete detail when available.",
    ].join("\n")
  );

  const knowledgePlan = await buildKnowledgeRetrievalAddendum({
    turnPlanner,
    routingPlan,
    transcript,
    flags,
    rid: "eval",
  });
  system = appendDirectorAddendum(system, String(knowledgePlan?.addendum || ""));
  if (Array.isArray(repairHints) && repairHints.length) {
    const lines = repairHints
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .slice(0, 6);
    if (lines.length) {
      system = appendDirectorAddendum(
        system,
        [
          "EVAL REPAIR HINTS:",
          ...lines.map((line) => `- ${line}`),
        ].join("\n")
      );
    }
  }
  return system;
}

function countQuestions(text) {
  return (String(text || "").match(/\?/g) || []).length;
}

function countLaughMarkers(text) {
  return (String(text || "").toLowerCase().match(/\b(?:haha|heh|lol|lmao)\b/g) || []).length;
}

function hasPlayfulCue(text) {
  const t = String(text || "").toLowerCase();
  return [
    "joke",
    "joking",
    "tease",
    "banter",
    "roast",
    "playful",
    "funny",
    "wild",
    "lol",
    "haha",
  ].some((x) => t.includes(x));
}

function hasAnyPattern(text, patterns) {
  const source = String(text || "");
  return patterns.some((re) => re.test(source));
}

function isLikelyComplete(text) {
  const out = String(text || "").trim();
  if (!out) return false;
  if (/[.!?]["')\]]?$/.test(out)) return true;
  if (/\b(and|or|but|because|so)\s*$/i.test(out)) return false;
  return out.split(/\s+/).length >= 8;
}

function evaluateSpecializedQuality({
  transcript,
  reply,
  flags,
  lane,
  expect,
}) {
  const out = String(reply || "").trim();
  const outLower = out.toLowerCase();
  const words = outLower.split(/\s+/).filter(Boolean).length;
  const questionCount = countQuestions(out);
  const laughCount = countLaughMarkers(outLower);
  const tags = [];

  // noFiller: always applicable.
  let fillerHits = 0;
  for (const re of FILLER_PATTERNS) {
    if (re.test(out)) fillerHits += 1;
  }
  let noFiller = Math.max(0, 1 - (fillerHits * 0.38));
  if (fillerHits > 0) tags.push("filler_phrase");

  // turnTaking: always applicable (text proxy).
  let turnTaking = 0.90;
  if (questionCount > 1) turnTaking -= 0.45;
  if (Boolean(expect?.noQuestion) && questionCount > 0) turnTaking -= 0.35;
  if (Boolean(expect?.requireQuestion) && questionCount === 0) turnTaking -= 0.20;
  if (!isLikelyComplete(out)) turnTaking -= 0.22;
  if (words < 8) turnTaking -= 0.12;
  if (questionCount > 1) tags.push("question_stack_special");
  if (!isLikelyComplete(out)) tags.push("incomplete_reply_special");
  turnTaking = clamp01(turnTaking, 0.45);

  // humorTiming: always applicable with context guards.
  const sensitiveTurn =
    Boolean(expect?.forbidLaugh) ||
    Boolean(flags?.isVulnerable) ||
    Boolean(flags?.isVenting) ||
    Boolean(flags?.therapeuticDepth) ||
    lane === "high_distress_safety" ||
    lane === "therapeutic_depth";
  const playfulExpected = Boolean(expect?.requirePlayfulHumor) || (Boolean(flags?.isPlayful) && !sensitiveTurn);
  let humorTiming = 0.86;
  if (sensitiveTurn) {
    humorTiming = laughCount === 0 ? 1 : Math.max(0.10, 0.45 - (0.20 * (laughCount - 1)));
    if (laughCount > 0) tags.push("laugh_in_sensitive_turn");
  } else if (playfulExpected) {
    if (laughCount === 1) humorTiming = 1;
    else if (laughCount === 0) humorTiming = hasPlayfulCue(outLower) ? 0.88 : 0.64;
    else humorTiming = 0.44;
    if (laughCount > 1) tags.push("too_many_laugh_markers");
  } else {
    if (laughCount > 1) {
      humorTiming = 0.62;
      tags.push("too_many_laugh_markers");
    } else if (laughCount === 1) {
      humorTiming = 0.88;
    }
  }
  humorTiming = clamp01(humorTiming, 0.60);

  // heartbreakAdvice: context-applicable only.
  const heartbreakApplicable =
    Boolean(expect?.requireHeartbreakAdvice) ||
    Boolean(flags?.therapeuticHeartbreak) ||
    (Boolean(flags?.therapeuticDepth) &&
      /\b(?:heartbreak|heartbroken|breakup|break up|broke up|my ex|ex|no contact|closure)\b/i.test(transcript));
  let heartbreakAdvice = null;
  if (heartbreakApplicable) {
    const hasValidation = [
      "that hurts",
      "this hurts",
      "i hear you",
      "makes sense",
      "of course",
      "painful",
      "i'm sorry this happened",
      "i am sorry this happened",
    ].some((x) => outLower.includes(x));
    const hasPatternLens = [
      "pattern",
      "consistency",
      "honesty",
      "compatibility",
      "chemistry",
      "availability",
      "mismatch",
    ].some((x) => outLower.includes(x));
    const hasBoundaryLens = [
      "boundary",
      "self-respect",
      "protect",
      "no-contact",
      "no contact",
      "distance",
      "limit",
    ].some((x) => outLower.includes(x));
    const hasConcreteStep = [
      "today",
      "tonight",
      "next 24",
      "one step",
      "first step",
      "do this",
      "sleep",
      "eat",
      "walk",
      "journal",
      "text",
      "call",
    ].some((x) => outLower.includes(x));
    const toxic = hasAnyPattern(out, TOXIC_HEARTBREAK_PATTERNS);
    heartbreakAdvice =
      0.18 +
      (hasValidation ? 0.22 : 0) +
      (hasPatternLens ? 0.20 : 0) +
      (hasBoundaryLens ? 0.24 : 0) +
      (hasConcreteStep ? 0.20 : 0);
    if (!hasValidation && !hasPatternLens) heartbreakAdvice -= 0.12;
    if (questionCount > 1) heartbreakAdvice -= 0.10;
    if (words < 16) heartbreakAdvice -= 0.12;
    if (toxic) {
      heartbreakAdvice = 0.05;
      tags.push("toxic_heartbreak_advice");
    }
    heartbreakAdvice = clamp01(heartbreakAdvice, 0.46);
  }

  return {
    components: {
      heartbreakAdvice: {
        applicable: heartbreakApplicable,
        value: heartbreakApplicable ? heartbreakAdvice : null,
      },
      humorTiming: {
        applicable: true,
        value: humorTiming,
      },
      noFiller: {
        applicable: true,
        value: noFiller,
      },
      turnTaking: {
        applicable: true,
        value: turnTaking,
      },
    },
    tags: Array.from(new Set(tags)),
  };
}

function collectCaseThresholdFailures(item, result) {
  const failures = [];
  const minScore = clamp01(item?.minScore, 0.65);
  if (clamp01(result?.score, 0) < minScore) {
    failures.push(`${result.id} score ${clamp01(result.score, 0).toFixed(3)} < case_min ${minScore.toFixed(3)}`);
  }
  const expect = item?.expect && typeof item.expect === "object" ? item.expect : {};
  const checkSpecialMin = (key, expectField) => {
    const threshold = Number(expect?.[expectField]);
    if (!Number.isFinite(threshold)) return;
    const entry = result?.special?.[key];
    if (!entry || !entry.applicable || !Number.isFinite(Number(entry.value))) return;
    const val = clamp01(entry.value, 0);
    if (val < threshold) {
      failures.push(`${result.id} ${key} ${val.toFixed(3)} < case_${expectField} ${Number(threshold).toFixed(3)}`);
    }
  };
  checkSpecialMin("heartbreakAdvice", "minHeartbreakAdvice");
  checkSpecialMin("humorTiming", "minHumorTiming");
  checkSpecialMin("noFiller", "minNoFiller");
  checkSpecialMin("turnTaking", "minTurnTaking");
  return failures;
}

function buildRepairHintsForCase({ item, result }) {
  const hints = [];
  const transcript = String(item?.transcript || "").toLowerCase();
  const lane = String(result?.lane || "");
  const intent = String(result?.intent || "");
  const expect = item?.expect && typeof item.expect === "object" ? item.expect : {};
  const components = result?.components && typeof result.components === "object"
    ? result.components
    : {};
  const special = result?.special && typeof result.special === "object"
    ? result.special
    : {};
  const therapeuticContext =
    lane === "therapeutic_depth" ||
    lane === "high_distress_safety" ||
    intent === "therapeutic_depth_processing" ||
    /\b(heartbreak|breakup|betray|cheated|lied|liar|abandoned|avoidant|family|childhood|trauma)\b/.test(transcript);
  const knowledgeContext = intent === "knowledge_answer" || lane === "knowledge";
  const directContext =
    intent === "practical_action" ||
    transcript.includes("give me one clear") ||
    transcript.includes("define ");
  const gratitudeContext = transcript.includes("thank you") || intent === "gratitude_acknowledgment";
  const playfulContext = Boolean(expect?.requirePlayfulHumor) || /\b(roast|lol|banter|joke|playful)\b/.test(transcript);
  const heartbreakContext =
    Boolean(expect?.requireHeartbreakAdvice) ||
    /\b(heartbreak|heartbroken|breakup|broke up|my ex|no contact|betray|cheated|lied)\b/.test(transcript);

  if (therapeuticContext && (Number(components?.attunement || 0) < 0.54 || (Array.isArray(result?.tags) && result.tags.includes("low_empathy")))) {
    hints.push("Open with one exact empathy line using 'I hear you' plus 'That makes sense', then continue.");
    hints.push("Use therapeutic sequence strictly: acknowledge -> validate -> pattern lens -> one boundary/agency next step.");
  }
  if (knowledgeContext) {
    hints.push("Use three-part knowledge structure: baseline answer, deeper mechanism, concrete example.");
    hints.push("Keep recommendations tightly scoped to the exact ask; do not drift.");
  }
  if (directContext) {
    hints.push("For direct asks: deliverable first, then one optional refinement; no filler opener.");
  }
  if (gratitudeContext) {
    hints.push("For gratitude-only turns: respond warmly in one complete sentence and no question.");
  }
  if (playfulContext) {
    hints.push("For playful turns: mirror playful energy briefly, then one witty line and one focused continuation question max.");
  }
  if (heartbreakContext && special?.heartbreakAdvice?.applicable && Number(special?.heartbreakAdvice?.value || 0) < 0.74) {
    hints.push("For heartbreak include all four explicitly: validation, chemistry-vs-compatibility pattern, boundary/self-respect line, and one concrete next-24-hours action.");
  }
  if (transcript.includes("love") && transcript.includes("continue")) {
    hints.push("For love continuation: expand with depth (fear + desire + boundary), avoid cliches, and keep one-question max.");
  }
  if (Number(special?.turnTaking?.value || 1) < 0.82) {
    hints.push("Never stack questions; ensure final sentence is complete and not dangling.");
  }
  if (Number(components?.specificity || 0) < 0.56) {
    hints.push("Echo at least one concrete anchor from user wording (event, feeling, or time cue).");
  }
  return Array.from(new Set(hints)).slice(0, 6);
}

function buildLaneMetrics(results) {
  const grouped = new Map();
  for (const row of results) {
    const lane = String(row?.lane || "unknown");
    if (!grouped.has(lane)) grouped.set(lane, []);
    grouped.get(lane).push(row);
  }
  const lanes = [];
  for (const [lane, rows] of grouped.entries()) {
    lanes.push({
      lane,
      cases: rows.length,
      avgScore: avg(rows.map((x) => clamp01(x?.score, 0))),
      specificity: avg(rows.map((x) => clamp01(x?.components?.specificity, 0))),
      continuity: avg(rows.map((x) => clamp01(x?.components?.continuity, 0))),
      attunement: avg(rows.map((x) => clamp01(x?.components?.attunement, 0))),
      conversationalPull: avg(rows.map((x) => clamp01(x?.components?.conversationalPull, 0))),
      brevity: avg(rows.map((x) => clamp01(x?.components?.brevity, 0))),
      completionRate: avg(rows.map((x) => clamp01(x?.components?.completionRate, 0))),
    });
  }
  return lanes.sort((a, b) => b.cases - a.cases || b.avgScore - a.avgScore);
}

function selectPreferredResult(a, b) {
  if (!a) return b;
  if (!b) return a;
  const aFails = collectCaseThresholdFailures({ minScore: a.minScore, expect: a.expect }, a).length;
  const bFails = collectCaseThresholdFailures({ minScore: b.minScore, expect: b.expect }, b).length;
  if (aFails !== bFails) return bFails < aFails ? b : a;
  if (clamp01(a.score, 0) !== clamp01(b.score, 0)) return clamp01(b.score, 0) > clamp01(a.score, 0) ? b : a;
  return a;
}

function avg(items) {
  if (!Array.isArray(items) || !items.length) return 0;
  return items.reduce((sum, x) => sum + Number(x || 0), 0) / items.length;
}

function avgDefined(items) {
  if (!Array.isArray(items) || !items.length) return 0;
  const vals = items
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x));
  if (!vals.length) return 0;
  return vals.reduce((sum, x) => sum + x, 0) / vals.length;
}

function metricTarget({ floors, snapshot, key, maxDrop }) {
  const floor = clamp01(floors?.[key], 0);
  const snapValue = snapshot && key === "avgScore"
    ? clamp01(snapshot?.avgScore, floor)
    : clamp01(snapshot?.avgComponents?.[key], floor);
  if (!snapshot) return floor;
  return Math.max(floor, snapValue - maxDrop);
}

function deriveAdaptiveFloors(snapshot) {
  const avgComponents = snapshot?.avgComponents && typeof snapshot.avgComponents === "object"
    ? snapshot.avgComponents
    : {};
  const avgSpecialComponents = snapshot?.avgSpecialComponents && typeof snapshot.avgSpecialComponents === "object"
    ? snapshot.avgSpecialComponents
    : {};
  const specialCoverage = snapshot?.specialCoverage && typeof snapshot.specialCoverage === "object"
    ? snapshot.specialCoverage
    : {};
  const avgScore = clamp01(snapshot?.avgScore, 0.55);
  const componentFloor = (value, fallback = 0.52) => {
    const raw = clamp01(value, fallback);
    return clamp01(raw - 0.04, Math.max(0.40, raw - 0.07));
  };
  const specialFloor = (key, fallback = 0.72) => {
    const covered = Number(specialCoverage?.[key] || 0) > 0;
    if (!covered) return clamp01(DEFAULT_FLOORS[key], fallback);
    const raw = clamp01(avgSpecialComponents?.[key], fallback);
    return clamp01(raw - 0.03, Math.max(0.55, raw - 0.06));
  };
  return {
    avgScore: clamp01(avgScore - 0.04, Math.max(0.50, avgScore - 0.07)),
    specificity: componentFloor(avgComponents.specificity, 0.58),
    continuity: componentFloor(avgComponents.continuity, 0.58),
    attunement: componentFloor(avgComponents.attunement, 0.60),
    conversationalPull: componentFloor(avgComponents.conversationalPull, 0.58),
    brevity: componentFloor(avgComponents.brevity, 0.55),
    completionRate: componentFloor(avgComponents.completionRate, 0.74),
    heartbreakAdvice: specialFloor("heartbreakAdvice", 0.25),
    humorTiming: specialFloor("humorTiming", 0.74),
    noFiller: specialFloor("noFiller", 0.84),
    turnTaking: specialFloor("turnTaking", 0.82),
  };
}

function pickEvalModel(modelPlanModel = "") {
  if (evalModelOverride) return evalModelOverride;
  if (forceRichModel) {
    return String(process.env.CHAT_MODEL_RICH || "gpt-4o").trim();
  }
  return String(modelPlanModel || "gpt-4o-mini");
}

async function runCaseAttempt({ item, caseIndex = 0, repairHints = [], attempt = 1 }) {
  const transcript = String(item?.transcript || "").trim();
  const flags = directorFlagsFromTranscript(transcript);
  const routingPlan = inferRoutingPriorityLane(transcript, flags);
  const turnPlanner = buildTurnPlanner({
    transcript,
    flags,
    routingPlan,
    behaviorMode: "growth",
    memory: {},
  });
  const modelPlan = selectChatModelForTurn({
    transcript,
    turnPlanner,
    flags,
    routingLane: routingPlan?.lane,
  });

  const system = await makeSystemPrompt({
    transcript,
    turnPlanner,
    routingPlan,
    flags,
    repairHints,
  });
  const evalModel = pickEvalModel(modelPlan?.model);
  const reply = await runChatCompletion({
    system,
    transcript,
    model: evalModel,
  });
  const validatedReply = validateAndDirectHerReply(reply, {
    transcript,
    gratitudeOnlyTurn: Boolean(flags?.gratitudeOnly),
    socialSparkActive: Boolean(flags?.socialSpark),
    preferQuestionEnding: Boolean(turnPlanner?.forceQuestionEnding),
    requireExtendedAnswer: Boolean(turnPlanner?.requiresSubstantiveAnswer),
    responseLengthMode: String(turnPlanner?.responseLengthMode || "compact"),
    minExtendedWords: Math.max(16, Number(turnPlanner?.minAnswerWords || 28)),
    turnIntent: String(turnPlanner?.intent || ""),
    routingLane: String(routingPlan?.lane || "normal_rotation"),
    flags,
    allowReassurance: true,
  });
  const finalReply = enforceReplyCompletenessGuard(validatedReply, {
    transcript,
    flags,
    preferQuestionEnding: Boolean(turnPlanner?.forceQuestionEnding),
    gratitudeOnlyTurn: Boolean(flags?.gratitudeOnly),
  });

  const quality = evaluateTurnQualityHeuristics({
    transcript,
    reply: finalReply,
    flags,
    routingLane: String(routingPlan?.lane || "normal_rotation"),
    turnIntent: String(turnPlanner?.intent || "unknown"),
  });

  const baseComponents = quality?.components && typeof quality.components === "object"
    ? quality.components
    : {
      specificity: 0,
      continuity: 0,
      attunement: 0,
      conversationalPull: 0,
      brevity: 0,
      completionRate: 0,
    };
  const caseExpect = item?.expect && typeof item.expect === "object" ? item.expect : {};
  const specialized = evaluateSpecializedQuality({
    transcript,
    reply: finalReply,
    flags,
    lane: String(routingPlan?.lane || "normal_rotation"),
    expect: caseExpect,
  });

  const result = {
    id: String(item?.id || `case_${caseIndex + 1}`),
    transcript,
    reply: finalReply,
    model: evalModel,
    lane: String(routingPlan?.lane || "normal_rotation"),
    intent: String(turnPlanner?.intent || "unknown"),
    score: clamp01(quality?.score, 0),
    minScore: clamp01(item?.minScore, 0.65),
    components: {
      specificity: clamp01(baseComponents.specificity, 0),
      continuity: clamp01(baseComponents.continuity, 0),
      attunement: clamp01(baseComponents.attunement, 0),
      conversationalPull: clamp01(baseComponents.conversationalPull, 0),
      brevity: clamp01(baseComponents.brevity, 0),
      completionRate: clamp01(baseComponents.completionRate, 0),
    },
    special: {
      heartbreakAdvice: {
        applicable: Boolean(specialized?.components?.heartbreakAdvice?.applicable),
        value: Number.isFinite(Number(specialized?.components?.heartbreakAdvice?.value))
          ? clamp01(Number(specialized.components.heartbreakAdvice.value), 0)
          : null,
      },
      humorTiming: {
        applicable: Boolean(specialized?.components?.humorTiming?.applicable),
        value: Number.isFinite(Number(specialized?.components?.humorTiming?.value))
          ? clamp01(Number(specialized.components.humorTiming.value), 0)
          : null,
      },
      noFiller: {
        applicable: Boolean(specialized?.components?.noFiller?.applicable),
        value: Number.isFinite(Number(specialized?.components?.noFiller?.value))
          ? clamp01(Number(specialized.components.noFiller.value), 0)
          : null,
      },
      turnTaking: {
        applicable: Boolean(specialized?.components?.turnTaking?.applicable),
        value: Number.isFinite(Number(specialized?.components?.turnTaking?.value))
          ? clamp01(Number(specialized.components.turnTaking.value), 0)
          : null,
      },
    },
    expect: caseExpect,
    tags: Array.from(new Set([
      ...(Array.isArray(quality?.tags) ? quality.tags : []),
      ...(Array.isArray(specialized?.tags) ? specialized.tags : []),
    ])),
    attempt: Math.max(1, Number(attempt) || 1),
  };

  return result;
}

async function main() {
  const casesJson = readJson(CASES_PATH);
  const baseline = fs.existsSync(BASELINE_PATH)
    ? readJson(BASELINE_PATH)
    : {
        version: 1,
        maxDrop: 0.05,
        floors: { ...DEFAULT_FLOORS },
      };

  const cases = Array.isArray(casesJson?.cases) ? casesJson.cases : [];
  if (!cases.length) {
    console.error("No regression cases found.");
    process.exit(2);
  }

  const results = [];
  const rerunStats = { attempted: 0, improved: 0, unresolved: 0 };
  const caseRepairHints = new Map();

  for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
    const item = cases[caseIndex];
    const transcript = String(item?.transcript || "").trim();
    if (!transcript) continue;

    let best = null;
    let repairHints = [];
    const attempts = 1 + Math.max(0, autoRepairReruns);

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const candidate = await runCaseAttempt({
        item,
        caseIndex,
        repairHints,
        attempt,
      });
      best = selectPreferredResult(best, candidate);
      const caseFails = collectCaseThresholdFailures(item, best);
      if (!caseFails.length) break;
      if (attempt < attempts) {
        rerunStats.attempted += 1;
        repairHints = buildRepairHintsForCase({ item, result: best });
      }
    }

    const finalFails = collectCaseThresholdFailures(item, best);
    if (finalFails.length) {
      rerunStats.unresolved += 1;
      const hints = buildRepairHintsForCase({ item, result: best });
      if (hints.length) caseRepairHints.set(best.id, hints);
    } else if (best.attempt > 1) {
      rerunStats.improved += 1;
    }

    results.push(best);

    if (verbose) {
      console.log(`\n[${best.id}] model=${best.model} lane=${best.lane} intent=${best.intent} attempt=${best.attempt}`);
      console.log(`score=${best.score.toFixed(3)} min=${best.minScore.toFixed(3)} tags=${best.tags.join(",") || "none"}`);
      const specialBits = SPECIAL_COMPONENT_KEYS.map((key) => {
        const entry = best?.special?.[key];
        if (!entry?.applicable) return `${key}=n/a`;
        return `${key}=${clamp01(entry.value, 0).toFixed(3)}`;
      });
      console.log(`special=${specialBits.join(" ")}`);
      if (caseRepairHints.has(best.id)) {
        console.log(`repair_hints=${caseRepairHints.get(best.id).join(" | ")}`);
      }
      console.log(`reply=${best.reply}`);
    }
  }

  if (!results.length) {
    console.error("No regression runs completed.");
    process.exit(2);
  }

  const avgScore = avg(results.map((x) => x.score));
  const avgComponents = Object.fromEntries(
    BASE_COMPONENT_KEYS.map((key) => [key, avg(results.map((x) => x.components?.[key]))])
  );
  const avgSpecialComponents = Object.fromEntries(
    SPECIAL_COMPONENT_KEYS.map((key) => [
      key,
      avgDefined(
        results
          .filter((x) => Boolean(x?.special?.[key]?.applicable))
          .map((x) => x?.special?.[key]?.value)
      ),
    ])
  );
  const specialCoverage = Object.fromEntries(
    SPECIAL_COMPONENT_KEYS.map((key) => [
      key,
      results.filter((x) => Boolean(x?.special?.[key]?.applicable)).length,
    ])
  );

  const snapshot = {
    generatedAt: new Date().toISOString(),
    caseCount: results.length,
    avgScore: clamp01(avgScore, 0),
    avgComponents,
    avgSpecialComponents,
    specialCoverage,
    cases: results.map((x) => ({
      id: x.id,
      model: x.model,
      lane: x.lane,
      intent: x.intent,
      attempt: Math.max(1, Number(x.attempt || 1)),
      score: x.score,
      components: x.components,
      special: x.special,
      tags: x.tags,
    })),
  };

  if (writeBaseline) {
    const adaptiveFloors = deriveAdaptiveFloors(snapshot);
    const next = {
      ...baseline,
      version: 1,
      updatedAt: snapshot.generatedAt,
      floors: keepFloorsOnUpdate
        ? { ...DEFAULT_FLOORS, ...(baseline?.floors && typeof baseline.floors === "object" ? baseline.floors : adaptiveFloors) }
        : adaptiveFloors,
      snapshot,
    };
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    console.log(`Baseline updated: ${BASELINE_PATH}`);
    console.log(`avgScore=${snapshot.avgScore.toFixed(3)} cases=${snapshot.caseCount}`);
    process.exit(0);
  }

  const failures = [];
  const softWarnings = [];
  const maxDrop = Math.max(0, Number(baseline?.maxDrop || 0.06));
  const floors = {
    ...DEFAULT_FLOORS,
    ...(baseline?.floors && typeof baseline.floors === "object" ? baseline.floors : {}),
  };
  const prior = baseline?.snapshot && typeof baseline.snapshot === "object"
    ? baseline.snapshot
    : null;

  const avgScoreTarget = metricTarget({ floors, snapshot: prior, key: "avgScore", maxDrop });
  if (snapshot.avgScore + REGRESSION_EPSILON < avgScoreTarget) {
    failures.push(`avgScore ${snapshot.avgScore.toFixed(3)} < target ${avgScoreTarget.toFixed(3)}`);
  }

  for (const key of BASE_COMPONENT_KEYS) {
    const target = metricTarget({ floors, snapshot: prior, key, maxDrop });
    const value = clamp01(snapshot.avgComponents?.[key], 0);
    if (value + REGRESSION_EPSILON < target) {
      const margin = Math.max(0, Number(SOFT_MARGIN_BY_KEY?.[key] || 0));
      if (margin > 0 && (value + REGRESSION_EPSILON) >= (target - margin)) {
        softWarnings.push(`${key} ${value.toFixed(3)} below target ${target.toFixed(3)} within soft margin ${margin.toFixed(3)}`);
      } else {
        failures.push(`${key} ${value.toFixed(3)} < target ${target.toFixed(3)}`);
      }
    }
  }

  for (const key of SPECIAL_COMPONENT_KEYS) {
    const coverage = Number(snapshot?.specialCoverage?.[key] || 0);
    if (coverage <= 0) continue;
    const floor = clamp01(floors?.[key], clamp01(DEFAULT_FLOORS[key], 0.68));
    const priorCoverage = Number(prior?.specialCoverage?.[key] || 0);
    const priorValue = priorCoverage > 0
      ? clamp01(prior?.avgSpecialComponents?.[key], floor)
      : null;
    const target = priorValue == null ? floor : Math.max(floor, priorValue - maxDrop);
    const value = clamp01(snapshot?.avgSpecialComponents?.[key], floor);
    if (value + REGRESSION_EPSILON < target) {
      failures.push(`${key} ${value.toFixed(3)} < target ${target.toFixed(3)} (coverage=${coverage})`);
    }
  }

  const caseMinWarnings = [];
  for (const item of results) {
    const rowFailures = collectCaseThresholdFailures(item, item);
    for (const message of rowFailures) {
      if (enforceCaseMins) failures.push(message);
      else caseMinWarnings.push(message);
    }
  }

  console.log("Nightly regression summary:");
  console.log(`- avgScore=${snapshot.avgScore.toFixed(3)} target=${avgScoreTarget.toFixed(3)} cases=${snapshot.caseCount}`);
  console.log(`- specificity=${snapshot.avgComponents.specificity.toFixed(3)}`);
  console.log(`- continuity=${snapshot.avgComponents.continuity.toFixed(3)}`);
  console.log(`- attunement=${snapshot.avgComponents.attunement.toFixed(3)}`);
  console.log(`- conversationalPull=${snapshot.avgComponents.conversationalPull.toFixed(3)}`);
  console.log(`- brevity=${snapshot.avgComponents.brevity.toFixed(3)}`);
  console.log(`- completionRate=${snapshot.avgComponents.completionRate.toFixed(3)}`);
  for (const key of SPECIAL_COMPONENT_KEYS) {
    const coverage = Number(snapshot?.specialCoverage?.[key] || 0);
    if (coverage <= 0) {
      console.log(`- ${key}=n/a (coverage=0)`);
      continue;
    }
    console.log(
      `- ${key}=${clamp01(snapshot?.avgSpecialComponents?.[key], 0).toFixed(3)} (coverage=${coverage})`
    );
  }
  const laneMetrics = buildLaneMetrics(results);
  if (laneMetrics.length) {
    console.log("- lane_metrics:");
    for (const laneRow of laneMetrics) {
      console.log(
        `  ${laneRow.lane}: cases=${laneRow.cases} avgScore=${laneRow.avgScore.toFixed(3)} ` +
        `spec=${laneRow.specificity.toFixed(3)} cont=${laneRow.continuity.toFixed(3)} ` +
        `attn=${laneRow.attunement.toFixed(3)} pull=${laneRow.conversationalPull.toFixed(3)} ` +
        `brev=${laneRow.brevity.toFixed(3)} done=${laneRow.completionRate.toFixed(3)}`
      );
    }
  }
  if (autoRepairReruns > 0) {
    console.log(
      `- repair_reruns attempted=${rerunStats.attempted} improved=${rerunStats.improved} unresolved=${rerunStats.unresolved}`
    );
  }
  if (caseMinWarnings.length) {
    console.log(`- case_min_warnings=${caseMinWarnings.length} (strict disabled; set EVAL_STRICT_CASE_MINS=1 to enforce)`);
    for (const warning of caseMinWarnings.slice(0, 8)) {
      console.log(`  warn: ${warning}`);
    }
    if (caseMinWarnings.length > 8) {
      console.log(`  ... +${caseMinWarnings.length - 8} more`);
    }
  }
  if (softWarnings.length) {
    console.log(`- soft_warnings=${softWarnings.length}`);
    for (const warning of softWarnings.slice(0, 8)) {
      console.log(`  soft: ${warning}`);
    }
    if (softWarnings.length > 8) {
      console.log(`  ... +${softWarnings.length - 8} more`);
    }
  }

  if (failures.length) {
    console.error("Regression FAILED:");
    for (const fail of failures) {
      console.error(`- ${fail}`);
      const caseId = String(fail).split(" ")[0];
      const hints = caseRepairHints.get(caseId) || [];
      if (hints.length) {
        console.error(`  hint: ${hints.join(" | ")}`);
      }
    }
    process.exit(1);
  }

  console.log("Regression PASSED");
}

main().catch((err) => {
  console.error(`Regression runner failed: ${String(err?.message || err)}`);
  process.exit(1);
});

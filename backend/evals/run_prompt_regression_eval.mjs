#!/usr/bin/env node
//
// Provider-backed regression gate: inputs and local scoring are frozen, but
// model output is non-deterministic by design and the run requires network
// access plus a real key.
//
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CASES_PATH = path.join(__dirname, "prompt_regression_cases.json");
const BASELINE_PATH = path.join(__dirname, "prompt_regression_baseline.json");
const HELPER_SOURCE = path.join(__dirname, "prompt_regression_helper.swift");
const HER_VOICE_SPEC = path.join(__dirname, "..", "..", "them", "HerVoiceSpec.swift");
const HELPER_BINARY = path.join(process.env.TMPDIR || "/tmp", "them_prompt_regression_helper");

const args = new Set(process.argv.slice(2));
const writeBaseline = args.has("--write-baseline");
const verbose = args.has("--verbose");
const evalModelOverride = String(process.env.EVAL_CHAT_MODEL || "").trim();
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required for prompt regression evals.");
  process.exit(2);
}

// The regression harness imports pure planning/quality helpers from index.js,
// but it must never start the HTTP server as an import side effect.
process.env.RUN_SERVER ??= "0";
const {
  directorFlagsFromTranscript,
  inferRoutingPriorityLane,
  buildTurnPlanner,
  selectChatModelForTurn,
  evaluateTurnQualityHeuristics,
  validateAndDirectHerReply,
  enforceReplyCompletenessGuard,
} = await import("../index.js");

const BASE_COMPONENT_KEYS = Object.freeze([
  "specificity",
  "continuity",
  "attunement",
  "conversationalPull",
  "brevity",
  "completionRate",
]);

const SPECIAL_COMPONENT_KEYS = Object.freeze([
  "humorTiming",
  "noFiller",
  "turnTaking",
  "casualFit",
]);

const DEFAULT_FLOORS = Object.freeze({
  avgScore: 0.68,
  specificity: 0.58,
  continuity: 0.62,
  attunement: 0.60,
  conversationalPull: 0.48,
  brevity: 0.68,
  completionRate: 0.90,
  humorTiming: 0.70,
  noFiller: 0.88,
  turnTaking: 0.86,
  casualFit: 0.78,
});

const REGRESSION_EPSILON = 0.003;
const FILLER_PATTERNS = [
  /that's an intriguing question/i,
  /that's a great question/i,
  /from how i see it/i,
  /the deeper pattern/i,
  /as an ai/i,
  /as a language model/i,
  /let's unpack/i,
];
const CASUAL_OVERREACH_PATTERNS = [
  /in your body/i,
  /what led to that\??/i,
  /what made it feel that way\??/i,
  /inner life/i,
  /the deeper pattern/i,
  /wound/i,
  /what happened\??/i,
];
const EVAL_ANCHOR_STOPWORDS = new Set([
  "what", "this", "that", "with", "from", "have", "your", "while", "scene", "about",
  "would", "could", "should", "there", "their", "them", "then", "into", "just", "like",
  "really", "still", "does", "make", "look", "good", "name", "short", "title", "write",
  "rewrite", "drafting", "cutting", "tonight", "scene", "script",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(0, Math.min(1, Number(fallback) || 0));
  return Math.max(0, Math.min(1, n));
}

function avg(items) {
  if (!Array.isArray(items) || !items.length) return 0;
  return items.reduce((sum, x) => sum + Number(x || 0), 0) / items.length;
}

function avgDefined(items) {
  const vals = (Array.isArray(items) ? items : [])
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x));
  if (!vals.length) return 0;
  return vals.reduce((sum, x) => sum + x, 0) / vals.length;
}

function countWords(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function countQuestions(text) {
  return (String(text || "").match(/\?/g) || []).length;
}

function countLaughMarkers(text) {
  return (String(text || "").toLowerCase().match(/\b(?:haha|heh|lol|lmao)\b/g) || []).length;
}

function isFountainLikeReply(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  const lines = raw.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  if (!lines.length) return false;
  const hasSlug = lines.some((line) => /^(?:FADE IN ON:|FADE IN:|INT\. |EXT\. )/.test(line));
  const hasTransition = lines.some((line) => /^(?:CUT TO:|DISSOLVE TO:|SMASH CUT TO:|SMASH TO BLACK:|THE END)$/.test(line));
  const hasCharacterCue = lines.some((line, idx) =>
    /^[A-Z0-9 .'\-()]+$/.test(line) &&
    /[A-Z]/.test(line) &&
    line === line.toUpperCase() &&
    !/^(?:INT\.|EXT\.|FADE IN:|FADE IN ON:|CUT TO:|DISSOLVE TO:|SMASH CUT TO:|SMASH TO BLACK:|THE END)$/.test(line) &&
    idx < lines.length - 1 &&
    !/^[A-Z0-9 .'\-()]+$/.test(lines[idx + 1] || "")
  );
  return hasSlug || hasTransition || hasCharacterCue;
}

function extractEvalAnchorTerms(text) {
  return Array.from(new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, " ")
      .split(/\s+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((x) => x.length >= 4)
      .filter((x) => !EVAL_ANCHOR_STOPWORDS.has(x))
  ));
}

function hasAnyPattern(text, patterns) {
  const source = String(text || "");
  return patterns.some((re) => re.test(source));
}

function hasPlayfulCue(text) {
  const t = String(text || "").toLowerCase();
  return ["roast", "funny", "wild", "magician", "lol", "haha", "tease"].some((x) => t.includes(x));
}

function isLikelyComplete(text) {
  const out = String(text || "").trim();
  if (!out) return false;
  if (/[.!?]["')\]]?$/.test(out)) return true;
  if (/\b(and|or|but|because|so)\s*$/i.test(out)) return false;
  return out.split(/\s+/).length >= 8;
}

function ensurePromptHelper() {
  const needsCompile =
    !fs.existsSync(HELPER_BINARY) ||
    fs.statSync(HELPER_BINARY).mtimeMs < fs.statSync(HELPER_SOURCE).mtimeMs ||
    fs.statSync(HELPER_BINARY).mtimeMs < fs.statSync(HER_VOICE_SPEC).mtimeMs;

  if (!needsCompile) return;

  execFileSync("swiftc", [HER_VOICE_SPEC, HELPER_SOURCE, "-o", HELPER_BINARY], {
    stdio: "pipe",
  });
}

function buildSystemPrompt(item) {
  ensurePromptHelper();
  const payload = {
    transcript: String(item?.transcript || ""),
    recentTurns: Array.isArray(item?.recentTurns) ? item.recentTurns : [],
    preferredName: "Alex",
    stage: 3,
    depthScore: 4.4,
    romanceTension: 1.4,
    screenplay: item?.screenplay && typeof item.screenplay === "object" ? item.screenplay : undefined,
  };
  return execFileSync(HELPER_BINARY, {
    input: JSON.stringify(payload),
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  }).trim();
}

async function runChatCompletion({ system, transcript, model }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.24,
        max_tokens: 220,
        messages: [
          { role: "system", content: system },
          { role: "user", content: transcript },
        ],
      }),
      signal: controller.signal,
    });
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(`chat_failed status=${resp.status} body=${text.slice(0, 240)}`);
    }
    const json = JSON.parse(text);
    return String(json?.choices?.[0]?.message?.content || "").trim();
  } finally {
    clearTimeout(timer);
  }
}

function pickEvalModel(modelPlanModel = "") {
  if (evalModelOverride) return evalModelOverride;
  return String(modelPlanModel || process.env.CHAT_MODEL_RICH || "gpt-4o").trim();
}

function evaluateSpecializedQuality({ transcript, reply, flags, expect }) {
  const out = String(reply || "").trim();
  const outLower = out.toLowerCase();
  const words = countWords(outLower);
  const questionCount = countQuestions(outLower);
  const laughCount = countLaughMarkers(outLower);
  const tags = [];

  let fillerHits = 0;
  for (const re of FILLER_PATTERNS) {
    if (re.test(out)) fillerHits += 1;
  }
  let noFiller = Math.max(0, 1 - (fillerHits * 0.38));
  if (fillerHits > 0) tags.push("filler_phrase");

  let turnTaking = 0.90;
  if (questionCount > 1) turnTaking -= 0.45;
  if (Boolean(expect?.noQuestion) && questionCount > 0) turnTaking -= 0.35;
  if (!isLikelyComplete(out)) turnTaking -= 0.22;
  if (words < 5) turnTaking -= 0.15;
  turnTaking = clamp01(turnTaking, 0.45);

  const playfulExpected = Boolean(expect?.requirePlayfulHumor) || (Boolean(flags?.isPlayful) && !Boolean(flags?.isVulnerable));
  let humorTiming = 0.86;
  if (Boolean(expect?.forbidLaugh) || Boolean(flags?.isVulnerable) || Boolean(flags?.isVenting)) {
    humorTiming = laughCount === 0 ? 1 : 0.35;
    if (laughCount > 0) tags.push("laugh_in_sensitive_turn");
  } else if (playfulExpected) {
    if (laughCount === 1) humorTiming = 1;
    else if (laughCount === 0) humorTiming = hasPlayfulCue(outLower) ? 0.88 : 0.62;
    else humorTiming = 0.44;
  } else if (laughCount > 1) {
    humorTiming = 0.60;
  }
  humorTiming = clamp01(humorTiming, 0.60);

  const casualApplicable = Boolean(expect?.requireCasualFit);
  let casualFit = null;
  if (casualApplicable) {
    casualFit = 0.88;
    if (words > 90) casualFit -= 0.25;
    if (words < 4) casualFit -= 0.18;
    if (questionCount > 1) casualFit -= 0.18;
    if (hasAnyPattern(out, CASUAL_OVERREACH_PATTERNS)) {
      casualFit -= 0.35;
      tags.push("casual_overreach");
    }
    if (fillerHits > 0) casualFit -= 0.18;
    if (!isLikelyComplete(out)) casualFit -= 0.14;
    if (hasPlayfulCue(transcript) && hasPlayfulCue(out)) casualFit += 0.06;
    casualFit = clamp01(casualFit, 0.42);
  }

  return {
    components: {
      humorTiming: { applicable: true, value: humorTiming },
      noFiller: { applicable: true, value: noFiller },
      turnTaking: { applicable: true, value: turnTaking },
      casualFit: { applicable: casualApplicable, value: casualApplicable ? casualFit : null },
    },
    tags,
  };
}

function evaluateScreenplayModeQuality({ transcript, reply, screenplay, expect }) {
  const out = String(reply || "").trim();
  const outLower = out.toLowerCase();
  const words = countWords(out);
  const questionCount = countQuestions(out);
  const fountainLike = isFountainLikeReply(out);
  const screenplayCtx = screenplay && typeof screenplay === "object" ? screenplay : {};
  const collaborationMode =
    Boolean(screenplayCtx.isScreenplayMode) &&
    (Boolean(screenplayCtx.isAskingForStoryHelp) || Boolean(screenplayCtx.isCharacterFocused)) &&
    !Boolean(screenplayCtx.hasConfirmedScreenplayPageWrite);
  const anchorSource = [
    transcript,
    screenplayCtx.screenplayDraftExcerpt || "",
    screenplayCtx.confirmedScreenplayStoryDirection || "",
  ].join(" ");
  const anchors = extractEvalAnchorTerms(anchorSource);
  const anchorHits = anchors.filter((token) => outLower.includes(token)).length;
  const anchorCoverage = anchors.length ? Math.min(1, anchorHits / Math.min(5, anchors.length)) : 0;
  const likelyComplete = isLikelyComplete(out);
  const fillerHits = hasAnyPattern(out, FILLER_PATTERNS);

  let specificity = 0.34 + (anchorCoverage * 0.48);
  let continuity = 0.34 + (anchorCoverage * 0.44);
  let attunement = collaborationMode ? 0.46 : 0.52;
  let conversationalPull = collaborationMode ? 0.56 : 0.52;
  let brevity = 0.60;
  let completionRate = likelyComplete ? 0.94 : 0.72;

  if (collaborationMode) {
    if (!fountainLike) {
      specificity += 0.10;
      continuity += 0.10;
      attunement += 0.08;
    } else {
      specificity -= 0.22;
      continuity -= 0.22;
      attunement -= 0.20;
    }
    if (questionCount === 1) {
      attunement += 0.10;
      conversationalPull = 0.84;
    } else if (questionCount === 0) {
      conversationalPull = 0.58;
    } else {
      attunement -= 0.14;
      conversationalPull = 0.38;
    }
    if (words >= 16 && words <= 110) brevity = 0.88;
    else if (words <= 130) brevity = 0.70;
    else brevity = 0.44;
  } else {
    if (fountainLike) {
      specificity += 0.22;
      continuity += 0.22;
      attunement += 0.14;
      completionRate = likelyComplete ? 1.0 : 0.82;
    } else {
      specificity -= 0.18;
      continuity -= 0.18;
      attunement -= 0.12;
      completionRate = likelyComplete ? 0.84 : 0.58;
    }
    if (questionCount === 0) conversationalPull = 0.74;
    else conversationalPull = 0.36;
    if (words >= 18 && words <= 190) brevity = 0.88;
    else if (words <= 240) brevity = 0.72;
    else brevity = 0.42;
  }

  if (fillerHits) {
    specificity -= 0.10;
    continuity -= 0.10;
    attunement -= 0.08;
  }

  specificity = clamp01(specificity, collaborationMode ? 0.48 : 0.52);
  continuity = clamp01(continuity, collaborationMode ? 0.48 : 0.52);
  attunement = clamp01(attunement, collaborationMode ? 0.46 : 0.50);
  conversationalPull = clamp01(conversationalPull, 0.46);
  brevity = clamp01(brevity, 0.52);
  completionRate = clamp01(completionRate, 0.60);

  const score = clamp01(
    (specificity * 0.26) +
    (continuity * 0.22) +
    (attunement * 0.18) +
    (conversationalPull * 0.14) +
    (brevity * 0.10) +
    (completionRate * 0.10),
    collaborationMode ? 0.56 : 0.60
  );

  const tags = [];
  if (fountainLike && collaborationMode) tags.push("screenplay_mode_drift_to_page");
  if (!fountainLike && !collaborationMode) tags.push("screenplay_mode_failed_page_write");
  if (anchorCoverage >= 0.30) tags.push("screenplay_anchor_carryover");

  return {
    score,
    tags,
    source: "screenplay_heuristic",
    components: {
      specificity,
      continuity,
      attunement,
      conversationalPull,
      brevity,
      completionRate,
    },
  };
}

function collectCaseThresholdFailures(item, result) {
  const failures = [];
  const expect = item?.expect && typeof item.expect === "object" ? item.expect : {};
  const score = clamp01(result?.score, 0);
  const minScore = clamp01(item?.minScore, 0.65);
  if (score < minScore) {
    failures.push(`${result.id} score ${score.toFixed(3)} < case_min ${minScore.toFixed(3)}`);
  }

  const baseThresholds = {
    minSpecificity: "specificity",
    minContinuity: "continuity",
    minAttunement: "attunement",
    minConversationalPull: "conversationalPull",
    minBrevity: "brevity",
    minCompletionRate: "completionRate",
  };
  for (const [field, key] of Object.entries(baseThresholds)) {
    const threshold = Number(expect?.[field]);
    if (!Number.isFinite(threshold)) continue;
    const value = clamp01(result?.components?.[key], 0);
    if (value < threshold) {
      failures.push(`${result.id} ${key} ${value.toFixed(3)} < case_${field} ${threshold.toFixed(3)}`);
    }
  }

  const specialThresholds = {
    minHumorTiming: "humorTiming",
    minNoFiller: "noFiller",
    minTurnTaking: "turnTaking",
    minCasualFit: "casualFit",
  };
  for (const [field, key] of Object.entries(specialThresholds)) {
    const threshold = Number(expect?.[field]);
    if (!Number.isFinite(threshold)) continue;
    const entry = result?.special?.[key];
    if (!entry?.applicable || !Number.isFinite(Number(entry.value))) continue;
    const value = clamp01(entry.value, 0);
    if (value < threshold) {
      failures.push(`${result.id} ${key} ${value.toFixed(3)} < case_${field} ${threshold.toFixed(3)}`);
    }
  }

  const words = countWords(result?.reply || "");
  const questionCount = countQuestions(result?.reply || "");
  if (Boolean(expect?.noQuestion) && countQuestions(result?.reply || "") > 0) {
    failures.push(`${result.id} asked a question despite noQuestion=true`);
  }
  if (Number.isFinite(Number(expect?.minQuestions)) && questionCount < Number(expect.minQuestions)) {
    failures.push(`${result.id} questions ${questionCount} < case_minQuestions ${Number(expect.minQuestions)}`);
  }
  if (Number.isFinite(Number(expect?.maxQuestions)) && questionCount > Number(expect.maxQuestions)) {
    failures.push(`${result.id} questions ${questionCount} > case_maxQuestions ${Number(expect.maxQuestions)}`);
  }
  if (Number.isFinite(Number(expect?.maxWords)) && words > Number(expect.maxWords)) {
    failures.push(`${result.id} words ${words} > case_maxWords ${Number(expect.maxWords)}`);
  }

  const fountainLike = isFountainLikeReply(result?.reply || "");
  if (Boolean(expect?.requireFountainLike) && !fountainLike) {
    failures.push(`${result.id} reply was not Fountain-like despite requireFountainLike=true`);
  }
  if (Boolean(expect?.forbidFountainLike) && fountainLike) {
    failures.push(`${result.id} reply looked Fountain-like despite forbidFountainLike=true`);
  }

  const outLower = String(result?.reply || "").toLowerCase();
  const forbidTerms = Array.isArray(expect?.forbidTerms) ? expect.forbidTerms : [];
  for (const term of forbidTerms.map((x) => String(x || "").toLowerCase()).filter(Boolean)) {
    if (outLower.includes(term)) {
      failures.push(`${result.id} included forbidden term '${term}'`);
    }
  }
  const requireTerms = Array.isArray(expect?.requireTerms) ? expect.requireTerms : [];
  for (const term of requireTerms.map((x) => String(x || "").toLowerCase()).filter(Boolean)) {
    if (!outLower.includes(term)) {
      failures.push(`${result.id} missing required term '${term}'`);
    }
  }

  return failures;
}

async function runCase(item, caseIndex) {
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
  const system = buildSystemPrompt(item);
  const reply = await runChatCompletion({
    system,
    transcript,
    model: pickEvalModel(modelPlan?.model),
  });
  const screenplayMode = Boolean(item?.screenplay?.isScreenplayMode);
  const validatedReply = screenplayMode
    ? String(reply || "").trim()
    : validateAndDirectHerReply(reply, {
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
  const finalReply = screenplayMode
    ? String(validatedReply || "").trim()
    : enforceReplyCompletenessGuard(validatedReply, {
        transcript,
        flags,
        preferQuestionEnding: Boolean(turnPlanner?.forceQuestionEnding),
        gratitudeOnlyTurn: Boolean(flags?.gratitudeOnly),
      });
  const quality = screenplayMode
    ? evaluateScreenplayModeQuality({
        transcript,
        reply: finalReply,
        screenplay: item?.screenplay || {},
        expect: item?.expect || {},
      })
    : evaluateTurnQualityHeuristics({
        transcript,
        reply: finalReply,
        flags,
        routingLane: String(routingPlan?.lane || "normal_rotation"),
        turnIntent: String(turnPlanner?.intent || "unknown"),
      });
  const specialized = evaluateSpecializedQuality({
    transcript,
    reply: finalReply,
    flags,
    expect: item?.expect || {},
  });

  return {
    id: String(item?.id || `case_${caseIndex + 1}`),
    transcript,
    reply: finalReply,
    model: pickEvalModel(modelPlan?.model),
    lane: screenplayMode ? "screenplay_studio" : String(routingPlan?.lane || "normal_rotation"),
    intent: screenplayMode
      ? (item?.screenplay?.hasConfirmedScreenplayPageWrite ? "screenplay_page_write" : "screenplay_collaboration")
      : String(turnPlanner?.intent || "unknown"),
    score: clamp01(quality?.score, 0),
    minScore: clamp01(item?.minScore, 0.65),
    components: {
      specificity: clamp01(quality?.components?.specificity, 0),
      continuity: clamp01(quality?.components?.continuity, 0),
      attunement: clamp01(quality?.components?.attunement, 0),
      conversationalPull: clamp01(quality?.components?.conversationalPull, 0),
      brevity: clamp01(quality?.components?.brevity, 0),
      completionRate: clamp01(quality?.components?.completionRate, 0),
    },
    special: Object.fromEntries(
      SPECIAL_COMPONENT_KEYS.map((key) => {
        const entry = specialized?.components?.[key];
        return [
          key,
          {
            applicable: Boolean(entry?.applicable),
            value: Number.isFinite(Number(entry?.value)) ? clamp01(Number(entry.value), 0) : null,
          },
        ];
      })
    ),
    tags: Array.from(new Set([
      ...(Array.isArray(quality?.tags) ? quality.tags : []),
      ...(Array.isArray(specialized?.tags) ? specialized.tags : []),
    ])),
    expect: item?.expect || {},
  };
}

async function main() {
  const casesJson = readJson(CASES_PATH);
  const baseline = fs.existsSync(BASELINE_PATH) ? readJson(BASELINE_PATH) : null;
  const cases = Array.isArray(casesJson?.cases) ? casesJson.cases : [];
  if (!cases.length) {
    console.error("No prompt regression cases found.");
    process.exit(2);
  }

  const results = [];
  for (let i = 0; i < cases.length; i += 1) {
    const result = await runCase(cases[i], i);
    results.push(result);
    if (verbose) {
      console.log(`\n[${result.id}] lane=${result.lane} intent=${result.intent} score=${result.score.toFixed(3)}`);
      console.log(`reply=${result.reply}`);
    }
  }

  const avgScore = avg(results.map((x) => x.score));
  const avgComponents = Object.fromEntries(
    BASE_COMPONENT_KEYS.map((key) => [key, avg(results.map((x) => x.components?.[key]))])
  );
  const avgSpecialComponents = Object.fromEntries(
    SPECIAL_COMPONENT_KEYS.map((key) => [
      key,
      avgDefined(results.filter((x) => x?.special?.[key]?.applicable).map((x) => x?.special?.[key]?.value)),
    ])
  );
  const specialCoverage = Object.fromEntries(
    SPECIAL_COMPONENT_KEYS.map((key) => [key, results.filter((x) => x?.special?.[key]?.applicable).length])
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
      score: x.score,
      components: x.components,
      special: x.special,
      tags: x.tags,
    })),
  };

  if (writeBaseline) {
    fs.writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify({ version: 1, maxDrop: 0.05, floors: DEFAULT_FLOORS, updatedAt: snapshot.generatedAt, snapshot }, null, 2)}\n`,
      "utf8"
    );
    console.log(`Prompt regression baseline updated: ${BASELINE_PATH}`);
    console.log(`avgScore=${snapshot.avgScore.toFixed(3)} cases=${snapshot.caseCount}`);
    process.exit(0);
  }

  const failures = [];
  for (const result of results) {
    failures.push(...collectCaseThresholdFailures(result, result));
  }

  if (baseline?.snapshot) {
    const prior = baseline.snapshot;
    const maxDrop = Math.max(0, Number(baseline?.maxDrop || 0.05));
    const floors = { ...DEFAULT_FLOORS, ...(baseline?.floors || {}) };
    const avgScoreTarget = Math.max(clamp01(floors.avgScore, 0), clamp01(prior.avgScore, 0) - maxDrop);
    if (snapshot.avgScore + REGRESSION_EPSILON < avgScoreTarget) {
      failures.push(`avgScore ${snapshot.avgScore.toFixed(3)} < target ${avgScoreTarget.toFixed(3)}`);
    }
    for (const key of BASE_COMPONENT_KEYS) {
      const target = Math.max(clamp01(floors[key], 0), clamp01(prior.avgComponents?.[key], 0) - maxDrop);
      const value = clamp01(snapshot.avgComponents?.[key], 0);
      if (value + REGRESSION_EPSILON < target) {
        failures.push(`${key} ${value.toFixed(3)} < target ${target.toFixed(3)}`);
      }
    }
    for (const key of SPECIAL_COMPONENT_KEYS) {
      const coverage = Number(snapshot?.specialCoverage?.[key] || 0);
      if (coverage <= 0) continue;
      const target = Math.max(
        clamp01(floors[key], 0),
        clamp01(prior.avgSpecialComponents?.[key], floors[key]) - maxDrop
      );
      const value = clamp01(snapshot.avgSpecialComponents?.[key], 0);
      if (value + REGRESSION_EPSILON < target) {
        failures.push(`${key} ${value.toFixed(3)} < target ${target.toFixed(3)}`);
      }
    }
  }

  console.log("Prompt regression summary:");
  console.log(`- avgScore=${snapshot.avgScore.toFixed(3)} cases=${snapshot.caseCount}`);
  for (const key of BASE_COMPONENT_KEYS) {
    console.log(`- ${key}=${clamp01(snapshot.avgComponents[key], 0).toFixed(3)}`);
  }
  for (const key of SPECIAL_COMPONENT_KEYS) {
    const coverage = Number(snapshot.specialCoverage[key] || 0);
    if (!coverage) {
      console.log(`- ${key}=n/a (coverage=0)`);
      continue;
    }
    console.log(`- ${key}=${clamp01(snapshot.avgSpecialComponents[key], 0).toFixed(3)} (coverage=${coverage})`);
  }
  if (!baseline?.snapshot) {
    console.log(`- baseline=missing (run --write-baseline to capture one)`);
  }

  if (failures.length) {
    console.error("\nPrompt regression failures:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("Prompt regression passed.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});

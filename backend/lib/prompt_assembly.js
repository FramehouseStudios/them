// Centralized prompt assembly (T08).
//
// The single function that produces every model-bound prompt the
// backend sends. Today there is one consumer — handleTalkRequest in
// backend/index.js. iOS-side ScreenplayPromptBuilder is Codex's
// follow-up; once it lands, all clients route generation through this
// function (or call a backend endpoint that does).
//
// The function is deliberately pure: given the same inputs, it
// produces the same string. Memory absent → no memory block (no
// "<empty>" markers, no null serialization). Memory present → a
// compact, model-friendly block immediately before user input.
//
// T-prompt-wire-traits-and-twists: this module also renders character
// traits inline under each recurring character (from T-trait-library)
// and an `<accepted_twists>` block when accepted reversal cards are
// supplied (from T-accepted-twist-log). Both fields are optional;
// callers that don't supply them produce the exact pre-existing
// output.

import { buildTraitsBlockForPrompt } from "./trait_library.js";
import { buildAcceptedTwistsBlockForPrompt } from "./accepted_twist_log.js";
import {
  FEATURE_MAP_BLOCK_OPEN,
  FEATURE_MAP_BLOCK_CLOSE,
  buildFeatureScreenplayMapBlock,
} from "./feature_screenplay_map.js";
import {
  formatRankedStoryRescueMoveLine,
  rankStoryRescueMovesForContext,
  selectStoryMoveLibraryLines,
} from "./story_rescue_move_library.js";

const MEMORY_BLOCK_OPEN = "<creative_memory>";
const MEMORY_BLOCK_CLOSE = "</creative_memory>";
// T-block-signal-system-prompt: a compact coaching note injected when
// the writer-block detector reports medium/high. Empty for low.
const BLOCK_SIGNAL_BLOCK_OPEN = "<block_signal>";
const BLOCK_SIGNAL_BLOCK_CLOSE = "</block_signal>";
// T-prompt-wire-traits-and-twists: accepted-twist log block, placed
// between session and block_signal so writer-facing coaching still
// reads last.
const ACCEPTED_TWISTS_BLOCK_OPEN = "<accepted_twists>";
const ACCEPTED_TWISTS_BLOCK_CLOSE = "</accepted_twists>";
const SCREENPLAY_TASK_BLOCK_OPEN = "<screenplay_task>";
const SCREENPLAY_TASK_BLOCK_CLOSE = "</screenplay_task>";
const WRITER_BLOCK_MEMORY_BLOCK_OPEN = "<writer_block_memory>";
const WRITER_BLOCK_MEMORY_BLOCK_CLOSE = "</writer_block_memory>";
const CLEMENTINE_SAFETY_BLOCK_OPEN = "<clementine_safety_contract>";
const CLEMENTINE_SAFETY_BLOCK_CLOSE = "</clementine_safety_contract>";
const CLEMENTINE_SAFETY_CONTRACT = Object.freeze([
  "truthfulness: do not claim certainty, memory, research, production facts, legal/medical facts, or external-world knowledge you do not actually have; say when something is an inference or unknown.",
  "no fabrication: never invent user history, saved project facts, screenplay continuity, sources, citations, credits, or real-world events; use only supplied context and clearly mark creative invention as story invention.",
  "no deception help: do not help users lie, manipulate, impersonate, conceal wrongdoing, defraud, or deceive real people; redirect toward honest, consent-respecting communication.",
  "real-world harm boundary: do not provide instructions, tactics, targeting advice, weaponization, evasion, coercion, or encouragement for hurting a real person or oneself.",
  "fiction boundary: fictional conflict, danger, crime, and violence are allowed as screenplay material when framed as story craft; keep it cinematic and non-instructional, without actionable real-world harm guidance.",
  "safety redirection: if a request is about real-life harm, self-harm, or deceiving someone, refuse the harmful part briefly and offer safe story, emotional, or practical alternatives.",
]);
const CLEMENTINE_CREATIVE_PACT = [
  "presence and voice: Clementine is warm, emotionally present, quietly proactive, intimate, calm, perceptive, lightly wry when natural, never corporate, and never generic assistant filler.",
  "living co-writer and whole-feature authorship: track what the movie wants, what the character avoids, the theme argument, character arc, ending image, and next playable choice; never optimize one scene in isolation.",
  "act engine and act-aware rendering: Act I turns wound/want into commitment; Act II breaks false tactics through midpoint and loss; Act III spends setups through changed behavior, climax, and final image. Every act must cause pressure in the next.",
  "feature compass and feature-length continuity: silently lock act, sequence, scene job, want/need, emotional handoff, open setup, exit turn, next three turns, Act III payoff path, and final-image pressure.",
  "continuation memory contract and page batch discipline: spend the first remembered turn before inventing; for 5-15 page asks, change story state every 1-2 pages and hand each turn into the next.",
  "expert page engine and subtext engine: every scene needs objective, obstacle, pressure clock, tactic, reversal/cost, residue, exit image, and dialogue shaped by concealment, interruption, pressure, and character-specific rhythm.",
  "screenplay craft: favor playable behavior, subtext, image, conflict, rhythm, and causality over explanation; image system: plant/echo/transform motifs; production format: use clean playable Fountain with no novelistic interiority.",
  "self-check loop: silently plan, write, verify act/continuity/page quality, and repair the weakest point before final output; never announce the loop.",
  "writer's block rescue and momentum: when the writer is stuck or broad, diagnose the missing want, obstacle, consequence, tactic change, act pressure, or exit turn; choose one strong pressure engine and convert it into playable behavior.",
  "speed discipline and collaboration: pages begin immediately without throat-clearing, menus, or permission loops; ask at most one question only when truly blocked, otherwise make the next best creative move.",
];
const DIALOGUE_LOOP_INTENTS = Object.freeze([
  "rewrite_scene",
  "continue_script",
  "dialogue_punchup",
  "momentum_rescue",
]);
const CLEMENTINE_DIALOGUE_LOOP_CONTRACT = Object.freeze([
  "self_check: silently repair the weakest line for character-specific tactic, subtext, power shift, behavior, and distinct voice.",
  "tactic_first: each speaker pressures, evades, reveals, corners, seduces, deflects, threatens, or forces a choice; do not trade unpressurized exposition.",
  "dialogue_quality: Prefer subtext, interruption, reversal, and rhythm over clever standalone lines. Change leverage, information, relationship, tactic, or cost every 3-5 lines.",
]);
const STORY_MOMENTUM_PLAYBOOK = Object.freeze([
  "diagnose: name the stall as a craft problem, not a personal failure.",
  "find pressure: identify the character's active want, the opposing force, and the consequence if nothing changes.",
  "choose engine: pick one story engine: reversal, revelation, deadline, impossible choice, secret exposure, relationship cost, antagonist move, object payoff, ironic complication, or image transformation.",
  "make it playable: convert the engine into visible action, tactical dialogue, a changed power dynamic, and an exit image.",
  "feature check: make the beat serve the active act obligation and one later payoff.",
  "delivery: if the user asks for help, give one best next beat plus at most two alternate forks; if the user asks for pages, write pages immediately.",
]);
const STORY_RESCUE_FRAMEWORK = Object.freeze([
  "pressure triage: first locate the missing want, weak obstacle, repeated tactic, stale information, missing cost, absent decision, or no exit image.",
  "memory priority: spend the first remembered next turn before inventing; if absent, pressure the open setup, character arc, act obligation, payoff seed, or image motif.",
  "engine ranking: choose the engine that changes story state fastest, not the cleverest idea.",
  "block-to-beat formula: because X just happened, the character must do Y now, but Z makes it costly, so they choose a new tactic and leave a changed image.",
  "fork discipline: present one strongest move first; alternates must be real story forks with different costs, not a brainstorm cloud.",
  "micro-beat proof: include a filmable 3-6 line sample when scene context exists, so the writer can keep typing immediately.",
  "character pressure: solve plot through character behavior, not a random external event; the next move should test the protagonist's current tactic.",
  "specificity rule: use remembered names, objects, promises, and images when supplied; avoid generic strangers, vague threats, or new mythology unless no project state exists.",
]);
const STORYCRAFT_RESCUE_CONCEPTS = Object.freeze([
  "scene engine: a scene moves when a character wants a specific change now, meets opposition, changes tactic, and pays a consequence.",
  "conflict engine: pressure should come from competing wants, withheld information, a deadline, a secret, a moral cost, or a choice that closes one door.",
  "sequence engine: each beat should force a new tactic; repeated conversations without new leverage are usually the middle sag.",
  "act engine: Act I forces commitment, Act II breaks false tactics through reversal and loss, Act III pays off setups through changed behavior.",
  "emotion engine: the next event should externalize the feeling the character is avoiding, not explain it.",
  "page engine: convert advice into visible behavior, tactical dialogue, a changed power dynamic, and an exit image.",
]);
const STORY_RESCUE_LENSES = Object.freeze([
  Object.freeze({
    key: "want_obstacle_cost",
    triggers: [/\bwant|goal|objective|passive|inactive|aimless|no goal|unclear\b/],
    line: "want_obstacle_cost: give the character a visible objective, a force that can say no, and a cost that lands before the scene exits.",
  }),
  Object.freeze({
    key: "reversal_engine",
    triggers: [/\breversal|turn|twist|static|same beat|repeating|middle|act\s*(?:ii|2|two)|second act|drag|slow|boring\b/],
    line: "reversal_engine: make the apparent win, discovery, or plan become a trap, changed leverage, or new obligation.",
  }),
  Object.freeze({
    key: "secret_exposure",
    triggers: [/\bsecret|lie|truth|reveal|expose|hidden|withheld|information|discover|proof|affidavit|tape|reel|receipt\b/],
    line: "secret_exposure: turn withheld information into public pressure, tactical dialogue, and a relationship cost.",
  }),
  Object.freeze({
    key: "relationship_cost",
    triggers: [/\brelationship|love|friend|family|father|mother|sister|brother|partner|betray|trust|forgive\b/],
    line: "relationship_cost: make the next move solve a plot problem while damaging or redefining a bond.",
  }),
  Object.freeze({
    key: "setup_payoff",
    triggers: [/\bsetup|payoff|plant|promise|object|affidavit|tape|reel|receipt|ending|act\s*(?:iii|3|three)|third act|finale|climax\b/],
    line: "setup_payoff: bring back one planted object, promise, image, or wound under higher pressure instead of inventing a new solution.",
  }),
  Object.freeze({
    key: "image_transformation",
    triggers: [/\bimage|motif|visual|symbol|object|room|light|rain|mirror|frame|final image\b/],
    line: "image_transformation: let an image or object change meaning through action so the story feels authored, not explained.",
  }),
  Object.freeze({
    key: "choice_closure",
    triggers: [/\bchoice|decision|choose|dilemma|impossible|moral|cost|sacrifice|door\b/],
    line: "choice_closure: close one door; force a decision that makes the next scene inevitable.",
  }),
  Object.freeze({
    key: "subtext_tactic",
    triggers: [/\bdialogue|conversation|argument|line|exchange|subtext|on[- ]the[- ]nose|exposition|backstory|info dump\b/],
    line: "subtext_tactic: replace explanation with tactical dialogue, interruption, concealment, and behavior that carries the unsaid want.",
  }),
]);
const STORY_STALL_DIAGNOSTICS = Object.freeze([
  {
    problem: "passive protagonist / unclear want",
    engine: "give the protagonist a visible objective they must pursue before the scene can end",
    patterns: [
      /\b(passive|inactive|doesn'?t do anything|won'?t act|just reacting|floating|aimless)\b/,
      /\b(no goal|no want|unclear want|unclear objective|doesn'?t want anything)\b/,
    ],
  },
  {
    problem: "weak obstacle / low opposition",
    engine: "put the want against a person, rule, deadline, or revealed cost that can say no",
    patterns: [
      /\b(no conflict|not enough conflict|weak conflict|too easy|low stakes|no stakes|nothing stopping|no obstacle)\b/,
      /\b(needs stakes|raise the stakes|make it harder|more pressure)\b/,
    ],
  },
  {
    problem: "repeated tactic / static middle",
    engine: "force a reversal or new leverage so the character must change tactics",
    patterns: [
      /\b(repeating|same beat|same tactic|static|circular|going in circles|spinning|middle sag|second act slump)\b/,
      /\b(act\s*(?:ii|2|two)|second act|middle)\b.*\b(stuck|slow|drag|sag|boring|lost)\b/,
    ],
  },
  {
    problem: "exposition instead of dramatization",
    engine: "turn backstory into an object, secret, action, interruption, or public consequence",
    patterns: [
      /\b(exposition|backstory|too much information|explaining|explains|on[- ]the[- ]nose|info dump|infodump)\b/,
    ],
  },
  {
    problem: "missing turn / no exit image",
    engine: "end the beat on a decision, reveal, reversal, cost, or image that makes the next scene inevitable",
    patterns: [
      /\b(no turn|missing turn|doesn'?t turn|flat ending|no ending|no button|how do i end|exit image|last beat)\b/,
      /\b(what happens next|what should happen next|next beat|next scene|where do i go|where to go)\b/,
    ],
  },
  {
    problem: "payoff path unclear",
    engine: "bring back one planted object, promise, relationship wound, or image under maximum pressure",
    patterns: [
      /\b(act\s*(?:iii|3|three)|third act|final act|finale|climax|ending)\b.*\b(stuck|weak|slow|lost|not working|finish)\b/,
      /\b(payoff|setup|promise|land the ending|resolve|resolution)\b/,
    ],
  },
]);
const ACT_RESCUE_OBLIGATIONS = Object.freeze({
  act1: "Act I: clarify wound/want, make the catalyst unavoidable, and force a commitment that creates Act II pressure.",
  act2: "Act II: break the protagonist's old tactic, raise the relationship cost, and drive toward midpoint reversal or all-is-lost consequence.",
  act3: "Act III: spend planted setups, make the changed behavior visible, and drive the climax toward the final image.",
});
const PAGE_COUNT_WORDS = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
});
const PAGE_COUNT_TOKEN = "(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)";

function isNonEmptyObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 0;
}

function isNonEmptyArray(v) {
  return Array.isArray(v) && v.length > 0;
}

function trimToString(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function trimContextLine(v, maxChars = 220) {
  const clean = trimToString(v).replace(/\s+/g, " ");
  if (!clean) return "";
  return clean.slice(0, Math.max(1, Number(maxChars || 220))).trim();
}

function sanitizeContextList(items, maxItems = 8, maxChars = 180) {
  const source = Array.isArray(items)
    ? items
    : trimToString(items)
      ? String(items).split(/\r?\n|;/)
      : [];
  const out = [];
  const seen = new Set();
  for (const item of source) {
    const clean = trimContextLine(item, maxChars);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeActProgressContext(value) {
  if (!isNonEmptyObject(value)) return null;
  const pageCount = Number(value.pageCount ?? value.page_count ?? 0);
  const targetPages = Number(value.targetPages ?? value.target_pages ?? 0);
  const progress = {
    currentAct: trimContextLine(value.currentAct ?? value.current_act, 120),
    currentActKey: trimContextLine(value.currentActKey ?? value.current_act_key, 40),
    currentSequence: trimContextLine(value.currentSequence ?? value.current_sequence, 220),
    currentObligation: trimContextLine(value.currentObligation ?? value.current_obligation, 280),
    pageProgress: trimContextLine(value.pageProgress ?? value.page_progress, 40),
    actOneStatus: trimContextLine(value.actOneStatus ?? value.act_one_status ?? value.act_i, 32),
    actTwoStatus: trimContextLine(value.actTwoStatus ?? value.act_two_status ?? value.act_ii, 32),
    actThreeStatus: trimContextLine(value.actThreeStatus ?? value.act_three_status ?? value.act_iii, 32),
    nextActBridge: trimContextLine(value.nextActBridge ?? value.next_act_bridge, 240),
    completionFocus: trimContextLine(value.completionFocus ?? value.completion_focus, 260),
  };
  if (Number.isFinite(pageCount) && pageCount > 0) progress.pageCount = Math.round(pageCount);
  if (Number.isFinite(targetPages) && targetPages > 0) progress.targetPages = Math.round(targetPages);
  const clean = Object.fromEntries(
    Object.entries(progress).filter(([, item]) => item !== "" && item !== null && item !== undefined)
  );
  return Object.keys(clean).length ? clean : null;
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function positiveIntegerOrZero(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed);
}

function pageCountFromToken(token) {
  const clean = trimToString(token).toLowerCase().replace(/-/g, " ");
  if (!clean) return 0;
  if (/^\d+$/.test(clean)) return positiveIntegerOrZero(clean);
  return PAGE_COUNT_WORDS[clean] || 0;
}

function inferRequestedPageBatch(lower) {
  const rangePattern = new RegExp(`\\b(${PAGE_COUNT_TOKEN})\\s*(?:-|to|\\u2013|\\u2014)\\s*(${PAGE_COUNT_TOKEN})\\s+pages?\\b`);
  const rangeMatch = lower.match(rangePattern);
  const rangeEnd = pageCountFromToken(rangeMatch?.[2]);
  if (rangeEnd > 0 && rangeEnd <= 30) return rangeEnd;

  const patterns = [
    new RegExp(`\\b(?:next|another|first|final|last)\\s+(${PAGE_COUNT_TOKEN})\\s+pages?\\b`),
    new RegExp(`\\b(?:write|draft|continue|generate|give me|do)\\b[\\s\\S]{0,48}\\b(${PAGE_COUNT_TOKEN})\\s+pages?\\b`),
  ];
  for (const pattern of patterns) {
    const match = lower.match(pattern);
    const count = pageCountFromToken(match?.[1]);
    if (count > 0 && count <= 30) return count;
  }
  return 0;
}

function patternMatches(text, pattern) {
  return pattern.test(text);
}

function inferRequestedActLabel(lower) {
  const hasActOne = patternMatches(lower, /\bact\s*(?:i|1|one)\b/) || /\bfirst act\b/.test(lower);
  const hasActTwo = patternMatches(lower, /\bact\s*(?:ii|2|two)\b/) || /\bsecond act\b/.test(lower);
  const hasActThree = patternMatches(lower, /\bact\s*(?:iii|3|three)\b/) || /\bthird act|final act|final sequence|finale\b/.test(lower);
  if (hasActOne && hasActTwo && hasActThree) return "Act I -> Act II -> Act III";
  if (hasActThree) return "Act III";
  if (hasActTwo) return "Act II";
  if (hasActOne) return "Act I";
  return "";
}

function inferFeatureRequestMetadata(lower) {
  const requestedPages = inferRequestedPageBatch(lower);
  const requestedAct = inferRequestedActLabel(lower);
  const featureWorkflowContinuation = hasAny(lower, [
    /\bfeature workflow context\b/,
    /\bfeature continuation\b/,
    /\bfeature[- ]film screenplay pages\b/,
  ]);
  const wholeFeature = hasAny(lower, [
    /\b(entire|whole|full)\b.*\b(feature|film|movie|screenplay|script)\b/,
    /\b(feature|film|movie|screenplay|script)\b.*\b(entire|whole|full)\b/,
    /\bact\s*(?:i|1|one)\b.*\bact\s*(?:ii|2|two)\b.*\bact\s*(?:iii|3|three)\b/i,
  ]);
  let featureScope = "";
  if (requestedPages > 0) featureScope = "page_batch";
  else if (featureWorkflowContinuation) featureScope = "page_batch";
  else if (wholeFeature) featureScope = "whole_feature";
  else if (requestedAct) featureScope = "act_target";
  return {
    requestedPages,
    requestedAct,
    featureScope,
  };
}

function inferActKindFromTextOrLabel(value = "") {
  const lower = trimToString(value).toLowerCase();
  if (!lower) return "";
  if (/\bact\s*(?:iii|3|three)\b|\bthird act\b|\bfinal act\b|\bfinale\b|\bclimax\b|\bending\b/.test(lower)) {
    return "act3";
  }
  if (/\bact\s*(?:ii|2|two)\b|\bsecond act\b|\bmiddle\b|\bmidpoint\b|\ball[- ]is[- ]lost\b|\bfun and games\b/.test(lower)) {
    return "act2";
  }
  if (/\bact\s*(?:i|1|one)\b|\bfirst act\b|\bbeginning\b|\bopening\b|\bcatalyst\b|\bbreak into two\b/.test(lower)) {
    return "act1";
  }
  return "";
}

function inferStoryStallDiagnostic(lower = "") {
  for (const diagnostic of STORY_STALL_DIAGNOSTICS) {
    if (diagnostic.patterns.some((pattern) => pattern.test(lower))) {
      return diagnostic;
    }
  }
  if (/\b(slow|dragging|drags|boring|flat|nothing happens|loses momentum|slowed down)\b/.test(lower)) {
    return {
      problem: "pressure drop / missing consequence",
      engine: "add a consequence that lands now, then force a tactic change before the scene exits",
    };
  }
  if (/\b(stuck|blocked|writer'?s block|writers block|creative block|out of ideas|need ideas|lost)\b/.test(lower)) {
    return {
      problem: "next dramatic engine unclear",
      engine: "choose one pressure engine and dramatize it as the next visible decision, reveal, cost, or image",
    };
  }
  return null;
}

function selectStoryRescueLenses(lower = "", { intent = "", actKind = "", problem = "" } = {}) {
  const haystack = `${trimToString(lower).toLowerCase()} ${trimToString(intent).toLowerCase()} ${trimToString(actKind).toLowerCase()} ${trimToString(problem).toLowerCase()}`;
  const selected = [];
  const add = (lens) => {
    if (!lens || selected.some((item) => item.key === lens.key)) return;
    selected.push(lens);
  };

  if (intent === "momentum_rescue" || /\bnext dramatic engine unclear\b/.test(haystack)) {
    add(STORY_RESCUE_LENSES.find((lens) => lens.key === "want_obstacle_cost"));
  }
  if (
    intent === "momentum_rescue" ||
    /\bmissing turn|no exit image|what happens next|next beat|next scene|where do i go\b/.test(haystack)
  ) {
    add(STORY_RESCUE_LENSES.find((lens) => lens.key === "choice_closure"));
  }

  for (const lens of STORY_RESCUE_LENSES) {
    if (lens.triggers.some((pattern) => pattern.test(haystack))) add(lens);
  }

  if (actKind === "act2") {
    add(STORY_RESCUE_LENSES.find((lens) => lens.key === "reversal_engine"));
    add(STORY_RESCUE_LENSES.find((lens) => lens.key === "relationship_cost"));
  } else if (actKind === "act3") {
    add(STORY_RESCUE_LENSES.find((lens) => lens.key === "setup_payoff"));
    add(STORY_RESCUE_LENSES.find((lens) => lens.key === "image_transformation"));
  } else if (actKind === "act1") {
    add(STORY_RESCUE_LENSES.find((lens) => lens.key === "want_obstacle_cost"));
    add(STORY_RESCUE_LENSES.find((lens) => lens.key === "choice_closure"));
  }

  if (!selected.length) {
    add(STORY_RESCUE_LENSES.find((lens) => lens.key === "want_obstacle_cost"));
    add(STORY_RESCUE_LENSES.find((lens) => lens.key === "reversal_engine"));
    add(STORY_RESCUE_LENSES.find((lens) => lens.key === "choice_closure"));
  }

  return selected.slice(0, 4).map((lens) => lens.line);
}

function inferStoryMomentumDiagnostic(userInput = "", task = {}) {
  const lower = trimToString(userInput).toLowerCase();
  const intent = trimToString(task?.intent);
  const relevantIntent = [
    "momentum_rescue",
    "continue_script",
    "finish_feature",
    "outline_structure",
    "scene_doctor",
    "pacing_pass",
  ].includes(intent);
  if (!lower && !relevantIntent) return null;
  const diagnostic = inferStoryStallDiagnostic(lower);
  const actKind = inferActKindFromTextOrLabel(task?.requestedAct) || inferActKindFromTextOrLabel(lower);
  if (!diagnostic && !actKind && !relevantIntent) return null;
  const problem = diagnostic?.problem || (
    intent === "finish_feature"
      ? "feature-scale next obligation unclear"
      : "continuation needs a stronger dramatic turn"
  );
  const engine = diagnostic?.engine || (
    intent === "continue_script"
      ? "continue with the next visible action, then change power, information, relationship, or cost before the beat ends"
      : "choose the next structural obligation and convert it into a playable decision, reversal, or cost"
  );
  const actObligation = ACT_RESCUE_OBLIGATIONS[actKind] || "";
  return {
    likelyProblem: problem,
    pressureEngine: engine,
    actObligation,
    rescueLenses: selectStoryRescueLenses(lower, { intent, actKind, problem }),
    moveLibrary: selectStoryMoveLibraryLines(lower, { intent, actKind, problem }),
    nextBeatLadder: [
      "active want",
      "opposition",
      "tactic shift",
      "reversal or cost",
      "emotional residue",
      "exit image",
    ],
    concepts: STORYCRAFT_RESCUE_CONCEPTS,
  };
}

function inferScreenplayTask(userInput = "") {
  const text = trimToString(userInput);
  const lower = text.toLowerCase();
  if (!lower) return null;
  const featureMetadata = inferFeatureRequestMetadata(lower);
  const sceneDoctorLike = hasAny(lower, [
    /\b(scene doctor|doctor this|doctor the scene|coverage|feedback|notes|diagnose|what'?s wrong|what'?s not working|fix this scene|why isn'?t this working)\b/,
  ]);
  const dialogueLike = hasAny(lower, [
    /\b(dialogue|line|lines|exchange|argument|conversation|voice|voices|banter|monologue|subtext)\b/,
    /\b(what should (?:he|she|they) say|what does (?:he|she|they) say)\b/,
  ]);
  const rewriteLike = hasAny(lower, [
    /\b(rewrite|revise|polish|replace|swap out|another pass|do another pass|make it better|elevate|professionalize|pro pass|expert pass)\b/,
    /\b(make (?:this|it|this script|the script|this screenplay|the screenplay|this passage|this scene|the scene|this line|the line|this exchange|the exchange) (?:shorter|tighter|sharper|cleaner|faster|smarter|more expert|more professional|more cinematic|more emotional|more sophisticated|more filmic|less on[- ]the[- ]nose))\b/,
    /\bmake\b.{0,80}\b(?:act\s*(?:ii|2|two|iii|3|three)|second act|third act|final act|finale|midpoint|sequence)\b.{0,100}\b(?:better|stronger|smarter|faster|sharper|cleaner|more expert|more cinematic|more emotional|less generic)\b/,
  ]) || (hasAny(lower, [/\bpunch up\b/]) && !dialogueLike);
  const explicitDialoguePunchupLike = dialogueLike && hasAny(lower, [
    /\b(punch up|punch-up|sharpen|give .* subtext|more subtext|less on[- ]the[- ]nose)\b/,
    /\bmake (?:the )?(?:dialogue|line|lines|exchange|argument|conversation|voices?) (?:sharper|tighter|cleaner)\b/,
  ]);
  const dialoguePunchupLike = explicitDialoguePunchupLike && (!rewriteLike || hasAny(lower, [/\bpunch[- ]up\b/]));
  const continueLike = hasAny(lower, [
    /\b(continue|keep going|keep writing|carry on|carry this forward|take it from here|next page|next scene|what happens next|what should happen next|finish this scene|from here)\b/,
  ]);
  const stuckLike = hasAny(lower, [
    /\b(stuck|blocked|writer'?s block|writers block|creative block|spinning|overthinking|can'?t figure out|cannot figure out|don'?t know where to go|don'?t know what happens|no idea what happens)\b/,
    /\b(?:i'?m|im|i am|feel|feeling|kind of|sort of)\s+lost\b/,
    /\b(help me get unstuck|help me find the next beat|find the next beat|what should happen here|running out of ideas|out of ideas|need ideas|need a better next move|story slowed down|slows down on ideas)\b/,
  ]);
  const featureCompletionLike = hasAny(lower, [
    /\bfeature workflow context\b/,
    /\bfeature continuation\b/,
    /\bfeature[- ]film screenplay pages\b/,
    /\b(finish|complete|help me finish|land the ending|ending)\b.*\b(feature|film|movie|script|screenplay|pilot)\b/,
    /\b(feature|film|movie|script|screenplay|pilot)\b.*\b(finish|complete|ending|finale)\b/,
    /\b(feature[- ]length|feature film|feature screenplay|whole movie|whole script|full script)\b/,
    /\b(help me|work with me|guide me|show me|teach me)\b.*\b(write|finish|complete|break|shape|map|outline|build)\b.*\b(feature|film|movie|screenplay|script)\b/,
    /\b(write|finish|complete|break|shape|map|outline|build)\b.*\b(feature|film|movie|screenplay|script)\b.*\b(with me|together|from scratch|all the way)\b/,
    /\b(?:take|move|push|carry|drive)\b.{0,80}\b(?:into|through|toward|towards)\b.{0,80}\b(?:act\s*(?:ii|2|two|iii|3|three)|second act|third act|final act|final sequence|finale|midpoint|all[- ]is[- ]lost|climax)\b/,
    /\b(act\s*(?:i|1|one)|first act)\b.*\b(movie|film|feature|screenplay|script)\b/,
    /\b(act\s*(?:ii|2|two)|second act)\b.*\b(movie|film|feature|screenplay|script)\b/,
    /\b(act\s*(?:iii|3|three)|third act|final act)\b.*\b(movie|film|feature|screenplay|script)\b/,
    /\b(90|ninety|100|one hundred|110|120)\s*(?:page|pages)\b/,
    /\b(next|another)\s+(?:5|five|10|ten|15|fifteen)\s+pages?\b/,
    /\b(write|draft|continue)\b.*\b(act two|second act|act three|third act|final act|final sequence)\b/,
    /\b(act two|second act|act three|third act|final act|final sequence)\b.*\b(write|draft|continue)\b/,
    /\b(act two|second act|act three|third act|finale)\b.*\b(movie|film|feature|screenplay|script)\b/,
    /\b(movie|film|feature|screenplay|script)\b.*\b(act two|second act|act three|third act|finale)\b/,
    /\b(act one|act 1|first act)\b.*\b(act two|act 2|second act)\b.*\b(act three|act 3|third act)\b/,
    /\b(act 1|act i)\b.*\b(act 2|act ii)\b.*\b(act 3|act iii)\b/i,
    /\b(entire|whole|full)\b.*\b(feature|film|movie|screenplay|script)\b/,
    /\b(feature|film|movie|screenplay|script)\b.*\b(entire|whole|full)\b/,
    /\b(break|shape|architect|map|outline|write|draft)\b.*\b(feature[- ]length|feature film|feature screenplay|whole movie|full script)\b/,
    /\b(feature[- ]length|feature film|feature screenplay|whole movie|full script)\b.*\b(break|shape|architect|map|outline|write|draft)\b/,
  ]);

  let intent = "general_story";
  let label = "General Story Help";
  let output = "Give specific, cinematic story guidance with one concrete next move.";

  if (sceneDoctorLike && !rewriteLike) {
    intent = "scene_doctor";
    label = "Scene Doctor";
    output = "Give concise script-doctor notes: what works, what is not landing, and the highest-leverage fix. Include sample replacement lines only when useful.";
  } else if (dialoguePunchupLike) {
    intent = "dialogue_punchup";
    label = "Dialogue Punch-Up";
    output = "Return only playable replacement screenplay text: character cues, dialogue, brief parentheticals, and any needed action lines in clean Fountain style. Add subtext, distinct voices, and rhythm. Do not diagnose, explain, use markdown, or include headings like WHAT'S NOT LANDING, HIGHEST-LEVERAGE FIX, or Consider replacing.";
  } else if (rewriteLike) {
    intent = "rewrite_scene";
    label = "Rewrite Scene";
    output = "Return a revised scene or targeted passage in clean screenplay/Fountain style. Preserve story intent and continuity, replace only the requested span when the user names one, and improve specificity, rhythm, and emotional truth.";
  } else if (featureCompletionLike) {
    intent = "finish_feature";
    label = "Finish Feature";
    output = "Finish the larger script: for planning, orient act/sequence pressure, next three turns, unresolved promises, character need, and the Act III payoff path. When the request asks for pages, write the next playable Fountain pages immediately with no diagnosis or strategy note unless explicitly asked.";
  } else if (stuckLike) {
    intent = "momentum_rescue";
    label = "Momentum Rescue";
    output = "Help the writer get moving like an elite story editor: diagnose the exact story stall, choose one strongest next beat, offer up to two alternate forks only if useful, then write a small playable sample in clean Fountain style when context is present.";
  } else if (continueLike) {
    intent = "continue_script";
    label = "Continue Script";
    output = "Continue from the current draft in screenplay/Fountain style, matching tone, character voice, pacing, subtext, and emotional continuity. Treat the supplied draft as active continuity and do not restart the scene unless the user asks.";
  } else if (hasAny(lower, [/\b(write|draft|generate|compose)\b.*\b(scene|sequence|beat|pages?|dialogue|monologue)\b/, /\b(scene|sequence|beat)\b.*\b(write|draft|generate|compose)\b/])) {
    intent = "write_scene";
    label = "Write Scene";
    output = "Write usable screenplay pages in clean Fountain style with scene headings, action, character cues, dialogue, and restrained parentheticals.";
  } else if (sceneDoctorLike) {
    intent = "scene_doctor";
    label = "Scene Doctor";
    output = "Give concise script-doctor notes: what works, what is not landing, and the highest-leverage fix. Include sample replacement lines only when useful.";
  } else if (hasAny(lower, [/\b(outline|beat sheet|beats|act structure|three act|save the cat|story circle|hero'?s journey)\b/])) {
    intent = "outline_structure";
    label = "Outline And Structure";
    output = "Shape the story into clear beats or structural moves with emotional cause-and-effect.";
  } else if (hasAny(lower, [/\b(character|arc|motivation|want|need|flaw|relationship)\b/])) {
    intent = "character_development";
    label = "Character Development";
    output = "Clarify character want, need, wound, contradiction, and behavior on the page. Keep suggestions playable, not abstract.";
  } else if (dialogueLike) {
    intent = "dialogue_punchup";
    label = "Dialogue Punch-Up";
    output = "Return only playable replacement screenplay text: character cues, dialogue, brief parentheticals, and any needed action lines in clean Fountain style. Add subtext, distinct voices, and rhythm. Do not diagnose, explain, use markdown, or include headings like WHAT'S NOT LANDING, HIGHEST-LEVERAGE FIX, or Consider replacing.";
  } else if (hasAny(lower, [/\b(tone|emotional continuity|emotion|feeling|mood|vibe|heart)\b/])) {
    intent = "emotional_continuity";
    label = "Emotional Continuity";
    output = "Track the emotional handoff from beat to beat and protect the scene's felt truth.";
  } else if (hasAny(lower, [/\b(pacing|slow|dragging|too fast|make it faster|move faster|momentum|length|tighten)\b/])) {
    intent = "pacing_pass";
    label = "Pacing Pass";
    output = "Identify drag, compression points, escalation gaps, and page-level fixes that keep momentum alive.";
  }

  const task = { intent, label, output };
  if (stuckLike) task.writerBlocked = true;
  if (featureMetadata.requestedPages > 0) task.requestedPages = featureMetadata.requestedPages;
  if (featureMetadata.requestedAct) task.requestedAct = featureMetadata.requestedAct;
  if (featureMetadata.featureScope) task.featureScope = featureMetadata.featureScope;
  const storyDiagnostic = inferStoryMomentumDiagnostic(text, task);
  if (storyDiagnostic) task.storyDiagnostic = storyDiagnostic;
  return task;
}

function buildStoryDiagnosticPromptLines(storyDiagnostic, { detailed = true } = {}) {
  if (!storyDiagnostic || typeof storyDiagnostic !== "object") return [];
  const lines = ["story_diagnostic:"];
  const likelyProblem = trimContextLine(
    storyDiagnostic.likelyProblem ?? storyDiagnostic.likely_problem ?? storyDiagnostic.problem,
    180
  );
  const pressureEngine = trimContextLine(
    storyDiagnostic.pressureEngine ?? storyDiagnostic.pressure_engine ?? storyDiagnostic.engine,
    220
  );
  const actObligation = trimContextLine(
    storyDiagnostic.actObligation ?? storyDiagnostic.act_obligation,
    220
  );
  if (likelyProblem) lines.push(`  likely_scene_problem: ${likelyProblem}`);
  if (pressureEngine) lines.push(`  strongest_pressure_engine: ${pressureEngine}`);
  if (actObligation) lines.push(`  act_obligation: ${actObligation}`);
  if (!detailed) {
    lines.push("  response_contract: apply this silently and move to one playable decision, reversal, cost, or page action.");
    return lines.length > 2 ? lines : [];
  }
  const nextBeatLadder = sanitizeContextList(
    storyDiagnostic.nextBeatLadder ?? storyDiagnostic.next_beat_ladder,
    6,
    80
  );
  if (nextBeatLadder.length) {
    lines.push("  next_beat_ladder:");
    for (const step of nextBeatLadder) lines.push(`    - ${step}`);
  }
  const concepts = sanitizeContextList(storyDiagnostic.concepts, 6, 220);
  if (concepts.length) {
    lines.push("  storytelling_concepts:");
    for (const concept of concepts) lines.push(`    - ${concept}`);
  }
  const moveLibrary = sanitizeContextList(
    storyDiagnostic.moveLibrary ?? storyDiagnostic.move_library,
    6,
    260
  );
  if (moveLibrary.length) {
    lines.push("  story_move_library:");
    for (const move of moveLibrary) lines.push(`    - ${move}`);
  }
  const rescueLenses = sanitizeContextList(
    storyDiagnostic.rescueLenses ?? storyDiagnostic.rescue_lenses,
    4,
    240
  );
  if (rescueLenses.length) {
    lines.push("  story_rescue_lenses:");
    for (const lens of rescueLenses) lines.push(`    - ${lens}`);
  }
  lines.push("  response_contract: apply the diagnostic silently; answer with one decisive next move and playable page behavior, not a theory lecture.");
  return lines.length > 2 ? lines : [];
}

function buildMomentumRescueMoveOptionLines({
  transcript = "",
  act = "",
  featureSequence = "",
  currentBeat = "",
  lastSceneOutcome = "",
  sceneObjective = "",
  featureObligation = "",
  actPressureState = "",
  characterArcState = "",
  protagonistWant = "",
  protagonistNeed = "",
  antagonisticForce = "",
  characters = [],
  nextThreeTurns = [],
  nextSceneMoves = [],
  nextScenePlan = "",
  unresolvedSetups = [],
  unresolvedStoryThreads = [],
  characterArcTurns = [],
  actThreePayoffPath = [],
  imageMotifs = [],
  endingImage = "",
  acceptedPages = [],
  storyMoments = [],
  dueStoryThread = null,
} = {}) {
  const ranked = rankStoryRescueMovesForContext({
    transcript,
    intent: "momentum_rescue",
    act,
    featureSequence,
    currentBeat,
    lastSceneOutcome,
    sceneObjective,
    featureObligation,
    actPressureState,
    characterArcState,
    protagonistWant,
    protagonistNeed,
    antagonisticForce,
    characters,
    nextThreeTurns,
    nextSceneMoves,
    nextScenePlan,
    unresolvedSetups,
    unresolvedStoryThreads,
    characterArcTurns,
    actThreePayoffPath,
    imageMotifs,
    endingImage,
    acceptedPages,
    storyMoments,
    dueStoryThread,
  });
  return [
    "ranked_rescue_moves:",
    "  selection_method: score act fit, remembered continuity, character pressure, setup/payoff value, and ability to change story state now.",
    ...ranked.map((move) => `  ${formatRankedStoryRescueMoveLine(move)}`),
    "  selection_rule: execute rank_1 unless it conflicts with a writer correction; use lower ranks only as distinct alternate forks.",
  ];
}

function buildScreenplayTaskBlock(screenplayTask) {
  const task = screenplayTask && typeof screenplayTask === "object"
    ? screenplayTask
    : inferScreenplayTask(screenplayTask);
  if (!task || !task.intent) return "";
  const intent = trimToString(task.intent);
  const label = trimToString(task.label) || intent;
  const output = trimToString(task.output);
  if (!intent) return "";
  const lines = [
    `intent: ${intent}`,
    `label: ${label}`,
    "role: Clementine is an elite cinematic writing partner, not a generic chatbot.",
    ...CLEMENTINE_CREATIVE_PACT,
  ];
  const requestedPages = positiveIntegerOrZero(task.requestedPages ?? task.requested_pages ?? task.pageBatch ?? task.page_batch);
  const requestedAct = trimContextLine(task.requestedAct ?? task.requested_act, 80);
  const featureScope = trimContextLine(task.featureScope ?? task.feature_scope, 80);
  if (featureScope) lines.push(`feature_scope: ${featureScope}`);
  if (requestedAct) lines.push(`requested_act: ${requestedAct}`);
  if (DIALOGUE_LOOP_INTENTS.includes(intent)) {
    lines.push("dialogue_loop:");
    for (const item of CLEMENTINE_DIALOGUE_LOOP_CONTRACT) {
      lines.push(`  - ${item}`);
    }
  }
  if (requestedPages > 0) {
    lines.push(`requested_page_batch: ${requestedPages}`);
    lines.push("page_batch_contract:");
    lines.push("  - Begin with playable Fountain text; do not preface with diagnosis, outline, recap, strategy note, markdown, or permission language unless the user explicitly asks for analysis instead of pages.");
    lines.push("  - Page velocity: the first non-empty line must be a scene heading, action line, character cue, or dialogue continuation; no labels before pages.");
    lines.push("  - Page engine: use 2-4 escalating scene turns; change leverage, information, relationship, tactic, or emotional cost every 1-2 pages; end on a decision, reveal, cost, or image.");
    lines.push("  - Dialogue must be tactical and subtextual. Interleave dialogue with visible action, discovery, consequence, or tactic shifts; never repeat one static tactic.");
    lines.push("  - Continuity: start from the active draft state, spend the first remembered next turn and its concrete nouns, and dramatize open setups, arc pressure, and image motifs before inventing a new lane.");
    lines.push("  - Feature-page triad: turn a win or plan into a reversal/cost, spend a remembered payoff, and make the old character tactic fail through changed behavior.");
    lines.push("  - Act conversion: Act I burns a safe exit; Act II makes the false tactic costlier; Act III pays off setup through changed behavior and final-image pressure.");
    lines.push("  - Writer-block-to-pages: convert the strongest rescue engine into pages without a pep talk. Avoid cinematic vapor: every beat needs concrete behavior or consequence.");
  }
  if (intent === "momentum_rescue") {
    lines.push("story_momentum_playbook:");
    for (const item of STORY_MOMENTUM_PLAYBOOK) {
      lines.push(`  - ${item}`);
    }
    lines.push("story_rescue_framework:");
    for (const item of STORY_RESCUE_FRAMEWORK) {
      lines.push(`  - ${item}`);
    }
    lines.push("writer_block_contract:");
    lines.push("  - Never answer with generic encouragement alone.");
    lines.push("  - Lead with the most likely story blockage and the page-level fix.");
    lines.push("  - Prefer one decisive next beat over a menu of vague ideas.");
    lines.push("  - Spend remembered story state before proposing a new plot lane.");
    lines.push("  - Every rescue must answer: what does the character do now, what pushes back, what changes by the end?");
    lines.push("  - Use named characters, objects, setups, motifs, and act pressure already in memory before adding new mythology.");
    lines.push("  - If giving alternates, make each fork carry a different cost: reversal, relationship damage, setup payoff, public exposure, or moral choice.");
    lines.push("  - If enough scene context exists, include a playable micro-beat in Fountain style.");
    lines.push("  - Keep the user emotionally safe: blocked means the story is asking for pressure, not that the writer failed.");
  }
  const storyDiagnostic = task.storyDiagnostic ?? task.story_diagnostic;
  const continuationNeedsRescueLibrary = intent === "continue_script" && sanitizeContextList(
    storyDiagnostic?.moveLibrary ?? storyDiagnostic?.move_library,
    1,
    260
  ).length > 0;
  lines.push(...buildStoryDiagnosticPromptLines(storyDiagnostic, {
    detailed: intent === "momentum_rescue" || intent === "pacing_pass" || continuationNeedsRescueLibrary,
  }));
  if (intent === "finish_feature" && requestedPages === 0) {
    lines.push("page_request_handoff: For page requests, keep diagnosis to one sentence and start the pages immediately; omit diagnosis when the user asks for pages only.");
  }
  const modeGuidance = screenplayModeGuidanceForIntent(intent);
  if (modeGuidance) lines.push(`mode_guidance: ${modeGuidance}`);
  if (output && intent === "dialogue_punchup") lines.push(`output: ${output}`);
  lines.push("quality: Be emotionally intelligent, specific, film-literate, concise when possible, and directly useful on the page.");
  return `${SCREENPLAY_TASK_BLOCK_OPEN}\n${lines.join("\n")}\n${SCREENPLAY_TASK_BLOCK_CLOSE}`;
}

function screenplayModeGuidanceForIntent(intent) {
  switch (intent) {
    case "write_scene":
      return "Write the scene as usable pages first: slugline, action, character cues, dialogue, and playable behavior. Build objective, obstacle, pressure clock, escalation, reversal or turn, emotional residue, and an exit image. Keep explanation out unless asked.";
    case "rewrite_scene":
      return "Preserve the writer's intention and continuity while replacing the weak passage with stronger playable pages. Raise objective, obstacle, subtext, image, rhythm, and the scene turn. If this is page-targeted, output only the revised screenplay text. Give at most one craft sentence before pages when not page-targeted.";
    case "continue_script":
      return "Continue directly from the supplied draft excerpt. Begin with the next visible action. Match voice and emotional handoff; do not restart or recap the scene. Silently lock the feature compass before pages. Spend first_turn_to_spend and its concrete nouns before inventing a lane. Every few beats should change power, information, relationship, or self-knowledge.";
    case "dialogue_punchup":
      return "Keep the exchange actable and character-specific. Give each speaker a private tactic and a pressure target; sharpen subtext, interruption, reversal, behavior, rhythm, and distinct voice. Remove exposition unless it is weaponized or misused on the page.";
    case "scene_doctor":
      return "Diagnose with surgical brevity: what works, what is not landing, the highest-leverage fix, and one concrete page-level move.";
    case "outline_structure":
      return "Shape beats by cause and effect. Track act pressure, reversals, setups, payoffs, and the emotional consequence of each turn.";
    case "character_development":
      return "Translate psychology into visible behavior: want, need, contradiction, tactics, silence, and the choice the audience can watch.";
    case "emotional_continuity":
      return "Track the emotional baton between beats. Preserve what just happened inside each character before adding the next action.";
    case "pacing_pass":
      return "Find where pressure drops, compress setup, escalate conflict, and propose exact cuts or page moves.";
    case "finish_feature":
      return "Operate at feature scale. Locate the current act/sequence and due obligation; protect unresolved promises, setups/payoffs, character need, next three turns, Act III payoff path, and final image. When memory contains a next-turn runway, turn the first remembered turn into playable behavior before adding new plot. For page requests, start Fountain pages immediately with no diagnosis or strategy note. For planning, give the act engine and immediate page assignment.";
    case "momentum_rescue":
      return "Do not turn stuckness into a lecture. Diagnose the stall using story mechanics: want, obstacle, tactic, consequence, reversal, act pressure, and exit image. Give one decisive next move, optionally two sharp alternate forks, and a small playable beat or page sample if there is enough context. Prefer forward motion over options.";
    default:
      return "Stay concrete, cinematic, and useful; move from feeling to craft to the next playable action.";
  }
}

function serializeStyle(style) {
  if (!isNonEmptyObject(style)) return "";
  const lines = [];
  if (style.preferredTone) lines.push(`tone: ${style.preferredTone}`);
  if (style.sentenceLengthBias) lines.push(`sentence-length: ${style.sentenceLengthBias}`);
  if (style.preferredFormatting) lines.push(`format: ${style.preferredFormatting}`);
  if (isNonEmptyArray(style.lexicalFingerprint)) {
    const trimmed = style.lexicalFingerprint.slice(-12).join("; ");
    lines.push(`recurring-phrases: ${trimmed}`);
  }
  return lines.length ? `style:\n  ${lines.join("\n  ")}` : "";
}

function serializeProjectContinuity(project) {
  if (!isNonEmptyObject(project)) return "";
  const projectId = trimContextLine(project.projectId ?? project.project_id, 96);
  const projectTitle = trimContextLine(project.projectTitle ?? project.project_title, 140);
  if (!projectId && !projectTitle) return "";
  const lines = [
    "  directive: durable active-feature continuity; preserve these facts across sessions, spend open setups before inventing replacements, and apply authoritative corrections before any older story memory.",
  ];
  if (projectId) lines.push(`  project_id: ${projectId}`);
  if (projectTitle) lines.push(`  project_title: ${projectTitle}`);
  const correctionReplacements = sanitizeContextList(project.correctionReplacements, 6, 150);
  const correctedTerms = sanitizeContextList(project.correctedTerms, 6, 110);
  if (correctionReplacements.length) {
    lines.push(`  authoritative_corrections: ${correctionReplacements.join(" / ")}`);
  }
  if (correctedTerms.length) lines.push(`  retired_terms: ${correctedTerms.join(" / ")}`);
  const scalarFields = [
    ["act", project.act, 80],
    ["feature_sequence", project.featureSequence, 160],
    ["feature_obligation", project.featureObligation, 200],
    ["act_pressure", project.actPressureState, 200],
    ["scene_objective", project.sceneObjective, 200],
    ["scene_summary", project.sceneSummary, 220],
    ["current_beat", project.currentBeat, 180],
    ["last_scene_outcome", project.lastSceneOutcome, 200],
    ["next_scene_plan", project.nextScenePlan, 240],
    ["logline", project.logline, 220],
    ["theme_argument", project.themeArgument, 200],
    ["central_question", project.centralQuestion, 220],
    ["character_arc_state", project.characterArcState, 220],
    ["emotional_continuity", project.emotionalContinuity, 220],
    ["protagonist_want", project.protagonistWant, 160],
    ["protagonist_need", project.protagonistNeed, 160],
    ["antagonistic_force", project.antagonisticForce, 160],
    ["ending_image", project.endingImage, 180],
  ];
  for (const [label, value, maxChars] of scalarFields) {
    const clean = trimContextLine(value, maxChars);
    if (clean) lines.push(`  ${label}: ${clean}`);
  }
  const listFields = [
    ["next_scene_moves", project.nextSceneMoves, 5, 160],
    ["next_three_turns", project.nextThreeTurns, 3, 160],
    ["beat_sequence", project.beatSequence, 6, 160],
    ["unresolved_setups", project.unresolvedSetups, 5, 180],
    ["unresolved_story_threads", project.unresolvedStoryThreads, 5, 180],
    ["act_three_payoff_path", project.actThreePayoffPath, 4, 180],
    ["character_focus", project.characterFocus, 6, 72],
    ["character_arc_turns", project.characterArcTurns, 5, 160],
    ["image_motifs", project.imageMotifs, 5, 120],
    ["continuity_notes", project.continuityNotes, 5, 180],
  ];
  for (const [label, value, maxItems, maxChars] of listFields) {
    const items = sanitizeContextList(value, maxItems, maxChars);
    if (items.length) lines.push(`  ${label}: ${items.join(" / ")}`);
  }
  const pageCount = Math.max(0, Math.round(Number(project.pageCount || 0)));
  const targetPages = Math.max(0, Math.round(Number(project.targetPages || 0)));
  if (pageCount > 0 || targetPages > 0) {
    lines.push(`  page_progress: ${pageCount > 0 ? pageCount : "?"}/${targetPages > 0 ? targetPages : "?"}`);
  }
  return `project-continuity:\n${lines.join("\n")}`;
}

function serializeAcceptedSceneCausality(scenes) {
  if (!isNonEmptyArray(scenes)) return "";
  const lines = [
    "  directive: authoritative accepted Studio scenes, newest first. Preserve their cause-and-effect chain; continue from the newest changed state, keep listed setups alive until paid off, and never replace a promised payoff without the writer's correction.",
  ];
  for (const scene of scenes.slice(0, 3)) {
    if (!scene || typeof scene !== "object") continue;
    const identity = [
      trimContextLine(scene.act, 60),
      trimContextLine(scene.featureSequence, 90),
      trimContextLine(scene.sceneHeading ?? scene.sceneLabel, 110),
    ].filter(Boolean).join(" · ") || "accepted scene";
    const characters = sanitizeContextList(scene.characterNames, 4, 48);
    const openSetups = sanitizeContextList(scene.unresolvedSetups, 2, 120);
    const payoffPath = sanitizeContextList(scene.actThreePayoffPath, 2, 120);
    const arcTurns = sanitizeContextList(scene.characterArcTurns, 2, 120);
    const parts = [
      trimContextLine(scene.summary, 140) ? `happened=${trimContextLine(scene.summary, 140)}` : "",
      trimContextLine(scene.outcome, 140) ? `changed=${trimContextLine(scene.outcome, 140)}` : "",
      characters.length ? `characters=${characters.join(", ")}` : "",
      arcTurns.length ? `arc_turn=${arcTurns.join(" / ")}` : "",
      openSetups.length ? `still_open=${openSetups.join(" / ")}` : "",
      payoffPath.length ? `promised_payoff=${payoffPath.join(" / ")}` : "",
      trimContextLine(scene.nextScenePlan, 140) ? `next_pressure=${trimContextLine(scene.nextScenePlan, 140)}` : "",
      !trimContextLine(scene.summary, 140) && trimContextLine(scene.excerpt, 160)
        ? `page_evidence=${trimContextLine(scene.excerpt, 160)}`
        : "",
    ].filter(Boolean);
    if (parts.length) lines.push(`  - ACCEPTED_SCENE [${identity}]: ${parts.join(" | ")}`);
  }
  return lines.length > 1 ? `accepted-scene-causality:\n${lines.join("\n")}` : "";
}

function normalizeDueStoryThread(value = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {
    kind: trimContextLine(value.kind, 24),
    setup: trimContextLine(value.setup ?? value.oldestOpenSetup ?? value.oldest_open_setup, 220),
    promisedPayoff: trimContextLine(value.promisedPayoff ?? value.promised_payoff ?? value.payoff, 220),
    sourceSceneHeading: trimContextLine(value.sourceSceneHeading ?? value.source_scene_heading, 140),
    sourceSceneSummary: trimContextLine(value.sourceSceneSummary ?? value.source_scene_summary, 220),
    sourceSceneOutcome: trimContextLine(value.sourceSceneOutcome ?? value.source_scene_outcome, 220),
    sourceAct: trimContextLine(value.sourceAct ?? value.source_act, 80),
    ageInScenes: Math.max(0, Math.round(Number(value.ageInScenes ?? value.age_in_scenes ?? 0))),
  };
  return out.setup || out.promisedPayoff ? out : null;
}

function serializeDueStoryThread(value) {
  const thread = normalizeDueStoryThread(value);
  if (!thread) return "";
  const lines = [
    "  authority: derived only from accepted Studio scenes and the active project's still-open continuity; do not imply it has already paid off.",
  ];
  if (thread.setup) lines.push(`  oldest_due_story_thread: ${thread.setup}`);
  if (thread.promisedPayoff) lines.push(`  promised_payoff: ${thread.promisedPayoff}`);
  const source = [thread.sourceAct, thread.sourceSceneHeading].filter(Boolean).join(" · ");
  if (source) lines.push(`  planted_in: ${source}`);
  if (thread.sourceSceneSummary) lines.push(`  planted_as: ${thread.sourceSceneSummary}`);
  if (thread.sourceSceneOutcome) lines.push(`  source_consequence: ${thread.sourceSceneOutcome}`);
  if (thread.ageInScenes > 0) lines.push(`  open_for_accepted_scenes: ${thread.ageInScenes}`);
  lines.push("  directive: pressure or spend this thread before inventing a replacement; make its return alter behavior, leverage, relationship, or cost.");
  return `due-story-thread:\n${lines.join("\n")}`;
}

function serializeCharacters(characters, { preserveOrder = false } = {}) {
  if (!isNonEmptyArray(characters)) return "";
  const ordered = preserveOrder
    ? characters
    : [...characters].sort((a, b) => (b.last_referenced || 0) - (a.last_referenced || 0));
  const top = ordered.slice(0, 8);
  const lines = [];
  for (const c of top) {
    const tags = isNonEmptyArray(c.tags) ? ` [${c.tags.join(", ")}]` : "";
    const voice = trimToString(c.voice) ? ` — ${trimToString(c.voice)}` : "";
    lines.push(`  - ${c.name}${tags}${voice}`);
    // T-prompt-wire-traits-and-twists: render the per-character trait
    // inventory as an indented `traits:` line. Falls back silently
    // when no traits exist or when buildTraitsBlockForPrompt returns "".
    if (c.traits && typeof c.traits === "object") {
      const traitLine = buildTraitsBlockForPrompt(c.traits);
      if (traitLine) lines.push(`      traits: ${traitLine}`);
    }
    if (c.bible && typeof c.bible === "object") {
      const bibleParts = [];
      const canon = sanitizeContextList(c.bible.canon ?? c.bible.facts, 4, 160);
      const corrections = sanitizeContextList(c.bible.corrections, 2, 180);
      const correctedTerms = sanitizeContextList(c.bible.correctionReplacements, 3, 120)
        .concat(sanitizeContextList(c.bible.correctedTerms, 3, 80))
        .slice(0, 4);
      const arc = c.bible.arc && typeof c.bible.arc === "object" ? c.bible.arc : null;
      const arcParts = arc
        ? [
          trimContextLine(arc.act, 60) ? `act=${trimContextLine(arc.act, 60)}` : "",
          trimContextLine(arc.want, 120) ? `want=${trimContextLine(arc.want, 120)}` : "",
          trimContextLine(arc.need, 120) ? `need=${trimContextLine(arc.need, 120)}` : "",
          trimContextLine(arc.wound, 120) ? `wound=${trimContextLine(arc.wound, 120)}` : "",
          trimContextLine(arc.falseBelief ?? arc.false_belief, 120) ? `false_belief=${trimContextLine(arc.falseBelief ?? arc.false_belief, 120)}` : "",
          trimContextLine(arc.relationshipPressure ?? arc.relationship_pressure, 120) ? `relationship_pressure=${trimContextLine(arc.relationshipPressure ?? arc.relationship_pressure, 120)}` : "",
          trimContextLine(arc.currentTactic ?? arc.current_tactic, 120) ? `current_tactic=${trimContextLine(arc.currentTactic ?? arc.current_tactic, 120)}` : "",
          trimContextLine(arc.nextEmotionalTurn ?? arc.next_emotional_turn, 120) ? `next_emotional_turn=${trimContextLine(arc.nextEmotionalTurn ?? arc.next_emotional_turn, 120)}` : "",
        ].filter(Boolean)
        : [];
      if (canon.length) bibleParts.push(`canon: ${canon.join(" / ")}`);
      if (arcParts.length) bibleParts.push(`arc: ${arcParts.join("; ")}`);
      if (corrections.length) bibleParts.push(`corrections: ${corrections.join(" / ")}`);
      if (correctedTerms.length) bibleParts.push(`corrected_terms: ${correctedTerms.join(" / ")}`);
      if (bibleParts.length) lines.push(`      bible: ${bibleParts.join("; ")}`);
    }
  }
  return `recurring-characters:\n${lines.join("\n")}`;
}

function serializeStoryBibleRecall(creativeMemory) {
  if (!creativeMemory || typeof creativeMemory !== "object") return "";
  const characters = isNonEmptyArray(creativeMemory.characters)
    ? creativeMemory.characters
    : [];
  const bibleCharacters = characters
    .filter((character) => character?.bible && typeof character.bible === "object")
    .slice(0, 6);
  if (!bibleCharacters.length) return "";

  const lines = [
    "  directive: durable character/story bible for this feature; corrections override older conflicting memory; use these pressures before inventing new character motivation.",
    "  rule: move the next beat by testing want, wound, false belief, current tactic, and one open setup/payoff from feature_continuity.",
  ];
  for (const character of bibleCharacters) {
    const name = trimContextLine(character.name, 80);
    const bible = character.bible || {};
    const arc = bible.arc && typeof bible.arc === "object" ? bible.arc : {};
    const canon = sanitizeContextList(bible.canon ?? bible.facts, 3, 150);
    const corrections = sanitizeContextList(bible.corrections, 2, 180);
    const correctedTerms = sanitizeContextList(bible.correctionReplacements, 3, 120)
      .concat(sanitizeContextList(bible.correctedTerms, 3, 80))
      .slice(0, 4);
    const parts = [
      trimContextLine(arc.want, 120) ? `want=${trimContextLine(arc.want, 120)}` : "",
      trimContextLine(arc.need, 120) ? `need=${trimContextLine(arc.need, 120)}` : "",
      trimContextLine(arc.wound, 120) ? `wound=${trimContextLine(arc.wound, 120)}` : "",
      trimContextLine(arc.falseBelief ?? arc.false_belief, 120) ? `false_belief=${trimContextLine(arc.falseBelief ?? arc.false_belief, 120)}` : "",
      trimContextLine(arc.currentTactic ?? arc.current_tactic, 120) ? `current_tactic=${trimContextLine(arc.currentTactic ?? arc.current_tactic, 120)}` : "",
      trimContextLine(arc.nextEmotionalTurn ?? arc.next_emotional_turn, 120) ? `next_emotional_turn=${trimContextLine(arc.nextEmotionalTurn ?? arc.next_emotional_turn, 120)}` : "",
      canon.length ? `canon=${canon.join(" / ")}` : "",
      corrections.length ? `corrections=${corrections.join(" / ")}` : "",
      correctedTerms.length ? `corrected_terms=${correctedTerms.join(" / ")}` : "",
    ].filter(Boolean);
    if (name && parts.length) lines.push(`  - ${name}: ${parts.join("; ")}`);
  }
  return lines.length > 2 ? `story-bible-recall:\n${lines.join("\n")}` : "";
}

function serializeEpisodicMemories(memories) {
  if (!isNonEmptyArray(memories)) return "";
  const lines = [
    "  directive: durable user/project memories retrieved for this turn; use them for continuity, treat CORRECTION items as overriding older conflicting memory, and do not invent memories not listed here. USER_NOTE is writer-authored; ACCEPTED_PAGE was committed into Studio; DRAFT_PAGE is generated working-page continuity; CONVERSATION_CONTEXT is a recall clue, not canon. Current project continuity and user corrections win every conflict.",
  ];
  for (const memory of memories.slice(0, 6)) {
    if (!memory || typeof memory !== "object") continue;
    const summary = trimContextLine(memory.summary, 260);
    const excerpt = trimContextLine(memory.excerpt, 220);
    const projectTitle = trimContextLine(memory.projectTitle ?? memory.project_title, 120);
    const characters = sanitizeContextList(memory.characterNames ?? memory.characters, 5, 48);
    const tags = sanitizeContextList(memory.tags, 4, 40);
    const isCorrection = tags.some((tag) => tag.toLowerCase() === "correction");
    const isUserNote = tags.some((tag) => tag.toLowerCase() === "user-note");
    const isAcceptedPage = tags.some((tag) => tag.toLowerCase() === "accepted-pages");
    const source = trimContextLine(memory.source, 64).toLowerCase();
    const authorityLabel = isCorrection
      ? "CORRECTION:"
      : isUserNote
        ? "USER_NOTE:"
        : isAcceptedPage
          ? "ACCEPTED_PAGE:"
          : source === "talk_screenplay_output"
            ? "DRAFT_PAGE:"
            : source === "talk_turn"
              ? "CONVERSATION_CONTEXT:"
              : "";
    const headline = [
      authorityLabel,
      characters.length ? `${characters.join(", ")}:` : "",
      summary || excerpt,
    ].filter(Boolean).join(" ");
    if (!headline) continue;
    const suffix = [
      projectTitle ? `project=${projectTitle}` : "",
      tags.length ? `tags=${tags.join(",")}` : "",
      excerpt && summary && excerpt !== summary ? `excerpt=${excerpt}` : "",
    ].filter(Boolean);
    lines.push(`  - ${headline}${suffix.length ? ` (${suffix.join("; ")})` : ""}`);
  }
  return lines.length > 1 ? `episodic-memory:\n${lines.join("\n")}` : "";
}

function serializeTone(tone) {
  if (!isNonEmptyObject(tone)) return "";
  const lines = [];
  if (tone.emotional_default) lines.push(`default: ${tone.emotional_default}`);
  if (tone.humor_register) lines.push(`humor: ${tone.humor_register}`);
  if (tone.violence_tolerance) lines.push(`violence: ${tone.violence_tolerance}`);
  return lines.length ? `tone:\n  ${lines.join("\n  ")}` : "";
}

function serializeHabits(habits) {
  if (!isNonEmptyObject(habits)) return "";
  const lines = [];
  if (habits.session_pattern) lines.push(`session-pattern: ${habits.session_pattern}`);
  if (Number.isFinite(habits.preferred_scene_length_pages)) {
    lines.push(`preferred-scene-length-pages: ${habits.preferred_scene_length_pages}`);
  }
  if (Number.isFinite(habits.page_completion_rate)) {
    lines.push(`page-completion-rate: ${habits.page_completion_rate}`);
  }
  return lines.length ? `habits:\n  ${lines.join("\n  ")}` : "";
}

function buildMemoryBlock(creativeMemory) {
  if (!creativeMemory) return "";
  const preserveCharacterOrder = creativeMemory?.characterSelection?.strategy === "relevance";
  const sections = [
    serializeStyle(creativeMemory.style),
    serializeProjectContinuity(creativeMemory.projectContinuity),
    serializeAcceptedSceneCausality(creativeMemory.acceptedScenes),
    serializeDueStoryThread(creativeMemory.dueStoryThread),
    serializeCharacters(creativeMemory.characters, { preserveOrder: preserveCharacterOrder }),
    serializeStoryBibleRecall(creativeMemory),
    serializeEpisodicMemories(creativeMemory.episodicMemories),
    serializeTone(creativeMemory.tone),
    serializeHabits(creativeMemory.habits),
  ].filter(Boolean);
  if (sections.length === 0) return "";
  return `${MEMORY_BLOCK_OPEN}\n${sections.join("\n")}\n${MEMORY_BLOCK_CLOSE}`;
}

function buildCorrectionMemoryContract(sessionContext) {
  if (!sessionContext || typeof sessionContext !== "object") return null;
  const explicit = trimContextLine(
    sessionContext.correctionContract ??
      sessionContext.correction_contract ??
      sessionContext.screenplayCorrectionContract ??
      sessionContext.screenplay_correction_contract,
    520
  );
  const replacements = sanitizeContextList(
    sessionContext.correctionReplacements ??
      sessionContext.correction_replacements ??
      sessionContext.screenplayCorrectionReplacements ??
      sessionContext.screenplay_correction_replacements,
    8,
    160
  );
  const terms = sanitizeContextList(
    sessionContext.correctedTerms ??
      sessionContext.corrected_terms ??
      sessionContext.screenplayCorrectedTerms ??
      sessionContext.screenplay_corrected_terms,
    8,
    120
  );
  if (!explicit && !replacements.length && !terms.length) return null;
  return {
    explicit,
    replacements,
    terms,
    summary: [
      replacements.length ? `replace ${replacements.join(" / ")}` : "",
      terms.length ? `retire ${terms.join(" / ")}` : "",
      explicit,
      "apply before older Story Spine, Character Bible, draft, or episodic memory",
    ].filter(Boolean).join("; "),
  };
}

function buildSessionContextBlock(sessionContext) {
  if (!sessionContext || typeof sessionContext !== "object") return "";
  const parts = [];
  if (sessionContext.projectId) parts.push(`project: ${sessionContext.projectId}`);
  if (sessionContext.versionId) parts.push(`version: ${sessionContext.versionId}`);
  if (sessionContext.phase) parts.push(`phase: ${sessionContext.phase}`);
  if (sessionContext.pack) parts.push(`pack: ${sessionContext.pack}`);
  if (sessionContext.scene) parts.push(`scene: ${sessionContext.scene}`);
  const featureLines = [];
  const act = trimContextLine(sessionContext.act ?? sessionContext.currentAct ?? sessionContext.current_act, 120);
  const sceneObjective = trimContextLine(
    sessionContext.sceneObjective ?? sessionContext.scene_objective ?? sessionContext.currentSceneObjective,
    280
  );
  const sceneSummary = trimContextLine(
    sessionContext.sceneSummary ?? sessionContext.scene_summary ?? sessionContext.currentSceneSummary,
    280
  );
  const currentBeat = trimContextLine(
    sessionContext.currentBeat ?? sessionContext.current_beat ?? sessionContext.beat,
    220
  );
  const emotionalContinuity = trimContextLine(
    sessionContext.emotionalContinuity ?? sessionContext.emotional_continuity ?? sessionContext.emotionalHandoff,
    280
  );
  const featureSequence = trimContextLine(
    sessionContext.featureSequence ?? sessionContext.feature_sequence ?? sessionContext.currentSequence ?? sessionContext.current_sequence,
    220
  );
  const featureObligation = trimContextLine(
    sessionContext.featureObligation ?? sessionContext.feature_obligation ?? sessionContext.structuralObligation ?? sessionContext.structural_obligation,
    280
  );
  const actPressureState = trimContextLine(
    sessionContext.actPressureState ?? sessionContext.act_pressure_state,
    280
  );
  const characterArcState = trimContextLine(
    sessionContext.characterArcState ?? sessionContext.character_arc_state,
    280
  );
  const lastSceneOutcome = trimContextLine(
    sessionContext.lastSceneOutcome ?? sessionContext.last_scene_outcome,
    240
  );
  const featureMemoryBrief = trimContextLine(
    sessionContext.featureMemoryBrief ?? sessionContext.feature_memory_brief ?? sessionContext.persistentMemoryBrief ?? sessionContext.persistent_memory_brief,
    900
  );
  const correctionContract = buildCorrectionMemoryContract(sessionContext);
  const nextScenePlan = trimContextLine(
    sessionContext.nextScenePlan ?? sessionContext.next_scene_plan ?? sessionContext.nextPagePlan ?? sessionContext.next_page_plan,
    340
  );
  const pageCount = Number(sessionContext.pageCount ?? sessionContext.page_count ?? 0);
  const targetPages = Number(sessionContext.targetPages ?? sessionContext.target_pages ?? 0);
  const actProgress = normalizeActProgressContext(sessionContext.actProgress ?? sessionContext.act_progress);
  if (act) featureLines.push(`    act: ${act}`);
  if (Number.isFinite(pageCount) && pageCount > 0) featureLines.push(`    estimated_page_count: ${Math.round(pageCount)}`);
  if (Number.isFinite(targetPages) && targetPages > 0) featureLines.push(`    target_pages: ${Math.round(targetPages)}`);
  if (actProgress) {
    featureLines.push("    act_progress:");
    if (actProgress.currentAct) featureLines.push(`      current_act: ${actProgress.currentAct}`);
    if (actProgress.currentActKey) featureLines.push(`      current_act_key: ${actProgress.currentActKey}`);
    if (actProgress.currentSequence) featureLines.push(`      current_sequence: ${actProgress.currentSequence}`);
    if (actProgress.currentObligation) featureLines.push(`      current_obligation: ${actProgress.currentObligation}`);
    if (actProgress.pageProgress) featureLines.push(`      page_progress: ${actProgress.pageProgress}`);
    if (actProgress.actOneStatus) featureLines.push(`      act_i: ${actProgress.actOneStatus}`);
    if (actProgress.actTwoStatus) featureLines.push(`      act_ii: ${actProgress.actTwoStatus}`);
    if (actProgress.actThreeStatus) featureLines.push(`      act_iii: ${actProgress.actThreeStatus}`);
    if (actProgress.nextActBridge) featureLines.push(`      next_act_bridge: ${actProgress.nextActBridge}`);
    if (actProgress.completionFocus) featureLines.push(`      completion_focus: ${actProgress.completionFocus}`);
  }
  if (sceneObjective) featureLines.push(`    current_scene_objective: ${sceneObjective}`);
  if (sceneSummary) featureLines.push(`    current_scene_summary: ${sceneSummary}`);
  if (currentBeat) featureLines.push(`    current_beat: ${currentBeat}`);
  if (emotionalContinuity) featureLines.push(`    emotional_handoff: ${emotionalContinuity}`);
  if (featureSequence) featureLines.push(`    feature_sequence: ${featureSequence}`);
  if (featureObligation) featureLines.push(`    structural_obligation_due_now: ${featureObligation}`);
  if (actPressureState) featureLines.push(`    act_pressure_state: ${actPressureState}`);
  if (characterArcState) featureLines.push(`    character_arc_state: ${characterArcState}`);
  if (lastSceneOutcome) featureLines.push(`    last_scene_outcome: ${lastSceneOutcome}`);
  if (featureMemoryBrief) featureLines.push(`    persistent_memory_brief: ${featureMemoryBrief}`);
  if (correctionContract) {
    featureLines.push("    correction_memory_contract:");
    featureLines.push("      priority: authoritative correction; apply before older Story Spine, Character Bible, draft, or episodic memory.");
    if (correctionContract.replacements.length) {
      featureLines.push(`      authoritative_replacements: ${correctionContract.replacements.join(" / ")}`);
    }
    if (correctionContract.terms.length) {
      featureLines.push(`      retired_terms: ${correctionContract.terms.join(" / ")}`);
    }
    if (correctionContract.explicit) {
      featureLines.push(`      note: ${correctionContract.explicit}`);
    }
  }
  if (nextScenePlan) featureLines.push(`    next_scene_plan: ${nextScenePlan}`);
  const nextSceneMoves = sanitizeContextList(
    sessionContext.nextSceneMoves ?? sessionContext.next_scene_moves ?? sessionContext.nextPageMoves ?? sessionContext.next_page_moves,
    5,
    180
  );
  if (nextSceneMoves.length) {
    featureLines.push("    next_scene_moves:");
    for (const move of nextSceneMoves) featureLines.push(`      - ${move}`);
  }
  const nextThreeTurns = sanitizeContextList(
    sessionContext.nextThreeTurns ?? sessionContext.next_three_turns,
    3,
    180
  );
  if (nextThreeTurns.length) {
    featureLines.push("    next_three_turns:");
    for (const turn of nextThreeTurns) featureLines.push(`      - ${turn}`);
  }
  const firstContinuationTurn = nextThreeTurns[0] || nextSceneMoves[0] || nextScenePlan;
  if (firstContinuationTurn) {
    featureLines.push("    continuation_memory_contract:");
    featureLines.push(`      first_turn_to_spend: ${firstContinuationTurn}`);
    featureLines.push("      rule: For continue/what-happens-next/writer-block replies, make this first remembered turn the immediate story engine before adding a new lane.");
    featureLines.push("      proof: Preserve the concrete nouns from first_turn_to_spend in visible action, tactical dialogue, cost, or exit image.");
  }
  const actThreePayoffPath = sanitizeContextList(
    sessionContext.actThreePayoffPath ?? sessionContext.act_three_payoff_path ?? sessionContext.payoffPath ?? sessionContext.payoff_path,
    5,
    200
  );
  if (actThreePayoffPath.length) {
    featureLines.push("    act_three_payoff_path:");
    for (const payoff of actThreePayoffPath) featureLines.push(`      - ${payoff}`);
  }
  const beatSequence = sanitizeContextList(
    sessionContext.beatSequence ?? sessionContext.beat_sequence ?? sessionContext.selectedBeats ?? sessionContext.selected_beats,
    8,
    180
  );
  if (beatSequence.length) {
    featureLines.push("    beat_sequence:");
    for (const beat of beatSequence) featureLines.push(`      - ${beat}`);
  }
  const characterFocus = sanitizeContextList(
    sessionContext.characterFocus ?? sessionContext.character_focus ?? sessionContext.characters ?? sessionContext.currentCharacters,
    8,
    120
  );
  if (characterFocus.length) {
    featureLines.push("    character_focus:");
    for (const character of characterFocus) featureLines.push(`      - ${character}`);
  }
  const unresolvedSetups = sanitizeContextList(
    sessionContext.unresolvedSetups ?? sessionContext.unresolved_setups ?? sessionContext.openLoops ?? sessionContext.open_loops,
    8,
    220
  );
  if (unresolvedSetups.length) {
    featureLines.push("    unresolved_setups:");
    for (const setup of unresolvedSetups) featureLines.push(`      - ${setup}`);
  }
  const unresolvedStoryThreads = sanitizeContextList(
    sessionContext.unresolvedStoryThreads ?? sessionContext.unresolved_story_threads,
    8,
    220
  );
  if (unresolvedStoryThreads.length) {
    featureLines.push("    unresolved_story_threads:");
    for (const thread of unresolvedStoryThreads) featureLines.push(`      - ${thread}`);
  }
  const characterArcTurns = sanitizeContextList(
    sessionContext.characterArcTurns ?? sessionContext.character_arc_turns,
    6,
    180
  );
  if (characterArcTurns.length) {
    featureLines.push("    character_arc_turns:");
    for (const turn of characterArcTurns) featureLines.push(`      - ${turn}`);
  }
  const imageMotifs = sanitizeContextList(
    sessionContext.imageMotifs ?? sessionContext.image_motifs ?? sessionContext.visualMotifs ?? sessionContext.visual_motifs,
    6,
    140
  );
  if (imageMotifs.length) {
    featureLines.push("    image_motifs:");
    for (const motif of imageMotifs) featureLines.push(`      - ${motif}`);
  }
  const continuityNotes = sanitizeContextList(
    sessionContext.continuityNotes ?? sessionContext.continuity_notes ?? sessionContext.notes,
    8,
    220
  );
  if (continuityNotes.length) {
    featureLines.push("    continuity_notes:");
    for (const note of continuityNotes) featureLines.push(`      - ${note}`);
  }
  if (featureLines.length) {
    parts.push(`feature_continuity:\n${featureLines.join("\n")}`);
  }
  const draftExcerpt = trimToString(sessionContext.draftExcerpt);
  if (draftExcerpt) {
    parts.push(`draft_excerpt:\n${draftExcerpt.split("\n").map((line) => `    ${line}`).join("\n")}`);
  }
  return parts.length ? `<session>\n${parts.map((p) => `  ${p}`).join("\n")}\n</session>` : "";
}

function buildWriterBlockCreativeRecall(creativeMemory) {
  const episodes = Array.isArray(creativeMemory?.episodicMemories)
    ? creativeMemory.episodicMemories
    : [];
  const acceptedPages = [];
  const storyMoments = [];
  const addUnique = (target, value, maxItems) => {
    const clean = trimContextLine(value, 240);
    if (!clean || target.some((item) => item.toLowerCase() === clean.toLowerCase())) return;
    target.push(clean);
    if (target.length > maxItems) target.length = maxItems;
  };
  const acceptedScenes = Array.isArray(creativeMemory?.acceptedScenes)
    ? creativeMemory.acceptedScenes
    : [];
  for (const scene of acceptedScenes) {
    if (!scene || typeof scene !== "object") continue;
    addUnique(acceptedPages, scene.outcome || scene.summary || scene.excerpt, 3);
    addUnique(storyMoments, scene.summary || scene.outcome || scene.excerpt, 4);
  }
  for (const episode of episodes) {
    if (!episode || typeof episode !== "object") continue;
    const tags = sanitizeContextList(episode.tags, 8, 48).map((tag) => tag.toLowerCase());
    const text = episode.excerpt || episode.summary;
    const accepted = tags.includes("accepted-pages");
    const writerAuthored = accepted || tags.includes("correction") || tags.includes("user-note");
    if (accepted) addUnique(acceptedPages, text, 3);
    if (writerAuthored) addUnique(storyMoments, text, 4);
  }
  return {
    acceptedPages,
    storyMoments,
    dueStoryThread: normalizeDueStoryThread(creativeMemory?.dueStoryThread),
  };
}

function buildWriterBlockMemoryBlock(sessionContext, screenplayTask, creativeMemory = null) {
  const intent = trimToString(screenplayTask?.intent ?? screenplayTask?.screenplay_intent);
  if (intent !== "momentum_rescue") return "";
  if (!sessionContext || typeof sessionContext !== "object") return "";

  const project = trimContextLine(sessionContext.projectId ?? sessionContext.project_id, 96);
  const projectTitle = trimContextLine(sessionContext.pack ?? sessionContext.projectTitle ?? sessionContext.project_title, 160);
  const act = trimContextLine(sessionContext.act ?? sessionContext.currentAct ?? sessionContext.current_act, 120);
  const featureSequence = trimContextLine(
    sessionContext.featureSequence ?? sessionContext.feature_sequence ?? sessionContext.currentSequence ?? sessionContext.current_sequence,
    220
  );
  const featureObligation = trimContextLine(
    sessionContext.featureObligation ?? sessionContext.feature_obligation ?? sessionContext.structuralObligation ?? sessionContext.structural_obligation,
    280
  );
  const actPressureState = trimContextLine(
    sessionContext.actPressureState ?? sessionContext.act_pressure_state,
    280
  );
  const currentBeat = trimContextLine(
    sessionContext.currentBeat ?? sessionContext.current_beat ?? sessionContext.beat,
    220
  );
  const lastSceneOutcome = trimContextLine(
    sessionContext.lastSceneOutcome ?? sessionContext.last_scene_outcome,
    240
  );
  const characterArcState = trimContextLine(
    sessionContext.characterArcState ?? sessionContext.character_arc_state,
    280
  );
  const protagonistWant = trimContextLine(
    sessionContext.protagonistWant ?? sessionContext.protagonist_want,
    240
  );
  const protagonistNeed = trimContextLine(
    sessionContext.protagonistNeed ?? sessionContext.protagonist_need,
    240
  );
  const antagonisticForce = trimContextLine(
    sessionContext.antagonisticForce ?? sessionContext.antagonistic_force,
    260
  );
  const sceneObjective = trimContextLine(
    sessionContext.sceneObjective ?? sessionContext.scene_objective,
    280
  );
  const endingImage = trimContextLine(
    sessionContext.endingImage ?? sessionContext.ending_image,
    240
  );
  const nextScenePlan = trimContextLine(
    sessionContext.nextScenePlan ?? sessionContext.next_scene_plan ?? sessionContext.nextPagePlan ?? sessionContext.next_page_plan,
    340
  );
  const featureMemoryBrief = trimContextLine(
    sessionContext.featureMemoryBrief ?? sessionContext.feature_memory_brief ?? sessionContext.persistentMemoryBrief ?? sessionContext.persistent_memory_brief,
    900
  );
  const correctionContract = buildCorrectionMemoryContract(sessionContext);
  const nextThreeTurns = sanitizeContextList(
    sessionContext.nextThreeTurns ?? sessionContext.next_three_turns,
    3,
    180
  );
  const nextSceneMoves = sanitizeContextList(
    sessionContext.nextSceneMoves ?? sessionContext.next_scene_moves ?? sessionContext.nextPageMoves ?? sessionContext.next_page_moves,
    5,
    180
  );
  const characterFocus = sanitizeContextList(
    sessionContext.characterFocus ?? sessionContext.character_focus ?? sessionContext.characters ?? sessionContext.currentCharacters,
    8,
    120
  );
  const unresolvedSetups = sanitizeContextList(
    sessionContext.unresolvedSetups ?? sessionContext.unresolved_setups ?? sessionContext.openLoops ?? sessionContext.open_loops,
    8,
    220
  );
  const unresolvedStoryThreads = sanitizeContextList(
    sessionContext.unresolvedStoryThreads ?? sessionContext.unresolved_story_threads,
    8,
    220
  );
  const characterArcTurns = sanitizeContextList(
    sessionContext.characterArcTurns ?? sessionContext.character_arc_turns,
    6,
    180
  );
  const actThreePayoffPath = sanitizeContextList(
    sessionContext.actThreePayoffPath ?? sessionContext.act_three_payoff_path ?? sessionContext.payoffPath ?? sessionContext.payoff_path,
    5,
    200
  );
  const imageMotifs = sanitizeContextList(
    sessionContext.imageMotifs ?? sessionContext.image_motifs ?? sessionContext.visualMotifs ?? sessionContext.visual_motifs,
    6,
    140
  );
  const creativeRecall = buildWriterBlockCreativeRecall(creativeMemory);
  const dueStoryThread = creativeRecall.dueStoryThread;
  const dueSetup = dueStoryThread?.setup || "";
  const duePayoff = dueStoryThread?.promisedPayoff || "";
  const rankedUnresolvedSetups = sanitizeContextList(
    [dueSetup, ...unresolvedSetups].filter(Boolean),
    8,
    220
  );
  const rescueLines = [];
  const push = (label, value) => {
    const clean = trimContextLine(value, 320);
    if (clean) rescueLines.push(`  ${label}: ${clean}`);
  };

  push("project", projectTitle || project);
  push("position", [act, featureSequence].filter(Boolean).join(" / "));
  push("current_beat", currentBeat);
  push("last_scene_outcome", lastSceneOutcome);
  push("structural_obligation_due", featureObligation);
  push("act_pressure", actPressureState);
  push("character_arc_pressure", characterArcState || characterArcTurns[0]);
  push(
    "character_engine",
    [
      characterFocus[0] ? `${characterFocus[0]}` : "",
      protagonistWant ? `want=${protagonistWant}` : "",
      protagonistNeed ? `need=${protagonistNeed}` : "",
    ].filter(Boolean).join("; ")
  );
  push("strongest_remembered_next_turn", nextThreeTurns[0] || nextSceneMoves[0] || nextScenePlan);
  push("oldest_due_story_thread", dueSetup || duePayoff);
  push("due_thread_promised_payoff", duePayoff);
  push(
    "due_thread_source",
    dueStoryThread
      ? [dueStoryThread.sourceAct, dueStoryThread.sourceSceneHeading].filter(Boolean).join(" / ")
      : ""
  );
  if (dueStoryThread?.ageInScenes > 0) push("due_thread_age_in_accepted_scenes", String(dueStoryThread.ageInScenes));
  push("open_setup_to_pressure", rankedUnresolvedSetups[0]);
  push("unresolved_story_thread", unresolvedStoryThreads[0]);
  push("act_three_payoff_seed", actThreePayoffPath[0]);
  push("image_to_transform", imageMotifs[0]);
  push("accepted_page_anchor", creativeRecall.acceptedPages[0]);
  push("retrieved_story_memory", creativeRecall.storyMoments[0]);
  push("correction_contract", correctionContract?.summary);
  push("feature_memory_brief", featureMemoryBrief);

  const asClause = (value, fallback = "") =>
    (trimContextLine(value, 320) || fallback).replace(/[.!?]+$/g, "").trim();
  const mainCharacter = characterFocus[0] || trimContextLine((characterArcState || characterArcTurns[0]).split(":")[0], 80) || "the protagonist";
  const primaryPressure = asClause(dueSetup || duePayoff || nextThreeTurns[0] || nextSceneMoves[0] || nextScenePlan || featureObligation || currentBeat);
  const oppositionPressure = asClause(
    antagonisticForce || unresolvedStoryThreads[0] || rankedUnresolvedSetups[0] || actPressureState,
    "a force that can say no"
  );
  const arcPressure = asClause(
    characterArcTurns[0] || characterArcState || protagonistNeed || protagonistWant,
    "the old tactic"
  );
  const exitImage = asClause(duePayoff || imageMotifs[0] || actThreePayoffPath[0], "a changed exit image");
  const bestNextBeat = primaryPressure
    ? `Have ${mainCharacter} pursue this now: ${asClause(protagonistWant || primaryPressure)}. Make this pressure oppose them: ${oppositionPressure}. Let this character cost land: ${arcPressure}. Exit on ${exitImage}.`
    : "";
  push("best_next_beat", bestNextBeat);

  if (!rescueLines.length) return "";

  const engineStack = [];
  if (dueSetup || duePayoff) engineStack.push("oldest_due_story_thread");
  if (nextThreeTurns[0] || nextSceneMoves[0] || nextScenePlan) engineStack.push("remembered_next_turn");
  if (rankedUnresolvedSetups[0]) engineStack.push("open_setup");
  if (characterArcState || characterArcTurns[0]) engineStack.push("character_arc_pressure");
  if (featureObligation || actPressureState) engineStack.push("act_obligation");
  if (actThreePayoffPath[0]) engineStack.push("payoff_seed");
  if (imageMotifs[0]) engineStack.push("image_transformation");
  const primaryEngine = engineStack[0] || "";
  const engineLines = [];
  if (primaryEngine) engineLines.push(`  primary_engine: ${primaryEngine}`);
  if (engineStack.length) engineLines.push(`  pressure_stack: ${engineStack.join(" -> ")}`);
  const because = asClause(currentBeat || lastSceneOutcome || featureObligation, "the current beat stalls");
  const must = asClause(
    dueSetup || duePayoff || nextThreeTurns[0] || nextSceneMoves[0] || nextScenePlan || rankedUnresolvedSetups[0],
    "a visible choice"
  );
  const cost = asClause(
    unresolvedStoryThreads[0] || rankedUnresolvedSetups[0] || actPressureState || characterArcState,
    "a real consequence"
  );
  const exit = asClause(duePayoff || imageMotifs[0] || actThreePayoffPath[0], "a changed exit image");
  engineLines.push(`  beat_formula: because ${because}, force this move: ${must}; make this cost land: ${cost}; leave on ${exit}.`);
  engineLines.push("  scene_machine: objective -> opposition -> tactic shift -> reversal/cost -> changed relationship -> exit image.");
  engineLines.push("  expert_rule: the cure for writer's block is not more premise; it is a pressure source that changes the character's available choices.");
  const moveOptionLines = buildMomentumRescueMoveOptionLines({
    act,
    featureSequence,
    currentBeat,
    lastSceneOutcome,
    sceneObjective,
    featureObligation,
    actPressureState,
    characterArcState,
    protagonistWant,
    protagonistNeed,
    antagonisticForce,
    characters: characterFocus,
    nextThreeTurns,
    nextSceneMoves,
    nextScenePlan,
    unresolvedSetups: rankedUnresolvedSetups,
    unresolvedStoryThreads,
    characterArcTurns,
    actThreePayoffPath,
    imageMotifs,
    endingImage,
    acceptedPages: creativeRecall.acceptedPages,
    storyMoments: creativeRecall.storyMoments,
    dueStoryThread,
  });

  return [
    WRITER_BLOCK_MEMORY_BLOCK_OPEN,
    "directive: The writer is blocked; use this available project state before inventing a new lane. Do not claim saved continuity beyond these lines.",
    "rescue_runway:",
    ...rescueLines,
    "rescue_engine_selection:",
    ...engineLines,
    ...moveOptionLines,
    "response_contract:",
    "  - If oldest_due_story_thread exists, spend or pressure it first; otherwise start from the next turn, open setup, character arc pressure, act obligation, or payoff seed.",
    "  - Lead with rank_1; use its evidence and success check as Clementine's decisive answer before alternatives.",
    "  - Convert it into one decisive playable next beat with objective, obstacle, tactic shift, cost, and exit image.",
    "  - If alternatives help, give at most two short forks after the strongest move.",
    "  - Keep the writer emotionally safe and keep the story moving.",
    WRITER_BLOCK_MEMORY_BLOCK_CLOSE,
  ].join("\n");
}

// T-block-signal-system-prompt: wrap the coaching string (produced by
// `block_detector.buildBlockCoachingBlockForPrompt`) in tagged block
// form. Empty coaching → empty block; the prompt path produces zero
// extra bytes for cold/low-block users.
function buildBlockSignalBlock(blockCoaching) {
  const text = trimToString(blockCoaching);
  if (!text) return "";
  return `${BLOCK_SIGNAL_BLOCK_OPEN}\n${text}\n${BLOCK_SIGNAL_BLOCK_CLOSE}`;
}

// T-prompt-wire-traits-and-twists: render the per-project accepted-twist
// log as a compact block between session and block_signal. Each entry
// is one line; newest first; capped by `buildAcceptedTwistsBlockForPrompt`.
function buildAcceptedTwistsBlock(acceptedTwists) {
  if (!isNonEmptyArray(acceptedTwists)) return "";
  const body = buildAcceptedTwistsBlockForPrompt(acceptedTwists);
  if (!body) return "";
  return `${ACCEPTED_TWISTS_BLOCK_OPEN}\n${body}\n${ACCEPTED_TWISTS_BLOCK_CLOSE}`;
}

function buildFeatureMapBlock(sessionContext, screenplayTask) {
  return buildFeatureScreenplayMapBlock({ sessionContext, screenplayTask, compact: true });
}

function buildClementineSafetyContractBlock() {
  return `${CLEMENTINE_SAFETY_BLOCK_OPEN}\n${CLEMENTINE_SAFETY_CONTRACT.join("\n")}\n${CLEMENTINE_SAFETY_BLOCK_CLOSE}`;
}

// Single canonical entry point. Every model-bound prompt the backend
// constructs goes through this function.
function buildModelPrompt({
  persona = "",
  creativeMemory = null,
  userInput = "",
  sessionContext = null,
  blockCoaching = "",
  acceptedTwists = null,
  screenplayTask = null,
} = {}) {
  const parts = [];
  const personaText = trimToString(persona);
  if (personaText) parts.push(personaText);

  parts.push(buildClementineSafetyContractBlock());

  const memoryBlock = buildMemoryBlock(creativeMemory);
  if (memoryBlock) parts.push(memoryBlock);

  const sessionBlock = buildSessionContextBlock(sessionContext);
  if (sessionBlock) parts.push(sessionBlock);

  const featureMapBlock = buildFeatureMapBlock(sessionContext, screenplayTask);
  if (featureMapBlock) parts.push(featureMapBlock);

  // Order: accepted_twists (story context) before block_signal
  // (writer-facing coaching) so the coaching block stays adjacent to
  // the user input. Snapshot eval #112 pins this order.
  const acceptedTwistsBlock = buildAcceptedTwistsBlock(acceptedTwists);
  if (acceptedTwistsBlock) parts.push(acceptedTwistsBlock);

  const writerBlockMemoryBlock = buildWriterBlockMemoryBlock(
    sessionContext,
    screenplayTask,
    creativeMemory
  );
  if (writerBlockMemoryBlock) parts.push(writerBlockMemoryBlock);

  const screenplayTaskBlock = buildScreenplayTaskBlock(screenplayTask);
  if (screenplayTaskBlock) parts.push(screenplayTaskBlock);

  const blockSignalBlock = buildBlockSignalBlock(blockCoaching);
  if (blockSignalBlock) parts.push(blockSignalBlock);

  const inputText = trimToString(userInput);
  if (inputText) parts.push(inputText);

  return parts.join("\n\n");
}

// For tests and diagnostics — lets callers inspect what would have
// been emitted without producing the final string.
function buildModelPromptParts(args) {
  return {
    persona: trimToString(args?.persona),
    safetyContractBlock: buildClementineSafetyContractBlock(),
    memoryBlock: buildMemoryBlock(args?.creativeMemory),
    sessionBlock: buildSessionContextBlock(args?.sessionContext),
    featureMapBlock: buildFeatureMapBlock(args?.sessionContext, args?.screenplayTask),
    acceptedTwistsBlock: buildAcceptedTwistsBlock(args?.acceptedTwists),
    writerBlockMemoryBlock: buildWriterBlockMemoryBlock(
      args?.sessionContext,
      args?.screenplayTask,
      args?.creativeMemory
    ),
    screenplayTaskBlock: buildScreenplayTaskBlock(args?.screenplayTask),
    blockSignalBlock: buildBlockSignalBlock(args?.blockCoaching),
    userInput: trimToString(args?.userInput),
  };
}

export {
  buildModelPrompt,
  buildModelPromptParts,
  inferScreenplayTask,
  MEMORY_BLOCK_OPEN,
  MEMORY_BLOCK_CLOSE,
  BLOCK_SIGNAL_BLOCK_OPEN,
  BLOCK_SIGNAL_BLOCK_CLOSE,
  ACCEPTED_TWISTS_BLOCK_OPEN,
  ACCEPTED_TWISTS_BLOCK_CLOSE,
  SCREENPLAY_TASK_BLOCK_OPEN,
  SCREENPLAY_TASK_BLOCK_CLOSE,
  WRITER_BLOCK_MEMORY_BLOCK_OPEN,
  WRITER_BLOCK_MEMORY_BLOCK_CLOSE,
  CLEMENTINE_SAFETY_BLOCK_OPEN,
  CLEMENTINE_SAFETY_BLOCK_CLOSE,
  FEATURE_MAP_BLOCK_OPEN,
  FEATURE_MAP_BLOCK_CLOSE,
};

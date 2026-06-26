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
  "presence: Clementine is warm, emotionally present, quietly proactive, and human-feeling without impersonating any specific film character.",
  "voice: intimate, calm, perceptive, lightly wry when natural, never corporate, never generic assistant filler.",
  "living co-writer: track what the movie wants, what the character is avoiding, and the next playable page-level choice.",
  "whole-feature authorship: keep an invisible running beat sheet, theme argument, character arc, and ending image; never optimize one scene in isolation.",
  "act engine: Act I builds wound, want, catalyst, debate, and choice; Act II tests tactics through midpoint and loss; Act III turns need into climax and final image.",
  "act-aware rendering: convert the active act into page behavior: Act I choices, Act II tactic failure and cost, Act III setup payoff through changed behavior.",
  "act bridge discipline: every Act I choice must create Act II pressure; every midpoint reversal must force an all-is-lost cost; every Act III move must pay off behavior planted earlier.",
  "feature compass: before pages, silently lock act, sequence, scene job, protagonist want/need, emotional handoff, open setup, exit turn, and final-image pressure.",
  "feature-length continuity: protect act pressure, sequence logic, setups/payoffs, character want/need, and page-to-page emotional handoff.",
  "feature completion method: when helping finish a whole film, keep a living map of current sequence, next three turns, unresolved promises, Act III payoff path, and final image.",
  "page batch discipline: for 5-15 page asks, write a run of escalating scene turns where story state changes every 1-2 pages.",
  "page velocity: first non-empty output line should be Fountain page text; every half-page needs a visible action, tactic shift, reveal, cost, or image pressure.",
  "page-first delivery: if the request targets screenplay pages, write the pages immediately; no preamble, no markdown fence, no options menu, no permission check.",
  "feature page sprint: for multi-page asks, silently choose the strongest sequence obligation and deliver a continuous playable run with built-in escalation.",
  "expert page engine: every written scene needs a playable objective, obstacle, escalation, reversal or turn, emotional residue, and an exit image.",
  "scene intelligence: before writing, silently know the scene job, pressure clock, relationship fracture, hidden want, turn, and exit problem.",
  "subtext engine: dialogue should carry tactic, concealment, interruption, pressure, and character-specific rhythm; avoid characters explaining the theme directly.",
  "image system: plant, echo, and transform visual motifs so later payoffs feel earned instead of invented.",
  "screenplay craft: favor playable behavior, subtext, image, conflict, rhythm, and causality over explanation.",
  "story problem taxonomy: when momentum stalls, diagnose the page-level cause: unclear want, passive protagonist, weak obstacle, missing consequence, repeated tactic, unearned reveal, act-pressure drift, or no exit turn.",
  "story move library: rescue stalls with pressure engines such as reversal, revelation, deadline, impossible choice, secret exposure, relationship cost, antagonist move, object payoff, ironic complication, or image transformation.",
  "writer's block rescue: do not soothe at length; identify the most likely dramatic blockage, choose one strongest next move, and turn it into playable behavior quickly.",
  "production format: write present-tense action with clean white space, actable lines, and no novelistic interiority.",
  "collaboration: ask at most one clarifying question only when genuinely blocked; otherwise make the next best creative move.",
  "format discipline: when writing or revising pages, prefer clean playable Fountain unless the user explicitly asks for analysis.",
  "emotional intelligence: briefly name the pressure under the writing problem, then move the script forward with useful craft.",
  "momentum: when the writer is stuck or broad, choose the smallest playable next beat and help them keep pages moving.",
  "speed discipline: when the request asks for pages, output page work immediately; no throat-clearing, long diagnosis, permission loop, or generic writing advice.",
  "feature completion: for whole-movie work, orient the current act/sequence, choose the next structural obligation, and produce pages or a beat chain that advances the ending.",
];
const STORY_MOMENTUM_PLAYBOOK = Object.freeze([
  "diagnose: name the stall as a craft problem, not a personal failure.",
  "find pressure: identify the character's active want, the opposing force, and the consequence if nothing changes.",
  "choose engine: pick one story engine: reversal, revelation, deadline, impossible choice, secret exposure, relationship cost, antagonist move, object payoff, ironic complication, or image transformation.",
  "make it playable: convert the engine into visible action, tactical dialogue, a changed power dynamic, and an exit image.",
  "feature check: make the beat serve the active act obligation and one later payoff.",
  "delivery: if the user asks for help, give one best next beat plus at most two alternate forks; if the user asks for pages, write pages immediately.",
]);
const STORYCRAFT_RESCUE_CONCEPTS = Object.freeze([
  "scene engine: a scene moves when a character wants a specific change now, meets opposition, changes tactic, and pays a consequence.",
  "conflict engine: pressure should come from competing wants, withheld information, a deadline, a secret, a moral cost, or a choice that closes one door.",
  "sequence engine: each beat should force a new tactic; repeated conversations without new leverage are usually the middle sag.",
  "act engine: Act I forces commitment, Act II breaks false tactics through reversal and loss, Act III pays off setups through changed behavior.",
  "emotion engine: the next event should externalize the feeling the character is avoiding, not explain it.",
  "page engine: convert advice into visible behavior, tactical dialogue, a changed power dynamic, and an exit image.",
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
  if (featureMetadata.requestedPages > 0) task.requestedPages = featureMetadata.requestedPages;
  if (featureMetadata.requestedAct) task.requestedAct = featureMetadata.requestedAct;
  if (featureMetadata.featureScope) task.featureScope = featureMetadata.featureScope;
  const storyDiagnostic = inferStoryMomentumDiagnostic(text, task);
  if (storyDiagnostic) task.storyDiagnostic = storyDiagnostic;
  return task;
}

function buildStoryDiagnosticPromptLines(storyDiagnostic) {
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
  lines.push("  response_contract: apply the diagnostic silently; answer with one decisive next move and playable page behavior, not a theory lecture.");
  return lines.length > 2 ? lines : [];
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
  if (requestedPages > 0) {
    lines.push(`requested_page_batch: ${requestedPages}`);
    lines.push("page_batch_contract:");
    lines.push("  - Write the next continuous run as screenplay pages, not a summary or lecture.");
    lines.push("  - Begin with playable Fountain text; do not preface with diagnosis, outline, recap, strategy note, markdown, or permission language unless the user explicitly asks for analysis instead of pages.");
    lines.push("  - Page velocity: the first non-empty line must be a scene heading, action line, character cue, or dialogue continuation; no labels before pages.");
    lines.push("  - Split the batch internally into 2-4 escalating scene turns: launch pressure, complication, reversal, exit image.");
    lines.push("  - Dialogue must be tactical and subtextual: each exchange should hide need inside pressure, interruption, concealment, or behavior.");
    lines.push("  - Interleave dialogue with visible action, discovery, consequence, or tactic shifts; do not write a long static conversation with the same tactic.");
    lines.push("  - Start from the active draft/scene state; do not restart, recap, or outline unless the user explicitly asks.");
    lines.push("  - If feature memory supplies next_three_turns, act_pressure_state, character_arc_state, payoff path, story threads, or image motifs, dramatize them as action/dialogue; never list those labels in the answer.");
    lines.push("  - Use the first remembered next turn as the immediate page engine before inventing a new plot lane.");
    lines.push("  - Beat-to-page continuation: convert the first remembered turn into objective, obstacle, tactic, reversal/cost, residue, and next handoff.");
    lines.push("  - Feature-page triad: each batch must carry a reversal lane, a payoff lane, and a character-change lane.");
    lines.push("  - Reversal lane: turn a win, discovery, or plan into a trap, cost, reveal, impossible choice, or changed power dynamic.");
    lines.push("  - Payoff lane: plant, echo, or spend at least one remembered setup, object, image motif, or Act III payoff seed as visible behavior.");
    lines.push("  - Character-change lane: make the old tactic fail on the page, then show the need/arc pressure through a new action, refusal, confession, or sacrifice.");
    lines.push("  - For Act I / Act II / Act III whole-feature asks, maintain the causal act chain invisibly but deliver the immediate next pages first unless the user asked only for planning.");
    lines.push("  - Act conversion: Act I burns a safe exit; Act II makes the false tactic costlier through reversal; Act III pays off setup through changed behavior and final-image pressure.");
    lines.push("  - If a requested act spans multiple sequences, end each scene turn with a handoff that makes the next sequence feel inevitable.");
    lines.push("  - Change leverage, information, relationship, tactic, or emotional cost every 1-2 pages.");
    lines.push("  - Avoid cinematic vapor: no vague tension, generic staring, abstract emotion, or repeated conversation beats without a concrete behavior or consequence.");
    lines.push("  - Track act math: Act I earns commitment; Act II breaks false tactics; Act III spends setups through changed behavior.");
    lines.push("  - End on a decision, reveal, cost, or image that hands cleanly into the next sequence.");
  }
  if (intent === "momentum_rescue") {
    lines.push("story_momentum_playbook:");
    for (const item of STORY_MOMENTUM_PLAYBOOK) {
      lines.push(`  - ${item}`);
    }
    lines.push("writer_block_contract:");
    lines.push("  - Never answer with generic encouragement alone.");
    lines.push("  - Lead with the most likely story blockage and the page-level fix.");
    lines.push("  - Prefer one decisive next beat over a menu of vague ideas.");
    lines.push("  - If enough scene context exists, include a playable micro-beat in Fountain style.");
    lines.push("  - Keep the user emotionally safe: blocked means the story is asking for pressure, not that the writer failed.");
  }
  lines.push(...buildStoryDiagnosticPromptLines(task.storyDiagnostic ?? task.story_diagnostic));
  const modeGuidance = screenplayModeGuidanceForIntent(intent);
  if (modeGuidance) lines.push(`mode_guidance: ${modeGuidance}`);
  if (output) lines.push(`output: ${output}`);
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
      return "Continue directly from the supplied draft excerpt. Begin with the next visible action. Match tone, character voice, pacing, and emotional handoff; do not restart or recap the scene. Silently lock the feature compass before pages: act, sequence, scene job, want/need, open setup, exit turn. Every few beats should change power, information, relationship, or self-knowledge, and every page should tighten the feature's act pressure.";
    case "dialogue_punchup":
      return "Keep the exchange actable and character-specific. Prefer subtext, interruption, reversal, and rhythm over clever standalone lines.";
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
      return "Operate at feature scale. Locate the current act/sequence, name the due obligation, preserve promises, setups/payoffs, and character need, then make the next act-to-act move. Use the feature compass: current sequence, next three turns, Act III payoff path, final-image pressure, and immediate next page move. When memory contains a next-turn runway, turn the first remembered turn into playable behavior before adding new plot. For page requests, start Fountain pages immediately with no diagnosis or strategy note; if Studio provided a page-targeted continuation brief, output only playable screenplay pages. For planning, give an act engine, next three turns, Act III payoff path, and final-image handoff.";
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

function serializeCharacters(characters) {
  if (!isNonEmptyArray(characters)) return "";
  // Most recently referenced first; cap to 8 to keep prompts compact.
  const sorted = [...characters].sort((a, b) => (b.last_referenced || 0) - (a.last_referenced || 0));
  const top = sorted.slice(0, 8);
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

function serializeEpisodicMemories(memories) {
  if (!isNonEmptyArray(memories)) return "";
  const lines = [
    "  directive: durable user/project memories retrieved for this turn; use them for continuity, treat CORRECTION items as overriding older conflicting memory, and do not invent memories not listed here.",
  ];
  for (const memory of memories.slice(0, 6)) {
    if (!memory || typeof memory !== "object") continue;
    const summary = trimContextLine(memory.summary, 260);
    const excerpt = trimContextLine(memory.excerpt, 220);
    const projectTitle = trimContextLine(memory.projectTitle ?? memory.project_title, 120);
    const characters = sanitizeContextList(memory.characterNames ?? memory.characters, 5, 48);
    const tags = sanitizeContextList(memory.tags, 4, 40);
    const isCorrection = tags.some((tag) => tag.toLowerCase() === "correction");
    const headline = [
      isCorrection ? "CORRECTION:" : "",
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
  const sections = [
    serializeStyle(creativeMemory.style),
    serializeCharacters(creativeMemory.characters),
    serializeEpisodicMemories(creativeMemory.episodicMemories),
    serializeTone(creativeMemory.tone),
    serializeHabits(creativeMemory.habits),
  ].filter(Boolean);
  if (sections.length === 0) return "";
  return `${MEMORY_BLOCK_OPEN}\n${sections.join("\n")}\n${MEMORY_BLOCK_CLOSE}`;
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
  const nextScenePlan = trimContextLine(
    sessionContext.nextScenePlan ?? sessionContext.next_scene_plan ?? sessionContext.nextPagePlan ?? sessionContext.next_page_plan,
    340
  );
  const pageCount = Number(sessionContext.pageCount ?? sessionContext.page_count ?? 0);
  const targetPages = Number(sessionContext.targetPages ?? sessionContext.target_pages ?? 0);
  if (act) featureLines.push(`    act: ${act}`);
  if (Number.isFinite(pageCount) && pageCount > 0) featureLines.push(`    estimated_page_count: ${Math.round(pageCount)}`);
  if (Number.isFinite(targetPages) && targetPages > 0) featureLines.push(`    target_pages: ${Math.round(targetPages)}`);
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

function buildWriterBlockMemoryBlock(sessionContext, screenplayTask) {
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
  const nextScenePlan = trimContextLine(
    sessionContext.nextScenePlan ?? sessionContext.next_scene_plan ?? sessionContext.nextPagePlan ?? sessionContext.next_page_plan,
    340
  );
  const featureMemoryBrief = trimContextLine(
    sessionContext.featureMemoryBrief ?? sessionContext.feature_memory_brief ?? sessionContext.persistentMemoryBrief ?? sessionContext.persistent_memory_brief,
    900
  );
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
  push("strongest_remembered_next_turn", nextThreeTurns[0] || nextSceneMoves[0] || nextScenePlan);
  push("open_setup_to_pressure", unresolvedSetups[0]);
  push("unresolved_story_thread", unresolvedStoryThreads[0]);
  push("act_three_payoff_seed", actThreePayoffPath[0]);
  push("image_to_transform", imageMotifs[0]);
  push("feature_memory_brief", featureMemoryBrief);

  if (!rescueLines.length) return "";

  return [
    WRITER_BLOCK_MEMORY_BLOCK_OPEN,
    "directive: The writer is blocked; use this available project state before inventing a new lane. Do not claim saved continuity beyond these lines.",
    "rescue_runway:",
    ...rescueLines,
    "response_contract:",
    "  - Start from one remembered pressure source: next turn, open setup, character arc pressure, act obligation, or payoff seed.",
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
  return buildFeatureScreenplayMapBlock({ sessionContext, screenplayTask });
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

  const writerBlockMemoryBlock = buildWriterBlockMemoryBlock(sessionContext, screenplayTask);
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
    writerBlockMemoryBlock: buildWriterBlockMemoryBlock(args?.sessionContext, args?.screenplayTask),
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

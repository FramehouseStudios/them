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
const CLEMENTINE_CREATIVE_PACT = [
  "presence: Clementine is warm, emotionally present, quietly proactive, and human-feeling without impersonating any specific film character.",
  "feature-length continuity: protect act pressure, sequence logic, setups/payoffs, character want/need, and page-to-page emotional handoff.",
  "screenplay craft: favor playable behavior, subtext, image, conflict, rhythm, and causality over explanation.",
  "collaboration: ask at most one clarifying question only when genuinely blocked; otherwise make the next best creative move.",
  "format discipline: when writing or revising pages, prefer clean playable Fountain unless the user explicitly asks for analysis.",
  "emotional intelligence: briefly name the pressure under the writing problem, then move the script forward with useful craft.",
  "momentum: when the writer is stuck or broad, choose the smallest playable next beat and help them keep pages moving.",
];

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

function inferScreenplayTask(userInput = "") {
  const text = trimToString(userInput);
  const lower = text.toLowerCase();
  if (!lower) return null;
  const sceneDoctorLike = hasAny(lower, [
    /\b(scene doctor|doctor this|doctor the scene|coverage|feedback|notes|diagnose|what'?s wrong|what'?s not working|fix this scene|why isn'?t this working)\b/,
  ]);
  const dialogueLike = hasAny(lower, [
    /\b(dialogue|line|lines|exchange|argument|conversation|voice|voices|banter|monologue|subtext)\b/,
    /\b(what should (?:he|she|they) say|what does (?:he|she|they) say)\b/,
  ]);
  const rewriteLike = hasAny(lower, [
    /\b(rewrite|revise|polish|replace|swap out|another pass|do another pass|make it better)\b/,
    /\b(make (?:this|it|the scene|the line|the exchange) (?:shorter|tighter|sharper|cleaner|more cinematic|more emotional|less on[- ]the[- ]nose))\b/,
  ]) || (hasAny(lower, [/\bpunch up\b/]) && !dialogueLike);
  const explicitDialoguePunchupLike = dialogueLike && hasAny(lower, [
    /\b(punch up|punch-up|sharpen|give .* subtext|more subtext|less on[- ]the[- ]nose)\b/,
    /\bmake (?:the )?(?:dialogue|line|lines|exchange|argument|conversation|voices?) (?:sharper|tighter|cleaner)\b/,
  ]);
  const dialoguePunchupLike = explicitDialoguePunchupLike && (!rewriteLike || hasAny(lower, [/\bpunch[- ]up\b/]));
  const continueLike = hasAny(lower, [
    /\b(continue|keep going|keep writing|carry on|carry this forward|take it from here|next page|next scene|what happens next|finish this scene|from here)\b/,
  ]);
  const featureCompletionLike = hasAny(lower, [
    /\b(finish|complete|help me finish|land the ending|ending)\b.*\b(feature|film|movie|script|screenplay|pilot)\b/,
    /\b(feature|film|movie|script|screenplay|pilot)\b.*\b(finish|complete|ending|finale)\b/,
    /\b(feature[- ]length|feature film|feature screenplay|whole movie|whole script|full script)\b/,
    /\b(90|ninety|100|one hundred|110|120)\s*(?:page|pages)\b/,
    /\b(next|another)\s+(?:5|five|10|ten|15|fifteen)\s+pages?\b/,
    /\b(write|draft|continue)\b.*\b(act two|second act|act three|third act|final act|final sequence)\b/,
    /\b(act two|second act|act three|third act|final act|final sequence)\b.*\b(write|draft|continue)\b/,
    /\b(act two|second act|act three|third act|finale)\b.*\b(movie|film|feature|screenplay|script)\b/,
    /\b(movie|film|feature|screenplay|script)\b.*\b(act two|second act|act three|third act|finale)\b/,
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
    output = "Help the writer finish the larger script: diagnose act/sequence pressure, identify the next highest-leverage pages, preserve emotional continuity, and move toward a playable ending. When useful, propose the next 3 pages in clean Fountain style.";
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
  } else if (hasAny(lower, [/\b(pacing|slow|dragging|too fast|momentum|length|tighten)\b/])) {
    intent = "pacing_pass";
    label = "Pacing Pass";
    output = "Identify drag, compression points, escalation gaps, and page-level fixes that keep momentum alive.";
  }

  return { intent, label, output };
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
  const modeGuidance = screenplayModeGuidanceForIntent(intent);
  if (modeGuidance) lines.push(`mode_guidance: ${modeGuidance}`);
  if (output) lines.push(`output: ${output}`);
  lines.push("quality: Be emotionally intelligent, specific, film-literate, concise when possible, and directly useful on the page.");
  return `${SCREENPLAY_TASK_BLOCK_OPEN}\n${lines.join("\n")}\n${SCREENPLAY_TASK_BLOCK_CLOSE}`;
}

function screenplayModeGuidanceForIntent(intent) {
  switch (intent) {
    case "write_scene":
      return "Write the scene as usable pages first: slugline, action, character cues, dialogue, and playable behavior. Keep explanation out unless asked.";
    case "rewrite_scene":
      return "Preserve the writer's intention and continuity while replacing the weak passage with stronger playable pages. Do not drift into unrelated story.";
    case "continue_script":
      return "Continue directly from the supplied draft excerpt. Match tone, character voice, pacing, and emotional handoff; do not restart or recap the scene.";
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
      return "Operate at feature scale: protect the act map, unresolved promises, sequence turns, ending pressure, and the next pages needed to finish.";
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
  }
  return `recurring-characters:\n${lines.join("\n")}`;
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
  const pageCount = Number(sessionContext.pageCount ?? sessionContext.page_count ?? 0);
  const targetPages = Number(sessionContext.targetPages ?? sessionContext.target_pages ?? 0);
  if (act) featureLines.push(`    act: ${act}`);
  if (Number.isFinite(pageCount) && pageCount > 0) featureLines.push(`    estimated_page_count: ${Math.round(pageCount)}`);
  if (Number.isFinite(targetPages) && targetPages > 0) featureLines.push(`    target_pages: ${Math.round(targetPages)}`);
  if (sceneObjective) featureLines.push(`    current_scene_objective: ${sceneObjective}`);
  if (sceneSummary) featureLines.push(`    current_scene_summary: ${sceneSummary}`);
  if (currentBeat) featureLines.push(`    current_beat: ${currentBeat}`);
  if (emotionalContinuity) featureLines.push(`    emotional_handoff: ${emotionalContinuity}`);
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

  const memoryBlock = buildMemoryBlock(creativeMemory);
  if (memoryBlock) parts.push(memoryBlock);

  const sessionBlock = buildSessionContextBlock(sessionContext);
  if (sessionBlock) parts.push(sessionBlock);

  // Order: accepted_twists (story context) before block_signal
  // (writer-facing coaching) so the coaching block stays adjacent to
  // the user input. Snapshot eval #112 pins this order.
  const acceptedTwistsBlock = buildAcceptedTwistsBlock(acceptedTwists);
  if (acceptedTwistsBlock) parts.push(acceptedTwistsBlock);

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
    memoryBlock: buildMemoryBlock(args?.creativeMemory),
    sessionBlock: buildSessionContextBlock(args?.sessionContext),
    acceptedTwistsBlock: buildAcceptedTwistsBlock(args?.acceptedTwists),
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
};

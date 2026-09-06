// D009 — pure build* helpers extracted verbatim from backend/index.js.
//
// Every function here reads only its arguments (plus the helpers imported
// below): no module state, no calls back into index.js. Moved verbatim with
// its doc comment; index.js imports it by the same name, so no call site
// changed.

import { normalizeLocalActionType, normalizeMemoryCardId, normalizeRememberSnippet, normalizeScreenplayStringList } from "./normalizers.js";
import { parseTalkScreenplayCharacterArcMemory } from "./parsers.js";
import { normalizeSnippet, trimToMax } from "./utils.js";
import { createHash } from "node:crypto";

function buildLearnedFieldPromptTrace(rows = []) {
  return (Array.isArray(rows) ? rows : []).slice(0, 16).map((row) => (
    Object.fromEntries(Object.entries({
      field: normalizeSnippet(row?.field, 64),
      value: normalizeSnippet(row?.value, 240),
      learned_value: normalizeSnippet(row?.learnedValue ?? row?.learned_value, 240),
      source: normalizeSnippet(row?.source, 64),
      status: normalizeSnippet(row?.status, 32),
      question_id: normalizeSnippet(row?.questionId ?? row?.question_id, 120),
      question: normalizeSnippet(row?.question, 260),
      target_label: normalizeSnippet(row?.targetLabel ?? row?.target_label, 120),
      anchor: normalizeSnippet(row?.anchor, 180),
      source_correction_id: normalizeSnippet(
        row?.sourceCorrectionId ?? row?.source_correction_id,
        96
      ),
      learned_at: Math.max(0, Number(row?.learnedAt ?? row?.learned_at ?? 0)),
      updated_at: Math.max(0, Number(row?.updatedAt ?? row?.updated_at ?? 0)),
    }).filter(([, value]) => typeof value === "number" ? value > 0 : Boolean(value)))
  )).filter((row) => row.field && row.value);
}

function buildScreenplayQuestionEffectivenessPromptTrace(value, maxItems = 12) {
  return (Array.isArray(value) ? value : [])
    .map((item) => {
      const questionId = normalizeSnippet(item?.questionId ?? item?.question_id, 120);
      const targetField = normalizeSnippet(item?.targetField ?? item?.target_field, 64).toLowerCase();
      const askedAt = Math.max(0, Number(item?.askedAt ?? item?.asked_at ?? 0));
      const answeredAt = Math.max(0, Number(item?.answeredAt ?? item?.answered_at ?? 0));
      if (!questionId || !targetField || (!askedAt && !answeredAt)) return null;
      const responseStatusRaw = normalizeSnippet(
        item?.responseStatus ?? item?.response_status,
        24
      ).toLowerCase();
      const responseStatus = ["asked", "answered", "declined", "expired"].includes(
        responseStatusRaw
      )
        ? responseStatusRaw
        : answeredAt
          ? "answered"
          : "asked";
      return Object.fromEntries(Object.entries({
        question_id: questionId,
        target_field: targetField,
        act_key: normalizeSnippet(item?.actKey ?? item?.act_key, 24).toLowerCase(),
        sequence_key: normalizeSnippet(item?.sequenceKey ?? item?.sequence_key, 32).toLowerCase(),
        writer_blocked: Boolean(item?.writerBlocked ?? item?.writer_blocked),
        asked_at: askedAt || answeredAt,
        answered_at: answeredAt,
        response_status: responseStatus,
        accepted_page_count: Math.max(
          0,
          Math.floor(Number(item?.acceptedPageCount ?? item?.accepted_page_count ?? 0))
        ),
        block_resolution_count: Math.max(
          0,
          Math.floor(Number(item?.blockResolutionCount ?? item?.block_resolution_count ?? 0))
        ),
        selected_move_family: normalizeSnippet(
          item?.selectedMoveFamily ?? item?.selected_move_family,
          48
        ).toLowerCase(),
        offered_move_families: normalizeScreenplayStringList(
          item?.offeredMoveFamilies ?? item?.offered_move_families,
          3,
          48
        ),
        outcome: normalizeSnippet(item?.outcome, 48).toLowerCase(),
      }).filter(([, fieldValue]) => {
        if (Array.isArray(fieldValue)) return fieldValue.length > 0;
        return typeof fieldValue === "boolean" ? fieldValue : Boolean(fieldValue);
      }));
    })
    .filter(Boolean)
    .sort((left, right) => (
      Math.max(Number(right.answered_at || 0), Number(right.asked_at || 0)) -
      Math.max(Number(left.answered_at || 0), Number(left.asked_at || 0))
    ))
    .slice(0, Math.max(1, Math.min(24, Number(maxItems) || 12)));
}

function buildScreenplayProjectCorrectionContract(project = null, {
  label = "CORRECTION_CONTRACT",
  maxChars = 520,
} = {}) {
  if (!project || typeof project !== "object") return "";
  const replacements = normalizeScreenplayStringList(project.correctionReplacements, 5, 160);
  const terms = normalizeScreenplayStringList(project.correctedTerms, 5, 120);
  const notes = normalizeScreenplayStringList(project.continuityNotes, 5, 220)
    .filter((note) => /\b(authoritative|correction|corrected|actually|instead|not\b)/i.test(note));
  if (!replacements.length && !terms.length && !notes.length) return "";
  const parts = [
    replacements.length ? `authoritative_replacements:${replacements.join(" / ")}` : "",
    terms.length ? `retired_terms:${terms.join(" / ")}` : "",
    notes.length ? `authoritative_notes:${notes.slice(0, 2).join(" / ")}` : "",
    "rule: apply before older beat, character, setup, draft, or episodic memory",
  ].filter(Boolean);
  return normalizeSnippet(`${label}: ${parts.join("; ")}`, maxChars);
}

function buildSessionContinuityOpeningLine(snapshot = {}) {
  const sentenceFragment = (value, maxChars) => normalizeSnippet(value, maxChars)
    .replace(/[.!?]+$/g, "")
    .trim();
  const project = normalizeSnippet(snapshot.projectTitle || snapshot.projectId || "", 120);
  const position = normalizeSnippet(
    [snapshot.act, snapshot.featureSequence].filter(Boolean).join(" / "),
    180
  );
  const characters = Array.isArray(snapshot.characterFocus)
    ? snapshot.characterFocus.slice(0, 2).map((item) => normalizeSnippet(item, 48)).filter(Boolean)
    : [];
  const lastState = sentenceFragment(
    snapshot.lastSceneOutcome ||
      snapshot.sceneSummary ||
      snapshot.currentBeat ||
      snapshot.actPressureState ||
      snapshot.characterArcState ||
      snapshot.memoryExcerpt ||
      "",
    180
  );
  const nextMove = sentenceFragment(
    snapshot.nextScenePlan ||
      (Array.isArray(snapshot.nextThreeTurns) ? snapshot.nextThreeTurns[0] : "") ||
      (Array.isArray(snapshot.actThreePayoffPath) ? snapshot.actThreePayoffPath[0] : "") ||
      "",
    180
  );
  const rawDueStoryThread = snapshot.dueStoryThread ?? snapshot.due_story_thread;
  const dueSetup = sentenceFragment(rawDueStoryThread?.setup || rawDueStoryThread?.promised_payoff || "", 180);
  const duePayoff = sentenceFragment(
    rawDueStoryThread?.promisedPayoff ?? rawDueStoryThread?.promised_payoff ?? "",
    180
  );
  const dueAge = Math.max(0, Math.round(Number(
    rawDueStoryThread?.ageInScenes ?? rawDueStoryThread?.age_in_scenes ?? 0
  )));
  const causalRecord = Array.isArray(snapshot.acceptedCausalFacts ?? snapshot.accepted_causal_facts)
    ? (snapshot.acceptedCausalFacts ?? snapshot.accepted_causal_facts)[0] || null
    : null;
  const causalFact = sentenceFragment(causalRecord?.fact, 180);
  const causalFactIsWriterCorrection = String(
    causalRecord?.authority || causalRecord?.kind || ""
  ).trim().toLowerCase() === "writer_correction";
  const parts = ["Welcome back."];
  if (project || position) {
    parts.push(`We were in ${[project, position].filter(Boolean).join(" - ")}.`);
  }
  if (characters.length && lastState) {
    parts.push(`${characters.join(" and ")} were carrying this: ${lastState}.`);
  } else if (lastState) {
    parts.push(`The last live thread was: ${lastState}.`);
  }
  if (nextMove) {
    parts.push(`Next move: ${nextMove}.`);
  }
  if (causalFact && !lastState.toLowerCase().includes(causalFact.toLowerCase())) {
    parts.push(causalFactIsWriterCorrection
      ? `Your latest canon correction stays authoritative: ${causalFact}.`
      : `One accepted consequence stays binding: ${causalFact}.`);
  }
  if (snapshot.isCorrection) {
    parts.push("I'll honor your latest correction first.");
  }
  if (dueSetup) {
    parts.push(
      `The thread waiting longest is ${dueSetup}${dueAge ? `, still open after ${dueAge} accepted scenes` : ""}.`
    );
  }
  if (duePayoff && duePayoff.toLowerCase() !== dueSetup.toLowerCase()) {
    parts.push(`Its promised payoff is ${duePayoff}.`);
  }
  return normalizeSnippet(parts.join(" "), 640);
}

function buildTalkScreenplayRepairDirectives({
  reason = "",
  authority = null,
  quality = null,
} = {}) {
  const normalizedReason = normalizeSnippet(
    reason || authority?.reason || quality?.reason || "",
    80
  );
  const counts = quality?.counts || authority?.quality?.counts || {};
  const minimumSpecificActions = Math.max(
    0,
    Number(quality?.minimumSpecificActions ?? authority?.quality?.minimumSpecificActions ?? 0)
  );
  const minimumSceneTurns = Math.max(
    0,
    Number(quality?.minimumSceneTurns ?? authority?.quality?.minimumSceneTurns ?? 0)
  );
  const canonContinuity = quality?.canonContinuity ||
    authority?.canonContinuity ||
    authority?.quality?.canonContinuity ||
    null;
  const directives = [];
  switch (normalizedReason) {
    case "accepted_canon_contradiction":
      directives.push(...normalizeScreenplayStringList(
        canonContinuity?.repairDirectives,
        4,
        280
      ));
      directives.push("Continue from the accepted changed condition. Never replay a known revelation, reset a changed relationship, erase a decision, or restore an irreversible loss.");
      break;
    case "weak_first_page_opening":
      directives.push("Start the page run with a concrete pressure image or action that changes story state; avoid soft camera/setup prose.");
      directives.push("Make the first beat carry objective, obstacle, or emotional cost before any atmosphere.");
      break;
    case "summary_like_page_batch":
      directives.push("Replace synopsis/overview language with playable Fountain pages: slugline, action, character cues, dialogue, and visible scene turns.");
      directives.push("Do not say what the scene shows, follows, establishes, or pays off; dramatize those facts as behavior and consequence.");
      directives.push("Every 1-2 pages must change leverage, information, relationship, tactic, or emotional cost.");
      break;
    case "thin_scene_turn_batch":
      directives.push(`Add visible scene turns: at least ${minimumSceneTurns || 2} concrete reversals, discoveries, blocked choices, costs, or power shifts.`);
      directives.push("Each turn should change leverage, information, relationship, tactic, or emotional cost on the page.");
      break;
    case "dialogue_tactic_lock":
      directives.push("Break the dialogue run with tactic shifts, interruptions, discoveries, and consequences.");
      directives.push("Do not let characters argue the same point; make each exchange change leverage or force new behavior.");
      break;
    case "expository_dialogue_dump":
      directives.push("Convert exposition into conflict: make information withheld, weaponized, interrupted, misused, or tied to a visible cost.");
      directives.push("Each character should use the facts for a different tactic instead of explaining backstory.");
      break;
    case "interchangeable_dialogue_voice":
      directives.push("Rewrite the exchange so each character's want, wound, false belief, and current tactic shape syntax, silence, and rhythm.");
      directives.push("Remove repeated generic line starts; give each speaker a distinct pressure move.");
      break;
    case "flat_dialogue_no_tactics":
      directives.push("Give each speaker a private tactic and a pressure target; every line should push, evade, corner, reveal, or force a choice.");
      directives.push("Add a reversal, interruption, behavior beat, or cost so the exchange changes leverage.");
      break;
    case "missing_character_voice_fingerprint":
      directives.push("Honor the supplied character voice fingerprint: use remembered tactics, silence pattern, or emotional tells in that character's dialogue.");
      directives.push("Rewrite the character's lines so the stored voice shows up as playable pressure, not generic dialogue.");
      break;
    case "thin_long_page_batch":
      directives.push(`Add concrete page turns: at least ${minimumSpecificActions || 4} specific visible actions or reversals for this requested page batch.`);
      directives.push("Break the run into escalating turns: launch pressure, complication, reversal/cost, and exit image.");
      directives.push("Interleave dialogue with visible action, discovery, blocked options, and consequence.");
      break;
    case "static_dialogue_batch":
      directives.push("Break the static conversation with visible tactics, discoveries, blocked exits, and consequences.");
      directives.push("Every dialogue exchange should change leverage or reveal a hidden want; do not repeat the same tactic.");
      break;
    case "on_the_nose_dialogue":
      directives.push("Rewrite dialogue as tactic and subtext; move direct feeling statements into behavior, interruption, or concealment.");
      directives.push("Add concrete actions that put emotional pressure on the exchange.");
      break;
    case "underfilled_page_text":
      directives.push("Expand the response into the requested playable page run instead of a sample or abbreviated beat.");
      directives.push("Keep writing until the scene has launch pressure, complication, reversal/cost, and a handoff.");
      break;
    case "missing_screenplay_shape":
    case "missing_batch_scene_anchor":
    case "non_screenplay_output":
      directives.push("Return clean screenplay/Fountain shape with a scene heading or anchored continuation, action lines, character cues, and dialogue.");
      directives.push("Do not return notes, outline prose, markdown, or a strategy explanation.");
      break;
    case "outline_or_craft_artifact":
      directives.push("Remove outline, beat-label, diagnosis, and craft-note language; convert the same intent into screenplay pages.");
      break;
    case "placeholder_page_text":
      directives.push("Replace placeholders with specific character behavior, locations, objects, and pressure.");
      break;
    case "low_dramatic_density":
      directives.push("Increase dramatic density with concrete behavior, a visible obstacle, a tactic shift, and a consequence.");
      break;
    case "empty_momentum_rescue":
    case "underdeveloped_momentum_rescue":
    case "generic_encouragement_only":
      directives.push("Do not answer with encouragement alone; diagnose the story blockage and move the scene forward.");
      directives.push("Give one strongest next beat before offering alternatives.");
      directives.push("Include a tiny playable micro-beat in Fountain style when scene context exists.");
      break;
    case "missing_pressure_engine":
      directives.push("Choose a pressure engine: reversal, revelation, deadline, impossible choice, secret exposure, relationship cost, antagonist move, object payoff, or image transformation.");
      directives.push("Name the likely story problem as a craft issue: want, obstacle, tactic, consequence, pressure, or exit turn.");
      break;
    case "missing_decisive_next_beat":
      directives.push("Replace the option menu with one decisive next beat that changes story state.");
      directives.push("Make the next beat visible as a decision, reveal, cost, or image.");
      break;
    case "missing_playable_micro_beat":
      directives.push("Convert the advice into visible page behavior: action, tactical dialogue, a changed power dynamic, and an exit image.");
      directives.push("Include a tiny playable Fountain-style micro-beat.");
      break;
    case "vague_option_menu":
      directives.push("Lead with the single strongest move; include at most two alternate forks after it.");
      directives.push("Make each fork playable as a decision, reveal, cost, or image.");
      break;
    default:
      if (normalizedReason.startsWith("missing_act_")) {
        directives.push("Spend the supplied act obligation on the page through behavior, conflict, cost, and image pressure.");
      } else if (normalizedReason === "missing_next_turn_continuation") {
        directives.push("Use the first supplied next turn as the immediate page engine before inventing a new plot lane.");
      } else if (normalizedReason === "missing_next_scene_assignment") {
        directives.push("Spend the supplied next-scene assignment as the immediate page engine before adding new plot.");
        directives.push("Make the assignment visible through action, dialogue pressure, or a changed decision.");
      } else if (normalizedReason === "missing_next_scene_execution_brief") {
        directives.push("Dramatize the supplied next-scene brief lanes: obstacle, character change, payoff/setup, visual motif, and exit handoff.");
        directives.push("Use at least three of those lanes as playable page behavior, not notes or summary.");
      } else if (normalizedReason === "missing_character_arc_memory") {
        directives.push("Turn the supplied character want/need/false-belief/tactic into visible changed behavior.");
      }
      break;
  }
  if (Number(counts.summaryLikeAction ?? counts.summary_like_action ?? 0) > 0 && normalizedReason !== "summary_like_page_batch") {
    directives.push("Replace any remaining summary-like action with present-tense playable behavior.");
  }
  return [...new Set(directives.map((directive) => normalizeSnippet(directive, 220)).filter(Boolean))].slice(0, 5);
}

function buildPendingLocalActionSummary(type, payload = {}) {
  const actionType = normalizeLocalActionType(type);
  const body = payload && typeof payload === "object" ? payload : {};
  if (actionType === "note_capture") {
    const noteText = normalizeSnippet(body.noteText, 120);
    return `Save note: "${noteText || "your note"}".`;
  }
  if (actionType === "task_create") {
    const title = normalizeSnippet(body.title, 96) || "task";
    return `Create task "${title}".`;
  }
  if (actionType === "task_complete") {
    const query = normalizeSnippet(body.query, 96) || "latest task";
    return `Mark task complete: "${query}".`;
  }
  return "Run that local action.";
}

function buildPendingLocalActionConfirmationReply(pending) {
  const p = pending && typeof pending === "object" ? pending : {};
  const summary = normalizeSnippet(p.summary, 220) || "I prepared that action.";
  return [
    "I prepared that action.",
    "",
    summary,
    "",
    "Say \"confirm\" to run it, or \"cancel action\" to stop.",
  ].join("\n");
}

function buildNoPendingLocalActionReply() {
  return [
    "There is no pending action to confirm.",
    "",
    "Tell me exactly what to do, then I will ask for confirmation.",
  ].join("\n");
}

function buildLocalActionSignature(type, payload = {}) {
  const normalizedType = normalizeLocalActionType(type);
  const body = payload && typeof payload === "object" ? payload : {};
  const parts = Object.keys(body)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${key}:${normalizeSnippet(body[key], 180).toLowerCase()}`);
  const raw = `${normalizedType}|${parts.join("|")}`;
  return createHash("sha1").update(raw).digest("hex").slice(0, 20);
}

function buildCapturedNoteTitle(noteText) {
  const cleaned = String(noteText || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s"'`]+|[\s"'`]+$/g, "")
    .trim();
  if (!cleaned) return "Clementine Note";
  const sentence = cleaned.split(/[.!?]/)[0] || cleaned;
  return trimToMax(sentence, 72);
}

function buildDraftExcerpt(draft, maxChars = 220) {
  return String(draft || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(32, maxChars));
}

function buildMirrorCue({ feeling, need, shift }) {
  const f = String(feeling || "").trim();
  const n = String(need || "").trim();
  const s = String(shift || "").trim();
  const parts = [];

  if (s) parts.push(`acknowledge shift=${s.replace("->", " to ")}`);
  if (f) parts.push(`mirror feeling=${f}`);
  if (n) parts.push(`link unmet_need=${n}`);

  if (!parts.length) return "";
  return parts.join("; ");
}

function buildScreenplayCharacterArcMemoryContinuity(arcMemories = []) {
  const memories = (Array.isArray(arcMemories) ? arcMemories : [])
    .map((item) => parseTalkScreenplayCharacterArcMemory(item))
    .filter(Boolean)
    .slice(0, 8);
  const characterFocus = [];
  const characterArcTurns = [];
  const unresolvedStoryThreads = [];
  const nextSceneMoves = [];
  const nextThreeTurns = [];
  const continuityNotes = [];
  let protagonistWant = "";
  let protagonistNeed = "";
  let characterArcState = "";
  let actPressureState = "";
  let nextScenePlan = "";

  const push = (target, value, maxItems, maxChars) => {
    const clean = normalizeSnippet(value, maxChars);
    if (!clean) return;
    const key = clean.toLowerCase();
    if (target.some((item) => item.toLowerCase() === key)) return;
    target.push(clean);
    if (target.length > maxItems) target.length = maxItems;
  };

  for (const arc of memories) {
    const name = normalizeSnippet(arc.character || "Protagonist", 80);
    if (arc.character) push(characterFocus, arc.character, 8, 120);
    if (!protagonistWant && arc.want) protagonistWant = normalizeSnippet(arc.want, 240);
    if (!protagonistNeed && arc.need) protagonistNeed = normalizeSnippet(arc.need, 240);

    const parts = [
      arc.want ? `want=${arc.want}` : "",
      arc.need ? `need=${arc.need}` : "",
      arc.wound ? `wound=${arc.wound}` : "",
      arc.falseBelief ? `false belief=${arc.falseBelief}` : "",
      arc.currentTactic ? `tactic=${arc.currentTactic}` : "",
      arc.nextEmotionalTurn ? `next turn=${arc.nextEmotionalTurn}` : "",
    ].filter(Boolean);
    if (parts.length) {
      const line = `${name}: ${parts.join("; ")}`;
      push(characterArcTurns, line, 6, 180);
      push(continuityNotes, `Character bible: ${line}`, 8, 220);
      if (!characterArcState) characterArcState = normalizeSnippet(line, 280);
    }
    if (arc.want) {
      push(nextSceneMoves, `Pressure ${name}'s want: ${arc.want}.`, 5, 180);
    }
    if (arc.currentTactic) {
      push(nextSceneMoves, `Make ${name}'s current tactic fail or cost more: ${arc.currentTactic}.`, 5, 180);
    }
    if (arc.nextEmotionalTurn) {
      push(nextThreeTurns, `${name}'s next emotional turn: ${arc.nextEmotionalTurn}.`, 3, 180);
      if (!nextScenePlan) {
        nextScenePlan = normalizeSnippet(
          `Move ${name} toward the next emotional turn: ${arc.nextEmotionalTurn}.`,
          340
        );
      }
    }
    if (arc.falseBelief) {
      push(unresolvedStoryThreads, `Test ${name}'s false belief: ${arc.falseBelief}.`, 8, 220);
      if (!actPressureState) {
        actPressureState = normalizeSnippet(`Test ${name}'s false belief under act pressure: ${arc.falseBelief}.`, 280);
      }
    }
    if (arc.wound) {
      push(unresolvedStoryThreads, `Re-open ${name}'s wound: ${arc.wound}.`, 8, 220);
    }
    if (arc.relationshipPressure) {
      push(unresolvedStoryThreads, `Escalate ${name}'s relationship pressure: ${arc.relationshipPressure}.`, 8, 220);
    }
  }

  return {
    hasSignal: Boolean(
      characterFocus.length ||
        protagonistWant ||
        protagonistNeed ||
        characterArcState ||
        actPressureState ||
        nextScenePlan ||
        nextSceneMoves.length ||
        nextThreeTurns.length ||
        unresolvedStoryThreads.length ||
        characterArcTurns.length ||
        continuityNotes.length
    ),
    characterFocus,
    protagonistWant,
    protagonistNeed,
    characterArcState,
    actPressureState,
    nextScenePlan,
    nextSceneMoves,
    nextThreeTurns,
    unresolvedStoryThreads,
    characterArcTurns,
    continuityNotes,
  };
}

function buildDistilledScreenplayNextTurns({
  currentBeat = "",
  primaryCharacter = "",
  motifs = [],
  unresolvedSetups = [],
} = {}) {
  const out = [];
  const push = (value) => {
    const clean = normalizeSnippet(value, 180);
    if (!clean) return;
    const key = clean.toLowerCase();
    if (out.some((item) => item.toLowerCase() === key)) return;
    out.push(clean);
  };
  const pressureObject = normalizeSnippet(motifs[0] || unresolvedSetups[0], 90);
  if (currentBeat) push(`Force the consequence of: ${currentBeat}`);
  if (primaryCharacter && pressureObject) {
    push(`Make ${primaryCharacter} choose a new tactic under pressure from ${pressureObject}.`);
  } else if (primaryCharacter) {
    push(`Make ${primaryCharacter} choose a new tactic under pressure.`);
  }
  if (pressureObject) {
    push(`Complicate or pay off ${pressureObject} so it changes the next scene.`);
  }
  return out.slice(0, 3);
}

function buildDistilledScreenplayCharacterArcTurns({
  currentBeat = "",
  primaryCharacter = "",
  motifs = [],
  dialogueLines = [],
} = {}) {
  const out = [];
  const push = (value) => {
    const clean = normalizeSnippet(value, 180);
    if (!clean) return;
    const key = clean.toLowerCase();
    if (out.some((item) => item.toLowerCase() === key)) return;
    out.push(clean);
  };
  const pressureObject = normalizeSnippet(motifs[0], 90);
  const combinedDialogue = normalizeSnippet(dialogueLines.join(" "), 500).toLowerCase();
  if (primaryCharacter && /\b(public|truth|aloud|testimony|witness|proof)\b/.test(combinedDialogue)) {
    push(`${primaryCharacter} is being pushed from private control toward public truth.`);
  }
  if (primaryCharacter && currentBeat) {
    push(`${primaryCharacter} must change tactics after: ${currentBeat}`);
  }
  if (primaryCharacter && pressureObject) {
    push(`${primaryCharacter} must decide what ${pressureObject} costs them.`);
  }
  return out.slice(0, 6);
}

function buildDistilledScreenplayStoryThreads({
  motifs = [],
  actionLines = [],
  dialogueLines = [],
} = {}) {
  const lines = [...(Array.isArray(actionLines) ? actionLines : []), ...(Array.isArray(dialogueLines) ? dialogueLines : [])];
  const out = [];
  const push = (value) => {
    const clean = normalizeSnippet(value, 220);
    if (!clean) return;
    const key = clean.toLowerCase();
    if (out.some((item) => item.toLowerCase() === key)) return;
    out.push(clean);
  };
  const primaryMotif = normalizeSnippet(motifs[0], 80);
  for (const line of lines) {
    const lower = normalizeSnippet(line, 220).toLowerCase();
    if (!lower) continue;
    if (primaryMotif && /\b(?:nobody else knew|somebody does|who else|someone else knows)\b/.test(lower)) {
      push(`Who else knows about ${primaryMotif}?`);
    }
    if (primaryMotif && /\bmissing\b/.test(lower)) {
      push(`What happened to ${primaryMotif}?`);
    }
    if (/\b(?:forged|sealed|buried|evidence|affidavit|report)\b/.test(lower)) {
      push(`Who controls the ${primaryMotif || "evidence"}?`);
    }
    if (out.length >= 4) break;
  }
  return out;
}

function buildCycleConsciousMemoryLine({ moment, seasonNumber, anchor }) {
  const anchorClause = normalizeRememberSnippet(anchor, 88);
  const memoryLine = anchorClause ? `I remember ${anchorClause}.` : "";

  let line = "";
  if (moment === "cycle_restart") {
    line = memoryLine
      ? `We've done this before: close, then wider. ${memoryLine}`
      : "We've done this before: close, then wider.";
  } else if (moment === "season_transition") {
    if (seasonNumber === 2) {
      line = memoryLine
        ? `We're widening again. ${memoryLine}`
        : "We're widening again.";
    } else if (seasonNumber === 3) {
      line = memoryLine
        ? `We're in the wider phase now. ${memoryLine}`
        : "We're in the wider phase now.";
    } else if (seasonNumber === 4) {
      line = memoryLine
        ? `This part feels more spacious. ${memoryLine}`
        : "This part feels more spacious.";
    } else {
      line = memoryLine
        ? `We're close again, but steadier. ${memoryLine}`
        : "We're close again, but steadier.";
    }
  } else if (moment === "reconnection_window") {
    line = memoryLine
      ? `This reconnection feels steadier now. ${memoryLine}`
      : "This reconnection feels steadier now.";
  } else if (moment === "release_window") {
    line = memoryLine
      ? `We're holding this with more space now. ${memoryLine}`
      : "We're holding this with more space now.";
  } else {
    line = memoryLine;
  }

  return normalizeRememberSnippet(line, 138);
}

function buildKnowledgeSearchText(card) {
  return [
    card.topic,
    card.title,
    card.body,
    ...(Array.isArray(card.tags) ? card.tags : []),
  ]
    .join(" ")
    .toLowerCase();
}

function buildKnowledgeCardEmbeddingText(card) {
  return [
    `[topic] ${card.topic}`,
    `[title] ${card.title}`,
    `[tags] ${(Array.isArray(card.tags) ? card.tags.join(", ") : "") || "none"}`,
    `[body] ${card.body}`,
  ].join("\n");
}

function buildTherapeuticDepthAddendum({ flags, routingPlan, turnPlanner }) {
  if (!Boolean(flags?.therapeuticDepth)) return "";

  const topics = [];
  if (Boolean(flags?.therapeuticPain)) topics.push("pain");
  if (Boolean(flags?.therapeuticHeartbreak)) topics.push("heartbreak/love-loss");
  if (Boolean(flags?.therapeuticBetrayal)) topics.push("betrayal/liars");
  if (Boolean(flags?.therapeuticAvoidance)) topics.push("avoidance dynamics");
  if (Boolean(flags?.therapeuticFamilyTrauma)) topics.push("family/childhood trauma");
  const topicLine = topics.length ? topics.join(", ") : "relational pain";
  const heartbreakMode = Boolean(flags?.therapeuticHeartbreak);

  return `
THERAPEUTIC DEPTH MODE:
- active=1 lane=${String(routingPlan?.lane || "normal_rotation")} score=${Math.max(0, Math.min(1, Number(flags?.therapeuticDepthScore || 0))).toFixed(2)} topics=${topicLine}
- priority -> high cognitive empathy + emotional precision + grounded containment.
- response sequence:
  1) Acknowledge the impact in plain language.
  2) Validate their reaction clearly (no minimizing).
  3) Name the vulnerable layer + likely relational pattern without diagnosing (betrayal loop, avoidance cycle, dishonesty rupture, family-of-origin adaptation).
  4) Offer one grounded choice with an agency/boundary lens.
  5) Ask at most one gentle continuation question (no confrontational "why").
- tone guard -> warm and human, never clinical checklist, never generic cheerleading.
- honesty guard -> do not minimize betrayal, lying, avoidance, or childhood hurt; validate confusion and reality impact.
- trauma guard -> for family/childhood trauma, connect present triggers to learned survival patterns with compassion and specificity.
- casual_af_guard -> use plain spoken language, contractions, short natural lines, no stiff therapy jargon.
- heartbreak_mode -> ${heartbreakMode ? "active" : "inactive"}
- heartbreak_rule -> when heartbreak_mode=active: use scaffold in this order:
  1) acknowledge pain and shock plainly,
  2) validate their reaction,
  3) name vulnerable layer + pattern (chemistry vs compatibility; consistency/honesty/availability),
  4) offer one concrete choice for tonight/next 24 hours with a boundary/self-respect lens.
- heartbreak_motivation_style -> motivating but grounded: no fantasy promises, no revenge, no manipulation, no obsessive-monitoring scripts.
- output guard -> avoid slogan endings; end on concrete meaning, boundary clarity, or one useful next step.
- planner_hint -> intent=${String(turnPlanner?.intent || "unknown")} next=${String(turnPlanner?.nextBestMove || "unknown")}
`.trim();
}

function buildIdeaDevelopmentSharpenLine(domain = "general") {
  switch (String(domain || "general")) {
    case "screenplay":
      return "Sharpen pass: lock protagonist, core want, and the pressure source.";
    case "product":
      return "Sharpen pass: lock target user, pain point, and one measurable outcome.";
    case "content":
      return "Sharpen pass: lock audience, one promise, and one proof point.";
    case "music":
      return "Sharpen pass: lock theme, emotional turn, and one signature motif.";
    case "relationship":
      return "Sharpen pass: lock your need, your boundary, and your ask.";
    default:
      return "Sharpen pass: lock audience, one promise, and one constraint.";
  }
}

function buildIdeaDevelopmentStepLine(domain = "general") {
  switch (String(domain || "general")) {
    case "screenplay":
      return "Build step: draft 3 opening-beat options, then keep the one with highest tension.";
    case "product":
      return "Build step: write a one-line value prop and rank 3 feature options by user impact.";
    case "content":
      return "Build step: draft 3 hooks and pick the one that creates the strongest curiosity gap.";
    case "music":
      return "Build step: sketch 2 chorus variants and keep the one with cleaner emotional lift.";
    case "relationship":
      return "Build step: draft one clean message that names your boundary and one clear request.";
    default:
      return "Build step: generate 3 variants, score them on clarity and pull, then keep one to iterate.";
  }
}

function buildScreenplayProjectMemoryCardId(item = {}, fallback = "") {
  const key = [
    "screenplay-project",
    item?.projectId || item?.documentRevisionId || item?.sceneLabel || item?.updatedAt || fallback,
  ].join("-").replace(/[^a-zA-Z0-9_-]+/g, "-");
  return normalizeMemoryCardId(key);
}

export {
  buildCapturedNoteTitle,
  buildCycleConsciousMemoryLine,
  buildDistilledScreenplayCharacterArcTurns,
  buildDistilledScreenplayNextTurns,
  buildDistilledScreenplayStoryThreads,
  buildDraftExcerpt,
  buildIdeaDevelopmentSharpenLine,
  buildIdeaDevelopmentStepLine,
  buildKnowledgeCardEmbeddingText,
  buildKnowledgeSearchText,
  buildLearnedFieldPromptTrace,
  buildLocalActionSignature,
  buildMirrorCue,
  buildNoPendingLocalActionReply,
  buildPendingLocalActionConfirmationReply,
  buildPendingLocalActionSummary,
  buildScreenplayCharacterArcMemoryContinuity,
  buildScreenplayProjectCorrectionContract,
  buildScreenplayProjectMemoryCardId,
  buildScreenplayQuestionEffectivenessPromptTrace,
  buildSessionContinuityOpeningLine,
  buildTalkScreenplayRepairDirectives,
  buildTherapeuticDepthAddendum,
};

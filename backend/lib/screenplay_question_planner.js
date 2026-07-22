const DIRECT_PAGE_REQUEST = /^(?:please\s+)?(?:write|draft|continue|finish|complete|rewrite|revise|punch\s*up|generate|give\s+me|show\s+me|start|keep\s+(?:writing|going))\b|\b(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:write|draft|continue|finish|complete|rewrite|revise|punch\s*up|generate|start)\b/i;
const WRITER_BLOCK_SIGNAL = /\b(?:writer'?s\s+block|writers\s+block|stuck|blocked|out\s+of\s+ideas|no\s+ideas|don'?t\s+know\s+what\s+happens\s+next|what\s+happens\s+next|where\s+do\s+i\s+go|how\s+do\s+i\s+move|story\s+forward|next\s+beat|next\s+scene|middle\s+(?:is\s+)?(?:flat|dragging|slow)|second\s+act\s+(?:is\s+)?(?:flat|dragging|slow))\b/i;
const DEVELOPMENT_SIGNAL = /\b(?:brainstorm|develop|figure\s+out|work\s+out|plan|outline|structure|break\s+(?:the\s+)?story|character\s+arc|story\s+arc|act\s+(?:one|two|three|i|ii|iii|1|2|3)|theme|ending|motivation|want|need|wound|false\s+belief|misbelief)\b/i;
const SCREENPLAY_SIGNAL = /\b(?:screenplay|script|scene|feature|film|movie|act|beat|character|protagonist|antagonist|dialogue|story)\b/i;
const NON_ANSWER_SIGNAL = /^(?:i\s+don'?t\s+know|not\s+sure|no\s+idea|skip|pass|decide\s+later|let'?s\s+come\s+back|we\s+can\s+decide\s+later|you\s+decide)[.!\s]*$/i;

function clean(value, maxChars = 220) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxChars).trim();
}

function cleanList(value, maxItems = 6, maxChars = 180) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  for (const item of source) {
    const normalized = clean(item, maxChars);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= maxItems) break;
  }
  return out;
}

function firstValue(...values) {
  for (const value of values) {
    const normalized = clean(value);
    if (normalized) return normalized;
  }
  return "";
}

function firstNamedCharacter(characters, transcript, characterFocus = []) {
  const items = Array.isArray(characters) ? characters.filter(Boolean) : [];
  const lowerTranscript = String(transcript || "").toLowerCase();
  const focus = cleanList(characterFocus, 8, 80).map((name) => name.toLowerCase());
  return items.find((character) => {
    const name = clean(character?.name, 80).toLowerCase();
    return name && lowerTranscript.includes(name);
  }) || items.find((character) => focus.includes(clean(character?.name, 80).toLowerCase())) || items[0] || null;
}

function projectLabel(trace, projectMemory, studioMeta) {
  return firstValue(
    trace?.project_title,
    projectMemory?.project_title,
    studioMeta?.screenplayProjectTitle
  );
}

function buildGap({ field, label, anchor, question, reason }) {
  return {
    field: clean(field, 64),
    label: clean(label, 120),
    anchor: clean(anchor, 180),
    question: clean(question, 260),
    reason: clean(reason, 180),
  };
}

function characterGap(character) {
  if (!character || typeof character !== "object") return null;
  const name = clean(character.name, 80) || "the protagonist";
  const arc = character.arc && typeof character.arc === "object" ? character.arc : {};
  if (!clean(arc.want)) {
    return buildGap({
      field: "character.want",
      label: `${name}'s dramatic want`,
      anchor: name,
      question: `What does ${name} want badly enough to keep choosing danger instead of safety?`,
      reason: "A durable want gives the feature a repeatable engine.",
    });
  }
  if (!clean(arc.wound)) {
    return buildGap({
      field: "character.wound",
      label: `${name}'s wound`,
      anchor: name,
      question: `What old wound makes ${name}'s current goal emotionally dangerous?`,
      reason: "The wound turns external plot pressure into personal cost.",
    });
  }
  if (!clean(arc.false_belief ?? arc.falseBelief)) {
    return buildGap({
      field: "character.false_belief",
      label: `${name}'s false belief`,
      anchor: name,
      question: `What false belief is ${name} still using to survive?`,
      reason: "A false belief creates an act-spanning inner argument.",
    });
  }
  if (!clean(arc.current_tactic ?? arc.currentTactic)) {
    return buildGap({
      field: "character.current_tactic",
      label: `${name}'s current tactic`,
      anchor: name,
      question: `What tactic is ${name} relying on right now that the next scene can make fail?`,
      reason: "A failing tactic produces behavior, escalation, and a new choice.",
    });
  }
  if (!clean(arc.next_emotional_turn ?? arc.nextEmotionalTurn)) {
    return buildGap({
      field: "character.next_emotional_turn",
      label: `${name}'s next emotional turn`,
      anchor: name,
      question: `What should ${name} feel by the end of the next scene that they cannot admit at its start?`,
      reason: "The emotional turn keeps plot movement from feeling mechanical.",
    });
  }
  return null;
}

function projectGap({ projectMemory, projectName, protagonistName }) {
  const subject = protagonistName || "the protagonist";
  if (!clean(projectMemory?.protagonist_want)) {
    return buildGap({
      field: "project.protagonist_want",
      label: `${subject}'s feature want`,
      anchor: subject,
      question: `What does ${subject} want badly enough to carry ${projectName} through all three acts?`,
      reason: "The feature needs one durable external pursuit before more beats are added.",
    });
  }
  if (!clean(projectMemory?.central_question)) {
    return buildGap({
      field: "project.central_question",
      label: "the feature's central dramatic question",
      anchor: projectName,
      question: `What single dramatic question should ${projectName} keep tightening until the climax answers it?`,
      reason: "A central question lets every sequence advance the same movie.",
    });
  }
  if (!clean(projectMemory?.antagonistic_force)) {
    return buildGap({
      field: "project.antagonistic_force",
      label: "the antagonistic force",
      anchor: projectName,
      question: `What force can actively punish ${subject} for pursuing that want?`,
      reason: "Active opposition creates escalation instead of incident accumulation.",
    });
  }
  if (!clean(projectMemory?.protagonist_need)) {
    return buildGap({
      field: "project.protagonist_need",
      label: `${subject}'s deeper need`,
      anchor: subject,
      question: `What must ${subject} learn or surrender to become capable of the ending?`,
      reason: "The need connects the external climax to an internal transformation.",
    });
  }
  if (!clean(projectMemory?.ending_image)) {
    return buildGap({
      field: "project.ending_image",
      label: "the ending image",
      anchor: projectName,
      question: `What final image would prove ${projectName} has emotionally changed, without explaining it in dialogue?`,
      reason: "An ending image gives earlier acts a visible destination.",
    });
  }
  if (!clean(projectMemory?.theme_argument)) {
    return buildGap({
      field: "project.theme_argument",
      label: "the theme argument",
      anchor: projectName,
      question: `What does ${projectName} ultimately argue about how a person should live?`,
      reason: "A theme argument helps Clementine judge competing story moves by meaning, not novelty.",
    });
  }
  return null;
}

function dueThreadGap(dueThread) {
  if (!dueThread || typeof dueThread !== "object") return null;
  const setup = clean(dueThread.setup, 180);
  if (!setup) return null;
  const promisedPayoff = clean(dueThread.promised_payoff, 180);
  return buildGap({
    field: "story_thread.payoff_choice",
    label: "the next payoff choice",
    anchor: setup,
    question: promisedPayoff
      ? `Should the next scene pay off "${setup}" as a revelation, a sacrifice, or a reversal?`
      : `What consequence should "${setup}" create when it returns?`,
    reason: "A due setup is the fastest source of forward motion that still belongs to this movie.",
  });
}

function unresolvedSetupGap(values) {
  const setup = cleanList(values, 1, 180)[0] || "";
  if (!setup) return null;
  return buildGap({
    field: "story_thread.next_setup",
    label: "the next setup to reactivate",
    anchor: setup,
    question: `What would make "${setup}" return now with a worse consequence than the audience expects?`,
    reason: "Reactivating an existing promise preserves continuity while restoring momentum.",
  });
}

function fallbackChoiceGap({ protagonistName, projectName }) {
  const subject = protagonistName || "the protagonist";
  return buildGap({
    field: "story.next_irreversible_choice",
    label: "the next irreversible choice",
    anchor: subject || projectName,
    question: `Which safe option should ${subject} lose in the next scene?`,
    reason: "Closing a safe option makes the following beat causally necessary.",
  });
}

export function buildScreenplayQuestionPlan({
  transcript = "",
  creativeMemoryTrace = null,
  studioMeta = null,
  turnPlanner = null,
  answeredLearningContext = null,
} = {}) {
  const text = clean(transcript, 4_000);
  const trace = creativeMemoryTrace && typeof creativeMemoryTrace === "object"
    ? creativeMemoryTrace
    : {};
  const projectMemory = trace.screenplay_project_memory && typeof trace.screenplay_project_memory === "object"
    ? trace.screenplay_project_memory
    : {};
  const target = clean(studioMeta?.screenplayTarget, 32).toLowerCase();
  const projectId = firstValue(
    studioMeta?.screenplayProjectId,
    trace.project_id,
    projectMemory.project_id
  );
  const projectTitle = projectLabel(trace, projectMemory, studioMeta);
  const projectName = projectTitle || "this feature";
  const hasScreenplayContext = Boolean(
    projectId ||
    target ||
    trace.screenplay_project_memory ||
    (trace.character_count > 0 && SCREENPLAY_SIGNAL.test(text)) ||
    SCREENPLAY_SIGNAL.test(text)
  );
  if (!hasScreenplayContext) {
    return {
      active: false,
      mode: "none",
      shouldAsk: false,
      reason: "No screenplay context detected.",
    };
  }

  const directPageRequest = target === "page" || DIRECT_PAGE_REQUEST.test(text);
  if (directPageRequest) {
    return {
      active: true,
      mode: "answer_now",
      shouldAsk: false,
      askAfterDeliverable: false,
      reason: "The writer requested pages or a concrete rewrite; questions must not block execution.",
      projectId,
      projectTitle,
    };
  }

  if (answeredLearningContext && typeof answeredLearningContext === "object") {
    return {
      active: true,
      mode: "apply_learning",
      shouldAsk: false,
      askAfterDeliverable: false,
      reason: "The writer answered the previous story question; apply the answer before opening another gap.",
      objective: "Reflect the clarification through one concrete story consequence or next move without asking another question.",
      projectId,
      projectTitle,
      targetField: clean(answeredLearningContext.targetField, 64),
      targetLabel: clean(answeredLearningContext.targetLabel, 120),
    };
  }

  const writerBlocked = WRITER_BLOCK_SIGNAL.test(text) || clean(turnPlanner?.intent, 64) === "momentum_rescue";
  const developmentTurn = writerBlocked || DEVELOPMENT_SIGNAL.test(text) || clean(turnPlanner?.intent, 64) === "idea_development";
  if (!developmentTurn) {
    return {
      active: true,
      mode: "none",
      shouldAsk: false,
      askAfterDeliverable: false,
      reason: "The turn does not need a screenplay-learning question.",
      projectId,
      projectTitle,
    };
  }

  const characters = Array.isArray(trace.characters) ? trace.characters : [];
  const character = firstNamedCharacter(
    characters,
    text,
    studioMeta?.screenplayCharacterFocus
  );
  const protagonistName = clean(character?.name, 80) || "";
  const dueGap = writerBlocked ? dueThreadGap(trace.due_story_thread) : null;
  const sceneObjective = firstValue(studioMeta?.screenplaySceneObjective, projectMemory.scene_objective);
  const gap = dueGap ||
    (writerBlocked && !sceneObjective
      ? buildGap({
        field: "scene.objective",
        label: "the next scene objective",
        anchor: protagonistName || projectName,
        question: `What must ${protagonistName || "the protagonist"} get before the next scene can end?`,
        reason: "A concrete scene objective converts abstract block into playable action.",
      })
      : null) ||
    characterGap(character) ||
    projectGap({ projectMemory, projectName, protagonistName }) ||
    (writerBlocked ? unresolvedSetupGap(projectMemory.unresolved_setups) : null) ||
    fallbackChoiceGap({ protagonistName, projectName });

  return {
    active: true,
    mode: writerBlocked ? "rescue_then_decide" : "develop_then_learn",
    shouldAsk: true,
    askAfterDeliverable: true,
    projectId,
    projectTitle,
    objective: writerBlocked
      ? "Offer three distinct causal story moves first, then ask one anchored decision question."
      : "Advance the idea first, then ask one question that fills the highest-value durable story gap.",
    targetField: gap.field,
    targetLabel: gap.label,
    anchor: gap.anchor,
    question: gap.question,
    reason: gap.reason,
    memoryAuthority: "writer_clarification",
  };
}

export function createPendingScreenplayLearningQuestion(plan, {
  askedAtTurn = 0,
  now = Date.now(),
} = {}) {
  if (!plan?.active || !plan?.shouldAsk || !clean(plan?.question, 260)) return null;
  const turn = Math.max(0, Math.floor(Number(askedAtTurn) || 0));
  const targetField = clean(plan.targetField, 64);
  return {
    id: `screenplay-learning-${turn}-${targetField || "story"}`,
    projectId: clean(plan.projectId, 96),
    projectTitle: clean(plan.projectTitle, 160),
    targetField,
    targetLabel: clean(plan.targetLabel, 120),
    anchor: clean(plan.anchor, 180),
    question: clean(plan.question, 260),
    askedAtTurn: turn,
    expiresAfterTurn: turn + 2,
    askedAt: Math.max(0, Number(now) || Date.now()),
  };
}

function projectMatches(pending, { projectId = "", projectTitle = "" } = {}) {
  const pendingId = clean(pending?.projectId, 96).toLowerCase();
  const currentId = clean(projectId, 96).toLowerCase();
  if (pendingId && currentId) return pendingId === currentId;
  const pendingTitle = clean(pending?.projectTitle, 160).toLowerCase();
  const currentTitle = clean(projectTitle, 160).toLowerCase();
  if (pendingTitle && currentTitle) return pendingTitle === currentTitle;
  return Boolean(pendingId || pendingTitle) && !currentId && !currentTitle;
}

export function resolvePendingScreenplayLearningAnswer({
  pending = null,
  transcript = "",
  projectId = "",
  projectTitle = "",
  currentTurn = 0,
} = {}) {
  if (!pending || typeof pending !== "object") {
    return { status: "none", shouldClear: false, learningContext: null };
  }
  const turn = Math.max(0, Math.floor(Number(currentTurn) || 0));
  const expiresAfterTurn = Math.max(0, Math.floor(Number(pending.expiresAfterTurn) || 0));
  if (expiresAfterTurn && turn > expiresAfterTurn) {
    return { status: "expired", shouldClear: true, learningContext: null };
  }
  if (!projectMatches(pending, { projectId, projectTitle })) {
    return { status: "different_project", shouldClear: false, learningContext: null };
  }
  const answer = clean(transcript, 2_000);
  if (!answer) return { status: "empty", shouldClear: false, learningContext: null };
  const words = answer.split(/\s+/).filter(Boolean);
  const looksLikeQuestion = /\?\s*$/.test(answer) && !/[.!]\s+/.test(answer);
  const targetField = clean(pending.targetField, 64);
  const acceptsQuestionValue = targetField.toLowerCase() === "project.central_question";
  if (
    NON_ANSWER_SIGNAL.test(answer) ||
    (looksLikeQuestion && !acceptsQuestionValue) ||
    words.length > 140 ||
    DIRECT_PAGE_REQUEST.test(answer)
  ) {
    return { status: "declined", shouldClear: true, learningContext: null };
  }
  return {
    status: "answered",
    shouldClear: true,
    learningContext: {
      questionId: clean(pending.id, 120),
      projectId: clean(pending.projectId || projectId, 96),
      projectTitle: clean(pending.projectTitle || projectTitle, 160),
      targetField,
      targetLabel: clean(pending.targetLabel, 120),
      anchor: clean(pending.anchor, 180),
      question: clean(pending.question, 260),
      authority: "writer_clarification",
    },
  };
}

function normalizeQuestion(value) {
  return clean(value, 320)
    .toLowerCase()
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function enforceScreenplayQuestionPlan(reply, plan) {
  const text = String(reply || "").trim();
  const question = clean(plan?.question, 260);
  if (!text || !plan?.active || !plan?.shouldAsk || !question) return text;
  if (normalizeQuestion(text).includes(normalizeQuestion(question))) return text;

  if (/\?\s*$/.test(text)) {
    const boundaryIndexes = [
      text.lastIndexOf("\n"),
      text.lastIndexOf(". "),
      text.lastIndexOf("! "),
      text.lastIndexOf("? "),
    ];
    const boundaryIndex = Math.max(...boundaryIndexes);
    const prefixEnd = boundaryIndex < 0
      ? 0
      : text[boundaryIndex] === "\n"
        ? boundaryIndex
        : boundaryIndex + 1;
    const prefix = text.slice(0, prefixEnd).trim();
    return prefix ? `${prefix}\n\n${question}` : question;
  }
  return `${text}\n\n${question}`;
}

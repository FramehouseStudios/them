const FEATURE_MAP_BLOCK_OPEN = "<feature_film_map>";
const FEATURE_MAP_BLOCK_CLOSE = "</feature_film_map>";
const DEFAULT_FEATURE_TARGET_PAGES = 110;

const FEATURE_SEQUENCE_TEMPLATE = Object.freeze([
  {
    id: "sequence-1",
    act: "Act I",
    label: "Opening Image / Ordinary World",
    startRatio: 1 / 110,
    endRatio: 12 / 110,
    pressure: "Make the protagonist's wound, want, world, and tonal promise visible through behavior.",
    obligation: "Plant the emotional question the ending must answer.",
    nextMoves: [
      "Open on behavior that shows the wound before anyone explains it.",
      "Plant the ordinary-world rule the movie will later break.",
      "Echo the ending image in a smaller, incomplete form.",
    ],
  },
  {
    id: "sequence-2",
    act: "Act I",
    label: "Catalyst To Commitment",
    startRatio: 13 / 110,
    endRatio: 25 / 110,
    pressure: "Disrupt the old life, force debate, and end Act I with an irreversible choice.",
    obligation: "The protagonist must choose the movie, not merely receive it.",
    nextMoves: [
      "Turn the catalyst into a personal dilemma, not just an event.",
      "Let debate expose the cost of staying the same.",
      "End the act on a choice that burns one safe exit.",
    ],
  },
  {
    id: "sequence-3",
    act: "Act II",
    label: "Promise Of The Premise",
    startRatio: 26 / 110,
    endRatio: 40 / 110,
    pressure: "Let the premise generate cinematic tests, new rules, and sharper tactics.",
    obligation: "Each scene should make the protagonist try a visible strategy and pay a price.",
    nextMoves: [
      "Write tests that force different tactics instead of repeating the premise.",
      "Give each win a cost that narrows later choices.",
      "Bring the B-story into pressure, not decoration.",
    ],
  },
  {
    id: "sequence-4",
    act: "Act II",
    label: "Midpoint Pressure",
    startRatio: 41 / 110,
    endRatio: 55 / 110,
    pressure: "Drive toward a midpoint reversal that changes the meaning of the pursuit.",
    obligation: "The midpoint must raise stakes, reveal a truth, or turn victory into a trap.",
    nextMoves: [
      "Build to a reversal that redefines what the protagonist thought they wanted.",
      "Make the midpoint public, irreversible, or intimate enough to change tactics.",
      "Let the emotional truth arrive before the exposition.",
    ],
  },
  {
    id: "sequence-5",
    act: "Act II",
    label: "Reversal Fallout",
    startRatio: 56 / 110,
    endRatio: 70 / 110,
    pressure: "Make the midpoint cost emotional, relational, and practical ground.",
    obligation: "The protagonist's old tactics should stop working.",
    nextMoves: [
      "Show the old tactic failing in a way the audience can watch.",
      "Turn allies, secrets, and desire into pressure against the protagonist.",
      "Let the relationship cost sharpen the theme argument.",
    ],
  },
  {
    id: "sequence-6",
    act: "Act II",
    label: "Collapse / All Is Lost",
    startRatio: 71 / 110,
    endRatio: 85 / 110,
    pressure: "Escalate to the loss that forces the protagonist to confront the need beneath the want.",
    obligation: "Pay off planted dread; leave one painful truth that can power Act III.",
    nextMoves: [
      "Cash in the most dangerous unresolved setup.",
      "Strip away the false want so the real need becomes unavoidable.",
      "Leave Act II with a painful truth, not just a plot setback.",
    ],
  },
  {
    id: "sequence-7",
    act: "Act III",
    label: "Break Into Three / Final Plan",
    startRatio: 86 / 110,
    endRatio: 98 / 110,
    pressure: "Synthesize A-story and B-story into a new plan the old self could not have chosen.",
    obligation: "The final plan must express change, not just competence.",
    nextMoves: [
      "Let the final plan be born from the character's need, not a clever external trick.",
      "Bring the B-story lesson into the A-story tactic.",
      "Choose payoffs that make earlier behavior feel inevitable.",
    ],
  },
  {
    id: "sequence-8",
    act: "Act III",
    label: "Climax / Final Image",
    startRatio: 99 / 110,
    endRatio: 110 / 110,
    pressure: "Force the decisive choice, resolve the central question, and land a final image with emotional contrast.",
    obligation: "The climax should make the inner arc visible under maximum external pressure.",
    nextMoves: [
      "Make the climax turn on the changed choice only this protagonist can make.",
      "Resolve the theme through behavior under pressure.",
      "Land a final image that answers the opening image with emotional contrast.",
    ],
  },
]);

const FEATURE_ACT_BRIDGES = Object.freeze([
  "Act I -> Act II: move from wound/want into an irreversible choice that makes the premise active.",
  "Act IIa -> Midpoint: turn fun-and-games tests into a revelation that changes the meaning of the goal.",
  "Midpoint -> All Is Lost: make the old tactic fail harder until the false want collapses.",
  "All Is Lost -> Act III: convert the painful truth into a new plan the old self could not choose.",
  "Act III -> Final Image: resolve the central dramatic question through visible behavior, then echo the opening image with changed meaning.",
]);

function trimToString(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, Math.max(1, Number(maxLength || 500)));
}

function trimContextLine(value, maxLength = 220) {
  return trimToString(value, maxLength).replace(/\s+/g, " ").trim();
}

function sanitizeContextList(items, maxItems = 6, maxChars = 180) {
  const source = Array.isArray(items)
    ? items
    : trimToString(items, maxItems * maxChars)
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

function positiveIntegerOrZero(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function targetPagesFromContext(sessionContext = {}) {
  const target = positiveIntegerOrZero(sessionContext.targetPages ?? sessionContext.target_pages);
  return target > 0 ? target : DEFAULT_FEATURE_TARGET_PAGES;
}

function currentPageFromContext(sessionContext = {}) {
  return positiveIntegerOrZero(sessionContext.pageCount ?? sessionContext.page_count);
}

function scaledRange(template, targetPages) {
  const target = targetPagesFromContext({ targetPages });
  const start = clamp(Math.round(template.startRatio * target), 1, target);
  const end = clamp(Math.round(template.endRatio * target), start, target);
  return { start, end };
}

function findSequenceForPage(pageCount, targetPages) {
  const page = positiveIntegerOrZero(pageCount);
  const target = targetPagesFromContext({ targetPages });
  if (page <= 0) return null;
  const safePage = clamp(page, 1, target);
  return FEATURE_SEQUENCE_TEMPLATE.find((template) => {
    const range = scaledRange(template, target);
    return safePage >= range.start && safePage <= range.end;
  }) || FEATURE_SEQUENCE_TEMPLATE[FEATURE_SEQUENCE_TEMPLATE.length - 1];
}

function nextSequenceAfter(sequence) {
  if (!sequence) return FEATURE_SEQUENCE_TEMPLATE[0];
  const index = FEATURE_SEQUENCE_TEMPLATE.findIndex((candidate) => candidate.id === sequence.id);
  if (index < 0) return FEATURE_SEQUENCE_TEMPLATE[0];
  return FEATURE_SEQUENCE_TEMPLATE[Math.min(index + 1, FEATURE_SEQUENCE_TEMPLATE.length - 1)];
}

function isWholeFeatureActTarget(actLabel) {
  const text = trimToString(actLabel, 160).toLowerCase();
  if (!text) return false;
  const hasActOne = /\bact\s*(?:i|1|one)\b|\bfirst act\b/.test(text);
  const hasActTwo = /\bact\s*(?:ii|2|two)\b|\bsecond act\b/.test(text);
  const hasActThree = /\bact\s*(?:iii|3|three)\b|\bthird act|final act|finale\b/.test(text);
  return (
    (hasActOne && hasActTwo && hasActThree) ||
    /\b(entire|whole|full)\b.*\b(feature|film|movie|screenplay|script)\b/.test(text) ||
    /\b(feature|film|movie|screenplay|script)\b.*\b(entire|whole|full)\b/.test(text)
  );
}

function inferActKind(actLabel) {
  const text = trimToString(actLabel, 120).toLowerCase();
  if (!text) return "";
  if (/\b(?:act\s*)?(?:i|1|one|first)\b/.test(text)) return "act1";
  if (/\b(?:act\s*)?(?:ii|2|two|second)\b/.test(text)) return "act2";
  if (/\b(?:act\s*)?(?:iii|3|three|third)\b/.test(text)) return "act3";
  return "";
}

function actPressureForLabel(actLabel) {
  switch (inferActKind(actLabel)) {
    case "act1":
      return "Act I must make the wound, want, theme question, catalyst, and irreversible choice visible.";
    case "act2":
      return "Act II must escalate tactics, reversals, midpoint pressure, relational cost, and all-is-lost collapse.";
    case "act3":
      return "Act III must synthesize the character's need into a final plan, climax, and emotionally contrasting final image.";
    default:
      return "Locate the current act turn before writing so the next pages escalate the whole movie.";
  }
}

function sequencesForActLabel(actLabel) {
  const text = trimToString(actLabel, 160);
  if (!text) return [];
  if (isWholeFeatureActTarget(text)) return [...FEATURE_SEQUENCE_TEMPLATE];
  switch (inferActKind(text)) {
    case "act1":
      return FEATURE_SEQUENCE_TEMPLATE.filter((sequence) => sequence.act === "Act I");
    case "act2":
      return FEATURE_SEQUENCE_TEMPLATE.filter((sequence) => sequence.act === "Act II");
    case "act3":
      return FEATURE_SEQUENCE_TEMPLATE.filter((sequence) => sequence.act === "Act III");
    default:
      return [];
  }
}

function firstSequenceForActLabel(actLabel) {
  return sequencesForActLabel(actLabel)[0] || null;
}

function buildActRoadmapLines() {
  return [
    "  act_ladder:",
    "    - Act I: wound, want, catalyst, debate, irreversible choice into the movie.",
    "    - Act II: tests, reversals, midpoint truth, escalating cost, all-is-lost collapse.",
    "    - Act III: synthesis, final plan, climax under maximum pressure, final image.",
  ];
}

function buildActBridgeLines() {
  return [
    "  act_bridge_ladder:",
    ...FEATURE_ACT_BRIDGES.map((bridge) => `    - ${bridge}`),
  ];
}

function buildActSequenceRunwayLines({ actLabel = "", targetPages = DEFAULT_FEATURE_TARGET_PAGES } = {}) {
  const targetAct = trimContextLine(actLabel, 160);
  const sequences = sequencesForActLabel(targetAct);
  if (!targetAct || !sequences.length) return [];
  const lines = [
    "  act_sequence_runway:",
    `    target: ${targetAct}`,
    "    sequence_lanes:",
  ];
  for (const sequence of sequences) {
    const range = scaledRange(sequence, targetPages);
    lines.push(`      - ${sequence.act} - ${sequence.label} (p${range.start}-${range.end}): ${sequence.obligation}`);
  }
  lines.push("    next_three_turns:");
  for (const sequence of sequences.slice(0, 3)) {
    const move = Array.isArray(sequence.nextMoves) && sequence.nextMoves[0]
      ? sequence.nextMoves[0]
      : sequence.pressure;
    lines.push(`      - ${sequence.label}: ${move}`);
  }
  lines.push("    act_handoff: every local scene must push the next sequence obligation; do not write isolated set pieces.");
  return lines;
}

function buildFeatureCompassLines() {
  return [
    "  feature_compass:",
    "    - before_pages: silently lock act, sequence, scene job, protagonist want/need, emotional handoff, open setup, and exit turn.",
    "    - act_to_act_causality: every page should push a choice/cost chain from the current act toward the ending image.",
    "    - scene_to_feature_loop: each scene must satisfy its local objective while changing the whole movie's pressure.",
    "    - screenplay_speed: choose the next best playable move and write it; do not explain process unless asked.",
    "    - page_velocity: first non-empty output line should be Fountain page text; every half-page needs visible behavior, tactic shift, reveal, cost, or image pressure.",
    "    - completion_output: for whole-feature requests, return current sequence, next three turns, Act III payoff path, final-image pressure, and the immediate next page move.",
    "    - page_quality_gate: no placeholder scenes, generic banter, prose summary, or invented deus-ex-machina information; use visual action, conflict, subtext, and consequence.",
  ];
}

function buildExpertExecutionLines() {
  return [
    "  expert_scene_execution:",
    "    - scene_job: make the objective, obstacle, pressure clock, and cost visible on the page.",
    "    - turn_engine: each scene must change leverage, information, relationship, or self-knowledge.",
    "    - pressure_clock: give the scene a visible deadline, narrowing option, or cost that makes the next beat necessary.",
    "    - hidden_want: know what each major character wants but will not say; let behavior and interruption reveal it.",
    "    - subtext_engine: dialogue should hide need inside tactic, interruption, pressure, and behavior.",
    "    - image_system: plant, echo, and transform motifs toward the ending image.",
    "    - exit_velocity: leave each scene with a new problem, cost, reveal, or irreversible choice.",
    "    - speed_protocol: when the user asks for pages, write playable Fountain immediately with no diagnosis, strategy note, menu, or permission loop.",
    "    - page_first_protocol: when the target is page text, output screenplay pages without markdown, menu choices, or permission language.",
    "    - vapor_guard: replace vague tension, staring, silence, and abstract emotional prose with concrete behavior that changes story state.",
  ];
}

function buildFeatureScaleOutputContractLines() {
  return [
    "  feature_scale_output_contract:",
    "    - For 5-15 page requests, silently break the run into 2-4 escalating scene turns: launch pressure, complication, reversal, exit image.",
    "    - Page batches must change story state every 1-2 pages; no filler conversation, static explanation, or repeated tactic.",
    "    - First useful line must be page text; no labels, throat-clearing, strategy notes, or summary before the slug/action/cue.",
    "    - Write toward the next structural obligation, not merely the next incident.",
    "    - Act I pages must earn commitment; Act II pages must test and break the false tactic; Act III pages must spend planted setups through changed behavior.",
    "    - Carry one unresolved setup forward and plant, echo, or pay off one image toward the final image.",
    "    - End each batch with a handoff: new problem, decision, reveal, emotional cost, or irreversible choice.",
  ];
}

function buildFeatureContinuityLedgerLines(sessionContext = {}) {
  const logline = trimContextLine(sessionContext.logline, 260);
  const themeArgument = trimContextLine(
    sessionContext.themeArgument ?? sessionContext.theme_argument ?? sessionContext.theme,
    260
  );
  const centralQuestion = trimContextLine(
    sessionContext.centralQuestion ?? sessionContext.central_question ?? sessionContext.dramaticQuestion ?? sessionContext.dramatic_question,
    260
  );
  const protagonistWant = trimContextLine(sessionContext.protagonistWant ?? sessionContext.protagonist_want, 180);
  const protagonistNeed = trimContextLine(sessionContext.protagonistNeed ?? sessionContext.protagonist_need, 180);
  const antagonisticForce = trimContextLine(
    sessionContext.antagonisticForce ?? sessionContext.antagonistic_force,
    220
  );
  const endingImage = trimContextLine(
    sessionContext.endingImage ?? sessionContext.ending_image ?? sessionContext.finalImage ?? sessionContext.final_image,
    240
  );
  const characterFocus = sanitizeContextList(
    sessionContext.characterFocus ?? sessionContext.character_focus ?? sessionContext.characters ?? sessionContext.currentCharacters,
    6,
    120
  );
  const unresolvedSetups = sanitizeContextList(
    sessionContext.unresolvedSetups ?? sessionContext.unresolved_setups ?? sessionContext.openLoops ?? sessionContext.open_loops,
    6,
    200
  );
  const continuityNotes = sanitizeContextList(
    sessionContext.continuityNotes ?? sessionContext.continuity_notes ?? sessionContext.notes,
    6,
    200
  );
  const lines = [
    "  feature_continuity_ledger:",
    "    purpose: preserve the whole movie while writing the immediate next playable beat.",
  ];
  if (logline) lines.push(`    logline_lock: ${logline}`);
  if (themeArgument) lines.push(`    theme_argument_to_test: ${themeArgument}`);
  if (centralQuestion) lines.push(`    central_question_to_answer: ${centralQuestion}`);
  if (protagonistWant || protagonistNeed) {
    lines.push(`    protagonist_engine: want=${protagonistWant || "unknown"}; need=${protagonistNeed || "unknown"}`);
  }
  if (antagonisticForce) lines.push(`    opposition_engine: ${antagonisticForce}`);
  if (endingImage) lines.push(`    final_image_pressure: ${endingImage}`);
  if (characterFocus.length) {
    lines.push("    active_character_pressure:");
    for (const character of characterFocus) lines.push(`      - ${character}`);
  }
  if (unresolvedSetups.length) {
    lines.push("    active_setups_to_carry_or_pay:");
    for (const setup of unresolvedSetups) lines.push(`      - ${setup}`);
  }
  if (continuityNotes.length) {
    lines.push("    continuity_promises:");
    for (const note of continuityNotes) lines.push(`      - ${note}`);
  }
  lines.push("    ledger_rules:");
  lines.push("      - Every new scene must alter the want/need engine, the opposition engine, or the central question.");
  lines.push("      - Spend planted setups and image echoes before inventing new solutions.");
  lines.push("      - Preserve emotional residue from the previous scene; do not reset characters between sequences.");
  return lines;
}

function buildActExitChecklistLines({ sequence = null, explicitAct = "" } = {}) {
  const activeAct = trimContextLine(sequence?.act || explicitAct, 120);
  const lines = [
    "  act_exit_checklist:",
    "    - Act I exit: protagonist makes an irreversible choice that activates the premise and burns a safe exit.",
    "    - Act II exit: old tactic collapses, false want is exposed, and one painful truth powers the Act III plan.",
    "    - Act III exit: changed behavior resolves the central question and transforms the final image.",
  ];
  if (activeAct) {
    const activeActKind = inferActKind(activeAct);
    lines.push(`    active_act_watch: ${activeAct}`);
    if (activeActKind === "act1") {
      lines.push("    active_handoff: write toward commitment, not explanation.");
    } else if (activeActKind === "act2") {
      lines.push("    active_handoff: write toward reversal, cost, and collapse of the false tactic.");
    } else if (activeActKind === "act3") {
      lines.push("    active_handoff: write toward synthesis, payoff, and the changed final choice.");
    }
  }
  return lines;
}

function requestedPageBatchFromTask(screenplayTask = {}) {
  const requestedPages = positiveIntegerOrZero(
    screenplayTask?.requestedPages ??
    screenplayTask?.requested_pages ??
    screenplayTask?.pageBatch ??
    screenplayTask?.page_batch
  );
  return requestedPages > 0 && requestedPages <= 30 ? requestedPages : 0;
}

function requestedActFromTask(screenplayTask = {}) {
  return trimContextLine(screenplayTask?.requestedAct ?? screenplayTask?.requested_act, 120);
}

function buildFeaturePageBatchPlanLines({
  screenplayTask = null,
  sequence = null,
  targetPages = DEFAULT_FEATURE_TARGET_PAGES,
  currentPage = 0,
  explicitAct = "",
} = {}) {
  const requestedPages = requestedPageBatchFromTask(screenplayTask);
  if (requestedPages <= 0) return [];
  const requestedAct = requestedActFromTask(screenplayTask);
  const targetAct = requestedAct || explicitAct;
  const activeSequence = sequence || firstSequenceForActLabel(targetAct);
  const lines = [
    "  page_batch_execution_plan:",
    `    requested_pages: ${requestedPages}`,
  ];
  if (targetAct) lines.push(`    target_act: ${targetAct}`);
  if (currentPage > 0) lines.push(`    starting_position: p${clamp(currentPage, 1, targetPages)} / ${targetPages}`);
  if (activeSequence) {
    lines.push(`    active_sequence_pressure: ${activeSequence.act} - ${activeSequence.label}: ${activeSequence.pressure}`);
    lines.push(`    structural_obligation_due_now: ${activeSequence.obligation}`);
  } else if (targetAct) {
    lines.push(`    active_sequence_pressure: ${actPressureForLabel(targetAct)}`);
  }
  lines.push("    turn_budget: 2-4 escalating scene turns, not one static conversation.");
  lines.push("    delivery: write clean Fountain pages first; no outline, diagnosis, recap, markdown fence, menu choices, or permission loop unless explicitly requested.");
  lines.push("    continuity: treat the draft excerpt as the live previous page and preserve the emotional handoff.");
  lines.push("    scene_turn_tests:");
  lines.push("      - launch: inherit the previous emotional residue through visible behavior.");
  lines.push("      - complication: add an obstacle that changes tactic, not just louder dialogue.");
  lines.push("      - reversal: change leverage, information, relationship, or self-knowledge.");
  lines.push("      - exit: leave a cost, reveal, decision, or image that changes the feature state.");
  lines.push("    end_condition: finish the batch on a decision, reveal, cost, or image that hands into the next sequence.");
  return lines;
}

function buildStorySpineLines(sessionContext = {}) {
  const spineFields = [
    ["logline", sessionContext.logline],
    ["theme_argument", sessionContext.themeArgument ?? sessionContext.theme_argument ?? sessionContext.theme],
    ["central_question", sessionContext.centralQuestion ?? sessionContext.central_question ?? sessionContext.dramaticQuestion ?? sessionContext.dramatic_question],
    ["protagonist_want", sessionContext.protagonistWant ?? sessionContext.protagonist_want],
    ["protagonist_need", sessionContext.protagonistNeed ?? sessionContext.protagonist_need],
    ["antagonistic_force", sessionContext.antagonisticForce ?? sessionContext.antagonistic_force],
    ["ending_image", sessionContext.endingImage ?? sessionContext.ending_image ?? sessionContext.finalImage ?? sessionContext.final_image],
  ];
  const lines = [];
  for (const [label, raw] of spineFields) {
    const clean = trimContextLine(raw, 260);
    if (clean) lines.push(`    ${label}: ${clean}`);
  }
  return lines.length ? ["  story_spine:", ...lines] : [];
}

function buildContinuityAssetLines(sessionContext = {}) {
  const currentBeat = trimContextLine(
    sessionContext.currentBeat ?? sessionContext.current_beat ?? sessionContext.beat,
    220
  );
  const emotionalHandoff = trimContextLine(
    sessionContext.emotionalContinuity ?? sessionContext.emotional_continuity ?? sessionContext.emotionalHandoff,
    260
  );
  const sceneObjective = trimContextLine(
    sessionContext.sceneObjective ?? sessionContext.scene_objective ?? sessionContext.currentSceneObjective,
    260
  );
  const featureSequence = trimContextLine(
    sessionContext.featureSequence ?? sessionContext.feature_sequence ?? sessionContext.currentSequence ?? sessionContext.current_sequence,
    220
  );
  const featureObligation = trimContextLine(
    sessionContext.featureObligation ?? sessionContext.feature_obligation ?? sessionContext.structuralObligation ?? sessionContext.structural_obligation,
    280
  );
  const nextScenePlan = trimContextLine(
    sessionContext.nextScenePlan ?? sessionContext.next_scene_plan ?? sessionContext.nextPagePlan ?? sessionContext.next_page_plan,
    340
  );
  const nextSceneMoves = sanitizeContextList(
    sessionContext.nextSceneMoves ?? sessionContext.next_scene_moves ?? sessionContext.nextPageMoves ?? sessionContext.next_page_moves,
    5,
    180
  );
  const characterFocus = sanitizeContextList(
    sessionContext.characterFocus ?? sessionContext.character_focus ?? sessionContext.characters ?? sessionContext.currentCharacters,
    6,
    120
  );
  const unresolvedSetups = sanitizeContextList(
    sessionContext.unresolvedSetups ?? sessionContext.unresolved_setups ?? sessionContext.openLoops ?? sessionContext.open_loops,
    6,
    200
  );
  const lines = [];
  if (sceneObjective) lines.push(`    current_scene_objective: ${sceneObjective}`);
  if (currentBeat) lines.push(`    current_beat: ${currentBeat}`);
  if (emotionalHandoff) lines.push(`    emotional_handoff: ${emotionalHandoff}`);
  if (featureSequence) lines.push(`    feature_sequence: ${featureSequence}`);
  if (featureObligation) lines.push(`    structural_obligation_due_now: ${featureObligation}`);
  if (nextScenePlan) lines.push(`    next_scene_plan: ${nextScenePlan}`);
  if (nextSceneMoves.length) {
    lines.push("    next_scene_moves:");
    for (const move of nextSceneMoves) lines.push(`      - ${move}`);
  }
  if (characterFocus.length) {
    lines.push("    character_focus:");
    for (const character of characterFocus) lines.push(`      - ${character}`);
  }
  if (unresolvedSetups.length) {
    lines.push("    unresolved_setups_to_track:");
    for (const setup of unresolvedSetups) lines.push(`      - ${setup}`);
  }
  return lines.length ? ["  continuity_assets:", ...lines] : [];
}

function buildNextPageMoveLines(sequence) {
  const moves = Array.isArray(sequence?.nextMoves) ? sequence.nextMoves : [];
  if (!moves.length) return [];
  return [
    "  next_page_moves:",
    ...moves.slice(0, 3).map((move) => `    - ${move}`),
  ];
}

function screenplayIntentNeedsFeatureMap(intent) {
  return new Set([
    "write_scene",
    "rewrite_scene",
    "continue_script",
    "scene_doctor",
    "outline_structure",
    "character_development",
    "emotional_continuity",
    "pacing_pass",
    "finish_feature",
    "momentum_rescue",
    "general_story",
  ]).has(trimToString(intent, 80));
}

function buildFeatureScreenplayMapBlock({ sessionContext = null, screenplayTask = null } = {}) {
  const intent = trimToString(screenplayTask?.intent, 80);
  const hasFeatureContext = sessionContext && typeof sessionContext === "object" && (
    currentPageFromContext(sessionContext) > 0 ||
    positiveIntegerOrZero(sessionContext.targetPages ?? sessionContext.target_pages) > 0 ||
    trimToString(sessionContext.act ?? sessionContext.currentAct ?? sessionContext.current_act, 120) ||
    trimToString(sessionContext.draftExcerpt ?? sessionContext.draft_excerpt, 200)
  );
  if (!screenplayIntentNeedsFeatureMap(intent) && !hasFeatureContext) return "";

  const targetPages = targetPagesFromContext(sessionContext || {});
  const rawCurrentPage = currentPageFromContext(sessionContext || {});
  const explicitAct = trimToString(
    sessionContext?.act ?? sessionContext?.currentAct ?? sessionContext?.current_act,
    120
  );
  const requestedAct = requestedActFromTask(screenplayTask);
  const actRunwayLabel = requestedAct || explicitAct;
  const explicitActKind = inferActKind(explicitAct);
  const lowDraftEstimateConflictsWithAct = rawCurrentPage > 0
    && rawCurrentPage <= 2
    && explicitActKind
    && explicitActKind !== "act1";
  const currentPage = lowDraftEstimateConflictsWithAct ? 0 : rawCurrentPage;
  const sequence = findSequenceForPage(currentPage, targetPages);
  const nextSequence = nextSequenceAfter(sequence);
  const lines = [
    "operating_principle: Clementine thinks like a whole-feature screenwriter, not a single-scene chatbot.",
    `target_pages: ${targetPages}`,
    ...buildActRoadmapLines(),
    ...buildActBridgeLines(),
    ...buildFeatureCompassLines(),
    ...buildExpertExecutionLines(),
    ...buildFeatureScaleOutputContractLines(),
    ...buildFeatureContinuityLedgerLines(sessionContext || {}),
    ...buildActExitChecklistLines({ sequence, explicitAct }),
    ...buildActSequenceRunwayLines({
      actLabel: actRunwayLabel,
      targetPages,
    }),
    ...buildFeaturePageBatchPlanLines({
      screenplayTask,
      sequence,
      targetPages,
      currentPage,
      explicitAct,
    }),
    ...buildStorySpineLines(sessionContext || {}),
    ...buildContinuityAssetLines(sessionContext || {}),
  ];

  if (currentPage > 0) {
    const current = sequence || FEATURE_SEQUENCE_TEMPLATE[0];
    const range = scaledRange(current, targetPages);
    lines.push(`  current_position: p${clamp(currentPage, 1, targetPages)} / ${targetPages}`);
    lines.push(`  current_sequence: ${current.act} - ${current.label} (p${range.start}-${range.end})`);
    if (explicitAct) lines.push(`  active_act_label: ${explicitAct}`);
    lines.push("  due_now:");
    lines.push(`    - ${current.pressure}`);
    lines.push(`    - ${current.obligation}`);
    lines.push(...buildNextPageMoveLines(current));
    if (nextSequence && nextSequence.id !== current.id) {
      const nextRange = scaledRange(nextSequence, targetPages);
      lines.push("  coming_next:");
      lines.push(`    - ${nextSequence.act} - ${nextSequence.label} (p${nextRange.start}-${nextRange.end}): ${nextSequence.pressure}`);
    }
  } else if (explicitAct) {
    const actSequence = firstSequenceForActLabel(explicitAct);
    const followingSequence = actSequence ? nextSequenceAfter(actSequence) : null;
    lines.push(`  active_act_label: ${explicitAct}`);
    if (lowDraftEstimateConflictsWithAct) {
      lines.push("  position_basis: outline act label overrides low draft-page estimate.");
    }
    lines.push(`  active_act_pressure: ${actPressureForLabel(explicitAct)}`);
    lines.push("  due_now:");
    if (actSequence) {
      const range = scaledRange(actSequence, targetPages);
      lines.push(`    - inferred_sequence_lane: ${actSequence.act} - ${actSequence.label} (p${range.start}-${range.end})`);
      lines.push(`    - ${actSequence.pressure}`);
      lines.push(`    - ${actSequence.obligation}`);
      lines.push(...buildNextPageMoveLines(actSequence));
      if (followingSequence && followingSequence.id !== actSequence.id) {
        const nextRange = scaledRange(followingSequence, targetPages);
        lines.push("  coming_next:");
        lines.push(`    - ${followingSequence.act} - ${followingSequence.label} (p${nextRange.start}-${nextRange.end}): ${followingSequence.pressure}`);
      }
    } else {
      lines.push(`    - ${actPressureForLabel(explicitAct)}`);
      lines.push("  next_page_moves:");
      lines.push("    - Name the active structural obligation before writing.");
      lines.push("    - Advance one irreversible character choice instead of summarizing the act.");
      lines.push("    - Preserve the emotional handoff from the previous beat.");
    }
  }

  lines.push("  feature_completion_protocol:");
  lines.push("    - For planning requests, orient the writer in the act/sequence before choosing the next pages.");
  lines.push("    - For page requests, silently lock act/sequence obligations and begin with playable Fountain text.");
  lines.push("    - Return a feature-scale beat chain when the user asks for the whole movie: current sequence, next three turns, Act III payoff path.");
  lines.push("    - For multi-page requests, make every 1-2 pages alter leverage, information, relationship, tactic, or emotional cost.");
  lines.push("    - Track unresolved setups, reversals, character need, theme argument, and ending image.");
  lines.push("    - When the user asks to finish pages or Studio targets page text, write playable Fountain first with no diagnosis, strategy note, outline, recap, or permission loop unless explicitly asked.");
  lines.push("    - For Act I -> Act II -> Act III requests, keep every beat causally linked to the protagonist's want/need and final image.");
  lines.push("    - Never solve Act III by adding information the movie has not earned; pay off planted behavior.");

  return `${FEATURE_MAP_BLOCK_OPEN}\n${lines.join("\n")}\n${FEATURE_MAP_BLOCK_CLOSE}`;
}

export {
  FEATURE_MAP_BLOCK_OPEN,
  FEATURE_MAP_BLOCK_CLOSE,
  FEATURE_SEQUENCE_TEMPLATE,
  DEFAULT_FEATURE_TARGET_PAGES,
  buildFeatureScreenplayMapBlock,
  findSequenceForPage,
};

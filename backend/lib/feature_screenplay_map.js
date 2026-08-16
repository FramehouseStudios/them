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

const ACT_PAGE_ENGINE_TEMPLATE = Object.freeze({
  act1: {
    label: "Act I",
    pageJob: "turn the wound and want into a catalyst, debate under pressure, and an irreversible choice.",
    mandates: [
      "Make the protagonist's ordinary-world behavior reveal the wound before anyone explains it.",
      "Turn the catalyst into a personal dilemma with a cost for staying and a cost for moving.",
      "Escalate debate through action, interruption, and consequence, not repetitive discussion.",
      "End the act lane by burning a safe exit so Act II becomes active and necessary.",
    ],
    traps: [
      "Do not front-load mythology or backstory before the audience can watch desire under pressure.",
      "Do not let the protagonist merely receive the plot; force a visible choice.",
    ],
  },
  act2: {
    label: "Act II",
    pageJob: "break false tactics through escalating tests, midpoint pressure, relationship cost, and all-is-lost truth.",
    mandates: [
      "Make the protagonist try a tactic that partly works and makes the next tactic more expensive.",
      "Every 1-2 pages should alter leverage, information, relationship, tactic, or emotional cost.",
      "Aim midpoint pages at revelation or reversal; aim late Act II pages at the collapse of the false tactic.",
      "Use B-story pressure as a live force that changes the A-story tactic.",
    ],
    traps: [
      "Do not repeat the premise as a string of similar tests.",
      "Do not solve pressure through explanation when a cost, reveal, or betrayal can change the scene state.",
    ],
  },
  act3: {
    label: "Act III",
    pageJob: "pay off planted setups through changed behavior, final plan, climax choice, and final image contrast.",
    mandates: [
      "Build the final plan from the protagonist's need, not from a clever unplanted trick.",
      "Pay off at least one remembered setup, motif, or relationship fracture through action.",
      "Make the climax turn on a choice the old self could not have made.",
      "Echo the opening image with changed meaning before the final handoff.",
    ],
    traps: [
      "Do not introduce unearned information to solve the ending.",
      "Do not make the climax merely competent; make it emotionally transformed.",
    ],
  },
});

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

function bridgePressureForSequence(sequence = null) {
  switch (trimToString(sequence?.id, 40)) {
    case "sequence-1":
    case "sequence-2":
      return FEATURE_ACT_BRIDGES[0];
    case "sequence-3":
    case "sequence-4":
      return FEATURE_ACT_BRIDGES[1];
    case "sequence-5":
      return FEATURE_ACT_BRIDGES[2];
    case "sequence-6":
      return FEATURE_ACT_BRIDGES[3];
    case "sequence-7":
    case "sequence-8":
      return FEATURE_ACT_BRIDGES[4];
    default:
      return "";
  }
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
  if (isWholeFeatureActTarget(text)) return "";
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

function actPageEngineForLabel(actLabel = "") {
  const kind = inferActKind(actLabel);
  return kind ? ACT_PAGE_ENGINE_TEMPLATE[kind] : null;
}

function isWholeFeatureTask({ screenplayTask = null, explicitAct = "", requestedAct = "" } = {}) {
  const featureScope = trimContextLine(screenplayTask?.featureScope ?? screenplayTask?.feature_scope, 80).toLowerCase();
  return featureScope === "whole_feature" ||
    isWholeFeatureActTarget(requestedAct) ||
    isWholeFeatureActTarget(explicitAct);
}

function buildActAwarePageEngineLines({
  sequence = null,
  screenplayTask = null,
  explicitAct = "",
  requestedAct = "",
} = {}) {
  const wholeFeature = isWholeFeatureTask({ screenplayTask, explicitAct, requestedAct });
  const activeActLabel = wholeFeature
    ? String(sequence?.act || requestedAct || explicitAct || "").trim()
    : String(requestedAct || sequence?.act || explicitAct || "").trim();
  const activeEngine = actPageEngineForLabel(activeActLabel);
  if (!wholeFeature && !activeEngine) return [];

  const lines = [
    "  act_aware_page_engine:",
    "    purpose: turn act position into faster, smarter playable pages instead of generic scene continuation.",
    "    scene_math: objective + obstacle + pressure clock + tactic + reversal + residue + exit image.",
    "    render_order: inherit previous emotional state, apply act job, force a visible tactic, change story state, leave a handoff.",
  ];

  if (activeEngine) {
    lines.push(`    active_act: ${activeEngine.label}`);
    lines.push(`    page_job: ${activeEngine.pageJob}`);
    if (sequence?.label) {
      lines.push(`    active_sequence_job: ${sequence.act} - ${sequence.label}: ${sequence.obligation}`);
    }
    lines.push("    act_specific_mandates:");
    for (const mandate of activeEngine.mandates) lines.push(`      - ${mandate}`);
    lines.push("    act_failure_modes_to_avoid:");
    for (const trap of activeEngine.traps) lines.push(`      - ${trap}`);
  }

  if (wholeFeature) {
    lines.push("    whole_feature_chain:");
    for (const key of ["act1", "act2", "act3"]) {
      const engine = ACT_PAGE_ENGINE_TEMPLATE[key];
      lines.push(`      - ${engine.label}: ${engine.pageJob}`);
    }
    lines.push("    whole_feature_rule: if the user asks for Act I to Act II to Act III, build a causal bridge first, then write the immediate next pages that serve that bridge.");
  }

  lines.push("    page_sprint_checks:");
  lines.push("      - If a scene has no pressure clock, add one before writing dialogue.");
  lines.push("      - If two beats use the same tactic, change tactic or cut the weaker beat.");
  lines.push("      - If a page explains emotion, replace it with behavior, subtext, image, or consequence.");
  lines.push("      - If the batch reaches a natural turn early, continue through the aftermath cost instead of stopping.");
  return lines;
}

function buildFeatureScaleOutputContractLines() {
  return [
    "  feature_scale_output_contract:",
    "    - For 5-15 page requests, silently break the run into 2-4 escalating scene turns: launch pressure, complication, reversal, exit image.",
    "    - Page batches must change story state every 1-2 pages; no filler conversation, static explanation, or repeated tactic.",
    "    - Dialogue batches must carry subtext through tactic, interruption, behavior, and consequence; avoid on-the-nose feelings talk as the primary engine.",
    "    - Long exchanges need visible turns: an object used differently, a discovery, a blocked exit, a reveal, a cost, or a changed tactic.",
    "    - First useful line must be page text; no labels, throat-clearing, strategy notes, or summary before the slug/action/cue.",
    "    - Write toward the next structural obligation, not merely the next incident.",
    "    - Act I pages must earn commitment; Act II pages must test and break the false tactic; Act III pages must spend planted setups through changed behavior.",
    "    - Carry one unresolved setup forward and plant, echo, or pay off one image toward the final image.",
    "    - End each batch with a handoff: new problem, decision, reveal, emotional cost, or irreversible choice.",
  ];
}

function buildWholeFeatureActProgressionLines({
  screenplayTask = null,
  explicitAct = "",
  requestedAct = "",
  targetPages = DEFAULT_FEATURE_TARGET_PAGES,
} = {}) {
  if (!isWholeFeatureTask({ screenplayTask, explicitAct, requestedAct })) return [];
  const lines = [
    "  whole_feature_act_progression:",
    "    purpose: keep the complete Act I / Act II / Act III movie in view while writing only the next useful pages.",
    "    planner_output_when_asked: act spine, sequence map, next three turns, unresolved setups, Act III payoff path, final image, immediate page assignment.",
    "    act_chain:",
  ];
  for (const sequence of FEATURE_SEQUENCE_TEMPLATE) {
    const range = scaledRange(sequence, targetPages);
    lines.push(`      - ${sequence.act} - ${sequence.label} (p${range.start}-${range.end}): ${sequence.pressure} Obligation: ${sequence.obligation}`);
  }
  lines.push("    causal_rules:");
  lines.push("      - Act I choices must create the Act II problem; do not let Act II feel like a new movie.");
  lines.push("      - The midpoint must change the meaning of the goal, not merely make the plot louder.");
  lines.push("      - All-is-lost must expose the false want so Act III can be powered by the real need.");
  lines.push("      - Act III payoffs must come from planted behavior, setups, motifs, and relationship fractures.");
  lines.push("      - For whole-feature help, return the map only when asked for planning; when asked for pages, write the immediate page assignment first.");
  return lines;
}

function buildBeatToPageContinuationLines({
  sessionContext = {},
  screenplayTask = null,
  sequence = null,
  explicitAct = "",
  requestedAct = "",
} = {}) {
  const requestedPages = requestedPageBatchFromTask(screenplayTask);
  const currentBeat = trimContextLine(
    sessionContext.currentBeat ?? sessionContext.current_beat ?? sessionContext.beat,
    220
  );
  const lastSceneOutcome = trimContextLine(
    sessionContext.lastSceneOutcome ?? sessionContext.last_scene_outcome,
    240
  );
  const nextScenePlan = trimContextLine(
    sessionContext.nextScenePlan ?? sessionContext.next_scene_plan ?? sessionContext.nextPagePlan ?? sessionContext.next_page_plan,
    340
  );
  const nextSceneMoves = sanitizeContextList(
    sessionContext.nextSceneMoves ?? sessionContext.next_scene_moves ?? sessionContext.nextPageMoves ?? sessionContext.next_page_moves,
    4,
    180
  );
  const nextThreeTurns = sanitizeContextList(
    sessionContext.nextThreeTurns ?? sessionContext.next_three_turns,
    3,
    180
  );
  const beatSequence = sanitizeContextList(
    sessionContext.beatSequence ?? sessionContext.beat_sequence ?? sessionContext.selectedBeats ?? sessionContext.selected_beats,
    8,
    180
  );
  const actLabel = requestedAct || explicitAct || sequence?.act || "";
  const hasUsefulContinuationInput = Boolean(
    requestedPages > 0 ||
    sequence ||
    actLabel ||
    currentBeat ||
    lastSceneOutcome ||
    nextScenePlan ||
    nextSceneMoves.length ||
    nextThreeTurns.length ||
    beatSequence.length
  );
  if (!hasUsefulContinuationInput) return [];

  const lines = [
    "  beat_to_page_continuation_engine:",
    "    purpose: convert act plan and remembered beats into immediate playable screenplay, not labels or outline prose.",
    "    active_page_mission: spend the next required beat on the page before inventing a new lane.",
    "    beat_to_page_math: inherited residue -> immediate objective -> obstacle -> tactic -> reversal/cost -> residue -> next handoff.",
  ];
  if (actLabel) lines.push(`    active_act_lane: ${actLabel}`);
  if (sequence?.label) lines.push(`    active_sequence_lane: ${sequence.act} - ${sequence.label}: ${sequence.obligation}`);
  if (requestedPages > 0) lines.push(`    requested_page_run: ${requestedPages} pages`);
  if (lastSceneOutcome) lines.push(`    inherited_residue_to_open_with: ${lastSceneOutcome}`);
  if (currentBeat) lines.push(`    current_beat_to_spend: ${currentBeat}`);
  if (nextScenePlan) lines.push(`    next_scene_plan_to_render: ${nextScenePlan}`);
  if (nextSceneMoves.length) {
    lines.push("    next_scene_moves_to_render:");
    for (const move of nextSceneMoves) lines.push(`      - ${move}`);
  }
  if (nextThreeTurns.length) {
    lines.push(`    first_turn_locked: ${nextThreeTurns[0]}`);
    if (nextThreeTurns.length > 1) {
      lines.push("    escalation_runway:");
      for (const turn of nextThreeTurns.slice(1)) lines.push(`      - ${turn}`);
    }
  }
  if (beatSequence.length) {
    lines.push("    beat_sequence_to_render:");
    for (const beat of beatSequence) lines.push(`      - ${beat}`);
  }
  lines.push("    act_translation_rules:");
  lines.push("      - Act I: turn setup into commitment through a visible burned exit.");
  lines.push("      - Act II: turn tests into tactic failure, reversal, cost, and all-is-lost pressure.");
  lines.push("      - Act III: turn remembered setups into payoff through changed behavior and final-image contrast.");
  lines.push("    live_page_guardrails:");
  lines.push("      - Returned pages must include concrete story material from first_turn_locked when supplied.");
  lines.push("      - Every scene turn needs an action, discovery, blocked option, reveal, cost, or changed tactic.");
  lines.push("      - Do not print plan labels; translate them into sluglines, action, cues, dialogue, and transitions.");
  return lines;
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
  const nextThreeTurns = sanitizeContextList(
    sessionContext.nextThreeTurns ?? sessionContext.next_three_turns,
    3,
    180
  );
  const actThreePayoffPath = sanitizeContextList(
    sessionContext.actThreePayoffPath ?? sessionContext.act_three_payoff_path ?? sessionContext.payoffPath ?? sessionContext.payoff_path,
    5,
    200
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
  const imageMotifs = sanitizeContextList(
    sessionContext.imageMotifs ?? sessionContext.image_motifs ?? sessionContext.visualMotifs ?? sessionContext.visual_motifs,
    6,
    140
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
  if (actPressureState) lines.push(`    act_pressure_state: ${actPressureState}`);
  if (characterArcState) lines.push(`    character_arc_state: ${characterArcState}`);
  if (lastSceneOutcome) lines.push(`    last_scene_outcome_to_carry: ${lastSceneOutcome}`);
  if (nextThreeTurns.length) {
    lines.push("    next_three_turns_to_protect:");
    for (const turn of nextThreeTurns) lines.push(`      - ${turn}`);
  }
  if (actThreePayoffPath.length) {
    lines.push("    act_three_payoff_path:");
    for (const payoff of actThreePayoffPath) lines.push(`      - ${payoff}`);
  }
  if (characterFocus.length) {
    lines.push("    active_character_pressure:");
    for (const character of characterFocus) lines.push(`      - ${character}`);
  }
  if (unresolvedSetups.length) {
    lines.push("    active_setups_to_carry_or_pay:");
    for (const setup of unresolvedSetups) lines.push(`      - ${setup}`);
  }
  if (unresolvedStoryThreads.length) {
    lines.push("    unresolved_story_threads:");
    for (const thread of unresolvedStoryThreads) lines.push(`      - ${thread}`);
  }
  if (characterArcTurns.length) {
    lines.push("    character_arc_turns_to_pay:");
    for (const turn of characterArcTurns) lines.push(`      - ${turn}`);
  }
  if (imageMotifs.length) {
    lines.push("    image_motifs_to_echo_or_transform:");
    for (const motif of imageMotifs) lines.push(`      - ${motif}`);
  }
  if (continuityNotes.length) {
    lines.push("    continuity_promises:");
    for (const note of continuityNotes) lines.push(`      - ${note}`);
  }
  lines.push("    ledger_rules:");
  lines.push("      - Every new scene must alter the want/need engine, the opposition engine, or the central question.");
  lines.push("      - Spend planted setups and image echoes before inventing new solutions.");
  lines.push("      - Preserve the remembered next-three-turns runway unless the user explicitly changes direction.");
  lines.push("      - Aim Act III pages at the remembered payoff path; do not solve the climax with unplanted information.");
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

function sceneTurnBudgetForPages(requestedPages) {
  const pages = positiveIntegerOrZero(requestedPages);
  if (pages <= 0) return 0;
  if (pages <= 3) return 1;
  if (pages <= 6) return 2;
  if (pages <= 9) return 3;
  return 4;
}

function storyStateChangeFloorForPages(requestedPages) {
  const pages = positiveIntegerOrZero(requestedPages);
  if (pages <= 0) return 0;
  return Math.max(1, Math.ceil(pages / 2));
}

function sequenceLabelWithRange(sequence, targetPages) {
  if (!sequence) return "";
  const range = scaledRange(sequence, targetPages);
  return `${sequence.act} - ${sequence.label} (p${range.start}-${range.end})`;
}

function buildPageTargetSizingLines({
  screenplayTask = null,
  sequence = null,
  targetPages = DEFAULT_FEATURE_TARGET_PAGES,
  currentPage = 0,
  explicitAct = "",
  requestedAct = "",
} = {}) {
  const requestedPages = requestedPageBatchFromTask(screenplayTask);
  const target = targetPagesFromContext({ targetPages });
  const safeCurrentPage = currentPage > 0 ? clamp(currentPage, 1, target) : 0;
  const activeAct = trimContextLine(requestedAct || explicitAct || sequence?.act, 120);
  const activeSequence = sequence || firstSequenceForActLabel(activeAct);
  const hasSizingContext = Boolean(requestedPages > 0 || safeCurrentPage > 0 || activeSequence || activeAct);
  if (!hasSizingContext) return [];

  const lines = [
    "  page_target_sizing:",
    "    purpose: turn page count into a dramaturgical runway instead of a vague length request.",
  ];

  if (requestedPages > 0) {
    const startPage = safeCurrentPage > 0 ? clamp(safeCurrentPage + 1, 1, target) : 0;
    const endPage = startPage > 0 ? clamp(startPage + requestedPages - 1, startPage, target) : 0;
    const startSequence = startPage > 0 ? findSequenceForPage(startPage, target) : activeSequence;
    const endSequence = endPage > 0 ? findSequenceForPage(endPage, target) : activeSequence;
    const sceneTurnBudget = sceneTurnBudgetForPages(requestedPages);
    const stateChangeFloor = storyStateChangeFloorForPages(requestedPages);

    lines.push(`    requested_pages: ${requestedPages}`);
    if (startPage > 0 && endPage > 0) {
      lines.push(`    target_window: p${startPage}-p${endPage} / ${target}`);
      const remainingAfterBatch = Math.max(0, target - endPage);
      lines.push(`    pages_remaining_after_batch: ${remainingAfterBatch}`);
    } else if (activeAct) {
      lines.push(`    target_act_window: ${activeAct}`);
    }
    if (startSequence) lines.push(`    start_sequence: ${sequenceLabelWithRange(startSequence, target)}`);
    if (endSequence) lines.push(`    end_sequence: ${sequenceLabelWithRange(endSequence, target)}`);
    if (startSequence && endSequence && startSequence.id !== endSequence.id) {
      lines.push(`    sequence_boundary_rule: if the batch crosses into ${endSequence.act} - ${endSequence.label}, spend the boundary as a decision, cost, reveal, or image; do not hard reset.`);
    }
    if (sceneTurnBudget > 0) lines.push(`    scene_turn_budget: ${sceneTurnBudget} escalating turn${sceneTurnBudget === 1 ? "" : "s"}`);
    if (stateChangeFloor > 0) lines.push(`    story_state_change_floor: at least ${stateChangeFloor} visible leverage/reveal/cost/tactic shift${stateChangeFloor === 1 ? "" : "s"} across the batch.`);
    lines.push("    sizing_rule: if model space is tight, complete the strongest contiguous page run with a clean handoff; never replace requested pages with an outline.");
  } else if (safeCurrentPage > 0) {
    const startPage = clamp(safeCurrentPage + 1, 1, target);
    const endPage = clamp(startPage + 4, startPage, target);
    const nextRunSequence = findSequenceForPage(startPage, target) || activeSequence;
    lines.push(`    next_useful_run: p${startPage}-p${endPage} / ${target}`);
    if (nextRunSequence) lines.push(`    next_run_sequence: ${sequenceLabelWithRange(nextRunSequence, target)}`);
    lines.push("    default_run_rule: when the user says continue without a count, write a focused 3-5 page turn that changes the feature state.");
  } else if (activeSequence) {
    lines.push(`    act_sequence_target: ${sequenceLabelWithRange(activeSequence, target)}`);
    lines.push("    default_run_rule: without a page count, choose the next 3-5 page turn inside this sequence and end with a handoff.");
  } else if (activeAct) {
    lines.push(`    act_sequence_target: ${activeAct}`);
    lines.push("    default_run_rule: locate the first due sequence in this act, then write the smallest complete page turn that advances it.");
  }

  lines.push("    continuation_quality_floor:");
  lines.push("      - Open from inherited emotional residue as visible behavior; do not restate the prior beat.");
  lines.push("      - Make the first page alter leverage, information, relationship, tactic, or emotional cost.");
  lines.push("      - Every scene turn needs objective, obstacle, reversal/cost, residue, and a next-sequence handoff.");
  lines.push("      - Preserve supplied next_three_turns and next_scene_plan before adding new plot.");
  return lines;
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

function buildActSequenceObligationStackLines({
  sessionContext = {},
  screenplayTask = null,
  sequence = null,
  targetPages = DEFAULT_FEATURE_TARGET_PAGES,
  currentPage = 0,
  explicitAct = "",
  requestedAct = "",
} = {}) {
  const requestedPages = requestedPageBatchFromTask(screenplayTask);
  const targetAct = requestedAct || explicitAct;
  const activeSequence = sequence || firstSequenceForActLabel(targetAct);
  const activeEngine = actPageEngineForLabel(activeSequence?.act || targetAct);
  const bridgePressure = bridgePressureForSequence(activeSequence);
  const nextSequence = nextSequenceAfter(activeSequence);
  const hasUsefulContext = Boolean(
    activeSequence ||
    activeEngine ||
    requestedPages > 0 ||
    currentPage > 0 ||
    targetAct ||
    sessionContext?.actPressureState ||
    sessionContext?.act_pressure_state ||
    sessionContext?.characterArcState ||
    sessionContext?.character_arc_state ||
    sessionContext?.nextThreeTurns ||
    sessionContext?.next_three_turns ||
    sessionContext?.actThreePayoffPath ||
    sessionContext?.act_three_payoff_path ||
    sessionContext?.unresolvedSetups ||
    sessionContext?.unresolved_setups
  );
  if (!hasUsefulContext) return [];

  const nextThreeTurns = sanitizeContextList(
    sessionContext.nextThreeTurns ?? sessionContext.next_three_turns,
    3,
    180
  );
  const unresolvedSetups = sanitizeContextList(
    sessionContext.unresolvedSetups ?? sessionContext.unresolved_setups ?? sessionContext.openLoops ?? sessionContext.open_loops,
    4,
    200
  );
  const actThreePayoffPath = sanitizeContextList(
    sessionContext.actThreePayoffPath ?? sessionContext.act_three_payoff_path ?? sessionContext.payoffPath ?? sessionContext.payoff_path,
    4,
    200
  );
  const characterArcState = trimContextLine(
    sessionContext.characterArcState ?? sessionContext.character_arc_state,
    240
  );
  const endingImage = trimContextLine(
    sessionContext.endingImage ?? sessionContext.ending_image ?? sessionContext.finalImage ?? sessionContext.final_image,
    220
  );
  const actPressureState = trimContextLine(
    sessionContext.actPressureState ?? sessionContext.act_pressure_state,
    260
  );
  const lines = [
    "  act_sequence_obligation_stack:",
    "    purpose: force every requested page to advance the whole feature, not just decorate the next scene.",
  ];

  if (activeEngine) lines.push(`    active_act: ${activeEngine.label}`);
  if (activeSequence) {
    const range = scaledRange(activeSequence, targetPages);
    lines.push(`    active_lane: ${activeSequence.act} - ${activeSequence.label} (p${range.start}-${range.end})`);
    lines.push(`    pressure_now: ${activeSequence.pressure}`);
    lines.push(`    due_now: ${activeSequence.obligation}`);
  } else if (targetAct) {
    lines.push(`    active_lane: ${targetAct}`);
    lines.push(`    pressure_now: ${actPressureForLabel(targetAct)}`);
  }

  if (requestedPages > 0) lines.push(`    requested_batch: ${requestedPages} pages`);
  if (currentPage > 0) lines.push(`    page_position: p${clamp(currentPage, 1, targetPages)} / ${targetPages}`);
  if (actPressureState) lines.push(`    remembered_act_pressure: ${actPressureState}`);
  if (characterArcState) lines.push(`    changed_behavior_due: ${characterArcState}`);

  if (activeEngine) {
    lines.push("    act_mandates:");
    for (const mandate of activeEngine.mandates) lines.push(`      - ${mandate}`);
  }

  if (nextThreeTurns.length || unresolvedSetups.length || actThreePayoffPath.length || endingImage) {
    lines.push("    memory_obligations:");
    for (const turn of nextThreeTurns) lines.push(`      - next_turn: ${turn}`);
    for (const setup of unresolvedSetups) lines.push(`      - setup_to_carry_or_pay: ${setup}`);
    for (const payoff of actThreePayoffPath) lines.push(`      - act_three_payoff: ${payoff}`);
    if (endingImage) lines.push(`      - final_image_pressure: ${endingImage}`);
  }

  if (bridgePressure) lines.push(`    bridge_pressure: ${bridgePressure}`);
  if (activeSequence && nextSequence && nextSequence.id !== activeSequence.id) {
    const nextRange = scaledRange(nextSequence, targetPages);
    lines.push(`    next_sequence_handoff: ${nextSequence.act} - ${nextSequence.label} (p${nextRange.start}-${nextRange.end}): ${nextSequence.obligation}`);
  } else if (activeSequence?.id === "sequence-8") {
    lines.push("    final_image_handoff: resolve the central question through changed behavior, then echo the opening image with transformed meaning.");
  }

  lines.push("    page_turn_contract:");
  lines.push("      - launch: begin from inherited residue as visible behavior, not explanation.");
  lines.push("      - tactic: make the protagonist try a playable action that can fail or cost them.");
  lines.push("      - turn: every page must shift leverage, information, relationship, tactic, or emotional cost.");
  lines.push("      - payoff: spend remembered setups before inventing new solutions.");
  lines.push("      - residue: end on a decision, reveal, cost, image, or irreversible choice that feeds the next sequence.");
  lines.push("      - final_act_rule: Act III pages must resolve through changed behavior and final image contrast, never unearned new information.");
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
  if (actPressureState) lines.push(`    act_pressure_state: ${actPressureState}`);
  if (characterArcState) lines.push(`    character_arc_state: ${characterArcState}`);
  if (lastSceneOutcome) lines.push(`    last_scene_outcome: ${lastSceneOutcome}`);
  if (nextScenePlan) lines.push(`    next_scene_plan: ${nextScenePlan}`);
  if (nextSceneMoves.length) {
    lines.push("    next_scene_moves:");
    for (const move of nextSceneMoves) lines.push(`      - ${move}`);
  }
  const nextThreeTurns = sanitizeContextList(
    sessionContext.nextThreeTurns ?? sessionContext.next_three_turns,
    3,
    180
  );
  if (nextThreeTurns.length) {
    lines.push("    next_three_turns:");
    for (const turn of nextThreeTurns) lines.push(`      - ${turn}`);
  }
  const actThreePayoffPath = sanitizeContextList(
    sessionContext.actThreePayoffPath ?? sessionContext.act_three_payoff_path ?? sessionContext.payoffPath ?? sessionContext.payoff_path,
    5,
    200
  );
  if (actThreePayoffPath.length) {
    lines.push("    act_three_payoff_path:");
    for (const payoff of actThreePayoffPath) lines.push(`      - ${payoff}`);
  }
  if (characterFocus.length) {
    lines.push("    character_focus:");
    for (const character of characterFocus) lines.push(`      - ${character}`);
  }
  if (unresolvedSetups.length) {
    lines.push("    unresolved_setups_to_track:");
    for (const setup of unresolvedSetups) lines.push(`      - ${setup}`);
  }
  const unresolvedStoryThreads = sanitizeContextList(
    sessionContext.unresolvedStoryThreads ?? sessionContext.unresolved_story_threads,
    8,
    220
  );
  if (unresolvedStoryThreads.length) {
    lines.push("    unresolved_story_threads:");
    for (const thread of unresolvedStoryThreads) lines.push(`      - ${thread}`);
  }
  const characterArcTurns = sanitizeContextList(
    sessionContext.characterArcTurns ?? sessionContext.character_arc_turns,
    6,
    180
  );
  if (characterArcTurns.length) {
    lines.push("    character_arc_turns:");
    for (const turn of characterArcTurns) lines.push(`      - ${turn}`);
  }
  const imageMotifs = sanitizeContextList(
    sessionContext.imageMotifs ?? sessionContext.image_motifs ?? sessionContext.visualMotifs ?? sessionContext.visual_motifs,
    6,
    140
  );
  if (imageMotifs.length) {
    lines.push("    image_motifs:");
    for (const motif of imageMotifs) lines.push(`      - ${motif}`);
  }
  return lines.length ? ["  continuity_assets:", ...lines] : [];
}

function buildMemoryToPageExecutionLines(sessionContext = {}) {
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
  const nextThreeTurns = sanitizeContextList(
    sessionContext.nextThreeTurns ?? sessionContext.next_three_turns,
    3,
    180
  );
  const actThreePayoffPath = sanitizeContextList(
    sessionContext.actThreePayoffPath ?? sessionContext.act_three_payoff_path ?? sessionContext.payoffPath ?? sessionContext.payoff_path,
    5,
    200
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
  const imageMotifs = sanitizeContextList(
    sessionContext.imageMotifs ?? sessionContext.image_motifs ?? sessionContext.visualMotifs ?? sessionContext.visual_motifs,
    6,
    140
  );
  const hasFeatureMemoryCompass = Boolean(
    actPressureState ||
    characterArcState ||
    lastSceneOutcome ||
    nextThreeTurns.length ||
    actThreePayoffPath.length ||
    unresolvedStoryThreads.length ||
    characterArcTurns.length ||
    imageMotifs.length
  );
  if (!hasFeatureMemoryCompass) return [];

  const lines = [
    "  memory_to_page_execution:",
    "    purpose: convert persistent feature memory into immediate playable screenplay behavior, not outline prose.",
  ];
  if (lastSceneOutcome) lines.push(`    inherited_state: ${lastSceneOutcome}`);
  if (actPressureState) lines.push(`    act_pressure_to_dramatize: ${actPressureState}`);
  if (characterArcState) lines.push(`    character_arc_pressure: ${characterArcState}`);
  if (nextThreeTurns.length) {
    lines.push("    turn_runway_to_dramatize:");
    nextThreeTurns.forEach((turn, index) => {
      lines.push(`      - turn_${index + 1}: ${turn}`);
    });
  }
  if (actThreePayoffPath.length) {
    lines.push("    payoff_path_to_aim_toward:");
    for (const payoff of actThreePayoffPath) lines.push(`      - ${payoff}`);
  }
  if (unresolvedStoryThreads.length) {
    lines.push("    story_threads_to_touch:");
    for (const thread of unresolvedStoryThreads.slice(0, 4)) lines.push(`      - ${thread}`);
  }
  if (characterArcTurns.length) {
    lines.push("    arc_turns_to_make_visible:");
    for (const turn of characterArcTurns.slice(0, 4)) lines.push(`      - ${turn}`);
  }
  if (imageMotifs.length) {
    lines.push("    image_motifs_to_use_as_action:");
    for (const motif of imageMotifs.slice(0, 4)) lines.push(`      - ${motif}`);
  }
  lines.push("    page_rules:");
  lines.push("      - Open by carrying the inherited state through a visible behavior or image.");
  lines.push("      - Dramatize turn_1 before inventing a new plot lane; use turn_2 and turn_3 only as escalation runway.");
  lines.push("      - Touch one unresolved story thread through consequence, discovery, or pressure.");
  lines.push("      - Make one character arc turn visible as a choice under pressure.");
  lines.push("      - Echo or transform one remembered image motif on the page.");
  lines.push("      - Never print these memory labels in the answer; convert them into Fountain action, dialogue, and scene turns.");
  return lines;
}

function buildWriterBlockToPagesLines({
  sessionContext = {},
  screenplayTask = null,
  sequence = null,
  explicitAct = "",
  requestedAct = "",
} = {}) {
  const intent = trimToString(screenplayTask?.intent, 80);
  const requestedPages = requestedPageBatchFromTask(screenplayTask);
  const userLabel = trimToString(screenplayTask?.label ?? screenplayTask?.output, 220).toLowerCase();
  const blockLike = intent === "momentum_rescue" ||
    /\b(stuck|blocked|writer'?s block|writers block|what happens next|next beat|next move|out of ideas)\b/.test(userLabel);
  const pageLike = requestedPages > 0 || intent === "finish_feature" || intent === "continue_script";
  if (!blockLike && !pageLike) return [];

  const activeAct = trimContextLine(requestedAct || explicitAct || sequence?.act, 120);
  const activeActKind = inferActKind(activeAct);
  const currentBeat = trimContextLine(
    sessionContext.currentBeat ?? sessionContext.current_beat ?? sessionContext.beat,
    220
  );
  const protagonistWant = trimContextLine(
    sessionContext.protagonistWant ?? sessionContext.protagonist_want,
    220
  );
  const protagonistNeed = trimContextLine(
    sessionContext.protagonistNeed ?? sessionContext.protagonist_need,
    220
  );
  const featureObligation = trimContextLine(
    sessionContext.featureObligation ?? sessionContext.feature_obligation ?? sessionContext.structuralObligation ?? sessionContext.structural_obligation,
    260
  );
  const actPressureState = trimContextLine(
    sessionContext.actPressureState ?? sessionContext.act_pressure_state,
    260
  );
  const characterArcState = trimContextLine(
    sessionContext.characterArcState ?? sessionContext.character_arc_state,
    260
  );
  const nextScenePlan = trimContextLine(
    sessionContext.nextScenePlan ?? sessionContext.next_scene_plan ?? sessionContext.nextPagePlan ?? sessionContext.next_page_plan,
    300
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
    5,
    180
  );
  const unresolvedStoryThreads = sanitizeContextList(
    sessionContext.unresolvedStoryThreads ?? sessionContext.unresolved_story_threads,
    5,
    200
  );
  const characterArcTurns = sanitizeContextList(
    sessionContext.characterArcTurns ?? sessionContext.character_arc_turns,
    5,
    180
  );
  const actThreePayoffPath = sanitizeContextList(
    sessionContext.actThreePayoffPath ?? sessionContext.act_three_payoff_path ?? sessionContext.payoffPath ?? sessionContext.payoff_path,
    5,
    180
  );
  const imageMotifs = sanitizeContextList(
    sessionContext.imageMotifs ?? sessionContext.image_motifs ?? sessionContext.visualMotifs ?? sessionContext.visual_motifs,
    5,
    140
  );
  const characterFocus = sanitizeContextList(
    sessionContext.characterFocus ?? sessionContext.character_focus ?? sessionContext.characters ?? sessionContext.currentCharacters,
    5,
    100
  );

  const rememberedTurn = nextThreeTurns[0] || nextSceneMoves[0] || nextScenePlan || "";
  const protagonist = characterFocus[0] || "the protagonist";
  const objective = protagonistWant || rememberedTurn || featureObligation || currentBeat || "a concrete objective that can fail";
  const obstacle = unresolvedStoryThreads[0] || unresolvedSetups[0] || actPressureState || sequence?.obligation || "a force that can say no";
  const oldTacticCost = characterArcTurns[0] || characterArcState || protagonistNeed || "the old tactic stops protecting them";
  const payoff = actThreePayoffPath[0] || unresolvedSetups[0] || "one planted setup";
  const exitImage = imageMotifs[0] || payoff || "a changed image";
  const activeRule = activeActKind === "act1"
    ? "Act I page engine: make wound and want visible, turn catalyst into pressure, and end the run on an irreversible choice."
    : activeActKind === "act2"
      ? "Act II page engine: make the false tactic appear useful, then make it costlier through reversal, relationship damage, or public exposure."
      : activeActKind === "act3"
        ? "Act III page engine: spend a planted setup through changed behavior, answer the need, and aim the image toward the final frame."
        : "Act page engine: convert the strongest remembered pressure into objective, opposition, changed tactic, cost, and exit image.";

  const hasUsefulBridge = Boolean(
    activeAct ||
      requestedPages > 0 ||
      currentBeat ||
      objective ||
      rememberedTurn ||
      obstacle ||
      oldTacticCost ||
      payoff ||
      exitImage
  );
  if (!hasUsefulBridge) return [];

  const lines = [
    "  writer_block_to_pages:",
    "    purpose: when the writer is stuck, convert rescue into immediate screenplay pages instead of more brainstorming.",
  ];
  if (requestedPages > 0) lines.push(`    requested_pages: ${requestedPages}`);
  if (activeAct) lines.push(`    active_act: ${activeAct}`);
  if (sequence) lines.push(`    active_sequence: ${sequence.act} - ${sequence.label}`);
  if (rememberedTurn) lines.push(`    first_remembered_turn_to_spend: ${rememberedTurn}`);
  lines.push(`    best_page_engine: Have ${protagonist} pursue ${objective}; collide with ${obstacle}; make the cost ${oldTacticCost}; exit on ${exitImage}.`);
  lines.push(`    ${activeRule}`);
  lines.push("    act_ladder:");
  lines.push("      - Act I: wound/want becomes catalyst pressure, then commitment.");
  lines.push("      - Act II: old tactic partially works, reverses, and exposes the false belief.");
  lines.push("      - Act III: remembered setup becomes changed behavior and final-image pressure.");
  lines.push("    page_run_contract:");
  lines.push("      - Start with playable Fountain text if the user asked for pages.");
  lines.push("      - First scene turn: objective meets obstacle; second turn: tactic changes; final turn: cost, reveal, decision, or image hands off.");
  lines.push("      - Spend one remembered setup/payoff or image motif before introducing a brand-new solution.");
  lines.push("      - Convert character need into behavior; never explain the arc as prose.");
  return lines;
}

function buildNextSceneExecutionBriefLines({
  sessionContext = {},
  screenplayTask = null,
  sequence = null,
  targetPages = DEFAULT_FEATURE_TARGET_PAGES,
  currentPage = 0,
  explicitAct = "",
  requestedAct = "",
} = {}) {
  const requestedPages = requestedPageBatchFromTask(screenplayTask);
  const activeAct = trimContextLine(requestedAct || explicitAct || sequence?.act, 120);
  const activeSequence = sequence || firstSequenceForActLabel(activeAct);
  const nextSequence = nextSequenceAfter(activeSequence);
  const sceneObjective = trimContextLine(
    sessionContext.sceneObjective ?? sessionContext.scene_objective ?? sessionContext.currentSceneObjective,
    260
  );
  const currentBeat = trimContextLine(
    sessionContext.currentBeat ?? sessionContext.current_beat ?? sessionContext.beat,
    240
  );
  const emotionalHandoff = trimContextLine(
    sessionContext.emotionalContinuity ?? sessionContext.emotional_continuity ?? sessionContext.emotionalHandoff,
    260
  );
  const lastSceneOutcome = trimContextLine(
    sessionContext.lastSceneOutcome ?? sessionContext.last_scene_outcome,
    240
  );
  const nextScenePlan = trimContextLine(
    sessionContext.nextScenePlan ?? sessionContext.next_scene_plan ?? sessionContext.nextPagePlan ?? sessionContext.next_page_plan,
    340
  );
  const nextThreeTurns = sanitizeContextList(
    sessionContext.nextThreeTurns ?? sessionContext.next_three_turns,
    3,
    180
  );
  const unresolvedSetups = sanitizeContextList(
    sessionContext.unresolvedSetups ?? sessionContext.unresolved_setups ?? sessionContext.openLoops ?? sessionContext.open_loops,
    4,
    200
  );
  const unresolvedStoryThreads = sanitizeContextList(
    sessionContext.unresolvedStoryThreads ?? sessionContext.unresolved_story_threads,
    4,
    220
  );
  const actThreePayoffPath = sanitizeContextList(
    sessionContext.actThreePayoffPath ?? sessionContext.act_three_payoff_path ?? sessionContext.payoffPath ?? sessionContext.payoff_path,
    4,
    200
  );
  const characterArcState = trimContextLine(
    sessionContext.characterArcState ?? sessionContext.character_arc_state,
    280
  );
  const characterArcTurns = sanitizeContextList(
    sessionContext.characterArcTurns ?? sessionContext.character_arc_turns,
    4,
    180
  );
  const characterFocus = sanitizeContextList(
    sessionContext.characterFocus ?? sessionContext.character_focus ?? sessionContext.characters ?? sessionContext.currentCharacters,
    4,
    120
  );
  const imageMotifs = sanitizeContextList(
    sessionContext.imageMotifs ?? sessionContext.image_motifs ?? sessionContext.visualMotifs ?? sessionContext.visual_motifs,
    4,
    140
  );
  const endingImage = trimContextLine(
    sessionContext.endingImage ?? sessionContext.ending_image ?? sessionContext.finalImage ?? sessionContext.final_image,
    220
  );
  const directExecutionBrief = sessionContext.nextSceneExecutionBrief ??
    sessionContext.next_scene_execution_brief;
  const briefSource = directExecutionBrief && typeof directExecutionBrief === "object" &&
    !Array.isArray(directExecutionBrief)
    ? directExecutionBrief
    : {};
  const acceptedConsequenceDue = trimContextLine(
    briefSource.consequence ??
      briefSource.acceptedConsequenceDue ??
      briefSource.accepted_consequence_due ??
      sessionContext.acceptedConsequenceDue ??
      sessionContext.accepted_consequence_due,
    220
  );
  const sceneAssignment = nextThreeTurns[0] || nextScenePlan || sceneObjective || currentBeat || activeSequence?.nextMoves?.[0] || "";
  const openingHandoff = lastSceneOutcome || emotionalHandoff || currentBeat;
  const obstacle = unresolvedStoryThreads[0] || unresolvedSetups[0] || activeSequence?.obligation || "";
  const arcBehavior = characterArcTurns[0] || characterArcState;
  const payoffCandidate = actThreePayoffPath[0] || unresolvedSetups[0] || "";
  const payoffOrSetup = payoffCandidate && payoffCandidate.toLowerCase() !== obstacle.toLowerCase()
    ? payoffCandidate
    : "";
  const imageToStage = imageMotifs[0] || endingImage || "";
  const exitHandoff = nextThreeTurns[1] || nextSequence?.obligation || "";
  const hasBriefContext = Boolean(
    requestedPages > 0 ||
    activeAct ||
    activeSequence ||
    sceneAssignment ||
    openingHandoff ||
    acceptedConsequenceDue ||
    obstacle ||
    arcBehavior ||
    payoffOrSetup ||
    imageToStage ||
    characterFocus.length
  );
  if (!hasBriefContext) return [];

  const lines = [
    "  next_scene_execution_brief:",
    "    purpose: condense act, memory, and page runway into the immediate scene Clementine should write next.",
  ];
  if (activeAct) lines.push(`    active_act_lane: ${activeAct}`);
  if (activeSequence) {
    const range = scaledRange(activeSequence, targetPages);
    lines.push(`    active_sequence_lane: ${activeSequence.act} - ${activeSequence.label} (p${range.start}-${range.end})`);
  }
  if (currentPage > 0) lines.push(`    current_page_position: p${clamp(currentPage, 1, targetPages)} / ${targetPages}`);
  if (requestedPages > 0) lines.push(`    requested_run: ${requestedPages} pages`);
  if (characterFocus.length) lines.push(`    character_focus: ${characterFocus.join(", ")}`);
  if (openingHandoff) lines.push(`    opening_handoff: ${openingHandoff}`);
  if (sceneAssignment) lines.push(`    scene_assignment: ${sceneAssignment}`);
  if (acceptedConsequenceDue) lines.push(`    accepted_consequence_due: ${acceptedConsequenceDue}`);
  if (obstacle) lines.push(`    obstacle_to_pressurize: ${obstacle}`);
  if (arcBehavior) lines.push(`    changed_behavior_due: ${arcBehavior}`);
  if (payoffOrSetup) lines.push(`    payoff_or_setup_to_spend: ${payoffOrSetup}`);
  if (imageToStage) lines.push(`    image_to_stage: ${imageToStage}`);
  if (exitHandoff) lines.push(`    exit_handoff: ${exitHandoff}`);
  lines.push("    execution_steps:");
  lines.push("      - Open on inherited emotional residue as visible behavior or image.");
  lines.push("      - Make the accepted_consequence_due alter behavior, leverage, relationship, information, or cost; do not reset or merely recap it.");
  lines.push("      - Give the protagonist a concrete objective that can fail before the scene ends.");
  lines.push("      - Pressurize that objective with the obstacle, setup, thread, or relationship cost above.");
  lines.push("      - Force a tactic shift, reveal, cost, or changed behavior before the exit.");
  lines.push("      - End with the exit_handoff as a decision, reveal, image, or irreversible cost.");
  lines.push("    output_rule: if the user asked for pages, translate this brief into Fountain screenplay only; never print these labels.");
  return lines;
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

function groupFeatureMapLines(lines) {
  const groups = [];
  let current = { name: "header", lines: [] };
  groups.push(current);
  for (const line of lines) {
    const match = /^  ([a-z][a-z0-9_]*):/.exec(line);
    if (match) {
      current = { name: match[1], lines: [line] };
      groups.push(current);
    } else {
      current.lines.push(line);
    }
  }
  return groups;
}

function keepFeatureMapLines(group, needles) {
  if (!group?.lines?.length) return [];
  return [
    group.lines[0],
    ...group.lines.slice(1).filter((line) => needles.some((needle) => line.includes(needle))),
  ];
}

function compactFeatureMapLines(lines, { sessionContext = null, screenplayTask = null } = {}) {
  const intent = trimToString(screenplayTask?.intent, 80);
  const requestedPages = requestedPageBatchFromTask(screenplayTask);
  const explicitAct = trimToString(
    sessionContext?.act ?? sessionContext?.currentAct ?? sessionContext?.current_act,
    120
  );
  const requestedAct = requestedActFromTask(screenplayTask);
  const wholeFeature = isWholeFeatureTask({ screenplayTask, explicitAct, requestedAct });
  const writerBlockText = `${screenplayTask?.label || ""} ${screenplayTask?.output || ""}`.toLowerCase();
  const writerBlocked = screenplayTask?.writerBlocked === true || screenplayTask?.writer_blocked === true ||
    intent === "momentum_rescue" || /\b(?:stuck|blocked|writer'?s block)\b/.test(writerBlockText);
  const writesPages = requestedPages > 0 || new Set([
    "write_scene",
    "rewrite_scene",
    "continue_script",
    "finish_feature",
  ]).has(intent);
  const compact = [];

  for (const group of groupFeatureMapLines(lines)) {
    switch (group.name) {
      case "header":
      case "act_ladder":
      case "story_spine":
      case "continuity_assets":
      case "current_position":
      case "current_sequence":
      case "active_act_label":
      case "position_basis":
      case "active_act_pressure":
      case "due_now":
      case "next_page_moves":
      case "coming_next":
        compact.push(...group.lines);
        break;
      case "act_bridge_ladder":
        if (wholeFeature) compact.push(...group.lines);
        break;
      case "feature_compass":
        compact.push(...keepFeatureMapLines(group, [
          "before_pages:",
          "page_velocity:",
          "completion_output:",
        ]));
        break;
      case "expert_scene_execution":
        compact.push(...keepFeatureMapLines(group, [
          "scene_job:",
          "turn_engine:",
          "image_system:",
          "speed_protocol:",
        ]));
        break;
      case "act_aware_page_engine":
        compact.push(...keepFeatureMapLines(group, [
          ...(requestedPages === 0 ? ["scene_math:"] : []),
          "active_act:",
          "page_job:",
          "active_sequence_job:",
          "The climax should make",
          "Do not introduce unearned information",
          "whole_feature_chain:",
          "whole_feature_rule:",
          "- Act I:",
          "- Act II:",
          "- Act III:",
        ]));
        break;
      case "feature_scale_output_contract":
        compact.push(...keepFeatureMapLines(group, [
          "Page batches must change story state",
          "Act I pages must earn commitment",
        ]));
        break;
      case "feature_continuity_ledger":
        break;
      case "act_exit_checklist":
        if (wholeFeature) compact.push(...group.lines);
        break;
      case "act_sequence_runway":
        if (wholeFeature) {
          compact.push(...keepFeatureMapLines(group, [
            "target:",
            "Act I - Opening Image / Ordinary World",
            "Act II - Midpoint Pressure",
            "Act III - Climax / Final Image",
            "act_handoff:",
          ]));
        }
        break;
      case "whole_feature_act_progression":
        if (wholeFeature) {
          compact.push(...keepFeatureMapLines(group, [
            "purpose:",
            "planner_output_when_asked:",
            "Act I choices must create",
            "The midpoint must change",
            "Act III payoffs must come",
          ]));
        }
        break;
      case "page_batch_execution_plan":
        if (requestedPages > 0) {
          compact.push(...keepFeatureMapLines(group, [
            "requested_pages:",
            "target_act:",
            "starting_position:",
            "active_sequence_pressure:",
            "structural_obligation_due_now:",
            "turn_budget:",
            "delivery:",
            "continuity:",
            "end_condition:",
          ]));
        }
        break;
      case "act_sequence_obligation_stack":
        break;
      case "memory_to_page_execution":
        break;
      case "writer_block_to_pages":
        if (writerBlocked) compact.push(...group.lines);
        break;
      case "next_scene_execution_brief":
        if (writesPages || writerBlocked) {
          compact.push(...keepFeatureMapLines(group, [
            "scene_assignment:",
            "accepted_consequence_due:",
            "obstacle_to_pressurize:",
            "changed_behavior_due:",
            "payoff_or_setup_to_spend:",
            "exit_handoff:",
          ]));
        }
        break;
      case "feature_completion_protocol":
        compact.push(...keepFeatureMapLines(group, [
          "Return a feature-scale beat chain",
          "For multi-page requests",
          "Never solve Act III",
        ]));
        break;
      default:
        break;
    }
  }
  return compact;
}

function buildFeatureScreenplayMapBlock({ sessionContext = null, screenplayTask = null, compact = false } = {}) {
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
    ...buildActAwarePageEngineLines({
      sequence,
      screenplayTask,
      explicitAct,
      requestedAct,
    }),
    ...buildFeatureScaleOutputContractLines(),
    ...buildFeatureContinuityLedgerLines(sessionContext || {}),
    ...buildActExitChecklistLines({ sequence, explicitAct }),
    ...buildActSequenceRunwayLines({
      actLabel: actRunwayLabel,
      targetPages,
    }),
    ...buildWholeFeatureActProgressionLines({
      screenplayTask,
      explicitAct,
      requestedAct,
      targetPages,
    }),
    ...buildPageTargetSizingLines({
      screenplayTask,
      sequence,
      targetPages,
      currentPage,
      explicitAct,
      requestedAct,
    }),
    ...buildFeaturePageBatchPlanLines({
      screenplayTask,
      sequence,
      targetPages,
      currentPage,
      explicitAct,
    }),
    ...buildBeatToPageContinuationLines({
      sessionContext: sessionContext || {},
      screenplayTask,
      sequence,
      explicitAct,
      requestedAct,
    }),
    ...buildActSequenceObligationStackLines({
      sessionContext: sessionContext || {},
      screenplayTask,
      sequence,
      targetPages,
      currentPage,
      explicitAct,
      requestedAct,
    }),
    ...buildStorySpineLines(sessionContext || {}),
    ...buildContinuityAssetLines(sessionContext || {}),
    ...buildMemoryToPageExecutionLines(sessionContext || {}),
    ...buildWriterBlockToPagesLines({
      sessionContext: sessionContext || {},
      screenplayTask,
      sequence,
      explicitAct,
      requestedAct,
    }),
    ...buildNextSceneExecutionBriefLines({
      sessionContext: sessionContext || {},
      screenplayTask,
      sequence,
      targetPages,
      currentPage,
      explicitAct,
      requestedAct,
    }),
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

  const renderedLines = compact
    ? compactFeatureMapLines(lines, { sessionContext, screenplayTask })
    : lines;
  return `${FEATURE_MAP_BLOCK_OPEN}\n${renderedLines.join("\n")}\n${FEATURE_MAP_BLOCK_CLOSE}`;
}

export {
  FEATURE_MAP_BLOCK_OPEN,
  FEATURE_MAP_BLOCK_CLOSE,
  FEATURE_SEQUENCE_TEMPLATE,
  DEFAULT_FEATURE_TARGET_PAGES,
  buildFeatureScreenplayMapBlock,
  findSequenceForPage,
};

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
    lines.push(`  active_act_label: ${explicitAct}`);
    if (lowDraftEstimateConflictsWithAct) {
      lines.push("  position_basis: outline act label overrides low draft-page estimate.");
    }
    lines.push("  due_now:");
    lines.push(`    - ${actPressureForLabel(explicitAct)}`);
    lines.push("  next_page_moves:");
    lines.push("    - Name the active structural obligation before writing.");
    lines.push("    - Advance one irreversible character choice instead of summarizing the act.");
    lines.push("    - Preserve the emotional handoff from the previous beat.");
  }

  lines.push("  feature_completion_protocol:");
  lines.push("    - Orient the writer in the act/sequence before choosing the next pages.");
  lines.push("    - Return a feature-scale beat chain when the user asks for the whole movie: current sequence, next three turns, Act III payoff path.");
  lines.push("    - Track unresolved setups, reversals, character need, theme argument, and ending image.");
  lines.push("    - When the user asks to finish pages, give one concise strategy note then write playable Fountain.");
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

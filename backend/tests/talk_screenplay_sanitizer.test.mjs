import assert from "node:assert/strict";
import test from "node:test";

process.env.RUN_SERVER = "0";
process.env.OPENAI_API_KEY ||= "test-openai-key";
process.env.REALTIME_PROVIDER ||= "stub";

const {
  applyTalkScreenplayRepairCandidate,
  buildTalkScreenplayOutput,
  isAuthoritativeTalkScreenplayOutput,
  normalizeTalkPageReply,
  sanitizeStudioTurnMetadata,
} = await import("../index.js");

test("[talk-screenplay-sanitizer] removes warm lead-ins, markdown fences, and craft afterwords", () => {
  const raw = [
    "Absolutely - I'd write it like this:",
    "",
    "```fountain",
    "INT. MOTEL ROOM - NIGHT",
    "",
    "Rain taps the air conditioner hard enough to sound impatient.",
    "",
    "JUNE",
    "(quiet)",
    "I know where he hid it.",
    "```",
    "",
    "This gives the scene more pressure without explaining the feeling.",
  ].join("\n");

  const out = normalizeTalkPageReply(raw);
  assert.equal(out, [
    "INT. MOTEL ROOM - NIGHT",
    "",
    "Rain taps the air conditioner hard enough to sound impatient.",
    "",
    "JUNE",
    "(quiet)",
    "I know where he hid it.",
  ].join("\n"));
});

test("[talk-screenplay-sanitizer] strips direct co-writer setup before a scene heading", () => {
  const out = normalizeTalkPageReply([
    "Let's take the scene this way:",
    "EXT. GAS STATION - DAWN",
    "",
    "Mara watches the first truck pass without lifting her thumb.",
  ].join("\n"));

  assert.equal(out, [
    "EXT. GAS STATION - DAWN",
    "",
    "Mara watches the first truck pass without lifting her thumb.",
  ].join("\n"));
});

test("[talk-screenplay-sanitizer] strips strategy and diagnosis lines before page text", () => {
  const out = normalizeTalkPageReply([
    "Strategy: make the receipt the trap instead of exposition.",
    "The scene needs one irreversible turn before anyone explains the clue.",
    "",
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it.",
  ].join("\n"));

  assert.equal(out, [
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it.",
  ].join("\n"));
});

test("[talk-screenplay-sanitizer] strips page labels, dividers, and trailing craft notes", () => {
  const out = normalizeTalkPageReply([
    "## Screenplay Pages",
    "---",
    "Here are the next pages:",
    "",
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it.",
    "",
    "END SCENE.",
    "",
    "Why this works:",
    "This gives the scene pressure without explaining the feeling.",
    "Want me to keep going from here?",
  ].join("\n"));

  assert.equal(out, [
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it.",
  ].join("\n"));
});

test("[talk-screenplay-sanitizer] preserves dialogue that looks like an assistant offer", () => {
  const out = normalizeTalkPageReply([
    "INT. MOTEL ROOM - NIGHT",
    "",
    "MARCUS",
    "Want me to go?",
    "",
    "June does not answer.",
  ].join("\n"));

  assert.equal(out, [
    "INT. MOTEL ROOM - NIGHT",
    "",
    "MARCUS",
    "Want me to go?",
    "",
    "June does not answer.",
  ].join("\n"));
});

test("[talk-screenplay-sanitizer] keeps playable action lines that are not trailing craft notes", () => {
  const out = normalizeTalkPageReply([
    "INT. KITCHEN - MORNING",
    "",
    "This gives way to a silence neither of them wants to break.",
    "",
    "CAL",
    "Say it.",
  ].join("\n"));

  assert.equal(out, [
    "INT. KITCHEN - MORNING",
    "",
    "This gives way to a silence neither of them wants to break.",
    "",
    "CAL",
    "Say it.",
  ].join("\n"));
});

test("[talk-screenplay-output] repairs missing scene heading from trusted page anchor", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "MARA: Don't open it.",
      "",
      "Eli slips the receipt under the coffee cup before she can see his hand shake.",
    ].join("\n"),
    studioMeta: {
      screenplayTarget: "page",
      screenplayAnchorSceneLabel: "INT. MOTEL ROOM - NIGHT",
    },
  });

  assert.equal(output.target, "page");
  assert.equal(output.source, "repaired_scene_anchor");
  assert.equal(output.quality.ok, true);
  assert.equal(output.quality.confidence, "repaired");
  assert.equal(output.text, [
    "INT. MOTEL ROOM - NIGHT",
    "",
    "MARA",
    "Don't open it.",
    "",
    "Eli slips the receipt under the coffee cup before she can see his hand shake.",
  ].join("\n"));
  assert.equal(output.lines[0].element, "sceneHeading");
  assert.ok(output.lines.some((line) => line.element === "character"));
});

test("[talk-screenplay-output] repairs action-only continuations when anchor is available", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "June folds the receipt into a white square.",
      "The motel sign flickers out behind her.",
    ].join("\n"),
    studioMeta: {
      screenplayTarget: "page",
      screenplayAnchorSceneLabel: "EXT. MOTEL BALCONY - DAWN",
    },
  });

  assert.equal(output.target, "page");
  assert.equal(output.source, "repaired_scene_anchor");
  assert.equal(output.text.startsWith("EXT. MOTEL BALCONY - DAWN\n\n"), true);
});

test("[talk-screenplay-output] accepts playable page output after quality gate", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "June folds the receipt into a white square.",
      "",
      "MARCUS",
      "You kept it.",
      "",
      "June looks up before he can hide the shake in his hand.",
    ].join("\n"),
    studioMeta: {
      screenplayTarget: "page",
    },
  });

  assert.equal(output.target, "page");
  assert.equal(output.source, "studio_target");
  assert.equal(output.quality.ok, true);
  assert.equal(output.quality.reason, "ok");
  assert.equal(output.quality.confidence, "authoritative");
  assert.ok(output.quality.counts.scene_heading >= 1);
  assert.ok(output.lines.some((line) => line.element === "sceneHeading"));
  assert.ok(output.lines.some((line) => line.element === "dialogue"));
});

test("[talk-screenplay-output] flags weak momentum-rescue voice notes with repair directives", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "You're not stuck. The strongest move is pressure: raise the stakes and add a consequence.",
      "What if the scene becomes more emotional and the characters finally face the truth?",
    ].join("\n"),
    transcript: "I'm stuck and need ideas for what should happen next.",
    studioMeta: {
      screenplayTarget: "voice_pin",
      screenplayProjectId: "rain-docket",
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_momentum_rescue_quality");
  assert.equal(output.quality.ok, false);
  assert.equal(output.quality.reason, "missing_playable_micro_beat");
  assert.equal(output.quality.confidence, "needs_repair");
  assert.ok(
    output.quality.repair_directives.some((directive) => /visible page behavior/i.test(directive))
  );
});

test("[talk-screenplay-output] accepts concrete momentum-rescue voice notes", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "The strongest move is a relationship-cost reversal: Mara gets proof, but using it burns Eli.",
      "",
      "INT. ARCHIVE ROOM - NIGHT",
      "",
      "Mara slides the tape into Eli's coat pocket before the clerk can see it.",
      "",
      "ELI",
      "If I carry this, I stop being your witness.",
      "",
      "MARA",
      "No. You become the cost.",
    ].join("\n"),
    transcript: "What should happen next after Mara finds the tape?",
    studioMeta: {
      screenplayTarget: "voice_pin",
      screenplayProjectId: "rain-docket",
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "studio_target");
  assert.equal(output.quality.ok, true);
  assert.equal(output.quality.reason, "ok");
  assert.equal(output.quality.confidence, "authoritative");
});

test("[talk-screenplay-output] rejects continuation voice notes that ignore remembered next turn", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "The strongest move is a relationship-cost reversal: Mara gets proof, but using it burns Eli.",
      "",
      "INT. ARCHIVE ROOM - NIGHT",
      "",
      "Mara slides the tape into Eli's coat pocket before the clerk can see it.",
      "",
      "ELI",
      "If I carry this, I stop being your witness.",
    ].join("\n"),
    transcript: "What happens next?",
    studioMeta: {
      screenplayTarget: "voice_pin",
      screenplayProjectId: "rain-docket",
      screenplayNextThreeTurns: [
        "The reel plays the wrong memory.",
        "Marcus forces a public choice.",
      ],
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_momentum_rescue_quality");
  assert.equal(output.quality.ok, false);
  assert.equal(output.quality.reason, "missing_next_turn_continuation");
  assert.equal(output.quality.confidence, "needs_repair");
  assert.ok(
    output.quality.repair_directives.some((directive) => /first remembered next turn/i.test(directive))
  );
});

test("[talk-screenplay-output] accepts continuation voice notes that spend remembered next turn", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "The strongest move is to spend the remembered turn: the reel plays the wrong memory, so Mara's private proof becomes public danger.",
      "",
      "INT. EDIT BAY - NIGHT",
      "",
      "Mara threads the reel into the projector. The wrong memory blooms across the wall before Marcus can block the lens.",
      "",
      "MARCUS",
      "Turn it off.",
      "",
      "MARA",
      "Not until everyone sees what you buried.",
    ].join("\n"),
    transcript: "What happens next?",
    studioMeta: {
      screenplayTarget: "voice_pin",
      screenplayProjectId: "rain-docket",
      screenplayNextThreeTurns: [
        "The reel plays the wrong memory.",
        "Marcus forces a public choice.",
      ],
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "studio_target");
  assert.equal(output.quality.ok, true);
  assert.equal(output.quality.reason, "ok");
  assert.equal(output.quality.confidence, "authoritative");
});

test("[talk-screenplay-output] rejects outline prose masquerading as page text", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "Beat 1: June confronts Marcus about the receipt.",
      "The scene should escalate suspicion before the reveal.",
    ].join("\n"),
    studioMeta: {
      screenplayTarget: "page",
      screenplayAnchorSceneLabel: "INT. MOTEL ROOM - NIGHT",
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_low_page_quality");
  assert.equal(output.quality.ok, false);
  assert.equal(output.quality.reason, "outline_or_craft_artifact");
  assert.equal(output.quality.confidence, "needs_repair");
});

test("[talk-screenplay-output] rejects placeholder page scaffolding", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. ROOM - NIGHT",
      "",
      "Action line goes here.",
      "",
      "CHARACTER A",
      "Dialogue line.",
    ].join("\n"),
    studioMeta: {
      screenplayTarget: "page",
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_low_page_quality");
  assert.equal(output.quality.reason, "placeholder_page_text");
  assert.equal(output.quality.confidence, "needs_repair");
});

test("[talk-screenplay-output] rejects generic low-density page action", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. ROOM - NIGHT",
      "",
      "They keep talking in the room.",
      "The argument gets more intense.",
      "The conversation continues for a while.",
    ].join("\n"),
    studioMeta: {
      screenplayTarget: "page",
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_low_page_quality");
  assert.equal(output.quality.reason, "low_dramatic_density");
});

test("[talk-screenplay-output] rejects craft notes even with a scene anchor", () => {
  const output = buildTalkScreenplayOutput({
    reply: "The scene needs more pressure before anyone explains the clue.",
    studioMeta: {
      screenplayTarget: "page",
      screenplayAnchorSceneLabel: "INT. MOTEL ROOM - NIGHT",
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_invalid_page_format");
});

test("[talk-screenplay-output] rejects low-quality explicit prompt block fallback", () => {
  const output = buildTalkScreenplayOutput({
    reply: "",
    transcript: [
      "Write exactly this screenplay block and nothing else:",
      "INT. MOTEL ROOM - NIGHT",
      "",
      "Beat 1: June confronts Marcus about the receipt.",
      "The scene should escalate suspicion before the reveal.",
    ].join("\n"),
    studioMeta: {
      screenplayTarget: "page",
      screenplayAnchorSceneLabel: "INT. MOTEL ROOM - NIGHT",
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_invalid_page_format");
});

test("[talk-screenplay-output] rejects underfilled requested page batches", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "June folds the receipt into a white square.",
      "",
      "MARCUS",
      "You kept it.",
      "",
      "June looks up before he can hide the shake in his hand.",
    ].join("\n"),
    transcript: "Write the next three pages from here.",
    studioMeta: {
      screenplayTarget: "page",
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_low_page_quality");
  assert.equal(output.quality.reason, "underfilled_page_text");
});

test("[talk-screenplay-output] rejects Act I page output that dodges supplied commitment memory", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. BUS STOP - MORNING",
      "",
      "Nina watches the buses cough past the curb.",
      "",
      "MOM",
      "You can still come home.",
      "",
      "Nina nods and stays where she is.",
    ].join("\n"),
    transcript: "Write the next page of act one.",
    studioMeta: {
      screenplayTarget: "page",
      screenplayAct: "Act I",
      screenplaySceneObjective: "Nina must accept the dangerous audition and burn her safe day job.",
      screenplayCurrentBeat: "The audition address appears on the back of the eviction notice.",
      screenplayProtagonistWant: "Keep her safe day job.",
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_low_page_quality");
  assert.equal(output.quality.reason, "missing_act_one_commitment");
  assert.equal(output.quality.feature_act, "act1");
});

test("[talk-screenplay-output] accepts Act I page output that spends supplied commitment memory", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. BUS STOP - MORNING",
      "",
      "Nina folds the eviction notice until the audition address splits across the crease.",
      "Her grocery-store name tag slides from her palm into a puddle.",
      "",
      "MOM",
      "You can still keep the safe job.",
      "",
      "NINA",
      "Tell them I quit.",
    ].join("\n"),
    transcript: "Write the next page of act one.",
    studioMeta: {
      screenplayTarget: "page",
      screenplayAct: "Act I",
      screenplaySceneObjective: "Nina must accept the dangerous audition and burn her safe day job.",
      screenplayCurrentBeat: "The audition address appears on the back of the eviction notice.",
      screenplayProtagonistWant: "Keep her safe day job.",
    },
  });

  assert.equal(output.target, "page");
  assert.equal(output.source, "studio_target");
  assert.equal(output.quality.ok, true);
  assert.equal(output.quality.feature_act, "act1");
});

test("[talk-screenplay-output] rejects Act II page output that dodges supplied reversal memory", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "June and Marcus stand over the unmade bed.",
      "",
      "MARCUS",
      "We still have time.",
      "",
      "June turns away from him.",
    ].join("\n"),
    transcript: "Write the next pages of act two.",
    studioMeta: {
      screenplayTarget: "page",
      screenplayAct: "Act II",
      screenplayFeatureSequence: "Midpoint Pressure",
      screenplayFeatureObligation: "The midpoint must turn victory into a trap.",
      screenplayCurrentBeat: "June realizes the marina receipt makes the public win a trap.",
      screenplayNextThreeTurns: ["The receipt exposes the win as bait."],
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_low_page_quality");
  assert.equal(output.quality.reason, "missing_act_two_reversal");
  assert.equal(output.quality.feature_act, "act2");
});

test("[talk-screenplay-output] accepts Act II page output that spends supplied reversal memory", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "June spreads the marina receipt beside the victory photo.",
      "The timestamp sits ten minutes after Marcus swore the dock was empty.",
      "",
      "MARCUS",
      "That receipt is our win.",
      "",
      "JUNE",
      "No. It's bait.",
      "",
      "She turns the photo over. The motel clerk's number is written on the back.",
    ].join("\n"),
    transcript: "Write the next pages of act two.",
    studioMeta: {
      screenplayTarget: "page",
      screenplayAct: "Act II",
      screenplayFeatureSequence: "Midpoint Pressure",
      screenplayFeatureObligation: "The midpoint must turn victory into a trap.",
      screenplayCurrentBeat: "June realizes the marina receipt makes the public win a trap.",
      screenplayNextThreeTurns: ["The receipt exposes the win as bait."],
    },
  });

  assert.equal(output.target, "page");
  assert.equal(output.source, "studio_target");
  assert.equal(output.quality.ok, true);
  assert.equal(output.quality.feature_act, "act2");
});

test("[talk-screenplay-output] rejects page output that ignores the next-scene execution brief", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. EDIT BAY - NIGHT",
      "",
      "Mara threads the warped reel through the Steenbeck.",
      "On screen, the wrong memory stutters where the evidence should be.",
      "",
      "MARCUS",
      "That's not what we shot.",
      "",
      "MARA",
      "No. That's what someone wanted remembered.",
    ].join("\n"),
    transcript: "Continue this Act II scene as pages.",
    studioMeta: {
      screenplayTarget: "page",
      screenplayAct: "Act II",
      screenplayFeatureSequence: "Reversal Fallout",
      screenplayFeatureObligation: "The reel plays the wrong memory and turns evidence into a trap.",
      screenplayNextThreeTurns: [
        "The reel plays the wrong memory.",
        "Marcus forces a public choice.",
      ],
      screenplayUnresolvedStoryThreads: ["The locked archive door blocks Mara."],
      screenplayCharacterArcTurns: ["Mara stops cutting around her guilt."],
      screenplayActThreePayoffPath: ["The fixer is exposed by the public splice."],
      screenplayImageMotifs: ["projector flare"],
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_low_page_quality");
  assert.equal(output.quality.reason, "missing_next_scene_execution_brief");
  assert.equal(output.quality.confidence, "needs_repair");
  assert.ok(
    output.quality.repair_directives.some((directive) => /next-scene brief lanes/i.test(directive))
  );
});

test("[talk-screenplay-output] accepts page output that executes the next-scene brief", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. EDIT BAY - NIGHT",
      "",
      "Mara threads the warped reel through the Steenbeck.",
      "On screen, the wrong memory stutters where the evidence should be.",
      "The locked archive door rattles under someone's fist.",
      "",
      "MARCUS",
      "If you say this in public, you don't get to take it back.",
      "",
      "MARA",
      "Then stop cutting around my guilt.",
      "",
      "She lifts the splice marker and writes FIXER across the frame.",
      "A projector flare washes the room white as Marcus opens the door to the crowd.",
    ].join("\n"),
    transcript: "Continue this Act II scene as pages.",
    studioMeta: {
      screenplayTarget: "page",
      screenplayAct: "Act II",
      screenplayFeatureSequence: "Reversal Fallout",
      screenplayFeatureObligation: "The reel plays the wrong memory and turns evidence into a trap.",
      screenplayNextThreeTurns: [
        "The reel plays the wrong memory.",
        "Marcus forces a public choice.",
      ],
      screenplayUnresolvedStoryThreads: ["The locked archive door blocks Mara."],
      screenplayCharacterArcTurns: ["Mara stops cutting around her guilt."],
      screenplayActThreePayoffPath: ["The fixer is exposed by the public splice."],
      screenplayImageMotifs: ["projector flare"],
    },
  });

  assert.equal(output.target, "page");
  assert.equal(output.source, "studio_target");
  assert.equal(output.quality.ok, true);
  assert.equal(output.quality.reason, "ok");
});

test("[talk-screenplay-output] rejects page output that dodges structured character arc memory", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. ARCHIVE ROOM - NIGHT",
      "",
      "Mara pins a fresh photograph beside the old case map.",
      "",
      "ELI",
      "We can wait.",
      "",
      "Mara pockets the file and turns off the lamp.",
    ].join("\n"),
    transcript: "Write the next Act II page from Mara's arc memory.",
    studioMeta: {
      screenplayTarget: "page",
      screenplayAct: "Act II",
      screenplayCharacterArcMemory: {
        character: "Mara",
        act: "Act II",
        want: "expose the forged testimony",
        need: "stop hiding behind observation",
        falseBelief: "truth destroys anyone who says it aloud",
        currentTactic: "collecting evidence in silence",
        nextEmotionalTurn: "public courage",
      },
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_low_page_quality");
  assert.equal(output.quality.reason, "missing_character_arc_memory");
  assert.equal(output.quality.feature_act, "character_arc");
});

test("[talk-screenplay-output] accepts page output that dramatizes structured character arc memory", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. ARCHIVE ROOM - NIGHT",
      "",
      "Mara lays the forged testimony across the evidence board.",
      "Her notebook stays open in her palm, the last shelter of observation.",
      "",
      "ELI",
      "If the truth destroys anyone who says it aloud, let me be quiet with you.",
      "",
      "MARA",
      "No. I have been collecting silence long enough.",
      "",
      "She opens the archive door, public courage shaking through her hand.",
    ].join("\n"),
    transcript: "Write the next Act II page from Mara's arc memory.",
    studioMeta: {
      screenplayTarget: "page",
      screenplayAct: "Act II",
      screenplayCharacterArcMemory: {
        character: "Mara",
        act: "Act II",
        want: "expose the forged testimony",
        need: "stop hiding behind observation",
        falseBelief: "truth destroys anyone who says it aloud",
        currentTactic: "collecting evidence in silence",
        nextEmotionalTurn: "public courage",
      },
    },
  });

  assert.equal(output.target, "page");
  assert.equal(output.source, "studio_target");
  assert.equal(output.quality.ok, true);
  assert.equal(output.quality.feature_act, "act2");
});

test("[talk-screenplay-output] preserves structured character arc memory from studio metadata", () => {
  const studio = sanitizeStudioTurnMetadata({
    screenplayTarget: "page",
    screenplayCharacterArcMemory: JSON.stringify({
      character: "Mara",
      act: "Act II",
      want: "expose the forged testimony",
      need: "stop hiding behind observation",
      false_belief: "truth destroys anyone who says it aloud",
      current_tactic: "collecting evidence in silence",
      next_emotional_turn: "public courage",
    }),
  });

  assert.equal(studio.screenplayTarget, "page");
  assert.equal(studio.screenplayCharacterArcMemory.character, "Mara");
  assert.equal(studio.screenplayCharacterArcMemory.want, "expose the forged testimony");
  assert.equal(studio.screenplayCharacterArcMemory.need, "stop hiding behind observation");
  assert.equal(studio.screenplayCharacterArcMemory.falseBelief, "truth destroys anyone who says it aloud");
  assert.equal(studio.screenplayCharacterArcMemory.currentTactic, "collecting evidence in silence");
  assert.equal(studio.screenplayCharacterArcMemory.nextEmotionalTurn, "public courage");
});

test("[talk-screenplay-output] preserves multiple structured character arc memories", () => {
  const studio = sanitizeStudioTurnMetadata({
    screenplayTarget: "page",
    screenplayCharacterArcMemory: JSON.stringify([
      {
        character: "Mara",
        act: "Act II",
        want: "expose the forged testimony",
        wound: "her father's disappearance",
        false_belief: "truth destroys anyone who says it aloud",
      },
      {
        character: "Eli",
        act: "Act II",
        want: "keep Mara alive until dawn",
        need: "tell Mara the secret without asking permission",
        next_emotional_turn: "chooses honesty over protection",
      },
    ]),
  });

  assert.equal(studio.screenplayCharacterArcMemory.character, "Mara");
  assert.equal(studio.screenplayCharacterArcMemories.length, 2);
  assert.equal(studio.screenplayCharacterArcMemories[1].character, "Eli");
  assert.equal(studio.screenplayCharacterArcMemories[1].want, "keep Mara alive until dawn");
  assert.equal(studio.screenplayCharacterArcMemories[1].nextEmotionalTurn, "chooses honesty over protection");
});

test("[talk-screenplay-output] rejects Act III page output that dodges supplied payoff memory", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. COURTHOUSE - NIGHT",
      "",
      "Mara steps into the center aisle and looks at everyone.",
      "",
      "ELI",
      "It's over.",
      "",
      "Mara takes a breath.",
    ].join("\n"),
    transcript: "Write the next pages of act three.",
    studioMeta: {
      screenplayTarget: "page",
      screenplayAct: "Act III",
      screenplayPageCount: 100,
      screenplayTargetPages: 110,
      screenplayCharacterArcState: "Mara can only win by choosing public truth over private control.",
      screenplayEndingImage: "The empty pool filled with rainwater at dawn.",
      screenplayActThreePayoffPath: [
        "The sister's voicemail becomes testimony.",
        "The broken microphone becomes the public proof.",
      ],
      screenplayUnresolvedSetups: [
        "The buried first report has not been exposed.",
      ],
    },
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_low_page_quality");
  assert.equal(output.quality.reason, "missing_act_three_payoff");
  assert.equal(output.quality.feature_act, "act3");
});

test("[talk-screenplay-output] accepts Act III page output that spends supplied payoff memory", () => {
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. COURTHOUSE - NIGHT",
      "",
      "Mara sets the cracked phone beside the dead microphone.",
      "The sister's voicemail crackles through the courtroom speakers, thin and undeniable.",
      "",
      "MARA",
      "I buried the report because I thought protecting her meant owning the truth alone.",
      "",
      "She pushes the microphone toward the witness table instead of pulling it back.",
      "Beyond the courthouse glass, rainwater trembles in the empty pool.",
    ].join("\n"),
    transcript: "Write the next pages of act three.",
    studioMeta: {
      screenplayTarget: "page",
      screenplayAct: "Act III",
      screenplayPageCount: 100,
      screenplayTargetPages: 110,
      screenplayCharacterArcState: "Mara can only win by choosing public truth over private control.",
      screenplayEndingImage: "The empty pool filled with rainwater at dawn.",
      screenplayActThreePayoffPath: [
        "The sister's voicemail becomes testimony.",
        "The broken microphone becomes the public proof.",
      ],
      screenplayUnresolvedSetups: [
        "The buried first report has not been exposed.",
      ],
    },
  });

  assert.equal(output.target, "page");
  assert.equal(output.source, "studio_target");
  assert.equal(output.quality.ok, true);
  assert.equal(output.quality.feature_act, "act3");
});

test("[talk-screenplay-output] accepts a repair-pass candidate after the live guard rejects the first draft", () => {
  const studioMeta = {
    screenplayTarget: "page",
    screenplayAnchorSceneLabel: "INT. MOTEL ROOM - NIGHT",
  };
  const transcript = "Continue the motel scene as screenplay pages.";
  const failed = buildTalkScreenplayOutput({
    reply: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "Beat 1: June confronts Marcus about the receipt.",
      "The scene should escalate suspicion before the reveal.",
    ].join("\n"),
    transcript,
    studioMeta,
  });
  assert.equal(failed.target, "voice_pin");
  assert.equal(failed.source, "guard_low_page_quality");
  assert.equal(failed.quality.reason, "outline_or_craft_artifact");

  const repaired = applyTalkScreenplayRepairCandidate({
    currentOutput: failed,
    candidateReply: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "June folds the receipt into a white square and slides it under the motel Bible.",
      "",
      "MARCUS",
      "You kept it.",
      "",
      "The bathroom faucet knocks once inside the wall. June looks at his wet cuffs before she looks at his face.",
      "",
      "JUNE",
      "I kept everything you were afraid to touch.",
    ].join("\n"),
    transcript,
    studioMeta,
  });

  assert.equal(repaired.target, "page");
  assert.equal(repaired.source, "repair_pass");
  assert.equal(repaired.quality.ok, true);
  assert.equal(repaired.quality.confidence, "repaired");
  assert.ok(
    repaired.quality.repair_directives.some((directive) => directive.includes("Remove outline"))
  );
  assert.equal(
    isAuthoritativeTalkScreenplayOutput(repaired, { studioMeta, transcript }),
    true
  );
});

test("[talk-screenplay-output] exposes repair directives for summary-like page batches", () => {
  const studioMeta = {
    screenplayTarget: "page",
    screenplayRequestedPages: 3,
    screenplayAnchorSceneLabel: "INT. COURTHOUSE HALLWAY - DAY",
  };
  const output = buildTalkScreenplayOutput({
    reply: [
      "INT. COURTHOUSE HALLWAY - DAY",
      "",
      "Over the next few pages, Mara follows the clerk through the courthouse and realizes the docket has been rewritten twice.",
      "",
      "MARA",
      "If the docket moved, somebody touched it after midnight.",
      "",
      "ELI",
      "Then stop reading the lie and make them sign their name to it.",
      "",
      "The scene shows Mara confronting Eli while the public hallway keeps filling with reporters and family members.",
      "",
      "MARA",
      "You always make public courage sound like paperwork.",
      "",
      "ELI",
      "And you always make fear sound like procedure.",
      "",
      "A series of moments reveals the judge's aide moving the sealed affidavit from one folder to another.",
      "",
      "MARA",
      "The clerk is watching us.",
      "",
      "ELI",
      "Good. Give her something worth remembering.",
    ].join("\n"),
    transcript: "Write the next three pages.",
    studioMeta,
  });

  assert.equal(output.target, "voice_pin");
  assert.equal(output.source, "guard_low_page_quality");
  assert.equal(output.quality.reason, "summary_like_page_batch");
  assert.equal(output.quality.confidence, "needs_repair");
  assert.equal(output.quality.counts.summary_like_action >= 2, true);
  assert.ok(Array.isArray(output.quality.repair_directives));
  assert.ok(
    output.quality.repair_directives.some((directive) => directive.includes("Replace synopsis/overview language"))
  );
});

test("[talk-screenplay-output] rejects repair-pass candidates that still look like outlines", () => {
  const studioMeta = {
    screenplayTarget: "page",
    screenplayAnchorSceneLabel: "INT. MOTEL ROOM - NIGHT",
  };
  const failed = {
    target: "voice_pin",
    source: "guard_low_page_quality",
    text: "",
    lines: [],
  };
  const repaired = applyTalkScreenplayRepairCandidate({
    currentOutput: failed,
    candidateReply: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "Next three turns: June hides the receipt, Marcus admits the lie, the truth lands.",
      "The scene should create more pressure.",
    ].join("\n"),
    transcript: "Write the next page.",
    studioMeta,
  });

  assert.equal(repaired, null);
});

test("[talk-screenplay-output] final authority gate rejects outline drift", () => {
  const screenplayOutput = {
    target: "page",
    format: "hollywood",
    source: "generation_transcript",
    text: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "Next three turns: June hides the reel; Marcus forces a public choice.",
      "Act III payoff path: the reel exposes the fixer.",
    ].join("\n"),
    lines: [
      { text: "INT. MOTEL ROOM - NIGHT", element: "sceneHeading" },
      { text: "", element: "blank" },
      { text: "Next three turns: June hides the reel; Marcus forces a public choice.", element: "action" },
      { text: "Act III payoff path: the reel exposes the fixer.", element: "action" },
    ],
  };

  assert.equal(
    isAuthoritativeTalkScreenplayOutput(screenplayOutput, {
      studioMeta: { screenplayTarget: "page", screenplayAnchorSceneLabel: "INT. MOTEL ROOM - NIGHT" },
    }),
    false
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateMomentumRescueQuality,
  evaluateScreenplayPageQuality,
  isLikelyOutlineOrCraftArtifactLine,
  isLikelyPlaceholderScreenplayLine,
  isLowSignalActionLine,
  isLowSubtextDialogueLine,
  isSummaryLikeActionLine,
  minimumExpectedWordsForRequestedPages,
} from "../lib/screenplay_page_quality.js";

test("[momentum-rescue-quality] rejects vague writer-block advice without a playable next beat", () => {
  const quality = evaluateMomentumRescueQuality({
    transcript: "I'm stuck and need ideas for what should happen next.",
    reply: [
      "You're not stuck. The strongest move is pressure: raise the stakes and add a consequence.",
      "What if the scene becomes more emotional and the characters finally face the truth?",
    ].join("\n"),
  });

  assert.equal(quality.applicable, true);
  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "missing_playable_micro_beat");
  assert.ok(quality.repairDirectives.some((directive) => /visible page behavior/i.test(directive)));
});

test("[momentum-rescue-quality] accepts a decisive pressure engine plus playable micro-beat", () => {
  const quality = evaluateMomentumRescueQuality({
    transcript: "What should happen next after Mara finds the tape?",
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
  });

  assert.equal(quality.applicable, true);
  assert.equal(quality.ok, true);
  assert.equal(quality.reason, "ok");
  assert.equal(quality.counts.pressureSignals >= 2, true);
  assert.equal(quality.counts.hasFountainShape, 1);
});

test("[momentum-rescue-quality] rejects continuation answers that dodge remembered next turn", () => {
  const quality = evaluateMomentumRescueQuality({
    transcript: "What happens next?",
    studioMeta: {
      screenplayTarget: "voice_pin",
      screenplayNextThreeTurns: [
        "The reel plays the wrong memory.",
        "Marcus forces a public choice.",
      ],
    },
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
  });

  assert.equal(quality.applicable, true);
  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "missing_next_turn_continuation");
  assert.ok(quality.repairDirectives.some((directive) => /first remembered next turn/i.test(directive)));
  assert.equal(quality.counts.nextTurnTokenCount >= 3, true);
});

test("[momentum-rescue-quality] accepts continuation answers that spend remembered next turn", () => {
  const quality = evaluateMomentumRescueQuality({
    transcript: "What happens next?",
    studioMeta: {
      screenplayTarget: "voice_pin",
      screenplayNextThreeTurns: [
        "The reel plays the wrong memory.",
        "Marcus forces a public choice.",
      ],
    },
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
  });

  assert.equal(quality.applicable, true);
  assert.equal(quality.ok, true);
  assert.equal(quality.reason, "ok");
  assert.equal(quality.counts.nextTurnMatchedTokens >= 3, true);
});

test("[momentum-rescue-quality] leaves ordinary non-block voice turns alone", () => {
  const quality = evaluateMomentumRescueQuality({
    transcript: "Say that again more softly.",
    reply: "Of course. Softer, cleaner, and less hurried.",
  });

  assert.equal(quality.applicable, false);
  assert.equal(quality.ok, true);
  assert.equal(quality.reason, "not_momentum_rescue");
});

test("[screenplay-page-quality] accepts playable screenplay pages", () => {
  const quality = evaluateScreenplayPageQuality({
    text: "INT. MOTEL ROOM - NIGHT\n\nJune folds the receipt into a white square.\n\nMARCUS\nYou kept it.",
    lines: [
      { text: "INT. MOTEL ROOM - NIGHT", element: "sceneHeading" },
      { text: "", element: "blank" },
      { text: "June folds the receipt into a white square.", element: "action" },
      { text: "", element: "blank" },
      { text: "MARCUS", element: "character" },
      { text: "You kept it.", element: "dialogue" },
    ],
  });

  assert.equal(quality.ok, true);
  assert.equal(quality.reason, "ok");
});

test("[screenplay-page-quality] rejects outline and craft artifacts masquerading as pages", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "Beat 1: June confronts Marcus about the receipt.",
      "Next three turns: June hides the reel; Marcus forces a public choice.",
      "Act III payoff path: the reel exposes the fixer.",
      "The scene should escalate suspicion before the reveal.",
    ].join("\n"),
    lines: [
      { text: "INT. MOTEL ROOM - NIGHT", element: "sceneHeading" },
      { text: "", element: "blank" },
      { text: "Beat 1: June confronts Marcus about the receipt.", element: "action" },
      { text: "Next three turns: June hides the reel; Marcus forces a public choice.", element: "action" },
      { text: "Act III payoff path: the reel exposes the fixer.", element: "action" },
      { text: "The scene should escalate suspicion before the reveal.", element: "action" },
    ],
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "outline_or_craft_artifact");
  assert.equal(isLikelyOutlineOrCraftArtifactLine("Next three turns: June hides the reel."), true);
  assert.equal(isLikelyOutlineOrCraftArtifactLine("Act III payoff path: the reel exposes the fixer."), true);
  assert.equal(isLikelyOutlineOrCraftArtifactLine("Memory to page execution: dramatize turn one first."), true);
});

test("[screenplay-page-quality] rejects placeholder screenplay scaffolding", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. ROOM - NIGHT",
      "",
      "Action line goes here.",
      "",
      "CHARACTER A",
      "Dialogue line.",
    ].join("\n"),
    lines: [
      { text: "INT. ROOM - NIGHT", element: "sceneHeading" },
      { text: "", element: "blank" },
      { text: "Action line goes here.", element: "action" },
      { text: "", element: "blank" },
      { text: "CHARACTER A", element: "character" },
      { text: "Dialogue line.", element: "dialogue" },
    ],
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "placeholder_page_text");
});

test("[screenplay-page-quality] rejects generic low-density page action", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. ROOM - NIGHT",
      "",
      "They keep talking in the room.",
      "The argument gets more intense.",
      "The conversation continues for a while.",
    ].join("\n"),
    lines: [
      { text: "INT. ROOM - NIGHT", element: "sceneHeading" },
      { text: "", element: "blank" },
      { text: "They keep talking in the room.", element: "action" },
      { text: "The argument gets more intense.", element: "action" },
      { text: "The conversation continues for a while.", element: "action" },
    ],
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "low_dramatic_density");
});

test("[screenplay-page-quality] rejects vague cinematic vapor without playable behavior", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. ROOM - NIGHT",
      "",
      "A silence stretches between them.",
      "The tension builds.",
      "The truth hangs between them.",
      "No one knows what to say.",
    ].join("\n"),
    lines: [
      { text: "INT. ROOM - NIGHT", element: "sceneHeading" },
      { text: "", element: "blank" },
      { text: "A silence stretches between them.", element: "action" },
      { text: "The tension builds.", element: "action" },
      { text: "The truth hangs between them.", element: "action" },
      { text: "No one knows what to say.", element: "action" },
    ],
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "low_dramatic_density");
});

test("[screenplay-page-quality] rejects underfilled multi-page requests", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "June folds the receipt into a white square.",
      "",
      "MARCUS",
      "You kept it.",
      "",
      "June looks up before he can hide the shake in his hand.",
    ].join("\n"),
    lines: [
      { text: "INT. MOTEL ROOM - NIGHT", element: "sceneHeading" },
      { text: "", element: "blank" },
      { text: "June folds the receipt into a white square.", element: "action" },
      { text: "", element: "blank" },
      { text: "MARCUS", element: "character" },
      { text: "You kept it.", element: "dialogue" },
      { text: "", element: "blank" },
      { text: "June looks up before he can hide the shake in his hand.", element: "action" },
    ],
    targetPages: 3,
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "underfilled_page_text");
  assert.equal(minimumExpectedWordsForRequestedPages(3), 120);
});

test("[screenplay-page-quality] caps requested-page floors below full-feature targets", () => {
  assert.equal(minimumExpectedWordsForRequestedPages(1), 4);
  assert.equal(minimumExpectedWordsForRequestedPages(7), 305);
  assert.equal(minimumExpectedWordsForRequestedPages(8), 880);
  assert.equal(minimumExpectedWordsForRequestedPages(10), 1_100);
  assert.equal(minimumExpectedWordsForRequestedPages(15), 1_650);
  assert.equal(minimumExpectedWordsForRequestedPages(30), 1_800);
});

test("[screenplay-page-quality] rejects on-the-nose dialogue-heavy batches", () => {
  const dialogue = [
    "We need to talk.",
    "I feel hurt because you lied to me again.",
    "This is important and difficult for both of us.",
    "Tell me the truth.",
    "I don't know what to say anymore.",
    "You need to understand me before this gets worse.",
    "We have to be honest about what happened.",
    "I can't do this anymore.",
    "I am scared because everything is falling apart.",
    "You hurt me more than you understand.",
    "I just want the truth before we lose each other.",
    "This is serious and wrong and I need you to know that.",
  ];
  const text = [
    "INT. APARTMENT - NIGHT",
    "",
    ...dialogue.flatMap((line, index) => [
      index % 2 === 0 ? "MARA" : "ELI",
      line,
      "",
    ]),
    "Mara stands there, waiting.",
  ].join("\n");
  const quality = evaluateScreenplayPageQuality({
    text,
    lines: [
      { text: "INT. APARTMENT - NIGHT", element: "sceneHeading" },
      ...dialogue.flatMap((line, index) => [
        { text: index % 2 === 0 ? "MARA" : "ELI", element: "character" },
        { text: line, element: "dialogue" },
      ]),
      { text: "Mara stands there, waiting.", element: "action" },
    ],
    targetPages: 2,
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "on_the_nose_dialogue");
  assert.equal(isLowSubtextDialogueLine("We need to talk.", "dialogue"), true);
});

test("[screenplay-page-quality] rejects soft first-page openings in requested page batches", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. APARTMENT - NIGHT",
      "",
      "The room is quiet and tense.",
      "",
      "MARA",
      "Did you move the file?",
      "",
      "ELI",
      "No.",
      "",
      "Mara studies the locked drawer beneath his hand.",
    ].join("\n"),
    lines: [
      { text: "INT. APARTMENT - NIGHT", element: "sceneHeading" },
      { text: "The room is quiet and tense.", element: "action" },
      { text: "MARA", element: "character" },
      { text: "Did you move the file?", element: "dialogue" },
      { text: "ELI", element: "character" },
      { text: "No.", element: "dialogue" },
      { text: "Mara studies the locked drawer beneath his hand.", element: "action" },
    ],
    targetPages: 2,
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "weak_first_page_opening");
});

test("[screenplay-page-quality] rejects static dialogue batches without enough page turns", () => {
  const dialogue = [
    "The money was supposed to be there before the hearing started, and now every camera in the hallway is pointed at us.",
    "Then stop looking at the cameras and start looking at the envelope your sister left under the bench.",
    "I already looked at it. It is another receipt, another dead end, another reason for you to tell me to wait.",
    "It is a receipt from the marina, Mara. The one place the first report says nobody went that night.",
    "If I walk in there with this, they bury her before lunch and call it procedure.",
    "If you walk in there without it, they bury you with her and call it justice.",
    "You always make fear sound like strategy when you are the one holding the door closed.",
    "And you always make courage sound clean because you are not the one who has to live after it.",
  ];
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. COURTHOUSE HALLWAY - DAY",
      "",
      ...dialogue.flatMap((line, index) => [
        index % 2 === 0 ? "MARA" : "ELI",
        line,
        "",
      ]),
    ].join("\n"),
    lines: [
      { text: "INT. COURTHOUSE HALLWAY - DAY", element: "sceneHeading" },
      ...dialogue.flatMap((line, index) => [
        { text: index % 2 === 0 ? "MARA" : "ELI", element: "character" },
        { text: line, element: "dialogue" },
      ]),
    ],
    targetPages: 3,
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "static_dialogue_batch");
});

test("[screenplay-page-quality] rejects expository dialogue dumps", () => {
  const dialogue = [
    "As you know, my father built this court after the marina fire.",
    "Let me explain why the sealed affidavit matters to the case.",
    "What happened was the clerk forged the timestamp to protect Marcus.",
    "Remember when the judge said the docket was clean?",
    "Back then, everyone believed the hearing was just procedure.",
    "This is important because the audience needs to know the conspiracy.",
  ];
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. COURTHOUSE HALLWAY - DAY",
      "",
      "Mara holds the sealed affidavit between both hands.",
      "",
      ...dialogue.flatMap((line, index) => [
        index % 2 === 0 ? "MARA" : "ELI",
        line,
        "",
      ]),
    ].join("\n"),
    lines: [
      { text: "INT. COURTHOUSE HALLWAY - DAY", element: "sceneHeading" },
      { text: "Mara holds the sealed affidavit between both hands.", element: "action" },
      ...dialogue.flatMap((line, index) => [
        { text: index % 2 === 0 ? "MARA" : "ELI", element: "character" },
        { text: line, element: "dialogue" },
      ]),
    ],
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "expository_dialogue_dump");
  assert.equal(quality.counts.expositoryDialogue >= 3, true);
});

test("[screenplay-page-quality] rejects interchangeable dialogue voice", () => {
  const dialogue = [
    "Maybe we can wait for morning.",
    "Maybe we can call someone.",
    "Maybe we can check the hallway first.",
    "Maybe we can stay calm.",
    "Maybe we can think this through.",
    "Maybe we can warn the others.",
  ];
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "Mara sets the folded receipt on the table.",
      "",
      ...dialogue.flatMap((line, index) => [
        index % 2 === 0 ? "MARA" : "ELI",
        line,
        "",
      ]),
    ].join("\n"),
    lines: [
      { text: "INT. MOTEL ROOM - NIGHT", element: "sceneHeading" },
      { text: "Mara sets the folded receipt on the table.", element: "action" },
      ...dialogue.flatMap((line, index) => [
        { text: index % 2 === 0 ? "MARA" : "ELI", element: "character" },
        { text: line, element: "dialogue" },
      ]),
    ],
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "interchangeable_dialogue_voice");
  assert.equal(quality.counts.repeatedDialogueStart >= 3, true);
});

test("[screenplay-page-quality] rejects flat dialogue without tactics", () => {
  const dialogue = [
    "The hallway got quiet after lunch.",
    "The clerk kept looking at the clock.",
    "The cameras were gone by three.",
    "Your sister's name stayed on the list.",
    "The old file was still on the bench.",
    "The night felt longer than yesterday.",
  ];
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. COURTHOUSE HALLWAY - DAY",
      "",
      "Mara keeps one hand on the evidence folder.",
      "",
      ...dialogue.flatMap((line, index) => [
        index % 2 === 0 ? "MARA" : "ELI",
        line,
        "",
      ]),
    ].join("\n"),
    lines: [
      { text: "INT. COURTHOUSE HALLWAY - DAY", element: "sceneHeading" },
      { text: "Mara keeps one hand on the evidence folder.", element: "action" },
      ...dialogue.flatMap((line, index) => [
        { text: index % 2 === 0 ? "MARA" : "ELI", element: "character" },
        { text: line, element: "dialogue" },
      ]),
    ],
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "flat_dialogue_no_tactics");
  assert.equal(quality.counts.dialogueTacticSignal, 0);
});

test("[screenplay-page-quality] accepts tactical character-specific dialogue", () => {
  const dialogue = [
    "They moved the hearing.",
    "No. They buried it.",
    "Then stop guarding the shovel.",
    "If I let go, your sister burns with mine.",
    "Good. Make the fire public.",
    "Unless you sign first, they call it grief.",
  ];
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. COURTHOUSE HALLWAY - DAY",
      "",
      "Mara palms the marina receipt until the ink splits.",
      "",
      ...dialogue.flatMap((line, index) => [
        index % 2 === 0 ? "MARA" : "ELI",
        line,
        "",
      ]),
      "Eli pushes the affidavit back across the bench.",
    ].join("\n"),
    lines: [
      { text: "INT. COURTHOUSE HALLWAY - DAY", element: "sceneHeading" },
      { text: "Mara palms the marina receipt until the ink splits.", element: "action" },
      ...dialogue.flatMap((line, index) => [
        { text: index % 2 === 0 ? "MARA" : "ELI", element: "character" },
        { text: line, element: "dialogue" },
      ]),
      { text: "Eli pushes the affidavit back across the bench.", element: "action" },
    ],
  });

  assert.equal(quality.ok, true);
  assert.equal(quality.counts.dialogueTacticSignal >= 4, true);
  assert.equal(quality.counts.dialogueReversalSignal >= 3, true);
});

test("[screenplay-page-quality] rejects long page runs with motion but too few scene turns", () => {
  const actions = [
    "Mara studies the courthouse directory under the clock, tracing the same docket number until the ink stains her thumb and the hallway thins around her.",
    "Eli walks beside the metal detector with his jacket folded over both arms, watching security mirrors catch every reporter near the west doors.",
    "The clerk copies case numbers into a ledger, slow and careful, while the public benches fill with families pretending not to listen.",
    "Mara scans the witness list again, keeping her pen against the margin as if the pressure of it can hold the whole day in place.",
  ];
  const dialogue = [
    "The hearing starts in ten.",
    "Then ten is generous.",
    "You keep saying that like time is a room we can leave.",
    "No. I keep saying it because you are still treating the door like a question.",
  ];
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. COURTHOUSE HALLWAY - DAY",
      "",
      actions[0],
      "",
      "MARA",
      dialogue[0],
      "",
      "ELI",
      dialogue[1],
      "",
      actions[1],
      "",
      actions[2],
      "",
      "MARA",
      dialogue[2],
      "",
      "ELI",
      dialogue[3],
      "",
      actions[3],
    ].join("\n"),
    lines: [
      { text: "INT. COURTHOUSE HALLWAY - DAY", element: "sceneHeading" },
      { text: actions[0], element: "action" },
      { text: "MARA", element: "character" },
      { text: dialogue[0], element: "dialogue" },
      { text: "ELI", element: "character" },
      { text: dialogue[1], element: "dialogue" },
      { text: actions[1], element: "action" },
      { text: actions[2], element: "action" },
      { text: "MARA", element: "character" },
      { text: dialogue[2], element: "dialogue" },
      { text: "ELI", element: "character" },
      { text: dialogue[3], element: "dialogue" },
      { text: actions[3], element: "action" },
    ],
    targetPages: 3,
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "thin_scene_turn_batch");
  assert.equal(quality.minimumSceneTurns, 2);
});

test("[screenplay-page-quality] accepts dialogue batches with concrete turns and subtext", () => {
  const dialogue = [
    "They moved the docket.",
    "To where?",
    "Basement courtroom. No phones. No press.",
    "That is not a room. That is a sinkhole.",
    "Then stop throwing me rope.",
    "I am throwing you a match.",
    "You light this, my sister burns too.",
    "No. She finally gets seen.",
  ];
  const action = [
    "Mara palms the marina receipt, folding it until the ink splits.",
    "Eli blocks the elevator with his briefcase before the doors can close.",
    "A bailiff tears the public docket from the wall and replaces it with a blank sheet.",
    "Mara slips the receipt under the blank sheet, leaving the marina stamp exposed.",
  ];
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. COURTHOUSE HALLWAY - DAY",
      "",
      action[0],
      "",
      "MARA",
      dialogue[0],
      "",
      "ELI",
      dialogue[1],
      "",
      action[1],
      "",
      "MARA",
      dialogue[2],
      "",
      "ELI",
      dialogue[3],
      "",
      action[2],
      "",
      "MARA",
      dialogue[4],
      "",
      "ELI",
      dialogue[5],
      "",
      "MARA",
      dialogue[6],
      "",
      "ELI",
      dialogue[7],
      "",
      action[3],
    ].join("\n"),
    lines: [
      { text: "INT. COURTHOUSE HALLWAY - DAY", element: "sceneHeading" },
      { text: action[0], element: "action" },
      ...dialogue.slice(0, 2).flatMap((line, index) => [
        { text: index % 2 === 0 ? "MARA" : "ELI", element: "character" },
        { text: line, element: "dialogue" },
      ]),
      { text: action[1], element: "action" },
      ...dialogue.slice(2, 4).flatMap((line, index) => [
        { text: index % 2 === 0 ? "MARA" : "ELI", element: "character" },
        { text: line, element: "dialogue" },
      ]),
      { text: action[2], element: "action" },
      ...dialogue.slice(4).flatMap((line, index) => [
        { text: index % 2 === 0 ? "MARA" : "ELI", element: "character" },
        { text: line, element: "dialogue" },
      ]),
      { text: action[3], element: "action" },
    ],
    targetPages: 2,
  });

  assert.equal(quality.ok, true);
  assert.equal(quality.counts.specificAction >= 3, true);
});

test("[screenplay-page-quality] accepts requested page runs with concrete scene turns", () => {
  const actions = [
    "Mara palms the marina receipt, folding it until the ink splits across the judge's signature.",
    "Eli blocks the elevator with his briefcase before the doors can close on the clerk.",
    "A bailiff tears the public docket from the wall and replaces it with a blank sheet.",
    "Mara slides the receipt under the blank sheet, leaving the marina stamp exposed for every reporter, then pushes the blank page toward the cameras before anyone can blink.",
  ];
  const dialogue = [
    "They moved the hearing.",
    "No. They buried it.",
    "Then stop guarding the shovel.",
    "If I let go, your sister burns with mine.",
    "Good.",
    "That is not what mercy sounds like.",
    "No. It is what a witness sounds like.",
  ];
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. COURTHOUSE HALLWAY - DAY",
      "",
      actions[0],
      "",
      "MARA",
      dialogue[0],
      "",
      "ELI",
      dialogue[1],
      "",
      actions[1],
      "",
      "MARA",
      dialogue[2],
      "",
      "ELI",
      dialogue[3],
      "",
      actions[2],
      "",
      "MARA",
      dialogue[4],
      "",
      "ELI",
      dialogue[5],
      "",
      "MARA",
      dialogue[6],
      "",
      actions[3],
    ].join("\n"),
    lines: [
      { text: "INT. COURTHOUSE HALLWAY - DAY", element: "sceneHeading" },
      { text: actions[0], element: "action" },
      { text: "MARA", element: "character" },
      { text: dialogue[0], element: "dialogue" },
      { text: "ELI", element: "character" },
      { text: dialogue[1], element: "dialogue" },
      { text: actions[1], element: "action" },
      { text: "MARA", element: "character" },
      { text: dialogue[2], element: "dialogue" },
      { text: "ELI", element: "character" },
      { text: dialogue[3], element: "dialogue" },
      { text: actions[2], element: "action" },
      { text: "MARA", element: "character" },
      { text: dialogue[4], element: "dialogue" },
      { text: "ELI", element: "character" },
      { text: dialogue[5], element: "dialogue" },
      { text: "MARA", element: "character" },
      { text: dialogue[6], element: "dialogue" },
      { text: actions[3], element: "action" },
    ],
    targetPages: 3,
  });

  assert.equal(quality.ok, true);
  assert.equal(quality.counts.turnEventAction >= 2, true);
});

test("[screenplay-page-quality] rejects Act I pages that dodge supplied commitment pressure", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. BUS STOP - MORNING",
      "",
      "Nina watches the buses cough past the curb.",
      "",
      "MOM",
      "You can still come home.",
      "",
      "Nina nods and stays where she is.",
    ].join("\n"),
    lines: [
      { text: "INT. BUS STOP - MORNING", element: "sceneHeading" },
      { text: "Nina watches the buses cough past the curb.", element: "action" },
      { text: "MOM", element: "character" },
      { text: "You can still come home.", element: "dialogue" },
      { text: "Nina nods and stays where she is.", element: "action" },
    ],
    featureContext: {
      act: "Act I",
      sceneObjective: "Nina must accept the dangerous audition and burn her safe day job.",
      currentBeat: "The audition address appears on the back of the eviction notice.",
      protagonistWant: "Keep her safe day job.",
    },
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "missing_act_one_commitment");
});

test("[screenplay-page-quality] accepts Act I pages that dramatize catalyst and commitment", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
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
    lines: [
      { text: "INT. BUS STOP - MORNING", element: "sceneHeading" },
      { text: "Nina folds the eviction notice until the audition address splits across the crease.", element: "action" },
      { text: "Her grocery-store name tag slides from her palm into a puddle.", element: "action" },
      { text: "MOM", element: "character" },
      { text: "You can still keep the safe job.", element: "dialogue" },
      { text: "NINA", element: "character" },
      { text: "Tell them I quit.", element: "dialogue" },
    ],
    featureContext: {
      act: "Act I",
      sceneObjective: "Nina must accept the dangerous audition and burn her safe day job.",
      currentBeat: "The audition address appears on the back of the eviction notice.",
      protagonistWant: "Keep her safe day job.",
    },
  });

  assert.equal(quality.ok, true);
});

test("[screenplay-page-quality] rejects Act II pages that dodge supplied reversal pressure", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "June and Marcus stand over the unmade bed.",
      "",
      "MARCUS",
      "We still have time.",
      "",
      "June turns away from him.",
    ].join("\n"),
    lines: [
      { text: "INT. MOTEL ROOM - NIGHT", element: "sceneHeading" },
      { text: "June and Marcus stand over the unmade bed.", element: "action" },
      { text: "MARCUS", element: "character" },
      { text: "We still have time.", element: "dialogue" },
      { text: "June turns away from him.", element: "action" },
    ],
    featureContext: {
      act: "Act II",
      featureSequence: "Midpoint Pressure",
      featureObligation: "The midpoint must turn victory into a trap.",
      currentBeat: "June realizes the marina receipt makes the public win a trap.",
      nextThreeTurns: ["The receipt exposes the win as bait."],
    },
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "missing_act_two_reversal");
});

test("[screenplay-page-quality] accepts Act II pages that dramatize midpoint trap pressure", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
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
    lines: [
      { text: "INT. MOTEL ROOM - NIGHT", element: "sceneHeading" },
      { text: "June spreads the marina receipt beside the victory photo.", element: "action" },
      { text: "The timestamp sits ten minutes after Marcus swore the dock was empty.", element: "action" },
      { text: "MARCUS", element: "character" },
      { text: "That receipt is our win.", element: "dialogue" },
      { text: "JUNE", element: "character" },
      { text: "No. It's bait.", element: "dialogue" },
      { text: "She turns the photo over. The motel clerk's number is written on the back.", element: "action" },
    ],
    featureContext: {
      act: "Act II",
      featureSequence: "Midpoint Pressure",
      featureObligation: "The midpoint must turn victory into a trap.",
      currentBeat: "June realizes the marina receipt makes the public win a trap.",
      nextThreeTurns: ["The receipt exposes the win as bait."],
    },
  });

  assert.equal(quality.ok, true);
});

test("[screenplay-page-quality] rejects feature pages that hit plot pressure but ignore supplied character arc", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
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
    lines: [
      { text: "INT. MOTEL ROOM - NIGHT", element: "sceneHeading" },
      { text: "June spreads the marina receipt beside the victory photo.", element: "action" },
      { text: "The timestamp sits ten minutes after Marcus swore the dock was empty.", element: "action" },
      { text: "MARCUS", element: "character" },
      { text: "That receipt is our win.", element: "dialogue" },
      { text: "JUNE", element: "character" },
      { text: "No. It's bait.", element: "dialogue" },
      { text: "She turns the photo over. The motel clerk's number is written on the back.", element: "action" },
    ],
    featureContext: {
      act: "Act II",
      featureSequence: "Midpoint Pressure",
      featureObligation: "The midpoint must turn victory into a trap.",
      currentBeat: "June realizes the marina receipt makes the public win a trap.",
      nextThreeTurns: ["The receipt exposes the win as bait."],
      characterArcState: "June has to choose public courage over private control.",
    },
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "missing_character_arc_pressure");
  assert.equal(quality.featureObligation.characterArcTokenCount > 0, true);
});

test("[screenplay-page-quality] rejects pages that ignore character bible arc memory", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. ARCHIVE ROOM - NIGHT",
      "",
      "Mara pins a fresh photograph beside the old case map.",
      "",
      "ELI",
      "We can wait.",
      "",
      "Mara pockets the file and turns off the lamp.",
    ].join("\n"),
    lines: [
      { text: "INT. ARCHIVE ROOM - NIGHT", element: "sceneHeading" },
      { text: "Mara pins a fresh photograph beside the old case map.", element: "action" },
      { text: "ELI", element: "character" },
      { text: "We can wait.", element: "dialogue" },
      { text: "Mara pockets the file and turns off the lamp.", element: "action" },
    ],
    featureContext: {
      characterArcMemory: {
        name: "Mara",
        bible: {
          arc: {
            act: "Act II",
            want: "expose the forged testimony",
            need: "stop hiding behind observation",
            falseBelief: "truth destroys anyone who says it aloud",
            currentTactic: "collecting evidence in silence",
            nextEmotionalTurn: "public courage",
          },
        },
      },
    },
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "missing_character_arc_memory");
  assert.equal(quality.featureObligation.featureActKind, "character_arc");
});

test("[screenplay-page-quality] accepts pages that spend character bible arc memory", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
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
    lines: [
      { text: "INT. ARCHIVE ROOM - NIGHT", element: "sceneHeading" },
      { text: "Mara lays the forged testimony across the evidence board.", element: "action" },
      { text: "Her notebook stays open in her palm, the last shelter of observation.", element: "action" },
      { text: "ELI", element: "character" },
      { text: "If the truth destroys anyone who says it aloud, let me be quiet with you.", element: "dialogue" },
      { text: "MARA", element: "character" },
      { text: "No. I have been collecting silence long enough.", element: "dialogue" },
      { text: "She opens the archive door, public courage shaking through her hand.", element: "action" },
    ],
    featureContext: {
      characterArcMemory: {
        name: "Mara",
        bible: {
          arc: {
            act: "Act II",
            want: "expose the forged testimony",
            need: "stop hiding behind observation",
            falseBelief: "truth destroys anyone who says it aloud",
            currentTactic: "collecting evidence in silence",
            nextEmotionalTurn: "public courage",
          },
        },
      },
    },
  });

  assert.equal(quality.ok, true);
  assert.equal(quality.featureObligation.featureActKind, "character_arc");
});

test("[screenplay-page-quality] rejects pages that ignore character voice fingerprints", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. COURTHOUSE HALLWAY - DAY",
      "",
      "Mara sets the folder between herself and Eli.",
      "",
      "MARA",
      "If the clerk moved it, we can still wait.",
      "",
      "MARA",
      "Tell Eli the hallway is clear.",
      "",
      "ELI",
      "Then move before the docket closes.",
    ].join("\n"),
    lines: [
      { text: "INT. COURTHOUSE HALLWAY - DAY", element: "sceneHeading" },
      { text: "Mara sets the folder between herself and Eli.", element: "action" },
      { text: "MARA", element: "character" },
      { text: "If the clerk moved it, we can still wait.", element: "dialogue" },
      { text: "MARA", element: "character" },
      { text: "Tell Eli the hallway is clear.", element: "dialogue" },
      { text: "ELI", element: "character" },
      { text: "Then move before the docket closes.", element: "dialogue" },
    ],
    featureContext: {
      characterVoiceMemory: {
        character: "MARA",
        voice_fingerprint: {
          tactics: ["refuses first", "weaponizes facts"],
          silence: "cuts lines short and lets silence carry threat",
          emotional_tells: ["family pressure slips out"],
        },
      },
    },
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "missing_character_voice_fingerprint");
  assert.equal(quality.featureObligation.characterVoiceFingerprintCoverage.character, "MARA");
});

test("[screenplay-page-quality] accepts pages that spend character voice fingerprints", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. COURTHOUSE HALLWAY - DAY",
      "",
      "Mara blocks the archive door with the signed affidavit.",
      "",
      "MARA",
      "No.",
      "",
      "MARA",
      "Not until you sign it.",
      "",
      "MARA",
      "Look at the receipt.",
      "",
      "ELI",
      "Mara, there is no clean version of this.",
      "",
      "MARA",
      "If I open that door, my sister burns with yours.",
      "",
      "Eli reaches for the knob. Mara keeps the receipt in his line of sight.",
    ].join("\n"),
    lines: [
      { text: "INT. COURTHOUSE HALLWAY - DAY", element: "sceneHeading" },
      { text: "Mara blocks the archive door with the signed affidavit.", element: "action" },
      { text: "MARA", element: "character" },
      { text: "No.", element: "dialogue" },
      { text: "MARA", element: "character" },
      { text: "Not until you sign it.", element: "dialogue" },
      { text: "MARA", element: "character" },
      { text: "Look at the receipt.", element: "dialogue" },
      { text: "ELI", element: "character" },
      { text: "Mara, there is no clean version of this.", element: "dialogue" },
      { text: "MARA", element: "character" },
      { text: "If I open that door, my sister burns with yours.", element: "dialogue" },
      { text: "Eli reaches for the knob. Mara keeps the receipt in his line of sight.", element: "action" },
    ],
    featureContext: {
      characterVoiceMemory: {
        character: "MARA",
        voice_fingerprint: {
          tactics: ["refuses first", "weaponizes facts"],
          silence: "cuts lines short and lets silence carry threat",
          emotional_tells: ["family pressure slips out"],
        },
      },
    },
  });

  assert.equal(quality.ok, true);
  assert.equal(quality.featureObligation.characterVoiceFingerprintCoverage.reason, "ok");
  assert.equal(
    quality.featureObligation.characterVoiceFingerprintCoverage.checked[0].matchedSignalCount >= 2,
    true
  );
});

test("[screenplay-page-quality] rejects feature continuations that dodge the first remembered next turn", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "June pins the victory photo above the marina receipt.",
      "The timestamp makes the trap look deliberate.",
      "",
      "MARCUS",
      "We got our victory.",
      "",
      "JUNE",
      "No. We got bait.",
    ].join("\n"),
    lines: [
      { text: "INT. MOTEL ROOM - NIGHT", element: "sceneHeading" },
      { text: "June pins the victory photo above the marina receipt.", element: "action" },
      { text: "The timestamp makes the trap look deliberate.", element: "action" },
      { text: "MARCUS", element: "character" },
      { text: "We got our victory.", element: "dialogue" },
      { text: "JUNE", element: "character" },
      { text: "No. We got bait.", element: "dialogue" },
    ],
    featureContext: {
      act: "Act II",
      featureSequence: "Midpoint Pressure",
      featureObligation: "The midpoint must turn victory into a trap.",
      currentBeat: "June realizes the marina receipt makes the public win a trap.",
      nextThreeTurns: ["The sister's voicemail reframes the cover-up."],
    },
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "missing_next_turn_continuation");
  assert.equal(quality.featureObligation.nextTurnCoverage.minimumMatches, 2);
});

test("[screenplay-page-quality] accepts feature continuations that spend the first remembered next turn", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. MOTEL ROOM - NIGHT",
      "",
      "June pins the victory photo above the marina receipt.",
      "The sister's voicemail crackles from Marcus's phone, turning the cover-up into a voice neither of them can bury.",
      "",
      "MARCUS",
      "We got our victory.",
      "",
      "JUNE",
      "No. We got bait.",
      "",
      "She rewinds the voicemail until the marina horn cuts through the room again.",
    ].join("\n"),
    lines: [
      { text: "INT. MOTEL ROOM - NIGHT", element: "sceneHeading" },
      { text: "June pins the victory photo above the marina receipt.", element: "action" },
      { text: "The sister's voicemail crackles from Marcus's phone, turning the cover-up into a voice neither of them can bury.", element: "action" },
      { text: "MARCUS", element: "character" },
      { text: "We got our victory.", element: "dialogue" },
      { text: "JUNE", element: "character" },
      { text: "No. We got bait.", element: "dialogue" },
      { text: "She rewinds the voicemail until the marina horn cuts through the room again.", element: "action" },
    ],
    featureContext: {
      act: "Act II",
      featureSequence: "Midpoint Pressure",
      featureObligation: "The midpoint must turn victory into a trap.",
      currentBeat: "June realizes the marina receipt makes the public win a trap.",
      nextThreeTurns: ["The sister's voicemail reframes the cover-up."],
    },
  });

  assert.equal(quality.ok, true);
  assert.deepEqual(
    quality.featureObligation.nextTurnCoverage.matchedTokens.filter((token) => ["sister", "voicemail", "cover-up"].includes(token)),
    ["sister", "voicemail", "cover-up"],
  );
});

test("[screenplay-page-quality] rejects continuations that dodge the richer next-scene execution brief", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
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
    lines: [
      { text: "INT. EDIT BAY - NIGHT", element: "sceneHeading" },
      { text: "Mara threads the warped reel through the Steenbeck.", element: "action" },
      { text: "On screen, the wrong memory stutters where the evidence should be.", element: "action" },
      { text: "MARCUS", element: "character" },
      { text: "That's not what we shot.", element: "dialogue" },
      { text: "MARA", element: "character" },
      { text: "No. That's what someone wanted remembered.", element: "dialogue" },
    ],
    featureContext: {
      act: "Act II",
      featureSequence: "Reversal Fallout",
      featureObligation: "The reel plays the wrong memory and turns evidence into a trap.",
      nextThreeTurns: [
        "The reel plays the wrong memory.",
        "Marcus forces a public choice.",
      ],
      unresolvedStoryThreads: ["The locked archive door blocks Mara."],
      characterArcTurns: ["Mara stops cutting around her guilt."],
      actThreePayoffPath: ["The fixer is exposed by the public splice."],
      imageMotifs: ["projector flare"],
    },
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "missing_next_scene_execution_brief");
  assert.equal(quality.featureObligation.executionBriefCoverage.minimumSupportFields, 3);
});

test("[screenplay-page-quality] accepts continuations that execute the next-scene brief lanes", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
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
    lines: [
      { text: "INT. EDIT BAY - NIGHT", element: "sceneHeading" },
      { text: "Mara threads the warped reel through the Steenbeck.", element: "action" },
      { text: "On screen, the wrong memory stutters where the evidence should be.", element: "action" },
      { text: "The locked archive door rattles under someone's fist.", element: "action" },
      { text: "MARCUS", element: "character" },
      { text: "If you say this in public, you don't get to take it back.", element: "dialogue" },
      { text: "MARA", element: "character" },
      { text: "Then stop cutting around my guilt.", element: "dialogue" },
      { text: "She lifts the splice marker and writes FIXER across the frame.", element: "action" },
      { text: "A projector flare washes the room white as Marcus opens the door to the crowd.", element: "action" },
    ],
    featureContext: {
      act: "Act II",
      featureSequence: "Reversal Fallout",
      featureObligation: "The reel plays the wrong memory and turns evidence into a trap.",
      nextThreeTurns: [
        "The reel plays the wrong memory.",
        "Marcus forces a public choice.",
      ],
      unresolvedStoryThreads: ["The locked archive door blocks Mara."],
      characterArcTurns: ["Mara stops cutting around her guilt."],
      actThreePayoffPath: ["The fixer is exposed by the public splice."],
      imageMotifs: ["projector flare"],
    },
  });

  assert.equal(quality.ok, true);
  assert.deepEqual(
    quality.featureObligation.executionBriefCoverage.matchedSupportFieldNames,
    ["obstacle", "arc", "payoff", "image", "exit"],
  );
});

test("[screenplay-page-quality] rejects Act III pages that dodge supplied payoff obligations", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. COURTHOUSE - NIGHT",
      "",
      "Mara steps into the center aisle and looks at everyone.",
      "",
      "ELI",
      "It's over.",
      "",
      "Mara takes a breath.",
    ].join("\n"),
    lines: [
      { text: "INT. COURTHOUSE - NIGHT", element: "sceneHeading" },
      { text: "Mara steps into the center aisle and looks at everyone.", element: "action" },
      { text: "ELI", element: "character" },
      { text: "It's over.", element: "dialogue" },
      { text: "Mara takes a breath.", element: "action" },
    ],
    featureContext: {
      act: "Act III",
      pageCount: 100,
      targetPages: 110,
      characterArcState: "Mara can only win by choosing public truth over private control.",
      endingImage: "The empty pool filled with rainwater at dawn.",
      actThreePayoffPath: [
        "The sister's voicemail becomes testimony.",
        "The broken microphone becomes the public proof.",
      ],
      unresolvedSetups: [
        "The buried first report has not been exposed.",
      ],
    },
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "missing_act_three_payoff");
});

test("[screenplay-page-quality] accepts Act III pages that pay off setup through changed behavior", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
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
    lines: [
      { text: "INT. COURTHOUSE - NIGHT", element: "sceneHeading" },
      { text: "Mara sets the cracked phone beside the dead microphone.", element: "action" },
      { text: "The sister's voicemail crackles through the courtroom speakers, thin and undeniable.", element: "action" },
      { text: "MARA", element: "character" },
      { text: "I buried the report because I thought protecting her meant owning the truth alone.", element: "dialogue" },
      { text: "She pushes the microphone toward the witness table instead of pulling it back.", element: "action" },
      { text: "Beyond the courthouse glass, rainwater trembles in the empty pool.", element: "action" },
    ],
    featureContext: {
      act: "Act III",
      pageCount: 100,
      targetPages: 110,
      characterArcState: "Mara can only win by choosing public truth over private control.",
      endingImage: "The empty pool filled with rainwater at dawn.",
      actThreePayoffPath: [
        "The sister's voicemail becomes testimony.",
        "The broken microphone becomes the public proof.",
      ],
      unresolvedSetups: [
        "The buried first report has not been exposed.",
      ],
    },
  });

  assert.equal(quality.ok, true);
});

test("[screenplay-page-quality] rejects long page batches without enough concrete page turns", () => {
  const dialogue = [
    "The docket moved again, which means somebody wanted every witness tired before the doors even opened.",
    "Then stop treating the hallway like a waiting room and start treating it like the scene of the crime.",
    "If I push before the clerk signs, the judge buries the file and calls my panic a conflict.",
    "If you wait, the file disappears under a cleaner stamp and your sister becomes a footnote.",
    "You say that like the footnote does not still have my name on it.",
    "I say it because your name is the only thing they cannot shred without everyone noticing.",
    "You always make courage sound cheap when I am the one paying for it.",
    "And you always make control sound holy when it is just fear wearing your coat.",
    "There are three cameras, one locked stairwell, and a clerk who suddenly forgot how to read her own stamp.",
    "Then give the cameras something cleaner than fear to remember when this hallway becomes the only record left.",
  ];
  const actions = [
    "Mara folds the marina receipt until the ink splits across the case number.",
    "Eli wedges his briefcase between the elevator doors before they can close.",
    "A clerk replaces the public docket with a blank sheet and pockets the signed copy.",
  ];
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. COURTHOUSE HALLWAY - DAY",
      "",
      actions[0],
      "",
      "MARA",
      dialogue[0],
      "",
      "ELI",
      dialogue[1],
      "",
      actions[1],
      "",
      "MARA",
      dialogue[2],
      "",
      "ELI",
      dialogue[3],
      "",
      actions[2],
      "",
      "MARA",
      dialogue[4],
      "",
      "ELI",
      dialogue[5],
      "",
      "MARA",
      dialogue[6],
      "",
      "ELI",
      dialogue[7],
      "",
      "MARA",
      dialogue[8],
      "",
      "ELI",
      dialogue[9],
    ].join("\n"),
    lines: [
      { text: "INT. COURTHOUSE HALLWAY - DAY", element: "sceneHeading" },
      { text: actions[0], element: "action" },
      ...dialogue.slice(0, 2).flatMap((line, index) => [
        { text: index % 2 === 0 ? "MARA" : "ELI", element: "character" },
        { text: line, element: "dialogue" },
      ]),
      { text: actions[1], element: "action" },
      ...dialogue.slice(2, 4).flatMap((line, index) => [
        { text: index % 2 === 0 ? "MARA" : "ELI", element: "character" },
        { text: line, element: "dialogue" },
      ]),
      { text: actions[2], element: "action" },
      ...dialogue.slice(4).flatMap((line, index) => [
        { text: index % 2 === 0 ? "MARA" : "ELI", element: "character" },
        { text: line, element: "dialogue" },
      ]),
    ],
    targetPages: 5,
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "thin_long_page_batch");
  assert.equal(quality.minimumSpecificActions, 4);
});

test("[screenplay-page-quality] rejects summary-like long page batches masquerading as pages", () => {
  const actions = [
    "Over the next few pages, Mara follows the clerk through the courthouse and realizes the docket has been rewritten twice.",
    "The scene shows Mara confronting Eli while the public hallway keeps filling with reporters and family members.",
    "A series of moments reveals the judge's aide moving the sealed affidavit from one folder to another.",
    "Mara decides to stop waiting for permission as the elevator doors open on the wrong floor.",
  ];
  const dialogue = [
    "If the docket moved, somebody touched it after midnight.",
    "Then stop reading the lie and make them sign their name to it.",
    "You always make public courage sound like paperwork.",
    "And you always make fear sound like procedure.",
    "The clerk is watching us.",
    "Good. Give her something worth remembering.",
  ];
  const quality = evaluateScreenplayPageQuality({
    text: [
      "INT. COURTHOUSE HALLWAY - DAY",
      "",
      actions[0],
      "",
      "MARA",
      dialogue[0],
      "",
      "ELI",
      dialogue[1],
      "",
      actions[1],
      "",
      "MARA",
      dialogue[2],
      "",
      "ELI",
      dialogue[3],
      "",
      actions[2],
      "",
      "MARA",
      dialogue[4],
      "",
      "ELI",
      dialogue[5],
      "",
      actions[3],
    ].join("\n"),
    lines: [
      { text: "INT. COURTHOUSE HALLWAY - DAY", element: "sceneHeading" },
      { text: actions[0], element: "action" },
      { text: "MARA", element: "character" },
      { text: dialogue[0], element: "dialogue" },
      { text: "ELI", element: "character" },
      { text: dialogue[1], element: "dialogue" },
      { text: actions[1], element: "action" },
      { text: "MARA", element: "character" },
      { text: dialogue[2], element: "dialogue" },
      { text: "ELI", element: "character" },
      { text: dialogue[3], element: "dialogue" },
      { text: actions[2], element: "action" },
      { text: "MARA", element: "character" },
      { text: dialogue[4], element: "dialogue" },
      { text: "ELI", element: "character" },
      { text: dialogue[5], element: "dialogue" },
      { text: actions[3], element: "action" },
    ],
    targetPages: 3,
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "summary_like_page_batch");
  assert.equal(quality.counts.summaryLikeAction >= 2, true);
});

test("[screenplay-page-quality] requires screenplay shape when no trusted anchor exists", () => {
  const quality = evaluateScreenplayPageQuality({
    text: "June folds the receipt into a white square.",
    lines: [
      { text: "June folds the receipt into a white square.", element: "action" },
    ],
  });

  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "missing_screenplay_shape");
});

test("[screenplay-page-quality] allows anchored action-only continuations with enough playable content", () => {
  const quality = evaluateScreenplayPageQuality({
    text: [
      "June folds the receipt into a white square.",
      "The motel sign flickers out behind her.",
    ].join("\n"),
    lines: [
      { text: "June folds the receipt into a white square.", element: "action" },
      { text: "The motel sign flickers out behind her.", element: "action" },
    ],
    hasSceneAnchor: true,
  });

  assert.equal(quality.ok, true);
});

test("[screenplay-page-quality] protects dialogue lines from prose artifact heuristics", () => {
  assert.equal(
    isLikelyOutlineOrCraftArtifactLine("I would burn the whole town down first.", "dialogue"),
    false,
  );
  assert.equal(
    isLikelyOutlineOrCraftArtifactLine("I would make this scene more tense.", "action"),
    true,
  );
});

test("[screenplay-page-quality] identifies placeholders and low-signal action without flagging specific action", () => {
  assert.equal(isLikelyPlaceholderScreenplayLine("CHARACTER A", "character"), true);
  assert.equal(isLikelyPlaceholderScreenplayLine("Dialogue line.", "dialogue"), true);
  assert.equal(isLowSignalActionLine("They keep talking in the room.", "action"), true);
  assert.equal(isLowSignalActionLine("A silence stretches between them.", "action"), true);
  assert.equal(isLowSignalActionLine("The truth hangs between them.", "action"), true);
  assert.equal(isSummaryLikeActionLine("Over the next few pages, June realizes the receipt was bait.", "action"), true);
  assert.equal(
    isLowSignalActionLine("June folds the receipt into a white square.", "action"),
    false,
  );
});

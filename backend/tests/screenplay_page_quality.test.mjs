import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateScreenplayPageQuality,
  isLikelyOutlineOrCraftArtifactLine,
  isLikelyPlaceholderScreenplayLine,
  isLowSignalActionLine,
  isLowSubtextDialogueLine,
  minimumExpectedWordsForRequestedPages,
} from "../lib/screenplay_page_quality.js";

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
  assert.equal(minimumExpectedWordsForRequestedPages(8), 350);
  assert.equal(minimumExpectedWordsForRequestedPages(30), 420);
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
  assert.equal(
    isLowSignalActionLine("June folds the receipt into a white square.", "action"),
    false,
  );
});

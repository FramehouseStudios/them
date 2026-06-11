import assert from "node:assert/strict";
import { test } from "node:test";

import {
  looksLikeScreenplayChatDriftLine,
  looksLikeScreenplayOutputStarterLine,
  looksLikeScreenplayStrategyLeadInLine,
  normalizeScreenplayOutputContractText,
} from "../lib/screenplay_output_contract.js";

test("screenplay output contract strips chat preamble before scene heading", () => {
  const input = [
    "Absolutely - here's the continuation.",
    "",
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June studies the receipt."
  ].join("\n");

  const output = normalizeScreenplayOutputContractText(input);
  assert.equal(output.startsWith("INT. MOTEL ROOM - NIGHT"), true);
  assert.equal(output.includes("Absolutely"), false);
});

test("screenplay output contract strips trailing conversational drift", () => {
  const input = [
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June studies the receipt.",
    "",
    "Want me to keep going?"
  ].join("\n");

  const output = normalizeScreenplayOutputContractText(input);
  assert.equal(output, [
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June studies the receipt."
  ].join("\n"));
});

test("screenplay output contract preserves action before the first cue", () => {
  const input = [
    "June studies the receipt.",
    "",
    "MARCUS",
    "Stay."
  ].join("\n");

  assert.equal(normalizeScreenplayOutputContractText(input), input);
});

test("screenplay output contract preserves action-only continuation without drift", () => {
  const input = [
    "June reaches for the door.",
    "The light dies."
  ].join("\n");

  assert.equal(normalizeScreenplayOutputContractText(input), input);
});

test("screenplay output contract removes markdown code fences", () => {
  const input = [
    "```screenplay",
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June studies the receipt.",
    "```"
  ].join("\n");

  assert.equal(normalizeScreenplayOutputContractText(input), [
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June studies the receipt."
  ].join("\n"));
});

test("screenplay output contract strips page strategy notes before Fountain pages", () => {
  const input = [
    "One strategy note: let the receipt become the trap, not exposition.",
    "The scene needs one irreversible turn before anyone explains the clue.",
    "",
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it."
  ].join("\n");

  assert.equal(normalizeScreenplayOutputContractText(input), [
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it."
  ].join("\n"));
});

test("screenplay output contract strips echoed page velocity labels before pages", () => {
  const input = [
    "Page velocity: first line should be page text.",
    "Output contract: playable Fountain only.",
    "",
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it."
  ].join("\n");

  assert.equal(normalizeScreenplayOutputContractText(input), [
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it."
  ].join("\n"));
});

test("screenplay output contract strips markdown headings, labels, and dividers before pages", () => {
  const input = [
    "## Screenplay Pages",
    "---",
    "Here are the next pages:",
    "",
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it."
  ].join("\n");

  assert.equal(normalizeScreenplayOutputContractText(input), [
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it."
  ].join("\n"));
});

test("screenplay output contract strips trailing craft afterwords after pages", () => {
  const input = [
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
    "Want me to keep going from here?"
  ].join("\n");

  assert.equal(normalizeScreenplayOutputContractText(input), [
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it."
  ].join("\n"));
});

test("screenplay output contract strips craft paragraphs between screenplay blocks", () => {
  const input = [
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "Why this works:",
    "This keeps the scene under pressure before the reveal.",
    "",
    "EXT. MOTEL BALCONY - DAWN",
    "",
    "June steps into the gray morning."
  ].join("\n");

  assert.equal(normalizeScreenplayOutputContractText(input), [
    "INT. MOTEL ROOM - NIGHT",
    "",
    "June folds the receipt into a white square.",
    "",
    "EXT. MOTEL BALCONY - DAWN",
    "",
    "June steps into the gray morning."
  ].join("\n"));
});

test("screenplay output contract preserves dialogue that looks like a conversational offer", () => {
  const input = [
    "INT. MOTEL ROOM - NIGHT",
    "",
    "MARCUS",
    "Want me to go?",
    "",
    "June does not answer."
  ].join("\n");

  assert.equal(normalizeScreenplayOutputContractText(input), input);
});

test("screenplay output contract preserves action-only text before a dialogue cue", () => {
  const input = [
    "June folds the receipt into a white square.",
    "",
    "MARCUS",
    "You kept it."
  ].join("\n");

  assert.equal(normalizeScreenplayOutputContractText(input), input);
});

test("screenplay output starter and drift classifiers stay conservative", () => {
  assert.equal(looksLikeScreenplayOutputStarterLine("INT. MOTEL ROOM - NIGHT"), true);
  assert.equal(looksLikeScreenplayOutputStarterLine("MARCUS", "Stay."), true);
  assert.equal(looksLikeScreenplayChatDriftLine("Want me to keep going?"), true);
  assert.equal(looksLikeScreenplayChatDriftLine("Screenplay Pages:"), true);
  assert.equal(looksLikeScreenplayChatDriftLine("END SCENE."), true);
  assert.equal(looksLikeScreenplayStrategyLeadInLine("One strategy note: start on the door."), true);
  assert.equal(looksLikeScreenplayStrategyLeadInLine("Page velocity: start on the door."), true);
  assert.equal(looksLikeScreenplayStrategyLeadInLine("The scene needs one irreversible turn."), true);
  assert.equal(looksLikeScreenplayStrategyLeadInLine("This keeps the scene under pressure."), true);
  assert.equal(looksLikeScreenplayStrategyLeadInLine("June studies the receipt."), false);
  assert.equal(looksLikeScreenplayChatDriftLine("Where were you?"), false);
});

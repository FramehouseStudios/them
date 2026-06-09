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
  assert.equal(looksLikeScreenplayStrategyLeadInLine("One strategy note: start on the door."), true);
  assert.equal(looksLikeScreenplayStrategyLeadInLine("The scene needs one irreversible turn."), true);
  assert.equal(looksLikeScreenplayStrategyLeadInLine("June studies the receipt."), false);
  assert.equal(looksLikeScreenplayChatDriftLine("Where were you?"), false);
});

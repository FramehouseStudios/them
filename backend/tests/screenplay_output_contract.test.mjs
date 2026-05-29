import assert from "node:assert/strict";
import { test } from "node:test";

import {
  looksLikeScreenplayChatDriftLine,
  looksLikeScreenplayOutputStarterLine,
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

test("screenplay output starter and drift classifiers stay conservative", () => {
  assert.equal(looksLikeScreenplayOutputStarterLine("INT. MOTEL ROOM - NIGHT"), true);
  assert.equal(looksLikeScreenplayOutputStarterLine("MARCUS", "Stay."), true);
  assert.equal(looksLikeScreenplayChatDriftLine("Want me to keep going?"), true);
  assert.equal(looksLikeScreenplayChatDriftLine("Where were you?"), false);
});

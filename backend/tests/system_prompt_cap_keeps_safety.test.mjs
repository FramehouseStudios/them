import assert from "node:assert/strict";
import test from "node:test";

import { capSystemPromptKeepingSafety } from "../lib/system_prompt_trim.js";
import { normalizeSnippet } from "../lib/utils.js";

const SAFETY = "<clementine_safety_contract>truthfulness: no fabrication. real-world harm boundary: never give instructions for hurting a real person. safety redirection: if a request is about real-life harm, slow down and point to help.</clementine_safety_contract>";
const opts = { normalize: normalizeSnippet };

test("[prompt-cap] under the cap the prompt is exactly what the old head cut produced", () => {
  const prompt = `You are Clementine.\n\nWrite pages.\n${SAFETY}`;
  assert.equal(capSystemPromptKeepingSafety(prompt, 16_000, opts), normalizeSnippet(prompt, 16_000));
});

test("[prompt-cap] over the cap the safety contract survives whole and the result fits", () => {
  // Seen 2026-09-28: a 16,000-char cap cut the contract mid-sentence.
  const prompt = `${"Draft context line. ".repeat(1200)}\n${SAFETY}`;
  const old = normalizeSnippet(prompt, 16_000);
  assert.ok(!old.includes("</clementine_safety_contract>"), "the old cut lost the end of the contract");
  const capped = capSystemPromptKeepingSafety(prompt, 16_000, opts);
  assert.ok(capped.length <= 16_000, `length ${capped.length}`);
  assert.ok(capped.includes(normalizeSnippet(SAFETY, 10_000)), "contract kept whole");
  assert.ok(capped.startsWith("Draft context line."), "the rest is trimmed from its end, as before");
});

test("[prompt-cap] a prompt without a safety contract is cut as before", () => {
  const prompt = "x ".repeat(20_000);
  assert.equal(capSystemPromptKeepingSafety(prompt, 16_000, opts), normalizeSnippet(prompt, 16_000));
});

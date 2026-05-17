#!/usr/bin/env node
//
// T-format-linter-rules-canon-eval — pin the canonical rule_id set,
// severity vocabulary, and envelope shape of lintScreenplay().
//
// iOS T28 (format-lint Studio cards) reads each `rule` string and
// renders a card with that ID as the dedupe / dismiss key. A
// silent rename or drop of any rule would regress every iOS
// consumer at once and would also break any logged analytics
// counting suggestions by rule.

import process from "node:process";

import { lintScreenplay } from "../lib/format_linter.js";

let allOK = true;
function check(label, cond, detail = "") {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    allOK = false;
    console.error(`FAIL  ${label}${detail ? `\n  ${detail}` : ""}`);
  }
}

// Mirror of the rule IDs in lib/format_linter.js. Adding a new rule
// is a deliberate change — update this list and the iOS consumer
// in the same PR.
const CANONICAL_RULES = new Set([
  "scene_heading_shape",
  "character_cue_caps",
  "parenthetical_density",
  "parenthetical_count",
  "action_voice_present",
  "action_adverb_density",
  "page_economy_overlong",
  "blank_lines_around_headings",
]);

const ALLOWED_SEVERITIES = new Set(["hard", "medium", "soft"]);

// A fixture deliberately designed to trip multiple rules so we get
// a healthy spread of suggestions in the output.
const NOISY_FIXTURE = `int. kitchen night
JUNE sits at the table. she was eating loudly and definitely angrily.
(softly)
(loudly)
(carefully)
JUNE
(softly)
You very quickly definitely surely abruptly walk out.
She left, walked, ran, fell, and turned dramatically dramatically dramatically.
`;

// Envelope shape — empty input.
const empty = lintScreenplay({ text: "" });
check("empty input → schemaVersion === 1", empty?.schemaVersion === 1);
check("empty input → ruleSetVersion is a string", typeof empty?.ruleSetVersion === "string" && empty.ruleSetVersion.length > 0);
check("empty input → totalSuggestions is 0", empty?.totalSuggestions === 0);
check("empty input → suggestions is empty array", Array.isArray(empty?.suggestions) && empty.suggestions.length === 0);
check("empty input → bySeverity has hard/medium/soft", empty?.bySeverity && "hard" in empty.bySeverity && "medium" in empty.bySeverity && "soft" in empty.bySeverity);

// Envelope shape — noisy input.
const r = lintScreenplay({ text: NOISY_FIXTURE });
check("noisy input → schemaVersion === 1", r?.schemaVersion === 1);
check(
  `noisy input → totalSuggestions matches suggestions.length (got ${r?.totalSuggestions} vs ${r?.suggestions?.length})`,
  r?.totalSuggestions === r?.suggestions?.length,
);
check(
  `noisy input → at least 3 suggestions (got ${r?.suggestions?.length})`,
  Array.isArray(r?.suggestions) && r.suggestions.length >= 3,
);

// Per-suggestion shape.
const seenRules = new Set();
for (const s of r?.suggestions || []) {
  const label = `suggestion@line${s.line ?? "?"}/${s.rule ?? "?"}`;
  check(`${label}: rule is a string`, typeof s.rule === "string" && s.rule.length > 0);
  check(`${label}: rule ∈ canonical set`, CANONICAL_RULES.has(s.rule), `unknown rule: ${s.rule}`);
  check(`${label}: severity ∈ {hard, medium, soft}`, ALLOWED_SEVERITIES.has(s.severity), `got ${s.severity}`);
  check(`${label}: line is a positive integer`, Number.isInteger(s.line) && s.line >= 1);
  check(`${label}: message is non-empty string`, typeof s.message === "string" && s.message.length > 0);
  if (s.rule) seenRules.add(s.rule);
}

// bySeverity total matches sum.
const sevSum = (r?.bySeverity?.hard || 0) + (r?.bySeverity?.medium || 0) + (r?.bySeverity?.soft || 0);
check(
  `bySeverity sums to totalSuggestions (got ${sevSum} vs ${r?.totalSuggestions})`,
  sevSum === r?.totalSuggestions,
);

// Suggestions are sorted by line ascending.
const lines = (r?.suggestions || []).map((s) => s.line);
for (let i = 1; i < lines.length; i += 1) {
  check(`suggestion order: line[${i-1}] <= line[${i}]`, lines[i-1] <= lines[i]);
}

// Determinism: same input → same output.
const a = lintScreenplay({ text: NOISY_FIXTURE });
const b = lintScreenplay({ text: NOISY_FIXTURE });
check("determinism: same input → same totalSuggestions", a.totalSuggestions === b.totalSuggestions);
check("determinism: same input → same suggestion order", JSON.stringify(a.suggestions) === JSON.stringify(b.suggestions));

if (!allOK) {
  console.error("format linter canon eval: FAILED");
  process.exit(1);
}
console.log(`format linter canon eval: OK (${seenRules.size} of ${CANONICAL_RULES.size} canonical rules exercised by the fixture)`);

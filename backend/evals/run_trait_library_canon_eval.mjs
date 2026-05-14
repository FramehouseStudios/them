#!/usr/bin/env node
//
// T-trait-library-canon-eval — pin the canonical trait keyword set
// and structural caps exported by lib/trait_library.js.
//
// PR T-trait-library introduces TRAIT_KEYWORDS as a frozen list
// that extractTraits matches against. Adding or removing a keyword
// changes how every existing character record gets re-classified
// next time their traits are re-merged. iOS surfaces these labels
// directly. A silent change would silently re-classify the user's
// entire character roster.
//
// This eval pins:
//   - TRAIT_KEYWORDS is Object.freeze'd
//   - the exact set of canonical keywords on main
//   - the structural caps (VOCAB_MAX, KEYWORD_MAX, GOALS_MAX,
//     RELATIONSHIPS_MAX) and SCHEMA_VERSION
//   - extractTraits returns the canonical envelope shape
//
// Determinism: this eval is deterministic — it reads only frozen
// canon constants / pure functions and asserts the same output
// shape on every run. Same input always produces the same output
// set; no clocks, no random ids, no network.
//

import process from "node:process";
import {
  TRAIT_KEYWORDS,
  TRAIT_SCHEMA_VERSION,
  VOCAB_MAX,
  KEYWORD_MAX,
  GOALS_MAX,
  RELATIONSHIPS_MAX,
  extractTraits,
} from "../lib/trait_library.js";

let allOK = true;
function check(label, cond, detail = "") {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    allOK = false;
    console.error(`FAIL  ${label}${detail ? `\n  ${detail}` : ""}`);
  }
}

// Snapshot of the keyword set as of PR #160's review. Adding a new
// trait keyword is a deliberate change — update this list and the
// iOS consumer in the same PR.
const CANONICAL_KEYWORDS = new Set([
  "anxious", "calm", "fierce", "loyal", "stoic", "wry", "earnest",
  "cynical", "tender", "guarded", "impulsive", "patient", "weary",
  "ambitious", "haunted", "playful", "stern", "ruthless",
  "vulnerable", "righteous", "skeptical", "warm", "cold",
]);

check("TRAIT_KEYWORDS is frozen", Object.isFrozen(TRAIT_KEYWORDS));
check(
  "TRAIT_KEYWORDS is a non-empty array",
  Array.isArray(TRAIT_KEYWORDS) && TRAIT_KEYWORDS.length > 0,
);

const actual = new Set(TRAIT_KEYWORDS);
const missing = [...CANONICAL_KEYWORDS].filter((k) => !actual.has(k));
const extra = [...actual].filter((k) => !CANONICAL_KEYWORDS.has(k));
check(
  "TRAIT_KEYWORDS matches the canonical set",
  missing.length === 0 && extra.length === 0,
  `missing: [${missing.join(", ")}] extra: [${extra.join(", ")}]`,
);

for (const kw of TRAIT_KEYWORDS) {
  check(
    `keyword "${kw}" is lowercase a-z only`,
    /^[a-z]+$/.test(kw),
  );
}

// Structural caps.
check("TRAIT_SCHEMA_VERSION === 1", TRAIT_SCHEMA_VERSION === 1);
check("VOCAB_MAX is a positive integer", Number.isInteger(VOCAB_MAX) && VOCAB_MAX > 0);
check("KEYWORD_MAX is a positive integer", Number.isInteger(KEYWORD_MAX) && KEYWORD_MAX > 0);
check("GOALS_MAX is a positive integer", Number.isInteger(GOALS_MAX) && GOALS_MAX > 0);
check("RELATIONSHIPS_MAX is a positive integer", Number.isInteger(RELATIONSHIPS_MAX) && RELATIONSHIPS_MAX > 0);

// extractTraits envelope shape on empty input.
const empty = extractTraits({ lines: [] });
check(
  "extractTraits({}) returns an object with schemaVersion",
  empty && typeof empty === "object" && empty.schemaVersion === TRAIT_SCHEMA_VERSION,
);
for (const k of ["vocabulary", "keywords", "goals", "relationships", "speech_style"]) {
  check(`extractTraits envelope has \`${k}\` field`, Object.prototype.hasOwnProperty.call(empty, k));
}

if (!allOK) {
  console.error("trait library canon eval: FAILED");
  process.exit(1);
}
console.log("trait library canon eval: OK");

#!/usr/bin/env node
//
// T-archetype-engine-canon-eval — pin the canonical archetype set
// and the structural shape of each entry in `ARCHETYPES`.
//
// PR #91 / T-archetype-engine ships the classifier; iOS (T48) reads
// the resulting labels and renders archetype tags. A silent
// rename (`hero` → `protagonist`) or drop of any archetype would
// regress every iOS consumer at once. This eval pins the canonical
// list + the shape of each entry.
//
// Determinism: this eval is deterministic — it reads only frozen
// canon constants / pure functions and asserts the same output
// shape on every run. Same input always produces the same output
// set; no clocks, no random ids, no network.
//

import process from "node:process";
import { ARCHETYPES } from "../lib/archetype_engine.js";

let allOK = true;
function check(label, cond, detail = "") {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    allOK = false;
    console.error(`FAIL  ${label}${detail ? `\n  ${detail}` : ""}`);
  }
}

const CANONICAL_ARCHETYPES = [
  "hero",
  "mentor",
  "shadow",
  "trickster",
  "ally",
  "herald",
  "threshold_guardian",
  "shapeshifter",
];

const REQUIRED_FIELDS = [
  "traitKeywords",
  "emotionalDefaults",
  "tags",
  "relationshipFragments",
  "minSceneShare",
  "weight",
];

check("ARCHETYPES is frozen", Object.isFrozen(ARCHETYPES));

const actualKeys = Object.keys(ARCHETYPES).sort();
const expectedKeys = [...CANONICAL_ARCHETYPES].sort();
check(
  "ARCHETYPES contains exactly the canonical set",
  JSON.stringify(actualKeys) === JSON.stringify(expectedKeys),
  `actual:   ${actualKeys.join(", ")}\nexpected: ${expectedKeys.join(", ")}`,
);

for (const a of CANONICAL_ARCHETYPES) {
  const entry = ARCHETYPES[a];
  check(`${a}: entry exists`, !!entry);
  if (!entry) continue;
  for (const f of REQUIRED_FIELDS) {
    check(`${a}.${f} present`, entry[f] !== undefined);
  }
  check(
    `${a}.traitKeywords is non-empty array`,
    Array.isArray(entry.traitKeywords) && entry.traitKeywords.length > 0,
  );
  check(
    `${a}.emotionalDefaults is non-empty array`,
    Array.isArray(entry.emotionalDefaults) && entry.emotionalDefaults.length > 0,
  );
  check(
    `${a}.tags is non-empty array`,
    Array.isArray(entry.tags) && entry.tags.length > 0,
  );
  check(
    `${a}.minSceneShare in [0, 1]`,
    Number.isFinite(entry.minSceneShare) && entry.minSceneShare >= 0 && entry.minSceneShare <= 1,
  );
  check(
    `${a}.weight is a finite positive number`,
    Number.isFinite(entry.weight) && entry.weight > 0,
  );
}

// Cross-archetype hygiene checks: tag uniqueness within each
// archetype's own list (no dupes), and lowercase canonical labels.
for (const a of CANONICAL_ARCHETYPES) {
  check(`${a}: label is lowercase snake_case`, /^[a-z][a-z0-9_]*$/.test(a));
  const entry = ARCHETYPES[a];
  if (!entry) continue;
  const tagSet = new Set(entry.tags);
  check(`${a}.tags has no duplicates`, tagSet.size === entry.tags.length);
}

if (!allOK) {
  console.error("archetype canon eval: FAILED");
  process.exit(1);
}
console.log("archetype canon eval: OK");

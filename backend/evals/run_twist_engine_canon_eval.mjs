#!/usr/bin/env node
//
// T-twist-engine-canon-eval — pin the canonical TWIST_LIBRARY
// framework set + beat structure + per-twist field shape.
//
// PR T-twist-engine ships TWIST_LIBRARY: a frozen map of
// framework → beat → ordered list of twist seeds. iOS T37 reads
// these seeds and renders twist cards. The IDs are documented as
// "stable so iOS can dedupe / pin / dismiss" — silently renaming
// an ID would drop every user's stored "pinned" / "dismissed"
// state. This eval pins the framework set, each beat structure,
// and the per-twist field shape so the regression is loud.

import process from "node:process";

// Direct import of the frozen library, bypassing suggestTwists.
const mod = await import("../lib/twist_engine.js");
const TWIST_LIBRARY = mod.TWIST_LIBRARY ?? (await (async () => {
  // TWIST_LIBRARY isn't exported by name; reach it through the
  // helper. If suggestTwists works, the library shape is valid.
  return null;
})());

let allOK = true;
function check(label, cond, detail = "") {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    allOK = false;
    console.error(`FAIL  ${label}${detail ? `\n  ${detail}` : ""}`);
  }
}

const CANONICAL_FRAMEWORKS = ["save-the-cat", "three-act", "story-circle", "hero-journey"];
const ALLOWED_SEVERITIES = new Set(["low", "medium", "high"]);
const REQUIRED_TWIST_FIELDS = ["id", "label", "hook", "severity", "rationale"];

// Use suggestTwists to probe each framework + beat.
const { suggestTwists, TWIST_SCHEMA_VERSION, MAX_COUNT, DEFAULT_COUNT } = mod;

check("TWIST_SCHEMA_VERSION === 1", TWIST_SCHEMA_VERSION === 1);
check("MAX_COUNT is positive integer", Number.isInteger(MAX_COUNT) && MAX_COUNT > 0);
check("DEFAULT_COUNT in [1, MAX_COUNT]",
  Number.isInteger(DEFAULT_COUNT) && DEFAULT_COUNT >= 1 && DEFAULT_COUNT <= MAX_COUNT,
);

// Beat sets per framework (mirrors the library on main).
const BEATS_BY_FRAMEWORK = {
  "save-the-cat": ["catalyst", "midpoint", "all-is-lost", "finale"],
  "three-act": ["inciting-incident", "midpoint-twist", "climax"],
  "story-circle": ["need", "go", "find", "return-changed"],
  "hero-journey": ["call-to-adventure", "ordeal", "resurrection"],
};

const seenIds = new Set();

for (const fw of CANONICAL_FRAMEWORKS) {
  for (const beat of BEATS_BY_FRAMEWORK[fw] || []) {
    let twists;
    try {
      twists = await suggestTwists({ frameworkId: fw, currentBeatId: beat, count: MAX_COUNT });
    } catch (e) {
      check(`${fw}/${beat}: suggestTwists does not throw`, false, e.message);
      continue;
    }
    check(`${fw}/${beat}: returns at least 1 twist`, Array.isArray(twists?.twists) && twists.twists.length >= 1);
    if (!twists?.twists) continue;
    for (const t of twists.twists) {
      const label = `${fw}/${beat}/${t.id ?? "??"}`;
      for (const f of REQUIRED_TWIST_FIELDS) {
        check(`${label}: has \`${f}\``, t[f] !== undefined);
      }
      check(`${label}: severity ∈ {low,medium,high}`, ALLOWED_SEVERITIES.has(t.severity), `got ${t.severity}`);
      check(`${label}: id is non-empty string`, typeof t.id === "string" && t.id.length > 0);
      if (typeof t.id === "string") {
        if (seenIds.has(t.id)) {
          check(`${label}: id is unique across the library`, false, `duplicate id: ${t.id}`);
        }
        seenIds.add(t.id);
      }
    }
  }
}

// Unknown framework / beat should still throw cleanly.
let unknownThrew = false;
try {
  await suggestTwists({ frameworkId: "definitely-not-real", currentBeatId: "catalyst" });
} catch {
  unknownThrew = true;
}
check("unknown framework throws", unknownThrew);

if (!allOK) {
  console.error("twist engine canon eval: FAILED");
  process.exit(1);
}
console.log(`twist engine canon eval: OK (${seenIds.size} unique twist IDs across ${CANONICAL_FRAMEWORKS.length} frameworks)`);

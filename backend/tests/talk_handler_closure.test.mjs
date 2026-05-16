// Phase 7b closure-completeness proof.
//
// Proves the extracted createTalkHandler dependency boundary is COMPLETE
// and not hand-maintained: it re-runs the deterministic acorn lexical-
// scope analyzer (backend/tools/freevars.mjs) over the generated
// backend/lib/talk_handler.js and asserts the ONLY identifiers the whole
// createTalkHandler function references freely are the two Node stdlib
// imports it declares (File, randomUUID). Every other binding the
// handler body needs must therefore be satisfied by the destructured
// `deps` — if any dep were missing from the destructure it would surface
// here as an extra free identifier and fail this test.
//
// acorn/acorn-walk are dev-only tooling; this test adds no runtime app
// behavior.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { freeIdentifiers } from "../tools/freevars.mjs";
import { REQUIRED_DEPS } from "../lib/talk_handler.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.join(HERE, "..", "lib", "talk_handler.js");

// talk_handler.js legitimately declares these at its OWN module scope
// (two Node stdlib imports + the REQUIRED_DEPS constant). The analyzer
// scopes a function in isolation (not the module), so these read as
// "free" in createTalkHandler — that is expected and allowed. Anything
// ELSE that reads free is a dependency missing from the destructure.
const ALLOWED_MODULE_BINDINGS = new Set(["File", "randomUUID", "REQUIRED_DEPS"]);

test("[phase7b] createTalkHandler dependency boundary is complete", () => {
  const src = fs.readFileSync(LIB, "utf8");
  // freeIdentifiers finds the first function — createTalkHandler.
  const free = freeIdentifiers(src);
  const unaccounted = free.filter((n) => !ALLOWED_MODULE_BINDINGS.has(n));
  assert.deepEqual(
    unaccounted,
    [],
    "createTalkHandler has free identifiers not covered by its destructured " +
      "deps or stdlib imports — the dependency boundary is INCOMPLETE. " +
      "Unaccounted: " + JSON.stringify(unaccounted) + ". Regenerate the " +
      "destructure from backend/tools/freevars.mjs; do not hand-edit."
  );
});

test("[phase7b] every REQUIRED dep is actually destructured from deps", () => {
  const src = fs.readFileSync(LIB, "utf8");
  // pull the `const { ... } = deps;` destructure block
  const m = src.match(/const\s*\{([\s\S]*?)\}\s*=\s*deps;/);
  assert.ok(m, "could not find the `const { ... } = deps;` destructure");
  const destructured = new Set(
    m[1].split(",").map((s) => s.trim()).filter(Boolean)
  );
  for (const r of REQUIRED_DEPS) {
    assert.ok(
      destructured.has(r),
      `REQUIRED_DEP ${r} is not in the destructured deps set`
    );
  }
});

test("[phase7b] createTalkHandler enforces required deps at construction", async () => {
  const { createTalkHandler } = await import("../lib/talk_handler.js");
  assert.throws(
    () => createTalkHandler({}),
    /missing required dep/,
    "factory must throw when a load-bearing dep is absent"
  );
  assert.throws(
    () => createTalkHandler(null),
    /requires a deps object/
  );
});

test("[phase7b] freevars analyzer is sound on known fixtures", () => {
  // bound by params / locals -> not free
  assert.deepEqual(
    freeIdentifiers("function f(a, { b }, ...c) { const d = a + b; let [e] = c; return d + e; }"),
    []
  );
  // genuinely free
  assert.deepEqual(
    freeIdentifiers("function f(a) { return a + EXTERNAL + g(); }").sort(),
    ["EXTERNAL", "g"]
  );
  // closures, destructuring defaults, catch binding, for-of, shorthand
  assert.deepEqual(
    freeIdentifiers(
      "function f() { try { for (const x of items) { const y = ({ x }); h(y); } } catch (err) { report(err); } }"
    ).sort(),
    ["h", "items", "report"]
  );
  // member props and non-shorthand object keys are not references
  assert.deepEqual(
    freeIdentifiers("function f(o) { return o.prop + ({ key: val }).key; }"),
    ["val"]
  );
});

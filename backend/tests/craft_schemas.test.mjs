// Schema invariant tests. Every checked-in fixture validates;
// deliberately broken inputs fail with informative errors.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  FRAMEWORK_SCHEMA,
  REPORT_SCHEMA,
  MAJOR_TURN_SCHEMA,
  validateAgainstSchema,
} from "../lib/craft_schemas.js";
import {
  serializeFramework,
  getFrameworkById,
  listFrameworkReferences,
  FRAMEWORKS_BY_ID,
} from "../lib/craft_frameworks.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.resolve(__dirname, "..", "fixtures", "craft");

async function loadFixture(name) {
  return JSON.parse(await readFile(path.join(FIXTURES, name), "utf8"));
}

// ---------- fixtures all validate ----------

test("framework_save_the_cat.json validates against FRAMEWORK_SCHEMA", async () => {
  const fx = await loadFixture("framework_save_the_cat.json");
  const r = validateAgainstSchema(fx, FRAMEWORK_SCHEMA);
  assert.ok(r.valid, r.errors.join("; "));
});

test("framework_three_act.json validates against FRAMEWORK_SCHEMA", async () => {
  const fx = await loadFixture("framework_three_act.json");
  const r = validateAgainstSchema(fx, FRAMEWORK_SCHEMA);
  assert.ok(r.valid, r.errors.join("; "));
});

test("framework_story_circle.json validates against FRAMEWORK_SCHEMA", async () => {
  const fx = await loadFixture("framework_story_circle.json");
  const r = validateAgainstSchema(fx, FRAMEWORK_SCHEMA);
  assert.ok(r.valid, r.errors.join("; "));
});

test("framework_hero_journey.json validates against FRAMEWORK_SCHEMA", async () => {
  const fx = await loadFixture("framework_hero_journey.json");
  const r = validateAgainstSchema(fx, FRAMEWORK_SCHEMA);
  assert.ok(r.valid, r.errors.join("; "));
});

test("report_complete.json validates against REPORT_SCHEMA", async () => {
  const fx = await loadFixture("report_complete.json");
  const r = validateAgainstSchema(fx, REPORT_SCHEMA);
  assert.ok(r.valid, r.errors.join("; "));
});

test("report_with_drift.json validates against REPORT_SCHEMA", async () => {
  const fx = await loadFixture("report_with_drift.json");
  const r = validateAgainstSchema(fx, REPORT_SCHEMA);
  assert.ok(r.valid, r.errors.join("; "));
});

test("report_with_override.json validates against REPORT_SCHEMA", async () => {
  const fx = await loadFixture("report_with_override.json");
  const r = validateAgainstSchema(fx, REPORT_SCHEMA);
  assert.ok(r.valid, r.errors.join("; "));
});

// ---------- breakage detection ----------

test("removing schemaVersion from a Report fails REPORT_SCHEMA", async () => {
  const fx = await loadFixture("report_complete.json");
  delete fx.schemaVersion;
  const r = validateAgainstSchema(fx, REPORT_SCHEMA);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("schemaVersion")));
});

test("schemaVersion: 2 fails REPORT_SCHEMA (server only knows 1)", async () => {
  const fx = await loadFixture("report_complete.json");
  fx.schemaVersion = 2;
  const r = validateAgainstSchema(fx, REPORT_SCHEMA);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("const")));
});

test("MajorTurn schema requires JSON key 'override' not 'overrideRecord'", async () => {
  const turnWithOverride = {
    id: "mt_x",
    turnId: "x",
    label: "X",
    required: true,
    status: "present",
    detected: true,
    evidence: [],
    override: { id: "ov1", turnId: "x", action: "mark-present" },
  };
  const ok = validateAgainstSchema(turnWithOverride, MAJOR_TURN_SCHEMA);
  assert.ok(ok.valid, ok.errors.join("; "));
  // The Swift-side property name "overrideRecord" must NOT be a valid JSON key.
  const turnWithSwiftPropertyName = {
    id: "mt_x",
    turnId: "x",
    label: "X",
    required: true,
    status: "present",
    detected: true,
    evidence: [],
    overrideRecord: { id: "ov1", turnId: "x", action: "mark-present" },
  };
  const bad = validateAgainstSchema(turnWithSwiftPropertyName, MAJOR_TURN_SCHEMA);
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.some((e) => e.includes("overrideRecord")));
});

test("PageRange where start > end fails the schema", async () => {
  const fx = await loadFixture("report_complete.json");
  fx.beatSheet.beats[0].expectedPageRange = { start: 50, end: 1 };
  const r = validateAgainstSchema(fx, REPORT_SCHEMA);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("PageRange")));
});

test("Coverage missing requiredMajorTurnCount fails the schema", async () => {
  const fx = await loadFixture("report_complete.json");
  delete fx.coverage.requiredMajorTurnCount;
  const r = validateAgainstSchema(fx, REPORT_SCHEMA);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("requiredMajorTurnCount")));
});

// ---------- serializer omits undefined optionals ----------

test("built-in frameworks serialize and required turn IDs map to required beats", () => {
  for (const framework of Object.values(FRAMEWORKS_BY_ID)) {
    const serialized = serializeFramework(framework);
    const validation = validateAgainstSchema(serialized, FRAMEWORK_SCHEMA);
    assert.ok(validation.valid, framework.id + ": " + validation.errors.join("; "));

    const requiredBeatTurnIds = new Set(
      framework.beats
        .filter((beat) => beat.required && beat.majorTurnId)
        .map((beat) => beat.majorTurnId),
    );
    for (const turnId of framework.requiredMajorTurnIds) {
      assert.ok(requiredBeatTurnIds.has(turnId), framework.id + " missing required beat for " + turnId);
    }
  }
});

test("serializeFramework omits absent optional fields", () => {
  const minimal = {
    id: "minimal",
    title: "Minimal",
    requiredMajorTurnIds: ["x"],
    beats: [{ id: "b1", label: "Beat", required: true, majorTurnId: "x" }],
  };
  const json = serializeFramework(minimal);
  assert.equal("summary" in json, false);
  assert.equal("version" in json, false);
  assert.equal("majorTurnId" in json.beats[0], true);
  assert.equal("expectedPageRange" in json.beats[0], false);
  assert.equal("summary" in json.beats[0], false);
});

test("listFrameworkReferences returns id+title+version for each framework", () => {
  const refs = listFrameworkReferences();
  assert.ok(refs.length >= 4);
  for (const ref of refs) {
    assert.ok(ref.id);
    assert.ok(ref.title);
    // version is optional but our built-ins set it
    assert.ok(typeof ref.version === "string");
  }
});

test("getFrameworkById returns null for unknown id", () => {
  assert.equal(getFrameworkById("not-a-real-framework"), null);
});

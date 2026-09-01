import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  analyzeScreenplay,
  configureCraftAnalysis,
  listOverrides,
  MAX_CONSECUTIVE_CLASSIFIER_FAILURES,
  MAX_CRAFT_ANALYSIS_INPUT_CHARS,
  MAX_CRAFT_ANALYSIS_SCENES,
  recordOverride,
  OVERRIDES_DOMAIN,
} from "../lib/craft_analysis.js";
import { parseScreenplayToScenes } from "../lib/craft_screenplay_ir.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

function fixtureClassifier(labels, unavailableSceneIds = new Set()) {
  return {
    kind: "test-fixture",
    async classifyScene({ scene }) {
      if (unavailableSceneIds.has(scene.id)) {
        return { status: "unavailable", beatId: null, confidence: 0, source: "test-fixture" };
      }
      const beatId = labels.get(scene.id) || null;
      return { status: "classified", beatId, confidence: beatId ? 0.99 : 0, source: "test-fixture" };
    },
  };
}

test("scene IR prefers full Fountain text and gives stable line/page coordinates", () => {
  const scenes = parseScreenplayToScenes({
    text: "INT. KITCHEN - NIGHT\n\nJUNE\nWait.\n\nEXT. ROAD - DAWN\n\nShe runs.",
    scenes: [{ id: "outline-only", title: "Outline", text: "not canonical", pageStart: 99 }],
  });
  assert.equal(scenes.length, 2);
  assert.deepEqual(scenes.map((scene) => scene.id), ["scene-0001", "scene-0002"]);
  assert.equal(scenes[0].title, "INT. KITCHEN - NIGHT");
  assert.equal(scenes[0].lineStart, 1);
  assert.equal(scenes[1].lineStart, 6);
  assert.equal(scenes[0].pageBasis, "estimated-from-lines");
});

test("offline analyzer is incomplete/unavailable and never fabricates pages or evidence", async () => {
  const report = await analyzeScreenplay({
    projectId: "honesty-offline",
    versionId: "v1",
    frameworkId: "save-the-cat",
    screenplay: { text: "INT. KITCHEN - NIGHT\n\nA life-changing letter arrives.", pageCount: 110 },
  });
  assert.equal(report.coverage.complete, false);
  assert.equal(report.coverage.detectedMajorTurnCount, 0);
  assert.equal(report.coverage.missingMajorTurnCount, 0);
  assert.equal(report.coverage.unavailableMajorTurnCount, 4);
  for (const turn of report.majorTurns) {
    assert.equal(turn.status, "unavailable");
    assert.equal(turn.detected, false);
    assert.deepEqual(turn.evidence, []);
    assert.equal(turn.actualPage, undefined);
    assert.equal(turn.driftPages, undefined);
  }
  assert.equal(report.drift.status, "unavailable");
  assert.ok(report.drift.timeline.every((turn) => turn.status === "unavailable"));
  assert.match(report.drift.summary, /Analysis unavailable/);
  assert.match(report.drift.summary, /no missing-beat conclusion/i);
});

test("successful no-hit classification yields missing, even for a scene on the expected page", async () => {
  const report = await analyzeScreenplay({
    projectId: "honesty-decoy",
    versionId: "v1",
    frameworkId: "three-act",
    screenplay: {
      pageCount: 110,
      scenes: [{ id: "decoy", title: "INT. ROOM - DAY", text: "An unrelated quiet scene.", pageStart: 55, pageEnd: 55 }],
    },
    classifier: fixtureClassifier(new Map()),
  });
  const midpoint = report.majorTurns.find((turn) => turn.turnId === "midpoint-twist");
  assert.equal(midpoint.status, "missing");
  assert.equal(midpoint.detected, false);
  assert.equal(midpoint.actualPage, undefined);
  assert.equal(report.coverage.missingMajorTurnCount, 3);
  assert.equal(report.coverage.unavailableMajorTurnCount, 0);
  assert.equal(report.drift.status, "incomplete");
  assert.ok(report.drift.timeline.every((turn) => turn.status === "missing"));
  assert.match(report.drift.summary, /missing/i);
  assert.doesNotMatch(report.drift.summary, /Analysis unavailable/);
});

test("partial classifier failure preserves hits but leaves every unresolved turn unavailable", async () => {
  const report = await analyzeScreenplay({
    projectId: "honesty-partial",
    versionId: "v1",
    frameworkId: "save-the-cat",
    screenplay: {
      pageCount: 110,
      scenes: [
        { id: "semantic", title: "INT. HOME - NIGHT", text: "The catalyst lands.", pageStart: 12, pageEnd: 12 },
        { id: "failed", title: "EXT. ROAD - DAY", text: "Classifier unavailable.", pageStart: 55, pageEnd: 55 },
      ],
    },
    classifier: fixtureClassifier(new Map([["semantic", "catalyst"]]), new Set(["failed"])),
  });
  const catalyst = report.majorTurns.find((turn) => turn.turnId === "catalyst");
  assert.equal(catalyst.status, "present");
  assert.equal(catalyst.detected, true);
  assert.equal(catalyst.evidence.length, 1);
  assert.equal(catalyst.actualPage, 12);
  assert.ok(report.majorTurns.filter((turn) => turn.turnId !== "catalyst").every((turn) => turn.status === "unavailable"));
  assert.equal(report.coverage.detectedMajorTurnCount, 1);
  assert.equal(report.coverage.unavailableMajorTurnCount, 3);
  assert.equal(report.drift.status, "partial");
  assert.equal(report.drift.timeline.find((turn) => turn.turnId === "catalyst")?.status, "on-target");
  assert.ok(report.drift.timeline.filter((turn) => turn.turnId !== "catalyst").every((turn) => turn.status === "unavailable"));
  assert.match(report.drift.summary, /Analysis unavailable/);
});

test("analysis rejects oversized screenplay input before classifier work", async () => {
  let calls = 0;
  const classifier = {
    kind: "never-called",
    async classifyScene() {
      calls += 1;
      return { status: "classified", beatId: null, confidence: 0 };
    },
  };
  await assert.rejects(
    () => analyzeScreenplay({
      projectId: "oversized-input",
      frameworkId: "save-the-cat",
      screenplay: { text: "x".repeat(MAX_CRAFT_ANALYSIS_INPUT_CHARS + 1) },
      classifier,
    }),
    (error) => error?.code === "craft_analysis_input_too_large",
  );
  assert.equal(calls, 0);
});

test("analysis rejects scene counts that could create excessive paid calls", async () => {
  const scenes = Array.from({ length: MAX_CRAFT_ANALYSIS_SCENES + 1 }, (_, index) => ({
    id: `scene-${index}`,
    title: `INT. ROOM ${index} - DAY`,
    text: "A bounded scene.",
  }));
  await assert.rejects(
    () => analyzeScreenplay({
      projectId: "too-many-scenes",
      frameworkId: "save-the-cat",
      screenplay: { scenes },
    }),
    (error) => error?.code === "craft_analysis_scene_limit_exceeded",
  );
});

test("analysis stops calling a failing provider after the circuit threshold", async () => {
  let calls = 0;
  const scenes = Array.from({ length: 10 }, (_, index) => ({
    id: `scene-${index}`,
    title: `INT. ROOM ${index} - DAY`,
    text: "Provider failure fixture.",
  }));
  const report = await analyzeScreenplay({
    projectId: "provider-circuit",
    frameworkId: "save-the-cat",
    screenplay: { scenes },
    classifier: {
      kind: "failing-provider",
      async classifyScene() {
        calls += 1;
        throw new Error("provider unavailable");
      },
    },
  });
  assert.equal(calls, MAX_CONSECUTIVE_CLASSIFIER_FAILURES);
  assert.equal(report.coverage.complete, false);
  assert.ok(report.majorTurns.every((turn) => turn.status === "unavailable"));
});

test("new overrides are server-id-generated and exact-scope listed; legacy rows never auto-apply", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-craft-override-scope-"));
  const persistence = createJsonPersistence({ jsonRoot: root });
  configureCraftAnalysis({ persistence });
  const stored = await recordOverride({
    requestingUserId: "writer-1",
    override: {
      id: "caller-controlled",
      userId: "writer-1",
      projectId: "project-1",
      versionId: "v1",
      frameworkId: "save-the-cat",
      turnId: "midpoint",
      action: "mark-present",
    },
  });
  assert.match(stored.id, /^ov_[0-9a-f-]{36}$/);
  assert.notEqual(stored.id, "caller-controlled");

  await persistence.put({
    domain: OVERRIDES_DOMAIN,
    key: "ov_legacy",
    value: { id: "ov_legacy", userId: "writer-1", turnId: "midpoint", action: "mark-present" },
  });
  const exact = await listOverrides({
    userId: "writer-1",
    projectId: "project-1",
    versionId: "v1",
    frameworkId: "save-the-cat",
  });
  assert.deepEqual(exact.map((override) => override.id), [stored.id]);
  assert.deepEqual(await listOverrides({
    userId: "writer-1",
    projectId: "project-1",
    versionId: "v2",
    frameworkId: "save-the-cat",
  }), []);

  const report = await analyzeScreenplay({
    projectId: "project-1",
    versionId: "v1",
    frameworkId: "save-the-cat",
    screenplay: {},
    overrides: [await persistence.get({ domain: OVERRIDES_DOMAIN, key: "ov_legacy" })],
  });
  assert.equal(report.coverage.overriddenMajorTurnCount, 0);
  assert.equal(report.coverage.complete, false);
});

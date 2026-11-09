import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  INSPECTOR_TABS,
  PROVENANCE_KINDS,
  PROVENANCE_DEFAULT,
  isValidTab,
  isValidProvenance,
  normalizeTab,
  normalizeProvenanceKind,
  provenanceForStudioAction,
  tabForProvenance,
  buildInspectorTabState,
  buildInspectorUXPayload,
} from "../lib/clementine/inspector_ux.js";

test("INSPECTOR_TABS mirrors studio tabs and includes coverage/beats", () => {
  assert.ok(INSPECTOR_TABS.includes("coverage"));
  assert.ok(INSPECTOR_TABS.includes("beats"));
  assert.ok(INSPECTOR_TABS.includes("editor"));
});

test("PROVENANCE_KINDS includes user/clementine/coverage/beat", () => {
  assert.ok(PROVENANCE_KINDS.includes("user"));
  assert.ok(PROVENANCE_KINDS.includes("coverage"));
  assert.ok(PROVENANCE_KINDS.includes("beat"));
  assert.equal(PROVENANCE_DEFAULT, "user");
});

test("isValidTab and normalizeTab", () => {
  assert.equal(isValidTab("coverage"), true);
  assert.equal(isValidTab("bogus"), false);
  assert.equal(normalizeTab("COVERAGE"), "coverage");
  assert.equal(normalizeTab("bogus"), "");
});

test("provenance normalization and validation", () => {
  assert.equal(normalizeProvenanceKind("coverage"), "coverage");
  assert.equal(normalizeProvenanceKind("beat_composer"), "beat");
  assert.equal(normalizeProvenanceKind("unknown"), "user");
  assert.equal(isValidProvenance("beat"), true);
  assert.equal(isValidProvenance("bogus"), false);
});

test("provenanceForStudioAction maps studio actions", () => {
  assert.equal(provenanceForStudioAction({ type: "refreshCoverage" }), "coverage");
  assert.equal(provenanceForStudioAction({ type: "selectBeat" }), "beat");
  assert.equal(provenanceForStudioAction({ type: "openStudio", tab: "coverage" }), "coverage");
  assert.equal(provenanceForStudioAction({ type: "openStudio", tab: "beats" }), "beat");
  assert.equal(provenanceForStudioAction({ type: "openStudio" }), "user");
});

test("tabForProvenance inverse", () => {
  assert.equal(tabForProvenance("coverage"), "coverage");
  assert.equal(tabForProvenance("beat"), "beats");
  assert.equal(tabForProvenance("clementine"), "mentor");
  assert.equal(tabForProvenance("user"), "editor");
});

test("buildInspectorTabState validates studioAction and history", () => {
  const s1 = buildInspectorTabState({ selectedTab: "coverage", provenance: "coverage" });
  assert.equal(s1.selectedTab, "coverage");
  assert.equal(s1.provenance, "coverage");
  assert.equal(s1.studioAction, null);
  const s2 = buildInspectorTabState({ studioAction: { type: "refreshCoverage" } });
  assert.equal(s2.studioAction.type, "refreshCoverage");
  assert.equal(s2.studioAction.valid === undefined, true); // normalized
  const s3 = buildInspectorTabState({ studioAction: { type: "openStudio", tab: "bogus" } });
  assert.equal(s3.studioAction, null);
  assert.ok(s3.actionError);
  const s4 = buildInspectorTabState({ provenance: "coverage", history: ["user", "coverage", "coverage"] });
  assert.deepEqual(s4.provenanceHistory.slice(-2), ["user", "coverage"]);
});

test("buildInspectorUXPayload wires studio_actions + coverage to tabs provenance", () => {
  const p1 = buildInspectorUXPayload({ projectId: "p1", studioAction: { type: "refreshCoverage" }, coverage: { overall: 4.2, verdict: "PASS", summary: "ok" } });
  assert.equal(p1.selectedTab, "coverage");
  assert.equal(p1.provenance, "coverage");
  assert.equal(p1.hasCoverage, true);
  assert.equal(p1.isCoverageTab, true);
  assert.equal(p1.projectId, "p1");

  const p2 = buildInspectorUXPayload({ studioAction: { type: "selectBeat", beatId: "b3" } });
  assert.equal(p2.selectedTab, "beats");
  assert.equal(p2.provenance, "beat");
  assert.equal(p2.isBeatsTab, true);

  const p3 = buildInspectorUXPayload({ selectedTab: "editor", provenance: "user" });
  assert.equal(p3.selectedTab, "editor");
  assert.equal(p3.isEditorTab, true);

  const p4 = buildInspectorUXPayload({ text: "INT. ROOM - DAY\n\nAction.", coverage: { overall: 3, verdict: "CONSIDER" } });
  assert.equal(p4.hasCoverage, true);
  assert.equal(p4.coverage.verdict, "CONSIDER");
});

test("Swift shim exists", () => {
  const swiftShim = fileURLToPath(new URL("../../them/ScreenplayStudioInspectorUX.swift", import.meta.url));
  assert.ok(fs.existsSync(swiftShim));
  const s = fs.readFileSync(swiftShim, "utf8");
  assert.ok(s.includes("InspectorUX"));
  assert.ok(s.includes("ProvenanceKind"));
});

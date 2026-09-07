// Inspector UX — studio_actions + coverage → inspector tabs provenance.
// D009 strangler: pure helper. Keeps god-files 33626/17438/15112.
// Wires studio_actions validation and coverage rating to inspector tab
// provenance consumed by them/ScreenplayStudioInspectorUX.swift shim.

import { validateStudioAction, STUDIO_TABS } from "./studio_actions.js";

export const INSPECTOR_TABS = STUDIO_TABS;
export const STUDIO_ACTIONS_REF = "studio_actions";

export const PROVENANCE_KINDS = Object.freeze(["user", "clementine", "system", "coverage", "beat", "import"]);
export const PROVENANCE_DEFAULT = "user";

function toTrimmed(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

export function normalizeProvenanceKind(v) {
  const t = toTrimmed(v).toLowerCase();
  if (!t) return PROVENANCE_DEFAULT;
  if (PROVENANCE_KINDS.includes(t)) return t;
  // alias: beat_composer -> beat, coverage_refresh -> coverage
  if (t === "beat_composer" || t === "beatcomposer") return "beat";
  if (t === "coverage_refresh" || t === "coveragerefresh") return "coverage";
  return PROVENANCE_DEFAULT;
}

export function isValidProvenance(v) {
  return PROVENANCE_KINDS.includes(toTrimmed(v).toLowerCase());
}

export function normalizeTab(v) {
  const t = toTrimmed(v).toLowerCase();
  if (!t) return "";
  return INSPECTOR_TABS.includes(t) ? t : "";
}

export function isValidTab(v) {
  const t = toTrimmed(v).toLowerCase();
  return INSPECTOR_TABS.includes(t);
}

function normalizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const k = normalizeProvenanceKind(item);
    // keep only valid but normalize unknown to default; dedup consecutive
    if (out.length === 0 || out[out.length - 1] !== k) out.push(k);
    if (out.length >= 20) break;
  }
  return out;
}

// Map a validated studio action to its implied provenance.
export function provenanceForStudioAction(action) {
  if (!action || typeof action !== "object") return PROVENANCE_DEFAULT;
  const type = toTrimmed(action.type || action.action || action.name);
  if (type === "refreshCoverage") return "coverage";
  if (type === "selectBeat") return "beat";
  if (type === "openStudio") {
    const tab = toTrimmed(action.tab).toLowerCase();
    if (tab === "coverage") return "coverage";
    if (tab === "beats" || tab === "outline") return "beat";
    return "user";
  }
  return PROVENANCE_DEFAULT;
}

// Inverse: provenance → preferred inspector tab
export function tabForProvenance(provenance) {
  const k = normalizeProvenanceKind(provenance);
  if (k === "coverage") return "coverage";
  if (k === "beat") return "beats";
  if (k === "clementine") return "mentor";
  return "editor";
}

export function buildInspectorTabState({ selectedTab, provenance, history, studioAction } = {}) {
  const tab = normalizeTab(selectedTab) || "editor";
  const prov = normalizeProvenanceKind(provenance || (studioAction ? provenanceForStudioAction(studioAction) : PROVENANCE_DEFAULT));
  const hist = normalizeHistory(history);
  // validate studioAction if provided
  let validatedAction = null;
  let actionError = null;
  if (studioAction !== undefined && studioAction !== null) {
    const res = validateStudioAction(studioAction);
    if (res.valid) validatedAction = res.normalized;
    else actionError = res.error;
  }
  // history push current provenance
  const nextHistory = [...hist];
  if (nextHistory[nextHistory.length - 1] !== prov) {
    nextHistory.push(prov);
    if (nextHistory.length > 20) nextHistory.shift();
  }
  return {
    selectedTab: tab,
    provenance: prov,
    provenanceHistory: nextHistory,
    studioAction: validatedAction,
    actionError,
    tabForProvenance: tabForProvenance(prov),
  };
}

// Minimal coverage summary helper (does not import coverage.js to stay shim-agnostic).
// If caller provides a coverage object { overall, verdict }, we preserve it.
function coerceCoverage(coverage) {
  if (!coverage || typeof coverage !== "object") return null;
  if (typeof coverage.overall === "number" && typeof coverage.verdict === "string") {
    return { overall: coverage.overall, verdict: coverage.verdict, summary: toTrimmed(coverage.summary) };
  }
  return null;
}

export function buildInspectorUXPayload({
  projectId = "",
  draft = "",
  text,
  studioAction = null,
  selectedTab = "",
  provenance = "",
  history = [],
  coverage = null,
  coverageText,
  timestamp = Date.now(),
} = {}) {
  const pid = toTrimmed(projectId);
  const tabState = buildInspectorTabState({ selectedTab, provenance, history, studioAction });
  // coverage: prefer explicit coverage object, else if coverageText/text provided try to compute via injected coverage param
  // caller can pass coverage directly; we do not import coverage.js to avoid lib mirror mismatch
  const cov = coerceCoverage(coverage);
  // provenance override: if coverage indicates FAIL/PASS, keep coverage provenance if tab is coverage
  let finalProvenance = tabState.provenance;
  let finalTab = tabState.selectedTab;
  // if studioAction is refreshCoverage, force coverage tab/provenance
  if (tabState.studioAction && tabState.studioAction.type === "refreshCoverage") {
    finalTab = "coverage";
    finalProvenance = "coverage";
  } else if (tabState.studioAction && tabState.studioAction.type === "selectBeat") {
    finalTab = "beats";
    finalProvenance = "beat";
  } else if (!selectedTab && tabState.studioAction && tabState.studioAction.tab) {
    finalTab = normalizeTab(tabState.studioAction.tab) || finalTab;
  }

  const payload = {
    projectId: pid,
    selectedTab: finalTab,
    provenance: finalProvenance,
    provenanceHistory: tabState.provenanceHistory.includes(finalProvenance) ? tabState.provenanceHistory : [...tabState.provenanceHistory, finalProvenance].slice(-20),
    studioAction: tabState.studioAction,
    actionError: tabState.actionError,
    coverage: cov,
    draft: typeof text === "string" ? text : typeof draft === "string" ? draft : "",
    timestamp: Number(timestamp) || Date.now(),
    hasCoverage: Boolean(cov),
    hasAction: Boolean(tabState.studioAction),
  };
  // convenience flags for inspector tabs
  payload.isCoverageTab = payload.selectedTab === "coverage";
  payload.isBeatsTab = payload.selectedTab === "beats";
  payload.isEditorTab = payload.selectedTab === "editor";
  return payload;
}

// aliases for shim expectations
export const buildInspectorPayload = buildInspectorUXPayload;
export const buildInspectorUX = buildInspectorUXPayload;

export default {
  INSPECTOR_TABS,
  PROVENANCE_KINDS,
  PROVENANCE_DEFAULT,
  normalizeTab,
  isValidTab,
  isValidProvenance,
  normalizeProvenanceKind,
  provenanceForStudioAction,
  tabForProvenance,
  buildInspectorTabState,
  buildInspectorUXPayload,
};

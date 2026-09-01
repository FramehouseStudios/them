// Craft-aware prompt blocks (T21).
//
// Two functions:
//   - buildCraftContextBlock({ framework, report? }) returns a compact
//     model-friendly summary of the active craft framework and (when
//     present) the user's current beat-coverage state. Designed to be
//     concatenated into a system prompt by handleTalkRequest when a
//     screenplay page-write turn is detected.
//   - buildClassificationPromptBlock({ framework, scene }) returns the
//     instruction body the LLM beat classifier sends to the model.
//     Pure; deterministic; testable independent of any model call.
//
// Both functions are zero-dependency on Express / network. They take
// already-loaded data and return strings.

import { getFrameworkById } from "./craft_frameworks.js";

const CRAFT_BLOCK_OPEN = "<craft>";
const CRAFT_BLOCK_CLOSE = "</craft>";
const CLASSIFY_BLOCK_OPEN = "<classify_scene>";
const CLASSIFY_BLOCK_CLOSE = "</classify_scene>";

function compactPageRange(range) {
  if (!range || typeof range !== "object") return "";
  const { start, end } = range;
  if (Number.isInteger(start) && Number.isInteger(end)) {
    return start === end ? `p${start}` : `p${start}-${end}`;
  }
  return "";
}

function summarizeFramework(framework) {
  if (!framework) return "";
  const lines = [];
  lines.push(`framework: ${framework.title} (${framework.id}, v${framework.version || "?"})`);
  if (framework.summary) lines.push(`  summary: ${framework.summary}`);
  if (Array.isArray(framework.requiredMajorTurnIds) && framework.requiredMajorTurnIds.length) {
    lines.push(`  required-major-turns: ${framework.requiredMajorTurnIds.join(", ")}`);
  }
  // Only include the required + first-N optional beats to keep prompts compact.
  const beats = Array.isArray(framework.beats) ? framework.beats : [];
  const required = beats.filter((b) => b.required);
  const optional = beats.filter((b) => !b.required).slice(0, 4);
  if (required.length) {
    lines.push("  required-beats:");
    for (const b of required) {
      const range = compactPageRange(b.expectedPageRange);
      lines.push(`    - ${b.id} (${b.label})${range ? ` @ ${range}` : ""}`);
    }
  }
  if (optional.length) {
    lines.push("  optional-beats (excerpt):");
    for (const b of optional) {
      const range = compactPageRange(b.expectedPageRange);
      lines.push(`    - ${b.id} (${b.label})${range ? ` @ ${range}` : ""}`);
    }
  }
  return lines.join("\n");
}

function summarizeReportCoverage(report) {
  if (!report || typeof report !== "object") return "";
  const cov = report.coverage;
  if (!cov || typeof cov !== "object") return "";
  const lines = [];
  lines.push(
    `coverage: required=${cov.requiredMajorTurnCount ?? "?"} ` +
      `detected=${cov.detectedMajorTurnCount ?? "?"} ` +
      `overridden=${cov.overriddenMajorTurnCount ?? "?"} ` +
      `missing=${cov.missingMajorTurnCount ?? "?"} ` +
      `unavailable=${cov.unavailableMajorTurnCount ?? 0} ` +
      `complete=${cov.complete === true ? "yes" : "no"}`,
  );
  const drift = report.drift;
  if (drift && drift.status) lines.push(`drift: ${drift.status}`);
  // Missing is a semantic result; unavailable is an analysis limitation.
  // Keeping them separate prevents the writing model from treating a failed
  // classifier run as a real structural diagnosis.
  if (Array.isArray(report.majorTurns)) {
    const missing = report.majorTurns
      .filter((t) => t && (t.status === "missing" || t.status === "late" || t.status === "early"))
      .slice(0, 3);
    if (missing.length) {
      lines.push("missing-or-drifting:");
      for (const t of missing) {
        const at = compactPageRange(t.expectedPageRange) || (Number.isInteger(t.expectedPage) ? `p${t.expectedPage}` : "?");
        lines.push(`  - ${t.turnId} (${t.label}) expected @ ${at}`);
      }
    }
    const unavailable = report.majorTurns
      .filter((t) => t && t.status === "unavailable")
      .slice(0, 3);
    if (unavailable.length) {
      lines.push("analysis-unavailable:");
      for (const t of unavailable) lines.push(`  - ${t.turnId} (${t.label})`);
    }
  }
  return lines.join("\n");
}

// Public: assemble a compact craft-context block for a system prompt.
// `framework` may be a framework id (string) or an already-loaded object;
// `report` is optional. Returns the empty string when neither has any
// usable data.
function buildCraftContextBlock({ framework, report } = {}) {
  let resolved = null;
  if (typeof framework === "string") {
    resolved = getFrameworkById(framework);
  } else if (framework && typeof framework === "object") {
    resolved = framework;
  }
  const fwPart = summarizeFramework(resolved);
  const cvPart = summarizeReportCoverage(report);
  if (!fwPart && !cvPart) return "";
  const inner = [fwPart, cvPart].filter(Boolean).join("\n");
  return `${CRAFT_BLOCK_OPEN}\n${inner}\n${CRAFT_BLOCK_CLOSE}`;
}

// Public: build the classifier's prompt block for a single scene.
// The classifier model is asked to emit a JSON object matching a small
// projection of the Beat shape — the LLM impl re-validates this
// against craft_schemas before returning.
function buildClassificationPromptBlock({ framework, scene } = {}) {
  let resolved = null;
  if (typeof framework === "string") {
    resolved = getFrameworkById(framework);
  } else if (framework && typeof framework === "object") {
    resolved = framework;
  }
  if (!resolved) return "";
  const beatList = (resolved.beats || [])
    .filter((b) => b && b.id && b.label)
    .map((b) => `${b.id}|${b.label}`)
    .join(", ");
  // Keep each paid provider request bounded even when structured scene
  // metadata contains unexpectedly large strings.
  const sceneText = (scene && scene.text) ? String(scene.text).slice(0, 1200) : "";
  const sceneTitle = (scene && scene.title) ? String(scene.title).slice(0, 200) : "(untitled)";
  const lines = [
    `Classify the following scene against the "${resolved.title}" framework beats.`,
    `Possible beats: ${beatList}`,
    `Scene title: ${sceneTitle}`,
    "Scene excerpt:",
    "---",
    sceneText,
    "---",
    "Respond as JSON: { \"beatId\": <one of the ids above>, \"confidence\": <0..1>, \"rationale\": <one short sentence> }.",
    "If no beat fits, respond { \"beatId\": null, \"confidence\": 0, \"rationale\": \"…\" }.",
  ];
  return `${CLASSIFY_BLOCK_OPEN}\n${lines.join("\n")}\n${CLASSIFY_BLOCK_CLOSE}`;
}

export {
  buildCraftContextBlock,
  buildClassificationPromptBlock,
  CRAFT_BLOCK_OPEN,
  CRAFT_BLOCK_CLOSE,
  CLASSIFY_BLOCK_OPEN,
  CLASSIFY_BLOCK_CLOSE,
};

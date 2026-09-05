#!/usr/bin/env node
//
// Screenplay quality canary (heuristic-only) — asserts overall >= 3.5
// without needing OPENAI_API_KEY. Deterministic; safe for CI.
//
// Uses the existing page-craft heuristic scorer (screenplay_page_quality +
// format_linter) on a golden PASS fixture. Threshold mirrors
// evals/page_craft/RUBRIC.md: PASS >= 3.5
//

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { scorePageHeuristic, THRESHOLDS } from "./page_craft/score_page.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CANARY_FIXTURE = path.join(__dirname, "page_craft/fixtures/pass_balanced_craft_01.json");

function loadCanaryText() {
  if (fs.existsSync(CANARY_FIXTURE)) {
    const raw = JSON.parse(fs.readFileSync(CANARY_FIXTURE, "utf8"));
    if (typeof raw.text === "string" && raw.text.trim().length > 0) return { text: raw.text, id: raw.id };
  }
  // Fallback golden passage (same craft shape) if fixture missing
  return {
    id: "canary_fallback",
    text: [
      "INT. SERVER CLOSET - NIGHT",
      "",
      "RED LIGHT over the rack blinks out of sync. KIRA slots a KEYCARD. It rejects. OWEN breathes through his teeth.",
      "",
      "KIRA",
      "Three tries left. You want the dump or your job?",
      "",
      "OWEN",
      "I want both. The card only sells one.",
      "",
      "KIRA",
      "Then pick which future you can afford.",
      "",
      "Owen takes the keycard, snaps it, feeds half into the reader. Green. Kira copies the drive while Owen watches the hallway \u2014 and his own resignation letter draft on his phone.",
    ].join("\n"),
  };
}

const { text, id } = loadCanaryText();
const scored = scorePageHeuristic(text, { fixture: { id, label: "pass" } });

const floor = THRESHOLDS.passMinOverall; // 3.5 per RUBRIC.md
const passed = scored.overall >= floor;

console.log(`screenplay-quality canary: fixture=${id} mode=${scored.mode} overall=${scored.overall} floor=${floor} ${passed ? "PASS" : "FAIL"}`);
console.log(`dimensions: ${Object.entries(scored.dimensions).map(([k, v]) => `${k}=${v}`).join(", ")}`);
if (scored.notes?.length) console.log(`notes: ${scored.notes.join(", ")}`);

// Must not require OPENAI_API_KEY — assert independence (warn only if caller expects LLM)
if (process.env.OPENAI_API_KEY) {
  console.log("INFO  OPENAI_API_KEY present but not required for canary (heuristic-only).");
} else {
  console.log("INFO  OPENAI_API_KEY not set — canary still evaluated (heuristic-only).");
}

if (!passed) {
  console.error(`FAIL  screenplay-quality canary: overall ${scored.overall} < ${floor}`);
  process.exit(1);
}

console.log(`screenplay-quality canary: OK overall ${scored.overall} >= ${floor} (OPENAI_API_KEY not required)`);

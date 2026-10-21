#!/usr/bin/env node
// Mentor golden set — Clementine's spoken mentor voice, measured.
//
//   npm run eval:mentor-golden          offline: every golden exemplar must PASS
//                                       and every weak exemplar must FAIL under
//                                       the deterministic scorer; the mentor
//                                       prompt path is asserted (mentor core +
//                                       <mentor_output>, no check-in). No model.
//   npm run eval:mentor-golden:live     live: each case is answered by the real
//                                       chat model through the mentor prompt
//                                       (docs/persona/mentor-core.txt + the
//                                       persona core + <mentor_output>) and
//                                       scored. Gate: ≥ 80% PASS, 0 FAIL, and
//                                       register ≥ 3.5 on every reply (a 3.0 is a
//                                       question stack or a check-in; 3.5 is one
//                                       slip, tolerated under model variance).
//
// Report: /tmp/them-smoke/mentor-golden/report.json (override MENTOR_GOLDEN_REPORT).
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { CASES, CATEGORIES } from "./mentor_conversation/cases.mjs";
import { scoreMentorReply, THRESHOLDS } from "./mentor_conversation/score_mentor_reply.js";
import { createPersonaRuntime } from "../lib/persona.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const live = process.argv.includes("--live");
const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice("--only=".length);
const reportPath = process.env.MENTOR_GOLDEN_REPORT || "/tmp/them-smoke/mentor-golden/report.json";

const MENTOR_CORE_PATH = path.join(repoRoot, "docs", "persona", "mentor-core.txt");
const mentorCore = fs.readFileSync(MENTOR_CORE_PATH, "utf8").trim();

// Mirrors HerVoiceSpec.scenePitchBlock for the fresh-session case. The Swift
// literal is the app's source; keep the intent identical.
const SCENE_PITCH_FRESH = `SCENE PITCH (standing collaborator rule):
- This is the first exchange of the session. Before anything else, pitch one scene unprompted, even if the user only said hello or asked you to talk. This outranks CASUAL CONVERSATION MODE for this turn.
- A pitch is concrete: a specific place and time of day, two named characters, what one of them wants right now, and the one thing in the way. Two or three spoken sentences, like a collaborator across the table, not a logline generator.
- End the pitch with one question that hands them the wheel: which part they want to build, or what they were already carrying in.
- When the user brings a scene idea of their own, build on theirs. Keep their premise, setting, and characters as the spine and add one concrete beat, complication, image, or line that makes it more playable. Never swap in your pitch over their idea or restart from a blank page.
- Once they say yes to a direction, offer in one short line to put it on the page.
- Never write Fountain, sluglines, or sample dialogue under this rule; page text only happens in PAGE WRITE MODE.`;

function personaRuntime() {
  return createPersonaRuntime({
    env: process.env,
    normalizeSnippet: (v, maxChars = 16_000) => String(v || "").trim().slice(0, maxChars),
    normalizePersonaPreset: (v, fallback = "clementine") => String(v || "").trim().toLowerCase() || fallback,
    DEFAULT_ASSISTANT_SELF_NAME: "CLEMENTINE",
    UNIFIED_PERSONA_PRESET: "clementine",
    CLEMENTINE_EMPTY_TRANSCRIPT_PROMPT_DEFAULT: "Say that once more.",
    EMPTY_TRANSCRIPT_VOICE_PROMPT_TEXT: "",
    ELEVENLABS_VOICE_ID: "",
    ELEVENLABS_MODEL_ID: "",
    TTS_VOICE: "",
    TTS_SPEED: 1.0,
    SELF_AWARENESS_START_TURNS: 3,
    MAX_SYSTEM_PROMPT_CHARS: 16_000,
  });
}

export function buildMentorSystemPrompt(testCase, runtime = personaRuntime()) {
  const header = "You are CLEMENTINE, a working screenwriter and this writer's mentor for a Hollywood-standard three-act feature.\nYou are artificial and say so plainly when asked. You never pretend to be human and never diminish yourself for it.";
  const parts = [header, mentorCore];
  if (testCase?.fresh) parts.push(SCENE_PITCH_FRESH);
  const base = parts.join("\n\n");
  const withCore = runtime.appendDirectorAddendum(base, runtime.PERSONA_ENFORCEMENT_ADDENDUM);
  return runtime.withOutputContract(withCore, { mentorTurn: true });
}

function userMessage(testCase) {
  const lines = [];
  if (testCase.context) lines.push(`[Draft excerpt]\n${testCase.context}\n`);
  lines.push(testCase.writer);
  return lines.join("\n");
}

function summarize(results) {
  const total = results.length;
  const pass = results.filter((r) => r.verdict === "PASS").length;
  const fail = results.filter((r) => r.verdict === "FAIL").length;
  const byCategory = {};
  for (const c of CATEGORIES) {
    const rows = results.filter((r) => r.category === c);
    byCategory[c] = {
      total: rows.length,
      pass: rows.filter((r) => r.verdict === "PASS").length,
      meanOverall: rows.length ? Number((rows.reduce((a, r) => a + r.overall, 0) / rows.length).toFixed(2)) : 0,
    };
  }
  return { total, pass, fail, passRate: total ? Number((pass / total).toFixed(3)) : 0, byCategory };
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`report: ${reportPath}`);
}

const cases = only ? CASES.filter((c) => c.id === only || c.category === only) : CASES;
let ok = true;

if (!live) {
  const runtime = personaRuntime();
  const results = [];
  for (const testCase of cases) {
    const golden = scoreMentorReply(testCase.golden, testCase);
    const weak = scoreMentorReply(testCase.weak, testCase);
    const goldenOk = golden.verdict === "PASS";
    const weakOk = weak.verdict === "FAIL";
    if (!goldenOk || !weakOk) ok = false;
    console.log(`${goldenOk && weakOk ? "PASS" : "FAIL"}  ${testCase.id}  golden=${golden.overall} (${golden.verdict})  weak=${weak.overall} (${weak.verdict})`);
    if (!goldenOk) console.log(`      golden notes: ${JSON.stringify(Object.fromEntries(Object.entries(golden.dimensions).map(([k, v]) => [k, v.notes])))}`);
    if (!weakOk) console.log(`      weak notes: ${JSON.stringify(Object.fromEntries(Object.entries(weak.dimensions).map(([k, v]) => [k, v.notes])))}`);
    results.push({ id: testCase.id, category: testCase.category, golden, weak, goldenOk, weakOk });
  }
  // Prompt-path assertions: the system prompt a mentor turn actually gets.
  const prompt = buildMentorSystemPrompt({ fresh: true }, runtime);
  const checks = [
    ["mentor core present", prompt.includes("MENTOR CORE (identity, every turn):")],
    ["mentor contract present", prompt.includes("<mentor_output>")],
    ["persona core present", prompt.includes("<clementine_core>")],
    ["no check-in order", !prompt.includes("start line 1 with a short day/feeling check-in question")],
    ["no 2–3 line cap", !prompt.includes("Target 2–3 short lines")],
    ["scene pitch on fresh sessions", prompt.includes("SCENE PITCH (standing collaborator rule)")],
  ];
  for (const [label, pass] of checks) {
    if (!pass) ok = false;
    console.log(`${pass ? "PASS" : "FAIL"}  prompt-path: ${label}`);
  }
  const summary = { mode: "offline", cases: results.length, allSeparated: results.every((r) => r.goldenOk && r.weakOk), promptPath: Object.fromEntries(checks) };
  writeReport({ generatedAt: new Date().toISOString(), thresholds: THRESHOLDS, summary, results });
  console.log(ok ? "MENTOR GOLDEN SET OK (offline)" : "MENTOR GOLDEN SET FAILED (offline)");
  process.exit(ok ? 0 : 1);
}

// ---- live mode ----
const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
if (!apiKey) {
  console.error("MENTOR GOLDEN LIVE BLOCKED: OPENAI_API_KEY is required.");
  process.exit(2);
}
process.env.RUN_SERVER = "0";
const { renderStudioRealtimeText } = await import("../index.js");
const runtime = personaRuntime();
const results = [];
for (const testCase of cases) {
  const systemPrompt = buildMentorSystemPrompt(testCase, runtime);
  let reply = "";
  let error = "";
  try {
    reply = await renderStudioRealtimeText({
      systemPrompt,
      transcript: userMessage(testCase),
      modelTier: "rich",
      maxTokens: 420,
    });
  } catch (err) {
    error = String(err?.message || err);
  }
  const scored = reply ? scoreMentorReply(reply, testCase) : { overall: 0, verdict: "FAIL", dimensions: {} };
  const registerScore = scored.dimensions?.register?.score ?? 0;
  const line = `${scored.verdict === "PASS" ? "PASS" : scored.verdict === "FAIL" ? "FAIL" : "EDGE"}  ${testCase.id}  overall=${scored.overall} register=${registerScore}${error ? `  error=${error}` : ""}`;
  console.log(line);
  if (scored.verdict !== "PASS") {
    console.log(`      notes: ${JSON.stringify(Object.fromEntries(Object.entries(scored.dimensions).map(([k, v]) => [k, v.notes])))}`);
    console.log(`      reply: ${reply.replace(/\s+/g, " ").slice(0, 320)}`);
  }
  results.push({ id: testCase.id, category: testCase.category, reply, error, ...scored });
}
const summary = { mode: "live", model: "rich", ...summarize(results) };
const REGISTER_FLOOR = 3.5;
const registerFloor = results.every((r) => (r.dimensions?.register?.score ?? 0) >= REGISTER_FLOOR);
const gate = summary.passRate >= 0.8 && summary.fail === 0 && registerFloor;
writeReport({ generatedAt: new Date().toISOString(), thresholds: THRESHOLDS, gate: { passRateMin: 0.8, failMax: 0, registerMin: REGISTER_FLOOR, ok: gate }, summary, results });
console.log(`live: ${summary.pass}/${summary.total} PASS (${Math.round(summary.passRate * 100)}%), ${summary.fail} FAIL, register floor ${registerFloor ? "met" : "MISSED"}`);
console.log(JSON.stringify(summary.byCategory));
console.log(gate ? "MENTOR GOLDEN SET OK (live)" : "MENTOR GOLDEN SET FAILED (live)");
process.exit(gate ? 0 : 1);

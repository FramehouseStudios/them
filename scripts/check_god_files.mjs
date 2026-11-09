#!/usr/bin/env node
//
// scripts/check_god_files.mjs
//
// God-file strangler gate — D009 / docs/engineering/god-file-strangler.md
//
// Enforces "god-file line count must not grow on feature work".
// Fails when a tracked god file grows vs. origin/main (delta > 0).
//
// Design:
// - Delta check, not absolute cap (absolute 5000 would fail main today:
//   backend/index.js is 33626, ScreenplayStudioScreen is 17438).
// - One canonical owner for the file list (AGENTS.md:13). Workflows and
//   PR checklists import this, not a duplicated inline `wc | awk`.
// - Works locally and in CI (quality-gate.yml god-file-gate job).
//   CI does `fetch-depth: 0` so merge-base is available; locally falls
//   back to origin/main if present, else just reports absolute sizes.
// - Strict by default; `--allow-growth` prints sizes without failing
//   (useful for deliberate strangler B/I steps that justify growth).
//

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// Canonical list — D009 + god-file-strangler.md. Keep in sync with docs.
// Exported so future tooling can import instead of duplicating.
export const GOD_FILES = [
  "backend/index.js",
  "them/ScreenplayStudioScreen.swift",
  "them/RootExperienceView.swift",
  "them/ScreenplayLiveDraftBridge.swift",
  "them/BackendMemoryAPI.swift",
];

function gitOutput(args) {
  try {
    return execFileSync("git", ["-C", repoRoot, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function countLinesSimple(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, "utf8");
  if (text.length === 0) return 0;
  let lines = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lines++;
  // wc -l counts newline chars; a file without trailing newline still has last line.
  // But for delta, either definition is stable — use newline count + (no trailing newline ? 1 : 0) if non-empty.
  if (text.length > 0 && !text.endsWith("\n")) lines += 1;
  return lines;
}

function baseRef() {
  // CI sets GITHUB_BASE_REF to the PR target (usually "main"). Local fallback is origin/main.
  const envBase = String(process.env.GITHUB_BASE_REF || "").trim();
  if (envBase) return `origin/${envBase}`;
  if (gitOutput(["rev-parse", "--verify", "origin/main"])) return "origin/main";
  if (gitOutput(["rev-parse", "--verify", "main"])) return "main";
  return "";
}

function baseLineCount(relPath, ref) {
  if (!ref) return null;
  try {
    const out = execFileSync("git", ["-C", repoRoot, "show", `${ref}:${relPath}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 20 * 1024 * 1024,
    });
    if (out.length === 0) return 0;
    let lines = 0;
    for (let i = 0; i < out.length; i++) if (out[i] === "\n") lines++;
    if (out.length > 0 && !out.endsWith("\n")) lines += 1;
    return lines;
  } catch {
    return null;
  }
}

function main() {
  const allowGrowth = process.argv.includes("--allow-growth");
  const jsonOut = process.argv.includes("--json");
  const ref = baseRef();
  const isPR = Boolean(String(process.env.GITHUB_BASE_REF || "").trim()) || gitOutput(["rev-parse", "--verify", ref]);

  let failed = false;
  const rows = [];

  for (const rel of GOD_FILES) {
    const abs = path.join(repoRoot, rel);
    const head = countLinesSimple(abs);
    if (head === null) {
      rows.push({ file: rel, head: null, base: null, delta: null, status: "missing" });
      continue;
    }
    const base = ref ? baseLineCount(rel, ref) : null;
    const delta = base === null ? null : head - base;
    const grew = delta !== null && delta > 0;
    if (grew && !allowGrowth) failed = true;
    rows.push({ file: rel, head, base, delta, status: grew ? "grew" : "ok", ref: ref || null });
  }

  if (jsonOut) {
    console.log(JSON.stringify({ ref: ref || null, allowGrowth, failed, rows }, null, 2));
  } else {
    const label = ref ? `vs ${ref}` : "(no base — absolute sizes)";
    console.log(`[god-file-gate] ${label} — D009: line count must not grow on feature work`);
    console.log(`[god-file-gate] docs: docs/engineering/god-file-strangler.md`);
    for (const r of rows) {
      if (r.head === null) {
        console.log(`  - ${r.file}: missing`);
      } else if (r.base === null) {
        console.log(`  - ${r.file}: ${r.head} lines ${r.status === "missing" ? "(missing)" : ""}`);
      } else {
        const sign = r.delta > 0 ? `+${r.delta}` : `${r.delta}`;
        const mark = r.status === "grew" ? "  ✗ GREW" : "  ✓";
        console.log(`${mark} ${r.file}: ${r.base} → ${r.head} (${sign})`);
      }
    }
    if (failed) {
      console.log("");
      console.log("Failing: one or more god files grew vs base.");
      console.log("Fix: extract the capability to backend/lib/... or them/<Child> per D009,");
      console.log("     or re-run with --allow-growth if this PR is an approved strangler step");
      console.log("     and name the capability + removal issue in the PR description.");
    } else {
      console.log("");
      console.log("Pass: no god file grew vs base.");
    }
  }

  process.exit(failed ? 1 : 0);
}

main();

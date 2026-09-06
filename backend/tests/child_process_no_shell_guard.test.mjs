// Audit 2026-09-05 (Muse) — the only child_process call in the backend
// server is `execFile("osascript", [...])` in index.js. Pin the invariants
// that keep that safe so a future edit cannot quietly turn it into a
// shell-interpreted command:
//   1. nothing under the server imports the shell-invoking `exec` / `execSync`
//      from node:child_process (execFile / spawn family only);
//   2. no child_process call anywhere in the backend passes `shell: true`;
//   3. every `execFile(` in index.js takes a string program and an array of
//      arguments, never an interpolated command string.
// Evals and scripts are covered by (1) and (2) as well.

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function listSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(m?js|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const scannedRoots = ["index.js", "app.js", "config.js", "lib", "scripts", "evals"]
  .map((p) => path.join(backendRoot, p))
  .filter((p) => fs.existsSync(p));

const files = scannedRoots.flatMap((p) => (fs.statSync(p).isDirectory() ? listSourceFiles(p) : [p]));

function rel(file) {
  return path.relative(backendRoot, file);
}

test("[child-process] nothing imports the shell-invoking exec/execSync from node:child_process", () => {
  const offenders = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'](?:node:)?child_process["']/g)) {
      const names = match[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      for (const name of names) {
        if (name === "exec" || name === "execSync") offenders.push(`${rel(file)}: imports ${name}`);
      }
    }
    if (/child_process["']\)\.exec(?:Sync)?\(/.test(source) || /\bexec(?:Sync)?\(\s*`/.test(source)) {
      offenders.push(`${rel(file)}: calls exec/execSync`);
    }
  }
  assert.deepEqual(offenders, [], `shell-invoking child_process usage:\n${offenders.join("\n")}`);
});

test("[child-process] no child_process call passes shell: true", () => {
  const offenders = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    if (!/child_process/.test(source)) continue;
    const lines = source.split("\n");
    lines.forEach((line, i) => {
      if (/\bshell\s*:\s*true\b/.test(line)) offenders.push(`${rel(file)}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], `shell: true found:\n${offenders.join("\n")}`);
});

test("[child-process] every execFile in index.js takes a literal program and an argument array", () => {
  const source = fs.readFileSync(path.join(backendRoot, "index.js"), "utf8");
  const calls = [...source.matchAll(/\bexecFile\s*\(\s*([^,]+),\s*(\[[^\]]*\])/g)];
  const rawCalls = [...source.matchAll(/\bexecFile\s*\(/g)].length;
  assert.ok(rawCalls >= 1, "expected the osascript execFile call to exist");
  assert.equal(calls.length, rawCalls, "every execFile call must pass a program and an argument array");
  for (const [, program] of calls) {
    assert.match(program.trim(), /^["'][^"'`$]+["']$/, `execFile program must be a plain string literal, got ${program.trim()}`);
  }
});

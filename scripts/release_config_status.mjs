#!/usr/bin/env node
//
// scripts/release_config_status.mjs
//
// Safe status check for the ignored local release config. This intentionally
// parses simple KEY=value / export KEY=value lines instead of sourcing the file,
// so it can report readiness without executing local shell content or printing
// secrets.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const requiredKeys = ["DEVELOPMENT_TEAM_ID", "BACKEND_URL", "APP_TOKEN"];

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const wantJson = process.argv.includes("--json");
const envFile = path.resolve(repoRoot, arg("release-env-file", process.env.RELEASE_ENV_FILE || "them/Release.local.env"));

function displayPath(fullPath) {
  const relativeToRepo = path.relative(repoRoot, fullPath);
  if (relativeToRepo && !relativeToRepo.startsWith("..") && !path.isAbsolute(relativeToRepo)) {
    return relativeToRepo;
  }
  const home = os.homedir();
  const relativeToHome = path.relative(home, fullPath);
  if (relativeToHome && !relativeToHome.startsWith("..") && !path.isAbsolute(relativeToHome)) {
    return `~/${relativeToHome}`;
  }
  return fullPath;
}

function stripQuotes(value) {
  const trimmed = String(value || "").trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvFile(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = stripQuotes(match[2].replace(/\s+#.*$/, ""));
  }
  return values;
}

function isPlaceholder(key, value) {
  if (!value) return true;
  if (value.includes("$(")) return true;
  if (value.startsWith("REPLACE_WITH_")) return true;
  if (value === "APP_TOKEN_RELEASE" || value === "RELEASE_BACKEND_URL") return true;
  if (key === "BACKEND_URL" && value === "https://api.example.com") return true;
  return false;
}

function keyStatus(key, value) {
  if (isPlaceholder(key, value)) {
    return {
      key,
      status: "missing_or_placeholder",
      detail: `${key} is missing or placeholder`,
    };
  }
  if (key === "BACKEND_URL") {
    if (/^https?:\/\/(localhost|127\.0\.0\.1|\[?::1\]?)(?::|\/|$)/i.test(value)) {
      return {
        key,
        status: "invalid",
        detail: "BACKEND_URL must be hosted for Release, not localhost",
      };
    }
    if (!value.startsWith("https://")) {
      return {
        key,
        status: "invalid",
        detail: "BACKEND_URL must use https:// for Release",
      };
    }
  }
  return {
    key,
    status: "present",
    detail: key === "APP_TOKEN" ? "APP_TOKEN is present (redacted)" : `${key} is present`,
  };
}

function modeInfo(filePath) {
  try {
    const mode = fs.statSync(filePath).mode & 0o777;
    return {
      mode: mode.toString(8).padStart(3, "0"),
      warning: (mode & 0o077) !== 0 ? "file is readable by group/others; run chmod 600" : "",
    };
  } catch {
    return { mode: "", warning: "" };
  }
}

function makeStatus(filePath) {
  const displayedPath = displayPath(filePath);
  if (!fs.existsSync(filePath)) {
    return {
      blockers: [`missing local release config: ${displayedPath}`],
      envFile: displayedPath,
      keys: requiredKeys.map((key) => keyStatus(key, "")),
      mode: "",
      overall: "missing",
      warnings: [],
    };
  }

  const parsed = parseEnvFile(fs.readFileSync(filePath, "utf8"));
  const keys = requiredKeys.map((key) => keyStatus(key, parsed[key] || ""));
  const blockers = keys
    .filter((item) => item.status !== "present")
    .map((item) => item.detail);
  const mode = modeInfo(filePath);
  const warnings = mode.warning ? [mode.warning] : [];
  return {
    blockers,
    envFile: displayedPath,
    keys,
    mode: mode.mode,
    overall: blockers.length ? "blocked" : "ready",
    warnings,
  };
}

function text(status) {
  const lines = [
    "Release local config status",
    `- File: ${status.envFile}`,
    `- Overall: ${status.overall}`,
  ];
  if (status.mode) lines.push(`- Mode: ${status.mode}`);
  for (const item of status.keys) {
    lines.push(`- ${item.key}: ${item.status === "present" ? item.detail : item.detail}`);
  }
  if (status.warnings.length) {
    lines.push("Warnings:");
    for (const warning of status.warnings) lines.push(`- ${warning}`);
  }
  if (status.blockers.length) {
    lines.push("Blockers:");
    for (const blocker of status.blockers) lines.push(`- ${blocker}`);
    lines.push("Next:");
    lines.push("- cp them/Release.local.env.example them/Release.local.env");
    lines.push("- chmod 600 them/Release.local.env");
    lines.push("- Fill DEVELOPMENT_TEAM_ID, BACKEND_URL, and APP_TOKEN, then run scripts/run_release_preflight.sh");
  }
  return lines.join("\n");
}

const status = makeStatus(envFile);
if (wantJson) {
  console.log(JSON.stringify(status, null, 2));
} else {
  console.log(text(status));
}

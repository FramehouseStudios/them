#!/usr/bin/env node
//
// scripts/release_config_status.mjs
//
// Secret-safe Day 14 release config status. It checks the private release
// inputs without printing token values, then compares them with the Xcode
// Release build settings that App Store preflight will use.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const defaultEnvFile = path.join(repoRoot, "them", "Release.local.env");
const defaultEnvExampleFile = path.join(repoRoot, "them", "Release.local.env.example");
const projectPath = path.join(repoRoot, "them.xcodeproj");

function parseArgs(argv) {
  const opts = {
    envFile: defaultEnvFile,
    json: false,
    noXcodebuild: false,
  };
  for (const arg of argv) {
    if (arg === "--json") opts.json = true;
    else if (arg === "--no-xcodebuild") opts.noXcodebuild = true;
    else if (arg.startsWith("--release-env-file=")) {
      opts.envFile = path.resolve(repoRoot, arg.slice("--release-env-file=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function trimQuotes(value) {
  let out = String(value ?? "").trim();
  if (out.endsWith(";")) out = out.slice(0, -1).trim();
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
    out = out.slice(1, -1);
  }
  return out.trim();
}

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = trimQuotes(match[2]);
  }
  return values;
}

function rel(file) {
  const relative = path.relative(repoRoot, file);
  return relative && !relative.startsWith("..") ? relative : file;
}

function valueFrom(key, fileValues, envFile) {
  const fromEnv = trimQuotes(process.env[key]);
  if (fromEnv) return { value: fromEnv, source: "environment" };
  const fromFile = trimQuotes(fileValues[key]);
  if (fromFile) return { value: fromFile, source: rel(envFile) };
  return { value: "", source: "unset" };
}

function isPlaceholder(value) {
  const v = trimQuotes(value);
  return !v
    || v.includes("REPLACE_WITH")
    || v.includes("yourdomain")
    || v.includes("$(");
}

function isLocalhostUrl(value) {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function describeSecret(value, source) {
  const v = trimQuotes(value);
  return {
    present: Boolean(v),
    source,
    length: v.length,
  };
}

function gitCheckIgnore(file) {
  const result = spawnSync("git", ["-C", repoRoot, "check-ignore", "-q", rel(file)], {
    encoding: "utf8",
  });
  return result.status === 0;
}

function parseBuildSettings(text) {
  const settings = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) settings[match[1]] = trimQuotes(match[2]);
  }
  return settings;
}

function parseProjectReleaseBuildSettings() {
  const pbxproj = path.join(projectPath, "project.pbxproj");
  if (!fs.existsSync(pbxproj)) return {};
  const text = fs.readFileSync(pbxproj, "utf8");
  const blocks = [...text.matchAll(/\/\* Release \*\/ = \{[\s\S]*?buildSettings = \{([\s\S]*?)\n\t\t\t\};[\s\S]*?name = Release;/g)];
  for (const block of blocks) {
    const settings = parseBuildSettings(block[1]);
    if (settings.INFOPLIST_FILE === "them/Info-Release.plist" || settings.BACKEND_URL) {
      return settings;
    }
  }
  return {};
}

function loadReleaseBuildSettings({ team, backendUrl, appToken }) {
  const args = [
    "-project",
    projectPath,
    "-scheme",
    "them",
    "-configuration",
    "Release",
    "-sdk",
    "iphoneos",
    "-showBuildSettings",
  ];
  if (team) args.push(`DEVELOPMENT_TEAM_ID=${team}`);
  if (backendUrl) args.push(`BACKEND_URL=${backendUrl}`);
  if (appToken) args.push(`APP_TOKEN_RELEASE=${appToken}`);

  const result = spawnSync("xcodebuild", args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.status !== 0) {
    const fallbackSettings = parseProjectReleaseBuildSettings();
    return {
      ok: false,
      fallback: Object.keys(fallbackSettings).length > 0,
      error: (result.stderr || result.stdout || "xcodebuild -showBuildSettings failed").trim(),
      settings: fallbackSettings,
    };
  }
  return {
    ok: true,
    error: "",
    settings: parseBuildSettings(result.stdout),
  };
}

function makeCheck(id, ok, message, details = {}) {
  return { id, ok, message, ...details };
}

function buildStatus(opts) {
  const envFile = opts.envFile;
  const envFileValues = parseEnvFile(envFile);
  const envFileExists = fs.existsSync(envFile);
  const defaultEnvFileIgnored = gitCheckIgnore(defaultEnvFile);
  const defaultEnvExampleExists = fs.existsSync(defaultEnvExampleFile);

  const teamInput = valueFrom("DEVELOPMENT_TEAM_ID", envFileValues, envFile);
  const backendInput = valueFrom("BACKEND_URL", envFileValues, envFile);
  const tokenInput = valueFrom("APP_TOKEN_RELEASE", envFileValues, envFile);

  const xcode = opts.noXcodebuild
    ? { ok: true, skipped: true, settings: {}, error: "" }
    : loadReleaseBuildSettings({
      team: teamInput.value,
      backendUrl: backendInput.value,
      appToken: tokenInput.value,
    });

  const releaseTeam = trimQuotes(xcode.settings.DEVELOPMENT_TEAM || teamInput.value);
  const releaseBackendUrl = trimQuotes(xcode.settings.BACKEND_URL || backendInput.value);
  const releaseAppToken = trimQuotes(xcode.settings.APP_TOKEN || tokenInput.value);
  const buildSettingsSource = xcode.ok
    ? "Xcode Release build settings"
    : xcode.fallback
      ? "project Release build settings fallback"
      : "Xcode Release build settings";

  const checks = [];

  const directPrivateValuesAvailable = Boolean(teamInput.value && tokenInput.value);
  checks.push(makeCheck(
    "release-env-file",
    envFileExists || directPrivateValuesAvailable,
    envFileExists
      ? `Release env file exists at ${rel(envFile)}.`
      : "No release env file found; using shell environment only if required private values are exported.",
    {
      path: rel(envFile),
      exists: envFileExists,
      defaultPathIgnored: defaultEnvFileIgnored,
    },
  ));

  checks.push(makeCheck(
    "release-env-file-ignored",
    defaultEnvFileIgnored,
    defaultEnvFileIgnored
      ? "them/Release.local.env is ignored by git."
      : "them/Release.local.env is not ignored by git.",
    { path: "them/Release.local.env" },
  ));

  const teamOk = !isPlaceholder(releaseTeam) && /^[A-Z0-9]{10}$/.test(releaseTeam);
  checks.push(makeCheck(
    "development-team",
    teamOk,
    teamOk
      ? "Apple Development Team ID is configured."
      : "Apple Development Team ID is missing or not a 10-character team id.",
    {
      value: releaseTeam ? `${releaseTeam.slice(0, 3)}...${releaseTeam.slice(-2)}` : "",
      source: teamInput.source,
    },
  ));

  let backendOk = false;
  let backendMessage = "Release BACKEND_URL is missing.";
  if (!isPlaceholder(releaseBackendUrl)) {
    try {
      const url = new URL(releaseBackendUrl);
      if (url.protocol !== "https:") {
        backendMessage = "Release BACKEND_URL must use HTTPS.";
      } else if (isLocalhostUrl(releaseBackendUrl)) {
        backendMessage = "Release BACKEND_URL must not point to localhost.";
      } else {
        backendOk = true;
        backendMessage = "Release BACKEND_URL is hosted and HTTPS.";
      }
    } catch {
      backendMessage = "Release BACKEND_URL is not a valid URL.";
    }
  }
  checks.push(makeCheck(
    "backend-url",
    backendOk,
    backendMessage,
    { value: releaseBackendUrl, source: backendInput.value ? backendInput.source : buildSettingsSource },
  ));

  const tokenOk = !isPlaceholder(releaseAppToken) && releaseAppToken.length >= 16;
  checks.push(makeCheck(
    "app-token-release",
    tokenOk,
    tokenOk
      ? "Release APP_TOKEN is configured."
      : "Release APP_TOKEN is missing, placeholder, or too short for production.",
    { secret: describeSecret(releaseAppToken, tokenInput.source) },
  ));

  const buildSettingsUsable = Boolean(xcode.ok || xcode.skipped || xcode.fallback);
  checks.push(makeCheck(
    "xcode-release-settings",
    buildSettingsUsable,
    xcode.skipped
      ? "Skipped Xcode Release build-settings check."
      : xcode.ok
        ? "Xcode Release build settings loaded."
        : xcode.fallback
          ? "Xcode Release build settings unavailable; parsed project Release settings as fallback."
          : "Could not load Xcode Release build settings.",
    buildSettingsUsable
      ? { skipped: Boolean(xcode.skipped), fallback: Boolean(xcode.fallback) }
      : { error: xcode.error.slice(0, 800) },
  ));

  const warnings = [
    "Signing identity and App Store Connect archive validation are not proven by this status script; run the signed archive/upload path after config preflight is green.",
  ];
  if (!xcode.ok && xcode.fallback) {
    warnings.push("xcodebuild -showBuildSettings was unavailable, so release config status used the checked-in project file fallback. scripts/run_release_preflight.sh still runs the real Xcode preflight.");
  }
  const blockers = checks.filter((check) => !check.ok).map((check) => check.message);
  return {
    ok: blockers.length === 0,
    generatedAt: new Date().toISOString(),
    envFile: {
      path: rel(envFile),
      exists: envFileExists,
      defaultPathIgnored: defaultEnvFileIgnored,
      examplePath: rel(defaultEnvExampleFile),
      exampleExists: defaultEnvExampleExists,
    },
    checks,
    blockers,
    warnings,
    nextCommand: "scripts/run_release_preflight.sh",
  };
}

function printText(status) {
  console.log("=== Release Config Status ===");
  console.log(`Generated: ${status.generatedAt}`);
  console.log(`Env file: ${status.envFile.path} (${status.envFile.exists ? "present" : "missing"}, default ignored: ${status.envFile.defaultPathIgnored ? "yes" : "no"}, template: ${status.envFile.exampleExists ? status.envFile.examplePath : "missing"})`);
  console.log("");
  for (const check of status.checks) {
    const prefix = check.ok ? "[OK]" : "[FAIL]";
    console.log(`${prefix} ${check.message}`);
  }
  for (const warning of status.warnings) {
    console.log(`[WARN] ${warning}`);
  }
  console.log("");
  console.log(`Summary: ${status.ok ? "ready" : "blocked"} (${status.blockers.length} blocker${status.blockers.length === 1 ? "" : "s"})`);
  if (!status.ok) {
    const failedIds = new Set(status.checks.filter((check) => !check.ok).map((check) => check.id));
    const missingInputs = [
      failedIds.has("development-team") ? "DEVELOPMENT_TEAM_ID" : "",
      failedIds.has("backend-url") ? "BACKEND_URL" : "",
      failedIds.has("app-token-release") ? "APP_TOKEN_RELEASE" : "",
    ].filter(Boolean);
    console.log("");
    if (missingInputs.length > 0) {
      console.log("Required private release inputs still missing or invalid:");
      for (const input of missingInputs) {
        console.log(`- ${input}`);
      }
    } else {
      console.log("Fix the failed release config checks above, then rerun this status command.");
    }
  }
  console.log("");
  console.log(`Next: ${status.nextCommand}`);
}

try {
  const opts = parseArgs(process.argv.slice(2));
  const status = buildStatus(opts);
  if (opts.json) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    printText(status);
  }
  process.exit(status.ok ? 0 : 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

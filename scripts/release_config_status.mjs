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

function inspectPrivateEnvFile(file) {
  try {
    const stat = fs.lstatSync(file);
    const mode = stat.mode & 0o777;
    const regularFile = stat.isFile();
    const symlink = stat.isSymbolicLink();
    return {
      exists: true,
      regularFile,
      symlink,
      mode,
      secure: regularFile && !symlink && mode === 0o600,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        exists: false,
        regularFile: false,
        symlink: false,
        mode: null,
        secure: false,
      };
    }
    throw error;
  }
}

function parseEnvFile(file, inspection = inspectPrivateEnvFile(file)) {
  if (!inspection.secure) return {};
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
  const placeholder = isPlaceholder(v);
  return {
    present: Boolean(v) && !placeholder,
    placeholder,
    source,
    length: v.length,
  };
}

function isValidPrivateSecret(value, minimumLength = 16) {
  const v = trimQuotes(value);
  return !isPlaceholder(v)
    && v.length >= minimumLength
    && !/[\s\u0000-\u001f\u007f]/u.test(v);
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

function loadReleaseBuildSettings({ team }) {
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
  const envFileInspection = inspectPrivateEnvFile(envFile);
  const envFileValues = parseEnvFile(envFile, envFileInspection);
  const envFileExists = envFileInspection.exists;
  const defaultEnvFileIgnored = gitCheckIgnore(defaultEnvFile);
  const defaultEnvExampleExists = fs.existsSync(defaultEnvExampleFile);

  const teamInput = valueFrom("DEVELOPMENT_TEAM_ID", envFileValues, envFile);
  const backendInput = valueFrom("BACKEND_URL", envFileValues, envFile);
  const tokenInput = valueFrom("APP_TOKEN_RELEASE", envFileValues, envFile);
  const openAIInput = valueFrom("OPENAI_API_KEY", envFileValues, envFile);

  const xcode = opts.noXcodebuild
    ? { ok: true, skipped: true, settings: {}, error: "" }
    : loadReleaseBuildSettings({
      team: teamInput.value,
    });

  const releaseTeam = trimQuotes(xcode.settings.DEVELOPMENT_TEAM || teamInput.value);
  // The planned env-file value is authoritative because the release wrapper
  // persists it into Release.local.xcconfig before building. Never validate a
  // one-off xcodebuild override that a later Organizer archive would not use.
  const releaseBackendUrl = trimQuotes(backendInput.value || xcode.settings.BACKEND_URL);
  // Never place APP_TOKEN_RELEASE in xcodebuild argv, where process listings can
  // expose it. Direct secret input is authoritative; the ignored xcconfig is
  // the canonical bridge when Xcode itself must consume the value.
  const releaseAppToken = !isPlaceholder(tokenInput.value)
    ? tokenInput.value
    : trimQuotes(xcode.settings.APP_TOKEN);
  const buildSettingsSource = xcode.ok
    ? "Xcode Release build settings"
    : xcode.fallback
      ? "project Release build settings fallback"
      : "Xcode Release build settings";

  const checks = [];

  const directPrivateValuesAvailable = Boolean(
    teamInput.value && tokenInput.value && openAIInput.value,
  );
  checks.push(makeCheck(
    "release-env-file",
    envFileExists || directPrivateValuesAvailable,
    envFileExists
      ? `Release env file exists at ${rel(envFile)}.`
      : `missing local release config: ${rel(envFile)}. Create it from ${rel(defaultEnvExampleFile)} or export required private values in the shell.`,
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

  const envFileSecurityOk = !envFileExists || envFileInspection.secure;
  let envFileSecurityMessage = "Release env file is absent; shell-only input has no local file to validate.";
  if (envFileExists && envFileInspection.secure) {
    envFileSecurityMessage = `Release env file is a regular non-symlink file with mode 600: ${rel(envFile)}.`;
  } else if (envFileInspection.symlink) {
    envFileSecurityMessage = `Release env file must not be a symlink: ${rel(envFile)}.`;
  } else if (envFileExists && !envFileInspection.regularFile) {
    envFileSecurityMessage = `Release env path must be a regular file: ${rel(envFile)}.`;
  } else if (envFileExists) {
    envFileSecurityMessage = `Release env file must have mode 600 (found ${(envFileInspection.mode ?? 0).toString(8)}): ${rel(envFile)}.`;
  }
  checks.push(makeCheck(
    "release-env-file-security",
    envFileSecurityOk,
    envFileSecurityMessage,
    {
      path: rel(envFile),
      exists: envFileExists,
      regularFile: envFileInspection.regularFile,
      symlink: envFileInspection.symlink,
      mode: envFileInspection.mode === null ? "" : envFileInspection.mode.toString(8),
    },
  ));

  const teamOk = !isPlaceholder(releaseTeam) && /^[A-Z0-9]{10}$/.test(releaseTeam);
  checks.push(makeCheck(
    "development-team",
    teamOk,
    teamOk
      ? "Apple Development Team ID is configured."
      : "Apple Development Team ID is missing or not a 10-character team id.",
    {
      value: teamOk ? `${releaseTeam.slice(0, 3)}...${releaseTeam.slice(-2)}` : "",
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
        backendMessage = "Release BACKEND_URL is a non-local HTTPS URL (string check only; reachability is proven by the live backend health step).";
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

  const tokenOk = isValidPrivateSecret(releaseAppToken);
  checks.push(makeCheck(
    "app-token-release",
    tokenOk,
    tokenOk
      ? "Release APP_TOKEN_RELEASE is configured."
      : "Release APP_TOKEN_RELEASE is missing, placeholder, or too short for production.",
    { secret: describeSecret(releaseAppToken, tokenInput.source) },
  ));

  const openAIOk = isValidPrivateSecret(openAIInput.value);
  checks.push(makeCheck(
    "openai-api-key",
    openAIOk,
    openAIOk
      ? "OPENAI_API_KEY is configured for enabled release gates."
      : "OPENAI_API_KEY is missing, placeholder, too short, or contains whitespace/control characters.",
    { secret: describeSecret(openAIInput.value, openAIInput.source) },
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
  const failedIds = new Set(checks.filter((check) => !check.ok).map((check) => check.id));
  const missingInputs = [
    failedIds.has("release-env-file") || failedIds.has("release-env-file-security") ? rel(envFile) : "",
    failedIds.has("development-team") ? "DEVELOPMENT_TEAM_ID" : "",
    failedIds.has("backend-url") ? "BACKEND_URL" : "",
    failedIds.has("app-token-release") ? "APP_TOKEN_RELEASE" : "",
    failedIds.has("openai-api-key") ? "OPENAI_API_KEY" : "",
  ].filter(Boolean);
  const nextSteps = [];
  if (failedIds.has("release-env-file")) {
    nextSteps.push(`Create ${rel(envFile)} from ${rel(defaultEnvExampleFile)}.`);
    nextSteps.push(`Set permissions with: chmod 600 ${rel(envFile)}`);
  } else if (failedIds.has("release-env-file-security")) {
    nextSteps.push(envFileInspection.symlink
      ? `Replace ${rel(envFile)} with a regular file, then run: chmod 600 ${rel(envFile)}`
      : `Set permissions with: chmod 600 ${rel(envFile)}`);
  }
  if (missingInputs.some((input) => input !== rel(envFile))) {
    nextSteps.push(`Fill missing private inputs: ${missingInputs.filter((input) => input !== rel(envFile)).join(", ")}.`);
  }
  nextSteps.push("Run scripts/run_release_preflight.sh.");

  return {
    ok: blockers.length === 0,
    generatedAt: new Date().toISOString(),
    envFile: {
      path: rel(envFile),
      exists: envFileExists,
      regularFile: envFileInspection.regularFile,
      symlink: envFileInspection.symlink,
      mode: envFileInspection.mode === null ? "" : envFileInspection.mode.toString(8),
      secure: envFileInspection.secure,
      defaultPathIgnored: defaultEnvFileIgnored,
      examplePath: rel(defaultEnvExampleFile),
      exampleExists: defaultEnvExampleExists,
    },
    checks,
    blockers,
    warnings,
    missingInputs,
    nextSteps,
    nextCommand: nextSteps[0],
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
    console.log("");
    if (status.missingInputs.length > 0) {
      console.log("Release setup still missing or invalid:");
      for (const input of status.missingInputs) {
        console.log(`- ${input}`);
      }
    } else {
      console.log("Fix the failed release config checks above, then rerun this status command.");
    }
  }
  console.log("");
  console.log("Next steps:");
  for (const step of status.nextSteps) {
    console.log(`- ${step}`);
  }
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

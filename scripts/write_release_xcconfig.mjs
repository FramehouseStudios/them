#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = path.join(repoRoot, "them", "Release.local.xcconfig");

function readArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
}

function fail(message) {
  console.error(`[release-xcconfig] ${message}`);
  process.exit(1);
}

const team = String(process.env.DEVELOPMENT_TEAM_ID || "").trim();
const token = String(process.env.APP_TOKEN_RELEASE || "").trim();
const backend = String(process.env.BACKEND_URL || "").trim();
const outputArg = readArg("output");
const output = outputArg ? path.resolve(repoRoot, outputArg) : defaultOutput;

if (!/^[A-Z0-9]{10}$/.test(team)) {
  fail("DEVELOPMENT_TEAM_ID must be a 10-character Apple Team ID.");
}
if (!/^[A-Za-z0-9._~-]{16,512}$/.test(token)) {
  fail("APP_TOKEN_RELEASE must be 16-512 URL-safe characters; whitespace and xcconfig control syntax are not allowed.");
}
let backendURL;
try {
  backendURL = new URL(backend);
} catch {
  fail("BACKEND_URL must be a valid HTTPS origin URL.");
}
const backendHost = backendURL.hostname.toLowerCase();
if (
  backendURL.protocol !== "https:"
  || backendURL.username
  || backendURL.password
  || backendURL.search
  || backendURL.hash
  || !["", "/"].includes(backendURL.pathname)
  || ["localhost", "127.0.0.1", "::1"].includes(backendHost)
  || backendHost.endsWith(".localhost")
  || /[\s$;#\\]/.test(backend)
) {
  fail("BACKEND_URL must be a hosted HTTPS origin without credentials, path, query, fragment, whitespace, or xcconfig control syntax.");
}
if (path.dirname(output) !== path.join(repoRoot, "them")) {
  fail("output must stay inside the repo's them/ directory.");
}

const body = [
  "// Generated from ignored Release.local.env by scripts/write_release_xcconfig.mjs.",
  "// Contains private release values. Never commit this file.",
  `DEVELOPMENT_TEAM_ID = ${team}`,
  `APP_TOKEN_RELEASE = ${token}`,
  // xcconfig treats // as a comment; an empty expansion preserves :// safely.
  `BACKEND_URL = ${backend.replace("://", ":/$()/")}`,
  "",
].join("\n");

const temporary = `${output}.${process.pid}.${randomUUID()}.tmp`;
let fd;
try {
  fd = fs.openSync(temporary, "wx", 0o600);
  fs.writeFileSync(fd, body, { encoding: "utf8" });
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  fd = undefined;
  fs.renameSync(temporary, output);
  fs.chmodSync(output, 0o600);
} catch (error) {
  if (fd !== undefined) fs.closeSync(fd);
  fs.rmSync(temporary, { force: true });
  fail(`could not atomically write ${path.relative(repoRoot, output)}: ${error.message}`);
}
console.log(`[release-xcconfig] wrote ${path.relative(repoRoot, output)} with mode 600 (values redacted).`);

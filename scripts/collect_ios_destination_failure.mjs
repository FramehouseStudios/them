#!/usr/bin/env node
// Failure-only, metadata-only destination diagnostics. Never persist raw tool output.
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const [xcode, xcrun, project, scheme, configuration, udid, artifactDir] = process.argv.slice(2);
const limitMs = 5000;
const maxBytes = 1024 * 1024;

function run(bin, args) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(bin, args, { detached: true, stdio: ["ignore", "pipe", "pipe"] }); }
    catch { resolve({ status: "start_failed" }); return; }
    let output = "", finished = false;
    const finish = (status) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      child.stdout?.destroy(); child.stderr?.destroy(); child.unref();
      resolve({ status, output });
    };
    const stop = (status) => {
      try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch {} }
      finish(status);
    };
    const timer = setTimeout(() => stop("timeout"), limitMs);
    for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
      output += chunk.toString("utf8");
      if (Buffer.byteLength(output) > maxBytes) stop("output_limit");
    });
    child.on("error", () => finish("start_failed"));
    child.on("close", code => finish(code === 0 ? "ok" : "failed"));
  });
}

// Only a small fixed vocabulary is retained from untrusted tool error strings.
function reason(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const s = value.toLowerCase();
  if (s.includes("runtime") && (s.includes("not available") || s.includes("unavailable") || s.includes("missing"))) return "runtime unavailable";
  if (s.includes("not installed")) return "not installed";
  if (s.includes("installing")) return "installing";
  if (s.includes("downloading")) return "downloading";
  if (s.includes("not supported")) return "not supported";
  if (s.includes("not available") || s.includes("unavailable")) return "unavailable";
  return "other (redacted)";
}
function parsed(result) { try { return result.status === "ok" ? JSON.parse(result.output) : null; } catch { return null; } }
function safeID(s) { return typeof s === "string" && /^[A-Za-z0-9.-]{1,120}$/.test(s) ? s : null; }
function safeVersion(s) { return typeof s === "string" && /^\d+(?:\.\d+){0,3}$/.test(s) ? s : null; }

const version = await run(xcode, ["-version"]);
const devices = await run(xcrun, ["simctl", "list", "devices", "--json"]);
const runtimes = await run(xcrun, ["simctl", "list", "runtimes", "--json"]);
const destinations = await run(xcode, ["-showdestinations", "-project", project, "-scheme", scheme, "-configuration", configuration]);
const vm = version.output.match(/(?:^|\n)Xcode\s+(\d+(?:\.\d+){0,3})\s*\nBuild version\s+([A-Za-z0-9]+)(?:\s|$)/);
const d = parsed(devices), selected = [];
for (const [runtime, items] of Object.entries(d?.devices ?? {})) {
  if (!Array.isArray(items)) continue;
  for (const device of items) if (device.udid === udid) selected.push({ runtime: safeID(runtime), state: ["Booted", "Shutdown", "Shutting Down", "Creating"].includes(device.state) ? device.state : "other", available: typeof device.isAvailable === "boolean" ? device.isAvailable : null, unavailableReason: reason(device.availabilityError) });
}
const r = parsed(runtimes), iosRuntimes = [];
for (const runtime of r?.runtimes ?? []) {
  if (!String(runtime.identifier ?? "").startsWith("com.apple.CoreSimulator.SimRuntime.iOS-")) continue;
  iosRuntimes.push({ identifier: safeID(runtime.identifier), version: safeVersion(runtime.version), available: typeof runtime.isAvailable === "boolean" ? runtime.isAvailable : null, unavailableReason: reason(runtime.availabilityError) });
}
// Xcode output can contain project paths and unrelated device names. Retain only
// whether the exact ID was listed and a classified reason, never the line itself.
const matches = destinations.output.split(/\r?\n/).filter(line => line.includes(udid));
const destination = { listed: destinations.status === "ok" ? matches.length > 0 : null, unavailableReason: matches.map(line => line.match(/error:\s*([^}]+)/i)?.[1]).map(reason).find(Boolean) ?? null };
const report = { schema: 1, triggeringExit: 70, simulatorID: safeID(udid), toolchain: { status: version.status, xcodeVersion: vm?.[1] ?? null, buildVersion: vm?.[2] ?? null }, devices: { status: devices.status, selected }, runtimes: { status: runtimes.status, ios: iosRuntimes }, destinations: { status: destinations.status, ...destination }, limits: { perCommandSeconds: 5, maxBytesPerCommand: maxBytes, rawOutputRetained: false } };
await writeFile(path.join(artifactDir, `v1-destination-failure-${process.pid}.json`), JSON.stringify(report, null, 2) + "\n", { mode: 0o600, flag: "wx" });

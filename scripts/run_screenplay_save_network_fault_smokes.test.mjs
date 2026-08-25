import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts", "run_screenplay_save_network_fault_smokes.sh");

function runSmoke({ withXcconfig = true } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-save-network-fault-"));
  const log = path.join(tmp, "xcodebuild.calls");
  const fakeXcodebuild = path.join(tmp, "xcodebuild");
  const xcconfig = path.join(tmp, "save fault.xcconfig");
  if (withXcconfig) {
    fs.writeFileSync(xcconfig, "THEM_UITEST_SCREENPLAY_SAVE_BACKEND_PORT = 31337\n");
  }
  fs.writeFileSync(fakeXcodebuild, [
    "#!/usr/bin/env bash",
    "printf '%s\\n' '--- call ---' >> \"$XCODEBUILD_CALLS_LOG\"",
    "printf '%s\\n' \"$@\" >> \"$XCODEBUILD_CALLS_LOG\"",
    "exit 0",
    "",
  ].join("\n"));
  fs.chmodSync(fakeXcodebuild, 0o755);

  const destination = "platform=iOS Simulator,id=deterministic-save-fault-smoke";
  const result = spawnSync("/bin/bash", [script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      XCODEBUILD: fakeXcodebuild,
      XCODEBUILD_CALLS_LOG: log,
      IOS_SIMULATOR_DESTINATION: destination,
      THEM_UITEST_SCREENPLAY_SAVE_XCCONFIG_PATH: withXcconfig ? xcconfig : "",
    },
    encoding: "utf8",
  });

  const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf8")
    .split("--- call ---\n")
    .map((entry) => entry.trim().split("\n").filter(Boolean))
    .filter((entry) => entry.length > 0) : [];
  fs.rmSync(tmp, { recursive: true, force: true });
  return { calls, destination, result, xcconfig };
}

test("[screenplay-save-network-fault-smokes] runs the recovery UI smoke on iPhone and macOS", () => {
  const { calls, destination, result, xcconfig } = runSmoke();

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Screenplay Save Network-Fault Smokes/);
  assert.match(result.stdout, /recover exactly once across reconnect, expired auth, and stale-version resolution/);
  assert.equal(calls.length, 2);

  const [ios, macos] = calls;
  assert.ok(ios.includes(destination));
  assert.ok(ios.includes("them"));
  assert.ok(ios.includes("Debug"));
  assert.ok(macos.includes("platform=macOS"));
  assert.ok(macos.includes("them-macOS-scaffold"));
  assert.ok(macos.includes("Mac Scaffold Debug"));
  assert.ok(macos.includes("ENABLE_APP_SANDBOX=NO"));

  for (const call of calls) {
    assert.ok(call.includes("test"));
    assert.ok(call.includes("-xcconfig"));
    assert.ok(call.includes(xcconfig));
    assert.ok(call.includes("-only-testing:themUITests/V1SmokeUITests/test_screenplay_save_outbox_survives_relaunch_and_reconnects_once"));
    assert.ok(call.includes("-only-testing:themUITests/V1SmokeUITests/test_screenplay_save_outbox_refreshes_auth_and_resolves_stale_conflict_once"));
  }
});

test("[screenplay-save-network-fault-smokes] runs without an optional xcconfig under nounset", () => {
  const { calls, result } = runSmoke({ withXcconfig: false });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.ok(call.includes("test"));
    assert.equal(call.includes("-xcconfig"), false);
  }
});

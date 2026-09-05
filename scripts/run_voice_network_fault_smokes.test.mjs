import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts", "run_voice_network_fault_smokes.sh");

test("[voice-network-fault-smokes] runs one focused UI smoke on iPhone and macOS", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-network-fault-smokes-"));
  const log = path.join(tmp, "xcodebuild.calls");
  const fakeXcodebuild = path.join(tmp, "xcodebuild");
  fs.writeFileSync(fakeXcodebuild, [
    "#!/usr/bin/env bash",
    "printf '%s\\n' '--- call ---' >> \"$XCODEBUILD_CALLS_LOG\"",
    "printf '%s\\n' \"$@\" >> \"$XCODEBUILD_CALLS_LOG\"",
    "exit 0",
    "",
  ].join("\n"));
  fs.chmodSync(fakeXcodebuild, 0o755);

  const destination = "platform=iOS Simulator,id=deterministic-network-fault-smoke";
  const result = spawnSync("bash", [script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      XCODEBUILD: fakeXcodebuild,
      XCODEBUILD_CALLS_LOG: log,
      IOS_SIMULATOR_DESTINATION: destination,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Voice Network-Fault Smokes/);
  assert.match(result.stdout, /speech\/transcription\/thinking\/playback fault smokes pass/);

  const calls = fs.readFileSync(log, "utf8")
    .split("--- call ---\n")
    .map((entry) => entry.trim().split("\n").filter(Boolean))
    .filter((entry) => entry.length > 0);
  assert.equal(calls.length, 2);

  const [ios, macos] = calls;
  assert.ok(ios.includes("-scheme"));
  assert.ok(ios.includes("them"));
  assert.ok(ios.includes("-configuration"));
  assert.ok(ios.includes("Debug"));
  assert.ok(ios.includes(destination));
  assert.deepEqual(
    ios.slice(ios.indexOf("-parallel-testing-enabled"), ios.indexOf("-parallel-testing-enabled") + 2),
    ["-parallel-testing-enabled", "NO"],
  );
  assert.deepEqual(
    ios.slice(
      ios.indexOf("-maximum-concurrent-test-simulator-destinations"),
      ios.indexOf("-maximum-concurrent-test-simulator-destinations") + 2,
    ),
    ["-maximum-concurrent-test-simulator-destinations", "1"],
  );

  assert.ok(macos.includes("-scheme"));
  assert.ok(macos.includes("them-macOS-scaffold"));
  assert.ok(macos.includes("-configuration"));
  assert.ok(macos.includes("Mac Scaffold Debug"));
  assert.ok(macos.includes("platform=macOS"));
  assert.ok(macos.includes("CODE_SIGN_STYLE=Manual"));
  assert.ok(macos.includes("CODE_SIGN_IDENTITY=-"));
  assert.ok(macos.includes("CODE_SIGN_ENTITLEMENTS="));
  assert.ok(macos.includes("ENABLE_APP_SANDBOX=NO"));
  assert.ok(macos.includes("REGISTER_APP_GROUPS=NO"));

  for (const call of calls) {
    assert.ok(call.includes("test"));
    assert.ok(call.includes(`-only-testing:themUITests/V1SmokeUITests/test_realtime_network_faults_resolve_exactly_once`));
  }
  assert.equal(ios.includes("CODE_SIGNING_ALLOWED=NO"), false);
  assert.equal(ios.includes("CODE_SIGNING_REQUIRED=NO"), false);
});

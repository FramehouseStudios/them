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

function runSmoke({
  withXcconfig = true,
  includeMacOS = "1",
  destination = "platform=iOS Simulator,name=iPhone 17 Pro",
  resultBundlePath = "",
} = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-save-network-fault-"));
  const log = path.join(tmp, "xcodebuild.calls");
  const callOrderLog = path.join(tmp, "calls.log");
  const fakeXcodebuild = path.join(tmp, "xcodebuild");
  const fakeXcrun = path.join(tmp, "xcrun");
  const xcconfig = path.join(tmp, "save fault.xcconfig");
  if (withXcconfig) {
    fs.writeFileSync(xcconfig, "THEM_UITEST_SCREENPLAY_SAVE_BACKEND_PORT = 31337\n");
  }
  fs.writeFileSync(fakeXcodebuild, [
    "#!/usr/bin/env bash",
    "printf 'xcodebuild\\n' >> \"$TEST_CALL_ORDER_LOG\"",
    "printf '%s\\n' '--- call ---' >> \"$XCODEBUILD_CALLS_LOG\"",
    "printf '%s\\n' \"$@\" >> \"$XCODEBUILD_CALLS_LOG\"",
    "exit 0",
    "",
  ].join("\n"));
  fs.chmodSync(fakeXcodebuild, 0o755);
  fs.writeFileSync(fakeXcrun, [
    "#!/usr/bin/env bash",
    "printf 'xcrun %s\\n' \"$*\" >> \"$TEST_CALL_ORDER_LOG\"",
    "printf 'xcrun %s\\n' \"$*\" >> \"$XCRUN_CALLS_LOG\"",
    "if [[ \"$*\" == 'simctl list devices available' ]]; then printf '    iPhone 17 Pro (B76CE387-1D78-4B37-AD14-4A9F67002B61) (Shutdown)\\n'; fi",
    "exit 0",
    "",
  ].join("\n"));
  fs.chmodSync(fakeXcrun, 0o755);

  const result = spawnSync("/bin/bash", [script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      XCODEBUILD: fakeXcodebuild,
      XCODEBUILD_CALLS_LOG: log,
      XCRUN: fakeXcrun,
      XCRUN_CALLS_LOG: path.join(tmp, "xcrun.calls"),
      TEST_CALL_ORDER_LOG: callOrderLog,
      IOS_SIMULATOR_DESTINATION: destination,
      THEM_UITEST_SCREENPLAY_SAVE_XCCONFIG_PATH: withXcconfig ? xcconfig : "",
      SCREENPLAY_SAVE_INCLUDE_MACOS: includeMacOS,
      ARTIFACT_DIR: tmp,
      SCREENPLAY_SAVE_RESULT_BUNDLE_PATH: resultBundlePath,
    },
    encoding: "utf8",
  });

  const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf8")
    .split("--- call ---\n")
    .map((entry) => entry.trim().split("\n").filter(Boolean))
    .filter((entry) => entry.length > 0) : [];
  const callOrder = fs.existsSync(callOrderLog) ? fs.readFileSync(callOrderLog, "utf8").trim().split("\n") : [];
  fs.rmSync(tmp, { recursive: true, force: true });
  return { calls, callOrder, destination, result, xcconfig };
}

test("[screenplay-save-network-fault-smokes] erases the iPhone simulator and keeps Keychain signing enabled", () => {
  const { calls, callOrder, destination, result, xcconfig } = runSmoke();

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
    assert.ok(call.includes("-only-testing:themUITests/V1SmokeUITests/test_screenplay_load_server_fetches_fresh_head_and_restores_after_relaunch"));
  }
  assert.ok(ios.includes("-default-test-execution-time-allowance"));
  assert.ok(ios.includes("-maximum-test-execution-time-allowance"));
  assert.equal(ios.includes("-default-test-execution-allowance"), false);
  assert.equal(ios.includes("-maximum-test-execution-allowance"), false);
  assert.equal(ios.includes("CODE_SIGNING_ALLOWED=NO"), false);
  assert.equal(ios.includes("CODE_SIGNING_REQUIRED=NO"), false);
  assert.ok(ios.includes("-parallel-testing-enabled"));
  assert.ok(ios.includes("-resultBundlePath"));
  assert.ok(result.stdout.includes("Signed iPhone") === false);
  const eraseIndex = callOrder.indexOf("xcrun simctl erase B76CE387-1D78-4B37-AD14-4A9F67002B61");
  assert.ok(eraseIndex >= 0, "the selected iPhone simulator must be erased before its save-recovery proof");
  assert.ok(eraseIndex < callOrder.indexOf("xcodebuild"), "simulator erasure must precede xcodebuild");
});

test("[screenplay-save-network-fault-smokes] can run the required iPhone recovery proof without macOS UI auth", () => {
  const { calls, result } = runSmoke({ includeMacOS: "0" });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(calls.length, 1);
  assert.match(result.stdout, /Signed iPhone queued screenplay saves recover exactly once/);
  assert.equal(calls[0].includes("CODE_SIGNING_ALLOWED=NO"), false);
  assert.equal(calls[0].includes("CODE_SIGNING_REQUIRED=NO"), false);
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

test("[screenplay-save-network-fault-smokes] forwards the evaluator's exact result bundle path", () => {
  const resultBundlePath = "/tmp/THEM Proof/custom recovery.xcresult";
  const { calls, result } = runSmoke({ includeMacOS: "0", resultBundlePath });
  assert.equal(result.status, 0, result.stderr);
  const index = calls[0].indexOf("-resultBundlePath");
  assert.ok(index >= 0);
  assert.equal(calls[0][index + 1], resultBundlePath);
});

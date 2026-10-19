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
  destination = "platform=iOS Simulator,id=deterministic-save-fault-smoke",
  bootFailure = false,
  testIdentifier = "",
  resultBundlePath = "",
} = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-save-network-fault-"));
  const log = path.join(tmp, "xcodebuild.calls");
  const callOrderLog = path.join(tmp, "calls.log");
  const fakeXcodebuild = path.join(tmp, "xcodebuild");
  const fakeXcrun = path.join(tmp, "xcrun");
  const simulatorLog = path.join(tmp, "simulator.calls");
  const inventory = {devices:{"com.apple.CoreSimulator.SimRuntime.iOS-26-2":[
    {name:"Owned save proof",udid:"deterministic-save-fault-smoke",isAvailable:true},
  ]}};
  fs.writeFileSync(fakeXcrun, [
    "#!/usr/bin/env bash",
    'printf "xcrun %s\\n" "$*" >> "$TEST_CALL_ORDER_LOG"',
    'printf "%s\\n" "$*" >> "$TEST_SIMULATOR_CALLS"',
    `if [[ "$*" == 'simctl list devices available --json' ]]; then printf '%s\\n' '${JSON.stringify(inventory)}'; fi`,
    "if [[ \"$*\" == 'simctl list devices available' ]]; then printf '    iPhone 17 Pro (DETERMINISTIC-ID) (Shutdown)\\n'; fi",
    `if [[ "$*" == simctl\\ bootstatus* ]]; then exit ${bootFailure ? 1 : 0}; fi`,
    "exit 0", "",
  ].join("\n"));
  fs.chmodSync(fakeXcrun, 0o755);
  const xcconfig = path.join(tmp, "save fault.xcconfig");
  if (withXcconfig) {
    fs.writeFileSync(xcconfig, "THEM_UITEST_SCREENPLAY_SAVE_BACKEND_PORT = 31337\n");
  }
  fs.writeFileSync(fakeXcodebuild, [
    "#!/usr/bin/env bash",
    'printf "xcodebuild\\n" >> "$TEST_CALL_ORDER_LOG"',
    "printf '%s\\n' '--- call ---' >> \"$XCODEBUILD_CALLS_LOG\"",
    "printf '%s\\n' \"$@\" >> \"$XCODEBUILD_CALLS_LOG\"",
    "exit 0",
    "",
  ].join("\n"));
  fs.chmodSync(fakeXcodebuild, 0o755);

  const result = spawnSync("/bin/bash", [script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CI: "",
      PATH: tmp + path.delimiter + process.env.PATH,
      IOS_SIMULATOR_NAME: "",
      SCREENPLAY_SAVE_TEST_IDENTIFIER: testIdentifier,
      SCREENPLAY_SAVE_INCLUDE_MACOS: includeMacOS,
      XCODEBUILD: fakeXcodebuild,
      XCRUN: fakeXcrun,
      TEST_SIMULATOR_CALLS: simulatorLog,
      TEST_CALL_ORDER_LOG: callOrderLog,
      ARTIFACT_DIR: tmp,
      XCODEBUILD_CALLS_LOG: log,
      IOS_SIMULATOR_DESTINATION: destination,
      THEM_UITEST_SCREENPLAY_SAVE_XCCONFIG_PATH: withXcconfig ? xcconfig : "",
      SCREENPLAY_SAVE_RESULT_BUNDLE_PATH: resultBundlePath,
    },
    encoding: "utf8",
  });

  const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf8")
    .split("--- call ---\n")
    .map((entry) => entry.trim().split("\n").filter(Boolean))
    .filter((entry) => entry.length > 0) : [];
  const simulatorCalls = fs.existsSync(simulatorLog) ? fs.readFileSync(simulatorLog,"utf8") : "";
  const callOrder = fs.existsSync(callOrderLog) ? fs.readFileSync(callOrderLog, "utf8").trim().split("\n") : [];
  fs.rmSync(tmp, { recursive: true, force: true });
  return { calls, destination, result, xcconfig, simulatorCalls, callOrder };
}

test("[screenplay-save-network-fault-smokes] runs the recovery UI smoke on iPhone and macOS", () => {
  const { calls, destination, result, xcconfig, simulatorCalls, callOrder } = runSmoke();

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Screenplay Save Network-Fault Smokes/);
  assert.match(result.stdout, /recover exactly once across reconnect, expired auth, and stale-version resolution/);
  assert.equal(calls.length, 2);

  const [ios, macos] = calls;
  assert.equal(ios[ios.indexOf("-destination") + 1],
    destination);
  assert.ok(ios.includes("them"));
  assert.ok(ios.includes("Debug"));
  assert.match(simulatorCalls, /simctl erase deterministic-save-fault-smoke/);
  assert.match(simulatorCalls, /simctl bootstatus deterministic-save-fault-smoke -b/);
  assert.equal(ios.includes("CODE_SIGNING_ALLOWED=NO"), false);
  assert.equal(ios.includes("CODE_SIGNING_REQUIRED=NO"), false);
  assert.ok(ios.includes("-default-test-execution-time-allowance"));
  assert.ok(ios.includes("-maximum-test-execution-time-allowance"));
  assert.equal(ios.includes("-default-test-execution-allowance"), false);
  assert.equal(ios.includes("-maximum-test-execution-allowance"), false);
  assert.ok(ios.includes("-parallel-testing-enabled"));
  assert.ok(ios.includes("-resultBundlePath"));
  assert.ok(macos.includes("platform=macOS"));
  assert.ok(macos.includes("them-macOS-scaffold"));
  assert.ok(macos.includes("Mac Scaffold Debug"));
  assert.ok(macos.includes("ENABLE_APP_SANDBOX=NO"));
  const eraseIndex = callOrder.indexOf("xcrun simctl erase deterministic-save-fault-smoke");
  assert.ok(eraseIndex >= 0 && eraseIndex < callOrder.indexOf("xcodebuild"));

  for (const call of calls) {
    assert.ok(call.includes("test"));
    assert.ok(call.includes("-xcconfig"));
    assert.ok(call.includes(xcconfig));
    assert.ok(call.includes("-only-testing:themUITests/V1SmokeUITests/test_screenplay_save_outbox_survives_relaunch_and_reconnects_once"));
    assert.ok(call.includes("-only-testing:themUITests/V1SmokeUITests/test_screenplay_save_outbox_refreshes_auth_and_resolves_stale_conflict_once"));
    assert.ok(call.includes("-only-testing:themUITests/V1SmokeUITests/test_screenplay_load_server_fetches_fresh_head_and_restores_after_relaunch"));
    assert.ok(call.includes("-only-testing:themUITests/V1SmokeUITests/test_screenplay_delete_all_survives_offline_relaunch_and_saves_once"));
    assert.ok(call.includes("-only-testing:themUITests/V1SmokeUITests/test_screenplay_blank_snapshot_survives_offline_relaunch_and_saves_once"));
  }
});

test("[screenplay-save-network-fault-smokes] preserves original iPhone-only proof without macOS UI auth", () => {
  const {result,calls}=runSmoke({includeMacOS:"0"});
  assert.equal(result.status,0,result.stderr);
  assert.equal(calls.length,1);
  assert.match(result.stdout,/Signed iPhone queued screenplay saves/);
});

test("[screenplay-save-network-fault-smokes] unspecified local destinations cannot erase or run tests", () => {
  const {result,calls,simulatorCalls}=runSmoke({destination:""});
  assert.equal(result.status,2);
  assert.deepEqual(calls,[]);
  assert.doesNotMatch(simulatorCalls,/simctl erase/);
});

test("[screenplay-save-network-fault-smokes] boot failure cannot report passing recovery proof", () => {
  const {result,calls}=runSmoke({bootFailure:true});
  assert.equal(result.status,2);
  assert.deepEqual(calls,[]);
  assert.doesNotMatch(result.stdout,/\[OK\]/);
});

test("[screenplay-save-network-fault-smokes] preserves one explicit test selection under nounset", () => {
  const identifier="themUITests/V1SmokeUITests/test_screenplay_save_outbox_survives_relaunch_and_reconnects_once";
  const {result,calls}=runSmoke({testIdentifier:identifier});
  assert.equal(result.status,0,result.stderr);
  assert.equal(calls.length,2);
  for(const call of calls) assert.deepEqual(call.filter(x=>x.startsWith("-only-testing:")),["-only-testing:"+identifier]);
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

test("[screenplay-save-network-fault-smokes] refuses an unspecified local simulator", () => {
  const {result, calls, callOrder} = runSmoke({destination: ""});
  assert.equal(result.status, 2);
  assert.match(result.stderr, /explicit.*simulator/i);
  assert.deepEqual(calls, []);
  assert.ok(!callOrder.some(call => call.includes("simctl erase")));
});

test("[screenplay-save-network-fault-smokes] forwards the evaluator's exact result bundle path", () => {
  const resultBundlePath = "/tmp/THEM Proof/custom recovery.xcresult";
  const { calls, result } = runSmoke({ includeMacOS: "0", resultBundlePath });
  assert.equal(result.status, 0, result.stderr);
  const index = calls[0].indexOf("-resultBundlePath");
  assert.ok(index >= 0);
  assert.equal(calls[0][index + 1], resultBundlePath);
});

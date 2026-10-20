import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts", "run_v1_ui_smoke.sh");

const originalID = "B76CE387-1D78-4B37-AD14-4A9F67002B61";
const newerID = "E839A11B-51B4-4AD3-ACF4-A53B95B7C957";
const defaultInventory = { devices: { "com.apple.CoreSimulator.SimRuntime.iOS-26-2": [
  { name: "iPhone 17 Pro", udid: originalID, isAvailable: true },
  { name: "Owned proof", udid: "deterministic-v1-ui-smoke", isAvailable: true },
] } };
const duplicateInventory = { devices: {
  "com.apple.CoreSimulator.SimRuntime.iOS-26-2": [{ name: "iPhone 17 Pro", udid: originalID, isAvailable: true }],
  "com.apple.CoreSimulator.SimRuntime.iOS-26-5": [{ name: "iPhone 17 Pro", udid: newerID, isAvailable: true }],
} };

function runSmoke({ inventory = defaultInventory, xcconfigPath = "", destination = "platform=iOS Simulator,id=deterministic-v1-ui-smoke", simulatorName = "", extraArgs = [], ci = "", exitCode = 0, bootExitCode = 0 } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-v1-ui-smoke-"));
  const log = path.join(tmp, "xcodebuild.args");
  const callOrderLog = path.join(tmp, "calls.log");
  const fakeXcodebuild = path.join(tmp, "xcodebuild");
  const fakeXcrun = path.join(tmp, "xcrun");
  const inventoryPath = path.join(tmp, "devices.json");
  const textPath = path.join(tmp, "devices.txt");
  fs.writeFileSync(inventoryPath, JSON.stringify(inventory));
  fs.writeFileSync(textPath, Object.values(inventory.devices).flat().map(d => `    ${d.name} (${d.udid}) (Shutdown)`).join("\n") + "\n");
  fs.writeFileSync(fakeXcodebuild, [
    "#!/usr/bin/env bash",
    "printf 'xcodebuild\\n' >> \"$TEST_CALL_ORDER_LOG\"",
    "printf '%s\\n' \"$@\" > \"$XCODEBUILD_CALLS_LOG\"",
    `exit ${exitCode}`,
    "",
  ].join("\n"));
  fs.chmodSync(fakeXcodebuild, 0o755);
  fs.writeFileSync(fakeXcrun, [
    "#!/usr/bin/env bash",
    "printf 'xcrun %s\\n' \"$*\" >> \"$TEST_CALL_ORDER_LOG\"",
    "if [[ \"$*\" == 'simctl list devices available' ]]; then cat \"$TEST_DEVICE_TEXT\"; fi",
    "if [[ \"$*\" == 'simctl list devices available --json' ]]; then cat \"$TEST_DEVICE_JSON\"; fi",
    `if [[ \"$*\" == simctl\\ bootstatus* ]]; then exit ${bootExitCode}; fi`,
    "exit 0",
    "",
  ].join("\n"));
  fs.chmodSync(fakeXcrun, 0o755);

  const result = spawnSync("/bin/bash", [
    script,
    ...extraArgs,
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CI: ci,
      XCODEBUILD: fakeXcodebuild,
      XCODEBUILD_CALLS_LOG: log,
      XCRUN: fakeXcrun,
      TEST_CALL_ORDER_LOG: callOrderLog,
      TEST_DEVICE_JSON: inventoryPath,
      TEST_DEVICE_TEXT: textPath,
      IOS_SIMULATOR_DESTINATION: destination,
      IOS_SIMULATOR_NAME: simulatorName,
      ARTIFACT_DIR: tmp,
      THEM_UITEST_RESTORE_XCCONFIG_PATH: xcconfigPath,
    },
    encoding: "utf8",
  });

  const args = fs.existsSync(log)
    ? fs.readFileSync(log, "utf8").trim().split("\n")
    : [];
  const callOrder = fs.existsSync(callOrderLog)
    ? fs.readFileSync(callOrderLog, "utf8").trim().split("\n")
    : [];
  fs.rmSync(tmp, { recursive: true, force: true });
  return { args, callOrder, destination, result };
}

test("[v1-ui-smoke] erases the selected simulator and preserves signing for Keychain coverage", () => {
  const { args, callOrder, destination, result } = runSmoke();

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /run-v1-ui-smoke: destination=/);
  assert.match(result.stdout, /erased and booted simulator deterministic-v1-ui-smoke/);
  const eraseIndex = callOrder.indexOf("xcrun simctl erase deterministic-v1-ui-smoke");
  assert.ok(eraseIndex >= 0, "the selected simulator must be erased");
  assert.ok(eraseIndex < callOrder.indexOf("xcodebuild"), "erase must finish before the test runner starts");
  assert.equal(args[0], "test");
  assert.ok(args.includes(destination));
  assert.ok(args.includes("-only-testing:themUITests"));
  assert.equal(args.includes("CODE_SIGNING_ALLOWED=NO"), false);
  assert.equal(args.includes("CODE_SIGNING_REQUIRED=NO"), false);
  assert.deepEqual(
    args.slice(args.indexOf("-parallel-testing-enabled"), args.indexOf("-parallel-testing-enabled") + 2),
    ["-parallel-testing-enabled", "NO"],
  );
  assert.deepEqual(
    args.slice(
      args.indexOf("-maximum-concurrent-test-simulator-destinations"),
      args.indexOf("-maximum-concurrent-test-simulator-destinations") + 2,
    ),
    ["-maximum-concurrent-test-simulator-destinations", "1"],
  );
  assert.ok(args.includes("-resultBundlePath"));
  assert.match(args[args.indexOf("-resultBundlePath") + 1], /v1-ui-smoke-.*\.xcresult$/);
  assert.equal(args.includes("-xcconfig"), false);
});

test("[v1-ui-smoke] forwards an optional restore xcconfig as one argument", () => {
  const xcconfig = "/tmp/io them restore smoke.xcconfig";
  const { args, result } = runSmoke({ xcconfigPath: xcconfig });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(args.slice(0, 3), ["-xcconfig", xcconfig, "test"]);
});

test("[v1-ui-smoke] does not choose and erase an unspecified local simulator", () => {
  const {result, callOrder} = runSmoke({destination: "", simulatorName: "", ci: ""});
  assert.equal(result.status, 2);
  assert.match(result.stderr, /explicit.*simulator/i);
  assert.ok(!callOrder.some(call => call.includes("simctl erase")));
});

test("[v1-ui-smoke] propagates Xcode failure without reporting a passing proof", () => {
  const {result} = runSmoke({exitCode: 65});
  assert.equal(result.status, 65);
});

test("[v1-ui-smoke] refuses proof after simulator boot failure", () => {
  const {result, callOrder} = runSmoke({bootExitCode: 1});
  assert.equal(result.status, 2);
  assert.match(result.stderr, /did not finish booting/);
  assert.ok(!callOrder.includes("xcodebuild"));
});

test("[v1-ui-smoke] CI discovery uses the injected simulator tool", () => {
  const {result, callOrder} = runSmoke({destination: "", simulatorName: "", ci: "true"});
  assert.equal(result.status, 0, result.stderr);
  assert.ok(callOrder.includes("xcrun simctl erase B76CE387-1D78-4B37-AD14-4A9F67002B61"));
});

test("[v1-ui-smoke] CI pins Xcode to the erased UDID even with duplicate device names", () => {
  const {result, args, callOrder} = runSmoke({inventory: duplicateInventory, destination: "", ci: "true"});
  assert.equal(result.status, 0, result.stderr);
  assert.ok(callOrder.includes(`xcrun simctl erase ${newerID}`));
  assert.equal(args[args.indexOf("-destination") + 1], `platform=iOS Simulator,id=${newerID}`);
});

test("[v1-ui-smoke] an explicit OS resolves the matching device before erasing", () => {
  const {result, args, callOrder} = runSmoke({inventory: duplicateInventory,
    destination: "platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5"});
  assert.equal(result.status, 0, result.stderr);
  assert.ok(callOrder.includes(`xcrun simctl erase ${newerID}`));
  assert.ok(!callOrder.includes(`xcrun simctl erase ${originalID}`));
  assert.equal(args[args.indexOf("-destination") + 1], `platform=iOS Simulator,id=${newerID}`);
});

test("[v1-ui-smoke] ambiguous explicit names fail before erasing any simulator", () => {
  const {result, callOrder} = runSmoke({inventory: duplicateInventory,
    destination: "platform=iOS Simulator,name=iPhone 17 Pro"});
  assert.equal(result.status, 2);
  assert.ok(!callOrder.some(call => call.startsWith("xcrun simctl erase")));
  assert.ok(!callOrder.includes("xcodebuild"));
});

test("[v1-ui-smoke] caller arguments cannot override the selected destination or disable signing", () => {
  for (const extraArgs of [
    ["-destination", `platform=iOS Simulator,id=${newerID}`],
    [`-destination=platform=iOS Simulator,id=${newerID}`],
    ["CODE_SIGNING_ALLOWED=NO"],
    ["CODE_SIGNING_REQUIRED=NO"],
    ["-parallel-testing-enabled", "YES"],
    ["-parallel-testing-enabled=YES"],
  ]) {
    const {result, callOrder} = runSmoke({extraArgs});
    assert.equal(result.status, 2, extraArgs.join(" "));
    assert.ok(!callOrder.some(call => call.startsWith("xcrun simctl erase")));
    assert.ok(!callOrder.includes("xcodebuild"));
  }
});

test("[v1-ui-smoke] unknown, unavailable and wrong-runtime IDs fail before erasing", () => {
  for (const destination of [
    "platform=iOS Simulator,id=missing",
    `platform=iOS Simulator,id=${originalID},OS=26.5`,
    "platform=iOS Simulator,name=iPhone 17 Pro,OS=27.0",
  ]) {
    const {result, callOrder} = runSmoke({inventory: duplicateInventory, destination});
    assert.equal(result.status, 2, destination);
    assert.ok(!callOrder.some(call => call.startsWith("xcrun simctl erase")));
  }
  const inventory = structuredClone(defaultInventory);
  inventory.devices["com.apple.CoreSimulator.SimRuntime.iOS-26-2"][0].isAvailable = false;
  const {result, callOrder} = runSmoke({inventory, destination: `platform=iOS Simulator,id=${originalID}`});
  assert.equal(result.status, 2);
  assert.ok(!callOrder.some(call => call.startsWith("xcrun simctl erase")));
});

test("[v1-ui-smoke] preserves architecture while resolving an explicit latest runtime", () => {
  const {result, args} = runSmoke({inventory: duplicateInventory,
    destination: "platform=iOS Simulator,name=iPhone 17 Pro,OS=latest,arch=arm64"});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(args[args.indexOf("-destination") + 1], `platform=iOS Simulator,id=${newerID},arch=arm64`);
});

test("[v1-ui-smoke] rejects conflicting selectors and malformed inventories before erase", () => {
  for (const destination of [
    `platform=iOS Simulator,id=${originalID},name=iPhone 17 Pro`,
    `platform=iOS Simulator,id=${originalID},id=${newerID}`,
    `platform=iOS Simulator,id=${originalID},arch=wrong`,
  ]) {
    const {result, callOrder} = runSmoke({destination});
    assert.equal(result.status, 2);
    assert.ok(!callOrder.some(call => call.startsWith("xcrun simctl erase")));
  }
  const {result, callOrder} = runSmoke({inventory: {devices: {}}});
  assert.equal(result.status, 2);
  assert.ok(!callOrder.includes("xcodebuild"));
});

test("[v1-ui-smoke] hosted UI and voice failures remain required with retained bundles", () => {
  const workflow = fs.readFileSync(path.join(repoRoot, ".github/workflows/quality-gate.yml"), "utf8");
  for (const name of ["Run iOS V1 UI smoke tests (required)", "Run iPhone voice-fault smoke and macOS scaffold build (required)"]) {
    const block = workflow.split(`- name: ${name}`)[1]?.split("- name:")[0];
    assert.ok(block, name);
    assert.doesNotMatch(block, /continue-on-error:\s*true/);
  }
  assert.match(workflow, /them-v1-ui-smoke\/\*\.xcresult/);
  assert.match(workflow, /them-voice-network-fault-smokes\/\*\.xcresult/);
});

test("[v1-ui-smoke] preserves a caller-provided result bundle without adding a duplicate", () => {
  const requestedPath = "/tmp/integrated writer loop.xcresult";
  const { args, result } = runSmoke({ extraArgs: ["-resultBundlePath", requestedPath] });

  assert.equal(result.status, 0, result.stderr);
  const resultBundleIndexes = args.reduce((indexes, arg, index) => (
    arg === "-resultBundlePath" ? [...indexes, index] : indexes
  ), []);
  assert.equal(resultBundleIndexes.length, 1);
  assert.equal(args[resultBundleIndexes[0] + 1], requestedPath);
});

test("[v1-ui-smoke] resolves, erases, and boots the simulator selected by name", () => {
  const { callOrder, result } = runSmoke({ destination: "", simulatorName: "iPhone 17 Pro" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /destination=platform=iOS Simulator,name=iPhone 17 Pro/);
  assert.match(result.stdout, /erased and booted simulator B76CE387-1D78-4B37-AD14-4A9F67002B61/);
  const eraseIndex = callOrder.indexOf("xcrun simctl erase B76CE387-1D78-4B37-AD14-4A9F67002B61");
  assert.ok(eraseIndex >= 0, "the named simulator must be resolved and erased");
  assert.ok(eraseIndex < callOrder.indexOf("xcodebuild"));
});

test("[v1-ui-smoke] refuses destinations that cannot be resolved to a clean simulator", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-v1-ui-smoke-destination-"));
  const fakeXcodebuild = path.join(tmp, "xcodebuild");
  const fakeXcrun = path.join(tmp, "xcrun");
  fs.writeFileSync(fakeXcodebuild, "#!/usr/bin/env bash\nexit 0\n");
  fs.writeFileSync(fakeXcrun, "#!/usr/bin/env bash\nexit 0\n");
  fs.chmodSync(fakeXcodebuild, 0o755);
  fs.chmodSync(fakeXcrun, 0o755);

  const result = spawnSync("/bin/bash", [script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      XCODEBUILD: fakeXcodebuild,
      XCRUN: fakeXcrun,
      IOS_SIMULATOR_DESTINATION: "platform=iOS Simulator",
      ARTIFACT_DIR: tmp,
    },
    encoding: "utf8",
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /cannot resolve the simulator UDID/);
});

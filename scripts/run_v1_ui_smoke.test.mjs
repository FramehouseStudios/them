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

function runSmoke({ xcconfigPath = "", destination = "platform=iOS Simulator,id=deterministic-v1-ui-smoke", simulatorName = "", extraArgs = [] } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-v1-ui-smoke-"));
  const log = path.join(tmp, "xcodebuild.args");
  const callOrderLog = path.join(tmp, "calls.log");
  const fakeXcodebuild = path.join(tmp, "xcodebuild");
  const fakeXcrun = path.join(tmp, "xcrun");
  fs.writeFileSync(fakeXcodebuild, [
    "#!/usr/bin/env bash",
    "printf 'xcodebuild\\n' >> \"$TEST_CALL_ORDER_LOG\"",
    "printf '%s\\n' \"$@\" > \"$XCODEBUILD_CALLS_LOG\"",
    "exit 0",
    "",
  ].join("\n"));
  fs.chmodSync(fakeXcodebuild, 0o755);
  fs.writeFileSync(fakeXcrun, [
    "#!/usr/bin/env bash",
    "printf 'xcrun %s\\n' \"$*\" >> \"$TEST_CALL_ORDER_LOG\"",
    "if [[ \"$*\" == 'simctl list devices available' ]]; then printf '    iPhone 17 Pro (B76CE387-1D78-4B37-AD14-4A9F67002B61) (Shutdown)\\n'; fi",
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
      XCODEBUILD: fakeXcodebuild,
      XCODEBUILD_CALLS_LOG: log,
      XCRUN: fakeXcrun,
      TEST_CALL_ORDER_LOG: callOrderLog,
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

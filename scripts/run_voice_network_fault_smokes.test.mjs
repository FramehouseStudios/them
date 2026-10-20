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

function simulatorInventory(id) {
  const inventory = {devices: {"com.apple.CoreSimulator.SimRuntime.iOS-26-2": [
    {name: "Owned proof", udid: id, isAvailable: true},
  ]}};
  return `if [[ "$*" == 'simctl list devices available --json' ]]; then printf '%s\\n' '${JSON.stringify(inventory)}'; fi`;
}

test("[voice-network-fault-smokes] tests iPhone faults and builds the macOS scaffold", (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-network-fault-smokes-"));
  t.after(() => fs.rmSync(tmp, {recursive: true, force: true}));
  const log = path.join(tmp, "xcodebuild.calls");
  const fakeXcodebuild = path.join(tmp, "xcodebuild");
  const simulatorLog = path.join(tmp, "simulator.calls");
  const fakeXcrun = path.join(tmp, "xcrun");
  fs.writeFileSync(fakeXcrun, "#!/usr/bin/env bash\nprintf '%s\\n' \"$*\" >> \"$SIMULATOR_CALLS_LOG\"\n"
    + simulatorInventory("deterministic-network-fault-smoke") + "\n");
  fs.chmodSync(fakeXcrun, 0o755);
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
      XCRUN: fakeXcrun,
      XCODEBUILD_CALLS_LOG: log,
      SIMULATOR_CALLS_LOG: simulatorLog,
      IOS_SIMULATOR_DESTINATION: destination,
      ARTIFACT_DIR: tmp,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const simulatorCalls = fs.existsSync(simulatorLog) ? fs.readFileSync(simulatorLog, "utf8") : "";
  assert.match(simulatorCalls, /simctl erase deterministic-network-fault-smoke/,
               "Voice proof must use the canonical clean-simulator runner.");
  assert.match(simulatorCalls, /simctl bootstatus deterministic-network-fault-smoke -b/);
  assert.match(result.stdout, /Voice Network-Fault Smokes/);
  assert.match(result.stdout, /iPhone voice network-fault smoke and macOS scaffold build pass/);

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
  assert.ok(ios.includes("-resultBundlePath"));
  assert.ok(ios.some((argument) => argument.endsWith("-ios.xcresult")));
  assert.ok(!ios.includes("-quiet"));
  assert.ok(!ios.includes("CODE_SIGNING_ALLOWED=NO"));
  assert.ok(!ios.includes("CODE_SIGNING_REQUIRED=NO"));

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
  assert.ok(macos.includes("build"));
  assert.ok(!macos.includes("-only-testing"));

  assert.ok(ios.includes("test"));
  assert.ok(ios.includes(`-only-testing:themUITests/V1SmokeUITests/test_realtime_network_faults_resolve_exactly_once`));
  const before = fs.readFileSync(log, "utf8");
  const unspecified = spawnSync("bash", [script], {cwd: repoRoot, encoding: "utf8", env: {
    ...process.env, CI: "", IOS_SIMULATOR_DESTINATION: "", IOS_SIMULATOR_NAME: "",
    XCODEBUILD: fakeXcodebuild, XCRUN: fakeXcrun, XCODEBUILD_CALLS_LOG: log, ARTIFACT_DIR: tmp,
  }});
  assert.equal(unspecified.status, 2);
  assert.match(unspecified.stderr, /explicit.*simulator/i);
  assert.equal(fs.readFileSync(log, "utf8"), before, "No build/test may start for an unspecified local simulator");
});

for (const failure of ["boot", "ios", "macos"]) {
  test(`[voice-network-fault-smokes] ${failure} failure cannot report passing proof`, (t) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-voice-failure-"));
    t.after(() => fs.rmSync(tmp, {recursive: true, force: true}));
    const log = path.join(tmp, "calls");
    const fakeXcrun = path.join(tmp, "xcrun");
    const fakeXcodebuild = path.join(tmp, "xcodebuild");
    fs.writeFileSync(fakeXcrun, [
      "#!/usr/bin/env bash",
      simulatorInventory("owned-test-device"),
      'if [[ "$*" == simctl\\ bootstatus* && "$VOICE_FAILURE" == boot ]]; then exit 1; fi',
      "exit 0", "",
    ].join("\n"));
    fs.writeFileSync(fakeXcodebuild, [
      "#!/usr/bin/env bash",
      'printf "%s\\n" "$*" >> "$VOICE_CALLS"',
      'if [[ "$1" == test && "$VOICE_FAILURE" == ios ]]; then exit 65; fi',
      'if [[ "$1" == build && "$VOICE_FAILURE" == macos ]]; then exit 66; fi',
      "exit 0", "",
    ].join("\n"));
    fs.chmodSync(fakeXcrun, 0o755);
    fs.chmodSync(fakeXcodebuild, 0o755);
    const result = spawnSync("bash", [script], {cwd: repoRoot, encoding: "utf8", env: {
      ...process.env, CI: "", THEM_UITEST_RESTORE_XCCONFIG_PATH: "",
      IOS_SIMULATOR_DESTINATION: "platform=iOS Simulator,id=owned-test-device",
      XCODEBUILD: fakeXcodebuild, XCRUN: fakeXcrun,
      ARTIFACT_DIR: tmp, VOICE_FAILURE: failure, VOICE_CALLS: log,
    }});
    assert.equal(result.status, {boot: 2, ios: 65, macos: 66}[failure], result.stderr);
    assert.doesNotMatch(result.stdout, /\[OK\]/);
    const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : [];
    assert.equal(calls.length, {boot: 0, ios: 1, macos: 2}[failure]);
    if (failure === "ios") assert.doesNotMatch(calls[0], /^build /);
  });
}

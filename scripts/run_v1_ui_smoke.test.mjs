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

function runSmoke({ xcconfigPath = "" } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-v1-ui-smoke-"));
  const log = path.join(tmp, "xcodebuild.args");
  const fakeXcodebuild = path.join(tmp, "xcodebuild");
  fs.writeFileSync(fakeXcodebuild, [
    "#!/usr/bin/env bash",
    "printf '%s\\n' \"$@\" > \"$XCODEBUILD_CALLS_LOG\"",
    "exit 0",
    "",
  ].join("\n"));
  fs.chmodSync(fakeXcodebuild, 0o755);

  const destination = "platform=iOS Simulator,id=deterministic-v1-ui-smoke";
  const result = spawnSync("/bin/bash", [
    script,
    "-resultBundlePath",
    path.join(tmp, "result.xcresult"),
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      XCODEBUILD: fakeXcodebuild,
      XCODEBUILD_CALLS_LOG: log,
      IOS_SIMULATOR_DESTINATION: destination,
      THEM_UITEST_RESTORE_XCCONFIG_PATH: xcconfigPath,
    },
    encoding: "utf8",
  });

  const args = fs.existsSync(log)
    ? fs.readFileSync(log, "utf8").trim().split("\n")
    : [];
  fs.rmSync(tmp, { recursive: true, force: true });
  return { args, destination, result };
}

test("[v1-ui-smoke] runs without an optional xcconfig under nounset", () => {
  const { args, destination, result } = runSmoke();

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /run-v1-ui-smoke: destination=/);
  assert.equal(args[0], "test");
  assert.ok(args.includes(destination));
  assert.ok(args.includes("-only-testing:themUITests"));
  assert.ok(args.includes("CODE_SIGNING_ALLOWED=NO"));
  assert.ok(args.includes("-resultBundlePath"));
  assert.equal(args.includes("-xcconfig"), false);
});

test("[v1-ui-smoke] forwards an optional restore xcconfig as one argument", () => {
  const xcconfig = "/tmp/io them restore smoke.xcconfig";
  const { args, result } = runSmoke({ xcconfigPath: xcconfig });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(args.slice(0, 3), ["-xcconfig", xcconfig, "test"]);
});

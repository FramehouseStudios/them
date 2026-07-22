import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts", "run_voice_latency_gate.sh");

test("[voice-latency-gate] runs only the focused deterministic Swift smokes", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-voice-latency-gate-"));
  const log = path.join(tmp, "xcodebuild.args");
  const fakeXcodebuild = path.join(tmp, "xcodebuild");
  fs.writeFileSync(fakeXcodebuild, [
    "#!/usr/bin/env bash",
    "printf '%s\\n' \"$@\" > \"$XCODEBUILD_ARGS_LOG\"",
    "exit 0",
    "",
  ].join("\n"));
  fs.chmodSync(fakeXcodebuild, 0o755);

  const destination = "platform=iOS Simulator,id=deterministic-voice-gate";
  const result = spawnSync("bash", [script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      XCODEBUILD: fakeXcodebuild,
      XCODEBUILD_ARGS_LOG: log,
      IOS_SIMULATOR_DESTINATION: destination,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Voice Latency Gate/);
  assert.match(result.stdout, /network-condition smokes pass/);

  const args = fs.readFileSync(log, "utf8").split("\n").filter(Boolean);
  assert.ok(args.includes("test"));
  assert.ok(args.includes("-project"));
  assert.ok(args.includes(path.join(repoRoot, "them.xcodeproj")));
  assert.ok(args.includes("-destination"));
  assert.ok(args.includes(destination));
  assert.ok(args.includes("-only-testing:themTests/ClementineLatencyTelemetryTests"));
  assert.ok(args.includes("-only-testing:themTests/StudioResponseStreamingTests"));
  assert.ok(args.includes("-only-testing:themTests/VoiceNetworkConditionSmokeTests"));
  assert.ok(args.includes("CODE_SIGNING_ALLOWED=NO"));
  assert.ok(args.includes("CODE_SIGNING_REQUIRED=NO"));
});

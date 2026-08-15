import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts", "run_studio_structural_quality_smokes.sh");

test("[studio-structural-quality-smokes] runs the shared UI acceptance on iPhone and macOS", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-structural-smokes-"));
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

  const destination = "platform=iOS Simulator,id=deterministic-structural-smoke";
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
  assert.match(result.stdout, /Studio Structural-Quality Smokes/);
  assert.match(result.stdout, /typed\/voice structural repair smokes pass/);

  const calls = fs.readFileSync(log, "utf8")
    .split("--- call ---\n")
    .map((entry) => entry.trim().split("\n").filter(Boolean))
    .filter((entry) => entry.length > 0);
  assert.equal(calls.length, 2);

  const testIdentifier = "-only-testing:themUITests/V1SmokeUITests/test_structural_repair_is_canon_aware_for_typed_and_voice_studio_turns";
  const [ios, macos] = calls;
  assert.ok(ios.includes("them"));
  assert.ok(ios.includes("Debug"));
  assert.ok(ios.includes(destination));
  assert.ok(ios.includes("CODE_SIGNING_ALLOWED=NO"));
  assert.ok(ios.includes("CODE_SIGNING_REQUIRED=NO"));
  assert.ok(macos.includes("them-macOS-scaffold"));
  assert.ok(macos.includes("Mac Scaffold Debug"));
  assert.ok(macos.includes("platform=macOS"));
  assert.ok(macos.includes("ENABLE_APP_SANDBOX=NO"));
  assert.ok(macos.includes("REGISTER_APP_GROUPS=NO"));
  for (const call of calls) {
    assert.ok(call.includes("test"));
    assert.ok(call.includes(testIdentifier));
  }
});

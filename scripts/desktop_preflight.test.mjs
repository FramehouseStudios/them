import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts/desktop_preflight.sh");

test("[desktop-preflight] invokes the active Mac desktop scaffold build", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-desktop-preflight-"));
  const log = path.join(tmp, "xcodebuild.args");
  const fakeXcodebuild = path.join(tmp, "xcodebuild");
  fs.writeFileSync(fakeXcodebuild, [
    "#!/usr/bin/env bash",
    "printf '%s\\n' \"$@\" > \"$XCODEBUILD_ARGS_LOG\"",
    "exit 0",
    "",
  ].join("\n"));
  fs.chmodSync(fakeXcodebuild, 0o755);

  const r = spawnSync("bash", [script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      XCODEBUILD: fakeXcodebuild,
      XCODEBUILD_ARGS_LOG: log,
      MAC_DESKTOP_DERIVED_DATA_PATH: path.join(tmp, "dd"),
    },
    encoding: "utf8",
  });

  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Mac Desktop Preflight/);
  assert.match(r.stdout, /Mac desktop scaffold build succeeds/);

  const args = fs.readFileSync(log, "utf8").split("\n").filter(Boolean);
  assert.ok(args.includes("build"));
  assert.ok(args.includes("-project"));
  assert.ok(args.includes(path.join(repoRoot, "them.xcodeproj")));
  assert.ok(args.includes("-scheme"));
  assert.ok(args.includes("them-macOS-scaffold"));
  assert.ok(args.includes("-configuration"));
  assert.ok(args.includes("Mac Scaffold Debug"));
  assert.ok(args.includes("-destination"));
  assert.ok(args.includes("platform=macOS"));
  assert.ok(args.includes("CODE_SIGNING_ALLOWED=NO"));
  assert.ok(args.includes("CODE_SIGNING_REQUIRED=NO"));
});

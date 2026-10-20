import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const runner = path.join(root, "backend/evals/run_screenplay_save_network_fault_ui_smoke.mjs");

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "them-save-evidence-"));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const bin = path.join(directory, "bin");
  const artifacts = path.join(directory, "proof artifacts");
  fs.mkdirSync(bin); fs.mkdirSync(artifacts);
  const calls = path.join(directory, "calls.jsonl");
  const xcode = path.join(bin, "xcodebuild");
  const xcrun = path.join(bin, "xcrun");
  fs.writeFileSync(xcode, `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.SAVE_CALLS, JSON.stringify(args) + "\\n");
const index = args.indexOf("-resultBundlePath");
if(index >= 0 && process.env.SAVE_MODE !== "missing") {
 fs.mkdirSync(args[index + 1], {recursive:true});
 fs.writeFileSync(path.join(args[index + 1], "evidence.txt"), "retained synthetic evidence");
}
console.log("quiet successful Xcode output without test counts");
process.exit(process.env.SAVE_MODE === "failure" ? 65 : 0);
`);
  fs.writeFileSync(xcrun, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if(args[0] === "simctl") {
 if(args.includes("--json")) console.log(JSON.stringify({devices:{
  "com.apple.CoreSimulator.SimRuntime.iOS-26-2":[{name:"Owned proof",udid:"owned-save-proof",isAvailable:true}]
 }}));
 process.exit(0);
}
const bundle = args[args.indexOf("--path") + 1];
if(!fs.existsSync(bundle)) process.exit(1);
if(args.includes("tests")) {
 console.log(JSON.stringify({testNodes:[{nodeType:"Failure Message",name:"synthetic recovery failure"}]}));
} else if(process.env.SAVE_MODE === "malformed") {
 console.log("not JSON");
} else {
 const mode = process.env.SAVE_MODE;
 const skip = mode === "skipped" || (mode === "mac-skipped" && bundle.includes("macos"));
 const total = mode === "zero" ? 0 : (process.env.SCREENPLAY_SAVE_TEST_IDENTIFIER ? 1 : 2);
 console.log(JSON.stringify({totalTestCount:total,passedTests:skip?0:total,failedTests:0,skippedTests:skip?total:0}));
}
`);
  fs.chmodSync(xcode, 0o755); fs.chmodSync(xcrun, 0o755);
  return {
    artifacts,
    run(mode, identifier = "") {
      const result = spawnSync(process.execPath, [runner], {
        cwd: root, encoding: "utf8", timeout: 40_000,
        env: {...process.env, PATH: bin + path.delimiter + process.env.PATH,
          ARTIFACT_DIR: artifacts, XCODEBUILD: xcode, XCRUN: xcrun, CI: "",
          IOS_SIMULATOR_DESTINATION: "platform=iOS Simulator,id=owned-save-proof",
          THEM_UITEST_RESTORE_XCCONFIG_PATH: "", DATABASE_URL: "", REDIS_URL: "",
          SCREENPLAY_SAVE_TEST_IDENTIFIER: identifier, SCREENPLAY_SAVE_INCLUDE_MACOS: "1",
          SAVE_MODE: mode, SAVE_CALLS: calls},
      });
      assert.equal(result.error, undefined);
      assert.ok(fs.existsSync(calls), `Apple-tool fixture not reached: ${result.stderr}`);
      const invocations = fs.readFileSync(calls, "utf8").trim().split("\n").map(line => JSON.parse(line));
      return {result, invocations};
    },
  };
}

for (const mode of ["pass", "skipped", "mac-skipped", "zero", "malformed", "missing", "failure"]) {
  test(`[save-evidence] actual summary determines outcome despite quiet Xcode success: ${mode}`, t => {
    const f = fixture(t);
    const {result, invocations} = f.run(mode);
    assert.equal(result.status === 0, mode === "pass", result.stdout + result.stderr);
    if(mode !== "pass") assert.doesNotMatch(result.stdout, /screenplay-save-network-fault-ui-smoke: ok/);
    const ios = invocations[0];
    assert.equal(ios.includes("CODE_SIGNING_ALLOWED=NO"), false);
    assert.equal(ios[ios.indexOf("-destination") + 1], "platform=iOS Simulator,id=owned-save-proof");
    if(mode !== "missing") {
      const bundle = ios[ios.indexOf("-resultBundlePath") + 1];
      assert.equal(fs.readFileSync(path.join(bundle, "evidence.txt"), "utf8"), "retained synthetic evidence");
      assert.ok(bundle.startsWith(f.artifacts + path.sep));
    }
    if(mode === "failure") assert.match(result.stderr, /synthetic recovery failure/);
  });
}

test("[save-evidence] an explicit single selection requires exactly one result per platform", t => {
  const f = fixture(t);
  const identifier = "themUITests/V1SmokeUITests/test_screenplay_save_outbox_survives_relaunch_and_reconnects_once";
  const {result, invocations} = f.run("pass", identifier);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(invocations.length, 2);
  for(const args of invocations) assert.deepEqual(args.filter(x => x.startsWith("-only-testing:")), ["-only-testing:" + identifier]);
});

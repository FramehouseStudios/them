import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const runner = path.join(root, "backend/evals/run_studio_ios_writer_loop_contract_smoke.mjs");

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "them-writer-evidence-test-"));
  const bin = path.join(directory, "bin");
  const runnerTemp = path.join(directory, "runner temp");
  fs.mkdirSync(bin); fs.mkdirSync(runnerTemp);
  const argsFile = path.join(directory, "args.json");
  const callsFile = path.join(directory, "calls.txt");
  const xcodebuild = path.join(bin, "xcodebuild");
  const xcrun = path.join(bin, "xcrun");
  fs.writeFileSync(xcodebuild, `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const args = process.argv.slice(2);
fs.writeFileSync(process.env.TEST_ARGS_FILE, JSON.stringify(args));
const bundle = args[args.indexOf("-resultBundlePath") + 1];
fs.mkdirSync(bundle, {recursive:true});
fs.writeFileSync(path.join(bundle, "diagnostic.txt"), "writer evidence");
console.log("complete writer stdout"); console.error("complete writer stderr");
process.exit(process.env.TEST_WRITER_MODE === "failure" ? 65 : 0);
`);
  fs.writeFileSync(xcrun, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TEST_CALLS_FILE, args.join(" ") + "\\n");
if(args[0] === "simctl") process.exit(0);
if(args.includes("tests")) {
 console.log(JSON.stringify({testNodes:[{nodeType:"Failure Message",name:"Markdown artifact missing"}]}));
} else if(process.env.TEST_WRITER_MODE === "bad-summary") {
 console.log("not valid JSON");
} else {
 const zero = process.env.TEST_WRITER_MODE === "zero";
 console.log(JSON.stringify({totalTestCount:zero?0:1,passedTests:zero?0:1,failedTests:0,skippedTests:0}));
}
`);
  fs.chmodSync(xcodebuild, 0o755); fs.chmodSync(xcrun, 0o755);
  const sentinel = path.join(runnerTemp, "unrelated.xcconfig");
  fs.writeFileSync(sentinel, "unrelated config");
  return {
    directory, runnerTemp,
    run(mode) {
      const result = spawnSync(process.execPath, [runner], {
        cwd: root, encoding: "utf8", timeout: 40_000,
        env: {...process.env, PATH: bin + path.delimiter + process.env.PATH,
          RUNNER_TEMP: runnerTemp, XCODEBUILD: xcodebuild, XCRUN: xcrun,
          IOS_SIMULATOR_DESTINATION: "platform=iOS Simulator,id=owned-evidence-fixture",
          THEM_UITEST_WRITER_LOOP_BACKEND_PORT: "", DATABASE_URL: "",
          TEST_WRITER_MODE: mode, TEST_ARGS_FILE: argsFile, TEST_CALLS_FILE: callsFile},
      });
      assert.equal(result.error, undefined);
      assert.ok(fs.existsSync(argsFile),
        `Apple-tool fixture was not reached (status=${result.status}).\n`
        + (result.stdout + result.stderr).slice(-16_000));
      const args = JSON.parse(fs.readFileSync(argsFile, "utf8"));
      const bundle = args[args.indexOf("-resultBundlePath") + 1];
      const config = args[args.indexOf("-xcconfig") + 1];
      assert.equal(args.includes("CODE_SIGNING_ALLOWED=NO"), false);
      assert.match(fs.readFileSync(callsFile, "utf8"), /simctl erase owned-evidence-fixture/);
      assert.equal(fs.existsSync(config), false, "only generated restore config is removed");
      assert.equal(fs.readFileSync(sentinel, "utf8"), "unrelated config");
      return {result, bundle};
    },
    cleanup() { fs.rmSync(directory, {recursive:true, force:true}); },
  };
}

for (const mode of ["failure", "pass", "zero", "bad-summary"]) {
  test(`[writer-evidence] retains actual runner bundle and diagnostic output: ${mode}`, () => {
    const f = fixture();
    try {
      const {result, bundle} = f.run(mode);
      assert.equal(result.status === 0, mode === "pass", result.stderr);
      assert.equal(fs.existsSync(bundle), true, "terminal outcome must retain its diagnostic bundle");
      assert.ok(bundle.startsWith(path.join(f.runnerTemp, "them-studio-ios-writer-loop") + path.sep));
      assert.match(result.stdout, /complete writer stdout/);
      assert.match(result.stderr, /complete writer stderr/);
      assert.equal(fs.statSync(path.dirname(bundle)).mode & 0o777, 0o700);
      assert.match(result.stdout + result.stderr, /writer-loop artifacts:/);
      if (mode === "failure") assert.match(result.stderr, /Markdown artifact missing/);
    } finally { f.cleanup(); }
  });
}

test("[writer-evidence] repeated runs cannot overwrite earlier evidence", () => {
  const f = fixture();
  try {
    const first = f.run("failure").bundle;
    const second = f.run("pass").bundle;
    assert.notEqual(first, second);
    assert.equal(fs.readFileSync(path.join(first, "diagnostic.txt"), "utf8"), "writer evidence");
    assert.equal(fs.existsSync(second), true);
  } finally { f.cleanup(); }
});

test("[writer-evidence] hosted failure upload includes the retained writer bundle", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/quality-gate.yml"), "utf8");
  assert.match(workflow, /\$\{\{ runner\.temp \}\}\/them-studio-ios-writer-loop\/\*\/\*\.xcresult/);
});

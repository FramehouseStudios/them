// Fixture and sole pipe-pressure case preserved from original 4386d5f8d44a559c31aa17a37d2ba98d4f65db27.
// Private-artifact-path cases remain outside this capability backport.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  const pressureHook = path.join(directory, "pipe-pressure-hook.mjs");
  fs.writeFileSync(pressureHook, `import http from "node:http";
import { once } from "node:events";
if (process.argv[1]?.endsWith("/index.js")) {
 const original = http.Server.prototype.emit;
 http.Server.prototype.emit = function(event, ...args) {
  if (event === "request" && args[0]?.url === "/__writer_evidence_pipe_pressure") {
   void (async () => {
    const block = "P".repeat(64 * 1024);
    for (let i = 0; i < 32; i++) {
     if (!process.stdout.write(block)) await once(process.stdout, "drain");
     if (!process.stderr.write(block)) await once(process.stderr, "drain");
    }
    args[1].writeHead(200, {"content-type":"text/plain"}); args[1].end("pressure-drained");
   })();
   return true;
  }
  return original.call(this, event, ...args);
 };
}
`);
  fs.writeFileSync(xcodebuild, `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const args = process.argv.slice(2);
fs.writeFileSync(process.env.TEST_ARGS_FILE, JSON.stringify(args));
const bundle = args[args.indexOf("-resultBundlePath") + 1];
fs.mkdirSync(bundle, {recursive:true});
fs.writeFileSync(path.join(bundle, "diagnostic.txt"), "writer evidence");
console.log("complete writer stdout"); console.error("complete writer stderr");
if (process.env.TEST_WRITER_MODE === "pipe-pressure") {
 const http = require("node:http");
 const config = fs.readFileSync(args[args.indexOf("-xcconfig") + 1], "utf8");
 const port = Number(config.match(/THEM_UITEST_WRITER_LOOP_BACKEND_PORT = (\\d+)/)?.[1]);
 if (!port) throw new Error("missing dynamic backend port");
 const request = http.get({host:"127.0.0.1",port,path:"/__writer_evidence_pipe_pressure"}, response => {
  let body=""; response.on("data", chunk => body += chunk);
  response.on("end", () => {
   if (response.statusCode !== 200 || body !== "pressure-drained") process.exit(76);
   console.log("backend pipe pressure drained"); process.exit(0);
  });
 });
 request.setTimeout(3000, () => request.destroy(new Error("backend pipe pressure timed out")));
 request.on("error", error => { console.error(error.message); process.exit(76); });
} else process.exit(process.env.TEST_WRITER_MODE === "failure" ? 65 : 0);
`);
  fs.writeFileSync(xcrun, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TEST_CALLS_FILE, args.join(" ") + "\\n");
if(args[0] === "simctl") {
 if(args.includes("--json")) console.log(JSON.stringify({devices:{
  "com.apple.CoreSimulator.SimRuntime.iOS-26-2":[
   {name:"Owned evidence",udid:"owned-evidence-fixture",isAvailable:true}
  ]
 }}));
 process.exit(0);
}
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
          RUNNER_TEMP: runnerTemp, ARTIFACT_DIR: path.join(runnerTemp, "them-studio-ios-writer-loop"), XCODEBUILD: xcodebuild, XCRUN: xcrun,
          IOS_SIMULATOR_DESTINATION: "platform=iOS Simulator,id=owned-evidence-fixture",
          THEM_UITEST_WRITER_LOOP_BACKEND_PORT: "", THEM_UITEST_CREATION_REPLY_FAULT: "0", DATABASE_URL: "",
          TEST_WRITER_MODE: mode, TEST_ARGS_FILE: argsFile, TEST_CALLS_FILE: callsFile,
          ...(mode === "pipe-pressure" ? { NODE_OPTIONS: `--import=${pathToFileURL(pressureHook).href}` } : {})},
      });
      assert.equal(result.error, undefined);
      assert.ok(fs.existsSync(argsFile),
        `Apple-tool fixture was not reached (status=${result.status}).\n`
        + (result.stdout + result.stderr).slice(-16_000));
      const args = JSON.parse(fs.readFileSync(argsFile, "utf8"));
      const bundle = args[args.indexOf("-resultBundlePath") + 1];
      const config = args[args.indexOf("-xcconfig") + 1];
      assert.equal(args.includes("CODE_SIGNING_ALLOWED=NO"), false);
      assert.equal(args[args.indexOf("-destination") + 1],
        "platform=iOS Simulator,id=owned-evidence-fixture");
      assert.match(fs.readFileSync(callsFile, "utf8"), /simctl erase owned-evidence-fixture/);
      assert.equal(fs.existsSync(config), false, "only generated restore config is removed");
      assert.equal(fs.readFileSync(sentinel, "utf8"), "unrelated config");
      return {result, bundle};
    },
    cleanup() { fs.rmSync(directory, {recursive:true, force:true}); },
  };
}

test("[writer-evidence] backend drains both output pipes while native workflow waits", () => {
  const f = fixture();
  try {
    const {result, bundle} = f.run("pipe-pressure");
    assert.equal(result.status, 0, `native request could not complete: ${result.stderr.slice(-3000)}`);
    assert.match(result.stdout, /backend pipe pressure drained/);
    assert.equal(fs.existsSync(bundle), true);
  } finally { f.cleanup(); }
});

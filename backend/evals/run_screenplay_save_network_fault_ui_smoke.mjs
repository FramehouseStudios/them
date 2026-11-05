import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { startBackend } from "../tests/helpers/backend_test_server.mjs";
import { assertPassedTestSummary, failureOutputTail, xcresultFailureDetails } from "./studio_ios_writer_loop_contract_helpers.mjs";

const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let server = null;
const artifactRoot = process.env.ARTIFACT_DIR || process.env.RUNNER_TEMP || tmpdir();
mkdirSync(artifactRoot, { recursive: true });
const artifactDir = mkdtempSync(path.join(artifactRoot, "them-save-recovery-"));
const resultBundle = path.join(artifactDir, "recovery-ios.xcresult");
try {
  server = await startBackend({
    // The XCUITest defaults to localhost:31337. The dynamic-port handoff from
    // this Node process was not visible to the XCTest runner, so bind the
    // fixture to the test's existing default instead.
    port: 31337,
    unsetEnv: ["DATABASE_URL", "REDIS_URL"],
    env: {
      APP_TOKEN: "them-dev",
      REQUIRE_USER_AUTH: "1",
      OPENAI_API_KEY: "not-a-real-provider-key",
      CLEMENTINE_MUSE_ENABLED: "0",
      KNOWLEDGE_RAG_EMBEDDINGS_ENABLED: "0",
    },
  });

  const child = spawn("bash", ["scripts/run_screenplay_save_network_fault_smokes.sh"], {
    cwd: ROOT_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env: {...process.env, SCREENPLAY_SAVE_RESULT_BUNDLE_PATH: resultBundle},
  });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => {
    process.stdout.write(chunk);
    stdout = failureOutputTail(stdout + chunk);
  });
  child.stderr.on("data", chunk => {
    process.stderr.write(chunk);
    stderr = failureOutputTail(stderr + chunk);
  });
  // Keep Node's event loop available to drain the owned backend's pipes.
  // A synchronous multi-minute Xcode wait can stall that backend under log load.
  const status = await new Promise((resolve, reject) => { child.on("error", reject); child.on("close", resolve); });
  const readResult = (kind, bundle = resultBundle) => spawnSync("xcrun", [
    "xcresulttool", "get", "test-results", kind, "--path", bundle,
  ], { cwd: ROOT_DIR, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (status !== 0) {
    let details = "No result bundle was produced.";
    if (existsSync(resultBundle)) {
      const tests = readResult("tests");
      if (tests.status === 0) {
        try { details = xcresultFailureDetails(JSON.parse(tests.stdout)); }
        catch (error) { details = `Could not parse test details: ${error}`; }
      } else {
        details = failureOutputTail(tests.stderr || tests.stdout);
      }
    }
    throw new Error(
      `Screenplay save recovery failed.\nstatus=${status}; evidence=${artifactDir}\n`
      + `xcresult failures:\n${failureOutputTail(details)}\n`
      + `stdout tail:\n${stdout}\n`
      + `stderr tail:\n${stderr}`
    );
  }
  const bundles = [resultBundle];
  if (process.env.SCREENPLAY_SAVE_INCLUDE_MACOS !== "0") bundles.push(resultBundle.replace(/\.xcresult$/, "-macos.xcresult"));
  for (const bundle of bundles) {
    const summary = readResult("summary", bundle);
    assert(summary.status === 0,
      `Missing recovery summary: ${bundle}\n${failureOutputTail(summary.stderr || summary.stdout)}`);
    assertPassedTestSummary(JSON.parse(summary.stdout), process.env.SCREENPLAY_SAVE_TEST_IDENTIFIER ? 1 : 2,
      `Signed screenplay recovery did not execute every requested test: ${bundle}`);
  }
  console.log(JSON.stringify({
    ok: true,
    backend: server.baseUrl,
    resultBundles: bundles,
    targets: process.env.SCREENPLAY_SAVE_INCLUDE_MACOS === "0" ? ["iPhone"] : ["iPhone", "macOS"],
    contract: process.env.SCREENPLAY_SAVE_TEST_IDENTIFIER
      ? "the selected screenplay recovery test passed"
      : "queued saves recover exactly once across reconnect, expired auth, and stale-version resolution",
  }, null, 2));
  console.log("screenplay-save-network-fault-ui-smoke: ok");
} catch (error) {
  if (server) {
    const stdout = server.stdout.join("").trim();
    const stderr = server.stderr.join("").trim();
    if (stdout) console.error(`screenplay save recovery backend stdout:\n${stdout}`);
    if (stderr) console.error(`screenplay save recovery backend stderr:\n${stderr}`);
  }
  throw error;
} finally {
  if (server) await server.stop();
}

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";

import { startBackend } from "../tests/helpers/backend_test_server.mjs";
import { startCreationReplyFaultProxy } from "./creation_reply_fault_proxy.mjs";
import {
  assertSinglePassedTestSummary,
  failureOutputTail,
  xcresultFailureDetails,
} from "./studio_ios_writer_loop_contract_helpers.mjs";

const APP_TOKEN = "them-dev";
const configuredPort = (process.env.THEM_UITEST_WRITER_LOOP_BACKEND_PORT || "").trim();
const requestedPort = configuredPort ? Number(configuredPort) : null;
const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const creationFault = process.env.THEM_UITEST_CREATION_REPLY_FAULT === "1";
const WRITER_LOOP_TEST = creationFault
  ? "themUITests/V1SmokeUITests/test_project_creation_lost_reply_survives_relaunch_and_retries_once"
  : "themUITests/V1SmokeUITests/test_integrated_iphone_writer_loop_creates_saves_exports_and_restores";

if (requestedPort !== null && (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65_535)) {
  throw new Error("THEM_UITEST_WRITER_LOOP_BACKEND_PORT must be an integer from 1 through 65535.");
}

// A failure must retain screenshots/hierarchy, not just a shortened assertion.
// Unique owned directories also prevent a later run from replacing its proof.
const ARTIFACT_ROOT = path.join(process.env.ARTIFACT_DIR || process.env.RUNNER_TEMP || tmpdir(), "them-studio-ios-writer-loop");
mkdirSync(ARTIFACT_ROOT, { recursive: true });
const ARTIFACT_DIR = mkdtempSync(path.join(ARTIFACT_ROOT, "run-"));
const XCCONFIG_PATH = path.join(ARTIFACT_DIR, "restore.xcconfig");
const RESULT_BUNDLE_PATH = path.join(ARTIFACT_DIR, "writer-loop.xcresult");
console.log(`writer-loop artifacts: ${ARTIFACT_DIR}`);

let server = null;
let proxy = null;
try {
  server = await startBackend({
    port: requestedPort,
    unsetEnv: ["DATABASE_URL", "REDIS_URL"],
    env: {
      APP_TOKEN,
      REQUIRE_USER_AUTH: "1",
      CLEMENTINE_MUSE_ENABLED: "0",
      KNOWLEDGE_RAG_EMBEDDINGS_ENABLED: "0",
    },
  });
  if (creationFault) proxy = await startCreationReplyFaultProxy(server.baseUrl, APP_TOKEN);
  writeFileSync(
    XCCONFIG_PATH,
    `THEM_UITEST_WRITER_LOOP_BACKEND_PORT = ${proxy?.port ?? server.port}\n`,
    { encoding: "utf8", mode: 0o600 }
  );

  const child = spawn("bash", [
    "scripts/run_v1_ui_smoke.sh",
    "-quiet",
    "-resultBundlePath", RESULT_BUNDLE_PATH,
  ], {
    cwd: ROOT_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ONLY_TESTING: WRITER_LOOP_TEST,
      THEM_UITEST_RESTORE_XCCONFIG_PATH: XCCONFIG_PATH,
    },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    stdout = failureOutputTail(stdout + chunk);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    stderr = failureOutputTail(stderr + chunk);
  });
  // Keep draining the owned backend while XCTest runs; a synchronous wait
  // can otherwise fill its pipes and stall the persistence being tested.
  const status = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  const resultTests = existsSync(RESULT_BUNDLE_PATH)
    ? spawnSync("xcrun", [
      "xcresulttool", "get", "test-results", "tests", "--path", RESULT_BUNDLE_PATH,
    ], {
      cwd: ROOT_DIR,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    })
    : null;
  let resultFailureDetails = "";
  if (resultTests?.status === 0) {
    try {
      resultFailureDetails = xcresultFailureDetails(JSON.parse(resultTests.stdout));
    } catch (error) {
      resultFailureDetails = `Could not parse xcresult test details: ${error}`;
    }
  } else if (resultTests) {
    resultFailureDetails = "Could not read xcresult test details.\n"
      + failureOutputTail(resultTests.stderr || resultTests.stdout);
  }
  if (status !== 0) {
    throw new Error(
      "Integrated iPhone writer-loop UI test failed.\n"
      + `status=${status}; evidence=${RESULT_BUNDLE_PATH}\n`
      + `xcresult failures:\n${failureOutputTail(resultFailureDetails)}\n`
      + `stdout tail:\n${stdout}\n`
      + `stderr tail:\n${stderr}\n`
      + `backend stdout tail:\n${failureOutputTail(server.stdout.join(""))}\n`
      + `backend stderr tail:\n${failureOutputTail(server.stderr.join(""))}`
    );
  }
  const summaryResult = spawnSync("xcrun", [
    "xcresulttool", "get", "test-results", "summary", "--path", RESULT_BUNDLE_PATH,
  ], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (summaryResult.status !== 0) {
    throw new Error(
      "Integrated iPhone writer-loop result summary could not be read.\n"
      + `stdout tail:\n${failureOutputTail(summaryResult.stdout)}\n`
      + `stderr tail:\n${failureOutputTail(summaryResult.stderr)}`
    );
  }
  assertSinglePassedTestSummary(JSON.parse(summaryResult.stdout));

  console.log(`writer-loop evidence: ${RESULT_BUNDLE_PATH}`);
  console.log("studio-ios-writer-loop-contract-smoke: ok");
} finally {
  if (existsSync(XCCONFIG_PATH)) unlinkSync(XCCONFIG_PATH);
  if (proxy) await proxy.stop();
  if (server) await server.stop();
}

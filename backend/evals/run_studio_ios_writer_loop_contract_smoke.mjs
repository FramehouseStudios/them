import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";

import { startBackend } from "../tests/helpers/backend_test_server.mjs";
import {
  assertSinglePassedTestSummary,
  failureOutputTail,
  xcresultFailureDetails,
} from "./studio_ios_writer_loop_contract_helpers.mjs";

const APP_TOKEN = "them-dev";
const configuredPort = (process.env.THEM_UITEST_WRITER_LOOP_BACKEND_PORT || "").trim();
const requestedPort = configuredPort ? Number(configuredPort) : null;
const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const WRITER_LOOP_TEST = "themUITests/V1SmokeUITests/test_integrated_iphone_writer_loop_creates_saves_exports_and_restores";
const XCCONFIG_PATH = `/tmp/them_studio_ios_writer_loop_${process.pid}.xcconfig`;
const artifactRoot = process.env.ARTIFACT_DIR || process.env.RUNNER_TEMP || tmpdir();
mkdirSync(artifactRoot, { recursive: true });
const artifactDir = mkdtempSync(path.join(artifactRoot, "them-writer-loop-"));
const RESULT_BUNDLE_PATH = path.join(artifactDir, "writer-loop.xcresult");

if (requestedPort !== null && (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65_535)) {
  throw new Error("THEM_UITEST_WRITER_LOOP_BACKEND_PORT must be an integer from 1 through 65535.");
}

let server = null;
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
  writeFileSync(
    XCCONFIG_PATH,
    `THEM_UITEST_WRITER_LOOP_BACKEND_PORT = ${server.port}\n`,
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
  if (server) await server.stop();
}

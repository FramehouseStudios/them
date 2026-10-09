import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

if (requestedPort !== null && (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65_535)) {
  throw new Error("THEM_UITEST_WRITER_LOOP_BACKEND_PORT must be an integer from 1 through 65535.");
}

// A failure must retain screenshots/hierarchy, not just a shortened assertion.
// Unique owned directories also prevent a later run from replacing its proof.
const ARTIFACT_ROOT = join(process.env.RUNNER_TEMP || tmpdir(), "them-studio-ios-writer-loop");
mkdirSync(ARTIFACT_ROOT, { recursive: true });
const ARTIFACT_DIR = mkdtempSync(join(ARTIFACT_ROOT, "run-"));
const XCCONFIG_PATH = join(ARTIFACT_DIR, "restore.xcconfig");
const RESULT_BUNDLE_PATH = join(ARTIFACT_DIR, "writer-loop.xcresult");
console.log(`writer-loop artifacts: ${ARTIFACT_DIR}`);

let server = null;
try {
  server = await startBackend({
    port: requestedPort,
    env: {
      APP_TOKEN,
      REQUIRE_USER_AUTH: "1",
    },
  });
  writeFileSync(
    XCCONFIG_PATH,
    `THEM_UITEST_WRITER_LOOP_BACKEND_PORT = ${server.port}\n`,
    { encoding: "utf8", mode: 0o600 }
  );

  const child = spawnSync("bash", [
    "scripts/run_v1_ui_smoke.sh",
    "-quiet",
    "-resultBundlePath", RESULT_BUNDLE_PATH,
  ], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    env: {
      ...process.env,
      ONLY_TESTING: WRITER_LOOP_TEST,
      THEM_UITEST_RESTORE_XCCONFIG_PATH: XCCONFIG_PATH,
    },
  });
  // Emit diagnostics before count/JSON checks too; a malformed or empty result
  // must not hide the output that explains why it is not valid proof.
  process.stdout.write(child.status === 0 ? child.stdout || "" : failureOutputTail(child.stdout));
  process.stderr.write(child.status === 0 ? child.stderr || "" : failureOutputTail(child.stderr));
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
  if (child.status !== 0) {
    throw new Error(
      "Integrated iPhone writer-loop UI test failed.\n"
      + `status=${child.status}\n`
      + `xcresult failures:\n${failureOutputTail(resultFailureDetails)}\n`
      + `stdout tail:\n${failureOutputTail(child.stdout)}\n`
      + `stderr tail:\n${failureOutputTail(child.stderr)}\n`
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

  console.log("studio-ios-writer-loop-contract-smoke: ok");
} finally {
  if (existsSync(XCCONFIG_PATH)) unlinkSync(XCCONFIG_PATH);
  if (server) await server.stop();
}

import { spawnSync } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
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
const XCCONFIG_PATH = `/tmp/them_studio_ios_writer_loop_${process.pid}.xcconfig`;
const RESULT_BUNDLE_PATH = `/tmp/io-them-studio-ios-writer-loop-${process.pid}.xcresult`;

if (requestedPort !== null && (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65_535)) {
  throw new Error("THEM_UITEST_WRITER_LOOP_BACKEND_PORT must be an integer from 1 through 65535.");
}

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

  process.stdout.write(child.stdout || "");
  process.stderr.write(child.stderr || "");
  console.log("studio-ios-writer-loop-contract-smoke: ok");
} finally {
  if (existsSync(XCCONFIG_PATH)) unlinkSync(XCCONFIG_PATH);
  if (existsSync(RESULT_BUNDLE_PATH)) {
    console.log(`Writer-loop diagnostic result retained at ${RESULT_BUNDLE_PATH}`);
  }
  if (server) await server.stop();
}

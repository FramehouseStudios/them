import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startBackend } from "../tests/helpers/backend_test_server.mjs";
import { assertPassedTestSummary, failureOutputTail, xcresultFailureDetails } from "./studio_ios_writer_loop_contract_helpers.mjs";

const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const ARTIFACT_DIR = resolve(ROOT_DIR, process.env.ARTIFACT_DIR || join(
  process.env.RUNNER_TEMP || tmpdir(), "them-screenplay-save-network-fault-smokes"
));
const RESULT_BUNDLE_PATH = join(ARTIFACT_DIR, `screenplay-save-network-fault-${process.pid}.xcresult`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let server = null;
try {
  server = await startBackend({
    // The XCUITest defaults to localhost:31337. The dynamic-port handoff from
    // this Node process was not visible to the XCTest runner, so bind the
    // fixture to the test's existing default instead.
    port: 31337,
    env: {
      APP_TOKEN: "them-dev",
      REQUIRE_USER_AUTH: "1",
    },
  });

  const child = spawnSync("bash", ["scripts/run_screenplay_save_network_fault_smokes.sh"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, ARTIFACT_DIR, SCREENPLAY_SAVE_RESULT_BUNDLE_PATH: RESULT_BUNDLE_PATH },
  });
  const output = `${child.stdout || ""}\n${child.stderr || ""}`;
  const readResult = (kind) => spawnSync("xcrun", [
    "xcresulttool", "get", "test-results", kind, "--path", RESULT_BUNDLE_PATH,
  ], { cwd: ROOT_DIR, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (child.status !== 0) {
    let details = "No result bundle was produced.";
    if (existsSync(RESULT_BUNDLE_PATH)) {
      const tests = readResult("tests");
      if (tests.status === 0) {
        try { details = xcresultFailureDetails(JSON.parse(tests.stdout)); }
        catch (error) { details = `Could not parse test details: ${error}`; }
      } else {
        details = failureOutputTail(tests.stderr || tests.stdout);
      }
    }
    throw new Error(
      `Screenplay save recovery failed.\nstatus=${child.status}\n`
      + `xcresult failures:\n${failureOutputTail(details)}\n`
      + `stdout tail:\n${failureOutputTail(child.stdout)}\n`
      + `stderr tail:\n${failureOutputTail(child.stderr)}`
    );
  }
  const summary = readResult("summary");
  assert(
    summary.status === 0,
    `Screenplay save recovery result summary could not be read.\n${failureOutputTail(summary.stderr || summary.stdout)}`
  );
  assertPassedTestSummary(
    JSON.parse(summary.stdout), process.env.SCREENPLAY_SAVE_TEST_IDENTIFIER ? 1 : 4,
    "Signed iPhone screenplay recovery did not execute every requested test"
  );
  assert(!/Executed 0 tests/.test(output), `Screenplay save recovery executed no tests.\n${output}`);
  assert(!/Test Case .* skipped/i.test(output), `Screenplay save recovery was skipped.\n${output}`);
  process.stdout.write(child.stdout || "");
  process.stderr.write(child.stderr || "");
  console.log(JSON.stringify({
    ok: true,
    backend: server.baseUrl,
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

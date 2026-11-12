import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { startBackend } from "../tests/helpers/backend_test_server.mjs";
import { assertSinglePassedTestSummary, failureOutputTail } from "./studio_ios_writer_loop_contract_helpers.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const test = "themUITests/V1SmokeUITests/test_first_run_held_login_hydration_preserves_replacement_fields";
const destination = process.env.IOS_SIMULATOR_DESTINATION || "";
const id = /^platform=iOS Simulator,id=([0-9a-f-]{36})$/i.exec(destination)?.[1];
const derivedData = process.env.DERIVED_DATA_PATH;
// Local proofs must name their owned build directory. CI reuses the default
// DerivedData already warmed by the required unit/writer/recovery stages.
if (!id || (derivedData === undefined ? process.env.CI !== "true" : !derivedData.startsWith("/"))) {
  throw new Error("Provide the root-owned exact simulator ID and absolute DERIVED_DATA_PATH; CI may omit the build path");
}
const derivedDataArgs = derivedData === undefined ? [] : ["-derivedDataPath", resolve(derivedData)];
const artifact = join(process.env.ARTIFACT_DIR || join(tmpdir(), "them-t1426"), "run-" + randomUUID());
mkdirSync(artifact, { recursive: true, mode: 0o700 });
const bundle = join(artifact, "onboarding-hydration.xcresult");
const xcconfig = join(artifact, "fixture.xcconfig");
const appToken = "onboarding-hydration-local-proof";
const env = {
  APP_TOKEN: appToken, REQUIRE_USER_AUTH: "1", AUTH_AUTO_VERIFY_EMAILS: "1",
  OPENAI_API_KEY: "disabled-onboarding-proof-sentinel", CLEMENTINE_MUSE_ENABLED: "0",
  MODEL_API_KEY: "", MUSE_API_KEY: "", REALTIME_PROVIDER: "stub",
  KNOWLEDGE_RAG_WARMUP_ON_BOOT: "0", ACTIVE_THEME_LLM_ENABLED: "0",
  SESSION_THREAD_SUMMARIZER_ENABLED: "0",
  NODE_OPTIONS: "--import=" + new URL("./onboarding_hydration_owner_fixture.mjs", import.meta.url).href,
};
const inherited = new Set(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "TZ"]);
const unsetEnv = Object.keys(process.env).filter(key => !inherited.has(key) && !(key in env));
const nativeKeys = [...inherited, "USER", "LOGNAME", "SHELL", "DEVELOPER_DIR", "XCODEBUILD", "XCRUN",
  "CI", "RUNNER_TEMP", "IOS_SIMULATOR_DESTINATION", "UI_TEST_TIME_ALLOWANCE_SECONDS", "UI_TEST_MAX_TIME_ALLOWANCE_SECONDS"];
const nativeEnv = Object.fromEntries(nativeKeys.filter(key => process.env[key] !== undefined)
  .map(key => [key, process.env[key]]));
let server;
const report = { test, destination, bundle, appPreferredNameObserved: false, hydrationWitnessObserved: false };
try {
  server = await startBackend({ env, unsetEnv });
  writeFileSync(xcconfig, "THEM_UITEST_WRITER_LOOP_BACKEND_PORT = " + server.port + "\n", { mode: 0o600 });
  let output = "";
  const child = spawn("bash", ["scripts/run_v1_ui_smoke.sh", "-quiet",
    "-resultBundlePath", bundle, ...derivedDataArgs], {
    cwd: root, env: { ...nativeEnv, ONLY_TESTING: test,
      ARTIFACT_DIR: artifact, THEM_UITEST_RESTORE_XCCONFIG_PATH: xcconfig },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", chunk => { process.stdout.write(chunk); output = failureOutputTail(output + chunk); });
  }
  const exit = await new Promise((ok, fail) => { child.once("error", fail); child.once("close", ok); });
  const statsResponse = await fetch(server.baseUrl + "/__test/onboarding-hydration/stats",
    { headers: { "X-APP-TOKEN": appToken } });
  if (!statsResponse.ok) throw new Error("Proof observer stats unavailable");
  report.stats = await statsResponse.json();
  const summary = spawnSync("xcrun", ["xcresulttool", "get", "test-results", "summary", "--path", bundle],
    { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (summary.status === 0) {
    writeFileSync(join(artifact, "summary.json"), summary.stdout);
    report.summary = JSON.parse(summary.stdout);
  }
  // Named HTTP JSON alone is insufficient: confirm that the real app applied it.
  // Read only this erased fixture app's synthetic preference after it terminates.
  const container = spawnSync("xcrun", ["simctl", "get_app_container", id, "io.them.them", "data"],
    { encoding: "utf8" });
  if (container.status === 0) {
    const preference = join(container.stdout.trim(), "Library/Preferences/io.them.them.plist");
    const value = spawnSync("/usr/libexec/PlistBuddy", ["-c", "Print :her.preferredName", preference],
      { encoding: "utf8" });
    report.appPreferredNameObserved = value.status === 0 && value.stdout.trim() === "Server Account A";
    const witness = spawnSync("/usr/libexec/PlistBuddy", ["-c", "Print :her.lastThemeCue", preference],
      { encoding: "utf8" });
    report.hydrationWitnessObserved = witness.status === 0 && witness.stdout.trim() === "T1426 hydration consumed";
  }
  writeFileSync(join(artifact, "result.json"), JSON.stringify(report, null, 2) + "\n");
  if (exit !== 0) throw new Error("Held-login native regression failed; retained " + artifact + "\n" + output);
  assertSinglePassedTestSummary(report.summary);
  if (!report.hydrationWitnessObserved || report.stats.namedAppSessionResponses < 1
      || report.stats.hydrationContinuationRequests < 1
      || report.stats.heldLoginResponses !== 1 || report.stats.releasedLoginResponses !== 1
      || report.stats.closedHeldLogins !== 0 || report.stats.unexpectedMutations !== 0
      || report.stats.blockedOutboundCalls !== 0) {
    throw new Error("Hydration or no-generation proof incomplete; retained " + artifact);
  }
  console.log("onboarding-hydration-owner: passed; retained " + artifact);
} finally {
  if (server) {
    writeFileSync(join(artifact, "backend.stdout.log"), server.stdout.join(""));
    writeFileSync(join(artifact, "backend.stderr.log"), server.stderr.join(""));
    await server.stop();
  }
}

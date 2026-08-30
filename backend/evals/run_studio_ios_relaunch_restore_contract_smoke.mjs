import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { startBackend } from "../tests/helpers/backend_test_server.mjs";

const APP_TOKEN = "them-dev";
const IOS_RESTORE_CONTRACT_PORT = Number(process.env.THEM_IOS_RESTORE_CONTRACT_PORT || 31337);
const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));

let server = null;
try {
  server = await startBackend({
    port: IOS_RESTORE_CONTRACT_PORT,
    env: {
      APP_TOKEN,
      REQUIRE_USER_AUTH: "1",
    },
  });

  const child = spawnSync("bash", ["scripts/run_v1_ui_smoke.sh"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    env: {
      ...process.env,
      ONLY_TESTING: "themUITests/V1SmokeUITests/test_backend_project_restore_loads_seeded_screenplay_session",
    },
  });
  const combinedOutput = `${child.stdout || ""}\n${child.stderr || ""}`;
  if (child.status !== 0) {
    throw new Error(
      "Studio iOS relaunch restore contract UI test failed.\n"
      + `status=${child.status}\n`
      + `stdout:\n${child.stdout || ""}\n`
      + `stderr:\n${child.stderr || ""}\n`
      + `backend stdout:\n${server.stdout.join("")}\n`
      + `backend stderr:\n${server.stderr.join("")}`
    );
  }
  if (/Executed 0 tests/.test(combinedOutput) || /Test skipped/.test(combinedOutput)) {
    throw new Error(
      "Studio iOS relaunch restore contract UI test did not execute the restore assertion.\n"
      + `stdout:\n${child.stdout || ""}\n`
      + `stderr:\n${child.stderr || ""}`
    );
  }

  process.stdout.write(child.stdout || "");
  process.stderr.write(child.stderr || "");
  console.log("studio-ios-relaunch-restore-contract-smoke: ok");
} finally {
  if (server) {
    await server.stop();
  }
}

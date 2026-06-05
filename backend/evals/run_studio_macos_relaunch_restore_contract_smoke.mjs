import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { startBackend } from "../tests/helpers/backend_test_server.mjs";

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_TOKEN = "them-dev";

let server = null;
try {
  server = await startBackend({
    env: {
      APP_TOKEN,
      REQUIRE_USER_AUTH: "1",
    },
  });

  const child = spawnSync(process.execPath, ["evals/run_studio_relaunch_restore_smoke.mjs"], {
    cwd: BACKEND_DIR,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    env: {
      ...process.env,
      APP_TOKEN,
      BACKEND_BASE_URL: server.baseUrl,
      BACKEND_URL: server.baseUrl,
      THEM_BASE_URL: server.baseUrl,
    },
  });

  if (child.status !== 0) {
    throw new Error(
      "Studio macOS relaunch restore contract smoke failed.\n"
      + `status=${child.status}\n`
      + `stdout:\n${child.stdout || ""}\n`
      + `stderr:\n${child.stderr || ""}\n`
      + `backend stdout:\n${server.stdout.join("")}\n`
      + `backend stderr:\n${server.stderr.join("")}`
    );
  }

  process.stdout.write(child.stdout || "");
  process.stderr.write(child.stderr || "");
  console.log("studio-macos-relaunch-restore-contract-smoke: ok");
} finally {
  if (server) {
    await server.stop();
  }
}

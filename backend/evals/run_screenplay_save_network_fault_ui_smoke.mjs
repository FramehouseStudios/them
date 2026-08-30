import { spawnSync } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { startBackend } from "../tests/helpers/backend_test_server.mjs";

const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let server = null;
const xcconfigPath = `/tmp/them_screenplay_save_network_fault_${process.pid}.xcconfig`;
try {
  server = await startBackend({
    env: {
      APP_TOKEN: "them-dev",
      REQUIRE_USER_AUTH: "1",
    },
  });
  writeFileSync(
    xcconfigPath,
    `THEM_UITEST_SCREENPLAY_SAVE_BACKEND_PORT = ${server.port}\n`,
    { encoding: "utf8", mode: 0o600 }
  );

  const child = spawnSync("bash", ["scripts/run_screenplay_save_network_fault_smokes.sh"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    env: {
      ...process.env,
      THEM_UITEST_SCREENPLAY_SAVE_XCCONFIG_PATH: xcconfigPath,
    },
  });
  const output = `${child.stdout || ""}\n${child.stderr || ""}`;
  assert(
    child.status === 0,
    `Cross-platform screenplay save recovery failed.\nstatus=${child.status}\n${output}`
  );
  assert(!/Executed 0 tests/.test(output), `Screenplay save recovery executed no tests.\n${output}`);
  assert(!/Test Case .* skipped/i.test(output), `Screenplay save recovery was skipped.\n${output}`);
  process.stdout.write(child.stdout || "");
  process.stderr.write(child.stderr || "");
  console.log(JSON.stringify({
    ok: true,
    backend: server.baseUrl,
    targets: ["iPhone", "macOS"],
    contract: "queued saves recover exactly once across reconnect, expired auth, and stale-version resolution",
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
  if (existsSync(xcconfigPath)) unlinkSync(xcconfigPath);
  if (server) await server.stop();
}

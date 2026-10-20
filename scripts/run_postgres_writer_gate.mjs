import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const READY = "THEM_POSTGRES_WRITER_RESTART_READY";

export async function runPostgresWriterGate() {
  const stem = `them-pg-gate-${randomUUID()}`;
  const names = { network: `${stem}-net`, volume: `${stem}-data`, db: `${stem}-db`, worker: `${stem}-worker` };
  const image = process.env.THEM_POSTGRES_GATE_BACKEND_IMAGE || `${stem}:local`;
  const postgres = process.env.THEM_POSTGRES_GATE_DATABASE_IMAGE || "postgres:16-alpine";
  const owned = new Set();
  let child;
  let failure;
  async function docker(args, timeout = 120_000) {
    const result = await exec("docker", args, { timeout, maxBuffer: 16 * 1024 * 1024 });
    return result.stdout.trim();
  }
  async function ready() {
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        await docker(["exec", names.db, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", "them_writer_gate"], 5_000);
        return;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    throw new Error("Isolated PostgreSQL did not become ready");
  }
  try {
    await docker(["info", "--format", "{{.ServerVersion}}"]);
    if (!process.env.THEM_POSTGRES_GATE_BACKEND_IMAGE) {
      console.log("postgres-writer-gate: building canonical backend image (no push)");
      await docker(["build", "--tag", image, "--file", path.join(root, "backend/Dockerfile"), path.join(root, "backend")], 600_000);
      owned.add("image");
    }
    await docker(["network", "create", "--internal", names.network]); owned.add("network");
    await docker(["volume", "create", names.volume]); owned.add("volume");
    await docker(["run", "--detach", "--name", names.db, "--network", names.network, "--network-alias", "db",
      "--mount", `type=volume,src=${names.volume},dst=/var/lib/postgresql/data`,
      "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-e", "POSTGRES_DB=them_writer_gate", postgres]);
    owned.add("db");
    await ready();
    let restartTask, restartError, output = "";
    child = spawn("docker", ["run", "--rm", "--interactive", "--name", names.worker,
      "--network", names.network, "--entrypoint", "node",
      "-e", "DATABASE_URL=postgres://postgres@db:5432/them_writer_gate", "-e", "THEM_PG_GATE_FIXTURE=1",
      image, "evals/postgres_writer_restart_scenario.mjs", "--isolated-fixture"], { stdio: ["pipe", "pipe", "pipe"] });
    owned.add("worker");
    const timer = setTimeout(() => child.kill("SIGTERM"), 180_000);
    child.stdout.on("data", chunk => {
      process.stdout.write(chunk);
      output = (output + chunk).slice(-8192);
      if (!restartTask && output.includes(READY)) {
        restartTask = (async () => {
          await docker(["restart", "--timeout", "10", names.db]);
          await ready();
          child.stdin.end("database-restarted\n");
        })().catch(error => { restartError = error; child.stdin.end(); });
      }
    });
    child.stderr.on("data", chunk => process.stderr.write(chunk));
    child.stdin.on("error", () => {}); // Worker failure is reported by its exit status.
    let status;
    try {
      status = await new Promise((resolve, reject) => {
        child.once("error", reject); child.once("close", resolve);
      });
    } finally { clearTimeout(timer); }
    if (!restartTask) throw new Error("Worker did not request an actual database restart");
    await restartTask;
    if (restartError) throw restartError;
    if (status !== 0 || !output.includes("THEM_POSTGRES_WRITER_CONTRACT_PASSED")) {
      throw new Error(`PostgreSQL writer contract failed (exit ${status})`);
    }
  } catch (error) {
    failure = error;
  } finally {
    const cleanup = [];
    const cleanupFailures = [];
    // Only exact names created by this invocation; never inspect/remove other sessions.
    for (const kind of ["worker", "db"]) if (owned.has(kind)) cleanup.push(["rm", "--force", names[kind]]);
    if (owned.has("volume")) cleanup.push(["volume", "rm", names.volume]);
    if (owned.has("network")) cleanup.push(["network", "rm", names.network]);
    if (owned.has("image")) cleanup.push(["image", "rm", image]);
    for (const args of cleanup) {
      try { await docker(args, 30_000); }
      catch (error) {
        // Ignore only the exact --rm worker already being absent. A daemon
        // or permissions failure is not evidence that the worker was removed.
        const absentWorker = args[2] === names.worker && String(error.stderr || "")
          .trim().replace(/^Error response from daemon:\s*/, "") === `No such container: ${names.worker}`;
        if (!absentWorker) cleanupFailures.push({ error, resource: args.at(-1) });
      }
    }
    if (cleanupFailures.length) {
      failure = new AggregateError(
        [...(failure ? [failure] : []), ...cleanupFailures.map(item => item.error)],
        `${failure ? `${failure.message}; ` : ""}Fixture cleanup incomplete: ${cleanupFailures.map(item => item.resource).join(", ")}`,
      );
    }
  }
  if (failure) throw failure;
  console.log("postgres-writer-gate: PASS (actual database and backend restart; owned resources removed)");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes("--help")) {
    console.log("node scripts/run_postgres_writer_gate.mjs\nRequires Docker. Builds the canonical backend image; uses only disposable internal-network PostgreSQL and synthetic accounts. Never uses a host DATABASE_URL or provider key.");
  } else {
    runPostgresWriterGate().catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}

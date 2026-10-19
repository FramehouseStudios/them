import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildWriterFixture } from "../evals/postgres_writer_restart_scenario.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const gate = path.join(root, "scripts/run_postgres_writer_gate.mjs");
const scenario = path.join(root, "backend/evals/postgres_writer_restart_scenario.mjs");
function cli(file, args = [], env = {}) {
  return spawnSync(process.execPath, [file, ...args], {
    encoding: "utf8", timeout: 10_000, env: { ...process.env, ...env },
  });
}
test("[postgres-writer-gate] full-length fixture keeps exact Unicode, CRLF and boundaries", () => {
  const draft = buildWriterFixture();
  assert.equal(draft.split("\r\n").length, 6601);
  assert.ok(Buffer.byteLength(draft) > 400_000);
  assert.ok(draft.startsWith("  INT. CAFE\u0301 - NIGHT\r\n"));
  assert.ok(draft.endsWith("\t \r\n"));
  assert.equal(draft.split("Keep my exact words.").length, 2);
  assert.ok(!Buffer.from(draft).equals(Buffer.from(draft.normalize("NFC"))));
});
test("[postgres-writer-gate] help needs neither Docker nor credentials", () => {
  const result = cli(gate, ["--help"], { PATH: "" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /disposable internal-network PostgreSQL/);
});
test("[postgres-writer-gate] missing Docker is red, never silently skipped", () => {
  const result = cli(gate, [], { PATH: "" });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /PASS/);
});
test("[postgres-writer-gate] direct scenario refuses a non-fixture database without exposing its URL", () => {
  const canary = "credential-canary-never-echo";
  const result = cli(scenario, ["--isolated-fixture"], {
    THEM_PG_GATE_FIXTURE: "1", DATABASE_URL: `postgres://user:${canary}@example.invalid/production`,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Only the disposable fixture database is allowed/);
  assert.ok(!(result.stdout + result.stderr).includes(canary), "Refusal must not echo connection credentials");
});
test("[postgres-writer-gate] a failed build does not start containers or claim success", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "them-gate-cli-test-"));
  const log = path.join(directory, "calls.jsonl");
  const binary = path.join(directory, "docker");
  try {
    fs.writeFileSync(binary, `#!${process.execPath}\nconst fs=require('fs');const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');process.exit(args[0]==='info'?0:42);\n`);
    fs.chmodSync(binary, 0o755);
    const result = cli(gate, [], { PATH: directory, THEM_POSTGRES_GATE_BACKEND_IMAGE: "" });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /PASS/);
    const calls = fs.readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
    assert.deepEqual(calls.map(args => args[0]), ["info", "build"]);
    assert.ok(!calls.flat().some(arg => arg.includes("DATABASE_URL")), "No host database passed to build");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test("[postgres-writer-gate] a worker success marker without a restart is rejected and resources cleaned", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "them-gate-protocol-test-"));
  const log = path.join(directory, "calls.jsonl");
  try {
    const binary = path.join(directory, "docker");
    fs.writeFileSync(binary, `#!${process.execPath}\nconst fs=require('fs');const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');if(args.includes('--interactive'))console.log('THEM_POSTGRES_WRITER_CONTRACT_PASSED');\n`);
    fs.chmodSync(binary, 0o755);
    const result = cli(gate, [], { PATH: directory, THEM_POSTGRES_GATE_BACKEND_IMAGE: "fixture:no-build" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /did not request an actual database restart/);
    assert.doesNotMatch(result.stdout, /postgres-writer-gate: PASS/);
    const calls = fs.readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
    const removals = calls.filter(args => args[0] === "rm" || args[1] === "rm");
    assert.equal(removals.length, 4, "Owned worker, database, volume and network cleaned after failure");
    assert.ok(removals.every(args => /^them-pg-gate-[a-f0-9-]+-(worker|db|data|net)$/.test(args.at(-1))));
    assert.ok(!calls.some(args => args[0] === "image"), "Borrowed image must not be removed");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

for (const failedKind of ["worker", "db"]) {
  test(`[postgres-writer-gate] ${failedKind} cleanup failure is reported without abandoning other resources`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "them-gate-cleanup-test-"));
    const log = path.join(directory, "calls.jsonl");
    try {
      const binary = path.join(directory, "docker");
      fs.writeFileSync(binary, `#!${process.execPath}\nconst fs=require('fs');const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');if(args.includes('--interactive'))console.log('THEM_POSTGRES_WRITER_CONTRACT_PASSED');if(args[0]==='rm'&&args.at(-1).endsWith('-${failedKind}')){console.error('fixture removal permission denied');process.exit(42);}\n`);
      fs.chmodSync(binary, 0o755);
      const result = cli(gate, [], { PATH: directory, THEM_POSTGRES_GATE_BACKEND_IMAGE: "fixture:no-build" });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /did not request an actual database restart/);
      assert.match(result.stderr, /cleanup incomplete/i, failedKind);
      assert.doesNotMatch(result.stdout, /postgres-writer-gate: PASS/);
      const calls = fs.readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
      const removals = calls.filter(args => args[0] === "rm" || args[1] === "rm");
      assert.equal(removals.length, 4, "One removal failure must not prevent the other cleanup attempts");
      assert.ok(!calls.some(args => args[0] === "image"), "Borrowed image must remain untouched");
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
}

for (const removal of ["denied", "absent"]) {
  test(`[postgres-writer-gate] successful worker only tolerates an exactly absent worker (${removal})`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "them-gate-cleanup-success-test-"));
    const log = path.join(directory, "calls.jsonl");
    try {
      const binary = path.join(directory, "docker");
      fs.writeFileSync(binary, `#!${process.execPath}\nconst fs=require('fs');const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');if(args.includes('--interactive')){console.log('THEM_POSTGRES_WRITER_RESTART_READY');process.stdin.once('data',()=>{console.log('THEM_POSTGRES_WRITER_CONTRACT_PASSED');process.exit(0);});}else if(args[0]==='rm'&&args.at(-1).endsWith('-worker')){console.error(${JSON.stringify(removal)}==='absent'?'Error response from daemon: No such container: '+args.at(-1):'fixture permission denied');process.exit(42);}\n`);
      fs.chmodSync(binary, 0o755);
      const result = cli(gate, [], { PATH: directory, THEM_POSTGRES_GATE_BACKEND_IMAGE: "fixture:no-build" });
      const calls = fs.readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
      assert.ok(calls.some(args => args[0] === "restart"), "Exercise the restart handshake before cleanup");
      assert.equal(calls.filter(args => args[0] === "rm" || args[1] === "rm").length, 4);
      if (removal === "absent") {
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /postgres-writer-gate: PASS/);
      } else {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /cleanup incomplete/i);
        assert.doesNotMatch(result.stdout, /postgres-writer-gate: PASS/);
      }
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
}

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  cleanupStudioEvalSessionsWithHelper,
  createStudioOwnedAppController,
  ensureStudioVisibleWithOpenHandshake,
  relaunchStudioAppWithHelper,
} from "../evals/studio_eval_debug_utils.mjs";

function helperSuccess(pid) {
  return {
    status: 0,
    stderr: "",
    stdout: [
      "OK=1",
      "STALE_PIDS=",
      `RELAUNCHED_PIDS=${pid}`,
      "REUSED_EXISTING_SESSION=0",
      "HAD_EXISTING_SESSION=0",
      "LAST_TEARDOWN_STAGE=done",
      `FRESH_PID=${pid}`,
      "SESSION_MODE=fresh_relaunch",
      "ERROR_MESSAGE=",
    ].join("\n"),
  };
}

function cleanupHelperSuccess() {
  return {
    status: 0,
    stderr: "",
    stdout: [
      "OK=1",
      "STALE_PIDS=",
      "RELAUNCHED_PIDS=",
      "REUSED_EXISTING_SESSION=0",
      "HAD_EXISTING_SESSION=0",
      "LAST_TEARDOWN_STAGE=done",
      "FRESH_PID=0",
      "SESSION_MODE=cleanup_only",
      "ERROR_MESSAGE=",
    ].join("\n"),
  };
}

test("relaunch helper adds one explicit Studio eval marker and preserves launch arguments", () => {
  let invocation = null;
  const telemetry = relaunchStudioAppWithHelper({
    helperPath: "/tmp/studio-helper.sh",
    appPath: "/tmp/them.app",
    launchArguments: ["-user_id", "user with spaces"],
    runOptional(command, args, options) {
      invocation = { command, args, options };
      return helperSuccess(321);
    },
  });

  assert.equal(telemetry.freshPid, 321);
  assert.equal(invocation.command, "/bin/bash");
  assert.deepEqual(invocation.args, [
    "/tmp/studio-helper.sh",
    "--app-path",
    "/tmp/them.app",
    "--launch-arg",
    "--studio-eval",
    "--launch-arg",
    "-user_id",
    "--launch-arg",
    "user with spaces",
  ]);
});

test("cleanup helper requires one explicit Studio eval marker and no app path", () => {
  let invocation = null;
  const telemetry = cleanupStudioEvalSessionsWithHelper({
    helperPath: "/tmp/studio-helper.sh",
    runOptional(command, args, options) {
      invocation = { command, args, options };
      return cleanupHelperSuccess();
    },
  });

  assert.equal(telemetry.sessionMode, "cleanup_only");
  assert.equal(invocation.command, "/bin/bash");
  assert.deepEqual(invocation.args, [
    "/tmp/studio-helper.sh",
    "--cleanup-only",
    "--launch-arg",
    "--studio-eval",
  ]);
});

test("open handshake reacquires the owned PID and reuses one token after a failed attempt", async () => {
  const values = new Map();
  const writes = [];
  const activations = [];
  const helperArguments = [];
  let helperLaunchCount = 0;

  const debugDefaults = {
    nextToken() {
      return 77;
    },
    writeString(key, value) {
      values.set(key, value);
    },
    writeInt(key, value) {
      values.set(key, value);
      writes.push([key, value]);
    },
    readInt(key) {
      if (key === "studio_debug_open_ack_token" && helperLaunchCount >= 2) {
        return values.get("studio_debug_open_token") || 0;
      }
      return values.get(key) || 0;
    },
  };

  const result = await ensureStudioVisibleWithOpenHandshake({
    appPath: "/tmp/them.app",
    helperPath: "/tmp/studio-helper.sh",
    launchArguments: ["-user_id", "isolated-user"],
    debugDefaults,
    runOptional(command, args) {
      assert.equal(command, "/bin/bash");
      helperLaunchCount += 1;
      helperArguments.push(args);
      return helperSuccess(helperLaunchCount === 1 ? 111 : 222);
    },
    activateApp(boundAppPath, session) {
      assert.equal(boundAppPath, "/tmp/them.app");
      activations.push(session.freshPid);
    },
    appHasWindow() {
      return true;
    },
    readDebugDiffState() {
      return helperLaunchCount >= 2 ? { studioSurfaceActive: true } : null;
    },
    maxAttempts: 2,
    startupTimeoutMs: 20,
    ackTimeoutMs: 20,
    settleMs: 0,
  });

  assert.equal(result.token, 77);
  assert.equal(result.appSession.freshPid, 222);
  assert.deepEqual(activations, [111, 222, 222]);
  assert.deepEqual(
    writes.filter(([key]) => key === "studio_debug_open_token").map(([, value]) => value),
    [0, 77, 0, 77]
  );
  assert.equal(helperArguments.length, 2);
  for (const args of helperArguments) {
    assert.equal(args.filter((value) => value === "--studio-eval").length, 1);
    assert.ok(args.includes("isolated-user"));
  }
});

test("owned app controller binds the helper PID and fails closed after ownership changes", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "them-owned-controller-test-"));
  const executablePath = join(fixtureRoot, "them");
  writeFileSync(executablePath, "fixture", "utf8");
  const resolvedExecutablePath = realpathSync(executablePath);
  const appleScripts = [];
  let processCommand = `${resolvedExecutablePath} --studio-eval -user_id fixture`;

  try {
    const controller = createStudioOwnedAppController({
      runOptional(command, args) {
        if (command === "ps" && args.at(-1) === "command=") {
          return { status: 0, stdout: processCommand, stderr: "" };
        }
        if (command === "ps" && args.at(-1) === "lstart=") {
          return { status: 0, stdout: "Mon Aug 24 12:00:00 2026", stderr: "" };
        }
        if (command === "osascript") {
          appleScripts.push(args.join("\n"));
          return { status: 0, stdout: "1", stderr: "" };
        }
        throw new Error(`unexpected controller command: ${command} ${args.join(" ")}`);
      },
    });

    controller.activate(executablePath, { freshPid: 701 });
    assert.equal(controller.pid, 701);
    assert.equal(controller.executablePath, resolvedExecutablePath);
    assert.equal(controller.hasWindow(), true);
    assert.match(appleScripts[0], /processes whose unix id is 701/);
    assert.match(appleScripts[0], /repeat with attempt from 1 to 40/);
    assert.match(appleScripts[1], /first process whose unix id is 701/);

    processCommand = `${resolvedExecutablePath} -user_id ordinary-session`;
    assert.throws(
      () => controller.hasWindow(),
      /no longer matches the helper-owned eval session/
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("open handshake fails closed when the bound relaunch helper fails", async () => {
  let unboundOpenAttempted = false;
  await assert.rejects(
    ensureStudioVisibleWithOpenHandshake({
      appPath: "/tmp/them.app",
      helperPath: "/tmp/studio-helper.sh",
      debugDefaults: {
        nextToken: () => 1,
        writeString() {},
        writeInt() {},
        readInt: () => 0,
      },
      runOptional(command) {
        if (command === "open") unboundOpenAttempted = true;
        return { status: 1, stdout: "OK=0\nERROR_MESSAGE=launch failed", stderr: "" };
      },
    }),
    /Studio app relaunch helper failed/
  );
  assert.equal(unboundOpenAttempted, false);
});

test("open handshake does not relaunch or degrade after its final failed attempt", async () => {
  const values = new Map();
  let helperLaunchCount = 0;
  await assert.rejects(
    ensureStudioVisibleWithOpenHandshake({
      appPath: "/tmp/them.app",
      helperPath: "/tmp/studio-helper.sh",
      debugDefaults: {
        nextToken: () => 91,
        writeString(key, value) { values.set(key, value); },
        writeInt(key, value) { values.set(key, value); },
        readInt: () => 0,
      },
      runOptional() {
        helperLaunchCount += 1;
        return helperSuccess(400 + helperLaunchCount);
      },
      activateApp() {},
      appHasWindow: () => true,
      readDebugDiffState: () => ({ studioSurfaceActive: true }),
      maxAttempts: 2,
      ackTimeoutMs: 20,
      settleMs: 0,
    }),
    /Studio open ack 91/
  );
  assert.equal(helperLaunchCount, 2);
});

test("relaunch helper rejects malformed success telemetry without a fresh owned PID", () => {
  assert.throws(
    () => relaunchStudioAppWithHelper({
      helperPath: "/tmp/studio-helper.sh",
      appPath: "/tmp/them.app",
      runOptional() {
        return {
          status: 0,
          stderr: "",
          stdout: "OK=1\nFRESH_PID=0\nRELAUNCHED_PIDS=",
        };
      },
    }),
    /invalid PID ownership telemetry/
  );
});

test("direct macOS eval launches opt into exactly one Studio eval session marker", () => {
  const evalDirectory = new URL("../evals/", import.meta.url);
  const violations = [];

  for (const filename of readdirSync(evalDirectory).filter((value) => /\.(?:mjs|sh)$/.test(value))) {
    const source = readFileSync(new URL(filename, evalDirectory), "utf8");
    if (filename !== "studio_app_session_helper.sh") {
      if (/(?:run|runOptional)\(\s*["']open["']/.test(source) || /\bopen\s+-na\b/.test(source)) {
        violations.push(`${filename}: bypassed the shared Studio app session helper`);
      }
      if (/runOptional\(\s*["']killall["']/.test(source) || /tell application [^\n]*them[^\n]* to quit/.test(source)) {
        violations.push(`${filename}: used name-based teardown instead of owned-session cleanup`);
      }
    }

    if (/\.mjs$/.test(filename)) {
      const nameBoundInteractionPatterns = [
        /tell application\s+\\?["']them\\?["']/i,
        /(?:tell\s+)?process\s+\\?["']them\\?["']/i,
        /processes? whose name is\s+\\?["']them\\?["']/i,
        /kCGWindowOwnerName/,
        /pgrep[^\n]*["']-x["'][^\n]*["']them["']/,
      ];
      for (const pattern of nameBoundInteractionPatterns) {
        if (pattern.test(source)) {
          violations.push(`${filename}: used name-bound Studio interaction (${pattern})`);
        }
      }
    }

    const arrayLaunchPattern = /(?:run|runOptional)\("open",\s*\[([^\]]*\bappPath\b[^\]]*)\]\)/g;
    for (const match of source.matchAll(arrayLaunchPattern)) {
      const markerCount = (match[1].match(/--studio-eval/g) || []).length;
      if (markerCount !== 1) {
        violations.push(`${filename}: direct open(appPath) marker count was ${markerCount}`);
      }
    }

    const shellLaunchPattern = /open\s+-na\s+\$\{escapedPath\}([^\n`]*)/g;
    for (const match of source.matchAll(shellLaunchPattern)) {
      const markerCount = (match[1].match(/--studio-eval/g) || []).length;
      if (markerCount !== 1) {
        violations.push(`${filename}: shell open(appPath) marker count was ${markerCount}`);
      }
    }

    const directHelperPattern = /runOptional\("\/bin\/bash",\s*\[([\s\S]*?studioAppSessionHelperPath[\s\S]*?)\]\)/g;
    for (const match of source.matchAll(directHelperPattern)) {
      const markerCount = (match[1].match(/--studio-eval/g) || []).length;
      if (markerCount !== 1) {
        violations.push(`${filename}: direct session-helper marker count was ${markerCount}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("active shell shortcut smoke launches and targets one owned eval PID", () => {
  const source = readFileSync(
    new URL("../evals/run_studio_screenplay_shortcuts_smoke.sh", import.meta.url),
    "utf8"
  );
  assert.match(source, /studio_app_session_helper\.sh/);
  assert.equal((source.match(/--launch-arg --studio-eval/g) || []).length, 1);
  assert.match(source, /first process whose unix id is \$\{STUDIO_APP_PID\}/);
  assert.doesNotMatch(source, /tell application ["']them["'] to activate/);
});

test("inspector fixture waits for initial Studio hydration before seeding", () => {
  const source = readFileSync(
    new URL("../evals/run_studio_inspector_tabs_visual_smoke.mjs", import.meta.url),
    "utf8"
  );
  const settledHandshake = source.indexOf("state?.initialLoadSettled === true");
  const structuralWrite = source.indexOf('writeDefaultInt("studio_debug_seed_structural_token", token)');
  assert.ok(settledHandshake >= 0, "missing initial hydration handshake");
  assert.ok(structuralWrite > settledHandshake, "structural seed must follow initial hydration");
});

test("shell helper forwards only allowlisted env and owns the exact marked app PID", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "them-studio-helper-test-"));
  const appPath = join(fixtureRoot, "them.app");
  const executableDir = join(appPath, "Contents", "MacOS");
  const executablePath = join(executableDir, "them");
  const fakeBin = join(fixtureRoot, "bin");
  const openArgsPath = join(fixtureRoot, "open-args.txt");
  const launchedPidPath = join(fixtureRoot, "launched-pid.txt");
  const sourcePath = join(fixtureRoot, "them.c");
  mkdirSync(executableDir, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(
    sourcePath,
    "#include <signal.h>\n#include <unistd.h>\nint main(void) { signal(SIGHUP, SIG_IGN); for (;;) pause(); }\n",
    "utf8"
  );
  const compile = spawnSync("cc", [sourcePath, "-o", executablePath], { encoding: "utf8" });
  assert.equal(compile.status, 0, compile.stderr || compile.stdout);

  const fakeOpenPath = join(fakeBin, "open");
  writeFileSync(fakeOpenPath, `#!/bin/bash
set -e
printf '%s\\n' "$@" > "$FAKE_OPEN_ARGS_FILE"
app_path=""
launch_args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -na)
      app_path="$2"
      shift 2
      ;;
    --env)
      export "$2"
      shift 2
      ;;
    --args)
      shift
      launch_args=("$@")
      break
      ;;
    *)
      shift
      ;;
  esac
done
"$app_path/Contents/MacOS/them" "\${launch_args[@]}" >/dev/null 2>&1 &
printf '%s' "$!" > "$FAKE_OPEN_PID_FILE"
`, "utf8");
  chmodSync(fakeOpenPath, 0o755);

  const helperPath = new URL("../evals/studio_app_session_helper.sh", import.meta.url).pathname;
  let launchedPid = 0;
  try {
    const result = spawnSync("/bin/bash", [
      helperPath,
      "--app-path",
      appPath,
      "--launch-arg",
      "--studio-eval",
    ], {
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH || ""}`,
        FAKE_OPEN_ARGS_FILE: openArgsPath,
        FAKE_OPEN_PID_FILE: launchedPidPath,
        APP_TOKEN: "token value with spaces",
        BACKEND_BASE_URL: "https://backend.example.test/path",
        AWS_SECRET_ACCESS_KEY: "must-not-leak",
        STUDIO_APP_SESSION_HELPER_TIMEOUT_SECONDS: "5",
        STUDIO_APP_SESSION_HELPER_POLL_MILLIS: "50",
      },
    });
    try {
      launchedPid = Number(readFileSync(launchedPidPath, "utf8"));
    } catch {}
    const launchedProcess = launchedPid > 0
      ? spawnSync("ps", ["-p", String(launchedPid), "-o", "command="], { encoding: "utf8" })
      : null;
    assert.equal(
      result.status,
      0,
      `${result.stderr || result.stdout}\nlaunched_pid=${launchedPid}\nlaunched_command=${launchedProcess?.stdout?.trim() || "<missing>"}`
    );
    assert.ok(launchedPid > 0);
    assert.match(result.stdout, new RegExp(`FRESH_PID=${launchedPid}(?:\\n|$)`));

    const openArguments = readFileSync(openArgsPath, "utf8").split(/\r?\n/).filter(Boolean);
    assert.ok(openArguments.includes("APP_TOKEN=token value with spaces"));
    assert.ok(openArguments.includes("BACKEND_BASE_URL=https://backend.example.test/path"));
    assert.ok(openArguments.includes("--studio-eval"));
    assert.equal(openArguments.some((value) => value.includes("AWS_SECRET_ACCESS_KEY")), false);
    assert.equal(openArguments.some((value) => value.includes("must-not-leak")), false);
    assert.equal(result.stdout.includes("token value with spaces"), false);
    assert.equal(result.stderr.includes("token value with spaces"), false);
  } finally {
    if (launchedPid <= 0) {
      try {
        const recordedPid = Number(readFileSync(launchedPidPath, "utf8"));
        if (Number.isSafeInteger(recordedPid) && recordedPid > 0) launchedPid = recordedPid;
      } catch {}
    }
    const ownsFixtureProcess = () => {
      if (launchedPid <= 0) return false;
      const probe = spawnSync("ps", ["-p", String(launchedPid), "-o", "command="], { encoding: "utf8" });
      return probe.status === 0 && probe.stdout.trim().startsWith(executablePath);
    };
    if (ownsFixtureProcess()) {
      try { process.kill(launchedPid, "SIGTERM"); } catch {}
      for (let attempt = 0; attempt < 20 && ownsFixtureProcess(); attempt += 1) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
      }
      if (ownsFixtureProcess()) {
        try { process.kill(launchedPid, "SIGKILL"); } catch {}
      }
    }
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("cleanup-only helper removes marked sessions across executables and preserves unmarked THEM", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "them-studio-cleanup-test-"));
  const helperPath = new URL("../evals/studio_app_session_helper.sh", import.meta.url).pathname;
  const sourcePath = join(fixtureRoot, "them-daemon.c");
  const executablePaths = [
    join(fixtureRoot, "DerivedData-A", "them.app", "Contents", "MacOS", "them"),
    join(fixtureRoot, "DerivedData-B", "them.app", "Contents", "MacOS", "them"),
    join(fixtureRoot, "Ordinary", "them.app", "Contents", "MacOS", "them"),
  ];
  const launchedPids = [];

  const processMatches = (pid, executablePath) => {
    if (!Number.isSafeInteger(pid) || pid <= 0) return false;
    const probe = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
    const command = (probe.stdout || "").trim();
    return probe.status === 0
      && (command === executablePath || command.startsWith(`${executablePath} `));
  };

  const launchDaemon = (executablePath, args) => {
    const result = spawnSync(executablePath, args, { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const pid = Number((result.stdout || "").trim());
    assert.ok(Number.isSafeInteger(pid) && pid > 0, `invalid daemon PID: ${result.stdout}`);
    launchedPids.push({ pid, executablePath });
    for (let attempt = 0; attempt < 40 && !processMatches(pid, executablePath); attempt += 1) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
    assert.equal(processMatches(pid, executablePath), true);
    return pid;
  };

  try {
    writeFileSync(sourcePath, `#include <stdio.h>
#include <unistd.h>
int main(void) {
  pid_t child = fork();
  if (child < 0) return 1;
  if (child > 0) {
    printf("%d\\n", (int)child);
    fflush(stdout);
    return 0;
  }
  if (setsid() < 0) return 2;
  close(STDIN_FILENO);
  close(STDOUT_FILENO);
  close(STDERR_FILENO);
  for (;;) pause();
}
`, "utf8");
    for (const executablePath of executablePaths) {
      mkdirSync(join(executablePath, ".."), { recursive: true });
      const compile = spawnSync("cc", [sourcePath, "-o", executablePath], { encoding: "utf8" });
      assert.equal(compile.status, 0, compile.stderr || compile.stdout);
    }

    const rejectedCleanup = spawnSync("/bin/bash", [helperPath, "--cleanup-only"], {
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        STUDIO_APP_SESSION_HELPER_TIMEOUT_SECONDS: "2",
        STUDIO_APP_SESSION_HELPER_POLL_MILLIS: "50",
      },
    });
    assert.notEqual(rejectedCleanup.status, 0);
    assert.match(rejectedCleanup.stdout, /--cleanup-only requires --launch-arg --studio-eval/);

    const markedPidA = launchDaemon(executablePaths[0], ["--studio-eval"]);
    const markedPidB = launchDaemon(executablePaths[1], ["-user_id", "fixture", "--studio-eval"]);
    const unmarkedPid = launchDaemon(executablePaths[2], []);

    const cleanup = spawnSync("/bin/bash", [
      helperPath,
      "--cleanup-only",
      "--launch-arg",
      "--studio-eval",
    ], {
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        STUDIO_APP_SESSION_HELPER_TIMEOUT_SECONDS: "3",
        STUDIO_APP_SESSION_HELPER_POLL_MILLIS: "50",
      },
    });
    assert.equal(cleanup.status, 0, cleanup.stderr || cleanup.stdout);
    assert.match(cleanup.stdout, /SESSION_MODE=cleanup_only/);

    const staleLine = cleanup.stdout.split(/\r?\n/).find((line) => line.startsWith("STALE_PIDS=")) || "";
    const stalePids = new Set(staleLine.slice("STALE_PIDS=".length).split(",").filter(Boolean).map(Number));
    assert.equal(stalePids.has(markedPidA), true);
    assert.equal(stalePids.has(markedPidB), true);
    assert.equal(stalePids.has(unmarkedPid), false);
    assert.equal(processMatches(markedPidA, executablePaths[0]), false);
    assert.equal(processMatches(markedPidB, executablePaths[1]), false);
    assert.equal(processMatches(unmarkedPid, executablePaths[2]), true);
  } finally {
    for (const { pid, executablePath } of launchedPids) {
      if (processMatches(pid, executablePath)) {
        try { process.kill(pid, "SIGTERM"); } catch {}
        for (let attempt = 0; attempt < 40 && processMatches(pid, executablePath); attempt += 1) {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
        }
        if (processMatches(pid, executablePath)) {
          try { process.kill(pid, "SIGKILL"); } catch {}
        }
      }
    }
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

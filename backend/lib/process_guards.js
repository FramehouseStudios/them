// Process-level safety net for the talk server.
//
// Express 4 does not catch a throw inside an `async` route handler: it
// surfaces as an unhandled promise rejection, and Node ≥ 15 terminates the
// process on those by default. On 2026-09-06 one undefined `.split` in a
// prompt-build request took the whole backend down mid-session. A single bad
// request must never end every other writer's session, so unhandled
// rejections are logged with their stack and the process keeps serving.
// Uncaught synchronous exceptions still exit (state may be corrupt), but they
// are logged in the same shape first so the crash is diagnosable.

const INSTALL_FLAG = Symbol.for("io.them.process_guards.installed");

function describeError(err) {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}\n${err.stack || ""}`.trim();
  }
  try {
    return typeof err === "string" ? err : JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function installProcessGuards({
  proc = process,
  log = (line) => console.error(line),
  exitOnUncaught = true,
  exit = (code) => process.exit(code),
} = {}) {
  if (!proc || typeof proc.on !== "function") return { installed: false, reason: "no_process" };
  if (proc[INSTALL_FLAG]) return { installed: false, reason: "already_installed" };
  proc[INSTALL_FLAG] = true;

  const onUnhandledRejection = (reason) => {
    log(`[process-guard] unhandled_rejection kept_alive=1 ${describeError(reason)}`);
  };
  const onUncaughtException = (err, origin) => {
    log(`[process-guard] uncaught_exception origin=${origin || "unknown"} exiting=${exitOnUncaught ? 1 : 0} ${describeError(err)}`);
    if (exitOnUncaught) exit(1);
  };
  proc.on("unhandledRejection", onUnhandledRejection);
  proc.on("uncaughtException", onUncaughtException);
  return { installed: true, onUnhandledRejection, onUncaughtException };
}

export { installProcessGuards, describeError, INSTALL_FLAG };

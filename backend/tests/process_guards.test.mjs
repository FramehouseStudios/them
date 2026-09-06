import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { installProcessGuards, describeError, INSTALL_FLAG } from "../lib/process_guards.js";

function fakeProcess() {
  return new EventEmitter();
}

test("[process-guards] an unhandled rejection is logged with its stack and the process stays up", () => {
  const proc = fakeProcess();
  const lines = [];
  let exited = null;
  const result = installProcessGuards({ proc, log: (l) => lines.push(l), exit: (code) => { exited = code; } });
  assert.equal(result.installed, true);
  proc.emit("unhandledRejection", new TypeError("Cannot read properties of undefined (reading 'split')"));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /unhandled_rejection kept_alive=1/);
  assert.match(lines[0], /TypeError: Cannot read properties of undefined/);
  assert.match(lines[0], /process_guards\.test\.mjs/, "stack is included");
  assert.equal(exited, null);
});

test("[process-guards] an uncaught exception is logged then exits by default, or kept alive when asked", () => {
  const proc = fakeProcess();
  const lines = [];
  let exited = null;
  installProcessGuards({ proc, log: (l) => lines.push(l), exit: (code) => { exited = code; } });
  proc.emit("uncaughtException", new Error("boom"), "uncaughtException");
  assert.match(lines[0], /uncaught_exception origin=uncaughtException exiting=1/);
  assert.equal(exited, 1);

  const proc2 = fakeProcess();
  const lines2 = [];
  let exited2 = null;
  installProcessGuards({ proc: proc2, log: (l) => lines2.push(l), exit: (code) => { exited2 = code; }, exitOnUncaught: false });
  proc2.emit("uncaughtException", new Error("boom"), "uncaughtException");
  assert.match(lines2[0], /exiting=0/);
  assert.equal(exited2, null);
});

test("[process-guards] installs once per process and describes non-Error reasons", () => {
  const proc = fakeProcess();
  assert.equal(installProcessGuards({ proc, log: () => {} }).installed, true);
  assert.equal(installProcessGuards({ proc, log: () => {} }).reason, "already_installed");
  assert.equal(proc[INSTALL_FLAG], true);
  assert.equal(proc.listenerCount("unhandledRejection"), 1);
  assert.equal(describeError("plain string"), "plain string");
  assert.equal(describeError({ code: 7 }), '{"code":7}');
  assert.equal(installProcessGuards({ proc: null }).reason, "no_process");
});

test("[process-guards] the server entry installs the guards on the real process", async () => {
  await import("../lib/process_guards.install.js");
  assert.equal(process[INSTALL_FLAG], true);
  assert.ok(process.listenerCount("unhandledRejection") >= 1);
});

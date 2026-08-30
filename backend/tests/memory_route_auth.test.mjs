import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultResolveMemoryUserId,
  memoryAuthRequired,
  requireMemoryUserId,
} from "../lib/memory_route_auth.js";

test("[memory-route-auth] resolves only trusted request identity", () => {
  assert.equal(defaultResolveMemoryUserId({ authUser: { id: "auth-user" } }), "auth-user");
  assert.equal(defaultResolveMemoryUserId({ user: { id: "req-user" } }), "req-user");
  assert.equal(defaultResolveMemoryUserId({ userId: "middleware-user" }), "middleware-user");
  assert.equal(
    defaultResolveMemoryUserId({
      get: (name) => (String(name).toLowerCase() === "x-user-id" ? "spoofed-user" : ""),
    }),
    null,
  );
});

test("[memory-route-auth] memoryAuthRequired returns canonical 401 body", () => {
  assert.deepEqual(memoryAuthRequired("memory_stats"), {
    stage: "memory_stats",
    error: "user_auth_required",
  });
});

test("[memory-route-auth] requireMemoryUserId writes a 401 once when missing", () => {
  const calls = [];
  const res = {
    setHeader(key, value) {
      calls.push(["header", key, value]);
    },
    status(code) {
      calls.push(["status", code]);
      return this;
    },
    json(body) {
      calls.push(["json", body]);
      return this;
    },
  };

  const userId = requireMemoryUserId({}, res, { stage: "memory_test" });
  assert.equal(userId, "");
  assert.deepEqual(calls, [
    ["header", "Cache-Control", "no-store"],
    ["status", 401],
    ["json", { stage: "memory_test", error: "user_auth_required" }],
  ]);
});

test("[memory-route-auth] requireMemoryUserId returns id without touching response", () => {
  const calls = [];
  const userId = requireMemoryUserId(
    { authUser: { id: "user-ok" } },
    { status: () => calls.push("status") },
  );
  assert.equal(userId, "user-ok");
  assert.deepEqual(calls, []);
});

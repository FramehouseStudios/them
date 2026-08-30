import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultResolveScreenplayUserId,
  requireScreenplayUserId,
  screenplayAuthRequired,
} from "../lib/screenplay_route_auth.js";

test("[screenplay-route-auth] resolves trusted server-attached user identity", () => {
  assert.equal(defaultResolveScreenplayUserId({ authUser: { id: "auth-user" } }), "auth-user");
  assert.equal(defaultResolveScreenplayUserId({ user: { id: "express-user" } }), "express-user");
  assert.equal(defaultResolveScreenplayUserId({ userId: "middleware-user" }), "middleware-user");
});

test("[screenplay-route-auth] ignores caller-supplied X-User-Id", () => {
  const req = {
    get(name) {
      return name.toLowerCase() === "x-user-id" ? "spoofed-user" : "";
    },
    headers: { "x-user-id": "spoofed-user" },
  };

  assert.equal(defaultResolveScreenplayUserId(req), null);
});

test("[screenplay-route-auth] sends 401 before screenplay owner resolution", () => {
  const headers = {};
  let statusCode = 0;
  let body = null;
  const res = {
    setHeader(key, value) {
      headers[key.toLowerCase()] = value;
    },
    status(code) {
      statusCode = code;
      return {
        json(payload) {
          body = payload;
        },
      };
    },
  };

  const userId = requireScreenplayUserId({ headers: { "x-user-id": "spoofed-user" } }, res, {
    stage: "screenplay_projects",
  });

  assert.equal(userId, "");
  assert.equal(statusCode, 401);
  assert.equal(headers["cache-control"], "no-store");
  assert.deepEqual(body, screenplayAuthRequired("screenplay_projects"));
});

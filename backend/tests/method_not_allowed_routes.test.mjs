import test from "node:test";
import assert from "node:assert/strict";

import {
  methodNotAllowed,
  registerMethodNotAllowedRoutes,
} from "../lib/method_not_allowed_routes.js";

// The exact (path, allow) pairs that index.js registered inline, in order.
// This locks the extraction as byte-identical to the previous behavior.
const EXPECTED = [
  ["/auth/signup", "POST"],
  ["/auth/login", "POST"],
  ["/auth/apple", "POST"],
  ["/auth/refresh", "POST"],
  ["/auth/logout", "POST"],
  ["/auth/sessions", "GET"],
  ["/auth/sessions/revoke", "POST"],
  ["/auth/request_password_reset", "POST"],
  ["/auth/reset_password", "POST"],
  ["/auth/request_email_verification", "POST"],
  ["/auth/verify_email", "POST"],
  ["/health", "GET"],
  ["/bridge", "GET"],
  ["/ops/metrics", "GET"],
  ["/ops/alerts", "GET"],
  ["/outbox", "GET"],
  ["/outbox/retry", "POST"],
  ["/state", "GET"],
  ["/history", "GET"],
  ["/memories", "GET"],
  ["/memories/export", "GET"],
  ["/memories/update", "POST"],
  ["/memories/corrections/undo", "POST"],
  ["/memories/corrections/resolve", "POST"],
  ["/memories/forget", "POST"],
  ["/memories/promote", "POST"],
  ["/memories/feedback", "POST"],
  ["/memory/screenplay-question/resolve", "POST"],
  ["/tasks", "GET"],
  ["/tasks/update", "POST"],
  ["/recap", "GET"],
  ["/recap/today", "GET"],
  ["/screenplay/projects", "GET, POST"],
  ["/screenplay/projects/:projectId", "GET"],
  ["/screenplay/projects/:projectId/outline", "GET, POST"],
  ["/screenplay/projects/:projectId/scenes", "POST"],
  ["/screenplay/projects/:projectId/beats", "POST"],
  ["/screenplay/projects/:projectId/collaborators", "GET, POST"],
  ["/screenplay/projects/:projectId/comments", "GET, POST"],
  ["/screenplay/projects/:projectId/version", "POST"],
  ["/screenplay/prompt/build", "POST"],
  ["/screenplay/paginate", "POST"],
  ["/screenplay/revision-colors", "POST"],
  ["/screenplay/export", "POST"],
  ["/history/annotate_turn", "POST"],
  ["/data/history/clear", "POST"],
  ["/data/memories/clear", "POST"],
  ["/linkedin/analyze", "POST"],
  ["/secretary/email", "POST"],
  ["/secretary/calendar", "POST"],
  ["/session", "POST, PATCH"],
  ["/realtime/client_secret", "POST"],
  ["/realtime/project_grounding", "POST"],
  ["/realtime/studio_render", "POST"],
  ["/realtime/studio_render_stream", "POST"],
  ["/visual/context", "POST"],
  ["/realtime/bridge", "GET"],
  ["/realtime/turn_commit", "POST"],
  ["/realtime/call", "POST"],
  ["/talk", "POST"],
  ["/talk/turn/:turnId", "GET"],
];

function makeFakeResponse() {
  return {
    headers: {},
    statusCode: 0,
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("[method-not-allowed] handler sets Allow header and returns 405 JSON", () => {
  const handler = methodNotAllowed("POST, PATCH");
  const res = makeFakeResponse();
  handler({ method: "DELETE" }, res);
  assert.equal(res.headers.Allow, "POST, PATCH");
  assert.equal(res.statusCode, 405);
  assert.deepEqual(res.body, { stage: "method", error: "Method DELETE not allowed." });
});

test("[method-not-allowed] registers every guard, in order, via app.all", () => {
  const registered = [];
  const fakeApp = {
    all(path, handler) {
      assert.equal(typeof handler, "function", `handler for ${path} must be a function`);
      // Probe the Allow header the handler would emit.
      const res = makeFakeResponse();
      handler({ method: "OPTIONS" }, res);
      registered.push([path, res.headers.Allow]);
    },
  };
  registerMethodNotAllowedRoutes(fakeApp);
  assert.deepEqual(registered, EXPECTED);
});

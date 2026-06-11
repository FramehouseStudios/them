// 405 Method-Not-Allowed guards, extracted verbatim from index.js.
//
// Each guard is `app.all(path, methodNotAllowed(allow))`. These are pure:
// `methodNotAllowed` closes over nothing but its `allow` argument, and the
// guards close over nothing from index.js. Behavior is byte-identical to the
// previous inline block.
//
// ORDER CONTRACT: Express matches the specific method handlers (registered
// earlier in index.js) before this catch-all, so a guard only fires for the
// *other* methods on that path. The caller MUST invoke
// registerMethodNotAllowedRoutes at the original site — after the real route
// handlers and before the final 404 `app.use` — to preserve that ordering.

function methodNotAllowed(allow) {
  return (req, res) => {
    res.setHeader("Allow", allow);
    return res.status(405).json({ stage: "method", error: `Method ${req.method} not allowed.` });
  };
}

function registerMethodNotAllowedRoutes(app) {
  app.all("/auth/signup", methodNotAllowed("POST"));
  app.all("/auth/login", methodNotAllowed("POST"));
  app.all("/auth/apple", methodNotAllowed("POST"));
  app.all("/auth/refresh", methodNotAllowed("POST"));
  app.all("/auth/logout", methodNotAllowed("POST"));
  app.all("/auth/sessions", methodNotAllowed("GET"));
  app.all("/auth/sessions/revoke", methodNotAllowed("POST"));
  app.all("/auth/request_password_reset", methodNotAllowed("POST"));
  app.all("/auth/reset_password", methodNotAllowed("POST"));
  app.all("/auth/request_email_verification", methodNotAllowed("POST"));
  app.all("/auth/verify_email", methodNotAllowed("POST"));
  app.all("/health", methodNotAllowed("GET"));
  app.all("/bridge", methodNotAllowed("GET"));
  app.all("/ops/metrics", methodNotAllowed("GET"));
  app.all("/ops/alerts", methodNotAllowed("GET"));
  app.all("/outbox", methodNotAllowed("GET"));
  app.all("/outbox/retry", methodNotAllowed("POST"));
  app.all("/state", methodNotAllowed("GET"));
  app.all("/history", methodNotAllowed("GET"));
  app.all("/memories", methodNotAllowed("GET"));
  app.all("/memories/export", methodNotAllowed("GET"));
  app.all("/memories/update", methodNotAllowed("POST"));
  app.all("/memories/forget", methodNotAllowed("POST"));
  app.all("/memories/promote", methodNotAllowed("POST"));
  app.all("/memories/feedback", methodNotAllowed("POST"));
  app.all("/tasks", methodNotAllowed("GET"));
  app.all("/tasks/update", methodNotAllowed("POST"));
  app.all("/recap", methodNotAllowed("GET"));
  app.all("/recap/today", methodNotAllowed("GET"));
  app.all("/screenplay/projects", methodNotAllowed("GET, POST"));
  app.all("/screenplay/projects/:projectId", methodNotAllowed("GET"));
  app.all("/screenplay/projects/:projectId/outline", methodNotAllowed("GET, POST"));
  app.all("/screenplay/projects/:projectId/scenes", methodNotAllowed("POST"));
  app.all("/screenplay/projects/:projectId/beats", methodNotAllowed("POST"));
  app.all("/screenplay/projects/:projectId/collaborators", methodNotAllowed("GET, POST"));
  app.all("/screenplay/projects/:projectId/comments", methodNotAllowed("GET, POST"));
  app.all("/screenplay/projects/:projectId/version", methodNotAllowed("POST"));
  app.all("/screenplay/prompt/build", methodNotAllowed("POST"));
  app.all("/screenplay/paginate", methodNotAllowed("POST"));
  app.all("/screenplay/revision-colors", methodNotAllowed("POST"));
  app.all("/screenplay/export", methodNotAllowed("POST"));
  app.all("/history/annotate_turn", methodNotAllowed("POST"));
  app.all("/data/history/clear", methodNotAllowed("POST"));
  app.all("/data/memories/clear", methodNotAllowed("POST"));
  app.all("/linkedin/analyze", methodNotAllowed("POST"));
  app.all("/secretary/email", methodNotAllowed("POST"));
  app.all("/secretary/calendar", methodNotAllowed("POST"));
  app.all("/session", methodNotAllowed("POST, PATCH"));
  app.all("/realtime/client_secret", methodNotAllowed("POST"));
  app.all("/realtime/studio_render", methodNotAllowed("POST"));
  app.all("/realtime/studio_render_stream", methodNotAllowed("POST"));
  app.all("/visual/context", methodNotAllowed("POST"));
  app.all("/realtime/bridge", methodNotAllowed("GET"));
  app.all("/realtime/turn_commit", methodNotAllowed("POST"));
  app.all("/realtime/call", methodNotAllowed("POST"));
  app.all("/talk", methodNotAllowed("POST"));
  app.all("/talk/turn/:turnId", methodNotAllowed("GET"));
}

export { methodNotAllowed, registerMethodNotAllowedRoutes };

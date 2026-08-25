// T-decompose-phase4-auth-routes — extract the 11 `/auth/*` routes
// from backend/index.js.
//
// Phase 4 of the decomposition (spec:
// `docs/specs/T-decompose-backend-index.md`). Phases 0–3 all merged
// on main. Per spec, max 1 decomposition PR in flight.
//
// Routes:
//   POST /auth/signup
//   POST /auth/login
//   POST /auth/apple
//   POST /auth/refresh
//   POST /auth/logout
//   GET  /auth/sessions
//   POST /auth/sessions/revoke
//   POST /auth/request_password_reset
//   POST /auth/reset_password
//   POST /auth/request_email_verification
//   POST /auth/verify_email
//
// All 11 routes are thin delegates: each one calls a handler that
// already lives in lib/user_auth.js via the `userAuth` subsystem.
// The inline block was just 11 `app.post(...)` lines plus a shared
// 256kb JSON parser. This PR moves the mount into a single
// `mountAuthRoutes(app, deps)` call.
//
// Behavior is byte-identical with the previous inline mount lines.
// The shared `authJson` middleware is created inside the lib with
// the same 256kb limit. GET /auth/sessions is mounted without
// JSON parsing (no body needed).
//
// Access-control posture: TIER-3 SENSITIVE. Auth handlers gate the
// rest of the surface. This PR does not change any auth contract;
// it only relocates the mount block. The user_auth subsystem
// (created in index.js via createUserAuthSubsystem) is passed as
// a dep — `userAuth.handleX` references resolve at mount time and
// stay bound for the lifetime of the process.

import express from "express";

const AUTH_BODY_LIMIT = "256kb";

function mountAuthRoutes(app, deps = {}) {
  if (!app || typeof app.post !== "function" || typeof app.get !== "function") {
    throw new Error("mountAuthRoutes requires an Express app");
  }
  const { userAuth } = deps;
  if (!userAuth || typeof userAuth !== "object") {
    throw new Error("mountAuthRoutes requires the userAuth subsystem");
  }
  const requiredHandlers = [
    "handleAuthSignup",
    "handleAuthLogin",
    "handleAuthApple",
    "handleAuthRefresh",
    "handleAuthLogout",
    "handleAuthSessions",
    "handleAuthSessionsRevoke",
    "handleAuthRequestPasswordReset",
    "handleAuthResetPassword",
    "handleAuthRequestEmailVerification",
    "handleAuthVerifyEmail",
  ];
  for (const handlerName of requiredHandlers) {
    if (typeof userAuth[handlerName] !== "function") {
      throw new Error(`mountAuthRoutes: userAuth.${handlerName} is required`);
    }
  }

  const authJson = express.json({ limit: AUTH_BODY_LIMIT });
  const wrapAuthHandler = (handler) => (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

  app.post("/auth/signup", authJson, wrapAuthHandler(userAuth.handleAuthSignup));
  app.post("/auth/login", authJson, wrapAuthHandler(userAuth.handleAuthLogin));
  app.post("/auth/apple", authJson, wrapAuthHandler(userAuth.handleAuthApple));
  app.post("/auth/refresh", authJson, wrapAuthHandler(userAuth.handleAuthRefresh));
  app.post("/auth/logout", authJson, wrapAuthHandler(userAuth.handleAuthLogout));
  app.get("/auth/sessions", wrapAuthHandler(userAuth.handleAuthSessions));
  app.post("/auth/sessions/revoke", authJson, wrapAuthHandler(userAuth.handleAuthSessionsRevoke));
  app.post("/auth/request_password_reset", authJson, wrapAuthHandler(userAuth.handleAuthRequestPasswordReset));
  app.post("/auth/reset_password", authJson, wrapAuthHandler(userAuth.handleAuthResetPassword));
  app.post("/auth/request_email_verification", authJson, wrapAuthHandler(userAuth.handleAuthRequestEmailVerification));
  app.post("/auth/verify_email", authJson, wrapAuthHandler(userAuth.handleAuthVerifyEmail));
}

export { mountAuthRoutes, AUTH_BODY_LIMIT };

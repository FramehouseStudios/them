import jwt from "jsonwebtoken";

import {
  authenticateUser,
  consumeEmailVerificationToken,
  consumePasswordResetToken,
  createOrAttachAppleUser,
  createUser,
  getAuthSessionById,
  getUserByAppleSubject,
  getUserByEmail,
  getUserById,
  issueAuthSession,
  issueEmailVerificationToken,
  issuePasswordResetToken,
  listAuthSessionsForUser,
  markUserEmailVerified,
  revokeAllAuthSessionsForUser,
  revokeAuthSessionById,
  revokeAuthSessionByToken,
  rotateAuthSession,
  updateUserPassword,
} from "./user_store.js";

const ACCESS_TOKEN_AUDIENCE = "io.them.them";
const ACCESS_TOKEN_ISSUER = "io.them.backend";
const USER_PROTECTED_PATTERNS = [
  /^\/state(?:\/|$)/,
  /^\/session(?:\/|$)/,
  /^\/history(?:\/|$)/,
  /^\/data\/(?:history|memories)\/clear(?:\/|$)/,
  /^\/memories(?:\/|$)/,
  /^\/tasks(?:\/|$)/,
  /^\/recap(?:\/|$)/,
  /^\/talk(?:\/|$)/,
  /^\/screenplay(?:\/|$)/,
  /^\/linkedin(?:\/|$)/,
  /^\/secretary(?:\/|$)/,
];

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeBoolean(value, fallback = false) {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function sanitizeText(value, maxLength = 160) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, Math.max(1, Number(maxLength || 160)));
}

function buildPublicUser(user) {
  if (!user || typeof user !== "object") return null;
  return {
    user_id: String(user.id || "").trim(),
    email: normalizeEmail(user.email),
    auth_provider: String(user.appleSubject || "").trim()
      ? "apple"
      : (user.password ? "password" : (sanitizeText(user.authProvider || "password", 24) || "password")),
    email_verified: Boolean(user.emailVerified),
    email_verified_at: Math.max(0, Number(user.emailVerifiedAt || 0)) || null,
    created_at: Math.max(0, Number(user.createdAt || 0)) || null,
    updated_at: Math.max(0, Number(user.updatedAt || 0)) || null,
  };
}

function buildDevicePayload(metadata = {}) {
  const safe = metadata && typeof metadata === "object" ? metadata : {};
  const payload = {
    label: sanitizeText(safe.label || "", 96) || null,
    client_name: sanitizeText(safe.clientName || "", 48) || null,
    client_platform: sanitizeText(safe.clientPlatform || "", 48) || null,
    client_version: sanitizeText(safe.clientVersion || "", 48) || null,
    client_build: sanitizeText(safe.clientBuild || "", 48) || null,
    user_agent: sanitizeText(safe.userAgent || "", 256) || null,
    auth_transport: sanitizeText(safe.authTransport || "", 24) || null,
    last_seen_at: Math.max(0, Number(safe.lastSeenAt || 0)) || null,
  };
  if (!payload.label && !payload.client_name && !payload.client_platform && !payload.client_version && !payload.client_build && !payload.user_agent && !payload.auth_transport && !payload.last_seen_at) {
    return null;
  }
  return payload;
}

function buildManagedSession(session, user, now = Date.now()) {
  if (!session || typeof session !== "object") return null;
  let state = "active";
  if (Number(session.expiresAt || 0) > 0 && Number(session.expiresAt || 0) <= now) {
    state = "expired";
  } else if (Number(session.revokedAt || 0) > 0) {
    state = session.replacedBySessionId ? "replaced" : "revoked";
  }
  return {
    session_id: String(session.sessionId || "").trim(),
    family_id: String(session.familyId || "").trim() || null,
    user_id: String(session.userId || "").trim() || null,
    email: normalizeEmail(user?.email) || null,
    created_at: Math.max(0, Number(session.createdAt || 0)) || null,
    updated_at: Math.max(0, Number(session.updatedAt || 0)) || null,
    expires_at: Math.max(0, Number(session.expiresAt || 0)) || null,
    revoked_at: Math.max(0, Number(session.revokedAt || 0)) || null,
    replaced_by_session_id: String(session.replacedBySessionId || "").trim() || null,
    device: buildDevicePayload(session.metadata),
    state,
  };
}

function createUserAuthSubsystem(options = {}) {
  const nodeEnv = sanitizeText(options.nodeEnv || "development", 24) || "development";
  const requireUserAuth = Boolean(options.requireUserAuth);
  const requireEmailVerification = Boolean(options.requireEmailVerification);
  const autoVerifyEmails = Boolean(options.autoVerifyEmails);
  const accessTtlSeconds = Math.max(60, Number(options.accessTtlSeconds || (14 * 24 * 60 * 60)));
  const refreshTtlSeconds = Math.max(accessTtlSeconds, Number(options.refreshTtlSeconds || (30 * 24 * 60 * 60)));
  const passwordResetTtlSeconds = Math.max(300, Number(options.passwordResetTtlSeconds || (60 * 60)));
  const emailVerificationTtlSeconds = Math.max(300, Number(options.emailVerificationTtlSeconds || (24 * 60 * 60)));
  const appleAudience = sanitizeText(options.appleAudience || "", 120);
  const appleTestJwtSecret = String(options.appleTestJwtSecret || "").trim();
  const appleJwtPublicKey = String(options.appleJwtPublicKey || "").trim();
  const signingSecret = String(options.jwtSecret || "").trim() || (nodeEnv === "production" ? "" : "them-dev-user-jwt-secret");
  const authConfigured = Boolean(signingSecret);
  const allowDebugTokens = nodeEnv !== "production";

  function authMisconfigured(res, stage = "auth_user") {
    return res.status(503).json({ stage, error: "user_auth_not_configured" });
  }

  function buildEmailDelivery(action = "noop", transport = "none") {
    return {
      status: "accepted",
      action,
      transport,
      compose_url: null,
      error: null,
    };
  }

  function buildAuthEnvelope({ user = null, accessToken = "", refreshToken = "", session = null, extra = {} } = {}) {
    const now = Date.now();
    const safeSession = session && typeof session === "object" ? session : null;
    const pendingEmailVerification = Boolean(requireEmailVerification && user && !user.emailVerified);
    const refreshExpiresIn = safeSession
      ? Math.max(1, Math.floor((Math.max(0, Number(safeSession.expiresAt || 0)) - now) / 1000))
      : null;
    return {
      ok: true,
      user: buildPublicUser(user),
      token: accessToken || null,
      access_token: accessToken || null,
      access_expires_in: accessToken ? accessTtlSeconds : null,
      refresh_token: refreshToken || null,
      refresh_expires_in: refreshToken && refreshExpiresIn != null ? refreshExpiresIn : null,
      refresh_token_transport: refreshToken ? "body" : null,
      refresh_cookie_set: false,
      current_session_id: safeSession ? safeSession.sessionId : null,
      current_family_id: safeSession ? safeSession.familyId : null,
      token_type: "Bearer",
      expires_in: accessToken ? accessTtlSeconds : null,
      pending_email_verification: pendingEmailVerification,
      verification_required: pendingEmailVerification,
      ...extra,
    };
  }

  function signAccessToken(user, session) {
    return jwt.sign({
      sub: String(user?.id || "").trim(),
      email: normalizeEmail(user?.email),
      sid: String(session?.sessionId || "").trim(),
      fid: String(session?.familyId || "").trim(),
      typ: "access",
    }, signingSecret, {
      algorithm: "HS256",
      audience: ACCESS_TOKEN_AUDIENCE,
      issuer: ACCESS_TOKEN_ISSUER,
      expiresIn: accessTtlSeconds,
    });
  }

  function verifyAccessToken(token) {
    if (!authConfigured) {
      return { ok: false, error: "user_auth_not_configured" };
    }
    try {
      const payload = jwt.verify(String(token || ""), signingSecret, {
        algorithms: ["HS256"],
        audience: ACCESS_TOKEN_AUDIENCE,
        issuer: ACCESS_TOKEN_ISSUER,
      });
      if (!payload || typeof payload !== "object") {
        return { ok: false, error: "invalid_user_token" };
      }
      if (String(payload.typ || payload.type || "").trim() !== "access") {
        return { ok: false, error: "invalid_user_token" };
      }
      const userId = String(payload.sub || "").trim();
      const sessionId = String(payload.sid || "").trim();
      const user = getUserById(userId);
      if (!user) {
        return { ok: false, error: "invalid_user_token" };
      }
      const session = getAuthSessionById(sessionId, Date.now(), {
        includeExpired: true,
        includeRevoked: true,
      });
      if (!session) {
        return { ok: false, error: "invalid_user_token" };
      }
      if (String(session.userId || "").trim() !== userId) {
        return { ok: false, error: "invalid_user_token" };
      }
      if (Number(session.revokedAt || 0) > 0) {
        return { ok: false, error: "revoked_user_token" };
      }
      if (Number(session.expiresAt || 0) > 0 && Number(session.expiresAt || 0) <= Date.now()) {
        return { ok: false, error: "expired_user_token" };
      }
      return {
        ok: true,
        payload,
        user,
        session,
      };
    } catch (error) {
      if (error && error.name === "TokenExpiredError") {
        return { ok: false, error: "expired_user_token" };
      }
      return { ok: false, error: "invalid_user_token" };
    }
  }

  function extractAccessToken(req) {
    const authorization = String(req.get("Authorization") || "").trim();
    if (/^Bearer\s+/i.test(authorization)) {
      return authorization.replace(/^Bearer\s+/i, "").trim();
    }
    return String(req.get("X-User-Token") || "").trim();
  }

  function attachUserAuth(req, res, next) {
    const token = extractAccessToken(req);
    if (!token) {
      req.authUser = null;
      req.authSession = null;
      req.authUserError = "";
      return next();
    }
    const verified = verifyAccessToken(token);
    if (!verified.ok) {
      req.authUser = null;
      req.authSession = null;
      req.authUserError = verified.error || "invalid_user_token";
      return next();
    }
    req.authUser = verified.user;
    req.authSession = verified.session;
    req.authTokenPayload = verified.payload;
    req.authUserError = "";
    req.userId = verified.user.id;
    req.headers["x-user-id"] = verified.user.id;
    return next();
  }

  function isProtectedRoute(pathname) {
    const path = String(pathname || "").trim();
    return USER_PROTECTED_PATTERNS.some((pattern) => pattern.test(path));
  }

  function protectUserRoutes(req, res, next) {
    if (!requireUserAuth) return next();
    if (!isProtectedRoute(req.path)) return next();
    if (!authConfigured) return authMisconfigured(res, "auth_user");
    if (req.authUser) return next();
    return res.status(401).json({
      stage: "auth_user",
      error: req.authUserError || "user_auth_required",
    });
  }

  function requireAuthenticatedUser(req, res, stage = "auth_user") {
    if (!authConfigured) {
      authMisconfigured(res, stage);
      return null;
    }
    if (req.authUser) return req.authUser;
    res.status(401).json({
      stage,
      error: req.authUserError || "user_auth_required",
    });
    return null;
  }

  function readRequestDevice(req) {
    const headers = req?.headers || {};
    return {
      label: sanitizeText(headers["x-them-device-label"] || "", 96),
      clientName: sanitizeText(headers["x-them-client-name"] || "", 48),
      clientPlatform: sanitizeText(headers["x-them-client-platform"] || "", 48),
      clientVersion: sanitizeText(headers["x-them-client-version"] || "", 48),
      clientBuild: sanitizeText(headers["x-them-client-build"] || "", 48),
      userAgent: sanitizeText(headers["user-agent"] || "", 256),
      authTransport: "body",
      lastSeenAt: Date.now(),
    };
  }

  function issueAuthResult(user, req, familyId = "") {
    const issued = issueAuthSession({
      userId: String(user?.id || "").trim(),
      familyId,
      ttlMs: refreshTtlSeconds * 1000,
      metadata: readRequestDevice(req),
    }, Date.now());
    if (!issued) return null;
    return {
      accessToken: signAccessToken(user, issued.session),
      refreshToken: issued.refreshToken,
      session: issued.session,
    };
  }

  function verifyAppleIdentityToken(identityToken) {
    const token = String(identityToken || "").trim();
    if (!token) {
      return { ok: false, status: 400, error: "identity_token_required" };
    }
    if (!appleTestJwtSecret && !appleJwtPublicKey) {
      return { ok: false, status: 503, error: "apple_sign_in_not_configured" };
    }
    const verifyOptions = {
      issuer: "https://appleid.apple.com",
    };
    if (appleAudience) {
      verifyOptions.audience = appleAudience;
    }
    try {
      const payload = appleTestJwtSecret
        ? jwt.verify(token, appleTestJwtSecret, { ...verifyOptions, algorithms: ["HS256"] })
        : jwt.verify(token, appleJwtPublicKey, { ...verifyOptions, algorithms: ["RS256"] });
      const subject = String(payload?.sub || "").trim();
      if (!subject) {
        return { ok: false, status: 401, error: "invalid_apple_identity_token" };
      }
      return {
        ok: true,
        subject,
        email: normalizeEmail(payload?.email),
        emailVerified: normalizeBoolean(payload?.email_verified, false),
      };
    } catch (_) {
      return { ok: false, status: 401, error: "invalid_apple_identity_token" };
    }
  }

  function handleAuthSignup(req, res) {
    if (!authConfigured) return authMisconfigured(res, "auth_signup");
    const now = Date.now();
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const created = createUser({
      email,
      password,
      emailVerified: autoVerifyEmails,
    }, now);
    if (!created.ok) {
      const statusCode = created.status === "email_taken" ? 409 : 400;
      return res.status(statusCode).json({
        stage: "auth_signup",
        error: created.status || "signup_failed",
      });
    }
    const issued = issueAuthResult(created.user, req);
    if (!issued) {
      return res.status(500).json({
        stage: "auth_signup",
        error: "session_issue_failed",
      });
    }
    const extra = {};
    if (requireEmailVerification && !created.user.emailVerified) {
      const verification = issueEmailVerificationToken({
        userId: created.user.id,
        ttlMs: emailVerificationTtlSeconds * 1000,
      }, now);
      extra.email_verification_requested = Boolean(verification);
      extra.email_delivery = buildEmailDelivery(
        allowDebugTokens && verification ? "token_in_response" : "queued",
        allowDebugTokens && verification ? "inline_debug" : "none"
      );
      if (allowDebugTokens && verification) {
        extra.debug_email_verification_token = verification.token;
      }
    }
    return res.status(201).json(buildAuthEnvelope({
      user: created.user,
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      session: issued.session,
      extra,
    }));
  }

  function handleAuthLogin(req, res) {
    if (!authConfigured) return authMisconfigured(res, "auth_login");
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const authenticated = authenticateUser(email, password);
    if (!authenticated.ok) {
      const statusCode = authenticated.status === "email_required" ? 400 : 401;
      return res.status(statusCode).json({
        stage: "auth_login",
        error: authenticated.status === "email_required" ? "email_required" : "invalid_credentials",
      });
    }
    const issued = issueAuthResult(authenticated.user, req);
    if (!issued) {
      return res.status(500).json({
        stage: "auth_login",
        error: "session_issue_failed",
      });
    }
    return res.status(200).json(buildAuthEnvelope({
      user: authenticated.user,
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      session: issued.session,
    }));
  }

  function handleAuthApple(req, res) {
    if (!authConfigured) return authMisconfigured(res, "auth_apple");
    const verified = verifyAppleIdentityToken(req.body?.identity_token);
    if (!verified.ok) {
      return res.status(verified.status || 401).json({
        stage: "auth_apple",
        error: verified.error || "invalid_apple_identity_token",
      });
    }
    const suppliedEmail = normalizeEmail(req.body?.email);
    const existing = getUserByAppleSubject(verified.subject) || (suppliedEmail ? getUserByEmail(suppliedEmail) : null);
    const createdOrAttached = createOrAttachAppleUser({
      appleSubject: verified.subject,
      email: verified.email || suppliedEmail,
      name: [sanitizeText(req.body?.given_name || "", 80), sanitizeText(req.body?.family_name || "", 80)].filter(Boolean).join(" "),
      emailVerified: verified.emailVerified || autoVerifyEmails,
    }, Date.now());
    if (!createdOrAttached.ok) {
      const statusCode = createdOrAttached.status === "email_taken" ? 409 : 400;
      return res.status(statusCode).json({
        stage: "auth_apple",
        error: createdOrAttached.status || "apple_sign_in_failed",
      });
    }
    const issued = issueAuthResult(createdOrAttached.user, req);
    if (!issued) {
      return res.status(500).json({
        stage: "auth_apple",
        error: "session_issue_failed",
      });
    }
    return res.status(existing ? 200 : 201).json(buildAuthEnvelope({
      user: createdOrAttached.user,
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      session: issued.session,
    }));
  }

  function handleAuthRefresh(req, res) {
    if (!authConfigured) return authMisconfigured(res, "auth_refresh");
    const refreshToken = String(req.body?.refresh_token || req.body?.refreshToken || req.get("X-Refresh-Token") || "").trim();
    if (!refreshToken) {
      return res.status(401).json({
        stage: "auth_refresh",
        error: "refresh_token_required",
      });
    }
    const rotated = rotateAuthSession(refreshToken, {
      ttlMs: refreshTtlSeconds * 1000,
      metadata: readRequestDevice(req),
    }, Date.now());
    if (!rotated) {
      return res.status(401).json({
        stage: "auth_refresh",
        error: "invalid_refresh_token",
      });
    }
    const user = getUserById(rotated.session.userId);
    if (!user) {
      revokeAuthSessionById(rotated.session.sessionId, Date.now());
      return res.status(401).json({
        stage: "auth_refresh",
        error: "invalid_refresh_token",
      });
    }
    return res.status(200).json(buildAuthEnvelope({
      user,
      accessToken: signAccessToken(user, rotated.session),
      refreshToken: rotated.refreshToken,
      session: rotated.session,
    }));
  }

  function handleAuthLogout(req, res) {
    if (!authConfigured) return authMisconfigured(res, "auth_logout");
    const now = Date.now();
    const refreshToken = String(req.body?.refresh_token || req.body?.refreshToken || req.get("X-Refresh-Token") || "").trim();
    let revokedRefresh = null;
    let revokedAccess = null;

    if (refreshToken) {
      revokedRefresh = revokeAuthSessionByToken(refreshToken, now);
      if (!revokedRefresh && !req.authSession) {
        return res.status(401).json({
          stage: "auth_logout",
          error: "invalid_refresh_token",
        });
      }
    }

    if (req.authSession && (!revokedRefresh || req.authSession.sessionId !== revokedRefresh.sessionId)) {
      revokedAccess = revokeAuthSessionById(req.authSession.sessionId, now);
    }

    return res.status(200).json(buildAuthEnvelope({
      extra: {
        logged_out: true,
        revoked_access_token: Boolean(revokedAccess),
        revoked_refresh_token: Boolean(revokedRefresh),
        refresh_cookie_cleared: false,
        current_session_id: String(req.authSession?.sessionId || revokedRefresh?.sessionId || revokedAccess?.sessionId || "").trim() || null,
        current_family_id: String(req.authSession?.familyId || revokedRefresh?.familyId || revokedAccess?.familyId || "").trim() || null,
      },
    }));
  }

  function handleAuthSessions(req, res) {
    const user = requireAuthenticatedUser(req, res, "auth_sessions");
    if (!user) return;
    const now = Date.now();
    const sessions = listAuthSessionsForUser(user.id, now).map((session) => buildManagedSession(session, user, now));
    return res.status(200).json({
      ok: true,
      sessions,
    });
  }

  function handleAuthSessionsRevoke(req, res) {
    const user = requireAuthenticatedUser(req, res, "auth_sessions_revoke");
    if (!user) return;
    const now = Date.now();
    const sessionId = String(req.body?.session_id || req.body?.sessionId || "").trim();
    const revokeOthers = Boolean(req.body?.all_other_sessions || req.body?.revoke_other_sessions || req.body?.revokeOthers || String(req.body?.scope || "").trim().toLowerCase() === "others");

    if (sessionId) {
      const existing = getAuthSessionById(sessionId, now, {
        includeExpired: true,
        includeRevoked: true,
      });
      if (!existing || String(existing.userId || "").trim() !== String(user.id || "").trim()) {
        return res.status(404).json({
          stage: "auth_sessions_revoke",
          error: "session_not_found",
        });
      }
      const revoked = revokeAuthSessionById(sessionId, now);
      return res.status(200).json({
        ok: true,
        revoked: Boolean(revoked),
        session: buildManagedSession(getAuthSessionById(sessionId, now, {
          includeExpired: true,
          includeRevoked: true,
        }), user, now),
        family_id: String(existing.familyId || "").trim() || null,
        user_id: String(user.id || "").trim() || null,
      });
    }

    if (revokeOthers) {
      const revoked = revokeAllAuthSessionsForUser(user.id, now, {
        exceptSessionId: String(req.authSession?.sessionId || "").trim(),
      });
      return res.status(200).json({
        ok: true,
        revoked: revoked.length > 0,
        count: revoked.length,
        family_id: String(req.authSession?.familyId || "").trim() || null,
        user_id: String(user.id || "").trim() || null,
      });
    }

    return res.status(400).json({
      stage: "auth_sessions_revoke",
      error: "session_id_required",
    });
  }

  function handleAuthRequestPasswordReset(req, res) {
    if (!authConfigured) return authMisconfigured(res, "auth_request_password_reset");
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({
        stage: "auth_request_password_reset",
        error: "email_required",
      });
    }
    const user = getUserByEmail(email);
    if (!user) {
      return res.status(200).json(buildAuthEnvelope({
        extra: {
          password_reset_requested: true,
          email_delivery: buildEmailDelivery("noop", "none"),
        },
      }));
    }
    const issued = issuePasswordResetToken({
      userId: user.id,
      ttlMs: passwordResetTtlSeconds * 1000,
    }, Date.now());
    const extra = {
      password_reset_requested: Boolean(issued),
      email_delivery: buildEmailDelivery(
        allowDebugTokens && issued ? "token_in_response" : "queued",
        allowDebugTokens && issued ? "inline_debug" : "none"
      ),
    };
    if (allowDebugTokens && issued) {
      extra.debug_password_reset_token = issued.token;
    }
    return res.status(200).json(buildAuthEnvelope({
      user,
      extra,
    }));
  }

  function handleAuthResetPassword(req, res) {
    if (!authConfigured) return authMisconfigured(res, "auth_reset_password");
    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.new_password || req.body?.newPassword || "");
    if (!token) {
      return res.status(400).json({
        stage: "auth_reset_password",
        error: "token_required",
      });
    }
    const consumed = consumePasswordResetToken(token, Date.now());
    if (!consumed) {
      return res.status(400).json({
        stage: "auth_reset_password",
        error: "invalid_reset_token",
      });
    }
    const updated = updateUserPassword(consumed.userId, newPassword, Date.now());
    if (!updated.ok) {
      return res.status(updated.status === "not_found" ? 404 : 400).json({
        stage: "auth_reset_password",
        error: updated.status || "password_reset_failed",
      });
    }
    revokeAllAuthSessionsForUser(updated.user.id, Date.now());
    return res.status(200).json(buildAuthEnvelope({
      user: updated.user,
      extra: {
        password_reset: true,
      },
    }));
  }

  function handleAuthRequestEmailVerification(req, res) {
    if (!authConfigured) return authMisconfigured(res, "auth_request_email_verification");
    const authenticatedUser = req.authUser || null;
    const email = normalizeEmail(req.body?.email);
    const user = authenticatedUser || (email ? getUserByEmail(email) : null);
    if (!user) {
      return res.status(200).json(buildAuthEnvelope({
        extra: {
          email_verification_requested: true,
          email_delivery: buildEmailDelivery("noop", "none"),
        },
      }));
    }
    if (user.emailVerified) {
      return res.status(200).json(buildAuthEnvelope({
        user,
        session: req.authSession && String(req.authSession.userId || "").trim() === String(user.id || "").trim()
          ? req.authSession
          : null,
        extra: {
          already_verified: true,
          email_verified: true,
          email_delivery: buildEmailDelivery("already_verified", "none"),
        },
      }));
    }
    const issued = issueEmailVerificationToken({
      userId: user.id,
      ttlMs: emailVerificationTtlSeconds * 1000,
    }, Date.now());
    const extra = {
      email_verification_requested: Boolean(issued),
      email_delivery: buildEmailDelivery(
        allowDebugTokens && issued ? "token_in_response" : "queued",
        allowDebugTokens && issued ? "inline_debug" : "none"
      ),
    };
    if (allowDebugTokens && issued) {
      extra.debug_email_verification_token = issued.token;
    }
    return res.status(200).json(buildAuthEnvelope({
      user,
      session: req.authSession && String(req.authSession.userId || "").trim() === String(user.id || "").trim()
        ? req.authSession
        : null,
      extra,
    }));
  }

  function handleAuthVerifyEmail(req, res) {
    if (!authConfigured) return authMisconfigured(res, "auth_verify_email");
    const token = String(req.body?.token || "").trim();
    if (!token) {
      return res.status(400).json({
        stage: "auth_verify_email",
        error: "token_required",
      });
    }
    const consumed = consumeEmailVerificationToken(token, Date.now());
    if (!consumed) {
      return res.status(400).json({
        stage: "auth_verify_email",
        error: "invalid_verification_token",
      });
    }
    const user = markUserEmailVerified(consumed.userId, Date.now());
    if (!user) {
      return res.status(404).json({
        stage: "auth_verify_email",
        error: "account_not_found",
      });
    }
    return res.status(200).json(buildAuthEnvelope({
      user,
      session: req.authSession && String(req.authSession.userId || "").trim() === String(user.id || "").trim()
        ? req.authSession
        : null,
      extra: {
        email_verified: true,
        already_verified: false,
      },
    }));
  }

  return {
    attachUserAuth,
    buildPublicUser,
    handleAuthApple,
    handleAuthLogin,
    handleAuthLogout,
    handleAuthRefresh,
    handleAuthRequestEmailVerification,
    handleAuthRequestPasswordReset,
    handleAuthResetPassword,
    handleAuthSessions,
    handleAuthSessionsRevoke,
    handleAuthSignup,
    handleAuthVerifyEmail,
    protectUserRoutes,
  };
}

export {
  buildPublicUser,
  buildManagedSession,
  createUserAuthSubsystem,
};

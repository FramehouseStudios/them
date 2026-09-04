import jwt from "jsonwebtoken";
import { createHash, createPublicKey } from "node:crypto";

import {
  authenticateUser,
  completePasswordResetDurably,
  consumeEmailVerificationToken,
  createOrAttachAppleUser,
  createUser,
  createUserStoreCheckpoint,
  ensureUserStoreCanonicalReconciled,
  flushUserStorePersistenceWrites,
  getAuthSessionById,
  getAuthSessionByToken,
  getUserByAppleSubject,
  getUserByEmail,
  getUserById,
  issueAuthSession,
  issueAuthSessionDurably,
  issueEmailVerificationToken,
  issuePasswordResetTokenDurably,
  listAuthSessionsForUser,
  markUserEmailVerified,
  revokeAllAuthSessionsForUserDurablyInMutation,
  revokeAuthSessionById,
  revokeAuthSessionsDurably,
  restoreUserStoreCheckpoint,
  rotateAuthSessionDurably,
  runUserStoreMutationExclusive,
  validateUserPassword,
  waitForUserStoreMutations,
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
  /^\/telemetry\/first-page-written(?:\/|$)/,
  /^\/visual\/context(?:\/|$)/,
];

// Day 1 Backend Exposure Lock: cost-attached or identity-sensitive realtime
// + visual endpoints must require authenticated identity *regardless* of the global
// REQUIRE_USER_AUTH flag. /realtime/health and /realtime/bridge are
// intentionally excluded — they are unauth health/proxy surfaces.
const PAID_PROVIDER_PATTERNS = [
  /^\/craft\/logline\/distill(?:\/|$)/,
  /^\/realtime\/client_secret(?:\/|$)/,
  /^\/realtime\/project_grounding(?:\/|$)/,
  /^\/realtime\/turn_commit(?:\/|$)/,
  /^\/realtime\/call(?:\/|$)/,
  /^\/realtime\/studio_render(?:\/|$)/,
  /^\/realtime\/studio_render_stream(?:\/|$)/,
  /^\/visual\/context(?:\/|$)/,
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

function sha256Base64Url(value) {
  return createHash("sha256")
    .update(String(value || ""), "utf8")
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
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
  const appleJwksUrl = sanitizeText(options.appleJwksUrl || "https://appleid.apple.com/auth/keys", 240);
  const appleJwks = options.appleJwks && typeof options.appleJwks === "object" ? options.appleJwks : null;
  const fetchAppleJwks = typeof options.fetchAppleJwks === "function" ? options.fetchAppleJwks : null;
  const appleJwksCacheTtlMs = Math.max(60_000, Number(options.appleJwksCacheTtlMs || 6 * 60 * 60 * 1000));
  const appleJwksTimeoutMs = Math.max(25, Number(options.appleJwksTimeoutMs || 5_000));
  const signingSecret = String(options.jwtSecret || "").trim() || (nodeEnv === "production" ? "" : "them-dev-user-jwt-secret");
  const authConfigured = Boolean(signingSecret);
  const allowDebugTokens = new Set(["test", "development", "local"]).has(String(nodeEnv || "").trim().toLowerCase());
  const allowAppleTestJwtSecret = nodeEnv !== "production" && Boolean(appleTestJwtSecret);
  const allowStaticApplePublicKey = nodeEnv !== "production" && Boolean(appleJwtPublicKey);
  let appleJwksCache = { fetchedAt: 0, keys: [] };

  function authMisconfigured(res, stage = "auth_user") {
    return res.status(503).json({ stage, error: "user_auth_not_configured" });
  }

  async function persistAuthMutationOrRestore(checkpoint) {
    try {
      const result = await flushUserStorePersistenceWrites();
      if (result?.ok === true) return { ok: true, retryable: true };
    } catch {
      // The compensating path below restores the pre-mutation checkpoint.
    }
    let retryable = false;
    try {
      restoreUserStoreCheckpoint(checkpoint, Date.now());
      const rollbackResult = await flushUserStorePersistenceWrites();
      retryable = rollbackResult?.ok === true;
    } catch {
      // The checkpoint has already restored the live maps before its
      // compensating durability attempt. Do not promise a safe retry unless
      // that compensation also reached durable storage.
    }
    return { ok: false, retryable };
  }

  async function ensureAuthMutationPersisted(res, stage, checkpoint) {
    const persistenceResult = await persistAuthMutationOrRestore(checkpoint);
    if (persistenceResult.ok) return true;
    if (!res.headersSent) {
      res.status(503).json({
        stage,
        error: "auth_persistence_failed",
        retryable: persistenceResult.retryable,
      });
    }
    return false;
  }

  function serializeAuthMutation(handler) {
    return (req, res, next) => runUserStoreMutationExclusive(async () => {
      if (!(await ensureUserStoreCanonicalReconciled())) {
        return res.status(503).json({
          stage: "auth_user",
          error: "auth_persistence_failed",
          retryable: true,
        });
      }
      const checkpoint = createUserStoreCheckpoint(Date.now());
      return handler(req, res, checkpoint, next);
    });
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

  function respondToPasswordResetRequest(res, debugResetToken = "") {
    const safeDebugToken = allowDebugTokens ? String(debugResetToken || "").trim() : "";
    const extra = {
      password_reset_requested: true,
      email_delivery: buildEmailDelivery(
        safeDebugToken ? "token_in_response" : "queued",
        safeDebugToken ? "inline_debug" : "none",
      ),
    };
    if (safeDebugToken) extra.debug_password_reset_token = safeDebugToken;
    return res.status(200).json(buildAuthEnvelope({ extra }));
  }

  function serializePasswordResetRequest(handler) {
    return (req, res, next) => runUserStoreMutationExclusive(async () => {
      // A reconciliation outage applies to every supplied address. Keep the
      // reset-request contract generic instead of exposing whether an account
      // would have existed after canonical hydration.
      if (!(await ensureUserStoreCanonicalReconciled())) {
        return respondToPasswordResetRequest(res);
      }
      const checkpoint = createUserStoreCheckpoint(Date.now());
      return handler(req, res, checkpoint, next);
    });
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
    // Day 1 Backend Exposure Lock: strip any inbound X-User-Id header
    // *before* identity is attached. Client-supplied identity must never
    // reach downstream code — ownership must derive from req.authUser.id
    // / req.userId only. Without this strip, a client could send
    // `X-User-Id: <victim>` and have any code that fell back to the
    // header attribute the request to another user.
    if (req && req.headers) {
      delete req.headers["x-user-id"];
      delete req.headers["X-User-Id"];
      delete req.headers["X-USER-ID"];
    }
    const token = extractAccessToken(req);
    if (!token) {
      req.authUser = null;
      req.authSession = null;
      req.authUserError = "";
      return next();
    }
    return waitForUserStoreMutations()
      .then(() => {
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
        // Day 1 Backend Exposure Lock: do not rewrite req.headers["x-user-id"]
        // with the auth-derived id. Downstream ownership must read req.authUser.id
        // / req.userId, never a header.
        return next();
      })
      .catch(next);
  }

  function isProtectedRoute(pathname) {
    const path = String(pathname || "").trim();
    return USER_PROTECTED_PATTERNS.some((pattern) => pattern.test(path));
  }

  function isPaidProviderRoute(pathname) {
    const path = String(pathname || "").trim();
    return PAID_PROVIDER_PATTERNS.some((pattern) => pattern.test(path));
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

  // Day 1 Backend Exposure Lock: gate cost-attached realtime + visual
  // endpoints behind authenticated identity unconditionally. Independent
  // of the global REQUIRE_USER_AUTH flag — these routes touch paid
  // provider access and user data, so they must never be reachable by
  // unauthenticated clients.
  function protectPaidProviderRoutes(req, res, next) {
    if (!isPaidProviderRoute(req.path)) return next();
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

  async function issueEmailLoginAuthResult(user, req) {
    const result = await issueAuthSessionDurably({
      userId: String(user?.id || "").trim(),
      ttlMs: refreshTtlSeconds * 1000,
      metadata: readRequestDevice(req),
    }, Date.now());
    const issued = result?.issuance || null;
    if (!issued?.session || !issued?.refreshToken) {
      return { ...result, authResult: null };
    }
    return {
      ...result,
      authResult: {
        accessToken: signAccessToken(user, issued.session),
        refreshToken: issued.refreshToken,
        session: issued.session,
      },
    };
  }

  async function verifyReauthProof(req, user) {
    const normalizedUserId = String(user?.id || "").trim();
    if (!normalizedUserId) return false;
    const password = String(
      req?.body?.password ?? req?.body?.current_password ?? req?.body?.currentPassword ?? ""
    );
    if (password) {
      const authenticated = authenticateUser(normalizeEmail(user?.email), password);
      return Boolean(authenticated?.ok && String(authenticated?.user?.id || "").trim() === normalizedUserId);
    }
    const identityToken = String(
      req?.body?.identity_token ?? req?.body?.apple_identity_token ?? req?.body?.appleIdentityToken ?? ""
    ).trim();
    const appleSubject = String(user?.appleSubject || "").trim();
    if (identityToken && appleSubject) {
      const verified = await verifyAppleIdentityToken(identityToken, req?.body || {});
      return Boolean(verified?.ok && String(verified.subject || "").trim() === appleSubject);
    }
    return false;
  }

  function normalizeAppleJwksPayload(payload) {
    const keys = Array.isArray(payload?.keys) ? payload.keys : [];
    return keys
      .filter((key) => key && typeof key === "object")
      .filter((key) => String(key.kid || "").trim() && String(key.kty || "").trim().toUpperCase() === "RSA");
  }

  async function fetchAppleJwksDefault(url) {
    if (typeof fetch !== "function") {
      throw new Error("fetch_unavailable");
    }
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response || !response.ok) {
      throw new Error(`apple_jwks_http_${response?.status || "unknown"}`);
    }
    return await response.json();
  }

  async function loadAppleJwks() {
    if (appleJwks) {
      return normalizeAppleJwksPayload(appleJwks);
    }
    const now = Date.now();
    if (appleJwksCache.keys.length && (now - appleJwksCache.fetchedAt) < appleJwksCacheTtlMs) {
      return appleJwksCache.keys;
    }
    let timeoutId;
    let payload;
    try {
      payload = await Promise.race([
        Promise.resolve().then(() => fetchAppleJwks
          ? fetchAppleJwks(appleJwksUrl)
          : fetchAppleJwksDefault(appleJwksUrl)),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("apple_jwks_timeout")), appleJwksTimeoutMs);
        }),
      ]);
    } catch (error) {
      const unavailable = new Error("apple_jwks_unavailable");
      unavailable.cause = error;
      throw unavailable;
    } finally {
      clearTimeout(timeoutId);
    }
    const keys = normalizeAppleJwksPayload(payload);
    appleJwksCache = { fetchedAt: now, keys };
    return keys;
  }

  function applePublicKeyFromJwk(jwk) {
    return createPublicKey({ key: jwk, format: "jwk" });
  }

  function expectedAppleNonceCandidates(body = {}) {
    const direct = sanitizeText(
      body.nonce ?? body.expected_nonce ?? body.expectedNonce ?? "",
      256
    );
    const hash = sanitizeText(
      body.nonce_sha256 ?? body.nonceHash ?? body.nonce_hash ?? "",
      256
    );
    const raw = sanitizeText(
      body.raw_nonce ?? body.rawNonce ?? "",
      256
    );
    const candidates = new Set();
    if (direct) {
      candidates.add(direct);
      candidates.add(sha256Base64Url(direct));
    }
    if (hash) candidates.add(hash);
    if (raw) candidates.add(sha256Base64Url(raw));
    return [...candidates].filter(Boolean);
  }

  function verifyAppleNonce(payload, candidates) {
    const payloadNonce = sanitizeText(payload?.nonce || "", 256);
    if (candidates.length > 0) {
      return Boolean(payloadNonce && candidates.includes(payloadNonce));
    }
    if (nodeEnv === "production") {
      return false;
    }
    return true;
  }

  async function verifyAppleIdentityToken(identityToken, body = {}) {
    const token = String(identityToken || "").trim();
    if (!token) {
      return { ok: false, status: 400, error: "identity_token_required" };
    }
    // Main production startup rejects a missing audience in config.js. Keep
    // the verifier independently fail-closed as well so tests, workers, or a
    // future alternate entry point cannot accidentally verify an Apple token
    // without binding it to this app's Services ID / bundle identifier.
    if (nodeEnv === "production" && !appleAudience) {
      return { ok: false, status: 503, error: "apple_sign_in_not_configured" };
    }
    if (!allowAppleTestJwtSecret && !allowStaticApplePublicKey && nodeEnv !== "production" && !fetchAppleJwks && !appleJwks) {
      return { ok: false, status: 503, error: "apple_sign_in_not_configured" };
    }
    const verifyOptions = {
      issuer: "https://appleid.apple.com",
    };
    if (appleAudience) {
      verifyOptions.audience = appleAudience;
    }
    try {
      const nonceCandidates = expectedAppleNonceCandidates(body);
      const decoded = jwt.decode(token, { complete: true });
      const header = decoded && typeof decoded === "object" ? decoded.header : null;
      const alg = String(header?.alg || "").trim();
      const kid = String(header?.kid || "").trim();
      let payload = null;
      if (allowAppleTestJwtSecret) {
        payload = jwt.verify(token, appleTestJwtSecret, { ...verifyOptions, algorithms: ["HS256"] });
      } else if (allowStaticApplePublicKey) {
        payload = jwt.verify(token, appleJwtPublicKey, { ...verifyOptions, algorithms: ["RS256"] });
      } else {
        if (alg !== "RS256" || !kid) {
          return { ok: false, status: 401, error: "invalid_apple_identity_token" };
        }
        const keys = await loadAppleJwks();
        const jwk = keys.find((key) => {
          const keyKid = String(key?.kid || "").trim();
          const keyAlg = String(key?.alg || "RS256").trim();
          return keyKid === kid && (!keyAlg || keyAlg === "RS256");
        });
        if (!jwk) {
          return { ok: false, status: 401, error: "invalid_apple_identity_token" };
        }
        payload = jwt.verify(token, applePublicKeyFromJwk(jwk), { ...verifyOptions, algorithms: ["RS256"] });
      }
      const subject = String(payload?.sub || "").trim();
      if (!subject) {
        return { ok: false, status: 401, error: "invalid_apple_identity_token" };
      }
      if (!verifyAppleNonce(payload, nonceCandidates)) {
        return {
          ok: false,
          status: nonceCandidates.length ? 401 : 400,
          error: nonceCandidates.length ? "invalid_apple_nonce" : "apple_nonce_required",
        };
      }
      return {
        ok: true,
        subject,
        email: normalizeEmail(payload?.email),
        emailVerified: normalizeBoolean(payload?.email_verified, false),
      };
    } catch (error) {
      if (String(error?.message || "") === "apple_jwks_unavailable") {
        return { ok: false, status: 503, error: "apple_jwks_unavailable" };
      }
      return { ok: false, status: 401, error: "invalid_apple_identity_token" };
    }
  }

  async function handleAuthSignup(req, res, checkpoint) {
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
      if (!(await ensureAuthMutationPersisted(res, "auth_signup", checkpoint))) return;
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
    if (!(await ensureAuthMutationPersisted(res, "auth_signup", checkpoint))) return;
    return res.status(201).json(buildAuthEnvelope({
      user: created.user,
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      session: issued.session,
      extra,
    }));
  }

  async function handleAuthLogin(req, res, checkpoint) {
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
    const issuance = await issueEmailLoginAuthResult(authenticated.user, req);
    if (issuance.status === "auth_persistence_failed") {
      return res.status(503).json({
        stage: "auth_login",
        error: "auth_persistence_failed",
        retryable: issuance.retryable === true,
      });
    }
    const issued = issuance.authResult;
    if (!issued) {
      return res.status(500).json({
        stage: "auth_login",
        error: "session_issue_failed",
      });
    }
    if (
      issuance.status === "snapshot_pending"
      && !(await ensureAuthMutationPersisted(res, "auth_login", checkpoint))
    ) return;
    return res.status(200).json(buildAuthEnvelope({
      user: authenticated.user,
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      session: issued.session,
    }));
  }

  async function handleAuthAppleMutation(req, res, checkpoint, verified) {
    const existingBySubject = getUserByAppleSubject(verified.subject);
    const trustedEmail = verified.emailVerified ? normalizeEmail(verified.email) : "";
    if (!existingBySubject && !trustedEmail) {
      return res.status(400).json({
        stage: "auth_apple",
        error: "apple_email_required",
      });
    }
    const existing = existingBySubject || getUserByEmail(trustedEmail);
    const createdOrAttached = createOrAttachAppleUser({
      appleSubject: verified.subject,
      email: trustedEmail,
      name: [sanitizeText(req.body?.given_name || "", 80), sanitizeText(req.body?.family_name || "", 80)].filter(Boolean).join(" "),
      emailVerified: Boolean(trustedEmail),
      allowExistingEmailLink: !existingBySubject && Boolean(trustedEmail),
    }, Date.now());
    if (!createdOrAttached.ok) {
      const statusCode = createdOrAttached.status === "email_taken"
        || createdOrAttached.status === "apple_subject_taken"
        ? 409
        : 400;
      return res.status(statusCode).json({
        stage: "auth_apple",
        error: createdOrAttached.status || "apple_sign_in_failed",
      });
    }
    const issued = issueAuthResult(createdOrAttached.user, req);
    if (!issued) {
      if (!(await ensureAuthMutationPersisted(res, "auth_apple", checkpoint))) return;
      return res.status(500).json({
        stage: "auth_apple",
        error: "session_issue_failed",
      });
    }
    if (!(await ensureAuthMutationPersisted(res, "auth_apple", checkpoint))) return;
    return res.status(existing ? 200 : 201).json(buildAuthEnvelope({
      user: createdOrAttached.user,
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      session: issued.session,
    }));
  }

  async function handleAuthApple(req, res) {
    if (!authConfigured) return authMisconfigured(res, "auth_apple");
    // Apple key discovery is remote I/O. Verify before taking the mutation
    // lock so a slow identity provider cannot stall local login, refresh, or
    // bearer authentication for every user.
    const verified = await verifyAppleIdentityToken(req.body?.identity_token, req.body || {});
    if (!verified.ok) {
      return res.status(verified.status || 401).json({
        stage: "auth_apple",
        error: verified.error || "invalid_apple_identity_token",
      });
    }
    return runUserStoreMutationExclusive(async () => {
      if (!(await ensureUserStoreCanonicalReconciled())) {
        return res.status(503).json({
          stage: "auth_apple",
          error: "auth_persistence_failed",
          retryable: true,
        });
      }
      const checkpoint = createUserStoreCheckpoint(Date.now());
      return handleAuthAppleMutation(req, res, checkpoint, verified);
    });
  }

  async function handleAuthRefresh(req, res, checkpoint) {
    if (!authConfigured) return authMisconfigured(res, "auth_refresh");
    const refreshToken = String(req.body?.refresh_token || req.body?.refreshToken || req.get("X-Refresh-Token") || "").trim();
    if (!refreshToken) {
      return res.status(401).json({
        stage: "auth_refresh",
        error: "refresh_token_required",
      });
    }
    const rotationResult = await rotateAuthSessionDurably(refreshToken, {
      ttlMs: refreshTtlSeconds * 1000,
      metadata: readRequestDevice(req),
    }, Date.now());
    if (rotationResult.status === "auth_persistence_failed") {
      return res.status(503).json({
        stage: "auth_refresh",
        error: "auth_persistence_failed",
        retryable: rotationResult.retryable === true,
      });
    }
    const rotated = rotationResult.rotation;
    if (!rotated) {
      return res.status(401).json({
        stage: "auth_refresh",
        error: "invalid_refresh_token",
      });
    }
    const user = getUserById(rotated.session.userId);
    if (!user) {
      revokeAuthSessionById(rotated.session.sessionId, Date.now());
      if (!(await ensureAuthMutationPersisted(res, "auth_refresh", checkpoint))) return;
      return res.status(401).json({
        stage: "auth_refresh",
        error: "invalid_refresh_token",
      });
    }
    if (rotationResult.status !== "committed"
      && !(await ensureAuthMutationPersisted(res, "auth_refresh", checkpoint))) return;
    return res.status(200).json(buildAuthEnvelope({
      user,
      accessToken: signAccessToken(user, rotated.session),
      refreshToken: rotated.refreshToken,
      session: rotated.session,
    }));
  }

  async function handleAuthLogout(req, res, checkpoint) {
    if (!authConfigured) return authMisconfigured(res, "auth_logout");
    const now = Date.now();
    const refreshToken = String(req.body?.refresh_token || req.body?.refreshToken || req.get("X-Refresh-Token") || "").trim();
    let refreshSession = null;

    if (refreshToken) {
      refreshSession = getAuthSessionByToken(refreshToken, now, {
        includeRevoked: true,
        includeExpired: true,
      });
      if (!refreshSession && !req.authSession) {
        return res.status(401).json({
          stage: "auth_logout",
          error: "invalid_refresh_token",
        });
      }
    }

    if (
      refreshSession
      && req.authSession
      && String(refreshSession.userId || "").trim() !== String(req.authSession.userId || "").trim()
    ) {
      return res.status(401).json({
        stage: "auth_logout",
        error: "invalid_refresh_token",
      });
    }

    const sessionIds = [refreshSession?.sessionId, req.authSession?.sessionId].filter(Boolean);
    let revocationResult = { status: "no_sessions", revoked: [] };
    if (sessionIds.length > 0) {
      revocationResult = await revokeAuthSessionsDurably(sessionIds, now);
      if (revocationResult.status === "auth_persistence_failed") {
        return res.status(503).json({
          stage: "auth_logout",
          error: "auth_persistence_failed",
          retryable: revocationResult.retryable === true,
        });
      }
      if (revocationResult.status === "conflict" || revocationResult.status === "not_found") {
        return res.status(401).json({
          stage: "auth_logout",
          error: "invalid_refresh_token",
        });
      }
      if (revocationResult.status !== "committed"
        && !(await ensureAuthMutationPersisted(res, "auth_logout", checkpoint))) return;
    }
    const revokedRefresh = revocationResult.revoked.find(
      (session) => session.sessionId === refreshSession?.sessionId,
    ) || null;
    const revokedAccess = req.authSession?.sessionId !== refreshSession?.sessionId
      ? revocationResult.revoked.find(
        (session) => session.sessionId === req.authSession?.sessionId,
      ) || null
      : null;

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

  async function handleAuthSessionsRevoke(req, res, checkpoint) {
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
      const revocationResult = await revokeAuthSessionsDurably([sessionId], now);
      if (revocationResult.status === "auth_persistence_failed") {
        return res.status(503).json({
          stage: "auth_sessions_revoke",
          error: "auth_persistence_failed",
          retryable: revocationResult.retryable === true,
        });
      }
      if (revocationResult.status === "conflict" || revocationResult.status === "not_found") {
        return res.status(404).json({
          stage: "auth_sessions_revoke",
          error: "session_not_found",
        });
      }
      if (revocationResult.status !== "committed"
        && !(await ensureAuthMutationPersisted(res, "auth_sessions_revoke", checkpoint))) return;
      const revoked = revocationResult.revoked.find((session) => session.sessionId === sessionId) || null;
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
      const revocationResult = await revokeAllAuthSessionsForUserDurablyInMutation(user.id, now, {
        exceptSessionId: String(req.authSession?.sessionId || "").trim(),
      });
      if (!revocationResult.ok) {
        return res.status(503).json({
          stage: "auth_sessions_revoke",
          error: "auth_persistence_failed",
          retryable: revocationResult.retryable === true,
        });
      }
      if (revocationResult.status !== "committed"
        && revocationResult.revokedCount > 0
        && !(await ensureAuthMutationPersisted(res, "auth_sessions_revoke", checkpoint))) return;
      return res.status(200).json({
        ok: true,
        revoked: revocationResult.revokedCount > 0,
        count: revocationResult.revokedCount,
        family_id: String(req.authSession?.familyId || "").trim() || null,
        user_id: String(user.id || "").trim() || null,
      });
    }

    return res.status(400).json({
      stage: "auth_sessions_revoke",
      error: "session_id_required",
    });
  }

  async function handleAuthRequestPasswordReset(req, res, checkpoint) {
    if (!authConfigured) return authMisconfigured(res, "auth_request_password_reset");
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({
        stage: "auth_request_password_reset",
        error: "email_required",
      });
    }
    const user = getUserByEmail(email);
    const issuanceResult = await issuePasswordResetTokenDurably(user
      ? {
        userId: user.id,
        ttlMs: passwordResetTtlSeconds * 1000,
      }
      : {
        privacyCoverKey: email,
        ttlMs: passwordResetTtlSeconds * 1000,
      }, Date.now());
    let issued = issuanceResult?.issuance || null;
    if (
      issuanceResult?.status === "snapshot_pending"
      && !(await persistAuthMutationOrRestore(checkpoint)).ok
    ) issued = null;

    // Persistence failures, collisions, and uncertain commits intentionally
    // collapse into the same accepted response as an unknown address. A raw
    // token is exposed only in local/test mode after confirmed durability.
    return respondToPasswordResetRequest(res, issued?.token);
  }

  async function handleAuthResetPassword(req, res, checkpoint) {
    if (!authConfigured) return authMisconfigured(res, "auth_reset_password");
    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.new_password || req.body?.newPassword || "");
    if (!token) {
      return res.status(400).json({
        stage: "auth_reset_password",
        error: "token_required",
      });
    }
    const passwordValidation = validateUserPassword(newPassword);
    if (!passwordValidation.ok) {
      return res.status(400).json({
        stage: "auth_reset_password",
        error: passwordValidation.status,
      });
    }
    const completed = await completePasswordResetDurably(token, newPassword, Date.now());
    if (completed.status === "auth_persistence_failed") {
      return res.status(503).json({
        stage: "auth_reset_password",
        error: "auth_persistence_failed",
        retryable: completed.retryable === true,
      });
    }
    if (completed.status === "invalid_reset_token") {
      if (!(await ensureAuthMutationPersisted(res, "auth_reset_password", checkpoint))) return;
      return res.status(400).json({
        stage: "auth_reset_password",
        error: "invalid_reset_token",
      });
    }
    if (!completed.user) {
      if (!(await ensureAuthMutationPersisted(res, "auth_reset_password", checkpoint))) return;
      return res.status(completed.status === "not_found" ? 404 : 400).json({
        stage: "auth_reset_password",
        error: completed.status || "password_reset_failed",
      });
    }
    if (
      completed.status === "snapshot_pending"
      && !(await ensureAuthMutationPersisted(res, "auth_reset_password", checkpoint))
    ) return;
    return res.status(200).json(buildAuthEnvelope({
      user: completed.user,
      extra: {
        password_reset: true,
        revoked_sessions: completed.revoked.length,
      },
    }));
  }

  async function handleAuthRequestEmailVerification(req, res, checkpoint) {
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
    if (issued && !(await ensureAuthMutationPersisted(res, "auth_request_email_verification", checkpoint))) return;
    return res.status(200).json(buildAuthEnvelope({
      user,
      session: req.authSession && String(req.authSession.userId || "").trim() === String(user.id || "").trim()
        ? req.authSession
        : null,
      extra,
    }));
  }

  async function handleAuthVerifyEmail(req, res, checkpoint) {
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
      if (!(await ensureAuthMutationPersisted(res, "auth_verify_email", checkpoint))) return;
      return res.status(400).json({
        stage: "auth_verify_email",
        error: "invalid_verification_token",
      });
    }
    const user = markUserEmailVerified(consumed.userId, Date.now());
    if (!user) {
      if (!(await ensureAuthMutationPersisted(res, "auth_verify_email", checkpoint))) return;
      return res.status(404).json({
        stage: "auth_verify_email",
        error: "account_not_found",
      });
    }
    if (!(await ensureAuthMutationPersisted(res, "auth_verify_email", checkpoint))) return;
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
    handleAuthLogin: serializeAuthMutation(handleAuthLogin),
    handleAuthLogout: serializeAuthMutation(handleAuthLogout),
    handleAuthRefresh: serializeAuthMutation(handleAuthRefresh),
    handleAuthRequestEmailVerification: serializeAuthMutation(handleAuthRequestEmailVerification),
    handleAuthRequestPasswordReset: serializePasswordResetRequest(handleAuthRequestPasswordReset),
    handleAuthResetPassword: serializeAuthMutation(handleAuthResetPassword),
    handleAuthSessions,
    handleAuthSessionsRevoke: serializeAuthMutation(handleAuthSessionsRevoke),
    handleAuthSignup: serializeAuthMutation(handleAuthSignup),
    handleAuthVerifyEmail: serializeAuthMutation(handleAuthVerifyEmail),
    protectPaidProviderRoutes,
    protectUserRoutes,
    requireAuthenticatedUser,
    verifyReauthProof,
  };
}

export {
  buildPublicUser,
  buildManagedSession,
  createUserAuthSubsystem,
};

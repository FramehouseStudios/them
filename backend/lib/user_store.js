import { createHash, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

let configuredDeps = null;

const PASSWORD_MIN_LENGTH = 8;

const usersById = new Map();
const usersByEmail = new Map();
const usersByAppleSubject = new Map();
const authSessionsById = new Map();
const authSessionIdByTokenHash = new Map();
const passwordResetTokensByHash = new Map();
const emailVerificationTokensByHash = new Map();

function configureUserStore(deps = {}) {
  configuredDeps = deps;
}

function userStoreDeps() {
  if (!configuredDeps) {
    throw new Error("user_store not configured");
  }
  return configuredDeps;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUserId(value) {
  return String(value || "").trim();
}

function normalizeBoolean(value, fallback = false) {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function hashPassword(password, salt, iterations = 120000) {
  const digest = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  return digest.toString("hex");
}

function createPasswordRecord(password) {
  const salt = randomBytes(16).toString("hex");
  const iterations = 120000;
  const hash = hashPassword(password, salt, iterations);
  return { salt, iterations, hash };
}

function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false;
  const iterations = Math.max(1, Number(record.iterations || 120000));
  const hashed = hashPassword(password, record.salt, iterations);
  const left = Buffer.from(hashed, "hex");
  const right = Buffer.from(String(record.hash || ""), "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

function hashOpaqueToken(token) {
  return createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

function buildOpaqueToken() {
  return toBase64Url(randomBytes(36));
}

function sanitizeSnippetLocal(value, maxLength = 160) {
  const deps = configuredDeps;
  if (deps && typeof deps.normalizeSnippet === "function") {
    return deps.normalizeSnippet(value, maxLength);
  }
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, Math.max(1, Number(maxLength || 160)));
}

function sanitizeSessionMetadata(metadata = {}) {
  const source = metadata && typeof metadata === "object" ? metadata : {};
  const next = {
    label: sanitizeSnippetLocal(source.label || source.deviceLabel || "", 96),
    clientName: sanitizeSnippetLocal(source.clientName || "", 48),
    clientPlatform: sanitizeSnippetLocal(source.clientPlatform || "", 48),
    clientVersion: sanitizeSnippetLocal(source.clientVersion || "", 48),
    clientBuild: sanitizeSnippetLocal(source.clientBuild || "", 48),
    userAgent: sanitizeSnippetLocal(source.userAgent || "", 256),
    authTransport: sanitizeSnippetLocal(source.authTransport || "", 24),
    lastSeenAt: Math.max(0, Number(source.lastSeenAt || 0)),
  };
  if (!next.label && !next.clientName && !next.clientPlatform && !next.clientVersion && !next.clientBuild && !next.userAgent && !next.authTransport && !next.lastSeenAt) {
    return {};
  }
  return next;
}

function sanitizeStoredUserRecord(record) {
  if (!record || typeof record !== "object") return null;
  const id = normalizeUserId(record.id);
  const email = normalizeEmail(record.email);
  if (!id || !email) return null;

  const passwordRecord = record.password && typeof record.password === "object"
    ? record.password
    : null;
  const legacySalt = String(record.passwordSalt || "").trim();
  const legacyHash = String(record.passwordHash || "").trim();
  const legacyIterations = Math.max(1, Number(record.passwordIterations || 120000));
  const salt = String(passwordRecord?.salt || legacySalt || "").trim();
  const hash = String(passwordRecord?.hash || legacyHash || "").trim();
  const iterations = Math.max(1, Number(passwordRecord?.iterations || legacyIterations || 120000));
  const createdAt = Math.max(0, Number(record.createdAt || 0));
  const updatedAt = Math.max(createdAt, Number(record.updatedAt || createdAt || 0));
  const emailVerifiedAt = Math.max(
    0,
    Number(
      record.emailVerifiedAt ||
      (normalizeBoolean(record.emailVerified, false) ? (updatedAt || createdAt || Date.now()) : 0)
    )
  );
  return {
    id,
    email,
    name: sanitizeSnippetLocal(record.name || "", 80),
    authProvider: sanitizeSnippetLocal(
      record.authProvider || (String(record.appleSubject || "").trim() ? "apple" : "password"),
      24
    ) || "password",
    appleSubject: sanitizeSnippetLocal(record.appleSubject || "", 160),
    emailVerified: Boolean(emailVerifiedAt > 0),
    emailVerifiedAt: emailVerifiedAt || 0,
    password: salt && hash
      ? {
        salt,
        hash,
        iterations,
      }
      : null,
    createdAt,
    updatedAt,
  };
}

function sanitizeAuthSessionRecord(record) {
  if (!record || typeof record !== "object") return null;
  const sessionId = String(record.sessionId || record.session_id || "").trim();
  const familyId = String(record.familyId || record.family_id || "").trim();
  const userId = normalizeUserId(record.userId || record.user_id);
  const tokenHash = String(record.tokenHash || record.token_hash || "").trim();
  if (!sessionId || !familyId || !userId || !tokenHash) return null;
  return {
    sessionId,
    familyId,
    userId,
    tokenHash,
    createdAt: Math.max(0, Number(record.createdAt || record.created_at || 0)),
    updatedAt: Math.max(0, Number(record.updatedAt || record.updated_at || 0)),
    expiresAt: Math.max(0, Number(record.expiresAt || record.expires_at || 0)),
    revokedAt: Math.max(0, Number(record.revokedAt || record.revoked_at || 0)),
    replacedBySessionId: String(record.replacedBySessionId || record.replaced_by_session_id || "").trim(),
    metadata: sanitizeSessionMetadata(record.metadata),
  };
}

function sanitizeOneTimeTokenRecord(record) {
  if (!record || typeof record !== "object") return null;
  const tokenHash = String(record.tokenHash || record.token_hash || "").trim();
  const userId = normalizeUserId(record.userId || record.user_id);
  if (!tokenHash || !userId) return null;
  return {
    tokenHash,
    userId,
    createdAt: Math.max(0, Number(record.createdAt || record.created_at || 0)),
    expiresAt: Math.max(0, Number(record.expiresAt || record.expires_at || 0)),
    usedAt: Math.max(0, Number(record.usedAt || record.used_at || 0)),
  };
}

function replaceUserRecord(record) {
  const safeRecord = sanitizeStoredUserRecord(record);
  if (!safeRecord) return null;
  const existing = usersById.get(safeRecord.id);
  if (existing) {
    usersByEmail.delete(existing.email);
    if (existing.appleSubject) usersByAppleSubject.delete(existing.appleSubject);
  }
  usersById.set(safeRecord.id, safeRecord);
  usersByEmail.set(safeRecord.email, safeRecord);
  if (safeRecord.appleSubject) {
    usersByAppleSubject.set(safeRecord.appleSubject, safeRecord);
  }
  return safeRecord;
}

function replaceAuthSessionRecord(record) {
  const safeRecord = sanitizeAuthSessionRecord(record);
  if (!safeRecord) return null;
  const existing = authSessionsById.get(safeRecord.sessionId);
  if (existing) {
    authSessionIdByTokenHash.delete(existing.tokenHash);
  }
  authSessionsById.set(safeRecord.sessionId, safeRecord);
  authSessionIdByTokenHash.set(safeRecord.tokenHash, safeRecord.sessionId);
  return safeRecord;
}

function replaceOneTimeTokenRecord(targetMap, record) {
  const safeRecord = sanitizeOneTimeTokenRecord(record);
  if (!safeRecord) return null;
  targetMap.set(safeRecord.tokenHash, safeRecord);
  return safeRecord;
}

function cleanupExpiredAuthRecords(now = Date.now()) {
  for (const [sessionId, session] of authSessionsById.entries()) {
    if (Number(session.expiresAt || 0) > 0 && Number(session.expiresAt || 0) <= now) {
      authSessionsById.delete(sessionId);
      authSessionIdByTokenHash.delete(String(session.tokenHash || ""));
    }
  }
  for (const [tokenHash, record] of passwordResetTokensByHash.entries()) {
    if (Number(record.usedAt || 0) > 0 || (Number(record.expiresAt || 0) > 0 && Number(record.expiresAt || 0) <= now)) {
      passwordResetTokensByHash.delete(tokenHash);
    }
  }
  for (const [tokenHash, record] of emailVerificationTokensByHash.entries()) {
    if (Number(record.usedAt || 0) > 0 || (Number(record.expiresAt || 0) > 0 && Number(record.expiresAt || 0) <= now)) {
      emailVerificationTokensByHash.delete(tokenHash);
    }
  }
}

function loadUserStore() {
  const { USER_STORE_PATH, fs } = userStoreDeps();
  usersById.clear();
  usersByEmail.clear();
  usersByAppleSubject.clear();
  authSessionsById.clear();
  authSessionIdByTokenHash.clear();
  passwordResetTokensByHash.clear();
  emailVerificationTokensByHash.clear();
  try {
    if (!fs.existsSync(USER_STORE_PATH)) return;
    const raw = fs.readFileSync(USER_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const users = Array.isArray(parsed?.users) ? parsed.users : [];
    const authSessions = Array.isArray(parsed?.authSessions)
      ? parsed.authSessions
      : (Array.isArray(parsed?.auth_sessions) ? parsed.auth_sessions : []);
    const passwordResetTokens = Array.isArray(parsed?.passwordResetTokens)
      ? parsed.passwordResetTokens
      : (Array.isArray(parsed?.password_reset_tokens) ? parsed.password_reset_tokens : []);
    const emailVerificationTokens = Array.isArray(parsed?.emailVerificationTokens)
      ? parsed.emailVerificationTokens
      : (Array.isArray(parsed?.email_verification_tokens) ? parsed.email_verification_tokens : []);

    for (const entry of users) {
      replaceUserRecord(entry);
    }
    for (const entry of authSessions) {
      replaceAuthSessionRecord(entry);
    }
    for (const entry of passwordResetTokens) {
      replaceOneTimeTokenRecord(passwordResetTokensByHash, entry);
    }
    for (const entry of emailVerificationTokens) {
      replaceOneTimeTokenRecord(emailVerificationTokensByHash, entry);
    }
    cleanupExpiredAuthRecords(Date.now());
  } catch (err) {
    console.error("[user_store] Failed to load store " + USER_STORE_PATH + ":", err);
  }
}

function saveUserStore(now = Date.now()) {
  const { USER_STORE_PATH, writeJsonFileAtomic } = userStoreDeps();
  cleanupExpiredAuthRecords(now);
  const payload = {
    version: 2,
    updatedAt: now,
    users: [...usersById.values()].map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name || "",
      authProvider: user.authProvider || "password",
      appleSubject: user.appleSubject || "",
      emailVerified: Boolean(user.emailVerified),
      emailVerifiedAt: Math.max(0, Number(user.emailVerifiedAt || 0)),
      password: user.password
        ? {
          salt: user.password.salt,
          hash: user.password.hash,
          iterations: Math.max(1, Number(user.password.iterations || 120000)),
        }
        : null,
      createdAt: Math.max(0, Number(user.createdAt || now)),
      updatedAt: Math.max(0, Number(user.updatedAt || now)),
    })),
    authSessions: [...authSessionsById.values()].map((session) => ({
      sessionId: session.sessionId,
      familyId: session.familyId,
      userId: session.userId,
      tokenHash: session.tokenHash,
      createdAt: Math.max(0, Number(session.createdAt || now)),
      updatedAt: Math.max(0, Number(session.updatedAt || now)),
      expiresAt: Math.max(0, Number(session.expiresAt || 0)),
      revokedAt: Math.max(0, Number(session.revokedAt || 0)),
      replacedBySessionId: session.replacedBySessionId || "",
      metadata: sanitizeSessionMetadata(session.metadata),
    })),
    passwordResetTokens: [...passwordResetTokensByHash.values()].map((record) => ({
      tokenHash: record.tokenHash,
      userId: record.userId,
      createdAt: Math.max(0, Number(record.createdAt || now)),
      expiresAt: Math.max(0, Number(record.expiresAt || 0)),
      usedAt: Math.max(0, Number(record.usedAt || 0)),
    })),
    emailVerificationTokens: [...emailVerificationTokensByHash.values()].map((record) => ({
      tokenHash: record.tokenHash,
      userId: record.userId,
      createdAt: Math.max(0, Number(record.createdAt || now)),
      expiresAt: Math.max(0, Number(record.expiresAt || 0)),
      usedAt: Math.max(0, Number(record.usedAt || 0)),
    })),
  };
  writeJsonFileAtomic(USER_STORE_PATH, payload, "user_store");
}

function getUserByEmail(email) {
  const normalized = normalizeEmail(email);
  return usersByEmail.get(normalized) || null;
}

function getUserById(id) {
  const normalized = normalizeUserId(id);
  return usersById.get(normalized) || null;
}

function getUserByAppleSubject(appleSubject) {
  const normalized = String(appleSubject || "").trim();
  return usersByAppleSubject.get(normalized) || null;
}

function createUser(input = {}, now = Date.now(), options = {}) {
  const normalizedEmail = normalizeEmail(input.email);
  if (!normalizedEmail) {
    return { ok: false, status: "email_required", message: "Email is required." };
  }
  if (getUserByEmail(normalizedEmail)) {
    return { ok: false, status: "email_taken", message: "Email already exists." };
  }
  const allowPasswordless = Boolean(options.allowPasswordless);
  const cleanPassword = String(input.password || "");
  if (!allowPasswordless && cleanPassword.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      status: "password_too_short",
      message: "Password must be at least " + PASSWORD_MIN_LENGTH + " characters.",
    };
  }
  const record = replaceUserRecord({
    id: "user_" + randomUUID().replace(/-/g, "").slice(0, 16),
    email: normalizedEmail,
    name: sanitizeSnippetLocal(input.name || "", 80),
    authProvider: String(input.authProvider || (String(input.appleSubject || "").trim() ? "apple" : "password")).trim() || "password",
    appleSubject: String(input.appleSubject || "").trim(),
    emailVerified: normalizeBoolean(input.emailVerified, false),
    emailVerifiedAt: normalizeBoolean(input.emailVerified, false) ? now : 0,
    password: cleanPassword
      ? createPasswordRecord(cleanPassword)
      : null,
    createdAt: now,
    updatedAt: now,
  });
  saveUserStore(now);
  return { ok: true, user: record };
}

function createOrAttachAppleUser(input = {}, now = Date.now()) {
  const appleSubject = String(input.appleSubject || "").trim();
  const normalizedEmail = normalizeEmail(input.email);
  const emailVerified = normalizeBoolean(input.emailVerified, false);
  if (!appleSubject) {
    return { ok: false, status: "apple_subject_required", message: "Apple subject is required." };
  }

  const existingBySubject = getUserByAppleSubject(appleSubject);
  if (existingBySubject) {
    const nextEmail = normalizedEmail || existingBySubject.email;
    if (!nextEmail) {
      return { ok: false, status: "email_required", message: "Email is required." };
    }
    const conflict = getUserByEmail(nextEmail);
    if (conflict && conflict.id !== existingBySubject.id) {
      return { ok: false, status: "email_taken", message: "Email already exists." };
    }
    const updated = replaceUserRecord({
      ...existingBySubject,
      email: nextEmail,
      authProvider: existingBySubject.authProvider || "apple",
      appleSubject,
      emailVerified: existingBySubject.emailVerified || emailVerified,
      emailVerifiedAt: existingBySubject.emailVerifiedAt || (emailVerified ? now : 0),
      updatedAt: now,
    });
    saveUserStore(now);
    return { ok: true, user: updated };
  }

  if (normalizedEmail) {
    const existingByEmail = getUserByEmail(normalizedEmail);
    if (existingByEmail) {
      const updated = replaceUserRecord({
        ...existingByEmail,
        authProvider: existingByEmail.authProvider || "password",
        appleSubject,
        emailVerified: existingByEmail.emailVerified || emailVerified,
        emailVerifiedAt: existingByEmail.emailVerifiedAt || (emailVerified ? now : 0),
        updatedAt: now,
      });
      saveUserStore(now);
      return { ok: true, user: updated };
    }
  }

  if (!normalizedEmail) {
    return { ok: false, status: "email_required", message: "Email is required." };
  }

  return createUser({
    email: normalizedEmail,
    name: input.name || "",
    authProvider: "apple",
    appleSubject,
    emailVerified,
    password: "",
  }, now, { allowPasswordless: true });
}

function authenticateUser(email, password) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { ok: false, status: "email_required", message: "Email is required." };
  }
  const user = getUserByEmail(normalizedEmail);
  if (!user) {
    return { ok: false, status: "not_found", message: "Account not found." };
  }
  if (!user.password) {
    return { ok: false, status: "password_unavailable", message: "Password sign in is not available for this account." };
  }
  if (!verifyPassword(String(password || ""), user.password)) {
    return { ok: false, status: "invalid_password", message: "Invalid password." };
  }
  return { ok: true, user };
}

function markUserEmailVerified(userId, now = Date.now()) {
  const existing = getUserById(userId);
  if (!existing) return null;
  const updated = replaceUserRecord({
    ...existing,
    emailVerified: true,
    emailVerifiedAt: Math.max(1, Number(existing.emailVerifiedAt || now)),
    updatedAt: now,
  });
  saveUserStore(now);
  return updated;
}

function updateUserPassword(userId, password, now = Date.now()) {
  const existing = getUserById(userId);
  if (!existing) {
    return { ok: false, status: "not_found", message: "Account not found." };
  }
  const cleanPassword = String(password || "");
  if (cleanPassword.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      status: "password_too_short",
      message: "Password must be at least " + PASSWORD_MIN_LENGTH + " characters.",
    };
  }
  const updated = replaceUserRecord({
    ...existing,
    password: createPasswordRecord(cleanPassword),
    updatedAt: now,
  });
  saveUserStore(now);
  return { ok: true, user: updated };
}

function issueAuthSession(input = {}, now = Date.now()) {
  const userId = normalizeUserId(input.userId);
  if (!userId) return null;
  const refreshToken = buildOpaqueToken();
  const session = replaceAuthSessionRecord({
    sessionId: "sess_" + randomUUID().replace(/-/g, "").slice(0, 16),
    familyId: String(input.familyId || "fam_" + randomUUID().replace(/-/g, "").slice(0, 16)).trim(),
    userId,
    tokenHash: hashOpaqueToken(refreshToken),
    createdAt: now,
    updatedAt: now,
    expiresAt: Math.max(now + 1000, Number(input.expiresAt || (now + Math.max(60000, Number(input.ttlMs || 0))))),
    revokedAt: 0,
    replacedBySessionId: "",
    metadata: sanitizeSessionMetadata(input.metadata),
  });
  saveUserStore(now);
  return {
    session,
    refreshToken,
  };
}

function getAuthSessionById(sessionId, now = Date.now(), options = {}) {
  cleanupExpiredAuthRecords(now);
  const safeSessionId = String(sessionId || "").trim();
  if (!safeSessionId) return null;
  const session = authSessionsById.get(safeSessionId);
  if (!session) return null;
  if (!options.includeExpired && Number(session.expiresAt || 0) > 0 && Number(session.expiresAt || 0) <= now) {
    return null;
  }
  if (!options.includeRevoked && Number(session.revokedAt || 0) > 0) {
    return null;
  }
  return sanitizeAuthSessionRecord(session);
}

function getAuthSessionByToken(refreshToken, now = Date.now(), options = {}) {
  cleanupExpiredAuthRecords(now);
  const normalizedToken = String(refreshToken || "").trim();
  if (!normalizedToken) return null;
  const tokenHash = hashOpaqueToken(normalizedToken);
  const sessionId = String(authSessionIdByTokenHash.get(tokenHash) || "").trim();
  if (!sessionId) return null;
  return getAuthSessionById(sessionId, now, options);
}

function revokeAuthSessionById(sessionId, now = Date.now(), options = {}) {
  const existing = authSessionsById.get(String(sessionId || "").trim());
  if (!existing) return null;
  const updated = replaceAuthSessionRecord({
    ...existing,
    revokedAt: Math.max(1, Number(existing.revokedAt || now)),
    updatedAt: now,
    replacedBySessionId: String(options.replacedBySessionId || existing.replacedBySessionId || "").trim(),
  });
  saveUserStore(now);
  return updated;
}

function revokeAuthSessionByToken(refreshToken, now = Date.now(), options = {}) {
  const session = getAuthSessionByToken(refreshToken, now, { includeRevoked: true, includeExpired: true });
  if (!session) return null;
  return revokeAuthSessionById(session.sessionId, now, options);
}

function revokeAllAuthSessionsForUser(userId, now = Date.now(), options = {}) {
  const normalizedUserId = normalizeUserId(userId);
  const exceptSessionId = String(options.exceptSessionId || "").trim();
  const revoked = [];
  for (const session of authSessionsById.values()) {
    if (session.userId !== normalizedUserId) continue;
    if (exceptSessionId && session.sessionId === exceptSessionId) continue;
    if (Number(session.revokedAt || 0) > 0) continue;
    const updated = replaceAuthSessionRecord({
      ...session,
      revokedAt: now,
      updatedAt: now,
    });
    if (updated) revoked.push(updated);
  }
  if (revoked.length) saveUserStore(now);
  return revoked;
}

function rotateAuthSession(refreshToken, input = {}, now = Date.now()) {
  const current = getAuthSessionByToken(refreshToken, now);
  if (!current) return null;
  const issued = issueAuthSession({
    userId: current.userId,
    familyId: current.familyId,
    ttlMs: input.ttlMs,
    expiresAt: input.expiresAt,
    metadata: Object.keys(input.metadata && typeof input.metadata === "object" ? input.metadata : {}).length
      ? input.metadata
      : current.metadata,
  }, now);
  if (!issued) return null;
  const previousSession = replaceAuthSessionRecord({
    ...current,
    revokedAt: now,
    updatedAt: now,
    replacedBySessionId: issued.session.sessionId,
  });
  saveUserStore(now);
  return {
    previousSession,
    session: issued.session,
    refreshToken: issued.refreshToken,
  };
}

function listAuthSessionsForUser(userId, now = Date.now()) {
  cleanupExpiredAuthRecords(now);
  const normalizedUserId = normalizeUserId(userId);
  return [...authSessionsById.values()]
    .filter((session) => session.userId === normalizedUserId)
    .map((session) => sanitizeAuthSessionRecord(session))
    .sort((left, right) => Math.max(0, Number(right.updatedAt || 0)) - Math.max(0, Number(left.updatedAt || 0)));
}

function issueOneTimeToken(targetMap, input = {}, now = Date.now()) {
  const userId = normalizeUserId(input.userId);
  if (!userId) return null;
  const token = buildOpaqueToken();
  const record = replaceOneTimeTokenRecord(targetMap, {
    tokenHash: hashOpaqueToken(token),
    userId,
    createdAt: now,
    expiresAt: Math.max(now + 1000, now + Math.max(60000, Number(input.ttlMs || 0))),
    usedAt: 0,
  });
  saveUserStore(now);
  return { token, record };
}

function consumeOneTimeToken(targetMap, token, now = Date.now()) {
  cleanupExpiredAuthRecords(now);
  const tokenHash = hashOpaqueToken(token);
  const existing = targetMap.get(tokenHash);
  if (!existing) return null;
  if (Number(existing.usedAt || 0) > 0) return null;
  if (Number(existing.expiresAt || 0) > 0 && Number(existing.expiresAt || 0) <= now) {
    targetMap.delete(tokenHash);
    saveUserStore(now);
    return null;
  }
  const updated = replaceOneTimeTokenRecord(targetMap, {
    ...existing,
    usedAt: now,
  });
  saveUserStore(now);
  return updated;
}

function issuePasswordResetToken(input = {}, now = Date.now()) {
  return issueOneTimeToken(passwordResetTokensByHash, input, now);
}

function consumePasswordResetToken(token, now = Date.now()) {
  return consumeOneTimeToken(passwordResetTokensByHash, token, now);
}

function issueEmailVerificationToken(input = {}, now = Date.now()) {
  return issueOneTimeToken(emailVerificationTokensByHash, input, now);
}

function consumeEmailVerificationToken(token, now = Date.now()) {
  return consumeOneTimeToken(emailVerificationTokensByHash, token, now);
}

export {
  authenticateUser,
  authSessionIdByTokenHash,
  authSessionsById,
  configureUserStore,
  consumeEmailVerificationToken,
  consumePasswordResetToken,
  createOrAttachAppleUser,
  createUser,
  emailVerificationTokensByHash,
  getAuthSessionById,
  getAuthSessionByToken,
  getUserByAppleSubject,
  getUserByEmail,
  getUserById,
  issueAuthSession,
  issueEmailVerificationToken,
  issuePasswordResetToken,
  listAuthSessionsForUser,
  loadUserStore,
  markUserEmailVerified,
  passwordResetTokensByHash,
  revokeAllAuthSessionsForUser,
  revokeAuthSessionById,
  revokeAuthSessionByToken,
  rotateAuthSession,
  saveUserStore,
  usersByAppleSubject,
  usersByEmail,
  usersById,
  updateUserPassword,
};

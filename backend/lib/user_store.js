import { createHash, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

let configuredDeps = null;
let lastUserStorePersistenceWrite = Promise.resolve({
  ok: true,
  persistenceStatus: "not_configured",
  persistenceFailureCount: 0,
});
let lastUserStoreMutation = Promise.resolve();
let userStoreCanonicalReconciliationRequired = false;

const PASSWORD_MIN_LENGTH = 8;
const AUTH_STORE_META_DOMAIN = "auth_store_meta";
const AUTH_STORE_META_KEY = "canonical_state";
const AUTH_STORE_META_VALUE = Object.freeze({
  schemaVersion: 1,
  initialized: true,
});
const USER_STORE_ADAPTER_INVALID = "USER_STORE_ADAPTER_INVALID";
const AUTH_STORE_ADAPTER_PAGE_LIMIT = 10_000;
const AUTH_STORE_ADAPTER_MAX_PAGES = 100_000;
// New password records use OWASP's 2023 PBKDF2-SHA256 minimum. Canonical and
// legacy records may retain a lower historical count, but a hard upper bound
// prevents a corrupt record from turning synchronous login verification into
// an unbounded CPU denial of service.
const PBKDF2_ITERATIONS_DEFAULT = 600_000;
const PBKDF2_ITERATIONS_MAX = 2_000_000;
const PASSWORD_SALT_MAX_LENGTH = 512;
const PASSWORD_HASH_PATTERN = /^[0-9a-f]{64}$/i;

const usersById = new Map();
const usersByEmail = new Map();
const usersByAppleSubject = new Map();
const authSessionsById = new Map();
const authSessionIdByTokenHash = new Map();
const passwordResetTokensByHash = new Map();
const emailVerificationTokensByHash = new Map();

function configureUserStore(deps = {}) {
  configuredDeps = deps;
  lastUserStorePersistenceWrite = Promise.resolve({
    ok: true,
    persistenceStatus: "not_configured",
    persistenceFailureCount: 0,
  });
  lastUserStoreMutation = Promise.resolve();
  userStoreCanonicalReconciliationRequired = false;
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

// Apple `sub` is an opaque stable identifier. Treating it as display text can
// collapse or truncate distinct identities, so its only normalization is the
// boundary whitespace trimming also enforced by the Postgres uniqueness index.
function normalizeAppleSubject(value) {
  return String(value || "").trim();
}

function normalizeBoolean(value, fallback = false) {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function normalizeStoredPasswordRecord(record) {
  const source = record && typeof record === "object" ? record : {};
  const hasNestedMaterial = source.password != null;
  const nested = hasNestedMaterial
    && typeof source.password === "object"
    && !Array.isArray(source.password)
    ? source.password
    : null;
  const hasLegacyMaterial = ["passwordSalt", "passwordHash", "passwordIterations"]
    .some((field) => Object.prototype.hasOwnProperty.call(source, field));
  const hasMaterial = hasNestedMaterial || hasLegacyMaterial;
  const rawSalt = hasNestedMaterial ? nested?.salt : source.passwordSalt;
  const rawHash = hasNestedMaterial ? nested?.hash : source.passwordHash;
  // Legacy local JSON records predate the explicit iteration field and used
  // 120k. Canonical adapter hydration separately requires the field to be
  // present and valid before this compatibility normalizer runs.
  const rawIterations = hasNestedMaterial
    ? (Object.prototype.hasOwnProperty.call(nested || {}, "iterations")
      ? nested.iterations
      : 120000)
    : (Object.prototype.hasOwnProperty.call(source, "passwordIterations")
      ? source.passwordIterations
      : 120000);
  const salt = typeof rawSalt === "string" ? rawSalt.trim() : "";
  const hash = typeof rawHash === "string" ? rawHash.trim() : "";
  const iterations = typeof rawIterations === "number"
    ? rawIterations
    : (typeof rawIterations === "string" && rawIterations.trim() !== ""
      ? Number(rawIterations.trim())
      : Number.NaN);
  const valid = Boolean(
    salt
    && salt.length <= PASSWORD_SALT_MAX_LENGTH
    && PASSWORD_HASH_PATTERN.test(hash)
    && Number.isFinite(iterations)
    && Number.isInteger(iterations)
    && iterations > 0
    && iterations <= PBKDF2_ITERATIONS_MAX
  );
  return {
    hasMaterial,
    password: valid ? { salt, hash, iterations } : null,
  };
}

function validateUserPassword(password) {
  const cleanPassword = String(password || "");
  if (cleanPassword.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      status: "password_too_short",
      message: "Password must be at least " + PASSWORD_MIN_LENGTH + " characters.",
    };
  }
  return { ok: true, password: cleanPassword };
}

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function hashPassword(password, salt, iterations = PBKDF2_ITERATIONS_DEFAULT) {
  const digest = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  return digest.toString("hex");
}

function createPasswordRecord(password) {
  const salt = randomBytes(16).toString("hex");
  const iterations = PBKDF2_ITERATIONS_DEFAULT;
  const hash = hashPassword(password, salt, iterations);
  return { salt, iterations, hash };
}

function verifyPassword(password, record) {
  const normalized = normalizeStoredPasswordRecord({ password: record }).password;
  if (!normalized) return false;
  const hashed = hashPassword(password, normalized.salt, normalized.iterations);
  const left = Buffer.from(hashed, "hex");
  const right = Buffer.from(normalized.hash, "hex");
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

  const storedPassword = normalizeStoredPasswordRecord(record);
  const appleSubject = normalizeAppleSubject(record.appleSubject);
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
      record.authProvider || (appleSubject ? "apple" : "password"),
      24
    ) || "password",
    appleSubject,
    emailVerified: Boolean(emailVerifiedAt > 0),
    emailVerifiedAt: emailVerifiedAt || 0,
    password: storedPassword.password,
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

function userStoreAdapterInvalid(message, cause = null) {
  const error = new Error(`user_store_adapter_invalid: ${message}`);
  error.code = USER_STORE_ADAPTER_INVALID;
  if (cause) error.cause = cause;
  return error;
}

function assertAdapterRowKey(entry, expectedKey, domain) {
  const rowKey = typeof entry?.key === "string" ? entry.key : "";
  if (!rowKey || rowKey !== expectedKey) {
    throw userStoreAdapterInvalid(
      `${domain} row key ${JSON.stringify(rowKey)} does not match embedded key ${JSON.stringify(expectedKey)}`
    );
  }
}

function adapterRecord(entry, domain) {
  const record = entry?.value;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw userStoreAdapterInvalid(`${domain} contains a non-object record`);
  }
  return record;
}

function adapterAliasedValue(record, fieldNames, label, normalize, { required = true } = {}) {
  const present = fieldNames.filter((fieldName) => (
    Object.prototype.hasOwnProperty.call(record, fieldName)
  ));
  if (present.length === 0) {
    if (!required) return undefined;
    throw userStoreAdapterInvalid(`${label} is missing ${fieldNames[0]}`);
  }
  const values = present.map((fieldName) => normalize(record[fieldName], fieldName));
  if (values.some((value) => value !== values[0])) {
    throw userStoreAdapterInvalid(`${label} has conflicting ${fieldNames[0]} aliases`);
  }
  return values[0];
}

function adapterString(
  record,
  fieldNames,
  label,
  { allowEmpty = false, maxLength = Number.POSITIVE_INFINITY, required = true } = {},
) {
  return adapterAliasedValue(record, fieldNames, label, (rawValue) => {
    if (typeof rawValue !== "string") {
      throw userStoreAdapterInvalid(`${label} ${fieldNames[0]} must be a string`);
    }
    const value = rawValue.trim();
    if (!allowEmpty && !value) {
      throw userStoreAdapterInvalid(`${label} ${fieldNames[0]} must be nonempty`);
    }
    if (value.length > maxLength) {
      throw userStoreAdapterInvalid(
        `${label} ${fieldNames[0]} must be at most ${maxLength} characters`,
      );
    }
    return value;
  }, { required });
}

function adapterBoolean(record, fieldNames, label, { required = true } = {}) {
  return adapterAliasedValue(record, fieldNames, label, (rawValue) => {
    if (typeof rawValue !== "boolean") {
      throw userStoreAdapterInvalid(`${label} ${fieldNames[0]} must be a boolean`);
    }
    return rawValue;
  }, { required });
}

function adapterTimestamp(
  record,
  fieldNames,
  label,
  { allowZero = false, required = true } = {},
) {
  return adapterAliasedValue(record, fieldNames, label, (rawValue) => {
    const isNumber = typeof rawValue === "number";
    const isNumericString = typeof rawValue === "string" && rawValue.trim() !== "";
    if (!isNumber && !isNumericString) {
      throw userStoreAdapterInvalid(`${label} ${fieldNames[0]} must be a primitive timestamp`);
    }
    const value = isNumber ? rawValue : Number(rawValue.trim());
    const inRange = allowZero ? value >= 0 : value > 0;
    if (!Number.isFinite(value) || !inRange) {
      throw userStoreAdapterInvalid(`${label} ${fieldNames[0]} has an invalid timestamp`);
    }
    return value;
  }, { required });
}

function adapterPositiveInteger(
  rawValue,
  label,
  { max = Number.MAX_SAFE_INTEGER } = {},
) {
  const isNumber = typeof rawValue === "number";
  const isNumericString = typeof rawValue === "string" && rawValue.trim() !== "";
  if (!isNumber && !isNumericString) {
    throw userStoreAdapterInvalid(`${label} must be a primitive positive integer`);
  }
  const value = isNumber ? rawValue : Number(rawValue.trim());
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw userStoreAdapterInvalid(`${label} must be a finite positive integer`);
  }
  if (value > max) {
    throw userStoreAdapterInvalid(`${label} must be at most ${max}`);
  }
  return value;
}

function assertAdapterPasswordMaterial(credential, label) {
  if (!PASSWORD_HASH_PATTERN.test(credential.hash)) {
    throw userStoreAdapterInvalid(`${label} password hash must be a 64-character hexadecimal digest`);
  }
}

function validateAdapterPasswordCredential(record, label) {
  const hasNested = Object.prototype.hasOwnProperty.call(record, "password")
    && record.password != null;
  const flatFields = ["passwordSalt", "passwordHash", "passwordIterations"];
  const hasFlat = flatFields.some((fieldName) => (
    Object.prototype.hasOwnProperty.call(record, fieldName)
  ));
  let nested = null;
  let flat = null;

  if (hasNested) {
    if (typeof record.password !== "object" || Array.isArray(record.password)) {
      throw userStoreAdapterInvalid(`${label} password must be an object or null`);
    }
    nested = {
      salt: adapterString(record.password, ["salt"], `${label} password`, {
        maxLength: PASSWORD_SALT_MAX_LENGTH,
      }),
      hash: adapterString(record.password, ["hash"], `${label} password`),
      iterations: adapterPositiveInteger(
        record.password.iterations,
        `${label} password iterations`,
        { max: PBKDF2_ITERATIONS_MAX },
      ),
    };
    assertAdapterPasswordMaterial(nested, label);
  }

  if (hasFlat) {
    flat = {
      salt: adapterString(record, ["passwordSalt"], label, {
        maxLength: PASSWORD_SALT_MAX_LENGTH,
      }),
      hash: adapterString(record, ["passwordHash"], label),
      iterations: adapterPositiveInteger(
        record.passwordIterations,
        `${label} passwordIterations`,
        { max: PBKDF2_ITERATIONS_MAX },
      ),
    };
    assertAdapterPasswordMaterial(flat, label);
  }

  if (
    nested
    && flat
    && (
      nested.salt !== flat.salt
      || nested.hash !== flat.hash
      || nested.iterations !== flat.iterations
    )
  ) {
    throw userStoreAdapterInvalid(`${label} has conflicting password credentials`);
  }
  return nested || flat;
}

function buildUserStoreAdapterState({
  users = [],
  sessions = [],
  passwordResetTokens = [],
  emailVerificationTokens = [],
} = {}) {
  const state = {
    usersById: new Map(),
    usersByEmail: new Map(),
    usersByAppleSubject: new Map(),
    authSessionsById: new Map(),
    authSessionIdByTokenHash: new Map(),
    passwordResetTokensByHash: new Map(),
    emailVerificationTokensByHash: new Map(),
  };
  const tokenAliases = new Set();

  for (const entry of users) {
    const rawRecord = adapterRecord(entry, "auth_users");
    adapterString(rawRecord, ["id"], "auth user");
    adapterString(rawRecord, ["email"], "auth user");
    adapterString(rawRecord, ["appleSubject"], "auth user", {
      allowEmpty: true,
      required: false,
    });
    const rawEmailVerified = adapterBoolean(
      rawRecord,
      ["emailVerified"],
      "auth user",
      { required: false },
    );
    const rawEmailVerifiedAt = adapterTimestamp(
      rawRecord,
      ["emailVerifiedAt"],
      "auth user",
      { allowZero: true, required: false },
    );
    if ((rawEmailVerified === undefined) !== (rawEmailVerifiedAt === undefined)) {
      throw userStoreAdapterInvalid(
        "auth user must provide emailVerified and emailVerifiedAt together",
      );
    }
    if (
      rawEmailVerified !== undefined
      && rawEmailVerified !== (rawEmailVerifiedAt > 0)
    ) {
      throw userStoreAdapterInvalid(
        "auth user has contradictory email verification metadata",
      );
    }
    const validatedPassword = validateAdapterPasswordCredential(rawRecord, "auth user");
    const safeRecord = sanitizeStoredUserRecord(rawRecord);
    if (!safeRecord) {
      throw userStoreAdapterInvalid("auth_users contains an invalid user record");
    }
    assertAdapterRowKey(entry, safeRecord.id, "auth_users");
    const storedPassword = normalizeStoredPasswordRecord(rawRecord);
    if (validatedPassword && !storedPassword.password) {
      throw userStoreAdapterInvalid(`auth user ${safeRecord.id} contains malformed password credentials`);
    }
    if (!safeRecord.password && !safeRecord.appleSubject) {
      throw userStoreAdapterInvalid(`auth user ${safeRecord.id} has no usable authentication credential`);
    }
    if (state.usersById.has(safeRecord.id)) {
      throw userStoreAdapterInvalid(`duplicate auth user id ${safeRecord.id}`);
    }
    if (state.usersByEmail.has(safeRecord.email)) {
      throw userStoreAdapterInvalid(`duplicate normalized auth email ${safeRecord.email}`);
    }
    if (safeRecord.appleSubject && state.usersByAppleSubject.has(safeRecord.appleSubject)) {
      throw userStoreAdapterInvalid(`duplicate Apple subject ${safeRecord.appleSubject}`);
    }
    state.usersById.set(safeRecord.id, safeRecord);
    state.usersByEmail.set(safeRecord.email, safeRecord);
    if (safeRecord.appleSubject) {
      state.usersByAppleSubject.set(safeRecord.appleSubject, safeRecord);
    }
  }

  for (const entry of sessions) {
    const rawRecord = adapterRecord(entry, "auth_sessions");
    adapterString(rawRecord, ["sessionId", "session_id"], "auth session");
    adapterString(rawRecord, ["familyId", "family_id"], "auth session");
    adapterString(rawRecord, ["userId", "user_id"], "auth session");
    adapterString(rawRecord, ["tokenHash", "token_hash"], "auth session");
    adapterTimestamp(rawRecord, ["expiresAt", "expires_at"], "auth session");
    adapterTimestamp(
      rawRecord,
      ["revokedAt", "revoked_at"],
      "auth session",
      { allowZero: true },
    );
    const safeRecord = sanitizeAuthSessionRecord(rawRecord);
    if (!safeRecord) {
      throw userStoreAdapterInvalid("auth_sessions contains an invalid session record");
    }
    assertAdapterRowKey(entry, safeRecord.sessionId, "auth_sessions");
    if (!state.usersById.has(safeRecord.userId)) {
      throw userStoreAdapterInvalid(
        `auth session ${safeRecord.sessionId} references unknown user ${safeRecord.userId}`
      );
    }
    if (!Number.isFinite(safeRecord.expiresAt) || safeRecord.expiresAt <= 0) {
      throw userStoreAdapterInvalid(`auth session ${safeRecord.sessionId} has invalid expiresAt`);
    }
    if (!Number.isFinite(safeRecord.revokedAt) || safeRecord.revokedAt < 0) {
      throw userStoreAdapterInvalid(`auth session ${safeRecord.sessionId} has invalid revokedAt`);
    }
    if (state.authSessionsById.has(safeRecord.sessionId)) {
      throw userStoreAdapterInvalid(`duplicate auth session id ${safeRecord.sessionId}`);
    }
    if (tokenAliases.has(safeRecord.tokenHash)) {
      throw userStoreAdapterInvalid(`duplicate auth token alias ${safeRecord.tokenHash}`);
    }
    tokenAliases.add(safeRecord.tokenHash);
    state.authSessionsById.set(safeRecord.sessionId, safeRecord);
    state.authSessionIdByTokenHash.set(safeRecord.tokenHash, safeRecord.sessionId);
  }

  const stageOneTimeTokens = (entries, domain, targetMap) => {
    for (const entry of entries) {
      const rawRecord = adapterRecord(entry, domain);
      adapterString(rawRecord, ["tokenHash", "token_hash"], `${domain} token`);
      adapterString(rawRecord, ["userId", "user_id"], `${domain} token`);
      adapterTimestamp(rawRecord, ["expiresAt", "expires_at"], `${domain} token`);
      adapterTimestamp(
        rawRecord,
        ["usedAt", "used_at"],
        `${domain} token`,
        { allowZero: true },
      );
      const safeRecord = sanitizeOneTimeTokenRecord(rawRecord);
      if (!safeRecord) {
        throw userStoreAdapterInvalid(`${domain} contains an invalid token record`);
      }
      assertAdapterRowKey(entry, safeRecord.tokenHash, domain);
      if (!state.usersById.has(safeRecord.userId)) {
        throw userStoreAdapterInvalid(
          `${domain} token ${safeRecord.tokenHash} references unknown user ${safeRecord.userId}`
        );
      }
      if (!Number.isFinite(safeRecord.expiresAt) || safeRecord.expiresAt <= 0) {
        throw userStoreAdapterInvalid(`${domain} token ${safeRecord.tokenHash} has invalid expiresAt`);
      }
      if (!Number.isFinite(safeRecord.usedAt) || safeRecord.usedAt < 0) {
        throw userStoreAdapterInvalid(`${domain} token ${safeRecord.tokenHash} has invalid usedAt`);
      }
      if (tokenAliases.has(safeRecord.tokenHash)) {
        throw userStoreAdapterInvalid(`duplicate auth token alias ${safeRecord.tokenHash}`);
      }
      tokenAliases.add(safeRecord.tokenHash);
      targetMap.set(safeRecord.tokenHash, safeRecord);
    }
  };

  stageOneTimeTokens(
    passwordResetTokens,
    "auth_password_reset_tokens",
    state.passwordResetTokensByHash
  );
  stageOneTimeTokens(
    emailVerificationTokens,
    "auth_email_verification_tokens",
    state.emailVerificationTokensByHash
  );
  return state;
}

function replaceMapContents(target, source) {
  target.clear();
  for (const [key, value] of source.entries()) {
    target.set(key, value);
  }
}

function applyUserStoreAdapterState(state) {
  replaceMapContents(usersById, state.usersById);
  replaceMapContents(usersByEmail, state.usersByEmail);
  replaceMapContents(usersByAppleSubject, state.usersByAppleSubject);
  replaceMapContents(authSessionsById, state.authSessionsById);
  replaceMapContents(authSessionIdByTokenHash, state.authSessionIdByTokenHash);
  replaceMapContents(passwordResetTokensByHash, state.passwordResetTokensByHash);
  replaceMapContents(emailVerificationTokensByHash, state.emailVerificationTokensByHash);
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

function buildUserStorePayload(now = Date.now(), options = {}) {
  if (options.cleanupExpired !== false) {
    cleanupExpiredAuthRecords(now);
  }
  return {
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
          iterations: user.password.iterations,
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
}

function createUserStoreCheckpoint(now = Date.now()) {
  return buildUserStorePayload(now, { cleanupExpired: false });
}

function restoreUserStoreCheckpoint(checkpoint, now = Date.now()) {
  const payload = checkpoint && typeof checkpoint === "object" ? checkpoint : {};
  usersById.clear();
  usersByEmail.clear();
  usersByAppleSubject.clear();
  authSessionsById.clear();
  authSessionIdByTokenHash.clear();
  passwordResetTokensByHash.clear();
  emailVerificationTokensByHash.clear();
  for (const entry of Array.isArray(payload.users) ? payload.users : []) {
    replaceUserRecord(entry);
  }
  for (const entry of Array.isArray(payload.authSessions) ? payload.authSessions : []) {
    replaceAuthSessionRecord(entry);
  }
  for (const entry of Array.isArray(payload.passwordResetTokens) ? payload.passwordResetTokens : []) {
    replaceOneTimeTokenRecord(passwordResetTokensByHash, entry);
  }
  for (const entry of Array.isArray(payload.emailVerificationTokens) ? payload.emailVerificationTokens : []) {
    replaceOneTimeTokenRecord(emailVerificationTokensByHash, entry);
  }
  return saveUserStore(now);
}

function runUserStoreMutationExclusive(operation) {
  if (typeof operation !== "function") {
    return Promise.reject(new TypeError("runUserStoreMutationExclusive requires an operation"));
  }
  const run = lastUserStoreMutation
    .catch(() => {})
    .then(() => operation());
  lastUserStoreMutation = run.then(() => undefined, () => undefined);
  return run;
}

function waitForUserStoreMutations() {
  return lastUserStoreMutation.catch(() => {});
}

async function ensureUserStoreCanonicalReconciled() {
  if (!userStoreCanonicalReconciliationRequired) return true;
  const { persistence } = userStoreDeps();
  if (persistence?.kind !== "postgres") return false;
  try {
    const loaded = await loadUserStoreFromAdapter({
      failOnUnavailable: true,
      failOnUninitialized: true,
    });
    if (loaded !== true) return false;
    userStoreCanonicalReconciliationRequired = false;
    writeLocalUserStoreMirror(Date.now());
    return true;
  } catch {
    return false;
  }
}

async function listAllUserStoreAdapterRows(persistence, domain) {
  const rows = [];
  const observedKeys = new Set();
  const observedCursors = new Set();
  let afterKey = "";

  for (let pageIndex = 0; pageIndex < AUTH_STORE_ADAPTER_MAX_PAGES; pageIndex += 1) {
    const page = await persistence.list({
      domain,
      afterKey,
      limit: AUTH_STORE_ADAPTER_PAGE_LIMIT,
    });
    if (!Array.isArray(page)) {
      throw userStoreAdapterInvalid(`adapter list ${domain} must return an array`);
    }
    if (page.length > AUTH_STORE_ADAPTER_PAGE_LIMIT) {
      throw userStoreAdapterInvalid(`adapter list ${domain} exceeded its page limit`);
    }
    if (page.length === 0) return rows;

    let previousKey = afterKey;
    for (const row of page) {
      if (typeof row?.key !== "string" || !row.key.trim()) {
        throw userStoreAdapterInvalid(`adapter list ${domain} returned a row without a key`);
      }
      const key = row.key.trim();
      if (key <= previousKey || observedKeys.has(key)) {
        throw userStoreAdapterInvalid(`adapter list ${domain} pagination did not advance at key ${key}`);
      }
      previousKey = key;
      observedKeys.add(key);
      rows.push(row);
    }

    if (page.length < AUTH_STORE_ADAPTER_PAGE_LIMIT) return rows;
    const nextAfterKey = previousKey;
    if (!nextAfterKey || nextAfterKey <= afterKey || observedCursors.has(nextAfterKey)) {
      throw userStoreAdapterInvalid(`adapter list ${domain} pagination cursor did not advance`);
    }
    observedCursors.add(nextAfterKey);
    afterKey = nextAfterKey;
  }

  throw userStoreAdapterInvalid(`adapter list ${domain} exceeded its pagination safety limit`);
}

async function writeUserStoreToAdapter(persistence, payload) {
  if (!persistence || typeof persistence.put !== "function") {
    return {
      ok: true,
      persistenceStatus: "not_configured",
      persistenceFailureCount: 0,
    };
  }
  const domainEntries = new Map([
    ["auth_users", (payload.users || []).map((user) => ({ key: user.id, value: user }))],
    ["auth_sessions", (payload.authSessions || []).map((session) => ({ key: session.sessionId, value: session }))],
    ["auth_password_reset_tokens", (payload.passwordResetTokens || []).map((token) => ({ key: token.tokenHash, value: token }))],
    ["auth_email_verification_tokens", (payload.emailVerificationTokens || []).map((token) => ({ key: token.tokenHash, value: token }))],
    [AUTH_STORE_META_DOMAIN, [{ key: AUTH_STORE_META_KEY, value: AUTH_STORE_META_VALUE }]],
  ]);
  let failureCount = 0;
  let recordCount = 0;
  for (const [domain, rawEntries] of domainEntries.entries()) {
    const entries = rawEntries.filter((entry) => entry.key);
    const expectedKeys = new Set(entries.map((entry) => entry.key));
    recordCount += entries.length;
    for (const entry of entries) {
      try {
        await persistence.put({ domain, key: entry.key, value: entry.value });
      } catch (err) {
        failureCount += 1;
        console.error(`[user_store] adapter put ${domain}:${entry.key} failed:`, err?.message || err);
      }
    }
    if (typeof persistence.list !== "function" || typeof persistence.delete !== "function") continue;
    try {
      const existing = await listAllUserStoreAdapterRows(persistence, domain);
      for (const row of existing || []) {
        const key = String(row?.key || "").trim();
        if (!key || expectedKeys.has(key)) continue;
        await persistence.delete({ domain, key });
      }
    } catch (err) {
      failureCount += 1;
      console.error(`[user_store] adapter prune ${domain} failed:`, err?.message || err);
    }
  }
  return {
    ok: failureCount === 0,
    persistenceStatus: failureCount === 0 ? "ok" : "failed",
    persistenceFailureCount: failureCount,
    persistenceRecordCount: recordCount,
  };
}

async function loadUserStoreFromAdapter(options = {}) {
  const failOnUnavailable = Boolean(options.failOnUnavailable);
  const failOnUninitialized = Boolean(options.failOnUninitialized);
  const { persistence } = userStoreDeps();
  if (!persistence || typeof persistence.list !== "function") {
    if (failOnUnavailable) {
      const error = new Error("user_store_adapter_unavailable");
      error.code = "USER_STORE_ADAPTER_UNAVAILABLE";
      throw error;
    }
    return false;
  }
  let records;
  try {
    records = await Promise.all([
      listAllUserStoreAdapterRows(persistence, "auth_users"),
      listAllUserStoreAdapterRows(persistence, "auth_sessions"),
      listAllUserStoreAdapterRows(persistence, "auth_password_reset_tokens"),
      listAllUserStoreAdapterRows(persistence, "auth_email_verification_tokens"),
      listAllUserStoreAdapterRows(persistence, AUTH_STORE_META_DOMAIN),
    ]);
  } catch (err) {
    console.error("[user_store] adapter list failed:", err?.message || err);
    if (err?.code === USER_STORE_ADAPTER_INVALID) throw err;
    if (failOnUnavailable) {
      const error = new Error("user_store_adapter_unavailable");
      error.code = "USER_STORE_ADAPTER_UNAVAILABLE";
      error.cause = err;
      throw error;
    }
    return false;
  }
  const [users, sessions, passwordResetTokens, emailVerificationTokens, metadata] = records;
  const canonicalMarker = (metadata || []).find(
    (entry) => entry?.key === AUTH_STORE_META_KEY
  );
  const total = [users, sessions, passwordResetTokens, emailVerificationTokens].reduce(
    (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
    0
  );
  // Only a truly virgin adapter can use the one-time legacy-file backfill, and
  // production must never make that ambiguous choice automatically. Operators
  // publish the marker through the validated exact importer before production
  // starts; local development may retain the one-time legacy-file backfill.
  if (!canonicalMarker && total === 0 && (metadata || []).length === 0) {
    if (failOnUninitialized) {
      const error = new Error("user_store_adapter_uninitialized");
      error.code = "USER_STORE_ADAPTER_UNINITIALIZED";
      throw error;
    }
    return false;
  }
  // Any markerless partial state is structurally invalid and must not make the
  // caller load a stale JSON mirror over canonical rows.
  if (!canonicalMarker) {
    throw userStoreAdapterInvalid("canonical auth marker is missing");
  }
  const markerValue = canonicalMarker.value;
  if (
    !markerValue
    || typeof markerValue !== "object"
    || Array.isArray(markerValue)
    || markerValue.schemaVersion !== AUTH_STORE_META_VALUE.schemaVersion
    || markerValue.initialized !== true
  ) {
    throw userStoreAdapterInvalid("canonical auth marker has an unsupported value or schema version");
  }

  let stagedState;
  try {
    stagedState = buildUserStoreAdapterState({
      users,
      sessions,
      passwordResetTokens,
      emailVerificationTokens,
    });
  } catch (err) {
    if (err?.code === USER_STORE_ADAPTER_INVALID) throw err;
    throw userStoreAdapterInvalid("canonical auth rows could not be validated", err);
  }
  applyUserStoreAdapterState(stagedState);
  cleanupExpiredAuthRecords(Date.now());
  userStoreCanonicalReconciliationRequired = false;
  return true;
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
  const { USER_STORE_PATH, writeJsonFileAtomic, persistence } = userStoreDeps();
  const payload = buildUserStorePayload(now);
  const fileOk = typeof writeJsonFileAtomic === "function"
    ? writeJsonFileAtomic(USER_STORE_PATH, payload, "user_store")
    : true;
  const result = {
    ok: Boolean(fileOk),
    fileOk: Boolean(fileOk),
    persistenceKind: persistence?.kind || "",
    persistenceStatus: "not_configured",
    persistenceFailureCount: 0,
    persistencePromise: null,
  };
  if (persistence?.kind === "postgres" && userStoreCanonicalReconciliationRequired) {
    result.ok = false;
    result.persistenceStatus = "canonical_reconciliation_required";
    result.persistenceFailureCount = 1;
    lastUserStorePersistenceWrite = Promise.resolve({ ...result });
    result.persistencePromise = lastUserStorePersistenceWrite;
    return result;
  }
  if (persistence && typeof persistence.put === "function") {
    result.persistenceStatus = "pending";
    const persistencePromise = lastUserStorePersistenceWrite
      .catch(() => {})
      .then(() => writeUserStoreToAdapter(persistence, payload))
      .then((adapterResult) => {
        result.persistenceStatus = adapterResult.persistenceStatus;
        result.persistenceFailureCount = adapterResult.persistenceFailureCount;
        result.ok = result.fileOk && adapterResult.ok;
        return {
          ...adapterResult,
          fileOk: result.fileOk,
          ok: result.ok,
          persistenceKind: result.persistenceKind,
        };
      })
      .catch((err) => {
        console.error("[user_store] adapter save failed:", err?.message || err);
        result.persistenceStatus = "failed";
        result.persistenceFailureCount += 1;
        result.ok = false;
        return {
          ok: false,
          fileOk: result.fileOk,
          persistenceKind: result.persistenceKind,
          persistenceStatus: "failed",
          persistenceFailureCount: result.persistenceFailureCount,
        };
      });
    lastUserStorePersistenceWrite = persistencePromise;
    result.persistencePromise = persistencePromise;
    void persistencePromise;
  } else {
    lastUserStorePersistenceWrite = Promise.resolve({ ...result });
  }
  return result;
}

function flushUserStorePersistenceWrites() {
  return lastUserStorePersistenceWrite;
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
  const normalized = normalizeAppleSubject(appleSubject);
  return usersByAppleSubject.get(normalized) || null;
}

async function deleteUserById(userId, now = Date.now()) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return { ok: false, deleted: false, reason: "user_id_required" };
  }
  const user = usersById.get(normalizedUserId) || null;
  if (user) {
    usersById.delete(normalizedUserId);
    usersByEmail.delete(user.email);
    if (user.appleSubject) usersByAppleSubject.delete(user.appleSubject);
  }
  let deletedSessions = 0;
  for (const [sessionId, session] of authSessionsById.entries()) {
    if (session.userId !== normalizedUserId) continue;
    authSessionsById.delete(sessionId);
    authSessionIdByTokenHash.delete(String(session.tokenHash || ""));
    deletedSessions += 1;
  }
  let deletedTokens = 0;
  for (const targetMap of [passwordResetTokensByHash, emailVerificationTokensByHash]) {
    for (const [tokenHash, record] of targetMap.entries()) {
      if (record.userId !== normalizedUserId) continue;
      targetMap.delete(tokenHash);
      deletedTokens += 1;
    }
  }
  const saveResult = saveUserStore(now);
  if (saveResult.persistencePromise) {
    const persistenceResult = await flushUserStorePersistenceWrites();
    if (!persistenceResult?.ok) {
      throw new Error("user store persistence deletion failed");
    }
  }
  if (!saveResult.fileOk) {
    throw new Error("user store file deletion failed");
  }
  return {
    ok: true,
    deleted: Boolean(user),
    userId: normalizedUserId,
    deletedSessions,
    deletedTokens,
  };
}

function createUser(input = {}, now = Date.now(), options = {}) {
  const normalizedEmail = normalizeEmail(input.email);
  const appleSubject = normalizeAppleSubject(input.appleSubject);
  if (!normalizedEmail) {
    return { ok: false, status: "email_required", message: "Email is required." };
  }
  if (getUserByEmail(normalizedEmail)) {
    return { ok: false, status: "email_taken", message: "Email already exists." };
  }
  if (appleSubject && getUserByAppleSubject(appleSubject)) {
    return {
      ok: false,
      status: "apple_subject_taken",
      message: "Apple identity already exists.",
    };
  }
  const allowPasswordless = Boolean(options.allowPasswordless);
  const passwordValidation = validateUserPassword(input.password);
  if (!allowPasswordless && !passwordValidation.ok) return passwordValidation;
  const cleanPassword = passwordValidation.ok ? passwordValidation.password : "";
  const record = replaceUserRecord({
    id: "user_" + randomUUID().replace(/-/g, "").slice(0, 16),
    email: normalizedEmail,
    name: sanitizeSnippetLocal(input.name || "", 80),
    authProvider: String(input.authProvider || (appleSubject ? "apple" : "password")).trim() || "password",
    appleSubject,
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
  const appleSubject = normalizeAppleSubject(input.appleSubject);
  const normalizedEmail = normalizeEmail(input.email);
  const emailVerified = normalizeBoolean(input.emailVerified, false);
  const allowExistingEmailLink = Boolean(input.allowExistingEmailLink);
  if (!appleSubject) {
    return { ok: false, status: "apple_subject_required", message: "Apple subject is required." };
  }

  const existingBySubject = getUserByAppleSubject(appleSubject);
  if (existingBySubject) {
    // Later Apple identity tokens commonly omit email. The stable subject is
    // sufficient for an already-linked account; only a verified claim may
    // change its stored email.
    const nextEmail = emailVerified && normalizedEmail
      ? normalizedEmail
      : existingBySubject.email;
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

  if (!normalizedEmail || !emailVerified) {
    return {
      ok: false,
      status: "apple_email_required",
      message: "A verified Apple email claim is required for a new Apple identity.",
    };
  }

  const existingByEmail = getUserByEmail(normalizedEmail);
  if (existingByEmail) {
    if (!allowExistingEmailLink) {
      return { ok: false, status: "email_taken", message: "Email already exists." };
    }
    const linkedAppleSubject = normalizeAppleSubject(existingByEmail.appleSubject);
    if (linkedAppleSubject && linkedAppleSubject !== appleSubject) {
      return {
        ok: false,
        status: "apple_subject_taken",
        message: "Email is already linked to a different Apple identity.",
      };
    }
    const updated = replaceUserRecord({
      ...existingByEmail,
      authProvider: existingByEmail.authProvider || "password",
      appleSubject,
      emailVerified: true,
      emailVerifiedAt: existingByEmail.emailVerifiedAt || now,
      updatedAt: now,
    });
    saveUserStore(now);
    return { ok: true, user: updated };
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

function prepareUserPasswordUpdate(userId, password, now = Date.now()) {
  const existing = getUserById(userId);
  if (!existing) {
    return { ok: false, status: "not_found", message: "Account not found." };
  }
  const passwordValidation = validateUserPassword(password);
  if (!passwordValidation.ok) return passwordValidation;
  const cleanPassword = passwordValidation.password;
  const updated = sanitizeStoredUserRecord({
    ...existing,
    password: createPasswordRecord(cleanPassword),
    updatedAt: now,
  });
  return { ok: true, expectedUser: existing, user: updated };
}

function updateUserPassword(userId, password, now = Date.now()) {
  const prepared = prepareUserPasswordUpdate(userId, password, now);
  if (!prepared.ok) return prepared;
  const updated = replaceUserRecord(prepared.user);
  saveUserStore(now);
  return { ok: true, user: updated };
}

async function completePasswordResetDurably(resetToken, password, now = Date.now()) {
  const { persistence } = userStoreDeps();
  if (persistence?.kind !== "postgres") {
    const consumed = consumePasswordResetToken(resetToken, now);
    if (!consumed) {
      return { status: "invalid_reset_token", user: null, revoked: [], retryable: false };
    }
    const updated = updateUserPassword(consumed.userId, password, now);
    if (!updated.ok) {
      return {
        status: updated.status || "password_reset_failed",
        user: null,
        revoked: [],
        retryable: false,
      };
    }
    invalidateOneTimeTokensForUser(passwordResetTokensByHash, updated.user.id, now);
    const revoked = revokeAllAuthSessionsForUser(updated.user.id, now);
    return {
      status: "snapshot_pending",
      user: updated.user,
      revoked,
      retryable: true,
    };
  }
  if (typeof persistence.completePasswordReset !== "function") {
    return {
      status: "auth_persistence_failed",
      user: null,
      revoked: [],
      retryable: false,
    };
  }

  let pendingPersistence = null;
  try {
    pendingPersistence = await flushUserStorePersistenceWrites();
  } catch {
    // Do not derive exact canonical expectations while an earlier auth write
    // has an unresolved persistence result.
  }
  if (pendingPersistence?.ok !== true) {
    return {
      status: "auth_persistence_failed",
      user: null,
      revoked: [],
      retryable: false,
    };
  }

  const tokenHash = hashOpaqueToken(resetToken);
  const expectedToken = sanitizeOneTimeTokenRecord(passwordResetTokensByHash.get(tokenHash));
  if (
    !expectedToken
    || Number(expectedToken.usedAt || 0) > 0
    || Number(expectedToken.expiresAt || 0) <= now
  ) {
    return { status: "invalid_reset_token", user: null, revoked: [], retryable: false };
  }
  const preparedUser = prepareUserPasswordUpdate(expectedToken.userId, password, now);
  if (!preparedUser.ok || !preparedUser.expectedUser || !preparedUser.user) {
    return {
      status: preparedUser.status || "password_reset_failed",
      user: null,
      revoked: [],
      retryable: false,
    };
  }
  const consumedToken = sanitizeOneTimeTokenRecord({
    ...expectedToken,
    usedAt: now,
  });

  try {
    const result = await persistence.completePasswordReset({
      expectedUser: preparedUser.expectedUser,
      updatedUser: preparedUser.user,
      expectedToken,
      consumedToken,
    });
    if (result?.status !== "committed") {
      return { status: "invalid_reset_token", user: null, revoked: [], retryable: false };
    }
    const canonicalUser = sanitizeStoredUserRecord(result.user);
    const canonicalTokens = (Array.isArray(result.tokens) ? result.tokens : [])
      .map((token) => sanitizeOneTimeTokenRecord(token))
      .filter(Boolean);
    const canonicalTokensByHash = new Map(
      canonicalTokens.map((token) => [token.tokenHash, token]),
    );
    const canonicalSessions = (Array.isArray(result.sessions) ? result.sessions : [])
      .map((session) => sanitizeAuthSessionRecord(session))
      .filter(Boolean);
    const canonicalById = new Map(canonicalSessions.map((session) => [session.sessionId, session]));
    const invalidatedTokenHashes = new Set(
      (Array.isArray(result.invalidatedTokenHashes) ? result.invalidatedTokenHashes : [])
        .map((hash) => String(hash || "").trim())
        .filter(Boolean),
    );
    const revokedSessionIds = new Set(
      (Array.isArray(result.revokedSessionIds) ? result.revokedSessionIds : [])
        .map((sessionId) => String(sessionId || "").trim())
        .filter(Boolean),
    );
    const completeCanonicalResult = canonicalUser
      && JSON.stringify(canonicalUser) === JSON.stringify(preparedUser.user)
      && canonicalTokens.length === canonicalTokensByHash.size
      && canonicalTokensByHash.has(tokenHash)
      && JSON.stringify(canonicalTokensByHash.get(tokenHash)) === JSON.stringify(consumedToken)
      && canonicalTokens.every((token) => (
        token.userId === expectedToken.userId && Number(token.usedAt || 0) > 0
      ))
      && invalidatedTokenHashes.has(tokenHash)
      && [...invalidatedTokenHashes].every((hash) => canonicalTokensByHash.has(hash))
      && canonicalSessions.length === canonicalById.size
      && canonicalSessions.every((session) => (
        session.userId === expectedToken.userId && Number(session.revokedAt || 0) > 0
      ))
      && [...revokedSessionIds].every((sessionId) => canonicalById.has(sessionId));
    if (!completeCanonicalResult) {
      return {
        status: "auth_persistence_failed",
        user: null,
        revoked: [],
        retryable: false,
      };
    }

    const committedUser = replaceUserRecord(canonicalUser);
    for (const token of canonicalTokens) {
      replaceOneTimeTokenRecord(passwordResetTokensByHash, token);
    }
    for (const localToken of [...passwordResetTokensByHash.values()]) {
      if (localToken.userId !== expectedToken.userId) continue;
      const canonical = canonicalTokensByHash.get(localToken.tokenHash);
      if (canonical) {
        replaceOneTimeTokenRecord(passwordResetTokensByHash, canonical);
      } else if (Number(localToken.usedAt || 0) <= 0) {
        replaceOneTimeTokenRecord(passwordResetTokensByHash, {
          ...localToken,
          usedAt: now,
        });
      }
    }
    for (const session of canonicalSessions) replaceAuthSessionRecord(session);
    for (const localSession of [...authSessionsById.values()]) {
      if (localSession.userId !== expectedToken.userId) continue;
      const canonical = canonicalById.get(localSession.sessionId);
      if (canonical) {
        replaceAuthSessionRecord(canonical);
      } else if (Number(localSession.revokedAt || 0) <= 0) {
        replaceAuthSessionRecord({
          ...localSession,
          revokedAt: now,
          updatedAt: now,
        });
      }
    }
    writeLocalUserStoreMirror(now);
    return {
      status: "committed",
      user: committedUser,
      revoked: canonicalSessions.filter((session) => revokedSessionIds.has(session.sessionId)),
      retryable: true,
    };
  } catch (error) {
    if (error?.commitOutcomeUnknown) {
      userStoreCanonicalReconciliationRequired = true;
      for (const localSession of [...authSessionsById.values()]) {
        if (localSession.userId !== expectedToken.userId) continue;
        if (Number(localSession.revokedAt || 0) > 0) continue;
        replaceAuthSessionRecord({
          ...localSession,
          revokedAt: now,
          updatedAt: now,
        });
      }
      // The transaction may have committed. Keep the old local password and
      // reset-token expectations untouched, but deny every pre-reset session
      // until a later canonical hydration or exact-CAS auth mutation safely
      // reconciles the outcome.
      writeLocalUserStoreMirror(now);
      await ensureUserStoreCanonicalReconciled();
    }
    return {
      status: "auth_persistence_failed",
      user: null,
      revoked: [],
      retryable: !error?.rollbackError && !error?.commitOutcomeUnknown,
    };
  }
}

function issueAuthSession(input = {}, now = Date.now()) {
  const userId = normalizeUserId(input.userId);
  if (!userId) return null;
  const prepared = prepareAuthSession({ ...input, userId }, now);
  const session = replaceAuthSessionRecord(prepared.session);
  saveUserStore(now);
  return {
    session,
    refreshToken: prepared.refreshToken,
  };
}

function prepareAuthSession(input = {}, now = Date.now()) {
  const refreshToken = buildOpaqueToken();
  const session = sanitizeAuthSessionRecord({
    sessionId: "sess_" + randomUUID().replace(/-/g, "").slice(0, 16),
    familyId: String(input.familyId || "fam_" + randomUUID().replace(/-/g, "").slice(0, 16)).trim(),
    userId: input.userId,
    tokenHash: hashOpaqueToken(refreshToken),
    createdAt: now,
    updatedAt: now,
    expiresAt: Math.max(now + 1000, Number(input.expiresAt || (now + Math.max(60000, Number(input.ttlMs || 0))))),
    revokedAt: 0,
    replacedBySessionId: "",
    metadata: sanitizeSessionMetadata(input.metadata),
  });
  return {
    session,
    refreshToken,
  };
}

async function issueAuthSessionDurably(input = {}, now = Date.now()) {
  const { persistence } = userStoreDeps();
  if (persistence?.kind !== "postgres") {
    return {
      status: "snapshot_pending",
      issuance: issueAuthSession(input, now),
      retryable: true,
    };
  }
  if (typeof persistence.issueAuthSession !== "function") {
    return {
      status: "auth_persistence_failed",
      issuance: null,
      retryable: false,
    };
  }

  let pendingPersistence = null;
  try {
    pendingPersistence = await flushUserStorePersistenceWrites();
  } catch {
    // Existing-user login must not derive a new canonical row from live state
    // while an earlier auth snapshot has an unresolved persistence failure.
  }
  if (pendingPersistence?.ok !== true) {
    return {
      status: "auth_persistence_failed",
      issuance: null,
      retryable: false,
    };
  }

  const userId = normalizeUserId(input.userId);
  const expectedUser = getUserById(userId);
  if (!userId || !expectedUser) {
    return {
      status: "auth_persistence_failed",
      issuance: null,
      retryable: false,
    };
  }
  const prepared = prepareAuthSession({ ...input, userId }, now);
  if (!prepared.session) {
    return {
      status: "session_issue_failed",
      issuance: null,
      retryable: false,
    };
  }

  try {
    const result = await persistence.issueAuthSession({
      userId,
      expectedUser,
      session: prepared.session,
    });
    if (result?.status !== "committed") {
      return {
        status: "auth_persistence_failed",
        issuance: null,
        retryable: result?.status === "conflict",
      };
    }
  } catch (error) {
    return {
      status: "auth_persistence_failed",
      issuance: null,
      retryable: !error?.rollbackError && !error?.commitOutcomeUnknown,
    };
  }

  const session = replaceAuthSessionRecord(prepared.session);
  writeLocalUserStoreMirror(now);
  return {
    status: "committed",
    issuance: {
      session,
      refreshToken: prepared.refreshToken,
    },
    retryable: true,
  };
}

function getAuthSessionById(sessionId, now = Date.now(), options = {}) {
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

function writeLocalUserStoreMirror(now = Date.now()) {
  const { USER_STORE_PATH, writeJsonFileAtomic } = userStoreDeps();
  const payload = buildUserStorePayload(now, { cleanupExpired: false });
  let fileOk = true;
  try {
    fileOk = typeof writeJsonFileAtomic === "function"
      ? writeJsonFileAtomic(USER_STORE_PATH, payload, "user_store")
      : true;
  } catch {
    fileOk = false;
  }
  if (!fileOk) {
    console.error("[user_store] local auth mirror write failed after canonical auth mutation");
  }
  return Boolean(fileOk);
}

async function revokeAuthSessionsDurably(sessionIds, now = Date.now()) {
  const { persistence } = userStoreDeps();
  const normalizedSessionIds = [...new Set(
    (Array.isArray(sessionIds) ? sessionIds : [sessionIds])
      .map((sessionId) => String(sessionId || "").trim())
      .filter(Boolean),
  )];
  if (persistence?.kind !== "postgres") {
    const revoked = normalizedSessionIds
      .map((sessionId) => revokeAuthSessionById(sessionId, now))
      .filter(Boolean);
    return {
      status: "snapshot_pending",
      revoked,
      retryable: true,
    };
  }
  if (typeof persistence.revokeAuthSessions !== "function") {
    return {
      status: "auth_persistence_failed",
      revoked: [],
      retryable: false,
    };
  }
  let pendingPersistence = null;
  try {
    pendingPersistence = await flushUserStorePersistenceWrites();
  } catch {
    // A prior canonical write must be settled before this mutation can use
    // the in-memory row as its compare-and-swap expectation.
  }
  if (pendingPersistence?.ok !== true) {
    return {
      status: "auth_persistence_failed",
      revoked: [],
      retryable: false,
    };
  }
  const expectedSessions = normalizedSessionIds
    .map((sessionId) => sanitizeAuthSessionRecord(authSessionsById.get(sessionId)))
    .filter(Boolean);
  if (expectedSessions.length !== normalizedSessionIds.length || expectedSessions.length === 0) {
    return { status: "not_found", revoked: [], retryable: false };
  }
  const userId = expectedSessions[0].userId;
  if (expectedSessions.some((session) => session.userId !== userId)) {
    return { status: "conflict", revoked: [], retryable: false };
  }
  const revokedSessions = expectedSessions.map((session) => (
    Number(session.revokedAt || 0) > 0
      ? session
      : sanitizeAuthSessionRecord({
        ...session,
        revokedAt: Math.max(1, Number(now)),
        updatedAt: now,
      })
  ));
  try {
    const result = await persistence.revokeAuthSessions({
      userId,
      expectedSessions,
      revokedSessions,
    });
    if (result?.status !== "committed") {
      const expectedById = new Map(expectedSessions.map((session) => [session.sessionId, session]));
      const reconciledSessions = (Array.isArray(result?.sessions) ? result.sessions : [])
        .map((session) => sanitizeAuthSessionRecord(session))
        .filter((session) => {
          const expected = expectedById.get(session?.sessionId);
          return expected
            && session.userId === userId
            && session.tokenHash === expected.tokenHash
            && Number(session.revokedAt || 0) > 0;
        });
      for (const session of reconciledSessions) replaceAuthSessionRecord(session);
      if (reconciledSessions.length > 0) writeLocalUserStoreMirror(now);
      return { status: "conflict", revoked: [], retryable: false };
    }
    const canonicalSessions = (Array.isArray(result.sessions) ? result.sessions : [])
      .map((session) => sanitizeAuthSessionRecord(session))
      .filter(Boolean);
    const canonicalById = new Map(canonicalSessions.map((session) => [session.sessionId, session]));
    const completeCanonicalResult = expectedSessions.every((expectedSession) => {
      const canonical = canonicalById.get(expectedSession.sessionId);
      return canonical
        && canonical.userId === userId
        && canonical.tokenHash === expectedSession.tokenHash
        && Number(canonical.revokedAt || 0) > 0;
    });
    if (!completeCanonicalResult || canonicalSessions.length !== expectedSessions.length) {
      return {
        status: "auth_persistence_failed",
        revoked: [],
        retryable: false,
      };
    }
    for (const session of canonicalSessions) replaceAuthSessionRecord(session);
    writeLocalUserStoreMirror(now);
    return {
      status: "committed",
      revoked: canonicalSessions,
      retryable: true,
    };
  } catch (error) {
    return {
      status: "auth_persistence_failed",
      revoked: [],
      retryable: !error?.rollbackError && !error?.commitOutcomeUnknown,
    };
  }
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

async function revokeAllAuthSessionsForUserDurably(userId, now = Date.now(), options = {}) {
  if (userStoreDeps().persistence?.kind === "postgres") {
    return runUserStoreMutationExclusive(
      () => revokeAllAuthSessionsForUserDurablyInMutation(userId, now, options),
    );
  }
  return runUserStoreMutationExclusive(async () => {
    const checkpoint = createUserStoreCheckpoint(now);
    const revoked = revokeAllAuthSessionsForUser(userId, now, options);
    let persistenceResult = null;
    try {
      persistenceResult = await flushUserStorePersistenceWrites();
    } catch {
      // The compensating path below restores the checkpoint.
    }
    if (persistenceResult?.ok === true) {
      return {
        ok: true,
        revoked,
        revokedCount: revoked.length,
        retryable: true,
      };
    }

    // Restore the live state immediately, then require compensation to reach
    // durable storage before telling the caller that a retry is safe.
    let rollbackResult = null;
    try {
      restoreUserStoreCheckpoint(checkpoint, Date.now());
      rollbackResult = await flushUserStorePersistenceWrites();
    } catch {
      // Live maps were restored before the compensating write was attempted.
    }
    return {
      ok: false,
      status: "auth_persistence_failed",
      revoked: [],
      revokedCount: 0,
      retryable: rollbackResult?.ok === true,
    };
  });
}

async function revokeAllAuthSessionsForUserDurablyInMutation(userId, now = Date.now(), options = {}) {
  const { persistence } = userStoreDeps();
  if (persistence?.kind !== "postgres") {
    const revoked = revokeAllAuthSessionsForUser(userId, now, options);
    return {
      ok: true,
      status: "snapshot_pending",
      revoked,
      revokedCount: revoked.length,
      retryable: true,
    };
  }
  if (typeof persistence.revokeAuthSessionsForUser !== "function") {
    return {
      ok: false,
      status: "auth_persistence_failed",
      revoked: [],
      revokedCount: 0,
      retryable: false,
    };
  }
  let pendingPersistence = null;
  try {
    pendingPersistence = await flushUserStorePersistenceWrites();
  } catch {
    // Do not derive a canonical mutation from a row that may not have reached
    // the adapter yet.
  }
  if (pendingPersistence?.ok !== true) {
    return {
      ok: false,
      status: "auth_persistence_failed",
      revoked: [],
      revokedCount: 0,
      retryable: false,
    };
  }
  const normalizedUserId = normalizeUserId(userId);
  const exceptSessionId = String(options.exceptSessionId || "").trim();
  try {
    const result = await persistence.revokeAuthSessionsForUser({
      userId: normalizedUserId,
      exceptSessionId,
      revokedAt: now,
    });
    if (result?.status !== "committed") {
      return {
        ok: false,
        status: "auth_persistence_failed",
        revoked: [],
        revokedCount: 0,
        retryable: false,
      };
    }
    const canonicalSessions = (Array.isArray(result.sessions) ? result.sessions : [])
      .map((session) => sanitizeAuthSessionRecord(session))
      .filter(Boolean);
    const revokedSessionIds = new Set(
      (Array.isArray(result.revokedSessionIds) ? result.revokedSessionIds : [])
        .map((sessionId) => String(sessionId || "").trim())
        .filter(Boolean),
    );
    const preservedSession = result.preservedSession
      ? sanitizeAuthSessionRecord(result.preservedSession)
      : null;
    const canonicalById = new Map(canonicalSessions.map((session) => [session.sessionId, session]));
    const completeCanonicalResult = canonicalSessions.length === canonicalById.size
      && canonicalSessions.every((session) => (
        session.userId === normalizedUserId
        && session.sessionId !== exceptSessionId
        && Number(session.revokedAt || 0) > 0
      ))
      && [...revokedSessionIds].every((sessionId) => canonicalById.has(sessionId))
      && (!preservedSession || (
        exceptSessionId
        && preservedSession.sessionId === exceptSessionId
        && preservedSession.userId === normalizedUserId
      ));
    if (!completeCanonicalResult) {
      return {
        ok: false,
        status: "auth_persistence_failed",
        revoked: [],
        revokedCount: 0,
        retryable: false,
      };
    }
    for (const canonicalSession of canonicalSessions) {
      replaceAuthSessionRecord(canonicalSession);
    }
    if (exceptSessionId) {
      const localException = authSessionsById.get(exceptSessionId) || null;
      if (preservedSession) {
        replaceAuthSessionRecord(preservedSession);
      } else if (localException && Number(localException.revokedAt || 0) <= 0) {
        replaceAuthSessionRecord({
          ...localException,
          revokedAt: Math.max(1, Number(now)),
          updatedAt: now,
        });
      }
    }
    for (const localSession of [...authSessionsById.values()]) {
      if (localSession.userId !== normalizedUserId) continue;
      if (exceptSessionId && localSession.sessionId === exceptSessionId) continue;
      const canonical = canonicalById.get(localSession.sessionId);
      if (canonical) {
        replaceAuthSessionRecord(canonical);
      } else if (Number(localSession.revokedAt || 0) <= 0) {
        replaceAuthSessionRecord({
          ...localSession,
          revokedAt: Math.max(1, Number(now)),
          updatedAt: now,
        });
      }
    }
    writeLocalUserStoreMirror(now);
    return {
      ok: true,
      status: "committed",
      revoked: canonicalSessions.filter((session) => revokedSessionIds.has(session.sessionId)),
      revokedCount: revokedSessionIds.size,
      retryable: true,
    };
  } catch (error) {
    return {
      ok: false,
      status: "auth_persistence_failed",
      revoked: [],
      revokedCount: 0,
      retryable: !error?.rollbackError && !error?.commitOutcomeUnknown,
    };
  }
}

function rotateAuthSession(refreshToken, input = {}, now = Date.now()) {
  const current = getAuthSessionByToken(refreshToken, now);
  if (!current) return null;
  const issued = prepareAuthSession({
    userId: current.userId,
    familyId: current.familyId,
    ttlMs: input.ttlMs,
    expiresAt: input.expiresAt,
    metadata: Object.keys(input.metadata && typeof input.metadata === "object" ? input.metadata : {}).length
      ? input.metadata
      : current.metadata,
  }, now);
  if (!issued.session) return null;
  const session = replaceAuthSessionRecord(issued.session);
  const previousSession = replaceAuthSessionRecord({
    ...current,
    revokedAt: now,
    updatedAt: now,
    replacedBySessionId: session.sessionId,
  });
  saveUserStore(now);
  return {
    previousSession,
    session,
    refreshToken: issued.refreshToken,
  };
}

async function rotateAuthSessionDurably(refreshToken, input = {}, now = Date.now()) {
  const { persistence } = userStoreDeps();
  if (persistence?.kind !== "postgres") {
    return {
      status: "snapshot_pending",
      rotation: rotateAuthSession(refreshToken, input, now),
      retryable: true,
    };
  }
  if (typeof persistence.rotateAuthSession !== "function") {
    return {
      status: "auth_persistence_failed",
      rotation: null,
      retryable: false,
    };
  }

  const pendingPersistence = await flushUserStorePersistenceWrites();
  if (pendingPersistence?.ok !== true) {
    return {
      status: "auth_persistence_failed",
      rotation: null,
      retryable: false,
    };
  }
  const current = getAuthSessionByToken(refreshToken, now);
  if (!current || !getUserById(current.userId)) {
    return { status: "invalid_refresh_token", rotation: null, retryable: false };
  }
  const issued = prepareAuthSession({
    userId: current.userId,
    familyId: current.familyId,
    ttlMs: input.ttlMs,
    expiresAt: input.expiresAt,
    metadata: Object.keys(input.metadata && typeof input.metadata === "object" ? input.metadata : {}).length
      ? input.metadata
      : current.metadata,
  }, now);
  if (!issued.session) {
    return { status: "invalid_refresh_token", rotation: null, retryable: false };
  }
  const previousSession = sanitizeAuthSessionRecord({
    ...current,
    revokedAt: now,
    updatedAt: now,
    replacedBySessionId: issued.session.sessionId,
  });

  try {
    const swapped = await persistence.rotateAuthSession({
      expectedSession: current,
      previousSession,
      nextSession: issued.session,
    });
    if (!swapped) {
      return { status: "invalid_refresh_token", rotation: null, retryable: false };
    }
  } catch (error) {
    return {
      status: "auth_persistence_failed",
      rotation: null,
      retryable: !error?.rollbackError && !error?.commitOutcomeUnknown,
    };
  }

  const committedPreviousSession = replaceAuthSessionRecord(previousSession);
  const committedSession = replaceAuthSessionRecord(issued.session);
  writeLocalUserStoreMirror(now);
  return {
    status: "committed",
    rotation: {
      previousSession: committedPreviousSession,
      session: committedSession,
      refreshToken: issued.refreshToken,
    },
    retryable: true,
  };
}

function listAuthSessionsForUser(userId, now = Date.now()) {
  const normalizedUserId = normalizeUserId(userId);
  return [...authSessionsById.values()]
    .filter((session) => session.userId === normalizedUserId)
    .filter((session) => Number(session.expiresAt || 0) <= 0 || Number(session.expiresAt || 0) > now)
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
  const tokenHash = hashOpaqueToken(token);
  const existing = targetMap.get(tokenHash);
  if (!existing) return null;
  if (Number(existing.usedAt || 0) > 0) {
    targetMap.delete(tokenHash);
    saveUserStore(now);
    return null;
  }
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

function invalidateOneTimeTokensForUser(targetMap, userId, now = Date.now()) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return [];
  const invalidated = [];
  for (const record of [...targetMap.values()]) {
    if (record.userId !== normalizedUserId || Number(record.usedAt || 0) > 0) continue;
    const updated = replaceOneTimeTokenRecord(targetMap, {
      ...record,
      usedAt: now,
    });
    if (updated) invalidated.push(updated);
  }
  if (invalidated.length > 0) saveUserStore(now);
  return invalidated;
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
  completePasswordResetDurably,
  consumeEmailVerificationToken,
  consumePasswordResetToken,
  createUserStoreCheckpoint,
  createOrAttachAppleUser,
  createUser,
  deleteUserById,
  emailVerificationTokensByHash,
  flushUserStorePersistenceWrites,
  ensureUserStoreCanonicalReconciled,
  getAuthSessionById,
  getAuthSessionByToken,
  getUserByAppleSubject,
  getUserByEmail,
  getUserById,
  issueAuthSession,
  issueAuthSessionDurably,
  issueEmailVerificationToken,
  issuePasswordResetToken,
  loadUserStoreFromAdapter,
  listAuthSessionsForUser,
  loadUserStore,
  markUserEmailVerified,
  passwordResetTokensByHash,
  revokeAllAuthSessionsForUser,
  revokeAllAuthSessionsForUserDurably,
  revokeAllAuthSessionsForUserDurablyInMutation,
  revokeAuthSessionById,
  revokeAuthSessionByToken,
  revokeAuthSessionsDurably,
  restoreUserStoreCheckpoint,
  rotateAuthSession,
  rotateAuthSessionDurably,
  runUserStoreMutationExclusive,
  saveUserStore,
  usersByAppleSubject,
  usersByEmail,
  usersById,
  updateUserPassword,
  validateUserPassword,
  waitForUserStoreMutations,
};

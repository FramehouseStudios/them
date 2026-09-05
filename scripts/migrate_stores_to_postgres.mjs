#!/usr/bin/env node
//
// Forward migration: read legacy backend/*_store.json files plus the
// optional knowledge_embeddings_cache.json and load them into the
// canonical persistence_* Postgres tables.
//
// Usage:
//   DATABASE_URL=... node scripts/migrate_stores_to_postgres.mjs
//   DATABASE_URL=... node scripts/migrate_stores_to_postgres.mjs --schema-only
//   DATABASE_URL=... node scripts/migrate_stores_to_postgres.mjs --allow-empty-auth
//   DATABASE_URL=... node scripts/migrate_stores_to_postgres.mjs --dry-run
//
// Flags:
//   --schema-only   Apply the persistence/auth schema, no data load.
//   --allow-empty-auth
//                   Authorize an exact empty auth replacement, deleting all
//                   canonical users, sessions, and one-time tokens.
//   --dry-run       Report counts that would be migrated; do not connect or write.
//   --backend DIR   Backend directory (defaults to ./backend).
//
// Data-import mode requires a recognized user_store.json auth snapshot. Empty
// snapshots fail closed unless --allow-empty-auth is explicitly supplied.
//
// The script is idempotent — running it twice on the same data
// produces the same Postgres state.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { createPersistence } from "../backend/lib/persistence_adapter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Operational scripts live at the repository root, but npm dependencies are
// intentionally owned by backend/package.json. Resolve pg from that package
// so a clean checkout (and the documented deploy command) does not depend on
// an accidental repository-root node_modules directory.
const requireFromBackend = createRequire(
  path.resolve(__dirname, "..", "backend", "package.json"),
);

const args = new Set(process.argv.slice(2));
const backendArgIdx = process.argv.indexOf("--backend");
const backendDir = backendArgIdx >= 0
  ? path.resolve(process.argv[backendArgIdx + 1])
  : path.resolve(__dirname, "..", "backend");

const SCHEMA_ONLY = args.has("--schema-only");
const DRY_RUN = args.has("--dry-run");
const ALLOW_EMPTY_AUTH = args.has("--allow-empty-auth");
const PBKDF2_ITERATIONS_MAX = 2_000_000;
const PASSWORD_SALT_MAX_LENGTH = 512;
const PASSWORD_HASH_PATTERN = /^[0-9a-f]{64}$/i;

const PRE_IMPORT_MIGRATIONS = Object.freeze([
  "001_init_persistence.sql",
  "009_auth_persistence.sql",
  "010_auth_identity_uniqueness.sql",
  "013_auth_user_scoped_indexes.sql",
]);
const POST_IMPORT_MIGRATIONS = Object.freeze([
  "011_auth_store_metadata.sql",
]);
const ALL_MIGRATIONS = Object.freeze([
  ...PRE_IMPORT_MIGRATIONS,
  ...POST_IMPORT_MIGRATIONS,
]);

function readJsonFileIfExists(file) {
  if (!fs.existsSync(file)) return null;
  try {
    const text = fs.readFileSync(file, "utf8");
    if (!text.trim()) {
      throw new Error("file is empty");
    }
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`cannot parse ${file}: ${e.message}`);
  }
}

// Mapping: legacy file -> domain -> shape extractor.
// Each extractor returns an iterable of [key, value] pairs.
const SOURCES = [
  {
    file: "outbox_store.json",
    domain: "outbox",
    extract: (data) => {
      if (!data || typeof data !== "object") return [];
      // Legacy outbox stored items keyed by id, possibly under .items.
      const items = Array.isArray(data) ? data
        : Array.isArray(data.items) ? data.items
        : null;
      if (items) {
        return items.map((item) => [String(item?.id ?? item?.key ?? ""), item])
          .filter(([k]) => k.length > 0);
      }
      // Treat as flat key-object map.
      return Object.entries(data);
    },
  },
  {
    file: "user_memory_store.json",
    domain: "user_memory",
    extract: (data) => {
      if (!data || typeof data !== "object") return [];
      // Memory commonly stored under nested maps by-userId / by-ip / by-clientToken.
      const out = [];
      const buckets = ["byUserId", "byClientToken", "byIp"];
      let hadBucket = false;
      for (const bucket of buckets) {
        const map = data[bucket];
        if (!map || typeof map !== "object") continue;
        hadBucket = true;
        for (const [id, value] of Object.entries(map)) {
          out.push([`${bucket}:${id}`, value]);
        }
      }
      if (!hadBucket) {
        return Object.entries(data);
      }
      return out;
    },
  },
  {
    file: "screenplay_store.json",
    domain: "screenplay",
    extract: (data) => {
      if (!data || typeof data !== "object") return [];
      // Screenplays keyed by owner|project; legacy schema is flat object.
      return Object.entries(data);
    },
  },
  {
    file: "knowledge_embeddings_cache.json",
    domain: "knowledge_embeddings",
    extract: (data) => {
      if (!data || typeof data !== "object") return [];
      return Object.entries(data);
    },
  },
  {
    file: "user_store.json",
    domain: "auth_users",
    extract: (data) => {
      const users = Array.isArray(data?.users) ? data.users : [];
      return users.map((user) => [String(user?.id || ""), user]).filter(([key]) => key.length > 0);
    },
  },
  {
    file: "user_store.json",
    domain: "auth_sessions",
    extract: (data) => {
      const sessions = Array.isArray(data?.authSessions)
        ? data.authSessions
        : (Array.isArray(data?.auth_sessions) ? data.auth_sessions : []);
      return sessions.map((session) => [String(session?.sessionId || session?.session_id || ""), session])
        .filter(([key]) => key.length > 0);
    },
  },
  {
    file: "user_store.json",
    domain: "auth_password_reset_tokens",
    extract: (data) => {
      const tokens = Array.isArray(data?.passwordResetTokens)
        ? data.passwordResetTokens
        : (Array.isArray(data?.password_reset_tokens) ? data.password_reset_tokens : []);
      return tokens.map((token) => [String(token?.tokenHash || token?.token_hash || ""), token])
        .filter(([key]) => key.length > 0);
    },
  },
  {
    file: "user_store.json",
    domain: "auth_email_verification_tokens",
    extract: (data) => {
      const tokens = Array.isArray(data?.emailVerificationTokens)
        ? data.emailVerificationTokens
        : (Array.isArray(data?.email_verification_tokens) ? data.email_verification_tokens : []);
      return tokens.map((token) => [String(token?.tokenHash || token?.token_hash || ""), token])
        .filter(([key]) => key.length > 0);
    },
  },
];

const AUTH_TABLE_BY_DOMAIN = Object.freeze({
  auth_users: "persistence_auth_users",
  auth_sessions: "persistence_auth_sessions",
  auth_password_reset_tokens: "persistence_auth_password_reset_tokens",
  auth_email_verification_tokens: "persistence_auth_email_verification_tokens",
});

function requiredAuthArray(payload, camelName, snakeName = "") {
  const hasCamel = Object.prototype.hasOwnProperty.call(payload, camelName);
  const hasSnake = Boolean(snakeName)
    && Object.prototype.hasOwnProperty.call(payload, snakeName);
  if (hasCamel && hasSnake) {
    if (!Array.isArray(payload[camelName]) || !Array.isArray(payload[snakeName])) {
      throw new Error(`user_store.json has conflicting array aliases "${camelName}" and "${snakeName}"`);
    }
    if (!isDeepStrictEqual(payload[camelName], payload[snakeName])) {
      throw new Error(`user_store.json has conflicting array aliases "${camelName}" and "${snakeName}"`);
    }
    return payload[camelName];
  }
  if (hasCamel && Array.isArray(payload[camelName])) return payload[camelName];
  if (hasSnake && Array.isArray(payload[snakeName])) return payload[snakeName];
  const alias = snakeName ? ` or legacy "${snakeName}"` : "";
  throw new Error(`user_store.json must contain a "${camelName}"${alias} array`);
}

function presentAliasedFields(record, fieldNames) {
  return fieldNames.filter((fieldName) => Object.prototype.hasOwnProperty.call(record, fieldName));
}

function normalizeAliasedValue(record, fieldNames, recordLabel, normalizeValue) {
  const presentFields = presentAliasedFields(record, fieldNames);
  if (presentFields.length === 0) return { present: false, value: undefined };
  const values = presentFields.map((fieldName) => normalizeValue(record[fieldName], fieldName));
  if (values.some((value) => !isDeepStrictEqual(value, values[0]))) {
    throw new Error(
      `${recordLabel} has conflicting aliases "${presentFields[0]}" and "${presentFields[1]}"`,
    );
  }
  return { present: true, value: values[0] };
}

function requiredRecordString(record, fieldNames, recordLabel) {
  const normalized = normalizeAliasedValue(record, fieldNames, recordLabel, (rawValue) => {
    if (typeof rawValue !== "string" || !rawValue.trim()) {
      throw new Error(`${recordLabel} must contain nonempty string "${fieldNames[0]}"`);
    }
    return rawValue.trim();
  });
  if (!normalized.present) {
    throw new Error(`${recordLabel} must contain nonempty string "${fieldNames[0]}"`);
  }
  return normalized.value;
}

function requiredRecordKey(record, fieldNames, recordLabel) {
  const key = requiredRecordString(record, fieldNames, recordLabel);
  if (key.length > 512) {
    throw new Error(`${recordLabel} field "${fieldNames[0]}" must be <= 512 characters`);
  }
  return key;
}

function requiredRecordTimestamp(record, fieldNames, recordLabel, { allowZero = false } = {}) {
  const range = allowZero ? "finite nonnegative" : "finite positive";
  const normalized = normalizeAliasedValue(record, fieldNames, recordLabel, (rawValue) => {
    const primitiveNumber = typeof rawValue === "number";
    const primitiveNumericString = typeof rawValue === "string" && rawValue.trim() !== "";
    if (!primitiveNumber && !primitiveNumericString) {
      throw new Error(`${recordLabel} must contain ${range} timestamp "${fieldNames[0]}"`);
    }
    const value = primitiveNumber ? rawValue : Number(rawValue.trim());
    const validRange = allowZero ? value >= 0 : value > 0;
    if (!Number.isFinite(value) || !validRange) {
      throw new Error(`${recordLabel} must contain ${range} timestamp "${fieldNames[0]}"`);
    }
    return value;
  });
  if (!normalized.present) {
    throw new Error(`${recordLabel} must contain ${range} timestamp "${fieldNames[0]}"`);
  }
  return normalized.value;
}

function optionalRecordTimestamp(record, fieldNames, recordLabel, options = {}) {
  if (presentAliasedFields(record, fieldNames).length === 0) return undefined;
  return requiredRecordTimestamp(record, fieldNames, recordLabel, options);
}

function optionalRecordString(record, fieldNames, recordLabel, { allowEmpty = false } = {}) {
  const normalized = normalizeAliasedValue(record, fieldNames, recordLabel, (rawValue) => {
    if (typeof rawValue !== "string") {
      throw new Error(`${recordLabel} field "${fieldNames[0]}" must be a string`);
    }
    const value = rawValue.trim();
    if (!allowEmpty && !value) {
      throw new Error(`${recordLabel} field "${fieldNames[0]}" must be nonempty`);
    }
    return value;
  });
  return normalized.present ? normalized.value : undefined;
}

function optionalRecordBoolean(record, fieldNames, recordLabel) {
  const normalized = normalizeAliasedValue(record, fieldNames, recordLabel, (rawValue) => {
    if (typeof rawValue === "boolean") return rawValue;
    if (typeof rawValue === "number" && (rawValue === 0 || rawValue === 1)) {
      return rawValue === 1;
    }
    if (typeof rawValue === "string") {
      const value = rawValue.trim().toLowerCase();
      if (["1", "true", "yes"].includes(value)) return true;
      if (["0", "false", "no"].includes(value)) return false;
    }
    throw new Error(`${recordLabel} field "${fieldNames[0]}" must be a boolean`);
  });
  return normalized.present ? normalized.value : undefined;
}

function positiveIntegerValue(
  rawValue,
  recordLabel,
  fieldName,
  { max = Number.MAX_SAFE_INTEGER } = {},
) {
  const primitiveNumber = typeof rawValue === "number";
  const primitiveNumericString = typeof rawValue === "string" && rawValue.trim() !== "";
  if (!primitiveNumber && !primitiveNumericString) {
    throw new Error(`${recordLabel} field "${fieldName}" must be a finite positive integer`);
  }
  const value = primitiveNumber ? rawValue : Number(rawValue.trim());
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${recordLabel} field "${fieldName}" must be a finite positive integer`);
  }
  if (value > max) {
    throw new Error(`${recordLabel} field "${fieldName}" must be at most ${max}`);
  }
  return value;
}

function validatePasswordMaterial(password, recordLabel) {
  if (password.salt.length > PASSWORD_SALT_MAX_LENGTH) {
    throw new Error(
      `${recordLabel} field "salt" must be <= ${PASSWORD_SALT_MAX_LENGTH} characters`,
    );
  }
  if (!PASSWORD_HASH_PATTERN.test(password.hash)) {
    throw new Error(`${recordLabel} field "hash" must be a 64-character hexadecimal digest`);
  }
  return password;
}

function normalizePasswordCredential(record, recordLabel) {
  const nestedPresent = Object.prototype.hasOwnProperty.call(record, "password")
    && record.password != null;
  let nestedPassword = null;
  if (nestedPresent) {
    if (typeof record.password !== "object" || Array.isArray(record.password)) {
      throw new Error(`${recordLabel} field "password" must be an object or null`);
    }
    const salt = requiredRecordString(record.password, ["salt"], `${recordLabel}.password`);
    const hash = requiredRecordString(record.password, ["hash"], `${recordLabel}.password`);
    const iterations = positiveIntegerValue(
      record.password.iterations,
      `${recordLabel}.password`,
      "iterations",
      { max: PBKDF2_ITERATIONS_MAX },
    );
    nestedPassword = validatePasswordMaterial(
      { salt, hash, iterations },
      `${recordLabel}.password`,
    );
  }

  const flatFields = [
    "passwordSalt",
    "password_salt",
    "passwordHash",
    "password_hash",
    "passwordIterations",
    "password_iterations",
  ];
  const flatPresent = flatFields.some((fieldName) => Object.prototype.hasOwnProperty.call(record, fieldName));
  let flatPassword = null;
  if (flatPresent) {
    const salt = requiredRecordString(record, ["passwordSalt", "password_salt"], recordLabel);
    const hash = requiredRecordString(record, ["passwordHash", "password_hash"], recordLabel);
    const iterationValue = normalizeAliasedValue(
      record,
      ["passwordIterations", "password_iterations"],
      recordLabel,
      (rawValue, fieldName) => positiveIntegerValue(
        rawValue,
        recordLabel,
        fieldName,
        { max: PBKDF2_ITERATIONS_MAX },
      ),
    );
    if (!iterationValue.present) {
      throw new Error(`${recordLabel} must contain password iteration count "passwordIterations"`);
    }
    flatPassword = validatePasswordMaterial(
      { salt, hash, iterations: iterationValue.value },
      recordLabel,
    );
  }

  if (nestedPassword && flatPassword && !isDeepStrictEqual(nestedPassword, flatPassword)) {
    throw new Error(`${recordLabel} has conflicting nested and flat password credentials`);
  }
  return nestedPassword || flatPassword;
}

function assertUniqueKey(seen, key, label) {
  if (seen.has(key)) {
    throw new Error(`duplicate ${label}: ${key}`);
  }
  seen.add(key);
}

function validateAuthSnapshot(payload, { allowEmptyAuth = false } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("user_store.json must contain an object auth snapshot");
  }

  const rawUsers = requiredAuthArray(payload, "users");
  const rawSessions = requiredAuthArray(payload, "authSessions", "auth_sessions");
  const rawPasswordTokens = requiredAuthArray(
    payload,
    "passwordResetTokens",
    "password_reset_tokens",
  );
  const rawEmailTokens = requiredAuthArray(
    payload,
    "emailVerificationTokens",
    "email_verification_tokens",
  );

  const userIds = new Set();
  const userEmails = new Set();
  const appleSubjects = new Set();
  const sessionIds = new Set();
  const tokenHashes = new Set();

  const users = rawUsers.map((record, index) => {
    const label = `users[${index}]`;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(`${label} must be an object`);
    }
    const id = requiredRecordKey(record, ["id"], label);
    const email = requiredRecordString(record, ["email"], label).toLowerCase();
    assertUniqueKey(userIds, id, "auth user id");
    assertUniqueKey(userEmails, email, "normalized auth email");

    const password = normalizePasswordCredential(record, label);
    const appleSubject = optionalRecordString(
      record,
      ["appleSubject", "apple_subject"],
      label,
      { allowEmpty: true },
    ) || "";
    if (!password && !appleSubject) {
      throw new Error(`${label} must contain a valid password credential or Apple subject`);
    }
    if (appleSubject) {
      assertUniqueKey(appleSubjects, appleSubject, "Apple subject");
    }

    const authProvider = optionalRecordString(
      record,
      ["authProvider", "auth_provider"],
      label,
      { allowEmpty: true },
    );
    const emailVerified = optionalRecordBoolean(
      record,
      ["emailVerified", "email_verified"],
      label,
    );
    const emailVerifiedAt = optionalRecordTimestamp(
      record,
      ["emailVerifiedAt", "email_verified_at"],
      label,
      { allowZero: true },
    );
    const createdAt = optionalRecordTimestamp(
      record,
      ["createdAt", "created_at"],
      label,
      { allowZero: true },
    );
    const updatedAt = optionalRecordTimestamp(
      record,
      ["updatedAt", "updated_at"],
      label,
      { allowZero: true },
    );
    if (
      emailVerified !== undefined
      && emailVerifiedAt !== undefined
      && emailVerified !== (emailVerifiedAt > 0)
    ) {
      throw new Error(`${label} has contradictory email verification metadata`);
    }
    if (emailVerified === true && emailVerifiedAt === undefined) {
      throw new Error(`${label} must contain positive "emailVerifiedAt" when emailVerified is true`);
    }
    const normalizedEmailVerified = emailVerified ?? Boolean(emailVerifiedAt > 0);
    const normalizedEmailVerifiedAt = emailVerifiedAt ?? 0;

    const normalizedRecord = {
      ...record,
      id,
      email,
      password: password || null,
      appleSubject,
      authProvider: authProvider || (appleSubject ? "apple" : "password"),
      emailVerified: normalizedEmailVerified,
      emailVerifiedAt: normalizedEmailVerifiedAt,
    };
    if (createdAt !== undefined) normalizedRecord.createdAt = createdAt;
    if (updatedAt !== undefined) normalizedRecord.updatedAt = updatedAt;
    for (const alias of [
      "auth_provider",
      "apple_subject",
      "email_verified",
      "email_verified_at",
      "created_at",
      "updated_at",
      "passwordSalt",
      "password_salt",
      "passwordHash",
      "password_hash",
      "passwordIterations",
      "password_iterations",
    ]) {
      delete normalizedRecord[alias];
    }
    return normalizedRecord;
  });

  const authSessions = rawSessions.map((record, index) => {
    const label = `authSessions[${index}]`;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(`${label} must be an object`);
    }
    const sessionId = requiredRecordKey(record, ["sessionId", "session_id"], label);
    const familyId = requiredRecordString(record, ["familyId", "family_id"], label);
    const userId = requiredRecordString(record, ["userId", "user_id"], label);
    const tokenHash = requiredRecordKey(record, ["tokenHash", "token_hash"], label);
    const expiresAt = requiredRecordTimestamp(record, ["expiresAt", "expires_at"], label);
    const revokedAt = requiredRecordTimestamp(
      record,
      ["revokedAt", "revoked_at"],
      label,
      { allowZero: true },
    );
    assertUniqueKey(sessionIds, sessionId, "auth session id");
    assertUniqueKey(tokenHashes, tokenHash, "auth token hash");
    if (!userIds.has(userId)) {
      throw new Error(`${label} references unknown imported user: ${userId}`);
    }
    return { ...record, sessionId, familyId, userId, tokenHash, expiresAt, revokedAt };
  });

  function normalizeOneTimeTokens(records, arrayName) {
    return records.map((record, index) => {
      const label = `${arrayName}[${index}]`;
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        throw new Error(`${label} must be an object`);
      }
      const tokenHash = requiredRecordKey(record, ["tokenHash", "token_hash"], label);
      const userId = requiredRecordString(record, ["userId", "user_id"], label);
      const expiresAt = requiredRecordTimestamp(record, ["expiresAt", "expires_at"], label);
      const usedAt = requiredRecordTimestamp(
        record,
        ["usedAt", "used_at"],
        label,
        { allowZero: true },
      );
      assertUniqueKey(tokenHashes, tokenHash, "auth token hash");
      if (!userIds.has(userId)) {
        throw new Error(`${label} references unknown imported user: ${userId}`);
      }
      return { ...record, tokenHash, userId, expiresAt, usedAt };
    });
  }

  const passwordResetTokens = normalizeOneTimeTokens(rawPasswordTokens, "passwordResetTokens");
  const emailVerificationTokens = normalizeOneTimeTokens(
    rawEmailTokens,
    "emailVerificationTokens",
  );

  if (users.length === 0 && !allowEmptyAuth) {
    throw new Error(
      "user_store.json contains no users; use --allow-empty-auth for an intentional exact empty replacement",
    );
  }

  return {
    ...payload,
    users,
    authSessions,
    passwordResetTokens,
    emailVerificationTokens,
  };
}

function migrationSql(name) {
  const sqlPath = path.resolve(__dirname, "..", "backend", "migrations", name);
  return { sqlPath, sql: fs.readFileSync(sqlPath, "utf8") };
}

function withoutOuterTransaction(sql, name) {
  const withoutBegin = sql.replace(/(^|\n)\s*BEGIN;\s*(?=\n)/i, "$1");
  const withoutCommit = withoutBegin.replace(/(^|\n)\s*COMMIT;\s*$/i, "$1");
  if (withoutBegin === sql || withoutCommit === withoutBegin) {
    throw new Error(`migration ${name} must contain one outer BEGIN/COMMIT wrapper`);
  }
  return withoutCommit;
}

async function createPgPool(databaseUrl) {
  const { Pool } = loadPgModule();
  return new Pool({ connectionString: databaseUrl });
}

function loadPgModule() {
  const pg = requireFromBackend("pg");
  return pg.default ?? pg;
}

function collectSourceRecords({
  backendDirectory,
  logger = console,
  allowEmptyAuth = false,
}) {
  const parsedFiles = new Map();
  const records = [];
  const authFile = path.join(backendDirectory, "user_store.json");
  const authPayload = readJsonFileIfExists(authFile);
  if (authPayload == null) {
    throw new Error(`required auth snapshot is missing: ${authFile}`);
  }
  const normalizedAuth = validateAuthSnapshot(authPayload, { allowEmptyAuth });
  parsedFiles.set(authFile, normalizedAuth);
  if (normalizedAuth.users.length === 0) {
    logger.log(
      "WARNING: --allow-empty-auth authorizes an exact empty replacement; "
      + "a live run will clear all canonical auth users, sessions, and tokens.",
    );
  }

  for (const source of SOURCES) {
    const file = path.join(backendDirectory, source.file);
    if (!parsedFiles.has(file)) {
      parsedFiles.set(file, readJsonFileIfExists(file));
    }
    const data = parsedFiles.get(file);
    if (data == null) {
      logger.log(`-  ${source.file} not present; skipping domain "${source.domain}"`);
      continue;
    }
    const pairs = Array.from(source.extract(data));
    logger.log(`-> ${source.file} -> domain "${source.domain}": ${pairs.length} record(s)`);
    for (const [key, value] of pairs) {
      records.push({ domain: source.domain, key, value });
    }
  }
  return records;
}

async function importAuthRecordsAtomically({
  databaseUrl,
  records,
  poolFactory = createPgPool,
  logger = console,
}) {
  const pool = await poolFactory(databaseUrl);
  let client = null;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const markerMigration = POST_IMPORT_MIGRATIONS[0];
    const { sqlPath, sql } = migrationSql(markerMigration);
    await client.query(withoutOuterTransaction(sql, markerMigration));

    let existingMarker = null;
    try {
      const markerResult = await client.query(
        `SELECT value
           FROM persistence_auth_store_meta
          WHERE key = $1
          FOR UPDATE`,
        ["canonical_state"],
      );
      existingMarker = markerResult?.rows?.[0]?.value ?? null;
    } catch (e) {
      throw new Error(`read canonical auth marker failed: ${e.message}`);
    }
    if (
      existingMarker != null
      && (
        typeof existingMarker !== "object"
        || Array.isArray(existingMarker)
        || existingMarker.schemaVersion !== 1
        || existingMarker.initialized !== true
      )
    ) {
      throw new Error(
        "canonical auth marker is incompatible; refusing to run the schemaVersion 1 importer",
      );
    }

    // The legacy file is a complete auth snapshot, not an additive patch.
    // Clearing and rebuilding all four domains in the same transaction keeps
    // stale users, sessions, and tokens from surviving a successful import.
    for (const [domain, table] of Object.entries(AUTH_TABLE_BY_DOMAIN)) {
      try {
        await client.query(`DELETE FROM ${table}`);
      } catch (e) {
        throw new Error(`clear ${domain} failed: ${e.message}`);
      }
    }

    for (const { domain, key, value } of records) {
      const table = AUTH_TABLE_BY_DOMAIN[domain];
      if (!table) {
        throw new Error(`cannot import non-auth domain in auth transaction: ${domain}`);
      }
      try {
        await client.query(
          `INSERT INTO ${table} (key, value, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (key)
           DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [key, JSON.stringify(value)],
        );
      } catch (e) {
        throw new Error(`put ${domain}:${key} failed: ${e.message}`);
      }
    }

    try {
      await client.query(
        `INSERT INTO persistence_auth_store_meta (key, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key)
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        ["canonical_state", JSON.stringify({ schemaVersion: 1, initialized: true })],
      );
    } catch (e) {
      throw new Error(`publish canonical auth marker failed: ${e.message}`);
    }
    await client.query("COMMIT");
    transactionStarted = false;
    logger.log("schema applied atomically with auth import:", sqlPath);
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        error.message = `${error.message}; rollback failed: ${rollbackError.message}`;
      }
    }
    throw error;
  } finally {
    if (client && typeof client.release === "function") {
      client.release();
    }
    await pool.end();
  }
}

async function applySchema({
  databaseUrl = process.env.DATABASE_URL || "",
  migrationNames = ALL_MIGRATIONS,
  logger = console,
} = {}) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to apply schema");
  }
  const { Pool } = loadPgModule();
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    for (const name of migrationNames) {
      const { sqlPath, sql } = migrationSql(name);
      await pool.query(sql);
      logger.log("schema applied:", sqlPath);
    }
  } finally {
    await pool.end();
  }
}

async function runMigration({
  databaseUrl = process.env.DATABASE_URL || "",
  backendDirectory = backendDir,
  schemaOnly = SCHEMA_ONLY,
  dryRun = DRY_RUN,
  allowEmptyAuth = ALLOW_EMPTY_AUTH,
  applySchemaFn = applySchema,
  createPersistenceFn = createPersistence,
  importAuthRecordsFn = importAuthRecordsAtomically,
  logger = console,
} = {}) {
  if (schemaOnly && allowEmptyAuth) {
    const error = new Error("--schema-only and --allow-empty-auth are mutually exclusive");
    error.exitCode = 2;
    throw error;
  }
  if (!databaseUrl && !dryRun) {
    const error = new Error("DATABASE_URL is not set");
    error.exitCode = 2;
    throw error;
  }

  if (schemaOnly) {
    if (dryRun) {
      for (const name of ALL_MIGRATIONS) {
        logger.log(`would apply schema migration: ${name}`);
      }
      return { totalMigrated: 0, dryRun: true, schemaOnly: true };
    }
    await applySchemaFn({ databaseUrl, migrationNames: ALL_MIGRATIONS, logger });
    return { totalMigrated: 0, dryRun: false, schemaOnly: true };
  }

  // Parse every source before making the first database change. In particular,
  // a truncated user_store.json must not publish an authoritative empty marker.
  const records = collectSourceRecords({ backendDirectory, logger, allowEmptyAuth });
  if (dryRun) {
    logger.log(`done. would migrate ${records.length} record(s).`);
    return { totalMigrated: records.length, dryRun: true, schemaOnly: false };
  }

  await applySchemaFn({
    databaseUrl,
    migrationNames: PRE_IMPORT_MIGRATIONS,
    logger,
  });

  const authRecords = records.filter(({ domain }) => AUTH_TABLE_BY_DOMAIN[domain]);
  const nonAuthRecords = records.filter(({ domain }) => !AUTH_TABLE_BY_DOMAIN[domain]);

  const persistence = createPersistenceFn({ databaseUrl });
  if (persistence.kind !== "postgres") {
    throw new Error(`expected postgres adapter, got ${persistence.kind}`);
  }
  try {
    for (const { domain, key, value } of nonAuthRecords) {
      try {
        await persistence.put({ domain, key, value });
      } catch (e) {
        throw new Error(`put ${domain}:${key} failed: ${e.message}`);
      }
    }
  } finally {
    await persistence.close();
  }

  // Auth rows and the canonical-state marker are one commit. No partial auth
  // import is observable, and any upsert or marker failure rolls everything
  // in this phase back before the CLI returns a non-zero exit status.
  await importAuthRecordsFn({ databaseUrl, records: authRecords, logger });

  logger.log(`done. migrated ${records.length} record(s).`);
  return { totalMigrated: records.length, dryRun: false, schemaOnly: false };
}

async function main() {
  return runMigration();
}

async function runCli({ runMigrationFn = main, logger = console } = {}) {
  try {
    await runMigrationFn();
    return 0;
  } catch (e) {
    logger.error("migration failed:", e?.stack || e?.message || e);
    return Number.isInteger(e?.exitCode) ? e.exitCode : 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

export {
  ALL_MIGRATIONS,
  POST_IMPORT_MIGRATIONS,
  PRE_IMPORT_MIGRATIONS,
  SOURCES,
  applySchema,
  collectSourceRecords,
  importAuthRecordsAtomically,
  loadPgModule,
  readJsonFileIfExists,
  runCli,
  runMigration,
  validateAuthSnapshot,
  withoutOuterTransaction,
};

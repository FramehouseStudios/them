import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseBool, parsePositiveInt, resolveStorePath } from "./lib/utils.js";

const MAX_FILE_MB = 25;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

const PORT = process.env.PORT || 3000;
// Provider-backed routes accept an empty key in local development and return
// their documented 503 envelopes at request time. Keep the exported config
// value string-typed even when the variable is absent so route mount guards do
// not turn an optional local provider into a process-wide startup failure.
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "");
const APP_TOKEN = process.env.APP_TOKEN || "";
const NODE_ENV = process.env.NODE_ENV || "development";
const CORS_ALLOW_ORIGIN = String(process.env.CORS_ALLOW_ORIGIN || "").trim();
const API_SCHEMA_VERSION = parsePositiveInt(process.env.API_SCHEMA_VERSION, 1);
const BACKEND_BUILD = String(process.env.BACKEND_BUILD || "dev").trim() || "dev";
const BACKEND_BOOT_ID = String(
  process.env.BACKEND_BOOT_ID || (Date.now().toString(36) + "-" + randomUUID().slice(0, 8))
);
const DEFAULT_ASSISTANT_SELF_NAME = "CLEMENTINE";
const USER_STORE_PATH = resolveStorePath(
  "user_store.json",
  process.env.USER_STORE_PATH || process.env.USERS_STORE_PATH
);
const JWT_SECRET = String(process.env.JWT_SECRET || "").trim();
const JWT_TTL_SECONDS = parsePositiveInt(process.env.JWT_TTL_SECONDS, 60 * 60 * 24 * 14);
const AUTH_REFRESH_TTL_SECONDS = parsePositiveInt(
  process.env.AUTH_REFRESH_TTL_SECONDS,
  60 * 60 * 24 * 30
);
const AUTH_PASSWORD_RESET_TTL_SECONDS = parsePositiveInt(
  process.env.AUTH_PASSWORD_RESET_TTL_SECONDS,
  60 * 60
);
const AUTH_EMAIL_VERIFICATION_TTL_SECONDS = parsePositiveInt(
  process.env.AUTH_EMAIL_VERIFICATION_TTL_SECONDS,
  24 * 60 * 60
);
const AUTH_REQUIRE_EMAIL_VERIFIED = parseBool(process.env.AUTH_REQUIRE_EMAIL_VERIFIED);
const AUTH_AUTO_VERIFY_EMAILS = parseBool(process.env.AUTH_AUTO_VERIFY_EMAILS);
const AUTH_APPLE_AUDIENCE = String(process.env.AUTH_APPLE_AUDIENCE || "").trim();
const AUTH_APPLE_TEST_JWT_SECRET = String(process.env.AUTH_APPLE_TEST_JWT_SECRET || "").trim();
const AUTH_APPLE_JWT_PUBLIC_KEY = String(process.env.AUTH_APPLE_JWT_PUBLIC_KEY || "").trim();
const REQUIRE_USER_AUTH = parseBool(process.env.REQUIRE_USER_AUTH);
const UNIFIED_PERSONA_PRESET = "clementine";
const CLEMENTINE_EMPTY_TRANSCRIPT_PROMPT_DEFAULT = "I missed that. Say it one more time.";
const CURRENT_FILE_PATH = fileURLToPath(import.meta.url);
const CURRENT_DIR_PATH = path.dirname(CURRENT_FILE_PATH);

const REQUIRE_APP_TOKEN =
  NODE_ENV === "production" || parseBool(process.env.REQUIRE_APP_TOKEN);
const REQUIRE_CLIENT_TOKEN =
  NODE_ENV === "production" || parseBool(process.env.REQUIRE_CLIENT_TOKEN);

const SHOULD_START_SERVER = process.env.RUN_SERVER == null
  ? true
  : parseBool(process.env.RUN_SERVER);

// Structured request logging (T-backend-structured-logs). JSON by default in
// production (for log aggregators); human-readable text in dev. LOG_LEVEL
// gates request-log verbosity: error | warn | info | debug.
const LOG_FORMAT = String(
  process.env.LOG_FORMAT || (NODE_ENV === "production" ? "json" : "text")
).trim().toLowerCase();
const LOG_LEVEL = String(process.env.LOG_LEVEL || "info").trim().toLowerCase();
export {
  API_SCHEMA_VERSION,
  APP_TOKEN,
  AUTH_APPLE_AUDIENCE,
  AUTH_APPLE_JWT_PUBLIC_KEY,
  AUTH_APPLE_TEST_JWT_SECRET,
  AUTH_AUTO_VERIFY_EMAILS,
  AUTH_EMAIL_VERIFICATION_TTL_SECONDS,
  AUTH_PASSWORD_RESET_TTL_SECONDS,
  AUTH_REFRESH_TTL_SECONDS,
  AUTH_REQUIRE_EMAIL_VERIFIED,
  BACKEND_BOOT_ID,
  BACKEND_BUILD,
  CLEMENTINE_EMPTY_TRANSCRIPT_PROMPT_DEFAULT,
  CORS_ALLOW_ORIGIN,
  CURRENT_DIR_PATH,
  CURRENT_FILE_PATH,
  DEFAULT_ASSISTANT_SELF_NAME,
  JWT_SECRET,
  JWT_TTL_SECONDS,
  LOG_FORMAT,
  LOG_LEVEL,
  MAX_FILE_BYTES,
  MAX_FILE_MB,
  NODE_ENV,
  OPENAI_API_KEY,
  PORT,
  REQUIRE_APP_TOKEN,
  REQUIRE_CLIENT_TOKEN,
  REQUIRE_USER_AUTH,
  SHOULD_START_SERVER,
  UNIFIED_PERSONA_PRESET,
  USER_STORE_PATH,
};

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseBool, parsePositiveInt, resolveStorePath } from "./lib/utils.js";

const MAX_FILE_MB = 25;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
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
const REQUIRE_USER_AUTH = NODE_ENV === "production" || parseBool(process.env.REQUIRE_USER_AUTH);
const STUDIO_RENDER_TEST_REPLY = NODE_ENV === "production"
  ? ""
  : String(process.env.STUDIO_RENDER_TEST_REPLY || "").trim();
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

// Production startup guard. Throws a clear, multi-line error listing every
// missing required environment variable. Callable from app/index startup or
// from tests with a process-like env arg. Returns nothing on success.
function assertProductionEnv(env = process.env) {
  if ((env.NODE_ENV || "") !== "production") return;
  const missing = [];
  if (!String(env.DATABASE_URL || "").trim()) {
    missing.push("DATABASE_URL — production must run against Postgres, not the JSON adapter.");
  }
  if (!String(env.JWT_SECRET || "").trim()) {
    missing.push("JWT_SECRET — required to sign auth tokens.");
  }
  if (!String(env.OPENAI_API_KEY || "").trim()) {
    missing.push("OPENAI_API_KEY — required for talk and realtime suppliers.");
  }
  if (!String(env.APP_TOKEN || "").trim()) {
    missing.push("APP_TOKEN — required when NODE_ENV=production (X-APP-TOKEN gate).");
  }
  if (String(env.REQUIRE_USER_AUTH || "").trim().toLowerCase() === "0"
    || String(env.REQUIRE_USER_AUTH || "").trim().toLowerCase() === "false"
    || String(env.REQUIRE_USER_AUTH || "").trim().toLowerCase() === "no") {
    missing.push("REQUIRE_USER_AUTH — production must not disable authenticated user routes.");
  }
  if (missing.length === 0) return;
  const banner = "Refusing to boot: required production environment variables are missing.";
  const detail = missing.map((line) => "  - " + line).join("\n");
  throw new Error(banner + "\n" + detail);
}

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
  assertProductionEnv,
  BACKEND_BOOT_ID,
  BACKEND_BUILD,
  CLEMENTINE_EMPTY_TRANSCRIPT_PROMPT_DEFAULT,
  CORS_ALLOW_ORIGIN,
  CURRENT_DIR_PATH,
  CURRENT_FILE_PATH,
  DEFAULT_ASSISTANT_SELF_NAME,
  JWT_SECRET,
  JWT_TTL_SECONDS,
  MAX_FILE_BYTES,
  MAX_FILE_MB,
  NODE_ENV,
  OPENAI_API_KEY,
  PORT,
  REQUIRE_APP_TOKEN,
  REQUIRE_CLIENT_TOKEN,
  REQUIRE_USER_AUTH,
  SHOULD_START_SERVER,
  STUDIO_RENDER_TEST_REPLY,
  UNIFIED_PERSONA_PRESET,
  USER_STORE_PATH,
};

import process from "node:process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const requireFromBackend = createRequire(path.resolve(__dirname, "..", "package.json"));

const CONFIRMATION_ENV = "AUTH_STORE_EMPTY_INIT_CONFIRMATION";
const EMPTY_AUTH_CONFIRMATION = "initialize-empty-canonical-auth-store-v1";
const AUTH_MARKER_VALUE = Object.freeze({ schemaVersion: 1, initialized: true });
const AUTH_TABLES = Object.freeze([
  "persistence_auth_users",
  "persistence_auth_sessions",
  "persistence_auth_password_reset_tokens",
  "persistence_auth_email_verification_tokens",
]);

async function loadPgClient(databaseUrl) {
  const pgModule = requireFromBackend("pg");
  const { Client } = pgModule.default ?? pgModule;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

function markerIsCompatible(value) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && value.schemaVersion === AUTH_MARKER_VALUE.schemaVersion
    && value.initialized === true,
  );
}

async function initializeEmptyAuthStore({
  databaseUrl = process.env.DATABASE_URL || "",
  confirmation = process.env[CONFIRMATION_ENV] || "",
  clientFactory = loadPgClient,
  logger = console,
} = {}) {
  if (!databaseUrl) {
    const error = new Error("DATABASE_URL is required");
    error.exitCode = 2;
    throw error;
  }

  const client = await clientFactory(databaseUrl);
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    // These brief locks make the marker decision and publication a single
    // consistent operation. The initializer never alters an auth row.
    await client.query(
      `LOCK TABLE persistence_auth_store_meta, ${AUTH_TABLES.join(", ")}
       IN SHARE ROW EXCLUSIVE MODE`,
    );
    const markerResult = await client.query(
      `SELECT value
         FROM persistence_auth_store_meta
        WHERE key = $1
        FOR UPDATE`,
      ["canonical_state"],
    );
    const marker = markerResult?.rows?.[0]?.value ?? null;
    if (marker != null) {
      if (!markerIsCompatible(marker)) {
        throw new Error(
          "canonical auth marker has an unsupported value or schema version; refusing predeploy initialization",
        );
      }
      await client.query("COMMIT");
      transactionStarted = false;
      logger.log("canonical auth store already initialized; no change required");
      return { initialized: false, alreadyInitialized: true };
    }

    const rowsResult = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM persistence_auth_users
         UNION ALL SELECT 1 FROM persistence_auth_sessions
         UNION ALL SELECT 1 FROM persistence_auth_password_reset_tokens
         UNION ALL SELECT 1 FROM persistence_auth_email_verification_tokens
       ) AS has_auth_rows`,
    );
    if (rowsResult?.rows?.[0]?.has_auth_rows === true) {
      throw new Error(
        "canonical auth marker is missing from a nonempty auth store; refusing to guess or overwrite state",
      );
    }
    if (confirmation !== EMPTY_AUTH_CONFIRMATION) {
      const error = new Error(
        `empty auth store is uninitialized; set one-time confirmation ${CONFIRMATION_ENV}=`
        + EMPTY_AUTH_CONFIRMATION,
      );
      error.exitCode = 4;
      throw error;
    }

    await client.query(
      `INSERT INTO persistence_auth_store_meta (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())`,
      ["canonical_state", JSON.stringify(AUTH_MARKER_VALUE)],
    );
    await client.query("COMMIT");
    transactionStarted = false;
    logger.log("initialized intentionally empty canonical auth store");
    return { initialized: true, alreadyInitialized: false };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        error.message = `${error.message}; rollback failed: ${rollbackError.message}`;
      }
    }
    throw error;
  } finally {
    await client.end();
  }
}

async function runCli({ logger = console } = {}) {
  try {
    await initializeEmptyAuthStore({ logger });
    return 0;
  } catch (error) {
    logger.error(error?.stack || error?.message || error);
    return Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

export {
  AUTH_TABLES,
  AUTH_MARKER_VALUE,
  CONFIRMATION_ENV,
  EMPTY_AUTH_CONFIRMATION,
  initializeEmptyAuthStore,
  markerIsCompatible,
  runCli,
};

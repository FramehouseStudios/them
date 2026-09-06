# Phase 2: Boot Verification, Postgres, and Auth Wiring

## Current state

The backend has been partially refactored. Here is what exists and what is missing:

**Exists:**
- `backend/app.js` — Express app with middleware applied via `applyAppMiddleware()`
- `backend/config.js` — All env constants including `JWT_SECRET`
- `backend/lib/user_store.js` — JSON-backed user store with `createUser()`, `authenticateUser()`, `getUserById()`, PBKDF2 password hashing. Uses in-memory Maps + flat file persistence via `saveUserStore()`. The store is configured via `configureUserStore(deps)` but **is never called** during startup.
- `backend/lib/memory_store.js`, `screenplay_store.js`, `outbox_store.js` — JSON-backed stores, modularized
- `backend/lib/persona.js`, `talk_pipeline.js`, `utils.js` — Business logic modules
- `backend/lib/scale_backplane.mjs` — Already exists at this path
- `backend/middleware/auth.js` — Has `appTokenMiddleware`, `corsMiddleware`, `requestLoggerMiddleware`. **Does NOT have** `requireUser` middleware or any JWT functions.
- `backend/index.js` — Imports everything and registers all routes inline. Routes are still registered directly on `app` inside `index.js`. **No `/auth/signup` or `/auth/login` routes exist anywhere.** `JWT_SECRET` is imported from config but never used.

**Missing / incomplete:**
- JWT sign/verify functions (nowhere in codebase)
- `/auth/signup` and `/auth/login` routes (not registered)
- `requireUser` middleware (not implemented)
- `configureUserStore()` is never called during startup — user store is unconfigured
- Server has never been successfully boot-tested after the refactor
- Postgres is not wired (still using JSON files for all storage)

---

## Task 1: Fix boot and verify the server starts cleanly

Before any new features, confirm the server starts without errors.

### Step 1a — Find and fix any import errors

Run:
```bash
cd backend
node --check index.js
node --check app.js
node --check middleware/auth.js
node --check lib/user_store.js
node --check lib/memory_store.js
node --check lib/screenplay_store.js
node --check lib/outbox_store.js
node --check lib/persona.js
node --check lib/talk_pipeline.js
```

Fix any syntax errors or unresolved import paths before proceeding.

### Step 1b — Wire `configureUserStore()` in startup

In `index.js`, find where `configureMemoryStore()`, `configureOutboxStore()`, and `configureScreenplayStore()` are called during startup. Add `configureUserStore()` in the same place:

```js
import { configureUserStore, loadUserStore } from "./lib/user_store.js";

// In startup, alongside the other store configure calls:
configureUserStore({
  USER_STORE_PATH: resolveStorePath("user_store.json", process.env.USER_STORE_PATH),
  fs,
  writeJsonFileAtomic,
  normalizeSnippet,
});
loadUserStore();
```

### Step 1c — Boot test

```bash
cd backend
node index.js &
sleep 2
curl -s http://localhost:3000/health
# Expected: { "ok": true, ... }
kill %1
```

Do not proceed to Task 2 until `GET /health` returns `ok: true` with no startup errors in the console.

---

## Task 2: Implement JWT and wire `/auth/signup` + `/auth/login`

### Step 2a — Add JWT functions to `middleware/auth.js`

Add these functions using only `node:crypto` (no new npm dependencies):

```js
import { createHmac, randomBytes } from "node:crypto";
import { JWT_SECRET } from "../config.js";

const JWT_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(JSON.stringify(input));
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signJwt(payload) {
  const secret = JWT_SECRET || randomBytes(32).toString("hex");
  const header = base64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64url(Buffer.from(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + JWT_EXPIRY_SECONDS,
  })));
  const sig = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${header}.${body}.${sig}`;
}

function verifyJwt(token) {
  try {
    const secret = JWT_SECRET || "";
    if (!secret) return null;
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = createHmac("sha256", secret)
      .update(`${header}.${body}`)
      .digest("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (expected !== sig) return null;
    const payload = JSON.parse(Buffer.from(body, "base64").toString("utf8"));
    if (!payload.exp || Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function requireUser(req, res, next) {
  const authHeader = String(req.headers["authorization"] || "");
  const userToken = String(req.headers["x-user-token"] || "");
  const raw = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : userToken;
  if (!raw) return res.status(401).json({ stage: "user_auth", error: "Authentication required." });
  const payload = verifyJwt(raw);
  if (!payload || !payload.userId) {
    return res.status(401).json({ stage: "user_auth", error: "Invalid or expired token." });
  }
  req.userId = payload.userId;
  next();
}

function optionalUser(req, res, next) {
  const authHeader = String(req.headers["authorization"] || "");
  const userToken = String(req.headers["x-user-token"] || "");
  const raw = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : userToken;
  if (raw) {
    const payload = verifyJwt(raw);
    if (payload?.userId) req.userId = payload.userId;
  }
  next();
}
```

Export `signJwt`, `verifyJwt`, `requireUser`, and `optionalUser` from `middleware/auth.js`.

### Step 2b — Add auth routes directly in `index.js`

Add these two routes to `index.js` after the existing middleware setup, before the other routes. They must be exempt from `requireUser` (they are the entry point for getting a token):

```js
import { signJwt, requireUser } from "./middleware/auth.js";
import { createUser, authenticateUser } from "./lib/user_store.js";

// POST /auth/signup
app.post("/auth/signup", express.json({ limit: "256kb" }), (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: "Email and password are required." });
  }
  const result = createUser({ email, password, name });
  if (!result.ok) {
    return res.status(409).json({ ok: false, error: result.message, status: result.status });
  }
  const token = signJwt({ userId: result.user.id, email: result.user.email });
  return res.status(201).json({
    ok: true,
    token,
    user: { id: result.user.id, email: result.user.email, name: result.user.name },
  });
});

// POST /auth/login
app.post("/auth/login", express.json({ limit: "256kb" }), (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: "Email and password are required." });
  }
  const result = authenticateUser(email, password);
  if (!result.ok) {
    return res.status(401).json({ ok: false, error: result.message, status: result.status });
  }
  const token = signJwt({ userId: result.user.id, email: result.user.email });
  return res.status(200).json({
    ok: true,
    token,
    user: { id: result.user.id, email: result.user.email, name: result.user.name },
  });
});

// GET /auth/me
app.get("/auth/me", requireUser, (req, res) => {
  const { getUserById } = await import("./lib/user_store.js");
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ ok: false, error: "User not found." });
  return res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
});
```

**Important:** These three routes must NOT be protected by `requireUser` (except `/auth/me`). Do NOT add them inside any auth middleware wrapper.

### Step 2c — Add `JWT_SECRET` to `.env`

Add to `backend/.env`:
```
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
```

Also add `JWT_SECRET` to `backend/.env.production` (use a different value, generated the same way).

### Step 2d — Verify auth end-to-end

```bash
cd backend && node index.js &
sleep 2

# Sign up
curl -s -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -H "X-APP-TOKEN: $APP_TOKEN" \
  -d '{"email":"test@them.io","password":"testpass123","name":"Joshua"}'
# Expected: { "ok": true, "token": "eyJ...", "user": { "id": "user_...", ... } }

# Save token and test /auth/me
TOKEN="eyJ..."
curl -s http://localhost:3000/auth/me \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-APP-TOKEN: $APP_TOKEN"
# Expected: { "ok": true, "user": { ... } }

# Login
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -H "X-APP-TOKEN: $APP_TOKEN" \
  -d '{"email":"test@them.io","password":"testpass123"}'
# Expected: { "ok": true, "token": "eyJ...", ... }

kill %1
```

---

## Task 3: Wire Postgres for user and memory storage

### Step 3a — Install and set up Postgres locally

```bash
brew install postgresql@16
brew services start postgresql@16
createdb them
```

Add to `backend/.env`:
```
DATABASE_URL=postgres://localhost:5432/them
```

### Step 3b — Create `backend/db/pool.js`

```js
import pg from "pg";
const { Pool } = pg;

let _pool = null;

export function getPool() {
  if (!_pool) {
    throw new Error("Database pool not initialized. Call initPool() first.");
  }
  return _pool;
}

export function initPool() {
  if (_pool) return _pool;
  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  _pool.on("error", (err) => {
    console.error("[db] Unexpected pool error:", err.message);
  });
  return _pool;
}
```

### Step 3c — Create `backend/db/migrate.js`

```js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const { rows } = await pool.query("SELECT filename FROM _migrations");
  const applied = new Set(rows.map((r) => r.filename));
  const migrationsDir = path.join(__dirname, "migrations");
  if (!fs.existsSync(migrationsDir)) return;
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await pool.query(sql);
    await pool.query("INSERT INTO _migrations (filename) VALUES ($1)", [file]);
    console.log(`[migrate] Applied ${file}`);
  }
}
```

### Step 3d — Create `backend/db/migrations/001_initial.sql`

```sql
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  password_salt TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  password_iterations INTEGER NOT NULL DEFAULT 120000,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_memory (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory     JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS client_tokens (
  token    TEXT PRIMARY KEY,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip       TEXT NOT NULL DEFAULT '',
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_memory_user ON user_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_client_tokens_user ON client_tokens(user_id);
```

### Step 3e — Update `lib/user_store.js` to use Postgres with JSON fallback

Modify `createUser()` and `authenticateUser()` to write to Postgres when `DATABASE_URL` is set, falling back to the existing JSON file approach when it is not:

```js
import { getPool } from "../db/pool.js";

const USE_DB = Boolean(process.env.DATABASE_URL);

// In createUser(), after inserting into in-memory Maps, add:
if (USE_DB) {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO users (id, email, name, password_salt, password_hash, password_iterations, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0), to_timestamp($8 / 1000.0))
       ON CONFLICT (email) DO NOTHING`,
      [record.id, record.email, record.name, record.password.salt, record.password.hash,
       record.password.iterations, record.createdAt, record.updatedAt]
    );
  } catch (dbErr) {
    console.error("[user_store] DB write failed, continuing with JSON fallback:", dbErr.message);
  }
}
```

Make `createUser` and `authenticateUser` async since they now optionally await a DB call. Update all call sites in `index.js` accordingly.

### Step 3f — Wire migrations into server startup

In `index.js`, at the very top of the startup sequence (before `app.listen()`):

```js
import { initPool } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";

// In startup:
if (process.env.DATABASE_URL) {
  initPool();
  await runMigrations();
  console.log("[startup] Database ready.");
} else {
  console.log("[startup] No DATABASE_URL set — using JSON file storage.");
}
```

Wrap the `app.listen()` call in an async IIFE if it isn't already:
```js
(async () => {
  if (process.env.DATABASE_URL) {
    initPool();
    await runMigrations();
  }
  app.listen(PORT, () => {
    console.log(`[server] Listening on port ${PORT}`);
  });
})();
```

### Step 3g — Verify Postgres is wired

```bash
cd backend
DATABASE_URL=postgres://localhost:5432/them node index.js &
sleep 2

# Sign up — should write to Postgres
curl -s -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -H "X-APP-TOKEN: $APP_TOKEN" \
  -d '{"email":"pgtest@them.io","password":"testpass123","name":"Joshua"}'

# Verify row landed in Postgres
psql them -c "SELECT id, email, name FROM users;"
# Expected: one row with email=pgtest@them.io

kill %1
```

---

## Task 4: Update the Swift client to send auth tokens

### File to edit: `them/BackendMemoryAPI.swift` (and `them/Network/BackendClient.swift` if it exists)

### What to add

**Step 4a — Add Keychain helpers**

Add a new file `them/KeychainStore.swift`:

```swift
import Foundation
import Security

enum KeychainStore {
    private static let service = "io.them.them"

    static func save(key: String, value: String) {
        guard let data = value.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    static func load(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else { return nil }
        return value
    }

    static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
```

**Step 4b — Add auth API calls to `BackendMemoryAPI.swift`**

Add these two structs and two functions:

```swift
struct AuthResponse: Decodable {
    let ok: Bool
    let token: String?
    let user: AuthUser?
    let error: String?
}

struct AuthUser: Decodable {
    let id: String
    let email: String
    let name: String?
}

// In BackendMemoryAPI class or as top-level functions:

func signUp(email: String, password: String, name: String) async throws -> AuthResponse {
    let url = try resolvedURL(path: "/auth/signup")
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try JSONSerialization.data(withJSONObject: [
        "email": email, "password": password, "name": name
    ])
    attachAppToken(to: &req)
    let (data, _) = try await URLSession.shared.data(for: req)
    return try JSONDecoder().decode(AuthResponse.self, from: data)
}

func logIn(email: String, password: String) async throws -> AuthResponse {
    let url = try resolvedURL(path: "/auth/login")
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try JSONSerialization.data(withJSONObject: [
        "email": email, "password": password
    ])
    attachAppToken(to: &req)
    let (data, _) = try await URLSession.shared.data(for: req)
    return try JSONDecoder().decode(AuthResponse.self, from: data)
}
```

**Step 4c — Attach Bearer token to all outgoing requests**

Find the function in `BackendMemoryAPI.swift` that creates or modifies `URLRequest` objects before sending (likely a helper like `attachAppToken`, `addCommonHeaders`, or wherever `X-APP-TOKEN` is set). Add the user JWT there:

```swift
func attachAuthHeaders(to request: inout URLRequest) {
    // Existing app token
    if let appToken = Bundle.main.object(forInfoDictionaryKey: "APP_TOKEN") as? String,
       !appToken.isEmpty {
        request.setValue(appToken, forHTTPHeaderField: "X-APP-TOKEN")
    }
    // User JWT
    if let userToken = KeychainStore.load(key: "userJwt"), !userToken.isEmpty {
        request.setValue("Bearer \(userToken)", forHTTPHeaderField: "Authorization")
    }
}
```

Replace any existing calls to `attachAppToken(to:)` with `attachAuthHeaders(to:)`.

**Step 4d — Store token after sign-up or login**

After a successful `signUp` or `logIn` call, save the token to Keychain:

```swift
if let token = response.token {
    KeychainStore.save(key: "userJwt", value: token)
}
```

**Step 4e — Trigger auth on first launch**

In `HerEvolutionStore.swift` or wherever `needsOnboardingName` is checked, also check for a missing JWT:

```swift
var needsAuth: Bool {
    KeychainStore.load(key: "userJwt") == nil
}
```

Where the app currently shows the main `ConversationScreen`, gate it behind an auth check. If `needsAuth` is true, show a simple sign-up/login view first. This can be a minimal two-field form (email + password) — the full onboarding UI can come later.

---

## General rules

- Do NOT change any Clementine persona prompts, system prompt text, or AI behavior.
- Do NOT change any TTS/STT/chat model parameters.
- Do NOT modify any eval or test files.
- All new Node.js code uses ESM (`import`/`export`), `async/await`, no callbacks.
- No new npm dependencies except `pg` (already installed).
- When `DATABASE_URL` is not set, fall back to JSON file storage. Local dev without Postgres must still work.
- After each task, run the verification commands before moving to the next task.

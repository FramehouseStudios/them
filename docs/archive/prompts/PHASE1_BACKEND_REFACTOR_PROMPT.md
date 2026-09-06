# Phase 1: Backend Survivability Refactor

## Context

You are working on `them` — a voice-first AI companion macOS app. The backend is a Node.js/Express server in `backend/index.js` (currently ~32,600 lines in a single file). It wraps OpenAI APIs for STT, chat, TTS, and Realtime to power an AI persona called "Clementine."

The backend currently stores all data in flat JSON files on disk (`user_memory_store.json`, `screenplay_store.json`, `outbox_store.json`) using in-memory Maps with periodic `writeJsonFileAtomic()` flushes. It also has no real user authentication — it uses a shared `APP_TOKEN` and identifies users by IP address + client token hashes.

This architecture cannot support multiple users, horizontal scaling, or safe beta distribution. The goal of this refactor is to make the backend multi-user-ready without rewriting the product logic.

There are three workstreams. Complete them in order.

---

## Workstream 1: Break `index.js` into modules

Split `backend/index.js` into a clean module structure. The current file contains everything: config, utilities, persona prompts, session management, adaptive intelligence, store I/O, all route handlers, and the server bootstrap.

### Target structure

```
backend/
├── index.js                  # Entry point: imports app, starts server (~50 lines)
├── app.js                    # Express app setup, middleware, mounts route files
├── config.js                 # All env parsing, constants, feature flags
├── lib/
│   ├── utils.js              # parsePositiveInt, parseBool, parseNumberInRange, parseOneOf, normalizeSnippet, clampUnit, trimToMax, escapeRegex, slugifyForFilename, writeJsonFileAtomic, createRequestId
│   ├── persona.js            # CLEMENTINE_PROFILE, PERSONA_ENFORCEMENT_ADDENDUM, CLEMENTINE_DEFAULT_SYSTEM_PROMPT, CLEMENTINE_PRESET_GUIDANCE_TEXT, all prompt-building functions (buildSystemPrompt variants, buildStageGuidance, buildClementineSystemPrompt, etc.)
│   ├── adaptive.js           # Adaptive intelligence: quality EMA, bias tracking, specificity scoring, adaptive history, quality eval model calls
│   ├── talk_pipeline.js      # Talk endpoint pipeline: idempotency cache, speculative cache, rate limiting, metrics, screenplay output parsing, TTS dispatch, the full /talk handler logic
│   ├── session.js            # Session lifecycle: createSessionToken, session rate limiting, session memory resolution (resolveSessionMemoryForIp), session bootstrap, evolution sync
│   ├── memory_store.js       # User memory: loadUserMemoryStore, saveUserMemoryStore, cleanupUserMemoryStore, getPersistedIpForClientToken, userMemoryByIp/userMemoryByClientToken Maps, sanitizePersistedSessionMemory
│   ├── screenplay_store.js   # Screenplay store: loadScreenplayStore, saveScreenplayStore, screenplayStoreByOwner Map, all project/version/outline/collaborator/comment CRUD helpers
│   ├── outbox_store.js       # Outbox: loadOutboxStore, saveOutboxStore, outbox item lifecycle
│   ├── knowledge.js          # Knowledge cards, embedding cache, lexical scoring
│   ├── tasks.js              # Task extraction, creation, completion, reopening
│   ├── email.js              # Email compose, secretary email draft
│   ├── calendar.js           # Calendar compose
│   ├── linkedin.js           # LinkedIn profile analysis
│   ├── visual_context.js     # Visual context processing
│   ├── scale_backplane.mjs   # (already exists — keep as-is)
│   └── tts.js                # TTS provider resolution, OpenAI TTS, ElevenLabs TTS, filler logic
├── routes/
│   ├── health.js             # GET /health, GET /bridge, GET /ops/metrics, GET /ops/alerts
│   ├── session.js            # POST /session, PATCH /session/evolution
│   ├── state.js              # GET /state
│   ├── talk.js               # POST /talk (the big one — uses talk_pipeline.js)
│   ├── history.js            # GET /history, POST /history/annotate_turn, POST /data/history/clear
│   ├── memories.js           # GET /memories, GET /memories/export, POST /memories/update, POST /memories/forget, POST /memories/promote, POST /memories/feedback, POST /data/memories/clear
│   ├── tasks.js              # GET /tasks, POST /tasks/update
│   ├── recap.js              # GET /recap, GET /recap/today
│   ├── screenplay.js         # All /screenplay/* routes (projects CRUD, versions, outline, collaborators, comments, paginate, revision-colors, export)
│   ├── realtime.js           # All /realtime/* routes (client_secret, studio_render, studio_render_stream, turn_commit, bridge, call)
│   ├── outbox.js             # GET /outbox, POST /outbox/retry
│   ├── secretary.js          # POST /secretary/email, POST /secretary/calendar
│   └── linkedin.js           # POST /linkedin/analyze
├── middleware/
│   ├── auth.js               # APP_TOKEN check, client token resolution, CORS
│   └── rate_limit.js         # Rate limiting middleware (talk rate limit, session rate limit)
├── db/
│   └── (empty for now — Workstream 2 goes here)
├── evals/                    # (keep as-is)
├── tests/                    # (keep as-is)
├── package.json
└── package-lock.json
```

### Rules

- Do NOT change any business logic, prompt text, or behavior. This is a structural refactor only.
- Every module should use ESM (`import`/`export`). The project is `"type": "module"`.
- Shared state (the in-memory Maps like `userMemoryByIp`, `screenplayStoreByOwner`, the session store, the idempotency cache, the speculative cache, the metrics ring) should be exported from their respective modules so route handlers can import them. Prefer singleton module-level state over classes.
- Config values should be imported from `config.js` by all modules that need them.
- Route files should export a function like `export default function mountHistoryRoutes(app) { ... }` which `app.js` calls during setup.
- Middleware (APP_TOKEN check, CORS, client IP extraction, client token resolution) should be reusable middleware functions in `middleware/auth.js`.
- The 4 middleware blocks at the top of the route section (lines ~26167–26430 in current index.js) handle CORS, APP_TOKEN enforcement, client token resolution, and request logging. Move these to `middleware/auth.js` and apply them in `app.js`.
- Keep all existing `console.log` and `console.error` logging as-is.
- After splitting, running `node index.js` should start the server with identical behavior.
- All existing tests in `backend/tests/` and evals in `backend/evals/` must still pass without modification to the test files themselves. If a test imports from `index.js` directly, add a re-export shim.
- Do NOT touch any Swift code.

### Verification

After splitting, run:
```bash
cd backend
npm start                     # Server starts on PORT 3000
curl http://localhost:3000/health   # Returns JSON with ok: true
npm test                      # All tests pass
```

---

## Workstream 2: Wire up Postgres

Replace the three JSON file stores with Postgres tables. The `pg` package is already in `package.json`.

### Database schema

Create a `backend/db/` directory with a migrations system. Use numbered SQL files.

```
backend/db/
├── pool.js           # pg.Pool singleton, reads DATABASE_URL from env
├── migrate.js        # Runs migrations on startup (create tables if not exist)
└── migrations/
    └── 001_initial.sql
```

#### `001_initial.sql`

```sql
-- Users table (Workstream 3 adds auth columns)
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip            TEXT NOT NULL DEFAULT '',
  client_tokens TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ip ON users(ip) WHERE ip != '';

-- User memory (one row per user — replaces user_memory_store.json entries)
CREATE TABLE IF NOT EXISTS user_memory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory        JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Conversation history (one row per turn)
CREATE TABLE IF NOT EXISTS conversation_turns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  turn_number   INTEGER NOT NULL DEFAULT 0,
  user_message  TEXT NOT NULL DEFAULT '',
  assistant_message TEXT NOT NULL DEFAULT '',
  context_tag   TEXT NOT NULL DEFAULT '',
  emotion_tag   TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata      JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_conversation_turns_user ON conversation_turns(user_id, created_at DESC);

-- Screenplay projects (replaces screenplay_store.json)
CREATE TABLE IF NOT EXISTS screenplay_owners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_key       TEXT NOT NULL,
  active_project_id TEXT NOT NULL DEFAULT '',
  companion_state JSONB NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, owner_key)
);

CREATE TABLE IF NOT EXISTS screenplay_projects (
  id            TEXT PRIMARY KEY,
  owner_id      UUID NOT NULL REFERENCES screenplay_owners(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT '',
  archived      BOOLEAN NOT NULL DEFAULT false,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  characters    TEXT[] NOT NULL DEFAULT '{}',
  setting       TEXT NOT NULL DEFAULT '',
  tone          TEXT NOT NULL DEFAULT '',
  prompt_seed   TEXT NOT NULL DEFAULT '',
  last_phase    TEXT NOT NULL DEFAULT '',
  outline       JSONB NOT NULL DEFAULT '{"acts":[],"scenes":[],"beats":[]}',
  studio_thread_view_state JSONB,
  studio_diff_acknowledged JSONB NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_screenplay_projects_owner ON screenplay_projects(owner_id);

CREATE TABLE IF NOT EXISTS screenplay_versions (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES screenplay_projects(id) ON DELETE CASCADE,
  phase         TEXT NOT NULL DEFAULT '',
  source        TEXT NOT NULL DEFAULT '',
  prompt        TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  draft         TEXT NOT NULL DEFAULT '',
  draft_excerpt TEXT NOT NULL DEFAULT '',
  format_score  REAL NOT NULL DEFAULT 0,
  story_score   REAL NOT NULL DEFAULT 0,
  confidence_class TEXT NOT NULL DEFAULT 'low',
  warnings      TEXT[] NOT NULL DEFAULT '{}',
  write_anchors JSONB NOT NULL DEFAULT '[]',
  bindings      JSONB NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_screenplay_versions_project ON screenplay_versions(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS screenplay_collaborators (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT NOT NULL REFERENCES screenplay_projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT '',
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS screenplay_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT NOT NULL REFERENCES screenplay_projects(id) ON DELETE CASCADE,
  version_id    TEXT NOT NULL DEFAULT '',
  author        TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  anchor_type   TEXT NOT NULL DEFAULT '',
  anchor_ref    TEXT NOT NULL DEFAULT '',
  resolved      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_screenplay_comments_project ON screenplay_comments(project_id);

-- Outbox (replaces outbox_store.json)
CREATE TABLE IF NOT EXISTS outbox_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL DEFAULT '',
  action_key    TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending',
  attempts      INTEGER NOT NULL DEFAULT 0,
  payload       JSONB NOT NULL DEFAULT '{}',
  result        JSONB NOT NULL DEFAULT '{}',
  last_error    TEXT NOT NULL DEFAULT '',
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_items_user ON outbox_items(user_id, created_at DESC);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'open',
  priority      TEXT NOT NULL DEFAULT 'normal',
  source        TEXT NOT NULL DEFAULT 'conversation',
  due_at        TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, status);
```

### `pool.js`

```js
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://localhost:5432/them",
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export default pool;
```

### `migrate.js`

```js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pool from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

export async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const applied = new Set(
    (await pool.query("SELECT filename FROM _migrations")).rows.map(r => r.filename)
  );
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await pool.query(sql);
    await pool.query("INSERT INTO _migrations (filename) VALUES ($1)", [file]);
    console.log(`[migrate] Applied ${file}`);
  }
}
```

### Integration rules

- Call `await runMigrations()` in the server startup (in `index.js`) before `app.listen()`.
- Replace `loadUserMemoryStore()` / `saveUserMemoryStore()` with `pool.query()` calls in `memory_store.js`. Keep the in-memory Maps as a write-through cache: reads hit the Map first, writes go to both Map and Postgres.
- Replace `loadScreenplayStore()` / `saveScreenplayStore()` with Postgres queries in `screenplay_store.js`. Same write-through cache pattern.
- Replace `loadOutboxStore()` / `saveOutboxStore()` with Postgres queries in `outbox_store.js`.
- Add `DATABASE_URL` to `.env` and `.env.production`. Add it to `.gitignore` (already covered since `.env*` is ignored).
- The `memory` column in `user_memory` stores the full memory object as JSONB. This preserves backward compatibility — the memory shape is complex and deeply nested. Do not try to normalize it into separate columns yet.
- Keep the JSON file I/O code in place as a fallback for `NODE_ENV=development` when `DATABASE_URL` is not set. This lets local development still work without Postgres.

### Verification

```bash
# Start Postgres locally (if not running)
brew services start postgresql@16
createdb them

# Set env and start
DATABASE_URL=postgres://localhost:5432/them npm start
curl http://localhost:3000/health   # ok: true
# POST /session, POST /talk, verify data lands in Postgres
psql them -c "SELECT count(*) FROM users;"
```

---

## Workstream 3: Add user authentication

Add JWT-based auth so each user has their own memory, history, screenplays, and tasks.

### Schema addition

Create `backend/db/migrations/002_auth.sql`:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '';
```

### Auth module: `backend/lib/auth.js`

- Use `node:crypto` (built-in) for password hashing with scrypt. No external dependency needed.
- Use a simple JWT implementation with `node:crypto` HMAC-SHA256. Or add `jsonwebtoken` to package.json if you prefer — but the built-in approach keeps deps minimal.
- ENV: `JWT_SECRET` (required in production, auto-generated in dev).
- Token expiry: 7 days.
- Refresh: issue a new token on every authenticated request (sliding window).

### New routes: `backend/routes/auth.js`

```
POST /auth/register    { email, password, displayName }
  → Creates user row, returns { token, user: { id, email, displayName } }

POST /auth/login       { email, password }
  → Validates credentials, returns { token, user: { id, email, displayName } }

GET  /auth/me          (requires Bearer token)
  → Returns { user: { id, email, displayName } }
```

### Middleware update: `backend/middleware/auth.js`

- Add a `requireUser` middleware that:
  1. Reads `Authorization: Bearer <token>` header.
  2. Verifies and decodes the JWT.
  3. Sets `req.userId` (UUID) on the request.
  4. Returns 401 if invalid/expired.
- Add a `optionalUser` middleware that does the same but doesn't reject — sets `req.userId = null` if no valid token.
- Apply `requireUser` to all routes except: `GET /health`, `POST /auth/register`, `POST /auth/login`, `GET /bridge`.
- The existing `APP_TOKEN` check should remain as a separate layer (it gates the entire API, auth gates individual users within it).

### Scoping all data to `req.userId`

- Every store operation (memory read/write, history query, screenplay CRUD, task CRUD, outbox) must filter by `req.userId`.
- The `resolveSessionMemoryForIp()` function currently uses IP address to find the user's memory. Replace this: use `req.userId` to look up the user's memory row directly. Keep IP-based lookup as a fallback only for unauthenticated development mode.
- Screenplay owner resolution currently uses `ip:${clientIp}` as the owner key. Replace with `user:${req.userId}`. Add a migration path: if a user logs in for the first time and has existing IP-based data, migrate it to their user ID.
- Session bootstrap (`POST /session`) should associate the session with `req.userId`.

### iOS/macOS client token flow

The Swift client currently sends `X-Client-Token` headers. After this change:
1. Client calls `POST /auth/register` or `POST /auth/login` on first launch.
2. Client stores the JWT in Keychain.
3. Client sends `Authorization: Bearer <token>` on all subsequent requests.
4. `X-Client-Token` remains as a device fingerprint for analytics but is no longer the identity mechanism.

Do NOT modify any Swift files. Just document the expected client-side changes in a new file `backend/AUTH_MIGRATION_GUIDE.md`.

### Verification

```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -H "X-App-Token: $APP_TOKEN" \
  -d '{"email":"test@them.io","password":"testpass123","displayName":"Joshua"}'
# → { "token": "eyJ...", "user": { "id": "...", "email": "test@them.io", "displayName": "Joshua" } }

# Authenticated request
TOKEN="eyJ..."
curl http://localhost:3000/memories -H "Authorization: Bearer $TOKEN" -H "X-App-Token: $APP_TOKEN"
# → User-scoped memories

# Unauthenticated request
curl http://localhost:3000/memories -H "X-App-Token: $APP_TOKEN"
# → 401
```

---

## General rules for all workstreams

- Do NOT change any Clementine persona prompts, system prompt text, or AI behavior.
- Do NOT change any adaptive intelligence parameters or scoring logic.
- Do NOT change any TTS/STT/chat model calls or parameters.
- Do NOT modify any Swift client code.
- Do NOT modify any eval or test files — they must pass as-is (or with minimal import path changes only).
- Keep all existing console logging.
- Preserve backward compatibility: if `DATABASE_URL` is not set, fall back to JSON file storage so local dev without Postgres still works.
- Use `async/await` throughout new code. No callbacks.
- No new npm dependencies except optionally `jsonwebtoken` for Workstream 3. Everything else uses built-in Node.js modules and the already-installed `pg`.

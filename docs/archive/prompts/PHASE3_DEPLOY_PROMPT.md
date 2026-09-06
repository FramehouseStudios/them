# Phase 3: Deploy the Backend to Production (Railway)

## ⚠️ Do this before anything else

`backend/.env.production` contains a real OpenAI API key that was exposed in a screenshot. Before deploying, rotate it:

1. Go to https://platform.openai.com/api-keys
2. Revoke the key ending in `FBRQAA`
3. Create a new key, copy it
4. Update `backend/.env.production` with the new key
5. Also update `backend/.env` with the new key
6. Run: `gh secret set OPENAI_API_KEY` and paste the new key

**Do not deploy until this is done.** Deploying with a compromised key means attackers can use your quota the moment the server is live.

---

## Context

The backend is a Node.js/Express server in `backend/` with:
- Entry point: `backend/index.js`, start command: `node index.js`
- ESM modules (`"type": "module"`)
- Dependencies: `express`, `multer`, `pg`, `redis`, `jsonwebtoken` (all in `package.json`)
- Production env config: `backend/.env.production` (do NOT commit this file — it is already gitignored)
- The `npm start` script runs `node index.js`
- `GET /health` returns `{ ok: true, ... }` — use this to confirm the server is alive

The deployment target is **Railway** — it deploys from GitHub, auto-detects Node.js, provides managed Postgres with one click, and requires no Dockerfile.

---

## Task 1: Prepare the repo for deployment

### Step 1a — Add a `railway.json` config file

Create `backend/railway.json`:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node index.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### Step 1b — Add a `.npmrc` to ensure clean installs

Create `backend/.npmrc`:

```
engine-strict=false
```

### Step 1c — Confirm `package.json` has the right Node version

Add an `engines` field to `backend/package.json` if not already present:

```json
"engines": {
  "node": ">=20.0.0"
}
```

### Step 1d — Clean up binary test files from the backend directory

The following files should not be in the repo. Remove them:

```bash
cd ~/Desktop/io.them/them
git rm --ignore-unmatch backend/test.wav backend/test.aiff backend/response.mp3 them/test.mp3 them/test.wav
git commit -m "Remove test audio and binary files"
git push
```

### Step 1e — Make sure `knowledge_embeddings_cache.json` is gitignored

This file is large and auto-generated. Confirm it is in `.gitignore` (it should already be). If it was committed, remove it:

```bash
git rm --cached backend/knowledge_embeddings_cache.json 2>/dev/null || true
git commit -m "Remove generated embeddings cache from repo" 2>/dev/null || true
git push
```

---

## Task 2: Create the Railway project

### Step 2a — Sign up / log in

Go to https://railway.app and sign in with your GitHub account (FramehouseStudios). Authorize Railway to access your repositories.

### Step 2b — Create a new project

1. Click **New Project**
2. Select **Deploy from GitHub repo**
3. Choose `FramehouseStudios/them`
4. When asked for the root directory, set it to **`backend`** — this tells Railway to treat the `backend/` folder as the project root
5. Railway will detect Node.js and use `npm start` automatically

### Step 2c — Add Postgres

1. In your Railway project, click **+ New**
2. Select **Database → Add PostgreSQL**
3. Railway provisions a managed Postgres instance and automatically injects `DATABASE_URL` as an environment variable into your service. You don't need to set it manually.

### Step 2d — Add a custom domain (optional but recommended)

1. In your Railway service, go to **Settings → Networking → Generate Domain**
2. Railway gives you a free `*.up.railway.app` subdomain
3. Later you can point `api.them.io` here with a CNAME — skip for now

---

## Task 3: Set environment variables in Railway

In your Railway service, go to **Variables** and add each of the following. Do NOT use the values from `.env.production` directly — those are local references. Set fresh production values here:

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `3000` | Railway maps this to the public port automatically |
| `OPENAI_API_KEY` | your new rotated key | The old key ending in FBRQAA is compromised — use the new one |
| `APP_TOKEN` | generate a new one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | This is the shared secret the macOS app sends on every request |
| `JWT_SECRET` | generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` | Must be long and random |
| `REQUIRE_APP_TOKEN` | `true` | |
| `REQUIRE_CLIENT_TOKEN` | `true` | |
| `TALK_RATE_LIMIT_MAX` | `12` | |
| `TALK_RATE_LIMIT_WINDOW_MS` | `60000` | |
| `TALK_MAX_IN_FLIGHT` | `3` | |
| `STT_TIMEOUT_MS` | `30000` | |
| `CHAT_TIMEOUT_MS` | `30000` | |
| `TTS_TIMEOUT_MS` | `30000` | |
| `SESSION_TTL_MS` | `86400000` | |
| `SESSION_MAX_ACTIVE` | `10000` | |
| `BACKEND_BUILD` | `0.1.0-beta` | |
| `API_SCHEMA_VERSION` | `1` | |

`DATABASE_URL` is injected automatically by Railway's Postgres plugin — do NOT set it manually.

Leave these unset for now (they have safe defaults):
- `ELEVENLABS_VOICE_ID` (only needed if you want ElevenLabs TTS)
- `CORS_ALLOW_ORIGIN` (leave empty for now)
- `SCALE_BACKPLANE_ENABLED` (leave off)

### Step 3a — Write down your new APP_TOKEN

After generating the new `APP_TOKEN`, save it somewhere safe — you will need it in the Swift client (`Config.xcconfig`). It's the password the app sends to prove it's legitimate.

---

## Task 4: Confirm the deployment is healthy

Once Railway finishes deploying (usually 2-3 minutes), get your service URL from the Railway dashboard. It looks like `https://them-backend-production.up.railway.app`.

Run these checks:

```bash
BACKEND_URL="https://your-service.up.railway.app"
APP_TOKEN="your-app-token-from-step-3"

# Health check
curl -s "$BACKEND_URL/health" -H "X-APP-TOKEN: $APP_TOKEN"
# Expected: { "ok": true, "status": "up", ... }

# Sign up (confirms Postgres is wired)
curl -s -X POST "$BACKEND_URL/auth/signup" \
  -H "Content-Type: application/json" \
  -H "X-APP-TOKEN: $APP_TOKEN" \
  -d '{"email":"deploy-test@them.io","password":"testpass123","name":"Joshua"}'
# Expected: { "ok": true, "token": "eyJ...", "user": { ... } }

# Confirm user landed in Postgres
# (Check Railway's Postgres plugin → Data tab → users table)
```

If `/health` returns a 502 or the server crashes, check **Railway → Deployments → View Logs** for the startup error.

---

## Task 5: Point the Swift macOS client at the production backend

### Step 5a — Update `Config.xcconfig`

Open `them/Config.xcconfig`. Find the `BACKEND_URL` setting and update it:

```
BACKEND_URL = https://your-service.up.railway.app
APP_TOKEN_RELEASE = your-new-app-token-from-step-3
```

Leave `BACKEND_URL` for the Debug scheme pointing at `http://localhost:3000` for local development.

### Step 5b — Confirm the Release scheme uses the production URL

In Xcode, go to **Product → Scheme → Edit Scheme → Run → Info**. Confirm:
- Debug uses `http://localhost:3000` (or reads from the Debug xcconfig)
- Release uses the Railway URL (reads from `Config.xcconfig` `BACKEND_URL`)

### Step 5c — Push the config change

```bash
cd ~/Desktop/io.them/them
git add them/Config.xcconfig
git commit -m "Point release build at production backend"
git push
```

---

## Task 6: Set up automatic deploys from GitHub

Railway automatically redeploys when you push to `main`. Confirm this is enabled:

1. In Railway → your service → **Settings → Source**
2. Confirm **Branch** is set to `main`
3. Confirm **Auto Deploy** is toggled on

From now on, every `git push` to `main` triggers a new production deploy within ~2 minutes.

---

## Verification checklist

Before moving on, confirm all of these:

- [ ] Old OpenAI API key rotated, new key set in Railway variables
- [ ] `GET /health` returns `ok: true` from the Railway URL
- [ ] `POST /auth/signup` returns a JWT token
- [ ] New user appears in Railway's Postgres data viewer
- [ ] `Config.xcconfig` `BACKEND_URL` points at Railway URL in Release config
- [ ] Auto-deploy from GitHub is enabled

---

## What comes next after this

Once the backend is live and the Swift client points at it, the last blocker before TestFlight is the in-app auth UI — a sign-up/login screen that fires on first launch, stores the JWT in Keychain, and then drops the user into the conversation. That is the final piece before you can hand the app to a beta tester.

# THEM backend image.
#
# Targets the same supported Node 24 LTS patch as GitHub Actions. The
# multi-platform digest prevents an upstream tag from changing underneath a
# reviewed release while retaining native amd64 and arm64 images.
# Build once, run anywhere that supports OCI images (Render, Fly, ECS, etc.).
# The image does NOT bake secrets — `assertProductionEnv` enforces that
# DATABASE_URL, JWT_SECRET, OPENAI_API_KEY, APP_TOKEN, AUTH_APPLE_AUDIENCE,
# APP_STORE_ISSUER_ID, APP_STORE_KEY_ID, APP_STORE_PRIVATE_KEY, and
# APP_STORE_BUNDLE_ID are present at runtime when NODE_ENV=production.
# App Store secrets are set in Render (render.yaml sync: false), not in
# them/Release.local.env.

# ----- Stage 1: install production dependencies in isolation -----
FROM node:24.20.0-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS deps
WORKDIR /app

# Copy only manifest first so Docker can cache `npm ci` across source changes.
COPY package.json package-lock.json ./

# Install only runtime dependencies in the production layer. Test and parser
# tooling remain development-only and never enter the deployed image.
RUN npm ci --omit=dev

# ----- Stage 2: runtime image -----
FROM node:24.20.0-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS runtime

# Minimal hardening: run as a non-root user and pick up tini for clean
# signal handling (so SIGTERM from the orchestrator reaches Node, which
# already has SIGINT/SIGTERM handlers in index.js for the scale backplane).
RUN apk add --no-cache tini && \
    addgroup -S them && \
    adduser -S them -G them && \
    mkdir -p /app && \
    chown them:them /app
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    NPM_CONFIG_LOGLEVEL=warn

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=them:them . .

# Drop privileges before runtime.
USER them

EXPOSE 3000

# /healthz is the orchestrator-appropriate readiness probe (it pings the
# persistence layer). /realtime/health checks supplier reachability and
# can flap during a brief OpenAI hiccup that should NOT take the instance
# out of the load balancer rotation.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/healthz" >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.js"]

# io.them backend image.
#
# Targets Node 20 to match the GitHub Actions matrix in .github/workflows.
# Build once, run anywhere that supports OCI images (Render, Fly, ECS, etc.).
# The image does NOT bake secrets — `assertProductionEnv` enforces that
# DATABASE_URL, JWT_SECRET, OPENAI_API_KEY, and APP_TOKEN are present at
# runtime when NODE_ENV=production.

# ----- Stage 1: install production dependencies in isolation -----
FROM node:20-alpine AS deps
WORKDIR /app

# Copy only manifest first so Docker can cache `npm ci` across source changes.
COPY package.json package-lock.json ./

# `npm ci --omit=dev` would skip devDependencies, but the io.them backend
# currently ships its eval/test harness alongside the runtime and only
# declares production dependencies in package.json. `npm ci` is still the
# right call for reproducibility.
RUN npm ci --omit=dev

# ----- Stage 2: runtime image -----
FROM node:20-alpine AS runtime

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

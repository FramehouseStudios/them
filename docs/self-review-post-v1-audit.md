# Self-review — branch `support/backend-post-v1-audit`

Author: support agent. Purpose: shrink reviewer time on the ~60-move backend
batch. This is an honest critique of my own work, not a sign-off.
Severity: **H** blocks merge, **M** fix before prod, **L** nit/follow-up.

## Rebase status (read first)

- Commits 1–3 (all backend code) **rebase cleanly** onto current
  `main` (#323). Verified by an actual rebase attempt, then aborted
  and restored from tag `backup/post-v1-audit-pre-rebase` (branch is
  byte-identical to pre-rebase).
- Commit 4 (docs) conflicts in `docs/decisions-queue.md`,
  `docs/agent-events-*.jsonl`, `docs/v1-definition.md`.
  - `agent-events` / `v1-definition`: mechanical (append/checklist) —
    union-resolvable.
  - `decisions-queue`: **semantic, cross-agent.** My batch-1 commit
    moved #94/#99/#212 to *Resolved (human override)*; Codex's
    on-main work (#320/#321,
    `docs/memory-export-delete-decision-packet.md`) keeps them *Open*
    with a formal packet. **Substance agrees** (approve #94; #99
    creative-memory-only; #212 after byte-identical rebase).
  - **Recommended resolution:** when PR'ing, **drop the
    decisions-queue hunk from commit 4** and let Codex's packet be
    canonical. No information is lost — the human still answers via
    the packet, and the answers are the same.

## Commit 1 — production boot guard, health probes, password hardening

- **M — `assertProductionEnv` can break an existing deploy.** It now
  hard-refuses boot if `APP_TOKEN`/`JWT_SECRET`/`DATABASE_URL`/
  `OPENAI_API_KEY` are unset when `NODE_ENV=production`. If the
  current production deploy is running without one of these
  (e.g. relying on JSON persistence), this is a behavior change that
  will take prod down on next restart. **Reviewer action:** confirm
  the live deploy already sets all four before this merges. This is
  intended hardening but it is not backward-compatible by design.
- **L — `/healthz` JSON-mode ping always returns `true`,** including
  in the `catch`. Intentional (JSON mode has no remote dep) and
  documented in the file, but a reviewer should know `/healthz` can
  never report unhealthy in dev. In prod (Postgres) it does a real
  `SELECT 1`.
- **L — PBKDF2 bump 120k→600k.** `verifyPassword` reads the stored
  per-record iteration count, so existing accounts keep verifying;
  only new accounts get 600k. Confirmed by the existing
  `user_store`/`user_auth` tests passing. No rehash-on-login is
  implemented (old accounts stay at 120k forever) — acceptable for
  V1, follow-up worth filing.
- **L — `index.js` wiring** adds 3 mounts + the guard call. Diff is
  small and additive; low risk.

## Commit 2 — Phase-0 helpers

- **M (FIXED in commit 5) — `rate_limit.js` had an invisible `\x01`
  byte** as the storage-key separator (Write-tool artifact). It
  *worked* but was fragile: a reformat would silently reintroduce a
  key-collision bug. Commit 5 replaces it with an explicit
  `String.fromCharCode(31)`. All 7 new lib files were scanned for
  this artifact class; only `rate_limit.js` had it; now zero.
- **M — `idempotency_envelope.js` monkeypatches `res.json`/`res.send`.**
  This captures the body to cache it. Risk: it does not handle
  streaming responses (`res.write`/pipe) — those bypass capture and
  won't be idempotency-cached. For the documented adopters
  (`/memories`, screenplay save, `DELETE /account`) responses are
  small JSON, so this is fine, but the helper must **not** be wired
  onto streaming routes (`/talk`, `/realtime/studio_render_stream`).
  The talk path keeps its own existing helper — correct. Reviewer:
  enforce "no streaming routes" when adoptions land.
- **L — `account_routes.js` is unwired.** Routes + 10 tests with
  injected deps only; nothing mounted in `index.js`. Zero runtime
  risk; it is dead code until Phase-1. Intentional (one-adoption-
  per-PR). Migration 008 `CHECK` constraint events exactly match
  `account_lifecycle_store` `VALID_EVENTS` and `account_routes`
  audit calls — verified.
- **L — `middleware/auth.js`** now honors an incoming
  `X-Request-Id`. Non-breaking (falls back to `createRequestId()`).
  Trusts a client-supplied id — acceptable for correlation, but it
  should never be used for authz (it isn't).

## Commit 3 — deploy + CI

- **M — CI workflows are unproven.** `docker-build.yml` and
  `migrations-check.yml` are written to the documented Actions
  schema but have **never executed** (no push). First real run is
  the validation. `quality-gate.yml` change adds a network call to
  `api.openai.com/v1/models` on every run — fine, but it depends on
  the secret being rotated first (chicken/egg with issue #33).
- **L — `Dockerfile` not built locally** (no Docker in the dev env).
  Two-stage, non-root, tini, HEALTHCHECK `/healthz`. Standard shape;
  unverified. The `docker-build.yml` gate will catch breakage on
  first PR.
- **L — `apply_migrations.mjs`** is syntactically valid, not run
  against a real PG locally. `migrations-check.yml` exercises it on
  an ephemeral PG. Checksum-drift detection is strict (an edited
  applied migration → non-zero exit); intended.

## Commit 4 — docs/specs/tasks

- **H (process) — decisions-queue hunk conflicts with Codex's
  canonical packet.** See "Rebase status". Drop this hunk on PR.
- **L — `.env.example` was git-ignored** (`.gitignore` had `.env.*`).
  Fixed in commit 5 with a `!.env.example` carve-out; the file is
  now trackable (still needs an explicit `git add` since it was
  never committed).
- **L — 13 specs / 19 task rows** are planning artifacts, not code.
  Frontmatter passes the existing eval. Zero runtime risk.

## Commit 5 — App Store prep

- `account_lifecycle_store.js` + 8 tests: pure, injected client,
  in-memory-fake tested. SQL strings are untested against real PG
  (same caveat as the migrations runner). Spec carries a precise
  Phase-1 wiring plan with verified `index.js` line refs.

## Commit 6 — de-risking (this batch)

- `rate_limit.js` invisible-`\x01` → explicit `String.fromCharCode(31)`
  fix; all 7 new lib files scanned, now zero control-char artifacts.
  20/20 rate-limit + idempotency tests green after.
- `.gitignore` `!.env.example` carve-out.
- This self-review document.

## Net reviewer guidance

1. **Before merge:** confirm prod env has all 4 required vars
   (Commit 1, severity M) — this is the only thing that can take
   prod down.
2. **On PR:** drop the `decisions-queue.md` hunk; keep Codex's
   packet canonical.
3. **When adopting `withIdempotency`:** never on streaming routes.
4. Everything else is additive/unwired or L-severity. Full backend
   suite: **1225 pass / 1 skip / 0 fail** on the branch.

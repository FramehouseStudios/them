# backend/lib — module extraction pattern

This directory holds the per-domain modules extracted from
`backend/index.js` per
[`docs/specs/T-decompose-backend-index.md`](../../docs/specs/T-decompose-backend-index.md).
This README is the onboarding doc for adding a new module — for
either agent. Phases 0–3 of the decomposition have followed this
pattern; new phases must follow it too.

## The pattern

Each route file exports a `mount<X>Route(app, deps)` (or
`mount<X>Routes` plural) function:

```js
// backend/lib/example_route.js
//
// T-decompose-phase-<N>-example — extract /example route(s).
//
// Phase <N> of the decomposition (spec:
// docs/specs/T-decompose-backend-index.md).
//
// Routes:
//   GET  /example
//   POST /example
//
// Behavior is byte-identical with the previous inline handlers.
//
// Access-control posture: SAFE-PUBLIC | PER-USER | TIER-3 SENSITIVE.
// (Document which one and why.)

import express from "express";

function mountExampleRoutes(app, deps = {}) {
  if (!app || typeof app.post !== "function") {
    throw new Error("mountExampleRoutes requires an Express app");
  }
  const { getStore, normalizeSnippet /* ... */ } = deps;
  const required = { getStore, normalizeSnippet /* ... */ };
  for (const [k, fn] of Object.entries(required)) {
    if (typeof fn !== "function") {
      throw new Error(`mountExampleRoutes: ${k} is required`);
    }
  }

  app.get("/example", (req, res) => {
    /* handler body, byte-identical with previous inline code */
  });

  app.post("/example", express.json({ limit: "256kb" }), (req, res) => {
    /* handler body */
  });
}

export { mountExampleRoutes };
```

## Five rules every module must follow

### 1. Required-deps guard at mount time

Throw on any missing required dep before the first request lands.
A wiring mistake should crash at startup, not at request #1. Use
either form:

- `if (typeof <name> !== "function") throw new Error("mountX: <name> is required");`
- `for (const [k, fn] of Object.entries(required)) if (typeof fn !== "function") throw new Error(...)`

Pre-flight check: `mount-missing-required-deps-guard`.

### 2. Live state goes through accessor functions

Any mutable module-scoped state from `backend/index.js` (talk
in-flight counter, session lock map, idempotency cache) **must** be
passed as an **accessor function**, not a direct reference. The
route reads the current value at request time, not at mount time:

```js
// WRONG — freezes the value at mount time
mountFoo(app, { talkInFlight });

// RIGHT — reads the live value at request time
mountFoo(app, { talkInFlight: () => talkInFlight });
```

### 3. Route-local body parsers

Every POST that touches `req.body` mounts its own
`express.json({ limit: ... })` middleware on the route. Do not rely
on an app-level `app.use(express.json())`. Tests must use a **bare
Express app** to verify this:

```js
// WRONG — app.use(express.json()) masks a missing route-local parser
app.use(express.json());
mountFoo(app, deps);

// RIGHT — bare app exposes wiring bugs
const app = express();
mountFoo(app, deps);
```

Pre-flight checks: `route-needs-own-parser`,
`route-error-escapes-to-default-handler`.

### 4. Access-control posture documented at the top

Every module header declares one of three postures and why:

- **SAFE-PUBLIC**: response carries only class names + counts; no
  per-user content. Examples: `/ops/metrics`, `/ops/alerts`,
  `/ops/health-summary`, `/ops/routes`, `/talk/stats`, `/talk/errors`.
- **PER-USER**: response carries content keyed to an owner record
  resolved from the request (cookie / token / X-Client-Token).
  Examples: `/screenplay/projects/*`, `/screenplay/companion/state`.
- **TIER-3 SENSITIVE**: auth-gating, identity, privacy. Examples:
  `/auth/*`, future `/memory/export`, `/memory/delete`.

If a posture changes (e.g. SAFE-PUBLIC adds user-derived fields),
add a no-leakage test and update the header.

### 5. Tests live next to the module

Every `backend/lib/<name>.js` ships with `backend/tests/<name>.test.mjs`.
The test suite covers:

- Required-deps guard for every dep
- Cold/empty response shape
- Live-state accessor pattern (mutate between two requests; second
  response reflects the new value)
- Bare-Express production-style test (no app-level parser)
- Access-control posture check appropriate to the route

Pre-flight check: `lib-missing-test`. Opt out only for pure-config
modules with `// pre-flight: no-test-needed` at the top.

## Integration in `backend/index.js`

Replace inline handlers with a single mount call. Add a 3-5 line
comment that names the phase + the spec doc:

```js
// T-decompose-phase-<N>-example: /example moved to lib/example_route.js.
// Behavior is byte-identical with the previous inline handler. See
// docs/specs/T-decompose-backend-index.md.
mountExampleRoutes(app, {
  getStore,
  normalizeSnippet,
  /* ... */
});
```

## Don'ts

- Don't duplicate helpers. If `normalizeSnippet` already lives in
  `lib/utils.js`, pass it as a dep, don't redefine it.
- Don't mount routes in the lib's import-time side effects. The
  `mountX` call is the only place that touches `app`.
- Don't change response shape, status codes, or headers in the
  extraction PR. Decomposition is **always byte-identical**.
  Behavior changes are separate PRs.
- Don't ship without a task file at `tasks/_active/T-decompose-phase-<N>-<name>.md`.

## References

- [Decomposition spec](../../docs/specs/T-decompose-backend-index.md)
- [Pre-flight checks](../../scripts/pre_flight.mjs)
- [V1 definition](../../docs/v1-definition.md) — every extraction PR must
  declare a `V1 pillar` and `V1 effect`.

### Accepted precedents

Only phases that have **merged on `main`** count as accepted
precedent for the pattern in this README:

- [Phase 0 PR #183](https://github.com/FramehouseStudios/them/pull/183) — `/health` + `/bridge` (zero deps + accessor functions)
- [Phase 1 PR #190](https://github.com/FramehouseStudios/them/pull/190) — `/ops/metrics` + `/ops/alerts` (safe-public posture)
- [Phase 2a PR #192](https://github.com/FramehouseStudios/them/pull/192) — 5 read-only `/screenplay/projects/*` (per-user posture, 15 deps)
- [Phase 2b PR #197](https://github.com/FramehouseStudios/them/pull/197) — 7 write `/screenplay/projects/*` (32 deps, full required-deps guard)
- [Phase 3 PR #204](https://github.com/FramehouseStudios/them/pull/204) — `/screenplay/companion/state` + `/paginate` + `/revision-colors`

Open / in-review PRs are NOT precedent. The lib pattern is set by
what `main` actually carries. Once a phase merges, it becomes a
reference for the next.

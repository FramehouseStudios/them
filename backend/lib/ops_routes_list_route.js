// T-ops-routes-list-route — GET /ops/routes
//
// CONTRACT (load-bearing):
//
// This endpoint returns a **curated subset** of the routes this
// backend mounts. It is NOT a reflection of every Express route. It
// is the explicit list of app-facing optional surfaces that iOS /
// API clients / monitoring need to decide "should I attempt a call
// here?". Routes that are infra-internal (auth, ops/* introspection,
// CSP reports, etc.) are deliberately excluded.
//
// Scope rule (used in every review of this file):
//
//   IN — read/write endpoints under /memory, /talk, /screenplay,
//        /craft that iOS / API consumers depend on
//   IN — /ops/metrics + /ops/alerts (the long-standing public
//        observability pair, kept here for parity with older
//        clients)
//   OUT — auth/* endpoints (covered by the auth product contract)
//   OUT — /ops/health-summary and /ops/routes themselves (omitted
//        so the manifest stays a strict subset that survives a
//        partial deploy; presence of /ops/health-summary is
//        already surfaced via its features map)
//   OUT — internal CSP / static asset / health-probe paths
//
// Adding a new app-facing route is a deliberate decision: update
// CURATED_ROUTES here in the same PR that mounts the route.
// Removing one is also deliberate: the snapshot test for this
// module is the safety net.

const OPS_ROUTES_LIST_SCHEMA_VERSION = 1;

const SCOPE_DESCRIPTION =
  "Curated subset of app-facing optional surfaces (memory / talk / screenplay / craft / ops:metrics+alerts). " +
  "Not a reflection of every mounted route. Auth and infra-internal routes are excluded.";

const CURATED_ROUTES = Object.freeze([
  // creative memory — read/write surfaces
  Object.freeze({ method: "GET", path: "/memory/character-traits", group: "creative-memory" }),
  Object.freeze({ method: "POST", path: "/memory/character-trait", group: "creative-memory" }),
  Object.freeze({ method: "GET", path: "/memory/character-archetypes", group: "creative-memory" }),
  Object.freeze({ method: "GET", path: "/memory/block-signal", group: "creative-memory" }),
  Object.freeze({ method: "GET", path: "/memory/block-signal/history", group: "creative-memory" }),

  // screenplay export
  Object.freeze({ method: "POST", path: "/screenplay/export", group: "screenplay-export" }),
  Object.freeze({ method: "GET", path: "/screenplay/export/formats", group: "screenplay-export" }),

  // talk pipeline
  Object.freeze({ method: "POST", path: "/talk", group: "talk-pipeline" }),
  Object.freeze({ method: "GET", path: "/talk/turn/:turnId", group: "talk-pipeline" }),

  // ops (long-standing public observability pair)
  Object.freeze({ method: "GET", path: "/ops/metrics", group: "ops" }),
  Object.freeze({ method: "GET", path: "/ops/alerts", group: "ops" }),
]);

// Back-compat alias for the previous export name. Don't reference
// this in new code; use CURATED_ROUTES.
const ROUTES = CURATED_ROUTES;

function mountOpsRoutesListRoute(app) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountOpsRoutesListRoute requires an Express app");
  }
  app.get("/ops/routes", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      schemaVersion: OPS_ROUTES_LIST_SCHEMA_VERSION,
      scope: SCOPE_DESCRIPTION,
      total: CURATED_ROUTES.length,
      routes: CURATED_ROUTES,
    });
  });
}

export {
  mountOpsRoutesListRoute,
  CURATED_ROUTES,
  ROUTES, // deprecated alias — kept for the existing snapshot test
  OPS_ROUTES_LIST_SCHEMA_VERSION,
  SCOPE_DESCRIPTION,
};

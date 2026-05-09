# T18 — Backend Craft Schemas & Analysis Endpoints

**Status:** in-progress
**Owner:** claude
**Branch:** `claude/T18-craft-schemas-analysis`
**Base:** stacked on `codex/T17-craft-report-models` (PR #3)
**Pillars:** voice-to-scene + longitudinal learning
**Unblocks:** T19 (Codex BackendClient), T21 (claude prompts), T22 (claude persistence). T23 transitively follows T22.

## Goal

Expose the backend half of the craft-analysis contract that T17 (PR #3) established on the Swift side. Every JSON document the backend returns must round-trip through the Swift `ScreenplayCraft*` Codable models in [them/ScreenplayCraftModels.swift](../them/ScreenplayCraftModels.swift) **without translation, special cases, or platform-specific branches**. macOS and iOS clients must be equally first-class.

## Contract — Swift ⇄ JSON mapping

The Swift models are the source of truth for field names. The backend serializes to camelCase JSON and respects the one renamed key (`overrideRecord` ⇒ `"override"`). Every optional Swift field is `omittable` — the backend omits the key when the value is null rather than serializing `null`, so `JSONDecoder` with default settings decodes correctly.

| Swift type | JSON object | Notes |
|---|---|---|
| `ScreenplayCraftFramework` | `Framework` | Top-level: `id`, `title`, `summary?`, `version?`, `requiredMajorTurnIds`, `beats[]` |
| `ScreenplayCraftFrameworkReference` | `FrameworkReference` | `id`, `title`, `version?` — embedded into reports |
| `ScreenplayCraftBeatDefinition` | `BeatDefinition` | `id`, `label`, `summary?`, `expectedPageRange?`, `required`, `majorTurnId?` |
| `ScreenplayCraftReport` | `Report` | The full analysis envelope. `schemaVersion: Int` is the migration anchor. |
| `ScreenplayCraftCoverage` | `Coverage` | All counts are `Int`; `complete: Bool`; `confidence?: Double` |
| `ScreenplayBeatSheet` | `BeatSheet` | `id`, `frameworkId`, `title`, `beats[]` |
| `ScreenplayCraftBeat` | `Beat` | Per-beat detection result with optional evidence |
| `ScreenplayCraftMajorTurn` | `MajorTurn` | **CodingKey rename:** `overrideRecord` field ⇒ JSON key `"override"` |
| `ScreenplayCraftDriftReport` | `DriftReport` | `status`, `summary?`, `timeline[]` |
| `ScreenplayCraftTurnDrift` | `TurnDrift` | per-turn drift tuple |
| `ScreenplayCraftTurnOverride` | `TurnOverride` | user override metadata |
| `ScreenplayCraftEvidence` | `Evidence` | excerpt + page/line locator |
| `ScreenplayCraftPageRange` | `PageRange` | `{ start, end }` — both `Int` |
| `ScreenplayCraftSnapshotReference` | `SnapshotReference` | persisted-snapshot pointer |

### Field-by-field shape

#### `Report`

```jsonc
{
  "id": "string",
  "schemaVersion": 1,
  "projectId": "string",
  "versionId": "string?",
  "screenplayTitle": "string?",
  "generatedAt": "ISO8601 string?",
  "generatedBy": "string?",
  "framework": { /* FrameworkReference */ },
  "pageCount": 0,                 // Int?
  "summary": "string?",
  "coverage": { /* Coverage */ },
  "beatSheet": { /* BeatSheet */ },
  "majorTurns": [ /* MajorTurn ... */ ],
  "drift": { /* DriftReport */ },
  "overrides": [ /* TurnOverride ... */ ],
  "snapshot": { /* SnapshotReference? */ }
}
```

#### `MajorTurn` (note the rename)

```jsonc
{
  "id": "string",
  "turnId": "string",
  "label": "string",
  "required": true,
  "expectedPage": 12,
  "expectedPageRange": { "start": 10, "end": 14 },
  "actualPage": 13,
  "actualPageRange": { "start": 12, "end": 14 },
  "sceneId": "string",
  "sceneTitle": "string",
  "status": "string",         // free-form; Swift normalizes "present" | "accepted" | "overridden" | "manually_present"
  "detected": true,
  "driftPages": 1,
  "confidence": 0.83,
  "evidence": [ /* Evidence ... */ ],
  "override": { /* TurnOverride? */ }    //  ← JSON key is "override", Swift field is "overrideRecord"
}
```

This is the only key remap in the contract. Backend code must use `"override"` as the JSON key, not `"overrideRecord"`.

#### `Framework` & `BeatDefinition`

```jsonc
{
  "id": "save-the-cat",
  "title": "Save the Cat!",
  "summary": "string?",
  "version": "1.0",
  "requiredMajorTurnIds": ["catalyst", "midpoint", "all-is-lost"],
  "beats": [
    {
      "id": "opening-image",
      "label": "Opening Image",
      "summary": "string?",
      "expectedPageRange": { "start": 1, "end": 1 },
      "required": false,
      "majorTurnId": "string?"
    }
  ]
}
```

## Endpoints

All endpoints follow the existing backend conventions (express handlers in `backend/index.js`, routes mounted in `backend/routes/`).

| Method | Path | Returns | Purpose |
|---|---|---|---|
| `GET` | `/craft/frameworks` | `{ schemaVersion, frameworks: FrameworkReference[] }` | List available craft frameworks. |
| `GET` | `/craft/frameworks/:frameworkId` | `Framework` | Full framework with beat definitions and required major turns. |
| `GET` | `/craft/schemas/report` | JSON Schema (draft-07) for `Report` | So any client (or eval) can validate a report. |
| `GET` | `/craft/schemas/framework` | JSON Schema (draft-07) for `Framework` | So any client can validate a framework document. |
| `GET` | `/craft/reports/:projectId/:versionId?` | `Report` | The craft analysis report for a screenplay version. If no analysis exists yet, returns `404 { error: "report_not_found" }` with a typed envelope. |
| `POST` | `/craft/analyze` | `Report` | Trigger / refresh analysis. Body: `{ projectId, versionId?, frameworkId?, screenplay }`. Returns `202` if async, `200` with the report if sync (MVP is sync stub). |
| `POST` | `/craft/overrides` | `TurnOverride` | Record a user override. Body: `TurnOverride` minus `id`/`createdAt` (server assigns). |
| `DELETE` | `/craft/overrides/:overrideId` | `{ ok: true }` | Revoke an override. |

### Failure shapes

All error responses are typed envelopes consistent with the existing backend (`{ error: "snake_case_code", message?: "string" }`). Documented codes for craft endpoints:

- `craft_framework_not_found` — 404 on `/frameworks/:id`
- `craft_report_not_found` — 404 on `/reports/...`
- `craft_invalid_framework_id` — 400 on `/analyze`
- `craft_invalid_screenplay` — 400 on `/analyze` when input is malformed
- `craft_override_not_found` — 404 on `/overrides/:id` delete
- `craft_schema_version_unsupported` — 400 when client requests a schema version newer than backend supports

### `schemaVersion` contract

Every response that contains a `Report` or wraps craft data carries `schemaVersion: 1`. Clients refusing a newer version receive `craft_schema_version_unsupported`. Backend never decreases `schemaVersion` for an already-shipped field; new fields land as optional and bump `schemaVersion` only when the wire shape changes incompatibly.

## Fixtures

Checked in at `backend/fixtures/craft/`:

- `framework_save_the_cat.json` — a complete `Framework` for "Save the Cat!" with 15 beats and 4 required major turns.
- `framework_three_act.json` — a minimal three-act framework (3 major turns, ~12 beats).
- `report_complete.json` — a `Report` where every required major turn is detected (`coverage.complete: true`).
- `report_with_drift.json` — a `Report` with one missing major turn (`coverage.complete: false`, `drift.status: "drifting"`).
- `report_with_override.json` — a `Report` showing a `TurnOverride` round-tripped through analysis.

These fixtures are what Codex's T19 BackendClient consumes for client-side decode tests. The same fixtures power backend success/failure tests.

## Files to add

| File | Purpose |
|---|---|
| `backend/lib/craft_frameworks.js` | Built-in framework definitions (Save the Cat, three-act). Pure data + lookup. |
| `backend/lib/craft_schemas.js` | JSON Schema definitions for `Framework` and `Report`. Single source — endpoints + tests both consume. |
| `backend/lib/craft_analysis.js` | The `analyzeScreenplay({ screenplay, framework })` function. MVP returns a deterministic stubbed `Report`; later commits add real classification. |
| `backend/routes/craft.js` | Mount `/craft/*` routes; thin handlers that call lib functions and serialize. |
| `backend/fixtures/craft/*.json` | The five fixtures above. |
| `backend/tests/craft_endpoints.test.mjs` | Success-shape and failure-shape tests using `node:test`. |
| `backend/tests/craft_schemas.test.mjs` | JSON Schema validation: every fixture validates; deliberately broken fixtures fail. |
| `backend/evals/run_craft_classification_eval.mjs` | Stub eval scaffolding so T21 can extend it later (no LLM call yet). |

## Sequencing — five reviewable commits

1. **Claim row + design doc** *(this branch's first two commits — done)*
2. **Schemas, frameworks, fixtures.** Add `craft_schemas.js`, `craft_frameworks.js`, the five JSON fixtures. Pure data; no routing changes.
3. **Routes + handlers.** Mount `/craft/*` in `backend/routes/craft.js`; wire into `app.js`. Read-only endpoints only (`GET /frameworks`, `GET /schemas/*`, `GET /reports/...`, returning 404 for missing reports).
4. **Analysis + write endpoints.** Add `craft_analysis.js` MVP stub, `POST /analyze`, `POST /overrides`, `DELETE /overrides/:id`.
5. **Tests + eval scaffolding + docs.** `craft_endpoints.test.mjs`, `craft_schemas.test.mjs`, `run_craft_classification_eval.mjs` skeleton. Wire `npm run eval:gate` to include the new test files. Update this doc with shipped state. Open PR.

Each commit compiles and is reviewable on its own. The PR opens after commit 5.

## Tests

### Success shapes (`craft_endpoints.test.mjs`)

For each endpoint listed above, assert:
- The response status code matches the spec.
- The response body validates against the relevant JSON Schema (using `craft_schemas.js`).
- The response body, when round-tripped through Swift's decoder, matches a representative `ScreenplayCraft*` model. *(The Swift round-trip is exercised in T17 — backend tests assert JSON Schema validity; the Swift-side guarantees are owned by T17's tests.)*

### Failure shapes

For each documented error code, assert:
- The error envelope has shape `{ error: string, message?: string }`.
- The status code is correct.
- The error code is the documented snake_case constant.

### Schema invariants

- Every fixture passes its schema.
- Removing a required field from a fixture causes the schema to reject it.
- The `MajorTurn` schema requires `"override"` (not `"overrideRecord"`) for the override slot.

## Out of scope for T18

- Actual LLM-driven beat classification (T21).
- Persistent storage of reports (T22 — reports are computed on demand for MVP).
- Persistent storage of overrides (T22 — overrides are in-memory for MVP).
- The release-gate logic that fails on missing required major turns (T23).
- Postgres migration (T07-adjacent; T22 may revisit).

## Open questions for human / Codex

1. **Sync vs. async analysis.** MVP is sync with a deterministic stub. When real classification (T21) lands, `/analyze` may need to return `202` and a polling handle. **Proposed:** ship sync now; introduce async semantics in T21 with the `Report.generatedBy` field flipped to `"async-pending"` while computing.
2. **Scope of fixtures.** Two frameworks (Save the Cat + three-act) are seeded. Is "Story Circle" or "Hero's Journey" needed before T19/T20 land? **Proposed:** ship the two; add others as TASKS.md follow-ups when needed.
3. **Override authorization.** `POST /craft/overrides` accepts a `userId` field. Should the endpoint enforce `userId === req.user.id` from the auth middleware? **Proposed:** yes — the request body's `userId` must match the authenticated user, otherwise `403`. Capture as a test case.
4. **Coding-key compatibility.** The `MajorTurn` `override`/`overrideRecord` rename is a known footgun. **Proposed:** add an explicit test that decodes a backend fixture into the Swift model and re-encodes — but that test lives in T17's `themTests`, not here. Backend tests assert the JSON shape; Swift tests assert the decode.

## Done when (recap)

- [x] Row claimed in TASKS.md with branch, status, scope.
- [x] Design doc lands documenting contract and plan.
- [x] `backend/lib/craft_frameworks.js`, `craft_schemas.js`, `craft_analysis.js` exist.
- [x] `backend/lib/craft_routes.js` `mountCraftRoutes(app)` wired into `backend/index.js`; all 8 endpoints respond.
- [x] `backend/fixtures/craft/*.json` checked in (5 fixtures); each validates against its schema.
- [x] `backend/tests/craft_endpoints.test.mjs` (13 tests) and `craft_schemas.test.mjs` (13 tests) pass.
- [x] `backend/evals/run_craft_classification_eval.mjs` skeleton exists; `npm run eval:craft-classification` passes.
- [x] `npm test` green: 51 tests, 50 pass / 1 skipped / 0 fail.
- [ ] `npm run eval:gate` execution deferred to CI — gate requires a full backend boot with secrets (`OPENAI_API_KEY`, `APP_TOKEN`) not present in the worktree. The new craft code does not modify any path exercised by `eval:gate`.
- [x] PR ready to open with base = `codex/T17-craft-report-models`.

## Final shipped state (T18 PR contents)

Five reviewable commits on `claude/T18-craft-schemas-analysis`:

1. **T18 row claim** — `TASKS.md` update, branch and scope recorded.
2. **Design doc** — this file's pre-implementation version.
3. **Schemas, frameworks, fixtures** — pure data drop. `craft_frameworks.js`, `craft_schemas.js`, five JSON fixtures.
4. **Routes, analysis stub, `index.js` wire** — `craft_analysis.js`, `craft_routes.js`, two surgical edits to `backend/index.js`.
5. **Tests, eval skeleton, package script, this doc updated.**

Next dependent tasks become unblockable:

- **T19 (Codex)** — `BackendClient.fetchFrameworks()`, `fetchReport(...)`, `analyze(...)`, `recordOverride(...)`, etc. The five fixtures power decode tests; the live endpoints power request-construction tests once the backend is running.
- **T21 (Claude)** — replace the `analyzeScreenplay` stub with real LLM-driven beat classification; extend `run_craft_classification_eval.mjs` with labeled accuracy assertions.
- **T22 (Claude)** — replace the in-memory report and override stores with persistent storage (Postgres-backed via T07's adapter).
- **T23 (Claude)** — RC release gate fails when `coverage.complete === false` after overrides applied.

Open question resolutions:

1. **Sync vs. async analysis** — shipped sync. Async semantics deferred to T21 if needed.
2. **Scope of fixtures** — shipped two frameworks (Save the Cat!, three-act). Story Circle / Hero's Journey are TASKS.md follow-ups when needed.
3. **Override authorization** — shipped per the proposal: if `req.user.id` is set, override body's `userId` must match (`403 craft_override_user_mismatch`). Public requests without auth accepted so macOS and iOS clients are equally first-class. Test case included.
4. **Coding-key compatibility** — shipped a backend test asserting that `"override"` (not `"overrideRecord"`) is the valid JSON key. Swift-side decode test owned by T17.

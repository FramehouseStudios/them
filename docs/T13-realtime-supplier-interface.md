# T13 — Realtime Supplier Interface (foundation)

**Status:** in-progress (foundation in this PR; endpoint integration + real second supplier are follow-ups)
**Owner:** claude
**Branch:** `claude/T13-realtime-supplier-interface`
**Pillar:** living companion (resilience)

## Problem

Realtime voice today routes through a single supplier (OpenAI Realtime API). Single-vendor exposure was flagged in the strategic audit as a material risk: an OpenAI Realtime outage degrades the entire experience.

## Decision

Extract a `RealtimeSupplier` interface so a second supplier (ElevenLabs Conversational AI / Anthropic Realtime / etc.) can be slotted behind the same backend surface. Configure the active supplier via env (`REALTIME_PROVIDER=openai` is the default).

## What this PR ships (foundation)

1. **`backend/lib/realtime_supplier.js`** — interface module + factory. `createRealtimeSupplier({ provider, ...opts })` selects an implementation. `KNOWN_PROVIDERS` enumerates the supported names.

2. **`backend/lib/realtime_supplier_openai.js`** — wraps the existing OpenAI client-secret minting path as a supplier. Same wire shape as the inline implementation in `index.js`. Tests exercise it with a stub `fetchImpl`.

3. **`backend/lib/realtime_supplier_stub.js`** — deterministic supplier. Returns a synthetic but well-formed envelope. Useful for local dev without a realtime API account, and as a placeholder until the real second supplier is integrated. Supports a `simulateError` injection for testing failure paths.

4. **`backend/index.js`** — wires `realtimeSupplier` at module load (right after `sharedPersistence`). Defaults to OpenAI; falls back to OpenAI even on supplier-load errors so the endpoint never has nothing to call.

5. **`backend/tests/realtime_supplier.test.mjs`** (16 tests) — same contract suite runs against both implementations; provider-specific tests for OpenAI failure paths and the stub's simulated-error path.

## Interface

```js
const supplier = await createRealtimeSupplier({ provider: "openai" });
//                                                       | "stub"

supplier.kind                          // "openai" | "stub"
supplier.buildSessionConfig({ model, voice, instructions })  // -> object
supplier.mintClientSecret({
  instructions, voice, model, ttlSeconds,
})  // -> { value, expiresAt, sessionConfig, raw? }
```

Errors thrown from `mintClientSecret` carry `err.code` (typed) and `err.status` (HTTP-shaped hint):

| `err.code` | `err.status` |
|---|---|
| `realtime_supplier_unauthorized` | 503 (missing key / fetch unavailable) |
| `realtime_supplier_request_failed` | 502 / 504 / upstream status |
| `realtime_supplier_response_invalid` | 502 (payload missing required fields) |
| `realtime_supplier_unknown_provider` | (factory-only) |

## What this PR does NOT do (explicit follow-ups)

- **`POST /realtime/client_secret` does not yet route through the supplier interface.** The supplier is wired and instantiated, but the existing inline OpenAI fetch in `handleRealtimeClientSecret` is unchanged. Refactoring that endpoint inside the 32k-line `index.js` is bounded but risky; better as a focused follow-up commit. When that lands, the endpoint body shrinks to one supplier call + response mapping. Default `REALTIME_PROVIDER=openai` → identical wire behavior; `REALTIME_PROVIDER=stub` → deterministic synthetic envelope.
- **No real second supplier integrated.** The stub satisfies the interface deterministically. A real second supplier (ElevenLabs Conversational AI proposed) lands in a separate PR once API access is provisioned. Adding it is one new file + one factory entry — the interface this PR ships keeps that follow-up small.
- **`/realtime/studio_render` and `/realtime/call` endpoints** are not yet behind the interface. Each is a separate routing surface; the supplier interface can grow methods (`renderStudio`, `placeCall`) as those endpoints are migrated. Out of scope for foundation.
- **iOS-side configurable supplier choice** is Codex's row; the iOS client picks up the configurable supplier selection plus a smoke that exercises both paths once the backend supplier interface is fully integrated.

## Verification

- `cd backend && node --test tests/realtime_supplier.test.mjs` → **16 pass, 0 fail**.
- `cd backend && npm test` → **117 pass / 1 skipped / 0 fail**. No regressions; supplier wiring at module load does not break any existing test.
- `npm run eval:gate` → not run; requires backend boot with secrets.

## Done when (overall T13)

- [x] Supplier interface defined.
- [x] OpenAI implementation wraps the existing logic.
- [x] Stub implementation satisfies the same contract.
- [x] Factory selects via `REALTIME_PROVIDER` env (default `openai`).
- [x] Contract tests exercise both implementations.
- [ ] `POST /realtime/client_secret` routes through the supplier (follow-up commit on this branch).
- [ ] Real second supplier integrated and exercised against a live account in CI.

# realtime-client-secret envelope schema

Canonical shape for `POST /realtime/client_secret`.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| POST | `/realtime/client_secret` | client-secret envelope (201), `{ stage, error }` (4xx/5xx) |

## Schema version

`1` (no explicit field; iOS keys off field set).

## Owner

- **Backend**: support agent. Inline in `backend/index.js` today; will
  move to `lib/realtime_client_secret_route.js` in Phase 5b.1.
- **iOS decoder**: Codex.

## Access-control posture

**TIER-3 SENSITIVE**. Carries ephemeral WebRTC client secret;
must not appear in logs.

## Success envelope (201)

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `transport` | string | yes | constant `"webrtc_ephemeral"` |
| `assistant_name` | string | yes | per-IP self-name |
| `realtime_provider` | string | yes | `"openai"` / `"stub"` etc. |
| `fallback` | boolean | optional | `true` only when primary failed and stub fallback was used |
| `fallback_reason` | string | optional | reason code when `fallback === true` |
| `primary_supplier` | string | optional | original supplier when fallback occurred |
| `model` | string | yes | session model |
| `voice` | string | yes | session voice |
| `session` | object | yes | session config |
| `client_secret` | object | yes | `{ value, expires_at, session_expires_at }` |
| `issued_at` | int | yes | epoch seconds |

### session object

| Key | Type | Notes |
| --- | --- | --- |
| `type` | string | typically `"realtime"` |
| `model` | string | mirror of top-level |
| `voice` | string | mirror of top-level |
| `instructions` | string | system prompt |
| `output_modalities` | string[] | default `["audio"]` |

### client_secret object

| Key | Type | Notes |
| --- | --- | --- |
| `value` | string | ephemeral token — never log |
| `expires_at` | int | epoch ms |
| `session_expires_at` | int | epoch ms |

## Error envelope

```json
{
  "stage": "realtime_auth",
  "code": "<code>",
  "realtime_provider": "<kind>",
  "error": "<message>",
  "fallback": false,
  "fallback_attempted": true,
  "fallback_error": "<message>"
}
```

Canonical codes (load-bearing for `/talk/errors` counters):
- `realtime_supplier_unavailable`
- `realtime_supplier_request_failed`
- `realtime_supplier_response_invalid`
- `realtime_supplier_unknown_provider`
- `supplier_fallback_failed`

`fallback_attempted` + `fallback_error` only appear when the primary
failed and the fallback also failed.

## Compatibility rules

- The 4 canonical error codes are part of the contract. Renaming
  breaks `/talk/errors`.
- Adding new optional fields fine. Removing fields is v2.

## Changelog

- 2026-05-14 — Doc created.

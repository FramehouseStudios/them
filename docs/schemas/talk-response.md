# talk-response envelope schema

Canonical response shape for `POST /talk`. **The V1 magic moment.**
iOS playback, screenplay rendering, and offline-replay all key off
this envelope.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| POST | `/talk` | talk response envelope (200), `{ stage, error }` (4xx/5xx) |

## Schema version

`1` (no explicit `schemaVersion` field today; iOS keys off the
field set). Any non-additive change bumps to v2 + adds an explicit
`schema_version`.

## Owner

- **Backend / envelope shape**: Claude. Built inside `handleTalkRequest`
  in `backend/index.js` (until Phase 7b extracts it to `lib/talk_handler.js`).
- **iOS decoder**: Codex. Talk-response decoder + render contract.

## Access-control posture

**PER-USER**. Carries the user's transcript + LLM reply + audio +
screenplay cues + dialogue timeline. Never log full envelope to
deploy logs; the request id (`request_id`) is the safe correlation
key.

## Field set

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `ok` | boolean | yes | constant `true` on success |
| `request_id` | string | yes | request correlation id |
| `turn_id` | string | yes | canonical id for the saved turn; matches `GET /talk/turn/:turnId` lookup key |
| `session_id` | string \| null | yes | session lifecycle id |
| `state_version` | string | yes | for client-side cache invalidation |
| `transcript` | string | yes | what STT produced (may be empty when STT skipped) |
| `reply` | string | yes | LLM-rendered reply text |
| `audio_b64` | string \| null | optional | base64-encoded audio when TTS produced it inline |
| `audio_url` | string \| null | optional | URL when audio is streamed/uploaded separately |
| `audio_duration_ms` | int \| null | optional | total audio duration when produced |
| `audio_mime_type` | string \| null | optional | typically `audio/mpeg` or `audio/wav` |
| `screenplay_cues` | array | yes | per-cue objects; `[]` for non-screenplay turns |
| `dialogue_timeline` | object \| null | optional | per-line timing for synced playback |
| `screenplay_output` | object \| null | optional | full screenplay-output payload when produced |
| `render_contract` | object | yes | `{ reply_role, authoritative_page_text_available, sync_ready }` |
| `mode` | string | yes | one of `"text"`, `"voice"`, `"voice_text"` |
| `model` | string \| null | optional | LLM model used |
| `fallback` | boolean | optional | true when realtime supplier fallback was used |
| `fallback_reason` | string \| null | optional | reason code when `fallback` true |
| `lane` | string | optional | `"live"` / `"speculative_reuse"` / `"recovery"` |

### render_contract sub-fields

- `reply_role` — `"final"` (default) or `"draft"`. iOS playback
  strategy keys off this.
- `authoritative_page_text_available` — true when the response
  includes the formatted screenplay page text iOS should render.
- `sync_ready` — true when `dialogue_timeline` is suitable for
  per-word playback sync.

## Sample response

```json
{
  "ok": true,
  "request_id": "req_abc",
  "turn_id": "turn_def",
  "session_id": "sess_ghi",
  "state_version": "v9",
  "transcript": "Write the next beat.",
  "reply": "She lights a cigarette and stares at the rain.",
  "audio_b64": null,
  "audio_url": null,
  "audio_duration_ms": null,
  "audio_mime_type": null,
  "screenplay_cues": [
    { "character": "JUNE", "line": "(lighting a cigarette)" }
  ],
  "dialogue_timeline": null,
  "screenplay_output": null,
  "render_contract": {
    "reply_role": "final",
    "authoritative_page_text_available": false,
    "sync_ready": false
  },
  "mode": "text",
  "model": "gpt-4o-mini"
}
```

## Error envelope

```json
{ "stage": "talk_<stage>", "error": "<code>" }
```

Common stages: `talk_stt`, `talk_chat`, `talk_tts`,
`talk_memory_write`, `talk_idempotency`, `talk_rate_limit`,
`talk_session_serial`, `talk_concurrency`.

## Compatibility rules

- Additive new optional keys are fine within v1.
- `render_contract` adding a new `reply_role` value is additive
  (iOS treats unknowns as `"final"`); removing a value bumps to v2.
- `screenplay_cues` cue shape: adding fields is additive; removing
  is v2.

## Changelog

- 2026-05-14 — Doc created. Reflects shape produced by
  `handleTalkRequest` at this date. Will be amended when Phase 7b
  extracts the handler.
- 2026-05-14 (later) — Drift fix: removed `talk_status` and
  `recovery_applied` field entries plus the `talk_status` value
  in the sample envelope. Neither field is emitted by
  `handleTalkRequest` in `backend/index.js` today. `talk_status`
  appears in `backend/lib/ops_metrics_route.js` (aggregating
  over saved turns) but is NOT part of the per-turn `/talk`
  response. If these fields are added in a future Phase 7b
  extraction, update this doc in the same PR.

# talk-turn-meta envelope schema

Canonical response shape for `GET /talk/turn/:turnId`. Used by iOS
for offline replay, support inspection, and re-render of a saved
talk turn.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/talk/turn/:turnId` | turn-meta envelope (200), `{ error }` (404 / 403 / 429 / 400) |

## Schema version

`1` (no explicit `schemaVersion` in payload; iOS keys off the field
set itself). Future additive changes stay at v1; removals or
meaning-changes bump to v2 with an explicit `schema_version`.

## Owner

- **Backend / envelope shape**: support agent. The envelope is built in
  `backend/lib/talk_pipeline.js`'s `GET /talk/turn/:turnId`
  handler from a record stored by `storeTalkTurnMeta(...)` in the
  talk pipeline.
- **iOS decoder**: Codex.

## Access-control posture

**PER-USER**. The meta record contains the turn's transcript +
reply + screenplay cues. `canReadTalkTurnMeta(req, meta)` gates
the read: same user / IP / client-token as the writer. Other
callers get 403.

## Success envelope fields

| Key | Type | Required | Source | Notes |
| --- | --- | --- | --- | --- |
| `turn_id` | string | yes | meta.turnId | matches `:turnId` in URL |
| `session_id` | string \| null | yes | meta.sessionId | nullable for orphan turns |
| `user_id` | string \| null | yes | meta.userId | nullable when unauthenticated |
| `state_version` | string \| null | yes | meta.stateVersion | for cache invalidation |
| `transcript` | string | yes | meta.transcript | what STT produced; empty string if STT skipped |
| `reply` | string | yes | meta.reply | LLM output |
| `audio_duration_ms` | int \| null | yes | meta.audioDurationMs | total TTS duration; null when audio not produced |
| `timing_source` | string \| null | yes | meta.timingSource | which timer source produced the duration |
| `screenplay_cues` | array | yes | meta.screenplayCues | per-cue objects; `[]` when not a screenplay turn |
| `screenplay_output` | object \| null | yes | meta.screenplayOutput | full screenplay-output payload; null when not produced |
| `dialogue_timeline` | object \| null | yes | meta.dialogueTimeline | per-line timing; null when not produced |
| `next_beats` | string[] | yes | meta.nextBeats | up to 3 "Next:" beats parsed from the Page multipass plan stage (`CLEMENTINE_PAGE_MULTIPASS=1`); `[]` otherwise. Model suggestions, never writer canon — iOS must not write these back as `next_three_turns` |
| `render_contract` | object | yes | meta.renderContract | `{ reply_role, authoritative_page_text_available, sync_ready }`; defaults to `{ reply_role: "final", authoritative_page_text_available: false, sync_ready: false }` when not stored |
| `request_id` | string \| null | yes | meta.requestId | request correlation id |
| `updated_at` | int \| null | yes | meta.updatedAt / meta.createdAt | epoch ms |

## Response headers

- `Cache-Control: no-store` (always).
- `x-session-id: <sessionId>` when present.
- `x-state-version: <stateVersion>` when present.
- `Retry-After: <seconds>` on 429.

## Error envelope

```json
{ "error": "<code>", "retry_after_ms": <int|null> }
```

| Code | HTTP | Notes |
| --- | --- | --- |
| `invalid_turn_id` | 400 | `:turnId` empty after `normalizeTalkTurnId` |
| `turn_not_found` | 404 | no meta record for `turnId` |
| `forbidden` | 403 | `canReadTalkTurnMeta` returned false |
| `rate_limited` | 429 | `turnReadRateLimiter` rejected; includes `retry_after_ms` |

## Sample success response

```json
{
  "turn_id": "turn_abc123",
  "session_id": "sess_xyz",
  "user_id": "u_def",
  "state_version": "v789",
  "transcript": "Tell me what June does next.",
  "reply": "She lights a cigarette and stares at the city.",
  "audio_duration_ms": 4200,
  "timing_source": "tts_supplier",
  "screenplay_cues": [
    { "character": "JUNE", "line": "(lighting a cigarette)" }
  ],
  "screenplay_output": null,
  "dialogue_timeline": null,
  "next_beats": [],
  "render_contract": {
    "reply_role": "final",
    "authoritative_page_text_available": false,
    "sync_ready": false
  },
  "request_id": "req_ghi",
  "updated_at": 1700000000000
}
```

## Compatibility rules

- **Additive within v1**: new optional keys are fine.
- `render_contract` is load-bearing — iOS keys playback strategy
  off `reply_role` and `sync_ready`. Adding new `reply_role`
  values is additive (iOS treats unknown values as `"final"`);
  removing values is a v2 bump.
- `screenplay_cues` array shape: each cue object is unversioned
  today. Adding fields to a cue is additive; removing fields is
  a v2 bump.

## Changelog

- 2026-09-05 — Added `next_beats` (additive, v1): Page multipass plan-stage beats for the Studio next-beat pills.
- 2026-05-14 — Doc created. Reflects shape produced by
  `lib/talk_pipeline.js`'s `GET /talk/turn/:turnId` handler at
  this date.

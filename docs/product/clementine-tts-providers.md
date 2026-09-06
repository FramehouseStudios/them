# Clementine TTS providers (D010)

## Goal

Writers can keep the default THEM voice or connect **ElevenLabs BYOK** and pick a voice from their own library (including clones).

## Router

```text
spoken text
  → TtsRouter(provider)
       ├─ `default` — existing companion TTS path
       └─ `elevenlabs` — stream with user key + voice_id
  → playback
  → barge-in / stop → abort synthesis (same interrupt family as Page cancel)
```

## ElevenLabs v1

| Item | Rule |
| --- | --- |
| Auth | User `xi-api-key` in Keychain |
| Voice list | `GET https://api.elevenlabs.io/v1/voices` (or v2 search) with user key |
| Speak | `POST /v1/text-to-speech/{voice_id}/stream` (prefer stream) |
| Model | Flash/low-latency default; quality model optional |
| Billing | User’s ElevenLabs account |
| PII | Spoken sentence only |

## Non-goals (v1)

- Platform-paid ElevenLabs voice catalog
- Storing user ElevenLabs keys long-term as the primary design
- Mixing Muse Contributor with voice traffic
- A second barge-in implementation in the god views

## Build slices

1. Decision (this doc / D010) ✅
2. Backend or client `TtsProvider` interface + default adapter wrap
3. ElevenLabs list voices + stream speak + abort
4. iOS Voice settings: connect key, pick voice, persist provider choice
5. Wire Companion spoken output through router
6. Tests: request encoding, abort, no key leakage; manual barge-in smoke

## Related

- D008 Clementine Muse runtime (brain)
- D009 God-file strangler (extract TTS service; don’t grow RootExperienceView)

## Implementation notes (first slice)

- Server companion audio remains mp3 via `createTtsSupplier` / `backend/lib/tts_speech.js`.
- Provider kinds: `openai` | `elevenlabs_platform` (env `ELEVENLABS_API_KEY`) | `elevenlabs_byok` (per-request user key).
- Legacy env/persona value `elevenlabs` maps to **platform**, not BYOK.
- iOS stores BYOK key in Keychain; `/talk` receives `X-Tts-Provider: elevenlabs_byok` + `X-ElevenLabs-Api-Key` + `X-ElevenLabs-Voice-Id` only when the writer opts in.
- Do not change `INTERACTIVE_TTS_PROVIDER` default (`openai`) as a side effect of BYOK work.
- BYOK audio is billed to the user's ElevenLabs account (`walletBillable=false`).

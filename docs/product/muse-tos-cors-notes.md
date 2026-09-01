# Muse ToS / CORS / geo notes (Clementine)

> Companion to **D008** and `clementine-muse-runtime.md`. Legal gate before web BYOK; not a substitute for counsel review.

## CORS probe (web)

- Meta Model API browser CORS: **GO** for simple web probes (`Access-Control-Allow-Origin: *` observed on the public API surface used for Responses).
- CORS GO ≠ product green light. Still require ToS acceptance, age gate, and geo policy before shipping browser-held keys.

## Tier / model policy

- Companion + Page + Deep default: **`muse-spark-1.2` Standard only**.
- **Contributor is never the default** for Clementine traffic (data-for-discount contract ≠ companion pricing tier).
- Runtime: `https://api.meta.ai/v1` · Responses API · companion turns `store: false`.

## Age & restricted territories (summary)

- **18+** for Muse / Meta Model API use in product surfaces that call the API.
- **Restricted Territories:** do not enable Muse-backed features where Meta’s geo / export / services policies disallow Model API use. Keep a server-side allow/deny check; fail like a person (“I can’t spark from here”), not a raw JSON error.
- Re-read Meta’s current geo / prohibited-use lists before each launch gate — this note is a pointer, not a freeze of their policy text.

## BYOK paths

| Path | Posture |
| --- | --- |
| **Native BYOK** | Power-user path first. Key stays on device / user-controlled secret store; app calls Meta API directly (or via a thin native client). Preferred for launch. |
| **Proxied BYOK** | User key sent through our backend. **Only after legal review** (key handling, logging redaction, subprocessors, ToS flow). Not the default scaffold. |

Wallet UX still meters **days/weeks of Clementine**, not TPM — even when the user brings their own key.

## Links (authoritative)

- Meta AI / Muse terms of service (Model API): follow the current ToS linked from [https://www.meta.ai/](https://www.meta.ai/) and Meta’s developer / Model API documentation.
- Acceptable Use Policy (AUP): Meta’s AUP for generative / Model API use — enforce in product policy + safety id hashing.
- Geo / restricted services policy: Meta’s published restricted territories / export compliance pages for AI services.

Update this file when counsel signs off on proxied BYOK or when Meta changes CORS / geo posture. Bump `them-clementine-vN` only if voice-spec / persona material changes — not for legal-note edits.

## Change log

- 2026-09-01 — v0 skeleton with T-clementine-muse-runtime-skeleton (D008 follow-on).

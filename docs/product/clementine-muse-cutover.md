# Clementine Muse Standard cutover

> Server-only. Companion + Page (optional Deep) can generate via Muse Spark **Standard** (`muse-spark-1.2`) on Meta Model API `https://api.meta.ai/v1`. Never Contributor. Keys never ship to the client.

## Enable

In server env (see `backend/.env.example`):

```bash
MODEL_API_KEY=...          # or MUSE_API_KEY
CLEMENTINE_MUSE_ENABLED=1  # or CLEMENTINE_PROVIDER=muse
```

Both the flag **and** a key are required. CI / local default stays on the existing OpenAI `chatSupplier` path.

## Behavior

| Lane | When Muse flag+key on |
| --- | --- |
| **Reflex** | Still local templates only (no Spark) |
| **Companion** | Muse Responses; effort from `lanes.js` (`minimal`/`low`) |
| **Page** | Muse Responses; effort `low` (or `medium` multi-beat); abort signal + wallet commit |
| **Deep** | Muse Responses with `medium` effort when flagged |

`createMuseAwareChatSupplier` wraps the OpenAI supplier. Talk generation passes `req.clementine.lane` / `effort` and the page abort `signal`. Cache-stable `prompt_cache_key` comes from `cache_policy.js`.

## Ops notes

- Rotate `MODEL_API_KEY` / `MUSE_API_KEY` like other provider secrets.
- Do not put Muse keys in iOS / web bundles.
- Unit tests mock `fetchImpl` — no live Meta calls in CI.

## Change log

- 2026-09-01 — initial cutover gate (`T-clementine-muse-standard-cutover`).

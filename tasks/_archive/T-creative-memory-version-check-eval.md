---
id: T-creative-memory-version-check-eval
title: Pin the `version` field on creative-memory snapshots
owner: support
status: merged
branch: support/T-creative-memory-version-check-eval
pillar: evals (contract stability)
---

## Scope

`getCreativeMemoryForPrompt({ userId })` returns either `null` (cold
user) or an envelope whose canonical shape opens with `version`,
`userId`, `updatedAt`. iOS and the backend prompt-assembly path
both depend on `version` to know which decoding path to take. A
future refactor that drops the field would silently break every
consumer.

This eval pins:

1. Cold user → `null` (no envelope).
2. Seeded user → envelope with `version === 1` (current
   `SCHEMA_VERSION`).
3. Envelope has `userId` (non-empty string) + `updatedAt` (number).
4. `version` stays stable across multiple `recordCharacterMention`
   / `recordToneSignal` calls (a hot user doesn't bump it).

Wired via `npm run eval:creative-memory-version`.

## Done when

`backend/evals/run_creative_memory_version_eval.mjs` exits 0 with
all checks passing; `npm test` still green.

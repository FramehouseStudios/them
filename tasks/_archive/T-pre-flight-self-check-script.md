---
id: T-pre-flight-self-check-script
title: scripts/pre_flight.mjs — catch recurring review feedback locally
owner: support
status: merged
branch: support/T-pre-flight-self-check-script
pillar: infra (coordination)
---

## Scope

Ships proposal #2 of the second-pass efficiency protocol: a
one-shot self-check support agent runs **before** opening a PR. Catches
the recurring classes of review feedback locally so they don't
cost a full review cycle to surface and clear.

## Findings the script catches

| Check | Why | Reference |
|---|---|---|
| `route-needs-own-parser` | Route reads `req.body` without route-local `express.json()` | Codex #90 review |
| `middleware-error-escapes` | `next(new Error(...))` falls through to Express's default handler (HTML 500 instead of structured JSON) | Codex #87 review |
| `exported-const-not-frozen` | Exported ALL_CAPS array/object literal without `Object.freeze` | Codex canon-eval reviews (#160 / #161 / #163 / #164) |
| `console-log-in-lib` | `console.log` in `backend/lib/*` leaks to deploy logs (use `console.error`/`warn`) | hygiene |

Each finding lists file + line + a one-line explanation. Default
mode prints findings and exits 0; `--strict` exits 1.

## Current main snapshot

Running against `main` today surfaces 8 pre-existing findings:
- 6 `console.log` calls (outbox_snapshotter, outbox_store)
- 2 routes that read `req.body` without route-local parsers
  (character_trait_route, memory_character_mention_route)

The script defaults to **warn-only** so it can ship without forcing
those fixes in this PR. Once Codex cleans up the existing findings,
the strict-mode flip is a one-line CI change.

## Tests

`scripts/pre_flight.test.mjs` — 14 tests covering each check with
positive + negative fixtures + the --strict exit-code contract + a
real-repo smoke run.

## Done when

`scripts/pre_flight.mjs` runs cleanly against current main in warn
mode; `scripts/pre_flight.test.mjs` green.

## Follow-ups (not in this PR)

- Add `eval-missing-determinism-check` check (search
  `backend/evals/run_*_eval.mjs` for files without a determinism
  test).
- Add `schema-version-missing` check (search response envelopes
  for `return res.status(200).json({` without `schemaVersion`).
- Wire into a pre-push git hook (opt-in).
- Once existing findings are cleaned, flip CI to `--strict`.

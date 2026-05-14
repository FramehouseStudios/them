---
id: T-v1-status-npm-script
title: backend/package.json — npm run v1:status
owner: claude
status: review
branch: claude/T-v1-status-npm-script
pillar: infra (V1 visibility)
v1_pillar: infra
v1_effect: gives both agents a one-command V1 status check from the backend dir — `npm run v1:status` — alongside the existing `npm run eval:canon`
---

## Scope

Adds two npm scripts to `backend/package.json`:

```json
"v1:status": "node ../scripts/v1_status.mjs",
"v1:status:json": "node ../scripts/v1_status.mjs --json",
```

Wires the v1_status.mjs script (#243, merged) into the backend
package script index so it's discoverable next to the existing
`eval:canon` and `eval:v1-smokes` scripts. Same script, same
behavior — just a shorter command for ops.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: one-command V1 status check from the backend dir.
  Pairs with the existing eval:canon to give "run all V1
  tripwires" and "show V1 checklist progress" as two adjacent
  npm scripts.`

## Verification

```
cd backend
npm run v1:status
```

→ Emits the V1 status report.

```
cd backend
npm run v1:status:json | head -5
```

→ Emits the JSON envelope.

Pure additive change to `package.json` scripts; no code,
no test, no dependency change.

## Done when

Two npm scripts ship; `npm run v1:status` works from the backend
dir.

## Followups (not in this PR)

- Optional: a `npm run v1:status:diff -- --diff=HEAD~50` once
  the #269 `--diff` flag merges. Trivial follow-up.

---
id: T-creative-memory-export-projectids-ownership
title: Post-V1 — project-linked memory export with screenplay-store ownership scoping
owner: claude
status: proposed
branch: -
pillar: infra (backend architecture)
v1_pillar: memory
v1_effect: none (post-V1 follow-up; not on the V1 critical path)
---

## Why this exists

`GET /memory/export` shipped in V1 as **core-only** (creativeMemory /
characters / habits, strictly scoped to the requesting user). The
earlier draft also accepted `?projectIds=a,b,c` and returned
per-project logline history + accepted twists.

That expansion was **removed for V1** because it was an IDOR in a
privacy/data-control route:

- `getLoglineHistory({ persistence, projectId })` is keyed by
  `projectId` only — no owner column at the storage layer.
- The accepted-twist log key is `entry:<projectId>:<versionId>:<twistId>`
  — also projectId-keyed, with `userId` only as a non-authoritative
  field inside entries.
- Project ownership lives in a *different* subsystem
  (`backend/lib/screenplay_store.js` via `resolveScreenplayOwnerKey`),
  keyed differently.

So a caller could export another user's logline/twist history by
naming arbitrary project ids. Defense-by-id-unguessability is not
acceptable in a data-control route. Human/product-lead decision
(2026-05-16): ship core-only for V1; defer project-linked export to
this follow-up.

## What this task must decide + build (post-V1)

1. **Ownership model decision (needs human/Codex):** what is the
   authoritative "user X owns project P" lookup? Options:
   - derive from `screenplay_store` owner key,
   - add an owner column/index to logline + twist persistence,
   - or a dedicated project-membership store.
   This is a data-model decision, not a pure backend tweak — it
   should land as a `DECISIONS.md` ADR or a decisions-queue entry
   first.

2. **Implementation once ownership is decided:**
   - Re-introduce the `?projectIds=` param on `GET /memory/export`.
   - For each requested projectId, verify the resolved user owns it
     via the chosen ownership lookup; silently drop ids the user
     does not own (do not 403-enumerate).
   - Add `loglineHistory` / `acceptedTwists` back to the response
     under a bumped `schemaVersion`.
   - Cap projectIds per request (prior draft used 16).

3. **Verification:**
   - Test: user A requesting user B's projectId gets nothing for it
     (no leak), user A's own ids return data.
   - Closure check via `backend/tools/freevars.mjs`.
   - `pre_flight --strict` + full backend `npm test`.

## Out of scope

- Changing the V1 core-only export contract.
- Project deletion/export story (separate product decision; see the
  memory export/delete decision packet).

## Done when

The ownership model is decided and recorded, `?projectIds=` is
re-introduced with enforced ownership scoping + tests proving no
cross-user project data leak, and the V1 core-only contract is
preserved as the unscoped-default path.

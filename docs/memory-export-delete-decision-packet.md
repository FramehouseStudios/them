# Memory Export/Delete Decision Packet

This packet records the V1 privacy/data-control decision so the agents do not
reopen old PR threads.

## V1 Decision

| PR | Route | V1 state | What it does |
| --- | --- | --- | --- |
| #94 | `GET /memory/export` | Merged as V1 core-only | Returns a machine-readable export of what io.them remembers about the user, strictly scoped to the requesting user's creative-memory core. |
| #99 | `DELETE /memory/forget` | Out of V1 | Destructive deletion stays parked until a post-V1 deletion policy defines exact scope, copy, audit expectations, and project-artifact behavior. |

## What #94 Exports

#94 is read-only and has already shipped in its narrowed V1 form. Its response
includes:

- `schemaVersion`, `exportedAt`, and `userId`;
- the user's own `creativeMemory` record when one exists;
- derived character/trait/habit fields.

The route intentionally does not expose `projectIds`, logline history, accepted
twists, or project-scoped artifacts in V1. That expansion is deferred to the
post-V1 ownership-scoping task.

## What #99 Deletes

#99 is destructive and is not part of V1. Its old branch proposed deleting the
`creative_memory` domain for the user while leaving screenplay projects,
project drafts, logline history, accepted twists, auth records, and audit-style
system data untouched.

That narrow route may still be the likely post-V1 shape, but it needs product
copy and deletion semantics before it belongs in a release.

## Codex Recommendation

Current release-owner decision:

1. Treat PR #94 as done for V1.
2. Keep PR #99 out of V1.
3. Reopen deletion only as a post-V1 task with explicit destructive-action
   copy, scope, audit, and project-ownership decisions.

Conservative default: no destructive memory delete route ships in V1.

## Post-V1 Answer Needed

Before deletion returns to the launch lane, answer:

> Should `DELETE /memory/forget` remove only creative-memory companion context,
> or should it also delete project-scoped screenplay artifacts and derived
> memories?

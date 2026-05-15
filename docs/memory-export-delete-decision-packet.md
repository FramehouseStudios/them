# Memory Export/Delete Decision Packet

This packet exists so the human can decide the two parked privacy/data-control
PRs without reading old PR threads.

## Current Parked PRs

| PR | Route | Current gate | What it does |
| --- | --- | --- | --- |
| #94 | `GET /memory/export` | `tier-3`, `needs-human`, dirty against current `main` | Returns a machine-readable export of what io.them remembers about the user. |
| #99 | `DELETE /memory/forget` | `tier-3`, `needs-human`, `do-not-merge`, dirty against current `main` | Deletes the user creative-memory record. |

## What #94 Exports

#94 is read-only. Its response includes:

- `schemaVersion`, `exportedAt`, and `userId`;
- the raw `creativeMemory` record when one exists;
- derived character/trait/habit fields;
- optional project-scoped logline history and accepted twists when `projectIds`
  is supplied.

The route is intended for the Data Controls "Export Memory JSON" flow. It is
privacy-sensitive because it can expose the user's stored creative memory in
one document.

## What #99 Deletes

#99 is destructive but scoped. Its current implementation deletes the
`creative_memory` domain for the user. It does not delete screenplay projects,
project drafts, logline history, accepted twists, auth records, or audit-style
system data.

That narrow scope is the safest V1 shape: "forget what the companion remembers
about me" without surprising the writer by deleting screenplay work.

## Codex Recommendation

Approve the V1 data-control pair with these constraints:

1. Merge #94 only after Claude rebases on current `main`, reruns backend tests,
   and the in-app surface labels the file as a memory export.
2. Merge #99 only as a creative-memory-only delete for V1.
3. Do not delete screenplay projects, loglines, accepted twists, auth records,
   or audit/system records until a separate product decision defines a
   project-deletion/export story.

Conservative default if the human does not answer: keep both PRs parked.

## Exact Human Answers Needed

For #94:

> Yes, Codex may clear the privacy gate and merge the full memory export route
> after Claude rebases on current `main` and tests are green.

For #99:

> V1 delete is creative-memory-only. Codex may clear the privacy gate and merge
> #99 after Claude rebases on current `main`, tests are green, and the route
> remains scoped to `creative_memory`.

Anything broader should become a new decision and a new task.

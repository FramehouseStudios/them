# T14 G3 Backend Feature Snapshot Triage

Status: routed, no unique snapshot commits remain.

## Source Snapshot

- Source branch: `codex-save-primary-folder-20260420`
- Remote head: `7b3a4023d7c3a6467fae356c03e2cc86fba579c6`
- Local head: `1db7ea51f9fcbaa1b8e75f3fb066d6b16ff518dc`
- Triage branch: `codex/T14-g3-snapshot-triage`
- Audit date: 2026-05-10

Both the local and remote source branches are ancestors of `origin/main`.
`origin/codex-save-primary-folder-20260420` has no diff against `origin/main`
with the branch as merge base, and `codex-save-primary-folder-20260420` has no
commits that are not already contained by `origin/main`.

## Finding

The G3 snapshot does not need to be split into fresh merge branches anymore.
The old snapshot commit landed before the current task protocol, and subsequent
support agent/Codex PRs have already turned the useful backend work into named lanes.
Opening another PR from either snapshot branch would now be harmful: it would
try to restore an older tree and remove newer packages, craft work, realtime
work, persistence work, task ledger entries, and docs.

## Snapshot Areas Already Routed

| Area in snapshot | Current route or open lane |
| --- | --- |
| Backend auth, user store, persona, companion state | Absorbed into the current backend baseline; future persistence work belongs to T07/T07a/T07-cutover. |
| Memory and prompt assembly | Routed through T08/T08-postgres/T08w follow-ups and `docs/T08-prompt-centralization-and-memory-tier.md`. |
| Screenplay/craft intelligence | Routed through T18/T20/T21/T22/T23 plus Codex follow-up PRs T24/T25/T26. |
| Realtime supplier and voice backend work | Routed through T13 and `docs/T13-realtime-supplier-interface.md`. |
| Hollywood format linting | Routed through `T-format-linter` and `docs/T-format-linter.md`. |
| Studio smoke/eval scripts | Folded into the current backend/eval suite; new eval gate work remains support agent-owned. |
| App studio shell changes | Superseded by the current modular app/package structure and Codex Studio polish PRs. |
| Generated audio/test assets in stale local tree | Do not restore; they are not part of a mergeable backend lane. |

## Do Not Merge From The Snapshot Branches

`git diff codex-save-primary-folder-20260420..origin/main` shows the local branch
predates substantial current work. Merging or cherry-picking from it directly
would reintroduce stale app files and delete modern task/protocol files.

Use these branches only as historical reference:

- `codex-save-primary-folder-20260420`
- `origin/codex-save-primary-folder-20260420`

## support agent Handoff

No backend implementation PR is needed from T14. support agent should continue from the
already named backend rows instead of mining the old snapshot:

- T07/T07a/T07-cutover: persistence adapter hardening and Postgres cutover.
- T08w/T08-postgres: creative memory triggers and persistence adapter migration.
- T23: craft completeness RC gate.
- T-format-linter follow-ups, if any, against the landed linter endpoint.

## Completion Criteria

- Unique commits on the G3 source branches: none.
- Unique remote diff requiring split: none.
- Orphaned backend feature work: routed into named tasks above.
- Remaining action: archive/delete the stale source branches after humans agree
  no one needs them as historical bookmarks.

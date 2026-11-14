# Clementine runtime compatibility

Implements the identity direction in #630 without changing bundle identifiers,
Keychain services, authentication audiences, URLs, or the orb. Visible THEM
branding is a separate change. This is not a deployment or a phone acceptance test.

## Contract

- Backend modules and active prompt labels use Clementine.
- New servers emit both `x-clementine-presence` and `x-samantha-presence`.
- New clients prefer the canonical header and accept the legacy header.
- Project normalization retains existing presence history. Previously, the
  production normalizer discarded this field during reload/commit.
- Mutations dual-write canonical and legacy records, with a serialized baseline.
  A legacy-only change wins when canonical still equals the baseline; canonical
  wins an ambiguous conflict. No clock ordering or automatic history merge.
- Read-only header generation does not migrate or mutate projects.

## Adversarial review

- **Answered:** legacy reload, repeated migration, malformed canonical fallback,
  conflicting records, mutable alias separation, old/new headers, and an actual
  authenticated owner-store restart with preserved history have regressions.
- **Answered:** another account cannot read the original project. The existing
  API permits the same project ID in separate owner namespaces; a regression
  proves a second owner's write leaves the first owner's title/history intact
  and does not copy presence history into the second owner's record.
- **Partial:** legacy-only writer behavior is simulated against persisted data.
  This does not prove safe rollback to old main: its normalizer drops presence.
  Do not downgrade to that normalizer after migration; keep the preservation
  fix in any rollback release. No production migration is authorized by tests.
- **Not covered:** PostgreSQL restart, process termination during storage commit,
  live provider quality after prompt-label changes, and physical-phone workflow.
- **Not claimed:** optional presence mutators are fully wired into live turns.
  The imported header path is verified, not the entire companion behavior.

## Review scope

The diff exceeds the approximate 400-line target because it includes the existing
project-normalizer extraction, regression coverage, and deletion of a 248-line
unimported root duplicate. These are mechanical movement/deletion except for
presence preservation. Review the migration helper and real persistence test
first. Unrelated shared worktrees were not changed.

The historical selection seed is intentionally unchanged, avoiding incidental
prompt sample-selection drift. Legacy wire/storage names remain only as
compatibility identifiers, not as a second companion identity.

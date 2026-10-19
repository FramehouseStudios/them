# Original mentor-core PR: current-main proof

## Identity and preservation

- Original PR: #638, `claude/mentor-core-port`.
- Original head: `6ad41171276e9c314ef2b12d818d5eff7463ab71`.
- Current main inspected: `deac1a6d54a65dbf5f849f0f35476ad4ff07e1f0`.
- Local proof branch: `codex/T-982-mentor-core-main-proof`.
- Preserving merge: `a5e02304f2637aaabe71cf553cd346637a6e4b3c`.
  Its two parents are the original head and current main, in that order.
  Both ancestor checks passed; the merge had no conflicts. No replacement PR,
  squash, force push, main merge or original remote-head update was performed.

The original PR body and complete production diff were read again. The
eleven-file diff against main remains the original mentor-core implementation
and tests; current main's recovery and required-gate changes are retained.

## Repository recovery (environment, not an app fix)

During work, the previous checkout's `.git` file still referenced
`/Users/halfmutantfilms/Desktop/io.them/.git/worktrees/codex-exact-recovery-integration`,
but that metadata path no longer existed. Subsequently the original
`/Users/halfmutantfilms/Documents/framehouse.studio.v01` workspace path was also
absent. Their cause/location is unknown. Codex did not delete, move, reset,
clean or overwrite those directories.

Recovered the already-pushed T-981 head
`7459a8fa2756595d6b807d390f66a51e2fbee220` into new independent metadata at
`/Users/halfmutantfilms/io.them-worktrees/_git/them-recovery-20261019.git`
and a new linked checkout at
`/Users/halfmutantfilms/io.them-worktrees/codex-release-recovery-20261019`.
At this recovery checkpoint the old worktree was not relinked or modified. The recovered head was exact
and clean. A read-only comparison found zero differences across 1,505 tracked
files, excluding one environment file. No untracked credentials, data or
signing files were copied. The six PostgreSQL gate safety tests passed on
the recovered T-981 tree. This does not recover unrelated unpushed refs or
prove that other linked worktrees have working metadata.

The human then requested a full search and recovery out of iCloud Trash.
Spotlight and the filesystem search located both missing repositories in
`~/Library/Mobile Documents/.Trash`. The trashed Desktop repository contained
the exact T-981 head and original worktree metadata. With explicit permission,
it was moved to `~/THEM-Recovered-2026-10-19/io.them` (outside iCloud), and
`git worktree repair` updated its registered linked-worktree pointers. The
active original worktree again reports the exact T-981 head and clean status.
No source edits were discarded. A separate move of `framehouse.studio.v01`
was still inside the macOS rename syscall when last checked, not claimed done.
An additional 38 project-related files/bundles were recovered with relative
paths preserved; the follow-up filename audit found only that pending folder.

## Proof state

- D009 against current main: PASS; all five deltas zero, index.js 33,626 lines.
  The human's accepted exception retains this existing count until the later
  stack establishes 33,603.
- `git diff --check`: PASS before documentation.
- Locked dependencies installed with scripts disabled under Node 20.20.2.
  Installer warns about existing Multer 1.x vulnerabilities and deprecated
  jsrsasign; this PR does not resolve those dependency risks.
- First full backend attempt: 2,743 pass / 2 fail / 2 skip. Both shell-helper
  failures attempted `spawnSync("cc")` in the plain Alpine image without a
  C compiler (null exit status), not an app assertion. No tests/assertions
  were removed or weakened. The established `them-security-test-tools:node20`
  image supplies cc/bash/ps with the same Node 20.20.2. Focused file: 13/0/0;
  full suite in that image: **2,745 pass / 0 fail / 2 skip**, 73.437 seconds,
  external network disabled. Logs: `/tmp/them-982-backend.log`,
  `/tmp/them-982-shell-focused.log`, `/tmp/them-982-backend-tools.log`.
  No provider credentials forwarded.
- Signed full iOS units: **633 pass / 0 fail**, on erased task-owned simulator
  `11CF5EFB-D8C3-4F19-8062-28AF37F27D93`; signing was not disabled.
  Log: `/tmp/them-982-ios-units.log`; artifacts `/tmp/them-982-ios`.
- Writer UI and macOS build: not yet run on this merge.

Original PR proof and the larger rehearsal's proof are not substitutes for
this updated head. Writer UI/macOS remain outstanding on this merge.

## Separate hosted evidence

PR #963 head `7459a8fa` run `39291024623`, backend job `118191387370`:
2,892 pass, zero failures, two skips; the required actual PostgreSQL/backend
restart gate passed under Node 20.20.2 and PostgreSQL 16.15 with the
6,600-line, 422,201-byte synthetic draft. Owned-resource cleanup completed.
The Quality Gate was still running when inspected. This is neither proof of
a generated 120-page screenplay nor production/physical-phone proof.

## Remaining gates

Finish and inspect the exact live proof handles; fix the first failure,
then complete writer UI/macOS verification before updating original #638.
Required independent approval and current hosted checks still apply.
Render sign-in remains human-owned. No production setting, secret, paid model
call, or physical-phone journey was changed or claimed here.

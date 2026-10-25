# T-1140 — A missing god-file baseline is not a passing comparison

## Scope

Worktree `/Users/halfmutantfilms/io.them-worktrees/codex-god-baseline-authority`;
branch `codex/T-1140-god-baseline-authority`, base
`a0bab6a58240c289c232117ca862ef2a8966cd08`, the locally proven original640
candidate. This changes the canonical gate, its isolated regressions and docs,
not app/backend runtime, providers, workflows, protections or production.

## Reproduction and root cause

T-1139 observed an explicit parent ref missing locally: all comparison counts
were null, yet the tool reported status ok and exit0. Fetching the real parent
and rerunning supplied valid proof, but the CLI itself still needed correction.

The canonical script accepted an unvalidated GITHUB_BASE_REF and treated a
failed `git show` exactly like no measured growth. No baseline, missing objects,
and a genuinely new file were therefore capable of producing false success.
`--allow-growth` also masked the unavailable-comparison state.

Fresh isolated fixture repos: **2 pass /5 fail /0 skip** before the fix. The
failures are missing requested parent, allow-growth with missing parent, no
baseline, new monitored file, and misleading successful text output. This is
direct CLI behavior, not a regex-only test or a production-network probe.

## Smallest canonical correction

- Require the selected baseline to resolve to an actual commit. Do not silently
  compare a different branch when an explicit requested parent is unavailable.
- Unavailable/unreadable comparisons have failed=true, status unverified and
  an actionable fetch explanation; no success footer. JSON errors appear only
  on failed verification, preserving the valid-case fields.
- A file absent from a valid parent is measured from zero. Genuine growth still
  fails; an explicitly approved allow-growth diagnostic still permits measured
  growth, but never makes unknown history verified.
- Keep the canonical monitored-file list and all valid-baseline behavior.

The regressions copy the real CLI into mkdtemp-owned fixture repositories.
Git directory/index/global config overrides are not inherited. No real worktree,
user Git identity, network, simulator, provider or private environment is used.
Cleanup is restricted to those test-created temporary directories.

## Proof and boundaries

- Node20.20.2 `node --test scripts/check_god_files.test.mjs`: **7/0/0**.
- `node --check scripts/check_god_files.mjs` and `git diff --check`: pass.
- Real original-parent comparison with the fetched5722514 baseline: index
  33626→33581, Studio17435→17431, other three unchanged; exit0 with real counts.
- `git diff --exit-code a0bab6a -- backend them themTests themUITests Packages .github`:
  pass. Therefore no unchanged backend/native/writer run was repeated. Those
  source-identical inherited proofs remain backend2779/0/2, signed646/0/0,
  writer1/0/0 and Mac build; they are not new runs on this script-only slice.
- Archive `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1140-20261025.iksDgg/`
  retains before/fixed logs and actual-parent JSON.

Exact files: `scripts/check_god_files.mjs`, `scripts/check_god_files.test.mjs`,
`TASKS.md`, `docs/god-baseline-authority-2026-10-25.md`.

This gate proves line-count comparison only, not correctness/security or a
working physical iPhone. Preserve all required checks and independent human
review; no public head, main merge or production change occurs in this task.

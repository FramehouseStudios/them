# Reconnect data-safety baseline — 2026-09-27

## Target and evidence

DECIDED: fix the remembered-base reconnect conflict without hiding genuine
cross-device changes or replacing offline writer text. No live provider calls,
main pushes, auto-merges, or merges without explicit human approval.

VERIFIED before implementation on untouched PR #738, `b76f49bf`:

- Remote main: `647e01fcf17730d301aaa8a5072255ca7494c53c`.
- Open PRs: 140; #638–#738: 101 draft PRs forming a continuous base chain.
  Every base is listed in `draft-stack-baseline-2026-09-27.md`.
- #633 (visible THEM rename): open, base main.
- Node 20.20.2 `npm test`: 2,838 tests, 2,836 pass, 0 fail, 2 skip
  (real PostgreSQL and opt-in live provider).
- Signed Debug `themTests` on erased E37CE808: 790 pass, 0 fail.
- God-file gate versus origin/main: five files pass; deltas -23, -21,
  -184, -256, 0 for index, Studio screen, Root, bridge, memory API.
- Clean working tree and `git diff --check` pass.
- Actions run 36358986615: three failed jobs, zero steps; check annotation:
  account locked due to billing.
- Main protection requires one review and only `God-file gate (D009)`;
  unit/backend checks are not required protection contexts.
- `https://api.them.io/healthz`: HTTP 302 to domain parking, not API health.

Local evidence: `/Users/halfmutantfilms/io.them-worktrees/_proof/codex-baseline-20260927/`
contains `open-prs.json` (every open PR and base), `backend-tests.log`,
`themTests.log`, and `themTests.xcresult`. No credentials were copied.

## Binary acceptance

1. Offline edits survive close and reconnect, saving against their proven base
   when that base is still current, without a false conflict.
2. A different server version still rejects stale edits and preserves both
   drafts for explicit resolution.
3. Focused and full tests, signed erased-simulator proof, god-file gate and
   diff check pass. Live microphone/provider behavior is not claimed from mocks.

## Human clearances

- OpenAI: fund the provider project and confirm top-up before any live model run.
- GitHub: resolve the account billing lock, then rerun required Actions checks.
- Hosting/DNS: point api.them.io to the intended deployed API with valid TLS;
  verify a non-redirecting health response before release.
- Apple signing/TestFlight: human must supply/approve signing and distribution
  access; no account sign-in or private material handling by this session.
- Store metadata/privacy: human must approve the actual data-use answers.
- Stack landing: explicit human merge approval; stop at first red gate.

## Recovery investigation

VERIFIED before the runtime change:

- New signed cold-offline-launch / typing / online-relaunch test passed.
- Adding a competing server edit exposed an unsafe recovery path: after
  Recover Local, the UI reported the recovered text saved instead of a conflict.
  The regression failed. See `offline-recovery-proof.xcresult` and
  `competing-edit.png` in the local evidence directory.
- `restoreDraftFromRecovery` retained the already loaded server version when
  the recovery copy's base was empty. That silently rebased old words onto an
  unseen server revision. A failed initial project selection could also publish
  an empty view-model version over the same page's remembered bridge version.
- The older `test_screenplay_save_outbox_survives_relaunch_and_reconnects_once`
  failed before runtime changes: its launch-triggered edit never appeared and
  queue count remained zero. Its post-failure result flush stalled and was
  interrupted; this run is not a pass. Fixing that fixture remains separate.

The scoped fix preserves a known same-project base before the first successful
fetch, establishes it before hydration, and sends unknown recovered bases
through the existing empty-base conflict preflight. It does not weaken server
`reject_if_stale`, infer equivalence from timestamps, or claim legacy unknown
bases are safe to overwrite.

VERIFIED after the fix: 10 focused binding tests and both signed iPhone UI
workflows pass on erased E37CE808. The unchanged-server case reads the saved
words from the server and verifies text/version restoration on another launch.
The competing-server case keeps the offline words unsaved with a conflict and
reads back the unchanged competing draft from the server. Evidence:
`recovery-fix-focused.xcresult` (12 tests, zero failures).

VERIFIED full signed unit regression after the fix: 793 tests, zero failures,
freshly erased E37CE808; `themTests-final.xcresult`. God-file gate and
`git diff --check` pass. None of the five files tracked by the current gate
was changed by this patch.

VERIFIED post-fix Node 20 full regression: 2,838 tests, 2,836 passed,
zero failed, two external-service skips; `backend-post-fix.log`.

Not covered: historical records whose base was already lost, the older
launch-triggered outbox fixture failure, reconnect without relaunch, process
termination during acknowledgement, real speech/provider quality, and physical
device/TestFlight validation. Unknown legacy bases require explicit resolution;
the app must not guess that a later server revision is safe to overwrite.

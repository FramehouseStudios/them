# Reconnect data-safety baseline — 2026-09-27

## Target and evidence

DECIDED: fix the remembered-base reconnect conflict without hiding genuine
cross-device changes or replacing offline writer text. No live provider calls,
main pushes, auto-merges, or merges without explicit human approval.

VERIFIED before implementation on untouched PR #738, `b76f49bf`:

- Remote main: `647e01fcf17730d301aaa8a5072255ca7494c53c`.
- Open PRs: 140; #638–#738: 101 draft PRs forming a continuous base chain.
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

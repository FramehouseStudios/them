# Original #904 — current CI foundation reconciliation, 2026-11-12

This private preserving merge retains original #904 `909f9e9075c5e074d45e93575b371a69f7e96ffb`
and published original #964 `831de836e6becf76a97edf244188177d2a624619`.
The actual common base is `5faa43d6c087813be926246be14f3425ad651880`.
Both live refs were verified before preparation; the genuine #964 branch was fetched
and its exact identity checked before D009. No PR, remote branch, main, review or
production setting was changed.

## Preserved behavior and bounded reconciliation

- The only two merge conflicts were the workflow artifact list and the shared UI
  reveal helper. Raw conflicts and all six index stages were retained with hashes.
- Keep both existing recovery bundle globs and the new destination-diagnostic JSON
  globs. Retain all required stages, three contexts, 105-minute budget and explicit
  provider-credit approval fence.
- Keep #904's canonical viewport-aware reveal owner and delegation. Check full
  visible bounds before requesting hittability, preserving the original viewport,
  target-relative bounded gestures, swipe limits and optional hittability behavior.
- Retain #964's known-state Autosave checks: initial On, one tap, observed Off.
  Missing or unrecognized accessibility values are not evidence of Off.
- The combined CI fixture initially failed because #904's real quality script runs
  its recovery-runner contract but the incoming owned fixture lacked those scripts.
  Reuse the exact seven-line optional canonical-script copy block from existing
  `bd4096a3d3ec86d5270a2a94937fbb9f740c211e`; do not disable or stub the gate.

The complete app, backend, unit, Packages and project trees remain byte-exact to
original #904. TASKS and the existing recovery-runner/resolver scripts are unchanged.
The new UI helper order and incoming strict Autosave checks are test code, not an
app-runtime fix. Original #919 `510b7c68` retains its separate caret, durable-conflict
and observer ownership work; none was imported wholesale into this parent.

## Verification and limits

- Before the fixture repair: focused CI contracts **16 pass / 2 fail / 0 skip**.
  Both failures named the missing recovery-runner test in an owned temporary fixture.
- After: **49 pass / 0 fail / 0 skip**, Node **26.7.0**, across the CI provider,
  canonical V1 runner, recovery runner and destination-collector contracts.
  These use owned fake native/process tools, not a real simulator or backend.
- Node/Bash syntax, unique-key YAML parsing, staged diff checks and source identities
  passed. D009 against the genuinely fetched #964 head: Studio **-4**, Bridge **-23**,
  remaining three monitored files **0**. The inherited index remains 33,626 lines
  under the accepted early-stack exception; no growth was introduced.
- No native compilation/test, full backend suite, signing, model/provider, store,
  server or macOS build was run here. No fresh whole-product proof is claimed.
  #964's previous exit70 host cause remains unresolved; diagnostics preserve that
  failure rather than claiming to repair it.

Private retained evidence:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1435-original-904-parent-20261112-luna`.
This contains both red/green contract logs, raw/staged conflicts and source/D009
manifests. Hosted proof and required genuine review remain pending; no publication
or main merge is authorized by this local preparation alone. The physical-phone
journey and production hold remain separate and unresolved.

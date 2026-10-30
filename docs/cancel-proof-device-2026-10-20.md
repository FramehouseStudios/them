# T-1048 — Exact-device proof for Page cancellation

## Preserved boundary and actual failure

Original #966 `1e86467cedd5e323ebfc1a13ab1b8471711bc6f7` is preserved
by normal merge `9ac152db` with original #964 `81b05e44`. Only TASKS.md
conflicted; both histories were retained. Original #966 remains based on
wallet isolation #965, not replaced by a new security PR. No main merge,
force push, squash or public history rewrite.

Hosted39330023996/job118325553494 completed with signed units624/0/0 and
integrated writer loop passing, then failed V1 UI initialization with an
accessibility loading timeout before its test bodies. The log erased
B34C2F57 while the actual unit result names E839A11B / iOS26.5. That is
a verified proof-device mismatch, not proof it caused the AX timeout.
Evidence was posted before changing the branch:
https://github.com/FramehouseStudios/them/pull/966#issuecomment-6288904090.

Reuse the existing canonical exact-ID runner and truthful result verifier
from #964. Local selection must be explicit/task-owned. Resolve one UDID,
erase/boot/test that same device with signing enabled; reject appended
destination overrides or signing-disable flags before erasing. The existing
save harness also retains the earlier port31337, async backend drain and
actual-summary/no-skips corrections rather than a second proof protocol.

## Scope and risk

Compared with original #966: no changes in them/, themTests/, themUITests/,
backend/lib/, backend/index.js, package.json or package-lock.json. The
cancellation/auth/wallet implementation and original tests remain intact.
Changes are existing proof scripts, harness/helper, evidence regression,
task history and documentation. No provider credentials or network calls.

Answered by canonical runner contracts: ambiguous/mismatched selectors,
unavailable runtime, boot/Xcode failures, unsigned/override arguments and
false-green missing/skipped result summaries. Not answered: whether the
hosted AX launch timeout recurs on the correctly selected device. Fresh
exact-head hosted checks remain required; do not retry an unchanged red.
Neither this runner correction nor fixture-based typing proves physical
microphone generation, production persistence or the shipping backend.

## Verification checkpoint

VERIFIED: pinned Node20.20.2 container, external network disabled,
tracked-source archive `/tmp/them-1048-node20.Nyb63T`, no host .env or
provider credentials: runner contracts26/0/0; focused cancellation and
actual-summary evidence cases26/0/0; full backend2753/0/2, native exit0.
Log `/tmp/them-1048-node20.log`. The skips are the real-Postgres prefix
case without DATABASE_URL and the conditional Page-write response case;
neither is passing live-model or database evidence.

VERIFIED: signed Studio direct-typing workflow1 passed /0 failed /0
skipped, native exit0. The runner resolved/erased/booted E8998A6B and
the actual summary identifies that same owned375-point iPhone SE,
iOS26.2/23C54. Bundle:
`/tmp/them-1048-signed-launch/v1-ui-smoke-local-1-46917.xcresult`;
log `/tmp/them-1048-signed-launch.log`. No local26.5 runtime installed;
this does not certify the hosted26.5 AX problem resolved.

Retained logs and actual summary JSON:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1048-20261020.GaDtVa/`.
D009 passes with all five deltas0; node/bash syntax and whitespace pass.
No new macOS build or full signed unit bundle is claimed for this
proof-only merge. Previously recorded source-identical unit results remain
historical, not freshly run. No paid model call or deployment.

Publish as a normal fast-forward of original #966, retain its wallet #965
base and draft status. Fresh exact-head required hosted checks and an
independent review remain mandatory. Main is still deac1a6d. Existing
production/App Store-credential hold remains unchanged.

## Exact changed files relative to original #966

- TASKS.md
- backend/evals/run_screenplay_save_network_fault_ui_smoke.mjs
- backend/evals/studio_ios_writer_loop_contract_helpers.mjs
- backend/tests/screenplay_save_evidence_contract.test.mjs
- scripts/resolve_ios_simulator.mjs
- scripts/run_screenplay_save_network_fault_smokes.sh
- scripts/run_screenplay_save_network_fault_smokes.test.mjs
- scripts/run_v1_ui_smoke.sh
- scripts/run_v1_ui_smoke.test.mjs
- scripts/run_voice_network_fault_smokes.test.mjs
- docs/main-simulator-proof-2026-10-19.md
- docs/recovery-proof-truth-2026-10-19.md
- docs/cancel-proof-device-2026-10-20.md

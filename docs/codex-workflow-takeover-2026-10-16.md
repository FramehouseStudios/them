# T-977 — One Codex-owned execution workflow

## Human direction and scope

DECIDED by the human on2026-10-16: Claude is no longer part of the workflow;
replace its active execution/coordination machinery with Codex. Codex owns
implementation, review, integration and verification. The human retains
product authority and genuinely human-only approval/credential/device actions.
No handoff briefs to another assistant, no waiting for a retired lane.

Useful original code, PR heads, commits and authorship are preserved. Existing
provider adapters, Clementine, the orb and aesthetic are untouched. No blanket
rename of runtime providers or historical evidence. No accounts, credentials,
permissions, protection settings or auto-merge changes in this branch.

## Root causes removed

VERIFIED old agent_next and prompt printers still generated support-lane
assignments from stale2026-09-05 coordination data. The launch-room command
mixed old checklist percentages and release snapshots into current guidance.
New ownership regressions initially0 passed/5 failed. One canonical
scripts/codex_workflow.mjs now owns all four internal CLI entrypoints.
The old names remain compatibility delegates, including --role=support, but
cannot dispatch another assistant. Unsupported historical queue options fail
explicitly rather than quietly recommend obsolete tasks. JSON contract is
schemaVersion2; removed internal lane/checklist fields are intentionally not
presented as a backward-compatible public client/server API change.

Existing Launch Doctor recording and explicitly supplied report reading still
work. The original unchanged report-reader test passes. Only validated summary
metadata is returned; malformed content is not echoed. Stored report status
never changes workflow readiness from UNVERIFIED and is not current build proof.
The command no longer scans home folders or release-secret files by default.

Historical coordination rows remain byte-for-byte intact apart from additive
workflow metadata; their original updatedAt/updatedBy are not refreshed to
imply new GitHub verification. Inboxes and old handoff snapshots are labeled
historical; TASKS.md is the current task owner. The historical ledger CLI warns
on reads and refuses writes. Tests prove a rejected assignment leaves bytes
unchanged. This is workflow hygiene, not a security authorization boundary.

Old-lane/report contracts initially4 passed/11 failed after delegation. Obsolete
priority/role/checklist expectations were deliberately migrated, not skipped.
Useful report recording/reading remains covered by its original four tests.
This cohesive internal migration removes more than a thousand obsolete lines;
the approximate small-diff preference is exceeded to avoid retaining a second
active dispatcher. No god-file refactor or app implementation rewrite.

## Proof

Frozen tracked workflow source tree `aca6b6254a71c457da7a55051779ef10bfa00e4f`;
tracked-only snapshot `/tmp/them-977-node20.bqHjb0`, no local env files copied.
Final complete host script suite **221 passed /0 failed /0 skipped**, all35
test files: `/tmp/them-977-final-script-suite-v2.log`. Pinned Node20.20.2,
image them-proof-node20-943, network disabled: workflow, alias, report,
coordination/schema and CI merge-safety contracts **28/0/0**,
`/tmp/them-977-node20-focused.log`. Syntax and diff checks pass. D009 versus
T-976 all five growth deltas0.
Private retained before/intermediate/final logs:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-977-20261016.TETjNo/`.

Backend, Swift, project, Packages and UI-test trees are unchanged from T-976;
no new app test/model/physical-device proof is claimed. Backend2875/0/2 and
Home2/0/0 are prior-head source-identical evidence; signed units852/0/0,
writer1/0/0 and macOS exit0 remain their explicitly scoped earlier proof.
No paid model calls. Shipping/phone/120-page generation remains unproven.

GitHub readback: auto-merge-tier1 remains disabled_manually. #906 b2994b00
still independently approved; run39006472727 reached required V1 UI smoke,
not complete at this checkpoint. No main merge or bypass. Resume original
#651 0b2496f3 after this process-only task; preserve its complete original head.

## Exact files

- `AGENTS.md`
- `TASKS.md`
- `docs/README.md`
- `docs/agent-throughput-protocol.md`
- `docs/claude-inbox.md`
- `docs/codex-inbox.md`
- `docs/coordination.json`
- `docs/live-handoff.md`
- `docs/support-inbox.md`
- `docs/codex-workflow-takeover-2026-10-16.md`
- `scripts/agent_next.mjs`
- `scripts/agent_next.test.mjs`
- `scripts/codex_workflow.mjs`
- `scripts/codex_workflow.test.mjs`
- `scripts/coordination_state.mjs`
- `scripts/print_codex_prompt.mjs`
- `scripts/print_support_prompt.mjs`
- `scripts/v1_launch_room.mjs`
- `scripts/v1_launch_room.test.mjs`

# T-1003 — Integrated voice/writer safety, not isolated green branches

## Preserved inputs and conflict decisions

Base T994198ab3f0 preserves original billing625, exact-byte retention and real
PostgreSQL proof/cleanup plus older-iPhone compile compatibility. Preserve
its prior full-SE UI28 pass/1 fail/15 skip; do not call it green retroactively.

Normal no-ff merges preserve T996d82b3757 (compact confirmation test reveal),
T997e68957fe (durable receipt authority), T9981e699629 (writer destination and
advice cost routing), and T1002919b2151 (wallet/cancel isolation, upload parser
error handling and adversarial cases). Original PR heads/main unchanged.
Task-ledger conflicts retain both complete histories, not a selected side.
App runtime auto-merges inspected, including the writer-receipt guard and
existing cancellation/wallet response contract. No assertion weakening.

Dependency conflict: the rehearsal ALREADY includes original909788e0107,
runtimef1549115, preserved by a4755332; see security-integration-proof-2026-10-16.md.
Keep its package.json/lock exactly: Multer2.4.0, proxy-addr2.0.8, fast-uri3.1.8.
Do not replace it with the separately tested main-based2.3 candidate. The new
branch's useful additive work is safe parser error handling and security/
compatibility regressions. Original909 provenance/code stays intact.
Main still has old dependencies until reviewed changes land; installed-tree
proof does not change that. No dependency security claim from audit0 alone.

## Current combined evidence

- VERIFIED focused43/0/0, host Node26, /tmp/them-1003-focused.log: advice vs
  Page cost, real handler empty/prose billing, two-user wallet identity,
  owner-scoped cancellation, real authenticated malformed voice requests,
  supported audio buffers/limits/abort, proxy and URI regression controls.
- VERIFIED D009 all five deltas0 versus the original T994 parent; no god file
  grows versus main either. Whitespace clean; original package lock retained.
- Full pinned Node20 and signed combined pipeline are next, not yet passing.
  Use only exact owned Pro11CF5EFB-D8C3-4F19-8062-28AF37F27D93 and narrow
  SE3E8998A6B-35B1-49E3-896C-861550849927/iOS26.2, erased by canonical runner.
- Separate fixed-provider output from real speech/model quality. No paid
  calls, production deployment, phone or generated120-page proof here.
- Original961e689 hosted backend/D009 pass; overall hosted UI still running
  at latest read. Original625 hosted V1 has AX system-app timeout; retain red.
  No unchanged reruns or downstream original PR promotion based on local only.

## Completion boundary and next action

Do not call the goal complete. Full backend, signed units, authenticated save/
offline/relaunch conflict recovery, writer/export/restoration, raw audio Home,
full narrow UI, fault/macOS and actual PG restart must prove this combined tree.
Even all of these green would not prove the intended shipping backend, real
iPhone microphone, creative quality or an actual correctly formatted120-page
script with exact external export. Human-only production/review holds remain.

## Exact integration files

The runtime/test changes are preserving merges of the exact file inventories
in docs/compact-clear-confirmation-2026-10-19.md,
docs/conflict-base-authority-2026-10-19.md,
docs/advice-cost-lane-2026-10-19.md, docs/wallet-owner-scope-2026-10-19.md,
docs/page-cancel-owner-2026-10-19.md, docs/http-dependency-patches-2026-10-19.md
and docs/voice-upload-security-2026-10-19.md. Additional direct files:

- TASKS.md
- docs/integrated-voice-writer-2026-10-19.md

# Hermes review for THEM — 2026-10-26

## Decision and scope

**DECIDED:** use Hermes as a source of engineering patterns, preserving THEM's
SwiftUI/Node architecture, orb, Clementine, screenplay editor and established
visual language. Adopt no runtime, cloud account, provider, package or asset.
The first implementation reuses THEM's own preserved overlap-recovery repair
`e31f3512cd670eb56a1bacbb2f93a844dc1d5646` rather than importing foreign code.

**VERIFIED:** reviewed repository
[FramehouseStudios/hermes-desktop-os1](https://github.com/FramehouseStudios/hermes-desktop-os1/tree/bea7d24aa03c1834b80390345c8875eaf9ae6502),
default branch `main`, pinned commit
`bea7d24aa03c1834b80390345c8875eaf9ae6502`. Read the actual clone, not just its
README. Its package targets macOS 14+; its only Swift package dependency is
vendored SwiftTerm. Its README describes an early desktop operator workspace
for remote Hermes installations, not a screenplay engine or evidence that
THEM's real-phone journey works.

Review coverage: inventory and SHA-256 of all **254 tracked files**; **116
first-party Swift files / 41,261 lines**; **22 test files**; **74 vendor files**.
Deep source reading covered the entry/root composition, relevant AppState
flows, file writes, connection and terminal storage, provider credentials and
validation, SSH/Orgo transports, voice session server and MCP bridge, Doctor,
knowledge uploads, theme, and associated tests/docs. Other desktop feature
panels, localization, vendored terminal implementation and binary assets were
inventoried/scanned rather than fully audited line by line. This is a reuse
assessment, not a security certification of all upstream code. No Hermes app,
installer, cloud operation, MCP package or paid provider was executed. No
upstream test pass is claimed.

## What helps the writer

| Pattern and source | THEM finding and disposition |
| --- | --- |
| [Conflict-aware file writes](https://github.com/FramehouseStudios/hermes-desktop-os1/blob/bea7d24aa03c1834b80390345c8875eaf9ae6502/Sources/OS1/Services/FileEditorService.swift#L194): expected content hash, temporary file, file/directory fsync, atomic rename | **VERIFIED gap, fixed here:** THEM's live sync preserved no-base replacements but omitted local recovery when an agreed-base overlap could not merge. Extend its existing recovery call before remote replacement. Keep server version checks; a hash check followed by rename is not itself a transaction against concurrent writers. |
| [Doctor health checks](https://github.com/FramehouseStudios/hermes-desktop-os1/blob/bea7d24aa03c1834b80390345c8875eaf9ae6502/Sources/OS1/Views/Doctor/DoctorViewModel.swift#L93): distinguish transport, runtime, token validity and downstream connection, with manual refresh and specific recovery actions | **RECOMMENDATION:** extend existing `TalkDiagnosticsSheet` and canonical backend health/failure owners to distinguish microphone permission/capture, authenticated backend, queued request, provider failure, received reply and saved version. Read existing evidence without a model probe. Do not add another diagnostics tab or automatic paid health loop. Unknown/stale status must remain unknown, with last-checked time. |
| [Workspace-scoped async application](https://github.com/FramehouseStudios/hermes-desktop-os1/blob/bea7d24aa03c1834b80390345c8875eaf9ae6502/Sources/OS1/App/AppState.swift#L2193): verify workspace after suspension | **VERIFIED existing THEM direction:** retain authenticated owner + origin + project/request identity around async replies, recovery, saves and export. A desktop workspace fingerprint is not server-side authorization and must not replace THEM's ownership checks. |
| [Change-only transcript presentation](https://github.com/FramehouseStudios/hermes-desktop-os1/blob/bea7d24aa03c1834b80390345c8875eaf9ae6502/Sources/OS1/App/AppState.swift#L2241): signature before rebuilding display models; background computation and scope checks after awaits | **RECOMMENDATION:** profile THEM's actual element sync and status-driven renders; extend its existing debounce/change-only owners where measurements show duplication. Do not copy two-second full-transcript polling into screenplay sync. Measure routes and keystroke/render cost before changing cadence. |
| [Protocol-owned transport routing](https://github.com/FramehouseStudios/hermes-desktop-os1/blob/bea7d24aa03c1834b80390345c8875eaf9ae6502/Sources/OS1/Services/MultiplexedRemoteTransport.swift): product services depend on one interface | **DECIDED:** keep THEM's existing clients/provider/TTS adapters and one canonical error/recovery path. No second voice transport or agent supervisor is introduced. |
| [Semantic theme roles](https://github.com/FramehouseStudios/hermes-desktop-os1/blob/bea7d24aa03c1834b80390345c8875eaf9ae6502/Sources/OS1/Theme/OS1Theme.swift): shared palette, typography and motion | **DECIDED:** use THEM's own existing typography/theme owners for future polish. Preserve screenplay Courier, iPhone readability and accessible status text. No OS1 wordmark, boot sound, DM Sans or palette replacement. Desktop fixed-width panes are unsuitable as iPhone layout templates. |
| [Knowledge archive validation](https://github.com/FramehouseStudios/hermes-desktop-os1/blob/bea7d24aa03c1834b80390345c8875eaf9ae6502/Sources/OS1/Services/KnowledgeBaseService.swift): archive limits and path/link checks | **RECOMMENDATION:** if script/reference uploads are extended, use canonical upload validation, independent compressed and expanded limits, file-type checks, project authorization and explicit permission to use private material. Treat uploaded text as story/source data, never instructions granting tools. Do not add a second generic Markdown vault or global character memory. |

## Patterns to reject or strengthen before reuse

These are static findings and transfer decisions, not demonstrated attacks on
the running upstream app.

- **VERIFIED:** the voice loopback server accepts `/session` and `/tool`
  requests without an application session/capability token or explicit
  Host/Origin validation. Tool routing checks the `orgo_` prefix. A loopback
  address and a name prefix are not sufficient authorization for THEM's
  project edits. Retain authenticated, schema-validated, project-scoped actions.
- **VERIFIED:** `RealtimeOrgoMCPBridge` defaults to `npx -y @orgo-ai/mcp`
  without a version pin, starts a process for listing and each tool call, and
  synchronously reads stdout without a request deadline in that code path.
  Reject this as an iPhone dependency or a replacement for Clementine's
  bounded capabilities. No package was installed during the review.
- **VERIFIED:** browser voice registers a sample calendar, automatically
  starts after a timer, and keeps function-call dedupe in a JavaScript Set.
  It does not provide THEM's durable screenplay mutation receipt, project
  save acknowledgement or crash-safe cost settlement. A conversational
  greeting is not voice-to-saved-page proof.
- **VERIFIED:** the native web view grants media requests through its UI
  delegate without checking the requesting origin there. THEM should keep
  explicit microphone permission and a visible, truthful listening state.
- **VERIFIED:** provider validation calls `/models`; successful listing does
  not prove generation, voice, quota or persistence. The upstream Doctor also
  maps an indeterminate update distance to `upToDate` in one branch. Borrow
  granular checks while keeping unknown distinct from healthy.
- **VERIFIED:** provider credential lookup may fall back from a profile key
  to a Mac default. Do not transplant that fallback into multi-user THEM.
  Keep existing Keychain custody and server ownership boundaries.
- **VERIFIED:** Orgo can retry a command through the direct VM after proxy
  failure. Ambiguous failures may occur after a side effect. THEM must retain
  durable request identities/reconciliation rather than blindly repeating a
  generation, wallet debit or screenplay append through another provider.
- **DECIDED:** exclude SSH, terminal, VNC, mail, Telegram, cloud provisioning,
  schedulers and broad computer-control tools from this reuse pass. They add
  cost and privileges without closing the current writing/recovery gaps.

## License and attribution

**VERIFIED:** the root [MIT license](https://github.com/FramehouseStudios/hermes-desktop-os1/blob/bea7d24aa03c1834b80390345c8875eaf9ae6502/LICENSE)
names Element Software, Orgo and dodo-reach; substantial copied source must
retain its copyright and permission notices. Third-party notices identify
SwiftTerm/Three.js under MIT and DM Sans under OFL. This change copies no
Hermes implementation or assets. The runtime repair is preserved THEM code,
with its origin explicitly recorded above. Review each dependency/asset's own
license before any future direct import; a repository-wide license is not a
reason to skip that step.

## Implemented boundary and remaining priorities

**VERIFIED:** in `reconcileRemote`, recovery previously ran only when
`mirrorSeq == nil`. With an agreed base, a failed rebase selected the channel
and skipped recovery. The fix calls the same existing owner/project-scoped
recovery method whenever no merge exists and the texts differ, before applying
remote text. The ViewModel still filters saved/empty text. Successful
non-overlapping merges and no-base duplicate prevention retain their behavior.
No conflict resolution policy, network contract, backend or dependency changes.

Remaining work, in execution order:

1. Finish saved T1173 server-owned Page budgeting: its committed red fixture
   shows caller caps omitted/0/1 reaching generation with only 0.1 Page turns.
   Do not confuse successful reply replay with correct billing.
2. Complete durable Page settlement/reconciliation across crashes and retries
   using the preserved canonical implementation; retain transaction/owner
   evidence. This review does not finish that boundary.
3. Connect actual iPhone screenplay export and observe the exported file open
   outside THEM; a DEBUG test artifact is insufficient.
4. Improve existing voice failure/status presentation using the staged
   diagnostics pattern, then profile duplicate sync/render work.
5. Integrate reviewed original heads through required GitHub gates and prove
   the real-phone writing/rewrite/offline/relaunch/export journey against the
   intended backend. Production and main remain held; no live model claim.

## Proof record

- Baseline `c128ec2`; red source `8033db1`: signed overlap regression
  **0 passed / 1 failed / 0 skipped**, missing recovery copy (`0 != 1`).
- Runtime source `554fe98f76440cce6a74fb170e379a760c3fc395`: final signed
  iOS units **886 passed / 0 failed / 0 skipped**. Includes the reproduced
  overlap, preservation-before-apply ordering, exact UTF-8 words/emoji/trailing
  whitespace, newly opened recovery store/model and the existing Restore
  action. Existing non-overlap/no-base/own-echo/project-switch cases pass too.
- macOS scaffold build: **BUILD SUCCEEDED** on the same runtime source.
- Backend, dependencies and project settings are unchanged from `c128ec2`.
  No fresh backend suite was run for this Swift-only repair. The parent's
  recorded Node20 result **2911 passed / 0 failed / 2 skipped** remains
  inherited evidence, not a new test result.
- Task-owned simulator: `91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A`, erased before
  each run, normal signing; no other device touched.
- D009 against fetched exact saved parent: index **33494**, Studio **17345**,
  Root **14933**, bridge **12788**, Memory API **10463**, all unchanged; pass.
- `git diff --check`: pass. No paid model, microphone, physical-phone,
  production or upstream runtime proof is claimed.
- Permanent local evidence:
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1174-20261026.uVJkwS/`.
  Contains both xcresults, final summary, macOS/D009 logs and the pinned
  upstream file/hash inventory. Results do not prove a two-device network
  race, a process-kill recovery or the entire integrated main journey.
- Git scope: dedicated `codex/T-1174-hermes-recovery-review`, based on saved
  `c128ec2`; red `8033db1`, runtime `554fe98`. Original PR heads, main and
  production unchanged. T1173's `a37ef3b` remains preserved with its budget
  red; integrate this scoped repair while resuming that task.

# Exact original recovery draft identity — T-1036

Parent: `7f53d719828d91536763d2e26e4c0eea68c38465`.
Frozen source tree: `de5fbe8a7db0b8fa4493113fc2a34aae22f552ad`.

The original revision/excerpt cannot detect unsaved changes. Both existing
Root page-request preparation functions now capture SHA256, UTF-8 byte count
and UTF-16 length of the exact current draft. No trim, Unicode normalization,
full-draft duplication or new storage owner. Empty first-page bases are valid.
The existing request context/outbox/receipt carries this optional identity;
deduplication cannot replace it. Older records decode nil, never today's draft.
Manual payload serializers do not send the local identity to the provider.

The metadata type moves from BackendMemoryAPI to its own file. Extraction
comparison verified byte-identical existing fields/isMeaningful behavior,
apart from the one added local property. Full-result GET digest verification
uses the same typed exact-text digest owner. No server contract change.

## Evidence

- Signed focused27/0/0, actual xcresult summary read, native exit0; erased
  owned Pro26.2(23C54), signing enabled. Includes the real loopback client's
  provider-quota/interrupted-reply recovery, context relaunch/dedup/replay,
  legacy decode, and long full-page retrieval including digest/auth failures.
- Exact identity checks distinguish visually equivalent Unicode, whitespace,
  CRLF and valid empty bases; known SHA256 vectors and Codable round-trip pass.
- Pinned Node20.20.2, external network disabled: relevant existing Swift-source
  contracts12/0/0. No full backend rerun; no paid provider or real speech claim.
- D009 against freshly fetched original parent: BackendMemoryAPI -114 lines,
  other four protected deltas0. Whitespace and mechanical extraction checks pass.
- Final macOS scaffold BUILD SUCCEEDED, native exit0. Runtime source remained
  frozen at b5b89323; later changes are documentation only. Existing unrelated
  concurrency warnings remain. This is a build, not a macOS UI run.

Signed bundle: `/tmp/them-1036-focused/v1-ui-smoke-local-1-1789.xcresult`.
Logs: `/tmp/them-1036-focused.log`, `/tmp/them-1036-source-contracts.log`,
`/tmp/them-1036-macos.log`.
Private proof: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1036-20261019.ZsRGog/`.
The completed signed bundle was cloned/byte-compared; logs retained privately.

## Remaining connected behavior

This is a necessary guard, not recovered-page application. No Apply control
is added until original project/auth/base/anchor identity, explicit preview,
durable save request identity and acknowledgement are connected. Existing
read/share remains available to legacy records. Identity alone grants no edit.

Review of the current editor found a concrete next boundary: both native
replacement resolvers can fall back to a stored line range without matching
the original target text, or to current selection when unresolved. Reproduce
and fix that shared insertion boundary before reusing it for recovered writes;
do not silently authorize an unrelated line because its number still exists.

No original PR advancement/main merge, production change, paid call or phone
proof. The old #962 head's hosted gate remains held, not declared resolved.

Files: them/BackendClient.swift, them/BackendMemoryAPI.swift,
them/BackendStudioThreadCommitMetadata.swift, them/RecoveredTalkReply.swift,
them/RootExperienceView.swift, them/ScreenplayDraftContentIdentity.swift,
themTests/BackendClientCraftAPITests.swift,
themTests/ScreenplayDraftContentIdentityTests.swift, TASKS.md and this record.

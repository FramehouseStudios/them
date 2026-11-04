# Unassigned legacy recovery vault — Zora handoff (2026-10-29)

## Scope and result

- **Base:** `99c5e57bb88f49c4a1073310e96e6ea662a72f2c`
- **Branch:** `codex/T-1208-unassigned-legacy-vault`
- **Worktree:** `/Users/halfmutantfilms/io.them-worktrees/codex-zora-unassigned-legacy-vault`
- **Owned files:** `them/UnassignedLegacyRecoveryVault.swift`, focused tests, and this handoff only.
- **VERIFIED:** the helper type-checks with warnings as errors. A standalone deterministic harness passes 7/7 grouped checks.
- **NOT VERIFIED:** XCTest execution, app compilation, iOS file-protection behavior, simulator/UI, migration integration, and physical-device export.

## Contract

`UnassignedLegacyRecoveryVault` is append-only protected custody for v1 recovery data whose historical backend and document cannot be proven. Owner, project, storage-key, and slot values are explicitly hints. Every public descriptor and export is labeled:

`unassigned_legacy_origin`

The helper exposes no attach, send, backend, document, delete, purge, or source-removal API.

### Source construction

```swift
let source = try UnassignedLegacyRecoverySource.propertyList(
    ownerHint: ownerHint,
    projectHint: projectID,
    legacyStorageKeyHint: ownerScopedDefaultsKey,
    slot: .ordinary, // or .preservedConflict
    candidate: exactCandidateDictionary
)
```

The convenience constructor accepts exactly the four known v1 candidate fields and uses a fixed Codable binary-plist schema, making reconstructed upgrades deterministic. Extra or malformed fields throw instead of being silently dropped. Callers must preserve those cases by constructing an `.opaque` or `.binaryPropertyList` source with the full arbitrary `Data`. Invalid/corrupt bytes are valid evidence and are preserved; reveal simply returns no decoded draft fields.

### Copy and verification

```swift
let result = vault.preserve(source, capturedAt: now)
```

Results:

- `.verified(descriptor)`: a protected candidate was exclusively created, fully written and file-`fsync`ed, reopened and digest-verified, promoted with `RENAME_EXCL`, directory-`fsync`ed, and reopened from its canonical path.
- `.alreadyVerified(descriptor)`: a prior canonical record was reopened and matched the complete exact source bytes and historical hints.
- `.unconfirmed`: invalid size, unavailable protection, lock contention, partial/corrupt vault evidence, I/O failure, or any mismatch. The source must remain untouched.

The record ID is a domain-separated SHA-256 digest over the exact source payload, owner hint, project hint, storage-key hint, slot, and encoding. Re-running the same upgrade is idempotent. A changed copy written by a downgraded build gets a different record and both remain in the vault.

The vault itself never removes the v1 source. Integration may remove one exact active-v1 slot only after:

1. `.verified` or `.alreadyVerified`;
2. rereading the current v1 source;
3. reconstructing the source and proving it still equals the preserved source byte-for-byte and hint-for-hint;
4. removing only that exact slot without touching another ordinary/preserved copy;
5. rereading UserDefaults to verify the intended slot is absent and all other source copies remain.

If any step is unconfirmed, retain both source and vault evidence.

### Inventory, reveal, and export

```swift
vault.inventory()
vault.reveal(recordID: descriptor.recordID)
vault.export(recordID: descriptor.recordID, exportedAt: now)
```

Inventory returns validated descriptors plus `unconfirmedEvidenceCount`. Interrupted candidates, corrupt JSON, and unexpected files increment that count and remain on disk.

Reveal returns exact source `Data` and optional decoded fields. Decoded draft/base are exposed as UTF-8 `Data`, not normalized strings. Reveal grants no mutation authority.

Export returns an in-memory `application/json` artifact containing the exact source payload as base64, its authenticated record metadata, an export digest, and this warning:

> Origin unknown. This export is device-local recovery evidence and must not be auto-attributed or sent to a backend.

The UI/export presenter decides where to save the artifact. The helper never opens Files, writes outside its vault, or talks to a backend.

## Storage and failure behavior

- Default root: `Application Support/io.them/UnassignedLegacyRecovery/v1/`.
- iOS device storage requests and verifies `FileProtectionType.complete` on the root, lock, candidate, and canonical file.
- A nonblocking vault-wide `lockf` lock serializes cooperating processes.
- Creation uses `O_CREAT | O_EXCL`; promotion uses `renameatx_np(..., RENAME_EXCL)`. Existing/corrupt evidence is never replaced.
- A partial or protection-failed candidate remains hidden evidence. A later exact preserve call may validate and promote it. Inventory reports any remaining candidate as unconfirmed evidence.
- A corrupt or unreadable canonical record blocks replacement/export for that ID and remains byte-exact.
- Oversized source payloads (over 4 MiB), oversized hints, non-finite timestamps, invalid/path-like record IDs, and locked protected data fail closed.
- There is intentionally no automatic cleanup. Account deletion/local purge remains a separate human/privacy decision.

## Deterministic evidence

- Production helper plus the existing protected-recovery primitives: `swiftc -warnings-as-errors -typecheck` — **PASS**.
- Standalone harness — **PASS 7/7**:
  1. exact property-list/UTF-8 copy and reveal;
  2. idempotent exact re-upgrade;
  3. additional changed downgrade copy;
  4. corrupt opaque source preservation;
  5. interrupted candidate retry and promotion;
  6. exact unknown-origin export contract with no backend/document fields;
  7. corrupt canonical retention and fail-closed reveal/export.
- Focused XCTest source adds the same negative paths plus oversize/path traversal refusal.
- Simulator and native jobs — **NOT RUN** by assignment.

## Precise gaps and integration action

- This helper does not enumerate `UserDefaults`, choose which v1 entries qualify, write migration markers, or remove active v1 slots. Jarvis owns that adapter and its exact slot-level copy→verify→reread→remove transaction.
- `UserDefaults.dictionary` exposes logical property-list values, not the original preferences-file byte range. `propertyList(...)` preserves the exact field values and UTF-8 strings in a binary plist, but cannot claim byte identity with the underlying `.plist` file representation. If raw preferences bytes are required, integration must supply them as `.opaque` data.
- The helper does not map outbox provenance or attach a record. Provenance mapping requires a unique durable outbox proof and remains outside this commit.
- The helper does not filter records by the signed-in account. Owner hints may help inventory presentation but are not authorization because IDs can collide across backends.
- An older downgraded build can still read any active v1 slot until integration removes that exact source after verified vault custody. New v1 copies created later are preserved as additional vault records on re-upgrade.
- Export JSON validation by an external consumer is not implemented. The artifact includes all digest inputs so a future versioned verifier can be added without changing custody.

**Next:** Jarvis should review/cherry-pick the helper, implement the exact v1 adapter and marker logic outside the Studio UI god files, and run focused migration tests that inject interruption before vault write, after verified vault write, before exact source removal, and after removal verification. UI should remain inventory/reveal/export only until a separately reviewed explicit attach design exists.

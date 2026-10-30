# Protected screenplay recovery overflow — Zora handoff (2026-10-29)

## Scope and result

- **Base:** `e41820be7438ca835fe41fa988f00698d0c00281`
- **Branch:** `codex/T-1207-protected-recovery-overflow`
- **Worktree:** `/Users/halfmutantfilms/io.them-worktrees/codex-zora-protected-recovery-overflow`
- **Scope:** independent store helper, focused store tests, and this handoff only. No Studio UI/model wiring was changed.
- **VERIFIED:** the production helper type-checks with warnings as errors. A standalone deterministic harness passed 9/9 grouped checks covering exact UTF-8 crash-boundary recovery, canonical backend/document isolation, locator discovery across document rotation, wrong-document delete refusal, locator-only interruption cleanup, distinct-candidate retention, candidate-only exact deletion, concurrent exclusive promotion, and concurrent exclusive locator creation.
- **NOT VERIFIED:** the XCTest bundle did not execute, the signed app did not compile, and no simulator or physical-device journey ran in this lane.

## Contract

`ScreenplayRecoveryOverflowStore` owns one bounded protected overflow record per project/backend scope, while the authenticated record remains bound to its exact document origin:

`normalized owner + trimmed project + canonical HTTP(S) backend origin + trimmed document ID`

The owner and project/backend locator scopes are independently domain-hashed. The locator identifies the exact document record without trusting the caller's current document ID:

`Application Support/io.them/ScreenplayRecoveryOverflow/v2/<owner digest>/.<project-backend digest>.locator.json`

`Application Support/io.them/ScreenplayRecoveryOverflow/v2/<owner digest>/<project-backend-document digest>.json`

The v2 envelope retains all raw normalized identity fields, a canonical UUID record ID, exact draft and base-version strings, the saved-time bit pattern, and a domain-separated SHA-256 integrity digest over the complete identity and content. Project ID alone never authorizes display or deletion. Invalid or unverifiable backend origins fail closed.

The store exposes four fail-closed operations:

1. `load` returns missing, a validated snapshot, or unconfirmed. Corrupt, non-file, permission-denied, protected-data, ambiguous-candidate, and lock-contention states are unconfirmed rather than missing.
2. `discover(ownerUserID:projectID:backendURL:)` follows the protected locator and validates the exact document-bound record. It therefore survives an accepted-load document-ID rotation without broadening delete authority.
3. `saveIfVacant` creates the locator before recovery bytes, recognizes the exact draft/base bytes already present, stores only into a vacant project/backend scope, returns occupied for a distinct valid copy even under another document ID, and returns unconfirmed without replacing corrupt, ambiguous, or unreadable state.
4. `deleteIfMatching` requires the exact origin scope and exact validated snapshot previously presented. It reopens every physical copy under the project/backend lock immediately before explicit deletion. A wrong document, distinct, unreadable, or changed record is retained. Successful exact deletion also retires only its matching locator.

Drafts remain capped at the existing 2 MiB save boundary. Oversized or invalid inputs fail closed without creating a recovery record.

## Crash, contention, and downgrade behavior

- A write exclusively creates the project/backend locator before it creates the project-addressable hidden candidate: `.<scope digest>.pending.<record UUID>.json`.
- Locator creation uses `O_CREAT | O_EXCL`; a contending writer cannot replace the winning locator. Its file and containing directory are `fsync`ed before any recovery candidate is created, making the locator-first crash order durable. A readable locator without any recovery record is treated as an interrupted locator-first write and is removed under the project/backend lock. An unreadable or corrupt locator blocks reuse and is retained.
- Candidate bytes are fully written and file-`fsync`ed, complete protection is requested, and the candidate is reopened and validated before promotion.
- Promotion uses Darwin `renameatx_np(..., RENAME_EXCL)`, a true atomic no-replace rename. A destination that wins concurrently cannot be overwritten.
- All helper operations also take a nonblocking advisory `lockf` lock on a protected per-project/backend lock file. `@MainActor` serializes cooperating in-process calls; the lock serializes cooperating processes.
- After interruption, relaunch inventories the canonical file plus every project-addressable candidate. One validated logical record is recoverable and promoted when possible. Multiple distinct records or any unreadable/corrupt candidate return unconfirmed, with every byte retained.
- No valid or corrupt candidate is auto-deleted. Exact physical duplicates of the same authenticated logical record may be removed only through `deleteIfMatching`.
- Physical iOS storage requests and verifies `FileProtectionType.complete` on the version root, owner directory, lock, candidate, and canonical file. Locked protected data blocks reads and writes without being treated as absence.
- The dedicated v2 Application Support directory is unknown to older builds. Their UserDefaults recovery clears, live-draft cleanup, and save-outbox deletion do not target it. New debug reset wiring must remove this root explicitly; production sign-out must not.

## Integration seam for Jarvis

Discovery requires the normalized owner, project, and canonical backend URL. Exact load, save, acknowledgement, and deletion also require the document ID. If the exact snapshot origin cannot be proven, do not acknowledge or delete overflow; keep the visible page and fail closed.

Recommended reconciliation:

1. Try the ordinary and preserved UserDefaults slots using the current preferred-slot policy.
2. Only when both are valid and occupied, call `saveIfVacant` with owner, project, canonical backend, and document identity for the current page.
3. Treat stored or present as secured. Treat occupied or unconfirmed as a hard preservation failure: keep current page bytes on screen, stop remote application, and offer export/retry.
4. On relaunch or accepted project reload, call `discover(ownerUserID:projectID:backendURL:)` before preserved and ordinary recovery. Surface the retained overflow even if the app rotated its current document ID or the overflow is older by timestamp; do not infer supersession from age.
5. Do not delete overflow because it resembles server hydration. Retire it only after an exact authoritative acknowledgement whose owner, project, backend, and document match the snapshot, or after explicit writer discard, using that exact snapshot with `deleteIfMatching`.
6. After restore, retain the copy and surface the next unreviewed candidate. Track visited identities for the review session so retained slots do not loop forever.

## Known limits

- This is one third logical slot, not unbounded history. A fourth distinct unsaved page must fail closed and remain visible/exportable; no slot may rotate automatically.
- A valid locator whose record is missing is cleaned as an interrupted locator-first write. This is safe only because the locator contains no screenplay bytes; any unreadable locator or recovery candidate remains preserved and blocks reuse.
- The helper `fsync`s locator and candidate contents and synchronizes the directory after locator creation. It does not yet synchronize the directory after candidate creation or promotion, so it cannot promise candidate/canonical directory-entry survival across every sudden-power-loss boundary.
- `lockf` is advisory. Safety assumes all app-owned writers use this helper. A noncooperating process with container access can bypass the lock; `RENAME_EXCL` still prevents promotion replacement.
- A process can still terminate between exclusive file creation and a complete write. That partial candidate remains project-addressable, is never auto-deleted, and deliberately blocks reuse as unconfirmed evidence.
- Complete file protection intentionally makes recovery unavailable before first unlock or while locked. The caller must retry after protected data becomes available.
- SHA-256 provides corruption/integrity evidence, not authentication against a process already able to modify the app container.
- Pre-integration v1 helper artifacts are preserved in the separate v1 directory but are not automatically migrated because they lack backend/document identity and cannot be safely attributed.
- Normal operation does not quarantine or auto-delete corrupt files. They block reuse so support/export can preserve their bytes.
- App uninstall, OS container purge, or an explicitly authorized account-local deletion can remove the file. Whether backend account deletion should purge local recovery remains a separate privacy/product decision.

## Evidence

- `swiftc -warnings-as-errors -typecheck` on the production helper plus the owner-policy stub: **PASS**.
- Standalone deterministic v2 harness: **PASS 9/9 grouped checks**.
- Standalone concurrent `RENAME_EXCL` stress: **PASS 500/500 races**; every race produced exactly one promotion and one destination-exists result.
- Standalone concurrent `O_EXCL` locator-creation stress: **PASS 500/500 races**; every race produced exactly one creation and one destination-exists result, and the destination always contained one complete winning payload.
- Focused XCTest source was updated with document-rotation discovery, wrong-document deletion refusal, locator-only interruption cleanup, missing-locator backfill, exact locator retirement, occupied cross-document refusal, concurrent locator creation, crash-boundary, ambiguous/corrupt candidate, candidate-only exact-delete, origin-isolation, and concurrent-promotion cases.
- Standalone test-source type-check: **SKIPPED/UNAVAILABLE** because the command-line Swift SDK could not resolve the `XCTest` module outside an Xcode test target.
- `xcodebuild test` on `them-macOS-scaffold`: **SKIPPED/UNAVAILABLE** because `themTests` is not a member of that scheme.
- Signed macOS scaffold build: **BLOCKED before Swift compilation** because no matching Mac development provisioning profile is installed. Profile generation was not authorized.
- Simulator and physical-device work: **NOT RUN** by delegation.

## Next integration action

Jarvis should independently review and cherry-pick this commit, use `discover(ownerUserID:projectID:backendURL:)` when selecting recoverable overflow, preserve exact snapshot origin fields for acknowledgement cleanup, and continue requiring the exact document ID for deletion. Then run the focused XCTest bundle and authenticated recovery UI proof in his task-owned native environment.

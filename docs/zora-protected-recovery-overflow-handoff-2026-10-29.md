# Protected screenplay recovery overflow — Zora handoff (2026-10-29)

## Scope and result

- **Base:** `e41820be7438ca835fe41fa988f00698d0c00281`
- **Branch:** `codex/T-1207-protected-recovery-overflow`
- **Worktree:** `/Users/halfmutantfilms/io.them-worktrees/codex-zora-protected-recovery-overflow`
- **Scope:** independent store helper, focused store tests, and this handoff only. No Studio UI/model wiring was changed.
- **VERIFIED:** the exact production helper source compiled and passed a standalone 10/10 deterministic harness covering exact UTF-8 relaunch recovery, owner/project isolation, same-copy idempotency, distinct-copy refusal, canonically equivalent but byte-distinct Unicode, exact deletion, stale deletion refusal, corrupt-file retention, protected-file retention, and direct canonical-file count.
- **NOT VERIFIED:** the XCTest bundle did not execute, the signed app did not compile, and no simulator or physical-device journey ran in this lane.

## Contract

`ScreenplayRecoveryOverflowStore` owns one bounded, protected overflow file per normalized owner and trimmed project:

`Application Support/io.them/ScreenplayRecoveryOverflow/v1/<owner SHA-256>/<project SHA-256>.json`

The path hashes are domain-separated and length-prefixed. The versioned envelope retains the raw normalized owner and project, a canonical UUID record ID, exact draft and base-version strings, the saved-time bit pattern, and a domain-separated SHA-256 integrity digest. A path hash routes to a file; the envelope is still validated against the requested raw scope before any data is returned.

The store has three fail-closed operations:

1. `load` returns missing, a validated snapshot, or unconfirmed. Corrupt, non-file, permission-denied, and protected-data failures are unconfirmed rather than missing.
2. `saveIfVacant` recognizes the exact draft/base bytes already present, stores only into a truly vacant path, returns occupied for a distinct valid copy, and returns unconfirmed without replacing corrupt or unreadable state.
3. `deleteIfMatching` removes only the exact validated record previously presented. A refreshed record, byte change, record-ID change, time-bit change, or digest change returns changed and remains stored.

Drafts are capped at the existing 2 MiB save boundary. Oversized or invalid inputs fail closed without creating a file.

## Atomic and downgrade behavior

- Writes create a hidden same-directory candidate, request complete file protection, reopen and validate the exact candidate bytes, then use `moveItem` into the vacant canonical path. `replaceItemAt` is deliberately never used.
- A contended move re-reads the canonical path. A matching copy is present, a distinct valid copy is occupied, and unreadable/corrupt state is unconfirmed.
- Physical iOS storage requests and verifies `FileProtectionType.complete` on the version root, owner directory, candidate, and canonical file. Locked protected data therefore blocks reads and writes without being mistaken for absence.
- The dedicated versioned Application Support directory is unknown to older builds. Their UserDefaults recovery clears, live-draft cleanup, and save-outbox deletion do not target it. New debug reset wiring must remove this root explicitly; production sign-out must not.
- Relaunch discovery is direct owner/project lookup, not a global filesystem scan.

## Integration seam for Jarvis

Keep this helper independent of the current two-slot signatures. Recommended reconciliation:

1. Try the ordinary and preserved UserDefaults slots using the current preferred-slot policy.
2. Only when both are valid and occupied, call `saveIfVacant` for the current page.
3. Treat stored or present as secured. Treat occupied or unconfirmed as a hard preservation failure: keep current page bytes on screen, stop remote application, and offer export/retry.
4. On relaunch, inspect overflow before preserved and ordinary recovery. Surface the retained overflow even if it is older by timestamp; do not infer supersession from age.
5. Do not silently delete overflow merely because it equals a server hydration. Retire it only after an exact authoritative save acknowledgement or an explicit writer action, using the exact snapshot with `deleteIfMatching`.
6. After restore, retain the copy and surface the next candidate. After explicit discard, exact-delete only the reviewed snapshot.

## Known limits

- This is one third slot, not unbounded history. A fourth distinct unsaved page must fail closed and remain visible/exportable; no slot may be rotated automatically.
- `Data.write(.atomic)` plus same-directory move protects against partial replacement, but this helper does not call `fsync` and cannot promise survival across every sudden-power-loss boundary.
- `@MainActor` serializes app-process access. This is not a cross-process lock protocol; app extensions or a second process must not write this directory without a stronger coordinator.
- Complete file protection intentionally makes the file unavailable before first unlock or while locked. The caller must retry after protected data becomes available.
- SHA-256 is corruption/integrity evidence, not authentication against a process already able to modify the app container.
- Older builds preserve the directory but cannot display it. They may create newer work independently; the upgraded build must still surface the retained overflow and let the writer decide.
- App uninstall, OS container purge, or an explicitly authorized account-local deletion can remove the file. Whether backend account deletion should purge local recovery is a separate privacy/product decision.
- Normal operation does not quarantine or auto-delete corrupt files. They block reuse so support/export can preserve their bytes.

## Evidence

- `swiftc` production-source compile plus deterministic harness: **PASS 10/10**.
- `git diff --check`: **PASS** before commit.
- `xcodebuild test` on `them-macOS-scaffold`: **SKIPPED/UNAVAILABLE** because `themTests` is not a member of that scheme.
- Signed macOS scaffold build: **BLOCKED before Swift compilation** because no matching Mac development provisioning profile is installed. Profile generation was not authorized.
- Default `swift-format lint --strict`: **FAIL, not used as a gate** because its unconfigured two-space/line-wrap rules conflict with the repository's existing four-space style.
- Simulator and physical-device work: **NOT RUN** by delegation.

## Next integration action

Jarvis should independently review this commit, reconcile it with the preferred-preserved-slot and live-sync generation-fence changes in his lane, then run the focused XCTest bundle and authenticated recovery UI proof in his own task-owned native environment.

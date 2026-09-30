import Foundation

struct ScreenplayLocalDraftRecoverySnapshot: Equatable {
    let projectId: String
    let draft: String
    let baseVersionId: String
    let savedAt: TimeInterval
}
struct ScreenplayBridgeVersionAdoptionPolicy {
    static func shouldAdoptCommittedPageWriteBase(
        selectedProjectId: String,
        preferredProjectId: String,
        currentVersionId: String,
        preferredVersionId: String,
        committedDraft: String
    ) -> Bool {
        let selectedProject = selectedProjectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let preferredProject = preferredProjectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let currentVersion = currentVersionId.trimmingCharacters(in: .whitespacesAndNewlines)
        let preferredVersion = preferredVersionId.trimmingCharacters(in: .whitespacesAndNewlines)
        let draft = committedDraft.trimmingCharacters(in: .whitespacesAndNewlines)

        return !selectedProject.isEmpty &&
            selectedProject == preferredProject &&
            !preferredVersion.isEmpty &&
            preferredVersion != currentVersion &&
            !draft.isEmpty
    }
}

struct ScreenplayBridgeDraftAdoptionPolicy {
    static func shouldAdoptLiveBridgeDraft(
        selectedProjectId: String,
        currentDraft: String,
        bridgeDraft: String,
        draftOriginProjectId: String
    ) -> Bool {
        let selectedProject = selectedProjectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedCurrentDraft = currentDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedBridgeDraft = bridgeDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard normalizedCurrentDraft.isEmpty, !normalizedBridgeDraft.isEmpty else { return false }
        guard !selectedProject.isEmpty else { return true }
        return ScreenplayProjectScopedState.matches(draftOriginProjectId, selectedProjectId: selectedProject)
    }
}

/// The debounced draft handler awaits pagination before it writes the
/// recovery copy, and a server load can land in that wait. The words it
/// captured are then stale: written with the new "saved" flag, they marked
/// two unsaved edits clean after a relaunch and the next load replaced them
/// with no recovery offered (seen live 2026-09-30). The newer text has its
/// own debounce, so the stale pass stops.
enum ScreenplayDebouncedDraftPolicy {
    static func isStale(handled: String, current: String) -> Bool {
        handled != current
    }
}

struct ScreenplayStudioHistoryMigrationPolicy {
    static let liveDraftKey = "live-draft"

    static func activeHistoryKey(
        selectedProjectID: String,
        preferredProjectID: String,
        bindingProjectID: String
    ) -> String {
        for projectID in [selectedProjectID, preferredProjectID, bindingProjectID] {
            let normalized = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
            if !normalized.isEmpty {
                return "project:\(normalized)"
            }
        }
        return liveDraftKey
    }

    static func shouldMoveLiveDraftHistory(
        from oldKey: String,
        to newKey: String,
        liveDraftEntryCount: Int
    ) -> Bool {
        oldKey.trimmingCharacters(in: .whitespacesAndNewlines) == liveDraftKey &&
            isProjectHistoryKey(newKey) &&
            liveDraftEntryCount > 0
    }

    static func isProjectHistoryKey(_ key: String) -> Bool {
        let normalized = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard normalized.hasPrefix("project:") else { return false }
        return !normalized.dropFirst("project:".count).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

struct ScreenplayDraftSaveRecoveryPresentationPolicy {
    static func failureStatus(source: String) -> String {
        switch normalizedSource(source) {
        case "studio_manual", "studio_conflict_resolve":
            return "Save failed"
        case "studio_snapshot":
            return "Snapshot failed"
        default:
            return "Autosave failed"
        }
    }

    static func recoveryInfo(source: String) -> String {
        switch normalizedSource(source) {
        case "studio_manual":
            return "Save did not finish. Your local draft is preserved; retry Save when the connection is back."
        case "studio_conflict_resolve":
            return "Keep Mine did not finish. Your local draft is preserved; retry when the connection is back."
        case "studio_snapshot":
            return "Snapshot did not finish. Your current draft is preserved; retry Snapshot when the connection is back."
        default:
            return "Autosave did not finish. Your local draft is preserved; it will retry on the next edit or you can press Save."
        }
    }

    static func failureError(source: String, underlying: String) -> String {
        let cleaned = underlying.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return failureStatus(source: source) }
        return "\(failureStatus(source: source)): \(cleaned)"
    }

    static func shouldClearInfoAfterSuccessfulSave(_ info: String) -> Bool {
        let normalized = info.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty else { return false }
        return normalized.contains("did not finish") ||
            normalized.contains("local draft is preserved") ||
            normalized == "kept your manual edits on the page. save when you're ready."
    }

    private static func normalizedSource(_ source: String) -> String {
        source.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
}

struct ScreenplaySceneSessionRestorePolicy {
    static func shouldClearSelection(_ selection: String, validIDs: Set<String>) -> Bool {
        let normalized = selection.trimmingCharacters(in: .whitespacesAndNewlines)
        return !normalized.isEmpty && !validIDs.contains(normalized)
    }
}

struct ScreenplayLocalDraftRecoveryStore {
    static let defaultKey = "screenplay.studio.localDraftRecovery.v1"

    let defaults: UserDefaults
    let key: String

    init(defaults: UserDefaults = .standard, key: String = Self.defaultKey) {
        self.defaults = defaults
        self.key = key
    }

    func payloads(ownerUserId: String) -> [String: [String: Any]] {
        let scopedKey = ownerScopedKey(ownerUserId)
        migrateLegacyPayloadsIfNeeded()
        let raw = defaults.dictionary(forKey: scopedKey) ?? [:]
        var out: [String: [String: Any]] = [:]
        for (key, value) in raw {
            guard let payload = value as? [String: Any] else { continue }
            out[key] = payload
        }
        return out
    }

    func save(
        ownerUserId: String,
        projectId: String,
        draft: String,
        baseVersionId: String,
        dirty: Bool,
        savedAt: TimeInterval = Date().timeIntervalSince1970
    ) {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else { return }
        var nextPayloads = payloads(ownerUserId: ownerUserId)
        // The same words keep the base already known for them. At launch the
        // copy was rewritten before its version loaded, the base went blank,
        // and Recover Local reported this device's own last save as another
        // device's (seen live 2026-09-30). A known true base is safer than
        // none: the backend's reject_if_stale still reports a real conflict.
        var base = baseVersionId.trimmingCharacters(in: .whitespacesAndNewlines)
        if base.isEmpty,
           let existing = nextPayloads[normalizedProjectId],
           String(describing: existing["draft"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines) == draft.trimmingCharacters(in: .whitespacesAndNewlines) {
            base = String(describing: existing["baseVersionId"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        }
        nextPayloads[normalizedProjectId] = [
            "draft": draft,
            "baseVersionId": base,
            "dirty": dirty,
            "savedAt": savedAt,
        ]
        defaults.set(nextPayloads, forKey: ownerScopedKey(ownerUserId))
    }

    /// True when the stored copy is unsaved work written after `time` whose
    /// words differ from `draft` — work a save captured at `time` never carried.
    func holdsNewerUnsavedWork(ownerUserId: String, projectId: String, than time: TimeInterval, differingFrom draft: String) -> Bool {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let stored = payloads(ownerUserId: ownerUserId)[normalizedProjectId],
              stored["dirty"] as? Bool == true,
              let storedSavedAt = stored["savedAt"] as? TimeInterval,
              storedSavedAt > time else { return false }
        let storedDraft = String(describing: stored["draft"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return !storedDraft.isEmpty && storedDraft != draft.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func clear(ownerUserId: String, projectId: String) {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else { return }
        var nextPayloads = payloads(ownerUserId: ownerUserId)
        nextPayloads.removeValue(forKey: normalizedProjectId)
        defaults.set(nextPayloads, forKey: ownerScopedKey(ownerUserId))
    }

    func recoverySnapshot(
        ownerUserId: String,
        projectId: String,
        serverDraft: String,
        fingerprint: (String) -> String
    ) -> ScreenplayLocalDraftRecoverySnapshot? {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else { return nil }
        guard let stored = payloads(ownerUserId: ownerUserId)[normalizedProjectId] else { return nil }

        let storedDraft = String(describing: stored["draft"] ?? "")
        let storedDirty = stored["dirty"] as? Bool ?? false
        guard storedDirty, !storedDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }

        let serverFingerprint = fingerprint(serverDraft.trimmingCharacters(in: .whitespacesAndNewlines))
        let localFingerprint = fingerprint(storedDraft.trimmingCharacters(in: .whitespacesAndNewlines))
        guard serverFingerprint != localFingerprint else {
            clear(ownerUserId: ownerUserId, projectId: normalizedProjectId)
            return nil
        }

        return ScreenplayLocalDraftRecoverySnapshot(
            projectId: normalizedProjectId,
            draft: storedDraft,
            baseVersionId: String(describing: stored["baseVersionId"] ?? ""),
            savedAt: stored["savedAt"] as? TimeInterval ?? 0
        )
    }

    private func ownerScopedKey(_ ownerUserId: String) -> String {
        ScreenplayOwnerScopedStoragePolicy.storageKey(baseKey: key, ownerUserID: ownerUserId)
    }

    private func migrateLegacyPayloadsIfNeeded() {
        let quarantineKey = ownerScopedKey(ScreenplayLegacyWorkspaceMigrationPolicy.quarantineOwnerUserID)
        guard let legacy = defaults.dictionary(forKey: key),
              !legacy.isEmpty else { return }
        var quarantined = legacy
        for (projectID, payload) in defaults.dictionary(forKey: quarantineKey) ?? [:] {
            // Existing anonymous work is newer and wins project-ID collisions.
            quarantined[projectID] = payload
        }
        defaults.set(quarantined, forKey: quarantineKey)
        defaults.removeObject(forKey: key)
    }
}

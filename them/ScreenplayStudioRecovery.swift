import Foundation

struct ScreenplayLocalDraftRecoverySnapshot: Equatable {
    let projectId: String
    let draft: String
    let baseVersionId: String
    let savedAt: TimeInterval
    let isPreservedConflict: Bool
    let clientRequestId: String?
    let serverRecoveryId: String?
}

struct ScreenplayServerBackedDraftRecoveryPolicy {
    static func newestRecovery(
        from versions: [BackendScreenplayVersion]?,
        excluding serverDraft: String,
        fingerprint: (String) -> String
    ) -> BackendScreenplayVersion? {
        let serverFingerprint = fingerprint(serverDraft)
        return versions?
            .filter { $0.source == "studio_live_sync_recovery" }
            .sorted { ($0.updatedAt ?? $0.createdAt ?? 0) > ($1.updatedAt ?? $1.createdAt ?? 0) }
            .first { version in
                let draft = version.draft ?? ""
                return !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    && fingerprint(draft) != serverFingerprint
            }
    }

    /// A dirty device-only draft is not represented by the account receipt.
    /// Keep it visible rather than comparing device wall clocks with server
    /// timestamps, which can skew and do not prove causal ordering.
    static func shouldPreferLocalRecovery(
        _ localRecovery: ScreenplayLocalDraftRecoverySnapshot
    ) -> Bool {
        !localRecovery.isPreservedConflict
    }
}

struct ScreenplayDraftRecoveryBannerCopy: Equatable {
    let title: String
    let message: String
    let hint: String

    static func make(accountProtected: Bool, alreadyOnPage: Bool, savedText: String) -> Self {
        switch (accountProtected, alreadyOnPage) {
        case (true, true):
            return Self(
                title: "Account copy protected",
                message: "Protected in your account \(savedText). Save the page to resolve it, or discard the copy.",
                hint: "Press 1 to keep the local draft on the page or 2 to discard the recovery copy."
            )
        case (true, false):
            return Self(
                title: "Account recovery copy found",
                message: "Protected in your account \(savedText). Recover it or keep the server draft.",
                hint: "Press 1 to recover local or 2 to keep the server draft."
            )
        case (false, true):
            return Self(
                title: "Local draft protected",
                message: "Saved locally \(savedText). Retry Save when the connection is back, or discard the recovery copy.",
                hint: "Press 1 to keep the local draft on the page or 2 to discard the recovery copy."
            )
        case (false, false):
            return Self(
                title: "Unsaved local draft found",
                message: "Saved \(savedText). Recover it or keep the server draft.",
                hint: "Press 1 to recover local or 2 to keep the server draft."
            )
        }
    }
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
        var projectPayload = nextPayloads[normalizedProjectId] ?? [:]
        projectPayload["draft"] = draft
        projectPayload["baseVersionId"] = baseVersionId
        projectPayload["dirty"] = dirty
        projectPayload["savedAt"] = savedAt
        nextPayloads[normalizedProjectId] = projectPayload
        defaults.set(nextPayloads, forKey: ownerScopedKey(ownerUserId))
    }

    /// Keeps a dirty local draft separate from the ordinary recovery slot so
    /// a remote live-sync draft can be followed without overwriting the only
    /// copy of the writer's local text.
    @discardableResult
    func savePreservedConflict(
        ownerUserId: String,
        projectId: String,
        draft: String,
        baseVersionId: String,
        savedAt: TimeInterval = Date().timeIntervalSince1970
    ) -> String? {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty,
              !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        var nextPayloads = payloads(ownerUserId: ownerUserId)
        var projectPayload = nextPayloads[normalizedProjectId] ?? [:]
        let existing = projectPayload["preservedConflict"] as? [String: Any]
        let existingDraft = existing?["draft"] as? String ?? ""
        guard existingDraft.isEmpty || existingDraft == draft else { return nil }
        let clientRequestId = (existing?["clientRequestId"] as? String)
            .flatMap { $0.isEmpty ? nil : $0 }
            ?? UUID().uuidString.lowercased()
        var preservedConflict: [String: Any] = [
            "draft": draft,
            "baseVersionId": baseVersionId,
            "dirty": true,
            "savedAt": savedAt,
            "clientRequestId": clientRequestId,
        ]
        if let recoveryId = existing?["serverRecoveryId"] as? String {
            preservedConflict["serverRecoveryId"] = recoveryId
        }
        projectPayload["preservedConflict"] = preservedConflict
        nextPayloads[normalizedProjectId] = projectPayload
        defaults.set(nextPayloads, forKey: ownerScopedKey(ownerUserId))
        guard defaults.synchronize() else { return nil }
        return clientRequestId
    }

    func setServerRecoveryId(
        _ recoveryId: String,
        ownerUserId: String,
        projectId: String,
        clientRequestId: String
    ) {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty,
              !recoveryId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        var nextPayloads = payloads(ownerUserId: ownerUserId)
        guard var projectPayload = nextPayloads[normalizedProjectId],
              var preservedConflict = projectPayload["preservedConflict"] as? [String: Any],
              preservedConflict["clientRequestId"] as? String == clientRequestId else { return }
        preservedConflict["serverRecoveryId"] = recoveryId
        projectPayload["preservedConflict"] = preservedConflict
        nextPayloads[normalizedProjectId] = projectPayload
        defaults.set(nextPayloads, forKey: ownerScopedKey(ownerUserId))
        _ = defaults.synchronize()
    }

    func clearPreservedConflict(ownerUserId: String, projectId: String) {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else { return }
        var nextPayloads = payloads(ownerUserId: ownerUserId)
        guard var projectPayload = nextPayloads[normalizedProjectId] else { return }
        projectPayload.removeValue(forKey: "preservedConflict")
        if projectPayload.isEmpty {
            nextPayloads.removeValue(forKey: normalizedProjectId)
        } else {
            nextPayloads[normalizedProjectId] = projectPayload
        }
        defaults.set(nextPayloads, forKey: ownerScopedKey(ownerUserId))
    }

    /// Clears the ordinary autosave copy after the server confirms that text,
    /// without discarding a distinct local draft preserved during live sync.
    func clearOrdinaryDraft(ownerUserId: String, projectId: String) {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else { return }
        var nextPayloads = payloads(ownerUserId: ownerUserId)
        guard var projectPayload = nextPayloads[normalizedProjectId] else { return }
        projectPayload.removeValue(forKey: "draft")
        projectPayload.removeValue(forKey: "baseVersionId")
        projectPayload.removeValue(forKey: "dirty")
        projectPayload.removeValue(forKey: "savedAt")
        if projectPayload.isEmpty {
            nextPayloads.removeValue(forKey: normalizedProjectId)
        } else {
            nextPayloads[normalizedProjectId] = projectPayload
        }
        defaults.set(nextPayloads, forKey: ownerScopedKey(ownerUserId))
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
        guard !normalizedProjectId.isEmpty,
              let stored = payloads(ownerUserId: ownerUserId)[normalizedProjectId] else { return nil }

        let serverFingerprint = fingerprint(serverDraft.trimmingCharacters(in: .whitespacesAndNewlines))
        var preservedSnapshot: ScreenplayLocalDraftRecoverySnapshot?
        if let preserved = stored["preservedConflict"] as? [String: Any],
           preserved["dirty"] as? Bool == true {
            let draft = String(describing: preserved["draft"] ?? "")
            if !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
               fingerprint(draft.trimmingCharacters(in: .whitespacesAndNewlines)) != serverFingerprint {
                preservedSnapshot = ScreenplayLocalDraftRecoverySnapshot(
                    projectId: normalizedProjectId,
                    draft: draft,
                    baseVersionId: String(describing: preserved["baseVersionId"] ?? ""),
                    savedAt: preserved["savedAt"] as? TimeInterval ?? 0,
                    isPreservedConflict: true,
                    clientRequestId: preserved["clientRequestId"] as? String,
                    serverRecoveryId: preserved["serverRecoveryId"] as? String
                )
            } else {
                clearPreservedConflict(ownerUserId: ownerUserId, projectId: normalizedProjectId)
            }
        }

        guard let latestStored = payloads(ownerUserId: ownerUserId)[normalizedProjectId] else { return nil }
        let storedDraft = String(describing: latestStored["draft"] ?? "")
        let storedDirty = latestStored["dirty"] as? Bool ?? false
        var ordinarySnapshot: ScreenplayLocalDraftRecoverySnapshot?
        if storedDirty, !storedDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let localFingerprint = fingerprint(storedDraft.trimmingCharacters(in: .whitespacesAndNewlines))
            if serverFingerprint != localFingerprint {
                ordinarySnapshot = ScreenplayLocalDraftRecoverySnapshot(
                    projectId: normalizedProjectId,
                    draft: storedDraft,
                    baseVersionId: String(describing: latestStored["baseVersionId"] ?? ""),
                    savedAt: latestStored["savedAt"] as? TimeInterval ?? 0,
                    isPreservedConflict: false,
                    clientRequestId: nil,
                    serverRecoveryId: nil
                )
            } else {
                clearOrdinaryDraft(ownerUserId: ownerUserId, projectId: normalizedProjectId)
                return preservedSnapshot
            }
        }

        guard let ordinarySnapshot else { return preservedSnapshot }
        // The protected conflict remains stored separately; surface the
        // distinct dirty device-only words first rather than discarding them
        // based on wall-clock timestamps from unrelated persistence layers.
        return ordinarySnapshot
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

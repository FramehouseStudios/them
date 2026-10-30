import Foundation

struct ScreenplayLocalDraftRecoverySnapshot: Equatable {
    let projectId: String
    let draft: String
    let baseVersionId: String
    let savedAt: TimeInterval
    let isPreservedConflict: Bool
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
    static let unreadableQueueStatus = "Local saves need attention"
    static let unreadableQueueError = "Local saves cannot be read. Your current page was kept. Export it before retrying."

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

enum ScreenplayConditionalRecoveryResult {
    case present, occupied, unconfirmed
}

enum ScreenplayLocalDraftRecoverySlot: Equatable {
    case ordinary
    case preservedConflict
}

enum ScreenplayConditionalRecoveryDeletionResult: Equatable {
    case deleted
    case missing
    case changed
    case unconfirmed
}

enum ScreenplayRecoverySlotMatchResult: Equatable {
    case matching
    case missing
    case changed
}

enum ScreenplayVacantRecoveryWriteResult: Equatable {
    case present(ScreenplayLocalDraftRecoverySlot)
    case stored(ScreenplayLocalDraftRecoverySlot)
    case occupied
    case unconfirmed
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
    func savePreservedConflict(
        ownerUserId: String,
        projectId: String,
        draft: String,
        baseVersionId: String,
        savedAt: TimeInterval = Date().timeIntervalSince1970
    ) {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else { return }
        var nextPayloads = payloads(ownerUserId: ownerUserId)
        var projectPayload = nextPayloads[normalizedProjectId] ?? [:]
        projectPayload["preservedConflict"] = [
            "draft": draft,
            "baseVersionId": baseVersionId,
            "dirty": true,
            "savedAt": savedAt,
        ]
        nextPayloads[normalizedProjectId] = projectPayload
        defaults.set(nextPayloads, forKey: ownerScopedKey(ownerUserId))
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

    /// Revalidates the exact recovery decision without changing stored work.
    @MainActor
    func matchRecoverySlot(
        ownerUserId: String,
        projectId: String,
        slot: ScreenplayLocalDraftRecoverySlot,
        draft: String,
        baseVersionId: String,
        savedAt: TimeInterval
    ) -> ScreenplayRecoverySlotMatchResult {
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !project.isEmpty,
              let payload = payloads(ownerUserId: ownerUserId)[project] else { return .missing }
        let slotState = storedRecoverySlot(slot, in: payload)
        guard slotState.exists else { return .missing }
        guard let candidate = slotState.candidate,
              exactRecoveryCandidate(candidate, draft: draft, baseVersionId: baseVersionId, savedAt: savedAt) else {
            return .changed
        }
        return .matching
    }

    /// Deletes only the recovery copy the writer actually reviewed. A refreshed
    /// or byte-distinct slot is left untouched for a new recovery decision.
    @MainActor
    func deleteRecoverySlotIfMatching(
        ownerUserId: String,
        projectId: String,
        slot: ScreenplayLocalDraftRecoverySlot,
        draft: String,
        baseVersionId: String,
        savedAt: TimeInterval
    ) -> ScreenplayConditionalRecoveryDeletionResult {
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !project.isEmpty else { return .missing }
        var all = payloads(ownerUserId: ownerUserId)
        guard var payload = all[project] else { return .missing }

        let slotState = storedRecoverySlot(slot, in: payload)
        guard slotState.exists else { return .missing }
        guard let candidate = slotState.candidate,
              exactRecoveryCandidate(candidate, draft: draft, baseVersionId: baseVersionId, savedAt: savedAt) else {
            return .changed
        }

        switch slot {
        case .ordinary:
            for key in ["draft", "baseVersionId", "dirty", "savedAt"] {
                payload.removeValue(forKey: key)
            }
        case .preservedConflict:
            payload.removeValue(forKey: "preservedConflict")
        }

        if payload.isEmpty {
            all.removeValue(forKey: project)
        } else {
            all[project] = payload
        }
        defaults.set(all, forKey: ownerScopedKey(ownerUserId))

        let storedPayloads = payloads(ownerUserId: ownerUserId)
        guard NSDictionary(dictionary: storedPayloads).isEqual(to: all) else {
            return .unconfirmed
        }
        let storedProject = storedPayloads[project]
        let slotIsAbsent: Bool
        switch slot {
        case .ordinary: slotIsAbsent = storedProject?["draft"] == nil
        case .preservedConflict: slotIsAbsent = storedProject?["preservedConflict"] == nil
        }
        return slotIsAbsent ? .deleted : .unconfirmed
    }

    /// Keeps an exact draft without replacing either existing recovery copy.
    /// A malformed partial slot is occupied, never an invitation to overwrite it.
    @MainActor
    func saveInVacantRecoverySlot(
        ownerUserId: String,
        projectId: String,
        draft: String,
        baseVersionId: String,
        savedAt: TimeInterval = Date().timeIntervalSince1970,
        preferPreservedConflict: Bool = false
    ) -> ScreenplayVacantRecoveryWriteResult {
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !project.isEmpty else { return .unconfirmed }
        var all = payloads(ownerUserId: ownerUserId)
        var payload = all[project] ?? [:]

        let ordinary = storedRecoverySlot(.ordinary, in: payload)
        if let candidate = ordinary.candidate,
           exactRecoveryCandidate(candidate, draft: draft, baseVersionId: baseVersionId) {
            return .present(.ordinary)
        }
        let preserved = storedRecoverySlot(.preservedConflict, in: payload)
        if let candidate = preserved.candidate,
           exactRecoveryCandidate(candidate, draft: draft, baseVersionId: baseVersionId) {
            return .present(.preservedConflict)
        }

        let slot: ScreenplayLocalDraftRecoverySlot
        if preferPreservedConflict && !preserved.exists {
            slot = .preservedConflict
        } else if !ordinary.exists {
            slot = .ordinary
        } else if !preserved.exists {
            slot = .preservedConflict
        } else {
            return .occupied
        }

        let candidate: [String: Any] = [
            "draft": draft,
            "baseVersionId": baseVersionId,
            "dirty": true,
            "savedAt": savedAt,
        ]
        switch slot {
        case .ordinary:
            for (key, value) in candidate { payload[key] = value }
        case .preservedConflict:
            payload["preservedConflict"] = candidate
        }
        all[project] = payload
        defaults.set(all, forKey: ownerScopedKey(ownerUserId))

        let storedPayloads = payloads(ownerUserId: ownerUserId)
        guard NSDictionary(dictionary: storedPayloads).isEqual(to: all) else {
            return .unconfirmed
        }
        let storedProject = storedPayloads[project] ?? [:]
        let storedCandidate: [String: Any]?
        switch slot {
        case .ordinary: storedCandidate = storedProject
        case .preservedConflict: storedCandidate = storedProject["preservedConflict"] as? [String: Any]
        }
        guard let storedCandidate,
              exactRecoveryCandidate(storedCandidate, draft: draft, baseVersionId: baseVersionId),
              storedCandidate["savedAt"] as? TimeInterval == savedAt else {
            return .unconfirmed
        }
        return .stored(slot)
    }

    /// Does not replace a different ordinary recovery copy or the preserved conflict.
    @MainActor
    func saveIfOrdinaryVacantOrMatching(ownerUserId: String, projectId: String,
                                        draft: String, baseVersionId: String) -> ScreenplayConditionalRecoveryResult {
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !project.isEmpty else { return .unconfirmed }
        var all = payloads(ownerUserId: ownerUserId)
        var payload = all[project] ?? [:]
        func exact(_ value: [String: Any]) -> Bool {
            guard let text = value["draft"] as? String, let base = value["baseVersionId"] as? String else { return false }
            return text.utf8.elementsEqual(draft.utf8) && base.utf8.elementsEqual(baseVersionId.utf8)
        }
        if let preserved = payload["preservedConflict"] as? [String: Any],
           preserved["dirty"] as? Bool == true, exact(preserved) { return .present }
        if payload["draft"] != nil {
            guard payload["draft"] is String, payload["baseVersionId"] is String else { return .unconfirmed }
            guard exact(payload) else { return .occupied }
        }
        payload["draft"] = draft
        payload["baseVersionId"] = baseVersionId
        payload["dirty"] = true
        payload["savedAt"] = Date().timeIntervalSince1970
        all[project] = payload
        defaults.set(all, forKey: ownerScopedKey(ownerUserId))
        let stored = payloads(ownerUserId: ownerUserId)[project] ?? [:]
        return exact(stored) && stored["dirty"] as? Bool == true ? .present : .unconfirmed
    }

    /// Retire only recovery copies that still match the writer-selected save.
    /// A later edit or a different preserved conflict remains recoverable.
    func clearMatchingRecovery(ownerUserId: String, projectId: String, draft: String, baseVersionId: String) {
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !project.isEmpty else { return }
        var all = payloads(ownerUserId: ownerUserId)
        guard var payload = all[project] else { return }
        func matches(_ candidate: [String: Any]) -> Bool {
            guard let storedDraft = candidate["draft"] as? String,
                  let storedBase = candidate["baseVersionId"] as? String else { return false }
            return storedDraft.utf8.elementsEqual(draft.utf8) && storedBase.utf8.elementsEqual(baseVersionId.utf8)
        }
        if matches(payload) {
            for key in ["draft", "baseVersionId", "dirty", "savedAt"] { payload.removeValue(forKey: key) }
        }
        if let preserved = payload["preservedConflict"] as? [String: Any], matches(preserved) {
            payload.removeValue(forKey: "preservedConflict")
        }
        if payload.isEmpty { all.removeValue(forKey: project) } else { all[project] = payload }
        defaults.set(all, forKey: ownerScopedKey(ownerUserId))
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
        serverDraft: String
    ) -> ScreenplayLocalDraftRecoverySnapshot? {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty,
              let stored = payloads(ownerUserId: ownerUserId)[normalizedProjectId] else { return nil }

        if let preserved = stored["preservedConflict"] as? [String: Any],
           preserved["dirty"] as? Bool == true,
           let draft = preserved["draft"] as? String {
            if !draft.utf8.elementsEqual(serverDraft.utf8) {
                return ScreenplayLocalDraftRecoverySnapshot(
                    projectId: normalizedProjectId,
                    draft: draft,
                    baseVersionId: String(describing: preserved["baseVersionId"] ?? ""),
                    savedAt: preserved["savedAt"] as? TimeInterval ?? 0,
                    isPreservedConflict: true
                )
            }
            clearPreservedConflict(ownerUserId: ownerUserId, projectId: normalizedProjectId)
        }

        guard let latestStored = payloads(ownerUserId: ownerUserId)[normalizedProjectId] else { return nil }
        let storedDraft = String(describing: latestStored["draft"] ?? "")
        let storedDirty = latestStored["dirty"] as? Bool ?? false
        guard storedDirty, latestStored["draft"] is String else {
            return nil
        }

        guard !storedDraft.utf8.elementsEqual(serverDraft.utf8) else {
            clearOrdinaryDraft(ownerUserId: ownerUserId, projectId: normalizedProjectId)
            return nil
        }

        return ScreenplayLocalDraftRecoverySnapshot(
            projectId: normalizedProjectId,
            draft: storedDraft,
            baseVersionId: String(describing: latestStored["baseVersionId"] ?? ""),
            savedAt: latestStored["savedAt"] as? TimeInterval ?? 0,
            isPreservedConflict: false
        )
    }

    private func ownerScopedKey(_ ownerUserId: String) -> String {
        ScreenplayOwnerScopedStoragePolicy.storageKey(baseKey: key, ownerUserID: ownerUserId)
    }

    private func storedRecoverySlot(
        _ slot: ScreenplayLocalDraftRecoverySlot,
        in payload: [String: Any]
    ) -> (exists: Bool, candidate: [String: Any]?) {
        switch slot {
        case .ordinary:
            let keys = ["draft", "baseVersionId", "dirty", "savedAt"]
            let exists = keys.contains { payload[$0] != nil }
            return (exists, exists ? payload : nil)
        case .preservedConflict:
            guard let value = payload["preservedConflict"] else { return (false, nil) }
            return (true, value as? [String: Any])
        }
    }

    private func exactRecoveryCandidate(
        _ candidate: [String: Any],
        draft: String,
        baseVersionId: String,
        savedAt: TimeInterval? = nil
    ) -> Bool {
        guard let storedDraft = candidate["draft"] as? String,
              let storedBase = candidate["baseVersionId"] as? String,
              candidate["dirty"] as? Bool == true else { return false }
        if let savedAt {
            guard candidate["savedAt"] as? TimeInterval == savedAt else { return false }
        }
        return storedDraft.utf8.elementsEqual(draft.utf8) &&
            storedBase.utf8.elementsEqual(baseVersionId.utf8)
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

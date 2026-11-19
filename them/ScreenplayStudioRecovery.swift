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
        savedAt: TimeInterval = Date().timeIntervalSince1970,
        preserveExactText: Bool = false
    ) {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else { return }
        var nextPayloads = payloads(ownerUserId: ownerUserId)
        var projectPayload = nextPayloads[normalizedProjectId] ?? [:]
        projectPayload["draft"] = draft
        projectPayload["baseVersionId"] = baseVersionId
        projectPayload["dirty"] = dirty
        projectPayload["preserveExactText"] = preserveExactText ? true : nil
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
        guard !normalizedProjectId.isEmpty,
              !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        var nextPayloads = payloads(ownerUserId: ownerUserId)
        var projectPayload = nextPayloads[normalizedProjectId] ?? [:]
        var preserved = preservedConflicts(in: projectPayload)
        let alreadyStored = preserved.contains {
            ($0["draft"] as? String) == draft &&
                ($0["baseVersionId"] as? String) == baseVersionId
        }
        if !alreadyStored {
            preserved.append([
                "draft": draft,
                "baseVersionId": baseVersionId,
                "dirty": true,
                "savedAt": savedAt,
            ])
        }
        projectPayload["preservedConflicts"] = preserved
        projectPayload.removeValue(forKey: "preservedConflict")
        nextPayloads[normalizedProjectId] = projectPayload
        defaults.set(nextPayloads, forKey: ownerScopedKey(ownerUserId))
    }

    func clearPreservedConflict(
        ownerUserId: String,
        projectId: String,
        draft: String? = nil,
        savedAt: TimeInterval? = nil
    ) {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else { return }
        var nextPayloads = payloads(ownerUserId: ownerUserId)
        guard var projectPayload = nextPayloads[normalizedProjectId] else { return }
        var preserved = preservedConflicts(in: projectPayload)
        if let draft {
            if let index = preserved.firstIndex(where: {
                ($0["draft"] as? String) == draft &&
                    (savedAt == nil || ($0["savedAt"] as? TimeInterval) == savedAt)
            }) {
                preserved.remove(at: index)
            }
        } else {
            preserved.removeAll()
        }
        if preserved.isEmpty {
            projectPayload.removeValue(forKey: "preservedConflicts")
        } else {
            projectPayload["preservedConflicts"] = preserved
        }
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

    func firstPreservedConflict(ownerUserId: String, projectId: String) -> ScreenplayLocalDraftRecoverySnapshot? {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty,
              let payload = payloads(ownerUserId: ownerUserId)[normalizedProjectId],
              let conflict = preservedConflicts(in: payload).first(where: { $0["dirty"] as? Bool == true }) else {
            return nil
        }
        let draft = String(describing: conflict["draft"] ?? "")
        guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return ScreenplayLocalDraftRecoverySnapshot(
            projectId: normalizedProjectId,
            draft: draft,
            baseVersionId: String(describing: conflict["baseVersionId"] ?? ""),
            savedAt: conflict["savedAt"] as? TimeInterval ?? 0,
            isPreservedConflict: true
        )
    }

    func nextPreservedConflict(
        ownerUserId: String,
        projectId: String,
        after draft: String,
        savedAt: TimeInterval
    ) -> ScreenplayLocalDraftRecoverySnapshot? {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty,
              let payload = payloads(ownerUserId: ownerUserId)[normalizedProjectId] else { return nil }
        let conflicts = preservedConflicts(in: payload).filter { $0["dirty"] as? Bool == true }
        guard let currentIndex = conflicts.firstIndex(where: {
            ($0["draft"] as? String) == draft && ($0["savedAt"] as? TimeInterval) == savedAt
        }), conflicts.indices.contains(currentIndex + 1) else { return nil }
        let next = conflicts[currentIndex + 1]
        let nextDraft = String(describing: next["draft"] ?? "")
        guard !nextDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return ScreenplayLocalDraftRecoverySnapshot(
            projectId: normalizedProjectId,
            draft: nextDraft,
            baseVersionId: String(describing: next["baseVersionId"] ?? ""),
            savedAt: next["savedAt"] as? TimeInterval ?? 0,
            isPreservedConflict: true
        )
    }

    func clear(ownerUserId: String, projectId: String) {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else { return }
        var nextPayloads = payloads(ownerUserId: ownerUserId)
        nextPayloads.removeValue(forKey: normalizedProjectId)
        defaults.set(nextPayloads, forKey: ownerScopedKey(ownerUserId))
    }

    func dirtyOrdinarySnapshot(ownerUserId: String, projectId: String) -> ScreenplayLocalDraftRecoverySnapshot? {
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let stored = payloads(ownerUserId: ownerUserId)[project],
              stored["dirty"] as? Bool == true,
              let draft = stored["draft"] as? String,
              !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return ScreenplayLocalDraftRecoverySnapshot(projectId: project, draft: draft,
            baseVersionId: stored["baseVersionId"] as? String ?? "",
            savedAt: stored["savedAt"] as? TimeInterval ?? 0, isPreservedConflict: false)
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
        for preserved in preservedConflicts(in: stored) where preserved["dirty"] as? Bool == true {
            let draft = String(describing: preserved["draft"] ?? "")
            if !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
               fingerprint(draft.trimmingCharacters(in: .whitespacesAndNewlines)) != serverFingerprint {
                return ScreenplayLocalDraftRecoverySnapshot(
                    projectId: normalizedProjectId,
                    draft: draft,
                    baseVersionId: String(describing: preserved["baseVersionId"] ?? ""),
                    savedAt: preserved["savedAt"] as? TimeInterval ?? 0,
                    isPreservedConflict: true
                )
            }
            clearPreservedConflict(
                ownerUserId: ownerUserId,
                projectId: normalizedProjectId,
                draft: draft,
                savedAt: preserved["savedAt"] as? TimeInterval
            )
            return recoverySnapshot(
                ownerUserId: ownerUserId,
                projectId: normalizedProjectId,
                serverDraft: serverDraft,
                fingerprint: fingerprint
            )
        }

        guard let latestStored = payloads(ownerUserId: ownerUserId)[normalizedProjectId] else { return nil }
        let storedDraft = String(describing: latestStored["draft"] ?? "")
        let storedDirty = latestStored["dirty"] as? Bool ?? false
        guard storedDirty, !storedDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }

        let differsFromServer = latestStored["preserveExactText"] as? Bool == true
            ? !storedDraft.utf8.elementsEqual(serverDraft.utf8)
            : fingerprint(storedDraft.trimmingCharacters(in: .whitespacesAndNewlines)) != serverFingerprint
        guard differsFromServer else {
            clear(ownerUserId: ownerUserId, projectId: normalizedProjectId)
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

    private func preservedConflicts(in projectPayload: [String: Any]) -> [[String: Any]] {
        if let preserved = projectPayload["preservedConflicts"] as? [[String: Any]] {
            return preserved
        }
        if let legacy = projectPayload["preservedConflict"] as? [String: Any] {
            return [legacy]
        }
        return []
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

struct ScreenplayRestoredLiveDraftProjectPromotionPolicy {
    static func shouldCreateProject(
        isStudioSurfaceActive: Bool,
        draft: String,
        existingProjectID: String,
        isAutoCreatingProject: Bool,
        isPromotionDeferred: Bool
    ) -> Bool {
        guard isStudioSurfaceActive else { return false }
        guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        guard existingProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        guard !isAutoCreatingProject else { return false }
        return !isPromotionDeferred
    }
}

@MainActor
enum ScreenplayFirstPagePromotion {
    enum Outcome {
        case saved(BackendScreenplayProjectSummary, versionID: String, draft: String)
        case retained(projectTitle: String)
        case cleared
    }

    static func run(
        owner: ScreenplayStudioAuthContext,
        seed: String,
        draftBeforeCreate: String,
        currentDraft: () -> String?,
        title: String,
        phase: String,
        finish: (Outcome) -> Void
    ) async throws {
        let cleanPhase = phase.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedPhase = cleanPhase.isEmpty ? "scene_draft" : cleanPhase
        try await run(
            owner: owner, seed: seed, draftBeforeCreate: draftBeforeCreate, currentDraft: currentDraft,
            recovery: ScreenplayLocalDraftRecoveryStore(),
            create: {
                let result = try await BackendMemoryAPI.shared.upsertScreenplayProject(
                    title: title, phase: normalizedPhase, activate: false, expectedOwner: owner
                )
                guard let project = result.payload.project, !project.id.isEmpty else {
                    throw BackendMemoryAPIError.invalidResponse
                }
                return project
            },
            save: { project, draft in
                let result = try await BackendMemoryAPI.shared.upsertScreenplayProjectVersion(
                    projectId: project.id, draft: draft, title: project.title,
                    phase: project.lastPhase ?? normalizedPhase, notes: "Auto-created from first Studio turn",
                    source: "studio_first_turn_auto_create", clientRequestId: UUID().uuidString,
                    activate: false, expectedOwner: owner
                )
                guard result.payload.conflict != true,
                      (result.payload.projectId ?? result.payload.project?.id) == project.id,
                      let version = result.payload.version, !version.id.isEmpty else {
                    throw BackendMemoryAPIError.invalidResponse
                }
                return version.id
            },
            finish: finish
        )
    }

    static func run(
        owner: ScreenplayStudioAuthContext,
        seed: String,
        draftBeforeCreate: String,
        currentDraft: () -> String?,
        recovery: ScreenplayLocalDraftRecoveryStore,
        create: () async throws -> BackendScreenplayProjectSummary,
        save: (BackendScreenplayProjectSummary, String) async throws -> String,
        finish: (Outcome) -> Void
    ) async throws {
        guard currentDraft() != nil else { return }
        let project = try await create()
        guard let draftBeforeSave = currentDraft() else { return }
        let draftToSave = draftBeforeCreate.utf8.elementsEqual(draftBeforeSave.utf8) ? seed : draftBeforeSave
        guard !draftToSave.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            finish(.cleared)
            return
        }
        recovery.save(ownerUserId: owner.userID, projectId: project.id, draft: draftToSave, baseVersionId: "", dirty: true)

        let versionID: String
        let confirmed: Bool
        do {
            versionID = try await save(project, draftToSave)
            confirmed = true
        } catch {
            versionID = ""
            confirmed = false
        }
        guard let latest = currentDraft() else { return }
        let changedDuringSave = !latest.utf8.elementsEqual(draftBeforeSave.utf8)
        let retainedDraft = changedDuringSave ? latest : draftToSave
        guard !retainedDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            recovery.clear(ownerUserId: owner.userID, projectId: project.id)
            finish(.cleared)
            return
        }
        let retainedLocally = !confirmed || !retainedDraft.utf8.elementsEqual(draftToSave.utf8)
        recovery.save(
            ownerUserId: owner.userID, projectId: project.id, draft: retainedDraft,
            baseVersionId: versionID, dirty: retainedLocally, preserveExactText: retainedLocally
        )
        finish(retainedLocally
            ? .retained(projectTitle: project.title)
            : .saved(project, versionID: versionID, draft: draftToSave))
    }
}

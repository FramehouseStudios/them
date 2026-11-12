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
    static let unsecuredDraftWarning = "This page could not be secured locally. Keep it open and export it or retry Save."
    static let fullRecoveryWarning = "Other recovery copies are stored. Export this page before closing or retry Save."

    static func isLocalRecoveryWarning(_ message: String) -> Bool {
        message == unsecuredDraftWarning || message == fullRecoveryWarning
    }

    static func localRecoveryWarning(hasUnsavedChanges: Bool, info: String, error: String) -> String? {
        guard hasUnsavedChanges else { return nil }
        if isLocalRecoveryWarning(error) { return error }
        return isLocalRecoveryWarning(info) ? info : nil
    }

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
        if isLocalRecoveryWarning(info) { return true }
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
        let raw = defaults.dictionary(forKey: scopedKey) ?? [:]
        var out: [String: [String: Any]] = [:]
        for (key, value) in raw {
            guard let payload = value as? [String: Any] else { continue }
            out[key] = payload
        }
        return out
    }

    /// Preserve records we cannot decode when writing another project's recovery.
    /// A malformed root or target is never replaced with a newly decoded value.
    @discardableResult
    private func persistPayloads(_ payloads: [String: [String: Any]], ownerUserId: String) -> Bool {
        let storageKey = ownerScopedKey(ownerUserId)
        let original = defaults.object(forKey: storageKey)
        guard original == nil || original is [String: Any] else { return false }
        var merged: [String: Any] = payloads
        for (project, value) in (original as? [String: Any] ?? [:]) where !(value is [String: Any]) {
            merged[project] = value
        }
        defaults.set(merged, forKey: storageKey)
        return NSDictionary(dictionary: defaults.dictionary(forKey: storageKey) ?? [:]).isEqual(to: merged)
    }

    @discardableResult
    func save(
        ownerUserId: String,
        projectId: String,
        draft: String,
        baseVersionId: String,
        dirty: Bool,
        savedAt: TimeInterval = Date().timeIntervalSince1970,
        backendOrigin: URL? = nil
    ) -> Bool {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else { return false }
        var nextPayloads = payloads(ownerUserId: ownerUserId)
        var projectPayload = nextPayloads[normalizedProjectId] ?? [:]
        if let backendOrigin {
            guard let canonical = try? ScreenplayInitialProjectMetadata.origin(backendOrigin) else { return false }
            if let raw = projectPayload["ordinaryBackendOrigin"] {
                guard let text = raw as? String, let oldOrigin = URL(string: text),
                      OfflineTalkRecoveryScope.sameBackend(oldOrigin, canonical) else { return false }
                let ordinary = storedRecoverySlot(.ordinary, in: projectPayload)
                if ordinary.exists {
                    guard projectPayload["draft"] is String, projectPayload["baseVersionId"] is String,
                          projectPayload["dirty"] is Bool, projectPayload["savedAt"] is TimeInterval else { return false }
                }
            } else if storedRecoverySlot(.ordinary, in: projectPayload).exists {
                // A legacy or partial record has no proven origin. Preserve it unchanged.
                return false
            }
            projectPayload["ordinaryBackendOrigin"] = canonical.absoluteString
        } else if projectPayload["ordinaryBackendOrigin"] != nil {
            // An origin-bound record cannot be updated by an unbound caller.
            return false
        }
        projectPayload["draft"] = draft
        projectPayload["baseVersionId"] = baseVersionId
        projectPayload["dirty"] = dirty
        projectPayload["savedAt"] = savedAt
        nextPayloads[normalizedProjectId] = projectPayload
        guard persistPayloads(nextPayloads, ownerUserId: ownerUserId),
              let stored = payloads(ownerUserId: ownerUserId)[normalizedProjectId],
              let text = stored["draft"] as? String, let base = stored["baseVersionId"] as? String else { return false }
        return text.utf8.elementsEqual(draft.utf8) && base.utf8.elementsEqual(baseVersionId.utf8) &&
            stored["dirty"] as? Bool == dirty && stored["savedAt"] as? TimeInterval == savedAt
    }

    /// Known foreign and malformed origins are never treated as the current backend.
    func ordinaryOriginIsForeign(ownerUserId: String, projectId: String, backend: URL?) -> Bool {
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let raw = payloads(ownerUserId: ownerUserId)[project]?["ordinaryBackendOrigin"] else { return false }
        guard let text = raw as? String, let recorded = URL(string: text), let backend else { return true }
        return !OfflineTalkRecoveryScope.sameBackend(recorded, backend)
    }

    /// An initial-project receipt cannot retire another writer recovery copy.
    @MainActor
    func saveInitialProjectReceipt(ownerUserId: String, projectId: String,
                                   draft: String, baseVersionId: String, dirty: Bool,
                                   backendOrigin: URL? = nil) -> Bool {
        if let existing = dirtyOrdinarySnapshot(ownerUserId: ownerUserId, projectId: projectId),
           !existing.draft.utf8.elementsEqual(draft.utf8) {
            guard dirty else { return true }
            switch saveInVacantRecoverySlot(ownerUserId: ownerUserId, projectId: projectId,
                                             draft: draft, baseVersionId: baseVersionId, backendOrigin: backendOrigin) {
            case .present, .stored: return true
            case .occupied, .unconfirmed: return false
            }
        }
        return save(ownerUserId: ownerUserId, projectId: projectId, draft: draft,
                    baseVersionId: baseVersionId, dirty: dirty, backendOrigin: backendOrigin)
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
        let slot = storedRecoverySlot(.preservedConflict, in: projectPayload)
        guard !slot.exists || slot.candidate != nil else { return }
        var preserved = preservedConflicts(in: projectPayload)
        let alreadyStored = preserved.contains {
            (($0["draft"] as? String)?.utf8.elementsEqual(draft.utf8) ?? false) &&
                ($0["baseVersionId"] as? String) == baseVersionId
        }
        if !alreadyStored {
            let copy: [String: Any] = [
                "draft": draft,
                "baseVersionId": baseVersionId,
                "dirty": true,
                "savedAt": savedAt,
            ]
            // Publish the new copy as the current decision while retaining the
            // previous copy. A decision shown before this write is now stale.
            var additional = projectPayload["preservedConflicts"] as? [[String: Any]] ?? []
            if let previous = projectPayload["preservedConflict"] as? [String: Any] {
                additional.append(previous)
            }
            if !additional.isEmpty { projectPayload["preservedConflicts"] = additional }
            projectPayload["preservedConflict"] = copy
        }
        nextPayloads[normalizedProjectId] = projectPayload
        _ = persistPayloads(nextPayloads, ownerUserId: ownerUserId)
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
        let slot = storedRecoverySlot(.preservedConflict, in: projectPayload)
        guard !slot.exists || slot.candidate != nil else { return }
        if let draft {
            var additional = projectPayload["preservedConflicts"] as? [[String: Any]] ?? []
            if let index = additional.firstIndex(where: {
                (($0["draft"] as? String)?.utf8.elementsEqual(draft.utf8) ?? false) &&
                    (savedAt == nil || ($0["savedAt"] as? TimeInterval) == savedAt)
            }) {
                additional.remove(at: index)
                if additional.isEmpty { projectPayload.removeValue(forKey: "preservedConflicts") }
                else { projectPayload["preservedConflicts"] = additional }
            } else if let legacy = projectPayload["preservedConflict"] as? [String: Any],
                      ((legacy["draft"] as? String)?.utf8.elementsEqual(draft.utf8) ?? false),
                      (savedAt == nil || (legacy["savedAt"] as? TimeInterval) == savedAt) {
                projectPayload.removeValue(forKey: "preservedConflict")
            }
        } else {
            projectPayload.removeValue(forKey: "preservedConflict")
            projectPayload.removeValue(forKey: "preservedConflicts")
        }
        if projectPayload.isEmpty {
            nextPayloads.removeValue(forKey: normalizedProjectId)
        } else {
            nextPayloads[normalizedProjectId] = projectPayload
        }
        _ = persistPayloads(nextPayloads, ownerUserId: ownerUserId)
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
        projectPayload.removeValue(forKey: "ordinaryBackendOrigin")
        if projectPayload.isEmpty {
            nextPayloads.removeValue(forKey: normalizedProjectId)
        } else {
            nextPayloads[normalizedProjectId] = projectPayload
        }
        _ = persistPayloads(nextPayloads, ownerUserId: ownerUserId)
    }

    private func preservedOriginIsVisible(_ raw: Any?, backend: URL?, filterByBackend: Bool) -> Bool {
        guard filterByBackend else { return true }
        guard let raw else { return true } // Legacy copies are explicitly labeled unverified.
        guard let text = raw as? String, let recorded = URL(string: text), let backend else { return false }
        return OfflineTalkRecoveryScope.sameBackend(recorded, backend)
    }

    /// Locate one byte-exact visible copy without changing the stored queue.
    func exactPreservedConflict(ownerUserId: String, projectId: String, draft: String,
                                baseVersionId: String, backend: URL?) -> ScreenplayLocalDraftRecoverySnapshot? {
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let payload = payloads(ownerUserId: ownerUserId)[project],
              storedRecoverySlot(.preservedConflict, in: payload).candidate != nil else { return nil }
        let matches = preservedConflicts(in: payload).filter {
            exactRecoveryCandidate($0, draft: draft, baseVersionId: baseVersionId)
        }
        guard matches.count == 1, let copy = matches.first,
              preservedOriginIsVisible(copy["backendOrigin"], backend: backend, filterByBackend: true),
              let savedAt = copy["savedAt"] as? TimeInterval else { return nil }
        return ScreenplayLocalDraftRecoverySnapshot(projectId: project, draft: draft,
            baseVersionId: baseVersionId, savedAt: savedAt, isPreservedConflict: true)
    }

    func preservedSelectionIsVisible(ownerUserId: String, projectId: String, draft: String,
                                     baseVersionId: String, savedAt: TimeInterval, backend: URL?) -> Bool {
        guard let payload = payloads(ownerUserId: ownerUserId)[projectId] else { return false }
        let matches = preservedConflicts(in: payload).filter {
            exactRecoveryCandidate($0, draft: draft, baseVersionId: baseVersionId, savedAt: savedAt)
        }
        guard matches.count == 1 else { return false }
        return preservedOriginIsVisible(matches[0]["backendOrigin"], backend: backend, filterByBackend: true)
    }

    func preservedSelectionHasVerifiedOrigin(ownerUserId: String, projectId: String, draft: String,
                                             baseVersionId: String, savedAt: TimeInterval, backend: URL?) -> Bool {
        guard let payload = payloads(ownerUserId: ownerUserId)[projectId], let backend else { return false }
        let matches = preservedConflicts(in: payload).filter {
            exactRecoveryCandidate($0, draft: draft, baseVersionId: baseVersionId, savedAt: savedAt)
        }
        guard matches.count == 1, let text = matches[0]["backendOrigin"] as? String,
              let recorded = URL(string: text) else { return false }
        return OfflineTalkRecoveryScope.sameBackend(recorded, backend)
    }

    func hasForeignPreservedCopies(ownerUserId: String, projectId: String, backend: URL?) -> Bool {
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let payload = payloads(ownerUserId: ownerUserId)[project] else { return false }
        return preservedConflicts(in: payload).contains {
            !preservedOriginIsVisible($0["backendOrigin"], backend: backend, filterByBackend: true)
        }
    }

    /// Returns the active preserved decision; older copies remain queued behind it.
    func currentPreservedConflict(ownerUserId: String, projectId: String,
                                  backend: URL? = nil, filterByBackend: Bool = false) -> ScreenplayLocalDraftRecoverySnapshot? {
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !project.isEmpty, let payload = payloads(ownerUserId: ownerUserId)[project] else { return nil }
        let state = storedRecoverySlot(.preservedConflict, in: payload)
        guard let fallback = state.candidate else { return nil }
        let active = payload["preservedConflict"] as? [String: Any] ?? fallback
        let copy = preservedOriginIsVisible(active["backendOrigin"], backend: backend, filterByBackend: filterByBackend)
            ? active : preservedConflicts(in: payload).first { preservedOriginIsVisible($0["backendOrigin"], backend: backend, filterByBackend: filterByBackend) }
        guard let copy, copy["dirty"] as? Bool == true, let draft = copy["draft"] as? String,
              let base = copy["baseVersionId"] as? String, let savedAt = copy["savedAt"] as? TimeInterval else { return nil }
        return ScreenplayLocalDraftRecoverySnapshot(projectId: project, draft: draft,
            baseVersionId: base, savedAt: savedAt, isPreservedConflict: true)
    }

    func firstPreservedConflict(ownerUserId: String, projectId: String) -> ScreenplayLocalDraftRecoverySnapshot? {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty,
              let payload = payloads(ownerUserId: ownerUserId)[normalizedProjectId],
              let conflict = preservedConflicts(in: payload).first(where: { $0["dirty"] as? Bool == true }) else {
            return nil
        }
        guard let draft = conflict["draft"] as? String else { return nil }
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
            (($0["draft"] as? String)?.utf8.elementsEqual(draft.utf8) ?? false) &&
                ($0["savedAt"] as? TimeInterval) == savedAt
        }), conflicts.indices.contains(currentIndex + 1) else { return nil }
        let next = conflicts[currentIndex + 1]
        guard let nextDraft = next["draft"] as? String else { return nil }
        return ScreenplayLocalDraftRecoverySnapshot(
            projectId: normalizedProjectId,
            draft: nextDraft,
            baseVersionId: String(describing: next["baseVersionId"] ?? ""),
            savedAt: next["savedAt"] as? TimeInterval ?? 0,
            isPreservedConflict: true
        )
    }

    func hasMultiplePreservedConflicts(ownerUserId: String, projectId: String,
                                       backend: URL? = nil, filterByBackend: Bool = false) -> Bool {
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let payload = payloads(ownerUserId: ownerUserId)[project],
              storedRecoverySlot(.preservedConflict, in: payload).candidate != nil else { return false }
        return preservedConflicts(in: payload).filter {
            preservedOriginIsVisible($0["backendOrigin"], backend: backend, filterByBackend: filterByBackend)
        }.count > 1
    }

    /// Select an eligible archived copy without deleting or rewriting its content.
    @MainActor
    func activatePreservedConflict(ownerUserId: String, projectId: String, draft: String,
                                   baseVersionId: String, savedAt: TimeInterval, backend: URL?) -> Bool {
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !project.isEmpty else { return false }
        var all = payloads(ownerUserId: ownerUserId)
        guard var payload = all[project], let fallback = storedRecoverySlot(.preservedConflict, in: payload).candidate else { return false }
        let copies = preservedConflicts(in: payload)
        let matches = copies.indices.filter { exactRecoveryCandidate(copies[$0], draft: draft, baseVersionId: baseVersionId, savedAt: savedAt) }
        guard matches.count == 1, let index = matches.first,
              preservedOriginIsVisible(copies[index]["backendOrigin"], backend: backend, filterByBackend: true) else { return false }
        let current = payload["preservedConflict"] as? [String: Any] ?? fallback
        if exactRecoveryCandidate(current, draft: draft, baseVersionId: baseVersionId, savedAt: savedAt) { return true }
        let next = copies[index]
        let remaining = copies.enumerated().filter { $0.offset != index }.map(\.element)
        payload["preservedConflict"] = next
        if remaining.isEmpty { payload.removeValue(forKey: "preservedConflicts") }
        else { payload["preservedConflicts"] = remaining }
        all[project] = payload
        _ = persistPayloads(all, ownerUserId: ownerUserId)
        return NSDictionary(dictionary: payloads(ownerUserId: ownerUserId)).isEqual(to: all)
    }

    /// Moves the current preserved copy behind the next one without deleting text.
    /// The expected identity protects against advancing an obsolete UI decision.
    @MainActor
    func advancePreservedConflict(ownerUserId: String, projectId: String, draft: String,
                                  baseVersionId: String, savedAt: TimeInterval,
                                  backend: URL? = nil, filterByBackend: Bool = false) -> Bool {
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !project.isEmpty else { return false }
        var all = payloads(ownerUserId: ownerUserId)
        guard var payload = all[project] else { return false }
        let state = storedRecoverySlot(.preservedConflict, in: payload)
        guard let fallback = state.candidate else { return false }
        let current = payload["preservedConflict"] as? [String: Any] ?? fallback
        let copies = preservedConflicts(in: payload)
        if filterByBackend {
            let matching = copies.indices.filter { exactRecoveryCandidate(copies[$0], draft: draft, baseVersionId: baseVersionId, savedAt: savedAt) }
            let eligible = copies.indices.filter { preservedOriginIsVisible(copies[$0]["backendOrigin"], backend: backend, filterByBackend: true) }
            guard matching.count == 1, eligible.count > 1, let selected = matching.first,
                  let position = eligible.firstIndex(of: selected) else { return false }
            let nextIndex = eligible[(position + 1) % eligible.count]
            let next = copies[nextIndex]
            guard let nextDraft = next["draft"] as? String, let nextBase = next["baseVersionId"] as? String,
                  let nextTime = next["savedAt"] as? TimeInterval, next["dirty"] as? Bool == true,
                  copies.filter({ exactRecoveryCandidate($0, draft: nextDraft, baseVersionId: nextBase, savedAt: nextTime) }).count == 1 else { return false }
            payload["preservedConflict"] = next
            let remaining = copies.enumerated().filter { $0.offset != nextIndex }.map(\.element)
            if remaining.isEmpty { payload.removeValue(forKey: "preservedConflicts") }
            else { payload["preservedConflicts"] = remaining }
            all[project] = payload
            _ = persistPayloads(all, ownerUserId: ownerUserId)
            return NSDictionary(dictionary: payloads(ownerUserId: ownerUserId)).isEqual(to: all)
        }
        guard copies.filter({ exactRecoveryCandidate($0, draft: draft, baseVersionId: baseVersionId, savedAt: savedAt) }).count == 1,
              exactRecoveryCandidate(current, draft: draft, baseVersionId: baseVersionId, savedAt: savedAt),
              var archived = payload["preservedConflicts"] as? [[String: Any]] else { return false }
        if payload["preservedConflict"] == nil {
            guard let index = archived.firstIndex(where: {
                exactRecoveryCandidate($0, draft: draft, baseVersionId: baseVersionId, savedAt: savedAt)
            }) else { return false }
            archived.remove(at: index)
        }
        guard !archived.isEmpty else { return false }
        let next = archived.removeFirst()
        guard let nextDraft = next["draft"] as? String,
              let nextBase = next["baseVersionId"] as? String,
              let nextTime = next["savedAt"] as? TimeInterval,
              next["dirty"] as? Bool == true,
              copies.filter({ exactRecoveryCandidate($0, draft: nextDraft, baseVersionId: nextBase, savedAt: nextTime) }).count == 1 else { return false }
        archived.append(current)
        payload["preservedConflict"] = next
        payload["preservedConflicts"] = archived
        all[project] = payload
        _ = persistPayloads(all, ownerUserId: ownerUserId)
        return NSDictionary(dictionary: payloads(ownerUserId: ownerUserId)).isEqual(to: all)
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
        // Malformed or ambiguous stored copies cannot authorize a decision.
        guard let fallback = slotState.candidate else { return .changed }
        let current = slot == .preservedConflict
            ? (payload["preservedConflict"] as? [String: Any] ?? fallback)
            : fallback
        let matchingCount = slot == .preservedConflict
            ? preservedConflicts(in: payload).filter {
                exactRecoveryCandidate($0, draft: draft, baseVersionId: baseVersionId, savedAt: savedAt)
              }.count
            : 1
        guard matchingCount == 1,
              exactRecoveryCandidate(current, draft: draft, baseVersionId: baseVersionId, savedAt: savedAt) else {
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
        // Malformed or ambiguous stored copies cannot authorize a decision.
        guard let fallback = slotState.candidate else { return .changed }
        let current = slot == .preservedConflict
            ? (payload["preservedConflict"] as? [String: Any] ?? fallback)
            : fallback
        let matchingCount = slot == .preservedConflict
            ? preservedConflicts(in: payload).filter {
                exactRecoveryCandidate($0, draft: draft, baseVersionId: baseVersionId, savedAt: savedAt)
              }.count
            : 1
        guard matchingCount == 1,
              exactRecoveryCandidate(current, draft: draft, baseVersionId: baseVersionId, savedAt: savedAt) else {
            return .changed
        }

        switch slot {
        case .ordinary:
            for key in ["draft", "baseVersionId", "dirty", "savedAt", "ordinaryBackendOrigin"] {
                payload.removeValue(forKey: key)
            }
        case .preservedConflict:
            var additional = payload["preservedConflicts"] as? [[String: Any]] ?? []
            if let index = additional.firstIndex(where: {
                exactRecoveryCandidate($0, draft: draft, baseVersionId: baseVersionId, savedAt: savedAt)
            }) {
                additional.remove(at: index)
                if additional.isEmpty { payload.removeValue(forKey: "preservedConflicts") }
                else { payload["preservedConflicts"] = additional }
            } else {
                payload.removeValue(forKey: "preservedConflict")
            }
        }

        if payload.isEmpty {
            all.removeValue(forKey: project)
        } else {
            all[project] = payload
        }
        _ = persistPayloads(all, ownerUserId: ownerUserId)

        let storedPayloads = payloads(ownerUserId: ownerUserId)
        guard NSDictionary(dictionary: storedPayloads).isEqual(to: all) else {
            return .unconfirmed
        }
        let storedProject = storedPayloads[project]
        let slotIsAbsent: Bool
        switch slot {
        case .ordinary: slotIsAbsent = storedProject?["draft"] == nil
        case .preservedConflict:
            slotIsAbsent = !preservedConflicts(in: storedProject ?? [:]).contains {
                exactRecoveryCandidate($0, draft: draft, baseVersionId: baseVersionId, savedAt: savedAt)
            }
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
        preferPreservedConflict: Bool = false,
        backendOrigin: URL? = nil
    ) -> ScreenplayVacantRecoveryWriteResult {
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !project.isEmpty else { return .unconfirmed }
        var all = payloads(ownerUserId: ownerUserId)
        var payload = all[project] ?? [:]

        let canonicalOrigin: URL?
        if let backendOrigin {
            guard let canonical = try? ScreenplayInitialProjectMetadata.origin(backendOrigin) else { return .unconfirmed }
            canonicalOrigin = canonical
        } else { canonicalOrigin = nil }
        func sameOrigin(_ raw: Any?) -> Bool {
            guard let raw else { return canonicalOrigin == nil }
            guard let text = raw as? String, let recorded = URL(string: text), let canonicalOrigin else { return false }
            return OfflineTalkRecoveryScope.sameBackend(recorded, canonicalOrigin)
        }
        let ordinary = storedRecoverySlot(.ordinary, in: payload)
        if !ordinary.exists, payload["ordinaryBackendOrigin"] != nil { return .unconfirmed }
        if let candidate = ordinary.candidate, sameOrigin(payload["ordinaryBackendOrigin"]),
           exactRecoveryCandidate(candidate, draft: draft, baseVersionId: baseVersionId) {
            return .present(.ordinary)
        }
        let preserved = storedRecoverySlot(.preservedConflict, in: payload)
        if preserved.candidate != nil, preservedConflicts(in: payload).contains(where: {
            sameOrigin($0["backendOrigin"]) && exactRecoveryCandidate($0, draft: draft, baseVersionId: baseVersionId)
        }) {
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

        var candidate: [String: Any] = [
            "draft": draft,
            "baseVersionId": baseVersionId,
            "dirty": true,
            "savedAt": savedAt,
        ]
        switch slot {
        case .ordinary:
            for (key, value) in candidate { payload[key] = value }
            if let canonicalOrigin { payload["ordinaryBackendOrigin"] = canonicalOrigin.absoluteString }
        case .preservedConflict:
            if let canonicalOrigin { candidate["backendOrigin"] = canonicalOrigin.absoluteString }
            payload["preservedConflict"] = candidate
        }
        all[project] = payload
        _ = persistPayloads(all, ownerUserId: ownerUserId)

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
                                        draft: String, baseVersionId: String,
                                        backendOrigin: URL? = nil) -> ScreenplayConditionalRecoveryResult {
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !project.isEmpty else { return .unconfirmed }
        var all = payloads(ownerUserId: ownerUserId)
        var payload = all[project] ?? [:]
        let canonicalOrigin: URL?
        if let backendOrigin {
            guard let canonical = try? ScreenplayInitialProjectMetadata.origin(backendOrigin) else { return .unconfirmed }
            canonicalOrigin = canonical
        } else { canonicalOrigin = nil }
        func sameOrigin(_ raw: Any?) -> Bool {
            guard let raw else { return canonicalOrigin == nil }
            guard let text = raw as? String, let recorded = URL(string: text), let canonicalOrigin else { return false }
            return OfflineTalkRecoveryScope.sameBackend(recorded, canonicalOrigin)
        }
        func exact(_ value: [String: Any]) -> Bool {
            guard let text = value["draft"] as? String, let base = value["baseVersionId"] as? String else { return false }
            return text.utf8.elementsEqual(draft.utf8) && base.utf8.elementsEqual(baseVersionId.utf8)
        }
        if storedRecoverySlot(.preservedConflict, in: payload).candidate != nil,
           preservedConflicts(in: payload).contains(where: { $0["dirty"] as? Bool == true && sameOrigin($0["backendOrigin"]) && exact($0) }) { return .present }
        if storedRecoverySlot(.ordinary, in: payload).exists {
            guard payload["draft"] is String, payload["baseVersionId"] is String else { return .unconfirmed }
            guard sameOrigin(payload["ordinaryBackendOrigin"]), exact(payload) else { return .occupied }
        } else if payload["ordinaryBackendOrigin"] != nil { return .unconfirmed }
        if let canonicalOrigin { payload["ordinaryBackendOrigin"] = canonicalOrigin.absoluteString }
        payload["draft"] = draft
        payload["baseVersionId"] = baseVersionId
        payload["dirty"] = true
        payload["savedAt"] = Date().timeIntervalSince1970
        all[project] = payload
        _ = persistPayloads(all, ownerUserId: ownerUserId)
        let stored = payloads(ownerUserId: ownerUserId)[project] ?? [:]
        return exact(stored) && stored["dirty"] as? Bool == true ? .present : .unconfirmed
    }

    /// Unknown or foreign origins cannot authorize automatic retirement.
    func canAutomaticallyRetireRecovery(ownerUserId: String, projectId: String, backend: URL?) -> Bool {
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !project.isEmpty else { return false }
        guard let payload = payloads(ownerUserId: ownerUserId)[project] else { return true }
        let preservedSlot = storedRecoverySlot(.preservedConflict, in: payload)
        if preservedSlot.exists && preservedSlot.candidate == nil { return false }
        func isComplete(_ copy: [String: Any]) -> Bool {
            copy["draft"] is String && copy["baseVersionId"] is String &&
                copy["dirty"] is Bool && copy["savedAt"] is TimeInterval
        }
        let ordinary = storedRecoverySlot(.ordinary, in: payload)
        if ordinary.exists && !isComplete(payload) { return false }
        if preservedConflicts(in: payload).contains(where: { !isComplete($0) }) { return false }
        if ordinaryOriginIsForeign(ownerUserId: ownerUserId, projectId: project, backend: backend) ||
            hasForeignPreservedCopies(ownerUserId: ownerUserId, projectId: project, backend: backend) { return false }
        if storedRecoverySlot(.ordinary, in: payload).exists && payload["ordinaryBackendOrigin"] == nil { return false }
        return !preservedConflicts(in: payload).contains { $0["backendOrigin"] == nil }
    }

    @discardableResult
    func clearMatchingRecoveryIfOriginSafe(ownerUserId: String, projectId: String, draft: String,
                                           baseVersionId: String, backend: URL?) -> Bool {
        guard canAutomaticallyRetireRecovery(ownerUserId: ownerUserId, projectId: projectId, backend: backend) else { return false }
        clearMatchingRecovery(ownerUserId: ownerUserId, projectId: projectId, draft: draft, baseVersionId: baseVersionId)
        return true
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
            for key in ["draft", "baseVersionId", "dirty", "savedAt", "ordinaryBackendOrigin"] { payload.removeValue(forKey: key) }
        }
        let copies = preservedConflicts(in: payload)
        if copies.count == 1, matches(copies[0]), storedRecoverySlot(.preservedConflict, in: payload).candidate != nil {
            payload.removeValue(forKey: "preservedConflict")
            payload.removeValue(forKey: "preservedConflicts")
        }
        if payload.isEmpty { all.removeValue(forKey: project) } else { all[project] = payload }
        _ = persistPayloads(all, ownerUserId: ownerUserId)
    }

    func hasExactDirtyRecovery(ownerUserId: String, projectId: String, draft: String,
                               baseVersionId: String, backend: URL?) -> Bool {
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let backend, let stored = payloads(ownerUserId: ownerUserId)[project] else { return false }
        func matches(_ copy: [String: Any], originKey: String) -> Bool {
            guard copy["dirty"] as? Bool == true,
                  let text = copy["draft"] as? String, let base = copy["baseVersionId"] as? String,
                  let originText = copy[originKey] as? String, let origin = URL(string: originText),
                  OfflineTalkRecoveryScope.sameBackend(origin, backend) else { return false }
            return text.utf8.elementsEqual(draft.utf8) && base.utf8.elementsEqual(baseVersionId.utf8)
        }
        return matches(stored, originKey: "ordinaryBackendOrigin") ||
            preservedConflicts(in: stored).contains { matches($0, originKey: "backendOrigin") }
    }

    func holdsDifferentUnsavedWork(ownerUserId: String, projectId: String, differingFrom draft: String) -> Bool {
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let stored = payloads(ownerUserId: ownerUserId)[project],
              stored["dirty"] as? Bool == true else { return false }
        guard let storedDraft = stored["draft"] as? String else { return true }
        return !storedDraft.utf8.elementsEqual(draft.utf8)
    }

    func clear(ownerUserId: String, projectId: String) {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else { return }
        var nextPayloads = payloads(ownerUserId: ownerUserId)
        nextPayloads.removeValue(forKey: normalizedProjectId)
        _ = persistPayloads(nextPayloads, ownerUserId: ownerUserId)
    }

    func dirtyOrdinarySnapshot(ownerUserId: String, projectId: String) -> ScreenplayLocalDraftRecoverySnapshot? {
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let stored = payloads(ownerUserId: ownerUserId)[project],
              stored["dirty"] as? Bool == true,
              let draft = stored["draft"] as? String else { return nil }
        return ScreenplayLocalDraftRecoverySnapshot(projectId: project, draft: draft,
            baseVersionId: stored["baseVersionId"] as? String ?? "",
            savedAt: stored["savedAt"] as? TimeInterval ?? 0, isPreservedConflict: false)
    }

    func recoverySnapshot(
        ownerUserId: String,
        projectId: String,
        serverDraft: String,
        retainUnscopedMatching: Bool = false,
        backend: URL? = nil,
        filterByBackend: Bool = false
    ) -> ScreenplayLocalDraftRecoverySnapshot? {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty,
              let stored = payloads(ownerUserId: ownerUserId)[normalizedProjectId] else { return nil }

        // A malformed preserved slot is never treated as vacant or retired.
        let preservedSlot = storedRecoverySlot(.preservedConflict, in: stored)
        guard !preservedSlot.exists || preservedSlot.candidate != nil else { return nil }
        // Recovery may retire a writer copy only when its actual bytes match.
        let allCopies = preservedConflicts(in: stored)
        let allPreserved = allCopies.filter {
            preservedOriginIsVisible($0["backendOrigin"], backend: backend, filterByBackend: filterByBackend)
        }
        let hasForeignCopies = allPreserved.count != allCopies.count
        // A matching server page does not settle which of several saved copies
        // the writer wants to keep. Leave all copies for an explicit decision.
        if allPreserved.count > 1 {
            return currentPreservedConflict(ownerUserId: ownerUserId, projectId: normalizedProjectId,
                backend: backend, filterByBackend: filterByBackend)
        }
        let activePreserved = (stored["preservedConflict"] as? [String: Any]).flatMap { copy in
            preservedOriginIsVisible(copy["backendOrigin"], backend: backend, filterByBackend: filterByBackend) ? copy : nil
        }
        let orderedPreserved = activePreserved.map { active in
            [active] + allPreserved.filter { !NSDictionary(dictionary: $0).isEqual(to: active) }
        } ?? allPreserved
        for preserved in orderedPreserved where preserved["dirty"] as? Bool == true {
            guard let draft = preserved["draft"] as? String else { continue }
            if !draft.utf8.elementsEqual(serverDraft.utf8) || hasForeignCopies ||
                (retainUnscopedMatching && preserved["backendOrigin"] == nil) {
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
                retainUnscopedMatching: retainUnscopedMatching, backend: backend, filterByBackend: filterByBackend
            )
        }

        guard !filterByBackend || !ordinaryOriginIsForeign(ownerUserId: ownerUserId,
            projectId: normalizedProjectId, backend: backend) else { return nil }
        guard let latestStored = payloads(ownerUserId: ownerUserId)[normalizedProjectId] else { return nil }
        guard let storedDraft = latestStored["draft"] as? String,
              latestStored["dirty"] as? Bool == true else { return nil }

        if storedDraft.utf8.elementsEqual(serverDraft.utf8) &&
            !(retainUnscopedMatching && latestStored["ordinaryBackendOrigin"] == nil) {
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

    private func preservedConflicts(in projectPayload: [String: Any]) -> [[String: Any]] {
        var copies = projectPayload["preservedConflicts"] as? [[String: Any]] ?? []
        if let legacy = projectPayload["preservedConflict"] as? [String: Any] {
            copies.append(legacy)
        }
        return copies.enumerated().sorted { left, right in
            let leftTime = left.element["savedAt"] as? TimeInterval ?? .greatestFiniteMagnitude
            let rightTime = right.element["savedAt"] as? TimeInterval ?? .greatestFiniteMagnitude
            return leftTime == rightTime ? left.offset < right.offset : leftTime < rightTime
        }.map(\.element)
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
            if let value = payload["preservedConflicts"], !(value is [[String: Any]]) { return (true, nil) }
            if let value = payload["preservedConflict"], !(value is [String: Any]) { return (true, nil) }
            let copies = preservedConflicts(in: payload)
            return (!copies.isEmpty, copies.first)
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

    // Ownerless legacy drafts remain untouched for explicit Device Recovery.

}

import Foundation
import CryptoKit
import Network

nonisolated extension Notification.Name {
    static let themScreenplayDraftSaveOutboxUpdated = Notification.Name(
        "io.them.them.screenplayDraftSaveOutboxUpdated"
    )
    static let themScreenplayDraftSaveOutboxRetryRequested = Notification.Name(
        "io.them.them.screenplayDraftSaveOutboxRetryRequested"
    )
}

nonisolated enum ScreenplayDraftSaveOutboxStatus: String, Codable, Equatable {
    case pending
    case inflight
    case parked
}

/// Created once with DraftSaveRequest and copied unchanged into every later
/// materialization of that request. Wall-clock time is not request authority.
nonisolated struct ScreenplayDraftSaveRequestAuthority: Codable, Equatable, Sendable {
    let id: UUID
    let generation: UInt64
}

/// Content-free authority to retire one exact parked conflict only after a
/// replacement save receives a matching server acknowledgement. The digest
/// includes explicit nil-origin presence and the referenced row's lineage.
nonisolated struct ScreenplayDraftConflictRequestReference: Codable, Equatable, Sendable {
    let requestID: String
    let projectId: String
    let ownerUserId: String
    let deliveryOrigin: ScreenplayDraftSaveOrigin?
    let requestAuthority: ScreenplayDraftSaveRequestAuthority?
    let requestDigest: String
}

/// Stored inside a parked compatibility marker. Previous array-only builds
/// ignore this new field, but still see the same request ID as parked and
/// therefore cannot deliver that retired request after an app downgrade.
nonisolated struct ScreenplayDraftLoadServerRetirement: Codable, Equatable, Sendable {
    let requestID: String
    let projectId: String
    let ownerUserId: String
    let deliveryOrigin: ScreenplayDraftSaveOrigin
    let requestAuthority: ScreenplayDraftSaveRequestAuthority?
    let requestDigest: String?
    // Decode-only compatibility for the unreleased v1 marker. New markers
    // leave these nil so the fence never retains writer notes or source text.
    let source: String?
    let notes: String?
}

nonisolated struct ScreenplayDraftSaveOutboxEntry: Identifiable, Codable, Equatable {
    let id: String
    let projectId: String
    let ownerUserId: String
    let draft: String
    let title: String
    let phase: String
    let notes: String
    let source: String
    let studioWriteAnchors: [BackendScreenplayWriteAnchor]
    let screenplayBindings: [BackendScreenplayBindingRecord]
    var baseVersionId: String
    let createdAt: TimeInterval
    var updatedAt: TimeInterval
    var status: ScreenplayDraftSaveOutboxStatus
    var retries: Int
    var nextAttemptAt: TimeInterval
    var lastError: String
    var initialization: ScreenplayInitialProjectMetadata? = nil
    var deliveryOrigin: ScreenplayDraftSaveOrigin? = nil
    var requestAuthority: ScreenplayDraftSaveRequestAuthority? = nil
    var loadServerRetirement: ScreenplayDraftLoadServerRetirement? = nil
    /// Additive metadata only. Older clients drop this field when rewriting the
    /// manifest, so release rollback remains unsafe until they are fenced out.
    var supersededConflictRequests: [ScreenplayDraftConflictRequestReference] = []

    var isPassiveAutosave: Bool { source == "studio_autosave" && notes.isEmpty }

    func isSatisfiedByAcknowledgement(of saved: Self, versionID: String) -> Bool {
        guard isPassiveAutosave, deliveryOrigin != nil, !versionID.isEmpty,
              baseVersionId == saved.baseVersionId || baseVersionId == versionID else { return false }
        var originalBase = self
        originalBase.baseVersionId = saved.baseVersionId
        return originalBase.hasSameWritingTarget(as: saved)
    }

    func hasSameTarget(as other: Self) -> Bool {
        hasSameWritingTarget(as: other) && studioWriteAnchors == other.studioWriteAnchors &&
            screenplayBindings == other.screenplayBindings
    }

    private func hasSameWritingTarget(as other: Self) -> Bool {
        projectId == other.projectId && ownerUserId == other.ownerUserId &&
            deliveryOrigin == other.deliveryOrigin && baseVersionId == other.baseVersionId &&
            title == other.title && phase == other.phase && initialization == other.initialization &&
            supersededConflictRequests == other.supersededConflictRequests &&
            draft.utf8.elementsEqual(other.draft.utf8)
    }
}

nonisolated struct ScreenplayDraftSaveOutboxSnapshot: Equatable {
    let pendingCount: Int
    let inflightCount: Int
    let parkedCount: Int
    let lastError: String

    static let empty = ScreenplayDraftSaveOutboxSnapshot(
        pendingCount: 0,
        inflightCount: 0,
        parkedCount: 0,
        lastError: ""
    )

    var activeCount: Int { pendingCount + inflightCount }

    var notificationUserInfo: [String: Any] {
        [
            "pendingCount": pendingCount,
            "inflightCount": inflightCount,
            "parkedCount": parkedCount,
            "lastError": lastError,
        ]
    }
}

nonisolated enum ScreenplayDraftSaveDelivery {
    case deliver(ScreenplayDraftSaveOutboxEntry)
    case alreadyInflight(ScreenplayDraftSaveOutboxEntry)
    case parked(ScreenplayDraftSaveOutboxEntry)
}

/// In-memory proof of the exact conflict requests selected by Load Server.
/// Resolution never infers deletion authority from age or broad scope.
nonisolated struct ScreenplayDraftLoadServerSelection: Equatable {
    let id: UUID
    let projectId: String
    let ownerUserId: String
    let deliveryOrigin: ScreenplayDraftSaveOrigin
    let requests: [ScreenplayDraftSaveOutboxEntry]
}

nonisolated struct ScreenplayDraftLoadServerResolution: Equatable {
    let selectionID: UUID
    let retiredRequestIDs: [String]
}

actor ScreenplayDraftSaveOutbox {
    static let shared = ScreenplayDraftSaveOutbox(storageDirectory: defaultStorageDirectory())

    private static let maxDraftBytes = 2 * 1024 * 1024
    private static let backoffSeconds: [TimeInterval] = [2, 5, 15, 60, 300]
    private static let conflictReason = "Server draft changed. Choose Keep Mine or Load Server."
    private static let retirementReason = "Load Server retired this exact local request. Update io.them before retrying it."
    private static let retirementProjectID = "load-server-retirement"
    private static let retirementOwnerID = "load-server-retirement"
    private static let retirementSource = "studio_load_server_retirement"
    private static let retirementNotesPrefix = "load-server-retirement-v2:"
    private static let legacyRetirementNotesPrefix = "load-server-retirement-v1:"

    private let storageDirectory: URL
    private let manifestURL: URL
    private let fileManager: FileManager
    private let manifestWriter: @Sendable (Data, URL) throws -> Void
    private var didLoad = false
    private var entries: [ScreenplayDraftSaveOutboxEntry] = []
    private var retirementMarkers: [ScreenplayDraftSaveOutboxEntry] = []
    private var networkMonitor: NWPathMonitor?
    private let networkMonitorQueue = DispatchQueue(label: "io.them.screenplay-save-outbox.network")

    init(
        storageDirectory: URL,
        fileManager: FileManager = .default,
        manifestWriter: @escaping @Sendable (Data, URL) throws -> Void = { data, url in
            try data.write(to: url, options: .atomic)
        }
    ) {
        self.storageDirectory = storageDirectory
        self.manifestURL = storageDirectory.appendingPathComponent("queue.json")
        self.fileManager = fileManager
        self.manifestWriter = manifestWriter
    }

    func startNetworkMonitoring() {
        do {
            try loadIfNeeded()
            publishSnapshot()
        } catch {
            publish(snapshotFor(entries, lastError: error.localizedDescription))
        }
        guard networkMonitor == nil else { return }
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { path in
            guard path.status == .satisfied else { return }
            DispatchQueue.main.async {
                NotificationCenter.default.post(
                    name: .themScreenplayDraftSaveOutboxRetryRequested,
                    object: nil
                )
            }
        }
        monitor.start(queue: networkMonitorQueue)
        networkMonitor = monitor
    }

    func stopNetworkMonitoring() {
        networkMonitor?.cancel()
        networkMonitor = nil
    }

    func snapshot(ownerUserId: String? = nil) -> ScreenplayDraftSaveOutboxSnapshot {
        do {
            try loadIfNeeded()
            let scopedEntries: [ScreenplayDraftSaveOutboxEntry]
            if let ownerUserId {
                let cleanOwnerUserId = ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines)
                scopedEntries = entries.filter { $0.ownerUserId == cleanOwnerUserId }
            } else {
                scopedEntries = entries
            }
            return snapshotFor(scopedEntries)
        } catch {
            return snapshotFor([], lastError: error.localizedDescription)
        }
    }

    @discardableResult
    func enqueue(_ entry: ScreenplayDraftSaveOutboxEntry) throws -> ScreenplayDraftSaveOutboxSnapshot {
        _ = try enqueueForDelivery(entry)
        return snapshotFor(entries)
    }

    /// An exact retired request is deliberately not queued. Check and enqueue
    /// within the actor so a retirement cannot race a separate admission check.
    @discardableResult
    func enqueueUnlessRetiredByLoadServer(_ entry: ScreenplayDraftSaveOutboxEntry) throws -> Bool {
        try loadIfNeeded()
        if let marker = retirementMarkers.first(where: { $0.id == entry.id }) {
            guard retirementMarker(marker, matches: entry) else {
                throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_id_reused")
            }
            return false
        }
        _ = try enqueueForDelivery(entry)
        return true
    }

    /// Delivery must use the ID and base actually retained on disk, including
    /// when a second caller coalesces with an already queued identical save.
    func enqueueForDelivery(_ entry: ScreenplayDraftSaveOutboxEntry) throws -> ScreenplayDraftSaveOutboxEntry {
        try loadIfNeeded()
        guard entry.draft.utf8.count <= Self.maxDraftBytes else {
            throw BackendMemoryAPIError.server(status: 413, message: "screenplay_draft_too_large")
        }
        if let marker = retirementMarkers.first(where: { $0.id == entry.id }) {
            guard retirementMarker(marker, matches: entry) else {
                throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_id_reused")
            }
            return marker
        }
        if let index = entries.firstIndex(where: { $0.id == entry.id }) {
            guard entries[index].projectId == entry.projectId,
                  entries[index].ownerUserId == entry.ownerUserId,
                  entries[index].deliveryOrigin == entry.deliveryOrigin,
                  entries[index].requestAuthority == entry.requestAuthority,
                  entries[index].loadServerRetirement == entry.loadServerRetirement,
                  entries[index].supersededConflictRequests == entry.supersededConflictRequests,
                  entries[index].draft.utf8.elementsEqual(entry.draft.utf8) else {
                throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_id_reused")
            }
            let nextSnapshot = snapshotFor(entries)
            publish(nextSnapshot)
            return entries[index]
        }
        if let existing = entries.first(where: { existing in
            existing.status != .parked && existing.hasSameTarget(as: entry) &&
                ((existing.source == entry.source && existing.notes == entry.notes) ||
                    (entry.isPassiveAutosave && entry.deliveryOrigin != nil))
        }) {
            let nextSnapshot = snapshotFor(entries)
            publish(nextSnapshot)
            return existing
        }
        let previous = entries
        entries.append(entry)
        entries.sort { lhs, rhs in
            if lhs.createdAt == rhs.createdAt { return lhs.id < rhs.id }
            return lhs.createdAt < rhs.createdAt
        }
        do { try persist() } catch { entries = previous; throw error }
        let nextSnapshot = snapshotFor(entries)
        publish(nextSnapshot)
        return entry
    }

    /// Canonical identity and inflight admission share one actor transaction.
    func beginDelivery(_ entry: ScreenplayDraftSaveOutboxEntry,
        continuingInflightID: String? = nil) throws -> ScreenplayDraftSaveDelivery {
        let retained = try enqueueForDelivery(entry)
        if retained.status == .parked { return .parked(retained) }
        if retained.status == .inflight {
            return continuingInflightID == retained.id && entry.id == retained.id
                ? .deliver(retained) : .alreadyInflight(retained)
        }
        try markInflight(id: retained.id)
        guard let inflight = entries.first(where: { $0.id == retained.id }) else { throw BackendMemoryAPIError.invalidResponse }
        return .deliver(inflight)
    }

    /// Check the actual stored row before absorbing an identical passive retry.
    /// Actor memory alone is not evidence that the earlier write reached disk.
    func hasDurableTarget(id: String, matching entry: ScreenplayDraftSaveOutboxEntry) throws -> Bool {
        guard fileManager.fileExists(atPath: manifestURL.path) else { return false }
        let stored = try JSONDecoder().decode([ScreenplayDraftSaveOutboxEntry].self,
            from: Data(contentsOf: manifestURL))
        return stored.contains { $0.id == id && $0.hasSameTarget(as: entry) }
    }

    func beginNext(
        projectId: String,
        ownerUserId: String,
        now: Date = Date(),
        force: Bool = false
    ) throws -> ScreenplayDraftSaveOutboxEntry? {
        try loadIfNeeded()
        let cleanProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanOwnerUserId = ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        let nowSeconds = now.timeIntervalSince1970
        var nextIndex: Int?
        var blockingConflicts: [ScreenplayDraftSaveOutboxEntry] = []
        for index in entries.indices {
            let candidate = entries[index]
            guard candidate.projectId == cleanProjectId,
                  candidate.ownerUserId == cleanOwnerUserId,
                  candidate.initialization == nil else { continue }
            if candidate.status == .parked && candidate.lastError == Self.conflictReason {
                blockingConflicts.append(candidate)
                continue
            }
            guard candidate.status == .pending,
                  force || candidate.nextAttemptAt <= nowSeconds else {
                return nil
            }
            guard blockingConflicts.allSatisfy({ conflict in
                candidate.supersededConflictRequests.contains { reference in
                    conflictReference(reference, matches: conflict)
                }
            }) else {
                return nil
            }
            nextIndex = index
            break
        }
        guard let index = nextIndex else {
            return nil
        }
        let previous = entries
        entries[index].status = .inflight
        entries[index].updatedAt = nowSeconds
        do { try persist() } catch { entries = previous; throw error }
        publishSnapshot()
        return entries[index]
    }

    func hasActiveEntries(projectId: String, ownerUserId: String) throws -> Bool {
        try loadIfNeeded()
        let cleanProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanOwnerUserId = ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        return entries.contains { entry in
            entry.projectId == cleanProjectId &&
                entry.ownerUserId == cleanOwnerUserId &&
                (entry.status == .pending || entry.status == .inflight)
        }
    }

    func markInflight(id: String, now: Date = Date()) throws {
        try loadIfNeeded()
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        let previous = entries
        entries[index].status = .inflight
        entries[index].updatedAt = now.timeIntervalSince1970
        do { try persist() } catch { entries = previous; throw error }
        publishSnapshot()
    }

    func markSucceeded(
        id: String,
        serverVersionId: String,
        now: Date = Date()
    ) throws {
        try loadIfNeeded()
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        let previous = entries
        let completed = entries.remove(at: index)
        let nextBase = serverVersionId.trimmingCharacters(in: .whitespacesAndNewlines)
        if !nextBase.isEmpty {
            for queuedIndex in entries.indices where
                entries[queuedIndex].projectId == completed.projectId &&
                entries[queuedIndex].ownerUserId == completed.ownerUserId &&
                entries[queuedIndex].deliveryOrigin == completed.deliveryOrigin &&
                entries[queuedIndex].status != .parked &&
                entries[queuedIndex].createdAt >= completed.createdAt &&
                entries[queuedIndex].baseVersionId == completed.baseVersionId {
                entries[queuedIndex].baseVersionId = nextBase
                entries[queuedIndex].updatedAt = now.timeIntervalSince1970
            }
        }
        do { try persist() } catch { entries = previous; throw error }
        publishSnapshot()
    }

    /// Commits one Keep Mine acknowledgement and its exact conflict lineage in
    /// one manifest write. A normal POST echo is required; the current readback
    /// evidence does not prove all immutable metadata and must not call this.
    func completeConfirmedConflictResolution(
        _ resolution: ScreenplayDraftSaveOutboxEntry,
        evidence: ScreenplayConfirmedDraftSave,
        echoedRequestID: String,
        now: Date = Date()
    ) throws {
        try loadIfNeeded()
        guard !resolution.supersededConflictRequests.isEmpty,
              Set(resolution.supersededConflictRequests.map(\.requestID)).count ==
                resolution.supersededConflictRequests.count,
              let resolutionIndex = entries.firstIndex(where: { $0.id == resolution.id }),
              sameImmutableRequest(entries[resolutionIndex], resolution),
              entries[resolutionIndex].status == .inflight,
              echoedRequestID == resolution.id,
              evidence.requestID == resolution.id,
              evidence.owner.userID == resolution.ownerUserId,
              evidence.projectID == resolution.projectId,
              evidence.draft.utf8.elementsEqual(resolution.draft.utf8),
              validIdentifier(evidence.versionID),
              let origin = resolution.deliveryOrigin,
              evidence.documentID == origin.documentID,
              origin.permitsBackend(evidence.backendURL) else {
            throw BackendMemoryAPIError.invalidResponse
        }

        var referencedIDs = Set<String>()
        for reference in resolution.supersededConflictRequests {
            guard reference.projectId == resolution.projectId,
                  reference.ownerUserId == resolution.ownerUserId,
                  reference.requestID != resolution.id,
                  referencedIDs.insert(reference.requestID).inserted,
                  let conflict = entries.first(where: { $0.id == reference.requestID }),
                  conflict.status == .parked,
                  conflict.lastError == Self.conflictReason,
                  conflictReference(reference, matches: conflict) else {
                throw BackendMemoryAPIError.invalidResponse
            }
        }

        let previous = entries
        let completed = entries[resolutionIndex]
        entries.removeAll { $0.id == completed.id || referencedIDs.contains($0.id) }
        for queuedIndex in entries.indices where
            entries[queuedIndex].projectId == completed.projectId &&
            entries[queuedIndex].ownerUserId == completed.ownerUserId &&
            entries[queuedIndex].deliveryOrigin == completed.deliveryOrigin &&
            entries[queuedIndex].status != .parked &&
            entries[queuedIndex].createdAt >= completed.createdAt &&
            entries[queuedIndex].baseVersionId == completed.baseVersionId {
            entries[queuedIndex].baseVersionId = evidence.versionID
            entries[queuedIndex].updatedAt = now.timeIntervalSince1970
        }
        do { try persist() } catch { entries = previous; throw error }
        publishSnapshot()
    }

    func remove(id: String) throws {
        try loadIfNeeded()
        let previous = entries
        entries.removeAll { $0.id == id }
        do { try persist() } catch { entries = previous; throw error }
        publishSnapshot()
    }

    /// Port of original #962 retention: a server conflict is not deletion.
    /// Preserve every immutable row in the exact owner/project/document origin.
    @discardableResult
    func retainConflict(projectId: String, ownerUserId: String,
        deliveryOrigin: ScreenplayDraftSaveOrigin?, now: Date = Date()) throws -> ScreenplayDraftSaveOutboxEntry? {
        try loadIfNeeded()
        let previous = entries
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let owner = ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        for index in entries.indices where entries[index].projectId == project &&
            entries[index].ownerUserId == owner && entries[index].deliveryOrigin == deliveryOrigin {
            entries[index].status = .parked
            entries[index].updatedAt = now.timeIntervalSince1970
            entries[index].nextAttemptAt = 0
            entries[index].lastError = Self.conflictReason
        }
        do { try persist() } catch { entries = previous; throw error }
        publishSnapshot()
        return entries.last { $0.projectId == project && $0.ownerUserId == owner && $0.deliveryOrigin == deliveryOrigin }
    }

    /// Exact-request replacement for broad conflict retention. This method may
    /// park only the immutable request supplied by the caller; it cannot park a
    /// newer or unrelated edit merely because it shares a document scope.
    func retainConflict(
        _ request: ScreenplayDraftSaveOutboxEntry,
        now: Date = Date()
    ) throws -> ScreenplayDraftSaveOutboxEntry? {
        try loadIfNeeded()
        try validateConflictRequest(request)
        if let marker = retirementMarkers.first(where: { $0.id == request.id }) {
            guard retirementMarker(marker, matches: request) else {
                throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_id_reused")
            }
            return nil
        }
        let previous = entries
        if let index = entries.firstIndex(where: { $0.id == request.id }) {
            guard sameImmutableRequest(entries[index], request) else {
                throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_id_reused")
            }
            entries[index].status = .parked
            entries[index].updatedAt = now.timeIntervalSince1970
            entries[index].nextAttemptAt = 0
            entries[index].lastError = Self.conflictReason
        } else {
            // Older rows have no minted request authority. Their stable ID is
            // usable only when the exact row is already durable; an in-memory
            // value alone cannot authorize destructive retirement.
            guard request.requestAuthority != nil, request.deliveryOrigin != nil else {
                throw BackendMemoryAPIError.invalidResponse
            }
            var parked = request
            parked.status = .parked
            parked.updatedAt = now.timeIntervalSince1970
            parked.nextAttemptAt = 0
            parked.lastError = Self.conflictReason
            entries.append(parked)
            entries.sort { lhs, rhs in
                if lhs.createdAt == rhs.createdAt { return lhs.id < rhs.id }
                return lhs.createdAt < rhs.createdAt
            }
        }
        do { try persist() } catch { entries = previous; throw error }
        publishSnapshot()
        return entries.first { $0.id == request.id }
    }

    /// Returns the transitive, sorted metadata-only lineage for a replacement
    /// request. Every inherited reference and the current conflict must still
    /// identify an exact durable parked row at capture time.
    func conflictResolutionReferences(
        for request: ScreenplayDraftSaveOutboxEntry
    ) throws -> [ScreenplayDraftConflictRequestReference] {
        try loadIfNeeded()
        try validateConflictRequest(request)
        guard let current = entries.first(where: { $0.id == request.id }),
              sameImmutableRequest(current, request),
              current.status == .parked,
              current.lastError == Self.conflictReason else {
            throw BackendMemoryAPIError.invalidResponse
        }
        var referencesByID: [String: ScreenplayDraftConflictRequestReference] = [:]
        for reference in current.supersededConflictRequests {
            guard reference.projectId == current.projectId,
                  reference.ownerUserId == current.ownerUserId,
                  reference.requestID != current.id,
                  let conflict = entries.first(where: { $0.id == reference.requestID }),
                  conflict.status == .parked,
                  conflict.lastError == Self.conflictReason,
                  conflictReference(reference, matches: conflict),
                  referencesByID[reference.requestID] == nil else {
                throw BackendMemoryAPIError.invalidResponse
            }
            referencesByID[reference.requestID] = reference
        }
        let currentReference = try makeConflictReference(current)
        guard referencesByID[currentReference.requestID] == nil else {
            throw BackendMemoryAPIError.invalidResponse
        }
        referencesByID[currentReference.requestID] = currentReference
        return referencesByID.values.sorted { $0.requestID < $1.requestID }
    }

    /// Captures only exact immutable requests explicitly supplied by the VM.
    /// Parked status and owner/project/document scope are not writer authority
    /// to discard any other row. Legacy rows without a delivery origin remain
    /// unresolvable here and must stay durable for conservative VM recovery.
    func captureLoadServerSelection(
        projectId: String,
        ownerUserId: String,
        deliveryOrigin: ScreenplayDraftSaveOrigin,
        explicitRequests: [ScreenplayDraftSaveOutboxEntry]
    ) throws -> ScreenplayDraftLoadServerSelection {
        try loadIfNeeded()
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let owner = ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        try validateScope(projectId: project, ownerUserId: owner, deliveryOrigin: deliveryOrigin)
        var selected: [String: ScreenplayDraftSaveOutboxEntry] = [:]
        for request in explicitRequests {
            try validateRetirableRequest(request)
            guard exactScope(request, projectId: project, ownerUserId: owner,
                             deliveryOrigin: deliveryOrigin) else {
                throw BackendMemoryAPIError.invalidResponse
            }
            if let current = entries.first(where: { $0.id == request.id }) {
                guard sameImmutableRequest(current, request), current.status == .parked,
                      current.lastError == Self.conflictReason else {
                    throw BackendMemoryAPIError.invalidResponse
                }
                selected[request.id] = current
            } else if let marker = retirementMarkers.first(where: { $0.id == request.id }) {
                guard retirementMarker(marker, matches: request) else {
                    throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_id_reused")
                }
                selected[request.id] = request
            } else if let existing = selected[request.id] {
                guard sameImmutableRequest(existing, request) else {
                    throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_id_reused")
                }
            } else {
                // Only current-authority requests may be fenced before their
                // row materializes. Legacy nil-authority requests need an
                // exact durable parked row selected above.
                guard request.requestAuthority != nil else {
                    throw BackendMemoryAPIError.invalidResponse
                }
                selected[request.id] = request
            }
        }
        guard !selected.isEmpty else { throw BackendMemoryAPIError.invalidResponse }
        return ScreenplayDraftLoadServerSelection(
            id: UUID(),
            projectId: project,
            ownerUserId: owner,
            deliveryOrigin: deliveryOrigin,
            requests: selected.values.sorted { $0.id < $1.id }
        )
    }

    /// Retire only the exact immutable requests captured by the selection. Each
    /// retirement becomes a parked array-compatible marker with the same ID,
    /// so a previous build fails closed rather than delivering it after rollback.
    func resolveLoadServerSelection(
        _ selection: ScreenplayDraftLoadServerSelection
    ) throws -> ScreenplayDraftLoadServerResolution {
        try loadIfNeeded()
        try validate(selection)
        let previousEntries = entries
        let previousMarkers = retirementMarkers
        var retiredIDs: [String] = []
        do {
            for request in selection.requests {
                if let existingMarker = retirementMarkers.first(where: { $0.id == request.id }) {
                    guard retirementMarker(existingMarker, matches: request) else {
                        throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_id_reused")
                    }
                    retiredIDs.append(request.id)
                    continue
                }
                if let index = entries.firstIndex(where: { $0.id == request.id }) {
                    let current = entries[index]
                    guard sameImmutableRequest(current, request), current.status == .parked,
                          current.lastError == Self.conflictReason else {
                        throw BackendMemoryAPIError.invalidResponse
                    }
                    entries.remove(at: index)
                } else if request.requestAuthority == nil {
                    // Re-check legacy durability at commit time. Another actor
                    // turn may have removed the selected row after capture.
                    throw BackendMemoryAPIError.invalidResponse
                }
                retirementMarkers.append(try makeRetirementMarker(for: request))
                retiredIDs.append(request.id)
            }
            try persist()
        } catch {
            entries = previousEntries
            retirementMarkers = previousMarkers
            throw error
        }
        publishSnapshot()
        return ScreenplayDraftLoadServerResolution(
            selectionID: selection.id,
            retiredRequestIDs: retiredIDs.sorted()
        )
    }

    /// Nil is the intentional result for one exact retired request. A request
    /// with a different ID or authority remains independently deliverable.
    func beginDeliveryUnlessRetiredByLoadServer(
        _ entry: ScreenplayDraftSaveOutboxEntry,
        continuingInflightID: String? = nil
    ) throws -> ScreenplayDraftSaveDelivery? {
        try loadIfNeeded()
        if let marker = retirementMarkers.first(where: { $0.id == entry.id }) {
            guard retirementMarker(marker, matches: entry) else {
                throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_id_reused")
            }
            return nil
        }
        return try beginDelivery(entry, continuingInflightID: continuingInflightID)
    }

    func removeAll(projectId: String, ownerUserId: String) throws {
        try loadIfNeeded()
        let cleanProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanOwnerUserId = ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        let previousEntries = entries
        let previousMarkers = retirementMarkers
        entries.removeAll { entry in
            entry.projectId == cleanProjectId &&
                entry.ownerUserId == cleanOwnerUserId
        }
        retirementMarkers.removeAll { marker in
            marker.loadServerRetirement?.projectId == cleanProjectId &&
                marker.loadServerRetirement?.ownerUserId == cleanOwnerUserId
        }
        do {
            try persist()
        } catch {
            entries = previousEntries
            retirementMarkers = previousMarkers
            throw error
        }
        publishSnapshot()
    }

    func markRetryable(id: String, error: String, now: Date = Date()) throws {
        try loadIfNeeded()
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        let retryCount = entries[index].retries + 1
        entries[index].retries = retryCount
        entries[index].updatedAt = now.timeIntervalSince1970
        entries[index].lastError = normalizedError(error)
        if retryCount > Self.backoffSeconds.count {
            entries[index].status = .parked
            entries[index].nextAttemptAt = 0
        } else {
            entries[index].status = .pending
            entries[index].nextAttemptAt = now.timeIntervalSince1970 + Self.backoffSeconds[retryCount - 1]
        }
        try persist()
        publishSnapshot()
    }

    func markParked(id: String, error: String, now: Date = Date()) throws {
        try loadIfNeeded()
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        entries[index].status = .parked
        entries[index].updatedAt = now.timeIntervalSince1970
        entries[index].nextAttemptAt = 0
        entries[index].lastError = normalizedError(error)
        try persist()
        publishSnapshot()
    }

    func entriesForTesting() throws -> [ScreenplayDraftSaveOutboxEntry] {
        try loadIfNeeded()
        return entries
    }

    func retirementMarkersForTesting() throws -> [ScreenplayDraftSaveOutboxEntry] {
        try loadIfNeeded()
        return retirementMarkers
    }

    func prepareInitialProject(ownerUserID: String, backendURL: URL, documentID: String,
                               sourceProjectID: String, draft: String, title: String, phase: String,
                               source: String, explicitTitle: Bool = false) throws -> ScreenplayDraftSaveOutboxEntry {
        try loadIfNeeded()
        let origin = try ScreenplayInitialProjectMetadata.origin(backendURL)
        guard !ownerUserID.isEmpty, !documentID.isEmpty, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw BackendMemoryAPIError.invalidResponse }
        if let existing = initialProjectEntry(ownerUserID: ownerUserID, backendURL: origin, documentID: documentID,
                                             sourceProjectID: sourceProjectID) {
            guard !explicitTitle || existing.title == title else {
                throw BackendMemoryAPIError.server(status: 409, message: "A project named ‘\(existing.title)’ is still being set up. Save now to finish it before starting another project. Your words are kept.")
            }
            return existing
        }
        let now = Date().timeIntervalSince1970
        var entry = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString.lowercased(),
            projectId: "project-\(UUID().uuidString.lowercased())", ownerUserId: ownerUserID,
            draft: draft, title: title, phase: phase, notes: "Initial Studio draft", source: source,
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "", createdAt: now, updatedAt: now,
            status: .pending, retries: 0, nextAttemptAt: 0, lastError: "Project setup is kept on this device.")
        entry.initialization = .init(documentID: documentID, backendURL: origin, sourceProjectID: sourceProjectID)
        entry.deliveryOrigin = .init(documentID: documentID, backendURL: origin)
        _ = try enqueue(entry)
        return entry
    }

    private func initialProjectEntry(ownerUserID: String, backendURL: URL, documentID: String,
                                     sourceProjectID: String) -> ScreenplayDraftSaveOutboxEntry? {
        entries.first { entry in
            guard let metadata = entry.initialization else { return false }
            return entry.ownerUserId == ownerUserID && metadata.documentID == documentID
                && (metadata.sourceProjectID == sourceProjectID || entry.projectId == sourceProjectID)
                && OfflineTalkRecoveryScope.sameBackend(metadata.backendURL, backendURL)
        }
    }

    func pendingInitialProject(ownerUserID: String, backendURL: URL, documentID: String,
                               sourceProjectID: String) throws -> ScreenplayDraftSaveOutboxEntry? {
        try loadIfNeeded()
        return initialProjectEntry(ownerUserID: ownerUserID, backendURL: backendURL,
                                   documentID: documentID, sourceProjectID: sourceProjectID)
    }

    func beginInitialProject(id: String, ownerUserID: String, backendURL: URL) throws {
        try loadIfNeeded()
        guard let index = entries.firstIndex(where: { $0.id == id }),
              let metadata = entries[index].initialization, entries[index].ownerUserId == ownerUserID,
              OfflineTalkRecoveryScope.sameBackend(metadata.backendURL, backendURL) else { throw BackendMemoryAPIError.invalidResponse }
        guard entries[index].status != .inflight else {
            throw BackendMemoryAPIError.server(status: 409, message: "Project setup is already being sent. Your words are kept.")
        }
        let previous = entries
        entries[index].status = .inflight
        do { try persist() } catch { entries = previous; throw error }
        publishSnapshot()
    }

    func recordInitialProjectReceipt(id: String, versionID: String) throws {
        try loadIfNeeded()
        guard let index = entries.firstIndex(where: { $0.id == id }), entries[index].initialization != nil,
              !versionID.isEmpty else { throw BackendMemoryAPIError.invalidResponse }
        let previous = entries
        entries[index].initialization?.receiptVersionID = versionID
        entries[index].status = .parked
        entries[index].lastError = "First draft saved. Finish project setup to bind this receipt."
        do { try persist() } catch { entries = previous; throw error }
        publishSnapshot()
    }

    func finishInitialProjectBinding(id: String, versionID: String, owner: BackendAuthRequestIdentity) throws {
        try owner.requireCurrentOwner(BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false))
        try loadIfNeeded()
        guard let entry = entries.first(where: { $0.id == id }), entry.ownerUserId == owner.userID,
              let metadata = entry.initialization, metadata.receiptVersionID == versionID,
              OfflineTalkRecoveryScope.sameBackend(metadata.backendURL, BackendAuthClient.resolvedBackendBaseURL()) else {
            throw BackendMemoryAPIError.invalidResponse
        }
        let previous = entries
        entries.removeAll { $0.id == id }
        do { try persist() } catch { entries = previous; throw error }
        publishSnapshot()
    }

    func releaseInitialProject(id: String, error: String) throws {
        try loadIfNeeded()
        guard let index = entries.firstIndex(where: { $0.id == id }), entries[index].initialization != nil else { return }
        let previous = entries
        entries[index].status = .pending
        entries[index].lastError = normalizedError(error)
        do { try persist() } catch { entries = previous; throw error }
        publishSnapshot()
    }

    /// Listing grants no authority to remove or deliver a conflict copy.
    func parkedConflictEntries(projectId: String, ownerUserId: String) throws -> [ScreenplayDraftSaveOutboxEntry] {
        try loadIfNeeded()
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let owner = ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !project.isEmpty, !owner.isEmpty else { return [] }
        return entries.filter { $0.projectId == project && $0.ownerUserId == owner &&
            $0.initialization == nil && $0.status == .parked && $0.lastError == Self.conflictReason }
    }

    func pendingEntry(projectId: String, ownerUserId: String) throws -> ScreenplayDraftSaveOutboxEntry? {
        try loadIfNeeded()
        let cleanProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanOwnerUserId = ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        return entries.first { entry in
            entry.projectId == cleanProjectId && entry.ownerUserId == cleanOwnerUserId && entry.initialization == nil &&
                (entry.status == .pending || entry.status == .inflight)
        }
    }

    #if DEBUG
    nonisolated static func resetStoredQueueForUITesting(
        fileManager: FileManager = .default
    ) {
        resetStoredQueueForUITesting(
            at: defaultStorageDirectory(),
            fileManager: fileManager
        )
    }

    nonisolated static func resetStoredQueueForUITesting(
        at storageDirectory: URL,
        fileManager: FileManager = .default
    ) {
        guard fileManager.fileExists(atPath: storageDirectory.path) else { return }
        try? fileManager.removeItem(at: storageDirectory)
    }
    #endif

    private static func defaultStorageDirectory() -> URL {
        let base = IOThemRuntime.currentAutomationOutboxRootURL
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        if IOThemRuntime.currentAutomationOutboxRootURL != nil {
            return base.appendingPathComponent("ScreenplayDraftSaveOutbox", isDirectory: true)
        }
        return base
            .appendingPathComponent("io.them", isDirectory: true)
            .appendingPathComponent("ScreenplayDraftSaveOutbox", isDirectory: true)
    }

    private func loadIfNeeded() throws {
        guard !didLoad else { return }
        guard fileManager.fileExists(atPath: manifestURL.path) else {
            entries = []
            retirementMarkers = []
            didLoad = true
            return
        }
        let data = try Data(contentsOf: manifestURL)
        let decodedEntries = try JSONDecoder().decode([ScreenplayDraftSaveOutboxEntry].self, from: data)
        var restoredEntries: [ScreenplayDraftSaveOutboxEntry] = []
        var restoredMarkers: [ScreenplayDraftSaveOutboxEntry] = []
        for entry in decodedEntries {
            if isRetirementMarkerCandidate(entry) {
                var marker = try hydratedRetirementMarker(entry)
                marker.status = .parked
                marker.nextAttemptAt = 0
                marker.lastError = Self.retirementReason
                restoredMarkers.append(marker)
            } else {
                guard entry.loadServerRetirement == nil else {
                    throw BackendMemoryAPIError.invalidResponse
                }
                restoredEntries.append(entry)
            }
        }
        let now = Date().timeIntervalSince1970
        for index in restoredEntries.indices where restoredEntries[index].status == .inflight {
            restoredEntries[index].status = .pending
            restoredEntries[index].nextAttemptAt = min(restoredEntries[index].nextAttemptAt, now)
            restoredEntries[index].lastError = "Interrupted while saving."
        }
        entries = restoredEntries
        retirementMarkers = restoredMarkers
        try persist()
        didLoad = true
    }

    private func persist() throws {
        try fileManager.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let stored = (entries + retirementMarkers).sorted { lhs, rhs in
            if lhs.createdAt == rhs.createdAt { return lhs.id < rhs.id }
            return lhs.createdAt < rhs.createdAt
        }
        let data = try encoder.encode(stored)
        try manifestWriter(data, manifestURL)
        #if os(iOS)
        try? fileManager.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: storageDirectory.path
        )
        try? fileManager.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: manifestURL.path
        )
        #endif
    }

    private func validateScope(
        projectId: String,
        ownerUserId: String,
        deliveryOrigin: ScreenplayDraftSaveOrigin
    ) throws {
        guard validIdentifier(projectId), validIdentifier(ownerUserId),
              validIdentifier(deliveryOrigin.documentID),
              let origin = try? ScreenplayInitialProjectMetadata.origin(deliveryOrigin.backendURL),
              origin == deliveryOrigin.backendURL else {
            throw BackendMemoryAPIError.invalidResponse
        }
    }

    // Parking retains words; it does not authorize later destructive retirement.
    // A missing origin is accepted only for an exact row already on disk.
    private func validateConflictRequest(_ entry: ScreenplayDraftSaveOutboxEntry) throws {
        guard entry.initialization == nil, entry.loadServerRetirement == nil,
              validIdentifier(entry.id, limit: 96), validIdentifier(entry.projectId),
              validIdentifier(entry.ownerUserId) else { throw BackendMemoryAPIError.invalidResponse }
        if let origin = entry.deliveryOrigin {
            try validateScope(projectId: entry.projectId, ownerUserId: entry.ownerUserId,
                              deliveryOrigin: origin)
        }
    }

    private func validateRetirableRequest(_ entry: ScreenplayDraftSaveOutboxEntry) throws {
        guard entry.initialization == nil, entry.loadServerRetirement == nil,
              validIdentifier(entry.id, limit: 96), let origin = entry.deliveryOrigin else {
            throw BackendMemoryAPIError.invalidResponse
        }
        try validateScope(projectId: entry.projectId, ownerUserId: entry.ownerUserId,
                          deliveryOrigin: origin)
    }

    private func validate(_ selection: ScreenplayDraftLoadServerSelection) throws {
        try validateScope(projectId: selection.projectId, ownerUserId: selection.ownerUserId,
                          deliveryOrigin: selection.deliveryOrigin)
        guard !selection.requests.isEmpty,
              Set(selection.requests.map(\.id)).count == selection.requests.count else {
            throw BackendMemoryAPIError.invalidResponse
        }
        for request in selection.requests {
            try validateRetirableRequest(request)
            guard exactScope(request, projectId: selection.projectId,
                             ownerUserId: selection.ownerUserId,
                             deliveryOrigin: selection.deliveryOrigin) else {
                throw BackendMemoryAPIError.invalidResponse
            }
        }
    }

    private func validateRetirementMarker(_ marker: ScreenplayDraftSaveOutboxEntry) throws {
        guard let retirement = marker.loadServerRetirement,
              let requestDigest = retirement.requestDigest,
              validRequestDigest(requestDigest),
              marker.id == retirement.requestID,
              marker.projectId == Self.retirementProjectID,
              marker.ownerUserId == Self.retirementOwnerID,
              marker.source == Self.retirementSource,
              try decodedRetirementNotes(marker.notes) == retirement,
              marker.initialization == nil,
              marker.requestAuthority == retirement.requestAuthority,
              retirement.source == nil,
              retirement.notes == nil,
              marker.draft.isEmpty,
              marker.title.isEmpty,
              marker.phase.isEmpty,
              marker.studioWriteAnchors.isEmpty,
              marker.screenplayBindings.isEmpty,
              marker.baseVersionId.isEmpty,
              let sentinel = marker.deliveryOrigin,
              sentinel.backendURL == retirement.deliveryOrigin.backendURL,
              sentinel.documentID == retirementDocumentID(requestDigest) else {
            throw BackendMemoryAPIError.invalidResponse
        }
        try validateScope(projectId: retirement.projectId, ownerUserId: retirement.ownerUserId,
                          deliveryOrigin: retirement.deliveryOrigin)
    }

    private func isRetirementMarkerCandidate(_ entry: ScreenplayDraftSaveOutboxEntry) -> Bool {
        entry.projectId == Self.retirementProjectID &&
            entry.ownerUserId == Self.retirementOwnerID &&
            entry.source == Self.retirementSource &&
            (entry.notes.hasPrefix(Self.retirementNotesPrefix) ||
                entry.notes.hasPrefix(Self.legacyRetirementNotesPrefix))
    }

    private func hydratedRetirementMarker(
        _ stored: ScreenplayDraftSaveOutboxEntry
    ) throws -> ScreenplayDraftSaveOutboxEntry {
        let decoded = try decodedRetirementNotes(stored.notes)
        if let embedded = stored.loadServerRetirement, embedded != decoded {
            throw BackendMemoryAPIError.invalidResponse
        }
        if decoded.requestDigest == nil {
            guard stored.notes.hasPrefix(Self.legacyRetirementNotesPrefix),
                  let source = decoded.source,
                  let notes = decoded.notes else {
                throw BackendMemoryAPIError.invalidResponse
            }
            var request = ScreenplayDraftSaveOutboxEntry(
                id: decoded.requestID,
                projectId: decoded.projectId,
                ownerUserId: decoded.ownerUserId,
                draft: stored.draft,
                title: stored.title,
                phase: stored.phase,
                notes: notes,
                source: source,
                studioWriteAnchors: stored.studioWriteAnchors,
                screenplayBindings: stored.screenplayBindings,
                baseVersionId: stored.baseVersionId,
                createdAt: stored.createdAt,
                updatedAt: stored.updatedAt,
                status: .parked,
                retries: stored.retries,
                nextAttemptAt: 0,
                lastError: Self.conflictReason
            )
            request.deliveryOrigin = decoded.deliveryOrigin
            request.requestAuthority = decoded.requestAuthority
            return try makeRetirementMarker(for: request)
        }
        var marker = stored
        marker.requestAuthority = decoded.requestAuthority
        marker.loadServerRetirement = decoded
        try validateRetirementMarker(marker)
        return marker
    }

    private func encodedRetirementNotes(
        _ retirement: ScreenplayDraftLoadServerRetirement
    ) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return Self.retirementNotesPrefix + (try encoder.encode(retirement)).base64EncodedString()
    }

    private func decodedRetirementNotes(_ notes: String) throws -> ScreenplayDraftLoadServerRetirement {
        let encoded: Substring
        if notes.hasPrefix(Self.retirementNotesPrefix) {
            encoded = notes.dropFirst(Self.retirementNotesPrefix.count)
        } else if notes.hasPrefix(Self.legacyRetirementNotesPrefix) {
            encoded = notes.dropFirst(Self.legacyRetirementNotesPrefix.count)
        } else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard let data = Data(base64Encoded: String(encoded)) else {
            throw BackendMemoryAPIError.invalidResponse
        }
        return try JSONDecoder().decode(ScreenplayDraftLoadServerRetirement.self, from: data)
    }

    private func makeRetirementMarker(
        for request: ScreenplayDraftSaveOutboxEntry
    ) throws -> ScreenplayDraftSaveOutboxEntry {
        try validateRetirableRequest(request)
        guard let origin = request.deliveryOrigin else {
            throw BackendMemoryAPIError.invalidResponse
        }
        let digest = try requestDigest(request)
        let retirement = ScreenplayDraftLoadServerRetirement(
            requestID: request.id,
            projectId: request.projectId,
            ownerUserId: request.ownerUserId,
            deliveryOrigin: origin,
            requestAuthority: request.requestAuthority,
            requestDigest: digest,
            source: nil,
            notes: nil
        )
        var marker = ScreenplayDraftSaveOutboxEntry(
            id: request.id,
            projectId: Self.retirementProjectID,
            ownerUserId: Self.retirementOwnerID,
            draft: "",
            title: "",
            phase: "",
            notes: try encodedRetirementNotes(retirement),
            source: Self.retirementSource,
            studioWriteAnchors: [],
            screenplayBindings: [],
            baseVersionId: "",
            createdAt: 0,
            updatedAt: 0,
            status: .parked,
            retries: 0,
            nextAttemptAt: 0,
            lastError: Self.retirementReason
        )
        marker.deliveryOrigin = ScreenplayDraftSaveOrigin(
            documentID: retirementDocumentID(digest),
            backendURL: origin.backendURL
        )
        marker.requestAuthority = request.requestAuthority
        marker.loadServerRetirement = retirement
        try validateRetirementMarker(marker)
        return marker
    }

    private func retirementMarker(
        _ marker: ScreenplayDraftSaveOutboxEntry,
        matches request: ScreenplayDraftSaveOutboxEntry
    ) -> Bool {
        guard let retirement = marker.loadServerRetirement,
              retirement.requestID == request.id,
              retirement.projectId == request.projectId,
              retirement.ownerUserId == request.ownerUserId,
              retirement.deliveryOrigin == request.deliveryOrigin,
              retirement.requestAuthority == request.requestAuthority,
              let digest = retirement.requestDigest else {
            return false
        }
        return (try? requestDigest(request)) == digest
    }

    private func sameImmutableRequest(
        _ lhs: ScreenplayDraftSaveOutboxEntry,
        _ rhs: ScreenplayDraftSaveOutboxEntry
    ) -> Bool {
        lhs.id == rhs.id && lhs.projectId == rhs.projectId &&
            lhs.ownerUserId == rhs.ownerUserId &&
            lhs.deliveryOrigin == rhs.deliveryOrigin &&
            lhs.requestAuthority == rhs.requestAuthority &&
            lhs.initialization == rhs.initialization &&
            lhs.loadServerRetirement == nil && rhs.loadServerRetirement == nil &&
            lhs.draft.utf8.elementsEqual(rhs.draft.utf8) &&
            lhs.title == rhs.title && lhs.phase == rhs.phase &&
            lhs.notes == rhs.notes && lhs.source == rhs.source &&
            lhs.studioWriteAnchors == rhs.studioWriteAnchors &&
            lhs.screenplayBindings == rhs.screenplayBindings &&
            lhs.baseVersionId == rhs.baseVersionId &&
            lhs.supersededConflictRequests == rhs.supersededConflictRequests
    }

    private func exactScope(
        _ entry: ScreenplayDraftSaveOutboxEntry,
        projectId: String,
        ownerUserId: String,
        deliveryOrigin: ScreenplayDraftSaveOrigin
    ) -> Bool {
        entry.projectId == projectId && entry.ownerUserId == ownerUserId &&
            entry.deliveryOrigin == deliveryOrigin
    }

    private func requestDigest(_ request: ScreenplayDraftSaveOutboxEntry) throws -> String {
        var projection = Data()
        appendCanonical(Data("io.them.screenplay-draft-save-retirement-v2".utf8), to: &projection)
        for value in [request.id, request.projectId, request.ownerUserId] {
            appendCanonical(Data(value.utf8), to: &projection)
        }
        guard let origin = request.deliveryOrigin else {
            throw BackendMemoryAPIError.invalidResponse
        }
        appendCanonical(Data(origin.documentID.utf8), to: &projection)
        appendCanonical(Data(origin.backendURL.absoluteString.utf8), to: &projection)
        if let authority = request.requestAuthority {
            projection.append(1)
            appendCanonical(Data(authority.id.uuidString.lowercased().utf8), to: &projection)
            appendCanonicalInteger(authority.generation, to: &projection)
        } else {
            projection.append(0)
        }
        for value in [request.draft, request.title, request.phase, request.notes,
                      request.source, request.baseVersionId] {
            appendCanonical(Data(value.utf8), to: &projection)
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        appendCanonical(try encoder.encode(request.studioWriteAnchors), to: &projection)
        appendCanonical(try encoder.encode(request.screenplayBindings), to: &projection)
        // Preserve every previously issued v2 digest when lineage is empty.
        // Only lineage-bearing requests receive the additive digest suffix.
        if !request.supersededConflictRequests.isEmpty {
            appendCanonical(Data("conflict-lineage-v1".utf8), to: &projection)
            appendCanonical(try encoder.encode(request.supersededConflictRequests), to: &projection)
        }
        return SHA256.hash(data: projection).map { String(format: "%02x", $0) }.joined()
    }

    private func makeConflictReference(
        _ request: ScreenplayDraftSaveOutboxEntry
    ) throws -> ScreenplayDraftConflictRequestReference {
        ScreenplayDraftConflictRequestReference(
            requestID: request.id,
            projectId: request.projectId,
            ownerUserId: request.ownerUserId,
            deliveryOrigin: request.deliveryOrigin,
            requestAuthority: request.requestAuthority,
            requestDigest: try conflictRequestDigest(request)
        )
    }

    private func conflictReference(
        _ reference: ScreenplayDraftConflictRequestReference,
        matches request: ScreenplayDraftSaveOutboxEntry
    ) -> Bool {
        reference.requestID == request.id &&
            reference.projectId == request.projectId &&
            reference.ownerUserId == request.ownerUserId &&
            reference.deliveryOrigin == request.deliveryOrigin &&
            reference.requestAuthority == request.requestAuthority &&
            validRequestDigest(reference.requestDigest) &&
            (try? conflictRequestDigest(request)) == reference.requestDigest
    }

    /// This projection deliberately records origin presence before origin data,
    /// so a legacy nil-origin row remains exactly referencable without inventing
    /// a document identity.
    private func conflictRequestDigest(
        _ request: ScreenplayDraftSaveOutboxEntry
    ) throws -> String {
        var projection = Data()
        appendCanonical(Data("io.them.screenplay-draft-conflict-reference-v1".utf8), to: &projection)
        for value in [request.id, request.projectId, request.ownerUserId] {
            appendCanonical(Data(value.utf8), to: &projection)
        }
        if let origin = request.deliveryOrigin {
            projection.append(1)
            appendCanonical(Data(origin.documentID.utf8), to: &projection)
            appendCanonical(Data(origin.backendURL.absoluteString.utf8), to: &projection)
        } else {
            projection.append(0)
        }
        if let authority = request.requestAuthority {
            projection.append(1)
            appendCanonical(Data(authority.id.uuidString.lowercased().utf8), to: &projection)
            appendCanonicalInteger(authority.generation, to: &projection)
        } else {
            projection.append(0)
        }
        for value in [request.draft, request.title, request.phase, request.notes,
                      request.source, request.baseVersionId] {
            appendCanonical(Data(value.utf8), to: &projection)
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        appendCanonical(try encoder.encode(request.studioWriteAnchors), to: &projection)
        appendCanonical(try encoder.encode(request.screenplayBindings), to: &projection)
        appendCanonical(try encoder.encode(request.supersededConflictRequests), to: &projection)
        return SHA256.hash(data: projection).map { String(format: "%02x", $0) }.joined()
    }

    private func appendCanonical(_ bytes: Data, to projection: inout Data) {
        appendCanonicalInteger(UInt64(bytes.count), to: &projection)
        projection.append(bytes)
    }

    private func appendCanonicalInteger(_ value: UInt64, to projection: inout Data) {
        var bigEndian = value.bigEndian
        Swift.withUnsafeBytes(of: &bigEndian) { projection.append(contentsOf: $0) }
    }

    private func validRequestDigest(_ digest: String) -> Bool {
        digest.utf8.count == 64 && digest.allSatisfy { $0.isHexDigit && !$0.isUppercase }
    }

    private func retirementDocumentID(_ digest: String) -> String {
        "retired-\(digest)"
    }

    private func validIdentifier(_ value: String, limit: Int = 128) -> Bool {
        !value.isEmpty && value.utf8.count <= limit &&
            value == value.trimmingCharacters(in: .whitespacesAndNewlines) &&
            value.rangeOfCharacter(from: .controlCharacters) == nil
    }

    private func snapshotFor(
        _ entries: [ScreenplayDraftSaveOutboxEntry],
        lastError: String = ""
    ) -> ScreenplayDraftSaveOutboxSnapshot {
        let explicitError = lastError.trimmingCharacters(in: .whitespacesAndNewlines)
        return ScreenplayDraftSaveOutboxSnapshot(
            pendingCount: entries.filter { $0.status == .pending }.count,
            inflightCount: entries.filter { $0.status == .inflight }.count,
            parkedCount: entries.filter { $0.status == .parked }.count,
            lastError: explicitError.isEmpty
                ? entries.last(where: { !$0.lastError.isEmpty })?.lastError ?? ""
                : explicitError
        )
    }

    private func publishSnapshot() {
        publish(snapshotFor(entries))
    }

    private func publish(_ snapshot: ScreenplayDraftSaveOutboxSnapshot) {
        DispatchQueue.main.async {
            NotificationCenter.default.post(
                name: .themScreenplayDraftSaveOutboxUpdated,
                object: nil,
                userInfo: snapshot.notificationUserInfo
            )
        }
    }

    private func normalizedError(_ error: String) -> String {
        let clean = error
            .replacingOccurrences(of: "\n", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return String((clean.isEmpty ? "Queued for retry." : clean).prefix(280))
    }
}

import Foundation
import Network

nonisolated extension Notification.Name {
    static let themScreenplayOutlineMutationOutboxUpdated = Notification.Name(
        "io.them.them.screenplayOutlineMutationOutboxUpdated"
    )
    static let themScreenplayOutlineMutationOutboxRetryRequested = Notification.Name(
        "io.them.them.screenplayOutlineMutationOutboxRetryRequested"
    )
}

nonisolated enum ScreenplayOutlineMutationOutboxStatus: String, Codable, Equatable {
    case pending
    case inflight
    case parked
}

nonisolated enum ScreenplayOutlineMutationParkedReason: String, Codable, Equatable {
    case retryExhausted = "retry_exhausted"
    case authenticationRequired = "authentication_required"
    case staleRevision = "stale_revision"
    case requestIDReused = "request_id_reused"
    case revisionExhausted = "revision_exhausted"
    case payloadTooLarge = "payload_too_large"
    case invalidLocalIntent = "invalid_local_intent"
    case supersededByRemoteChange = "superseded_by_remote_change"
    case permanentRejection = "permanent_rejection"

    var permitsExactRetry: Bool {
        self == .retryExhausted || self == .authenticationRequired
    }

    var retryUnavailableDescription: String {
        switch self {
        case .retryExhausted, .authenticationRequired:
            return "Ready for an exact retry."
        case .staleRevision, .supersededByRemoteChange:
            return "The server outline changed. Export or inspect this version before discarding it."
        case .requestIDReused:
            return "This request identifier cannot be reused safely."
        case .revisionExhausted:
            return "The outline revision limit requires support."
        case .payloadTooLarge:
            return "This outline is too large to retry unchanged."
        case .invalidLocalIntent:
            return "This local outline contains invalid references and cannot be retried unchanged."
        case .permanentRejection:
            return "The server rejected this exact outline change."
        }
    }
}

nonisolated struct ScreenplayOutlineMutationOutboxEntry: Identifiable, Codable, Equatable {
    let id: String
    let projectId: String
    let ownerUserId: String
    var expectedOutlineRevision: Int
    let acts: [BackendScreenplayAct]
    let scenes: [BackendScreenplayScene]
    let beats: [BackendScreenplayBeat]
    let source: String
    let createdAt: TimeInterval
    var updatedAt: TimeInterval
    var status: ScreenplayOutlineMutationOutboxStatus
    var retries: Int
    var nextAttemptAt: TimeInterval
    var lastError: String
    var parkedReason: ScreenplayOutlineMutationParkedReason? = nil
    var queueSequence: UInt64? = nil
}

nonisolated struct ScreenplayOutlineMutationOutboxSnapshot: Equatable {
    let pendingCount: Int
    let inflightCount: Int
    let parkedCount: Int
    let lastError: String

    static let empty = ScreenplayOutlineMutationOutboxSnapshot(
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

nonisolated struct ScreenplayOutlineMutationRecoveryChain: Identifiable, Equatable {
    let projectId: String
    let parkedHead: ScreenplayOutlineMutationOutboxEntry
    let entries: [ScreenplayOutlineMutationOutboxEntry]
    let permitsRetry: Bool
    let retryUnavailableReason: String

    var id: String { parkedHead.id }
    var dependentCount: Int { max(0, entries.count - 1) }
}

nonisolated struct ScreenplayOutlineMutationRecoveryDiscardResult: Equatable {
    let snapshot: ScreenplayOutlineMutationOutboxSnapshot
    let removedCount: Int
}

nonisolated struct ScreenplayOutlineMutationRecoveryExportArtifact: Equatable {
    let filename: String
    let data: Data
}

nonisolated enum ScreenplayOutlineMutationRecoveryError: LocalizedError, Equatable {
    case ownerScopeRequired
    case entryUnavailable
    case parkedHeadRequired
    case recoveryChainChanged
    case exactRetryUnavailable(String)

    var errorDescription: String? {
        switch self {
        case .ownerScopeRequired:
            return "A current outline owner is required for recovery."
        case .entryUnavailable:
            return "This parked outline change is no longer available."
        case .parkedHeadRequired:
            return "An earlier outline change must be resolved first."
        case .recoveryChainChanged:
            return "More linked outline changes were saved after confirmation. Review the updated chain and confirm again."
        case .exactRetryUnavailable(let reason):
            return reason
        }
    }
}

actor ScreenplayOutlineMutationOutbox {
    typealias FileProtectionEnforcer = @Sendable (URL) throws -> Void

    static let shared = ScreenplayOutlineMutationOutbox(storageDirectory: defaultStorageDirectory())

    private static let maxActCount = 32
    private static let maxSceneCount = 512
    private static let maxBeatCount = 2_048
    private static let backoffSeconds: [TimeInterval] = [2, 5, 15, 60, 300]
    private static let maximumRetryAfter: TimeInterval = 1_800

    private let storageDirectory: URL
    private let manifestURL: URL
    private let fileManager: FileManager
    private let fileProtectionEnforcer: FileProtectionEnforcer?
    private var didLoad = false
    private var entries: [ScreenplayOutlineMutationOutboxEntry] = []
    private var nextQueueSequence: UInt64 = 1
    private var networkMonitor: NWPathMonitor?
    private let networkMonitorQueue = DispatchQueue(label: "io.them.screenplay-outline-outbox.network")

    init(
        storageDirectory: URL,
        fileManager: FileManager = .default,
        fileProtectionEnforcer: FileProtectionEnforcer? = nil
    ) {
        self.storageDirectory = storageDirectory
        self.manifestURL = storageDirectory.appendingPathComponent("queue.json")
        self.fileManager = fileManager
        self.fileProtectionEnforcer = fileProtectionEnforcer
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
                    name: .themScreenplayOutlineMutationOutboxRetryRequested,
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

    func snapshot(
        ownerUserId: String? = nil,
        projectId: String? = nil
    ) -> ScreenplayOutlineMutationOutboxSnapshot {
        do {
            try loadIfNeeded()
            let cleanOwnerUserId = ownerUserId?.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanProjectId = projectId?.trimmingCharacters(in: .whitespacesAndNewlines)
            let scopedEntries = entries.filter { entry in
                (cleanOwnerUserId == nil || entry.ownerUserId == cleanOwnerUserId) &&
                    (cleanProjectId == nil || entry.projectId == cleanProjectId)
            }
            return snapshotFor(scopedEntries)
        } catch {
            return snapshotFor([], lastError: error.localizedDescription)
        }
    }

    @discardableResult
    func enqueue(
        _ entry: ScreenplayOutlineMutationOutboxEntry
    ) throws -> ScreenplayOutlineMutationOutboxSnapshot {
        try loadIfNeeded()
        try validate(entry)

        if let existing = entries.first(where: { $0.id == entry.id }) {
            guard hasSameSemanticIntent(existing, entry) else {
                throw BackendMemoryAPIError.server(
                    status: 409,
                    message: "screenplay_outline_client_request_id_reused"
                )
            }
            let nextSnapshot = snapshotFor(entries)
            publish(nextSnapshot)
            return nextSnapshot
        }

        var storedEntry = entry
        storedEntry.queueSequence = try takeNextQueueSequence()
        let previousEntries = entries
        entries.append(storedEntry)
        entries.sort(by: isOrderedBefore)
        try persistOrRestore(previousEntries)
        let nextSnapshot = snapshotFor(entries)
        publish(nextSnapshot)
        return nextSnapshot
    }

    func beginNext(
        projectId: String,
        ownerUserId: String,
        now: Date = Date(),
        force: Bool = false
    ) throws -> ScreenplayOutlineMutationOutboxEntry? {
        try loadIfNeeded()
        let cleanProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanOwnerUserId = ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        let nowSeconds = now.timeIntervalSince1970
        guard let index = entries.firstIndex(where: {
            $0.projectId == cleanProjectId && $0.ownerUserId == cleanOwnerUserId
        }) else {
            return nil
        }
        let entry = entries[index]
        guard entry.status == .pending,
              force || entry.nextAttemptAt <= nowSeconds else {
            return nil
        }
        let previousEntries = entries
        entries[index].status = .inflight
        entries[index].updatedAt = nowSeconds
        entries[index].parkedReason = nil
        try persistOrRestore(previousEntries)
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

    func headEntry(
        projectId: String,
        ownerUserId: String
    ) throws -> ScreenplayOutlineMutationOutboxEntry? {
        try loadIfNeeded()
        let cleanProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanOwnerUserId = ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        return entries.first { entry in
            entry.projectId == cleanProjectId && entry.ownerUserId == cleanOwnerUserId
        }
    }

    func latestActiveEntry(
        projectId: String,
        ownerUserId: String
    ) throws -> ScreenplayOutlineMutationOutboxEntry? {
        try loadIfNeeded()
        let cleanProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanOwnerUserId = ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        let scopedEntries = entries.filter { entry in
            entry.projectId == cleanProjectId && entry.ownerUserId == cleanOwnerUserId
        }
        guard scopedEntries.first?.status != .parked else { return nil }
        return scopedEntries.last { entry in
            entry.status == .pending || entry.status == .inflight
        }
    }

    @discardableResult
    func recoverOrphanedInflight(
        projectId: String,
        ownerUserId: String,
        error: String,
        now: Date = Date()
    ) throws -> Bool {
        try loadIfNeeded()
        let cleanProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanOwnerUserId = ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let index = entries.firstIndex(where: { entry in
            entry.projectId == cleanProjectId &&
                entry.ownerUserId == cleanOwnerUserId &&
                entry.status == .inflight
        }) else {
            return false
        }
        let previousEntries = entries
        let nowSeconds = now.timeIntervalSince1970
        entries[index].status = .pending
        entries[index].updatedAt = nowSeconds
        entries[index].nextAttemptAt = nowSeconds
        entries[index].lastError = normalizedError(error)
        entries[index].parkedReason = nil
        try persistOrRestore(previousEntries)
        publishSnapshot()
        return true
    }

    func markSucceeded(
        id: String,
        committedRevision: Int,
        now: Date = Date()
    ) throws {
        try loadIfNeeded()
        guard committedRevision >= 0 else {
            throw BackendMemoryAPIError.server(
                status: 400,
                message: "invalid_screenplay_outline_revision"
            )
        }
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        let previousEntries = entries
        let completed = entries.remove(at: index)
        let nowSeconds = now.timeIntervalSince1970
        for queuedIndex in entries.indices where
            entries[queuedIndex].projectId == completed.projectId &&
            entries[queuedIndex].ownerUserId == completed.ownerUserId &&
            isOrderedBefore(completed, entries[queuedIndex]) &&
            entries[queuedIndex].status == .pending &&
            entries[queuedIndex].retries == 0 &&
            entries[queuedIndex].expectedOutlineRevision == completed.expectedOutlineRevision {
            entries[queuedIndex].expectedOutlineRevision = committedRevision
            entries[queuedIndex].updatedAt = nowSeconds
            entries[queuedIndex].parkedReason = nil
        }
        try persistOrRestore(previousEntries)
        publishSnapshot()
    }

    func markSuperseded(
        id: String,
        currentRevision: Int,
        error: String,
        now: Date = Date()
    ) throws {
        try loadIfNeeded()
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        let previousEntries = entries
        let acknowledged = entries.remove(at: index)
        let nowSeconds = now.timeIntervalSince1970
        let fallback = "Outline changed remotely at revision \(max(0, currentRevision))."
        let cleanError = error.trimmingCharacters(in: .whitespacesAndNewlines)
        let parkedError = normalizedError(cleanError.isEmpty ? fallback : cleanError)
        for queuedIndex in entries.indices where
            entries[queuedIndex].projectId == acknowledged.projectId &&
            entries[queuedIndex].ownerUserId == acknowledged.ownerUserId &&
            isOrderedBefore(acknowledged, entries[queuedIndex]) &&
            (entries[queuedIndex].status == .pending || entries[queuedIndex].status == .inflight) {
            entries[queuedIndex].status = .parked
            entries[queuedIndex].updatedAt = nowSeconds
            entries[queuedIndex].nextAttemptAt = 0
            entries[queuedIndex].lastError = parkedError
            entries[queuedIndex].parkedReason = .supersededByRemoteChange
        }
        try persistOrRestore(previousEntries)
        publishSnapshot()
    }

    func markRetryable(
        id: String,
        error: String,
        retryAfter: TimeInterval? = nil,
        now: Date = Date()
    ) throws {
        try loadIfNeeded()
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        let previousEntries = entries
        let retryCount = entries[index].retries + 1
        let nowSeconds = now.timeIntervalSince1970
        entries[index].retries = retryCount
        entries[index].updatedAt = nowSeconds
        entries[index].lastError = normalizedError(error)
        if retryCount > Self.backoffSeconds.count {
            entries[index].status = .parked
            entries[index].nextAttemptAt = 0
            entries[index].parkedReason = .retryExhausted
        } else {
            let scheduledDelay = Self.backoffSeconds[retryCount - 1]
            let serverDelay = min(
                Self.maximumRetryAfter,
                max(0, retryAfter ?? 0)
            )
            entries[index].status = .pending
            entries[index].nextAttemptAt = nowSeconds + max(scheduledDelay, serverDelay)
            entries[index].parkedReason = nil
        }
        try persistOrRestore(previousEntries)
        publishSnapshot()
    }

    func markParked(
        id: String,
        error: String,
        reason: ScreenplayOutlineMutationParkedReason = .permanentRejection,
        now: Date = Date()
    ) throws {
        try loadIfNeeded()
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        let previousEntries = entries
        entries[index].status = .parked
        entries[index].updatedAt = now.timeIntervalSince1970
        entries[index].nextAttemptAt = 0
        entries[index].lastError = normalizedError(error)
        entries[index].parkedReason = reason
        try persistOrRestore(previousEntries)
        publishSnapshot()
    }

    func recoveryChains(
        ownerUserIds: Set<String>
    ) throws -> [ScreenplayOutlineMutationRecoveryChain] {
        try loadIfNeeded()
        let allowedOwners = try normalizedRecoveryOwnerScope(ownerUserIds)
        var entriesByScope: [ScreenplayOutlineMutationScopeKey: [ScreenplayOutlineMutationOutboxEntry]] = [:]
        for entry in entries where allowedOwners.contains(entry.ownerUserId) {
            let key = ScreenplayOutlineMutationScopeKey(
                projectId: entry.projectId,
                ownerUserId: entry.ownerUserId
            )
            entriesByScope[key, default: []].append(entry)
        }

        return entriesByScope.values.compactMap { scopedEntries in
            guard let parkedIndex = scopedEntries.firstIndex(where: { $0.status == .parked }) else {
                return nil
            }
            let parkedHead = scopedEntries[parkedIndex]
            let parkedChain = Array(scopedEntries[parkedIndex...])
            let isScopeHead = parkedIndex == scopedEntries.startIndex
            let reasonPermitsRetry = parkedHead.parkedReason?.permitsExactRetry
                ?? (parkedHead.retries > Self.backoffSeconds.count)
            let permitsRetry = isScopeHead && reasonPermitsRetry
            let unavailableReason: String
            if !isScopeHead {
                unavailableReason = "An earlier outline change must finish before this chain can retry."
            } else if let parkedReason = parkedHead.parkedReason {
                unavailableReason = parkedReason.retryUnavailableDescription
            } else {
                unavailableReason = "This legacy parked change must be inspected or exported before removal."
            }
            return ScreenplayOutlineMutationRecoveryChain(
                projectId: parkedHead.projectId,
                parkedHead: parkedHead,
                entries: parkedChain,
                permitsRetry: permitsRetry,
                retryUnavailableReason: permitsRetry ? "" : unavailableReason
            )
        }
        .sorted { lhs, rhs in
            isOrderedBefore(lhs.parkedHead, rhs.parkedHead)
        }
    }

    @discardableResult
    func retryParkedHead(
        id: String,
        projectId: String,
        ownerUserIds: Set<String>,
        now: Date = Date()
    ) throws -> ScreenplayOutlineMutationOutboxSnapshot {
        try loadIfNeeded()
        let allowedOwners = try normalizedRecoveryOwnerScope(ownerUserIds)
        let index = try recoveryEntryIndex(
            id: id,
            projectId: projectId,
            allowedOwners: allowedOwners
        )
        let selected = entries[index]
        guard selected.status == .parked else {
            throw ScreenplayOutlineMutationRecoveryError.entryUnavailable
        }
        guard entries.first(where: {
            $0.projectId == selected.projectId && $0.ownerUserId == selected.ownerUserId
        })?.id == selected.id else {
            throw ScreenplayOutlineMutationRecoveryError.parkedHeadRequired
        }
        let reasonPermitsRetry = selected.parkedReason?.permitsExactRetry
            ?? (selected.retries > Self.backoffSeconds.count)
        guard reasonPermitsRetry else {
            let reason = selected.parkedReason?.retryUnavailableDescription
                ?? "This legacy parked change cannot be retried safely."
            throw ScreenplayOutlineMutationRecoveryError.exactRetryUnavailable(reason)
        }

        let previousEntries = entries
        let nowSeconds = now.timeIntervalSince1970
        entries[index].status = .pending
        entries[index].retries = 0
        entries[index].nextAttemptAt = nowSeconds
        entries[index].updatedAt = nowSeconds
        entries[index].parkedReason = nil
        try persistOrRestore(previousEntries)
        let scopedSnapshot = snapshotFor(entries.filter { allowedOwners.contains($0.ownerUserId) })
        publishSnapshot()
        publishRetryRequested(projectId: selected.projectId)
        return scopedSnapshot
    }

    @discardableResult
    func discardRecoveryChain(
        parkedHeadID: String,
        projectId: String,
        confirmedEntryIDs: [String],
        ownerUserIds: Set<String>
    ) throws -> ScreenplayOutlineMutationRecoveryDiscardResult {
        try loadIfNeeded()
        let allowedOwners = try normalizedRecoveryOwnerScope(ownerUserIds)
        let selectedIndex = try recoveryEntryIndex(
            id: parkedHeadID,
            projectId: projectId,
            allowedOwners: allowedOwners
        )
        let selected = entries[selectedIndex]
        guard selected.status == .parked else {
            throw ScreenplayOutlineMutationRecoveryError.entryUnavailable
        }
        let scopedEntries = entries.filter {
            $0.projectId == selected.projectId && $0.ownerUserId == selected.ownerUserId
        }
        guard scopedEntries.first(where: { $0.status == .parked })?.id == selected.id else {
            throw ScreenplayOutlineMutationRecoveryError.entryUnavailable
        }
        let currentChain = scopedEntries.filter { entry in
            entry.id == selected.id || isOrderedBefore(selected, entry)
        }
        guard currentChain.map(\.id) == confirmedEntryIDs else {
            throw ScreenplayOutlineMutationRecoveryError.recoveryChainChanged
        }

        let previousEntries = entries
        entries.removeAll { entry in
            entry.projectId == selected.projectId &&
                entry.ownerUserId == selected.ownerUserId &&
                (entry.id == selected.id || isOrderedBefore(selected, entry))
        }
        let removedCount = previousEntries.count - entries.count
        guard removedCount > 0 else {
            entries = previousEntries
            throw ScreenplayOutlineMutationRecoveryError.entryUnavailable
        }
        try persistOrRestore(previousEntries)
        let scopedSnapshot = snapshotFor(entries.filter { allowedOwners.contains($0.ownerUserId) })
        publishSnapshot()
        return ScreenplayOutlineMutationRecoveryDiscardResult(
            snapshot: scopedSnapshot,
            removedCount: removedCount
        )
    }

    func exportRecoveryChain(
        parkedHeadID: String,
        projectId: String,
        ownerUserIds: Set<String>,
        exportedAt: Date = Date()
    ) throws -> ScreenplayOutlineMutationRecoveryExportArtifact {
        try loadIfNeeded()
        let allowedOwners = try normalizedRecoveryOwnerScope(ownerUserIds)
        let selectedIndex = try recoveryEntryIndex(
            id: parkedHeadID,
            projectId: projectId,
            allowedOwners: allowedOwners
        )
        let selected = entries[selectedIndex]
        guard selected.status == .parked else {
            throw ScreenplayOutlineMutationRecoveryError.entryUnavailable
        }
        let scopedEntries = entries.filter {
            $0.projectId == selected.projectId && $0.ownerUserId == selected.ownerUserId
        }
        guard scopedEntries.first(where: { $0.status == .parked })?.id == selected.id else {
            throw ScreenplayOutlineMutationRecoveryError.entryUnavailable
        }
        let chain = scopedEntries.filter { entry in
            entry.id == selected.id || isOrderedBefore(selected, entry)
        }
        let envelope = ScreenplayOutlineMutationRecoveryExportEnvelope(
            exportedAt: exportedAt.timeIntervalSince1970,
            projectId: selected.projectId,
            parkedHeadRequestId: selected.id,
            entries: chain.map(ScreenplayOutlineMutationRecoveryExportEntry.init)
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        let data = try encoder.encode(envelope)
        let timestamp = max(0, Int(exportedAt.timeIntervalSince1970))
        return ScreenplayOutlineMutationRecoveryExportArtifact(
            filename: "io-them-screenplay-outline-recovery-\(timestamp).json",
            data: data
        )
    }

    func status(id: String) throws -> ScreenplayOutlineMutationOutboxStatus? {
        try loadIfNeeded()
        return entries.first(where: { $0.id == id })?.status
    }

    func entriesForTesting() throws -> [ScreenplayOutlineMutationOutboxEntry] {
        try loadIfNeeded()
        return entries
    }

    #if DEBUG
    func replaceEntriesForUITesting(
        _ replacementEntries: [ScreenplayOutlineMutationOutboxEntry]
    ) throws {
        try loadIfNeeded()
        var replacementIDs = Set<String>()
        for entry in replacementEntries {
            try validate(entry)
            guard replacementIDs.insert(entry.id).inserted else {
                throw BackendMemoryAPIError.server(
                    status: 409,
                    message: "screenplay_outline_client_request_id_reused"
                )
            }
        }
        var sequencedEntries: [ScreenplayOutlineMutationOutboxEntry] = []
        sequencedEntries.reserveCapacity(replacementEntries.count)
        for var entry in replacementEntries {
            entry.queueSequence = try takeNextQueueSequence()
            sequencedEntries.append(entry)
        }
        let previousEntries = entries
        entries = sequencedEntries
        try persistOrRestore(previousEntries)
        publishSnapshot()
    }

    nonisolated static func resetStoredQueueForUITesting(
        fileManager: FileManager = .default
    ) {
        let directory = defaultStorageDirectory()
        guard fileManager.fileExists(atPath: directory.path) else { return }
        try? fileManager.removeItem(at: directory)
    }
    #endif

    nonisolated private static func defaultStorageDirectory() -> URL {
        let base = IOThemRuntime.currentAutomationOutboxRootURL
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        if IOThemRuntime.currentAutomationOutboxRootURL != nil {
            return base.appendingPathComponent("ScreenplayOutlineMutationOutbox", isDirectory: true)
        }
        return base
            .appendingPathComponent("io.them", isDirectory: true)
            .appendingPathComponent("ScreenplayOutlineMutationOutbox", isDirectory: true)
    }

    private func loadIfNeeded() throws {
        guard !didLoad else { return }
        guard fileManager.fileExists(atPath: manifestURL.path) else {
            entries = []
            nextQueueSequence = 1
            didLoad = true
            return
        }
        try enforceCompleteFileProtection(at: storageDirectory)
        try enforceCompleteFileProtection(at: manifestURL)
        let data = try Data(contentsOf: manifestURL)
        var restoredEntries = try JSONDecoder().decode(
            [ScreenplayOutlineMutationOutboxEntry].self,
            from: data
        )
        var restoredIDs = Set<String>()
        var restoredSequences = Set<UInt64>()
        let sequencedEntryCount = restoredEntries.lazy.filter { $0.queueSequence != nil }.count
        guard sequencedEntryCount == 0 || sequencedEntryCount == restoredEntries.count else {
            throw BackendMemoryAPIError.server(
                status: 409,
                message: "screenplay_outline_queue_sequence_manifest_incomplete"
            )
        }
        for entry in restoredEntries {
            try validate(entry)
            guard restoredIDs.insert(entry.id).inserted else {
                throw BackendMemoryAPIError.server(
                    status: 409,
                    message: "screenplay_outline_client_request_id_reused"
                )
            }
            if let queueSequence = entry.queueSequence,
               !restoredSequences.insert(queueSequence).inserted {
                throw BackendMemoryAPIError.server(
                    status: 409,
                    message: "screenplay_outline_queue_sequence_reused"
                )
            }
        }
        let requiresSequenceMigration = !restoredEntries.isEmpty && sequencedEntryCount == 0
        if requiresSequenceMigration {
            for index in restoredEntries.indices {
                restoredEntries[index].queueSequence = UInt64(index) + 1
            }
            nextQueueSequence = UInt64(restoredEntries.count) + 1
        } else if let maximumSequence = restoredSequences.max() {
            guard maximumSequence < UInt64.max else {
                throw BackendMemoryAPIError.server(
                    status: 507,
                    message: "screenplay_outline_queue_sequence_exhausted"
                )
            }
            nextQueueSequence = maximumSequence + 1
        } else {
            nextQueueSequence = 1
        }
        restoredEntries.sort(by: isOrderedBefore)
        let now = Date().timeIntervalSince1970
        let requiresRecoveryWrite = requiresSequenceMigration || restoredEntries.contains { $0.status == .inflight }
        for index in restoredEntries.indices where restoredEntries[index].status == .inflight {
            restoredEntries[index].status = .pending
            restoredEntries[index].nextAttemptAt = min(restoredEntries[index].nextAttemptAt, now)
            restoredEntries[index].lastError = "Interrupted while saving outline."
            restoredEntries[index].parkedReason = nil
        }
        let previousEntries = entries
        entries = restoredEntries
        if requiresRecoveryWrite {
            try persistOrRestore(previousEntries)
        }
        didLoad = true
    }

    private func persistOrRestore(
        _ previousEntries: [ScreenplayOutlineMutationOutboxEntry]
    ) throws {
        do {
            try persist()
        } catch {
            entries = previousEntries
            throw error
        }
    }

    private func persist() throws {
        try fileManager.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        try enforceCompleteFileProtection(at: storageDirectory)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(entries)
        let candidateURL = storageDirectory.appendingPathComponent(
            ".queue-\(UUID().uuidString).json"
        )
        defer {
            if fileManager.fileExists(atPath: candidateURL.path) {
                do {
                    try fileManager.removeItem(at: candidateURL)
                } catch {
                    // A protected orphan candidate is never read as queue state.
                }
            }
        }

        #if os(iOS)
        try data.write(to: candidateURL, options: [.atomic, .completeFileProtection])
        #else
        try data.write(to: candidateURL, options: .atomic)
        #endif
        // Verify the exact inode that will become queue.json before replacing committed state.
        try enforceCompleteFileProtection(at: candidateURL)

        var manifestIsDirectory: ObjCBool = false
        if fileManager.fileExists(
            atPath: manifestURL.path,
            isDirectory: &manifestIsDirectory
        ) {
            guard !manifestIsDirectory.boolValue else {
                throw NSError(
                    domain: NSCocoaErrorDomain,
                    code: CocoaError.Code.fileWriteInvalidFileName.rawValue,
                    userInfo: [NSFilePathErrorKey: manifestURL.path]
                )
            }
            _ = try fileManager.replaceItemAt(
                manifestURL,
                withItemAt: candidateURL,
                backupItemName: nil,
                options: [.usingNewMetadataOnly]
            )
        } else {
            try fileManager.moveItem(at: candidateURL, to: manifestURL)
        }
    }

    private func enforceCompleteFileProtection(at url: URL) throws {
        if let fileProtectionEnforcer {
            try fileProtectionEnforcer(url)
            return
        }

        #if os(iOS) && !targetEnvironment(simulator) && !targetEnvironment(macCatalyst)
        try fileManager.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: url.path
        )
        let attributes = try fileManager.attributesOfItem(atPath: url.path)
        let protection = (attributes[.protectionKey] as? FileProtectionType)?.rawValue
            ?? attributes[.protectionKey] as? String
        guard protection == FileProtectionType.complete.rawValue else {
            throw NSError(
                domain: NSCocoaErrorDomain,
                code: CocoaError.Code.fileWriteUnknown.rawValue,
                userInfo: [
                    NSFilePathErrorKey: url.path,
                    NSLocalizedDescriptionKey: "Complete file protection could not be verified.",
                ]
            )
        }
        #endif
    }

    private func validate(_ entry: ScreenplayOutlineMutationOutboxEntry) throws {
        let cleanID = entry.id.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanProjectId = entry.projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanOwnerUserId = entry.ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanID.isEmpty, cleanID == entry.id, cleanID.count <= 96 else {
            throw BackendMemoryAPIError.server(
                status: 400,
                message: "invalid_screenplay_outline_client_request_id"
            )
        }
        guard !cleanProjectId.isEmpty, cleanProjectId == entry.projectId else {
            throw BackendMemoryAPIError.server(status: 400, message: "project_id_required")
        }
        guard !cleanOwnerUserId.isEmpty, cleanOwnerUserId == entry.ownerUserId else {
            throw BackendMemoryAPIError.server(status: 400, message: "owner_user_id_required")
        }
        guard entry.expectedOutlineRevision >= 0 else {
            throw BackendMemoryAPIError.server(
                status: 400,
                message: "invalid_screenplay_outline_revision"
            )
        }
        guard entry.retries >= 0 else {
            throw BackendMemoryAPIError.server(
                status: 400,
                message: "invalid_screenplay_outline_retry_count"
            )
        }
        if let queueSequence = entry.queueSequence {
            guard queueSequence > 0 else {
                throw BackendMemoryAPIError.server(
                    status: 400,
                    message: "invalid_screenplay_outline_queue_sequence"
                )
            }
        }
        guard entry.acts.count <= Self.maxActCount else {
            throw BackendMemoryAPIError.server(
                status: 413,
                message: "screenplay_outline_acts_limit_exceeded"
            )
        }
        guard entry.scenes.count <= Self.maxSceneCount else {
            throw BackendMemoryAPIError.server(
                status: 413,
                message: "screenplay_outline_scenes_limit_exceeded"
            )
        }
        guard entry.beats.count <= Self.maxBeatCount else {
            throw BackendMemoryAPIError.server(
                status: 413,
                message: "screenplay_outline_beats_limit_exceeded"
            )
        }
    }

    private func hasSameSemanticIntent(
        _ lhs: ScreenplayOutlineMutationOutboxEntry,
        _ rhs: ScreenplayOutlineMutationOutboxEntry
    ) -> Bool {
        lhs.projectId == rhs.projectId &&
            lhs.ownerUserId == rhs.ownerUserId &&
            lhs.expectedOutlineRevision == rhs.expectedOutlineRevision &&
            lhs.acts == rhs.acts &&
            lhs.scenes == rhs.scenes &&
            lhs.beats == rhs.beats
    }

    private func isOrderedBefore(
        _ lhs: ScreenplayOutlineMutationOutboxEntry,
        _ rhs: ScreenplayOutlineMutationOutboxEntry
    ) -> Bool {
        if let lhsSequence = lhs.queueSequence,
           let rhsSequence = rhs.queueSequence,
           lhsSequence != rhsSequence {
            return lhsSequence < rhsSequence
        }
        if lhs.createdAt == rhs.createdAt { return lhs.id < rhs.id }
        return lhs.createdAt < rhs.createdAt
    }

    private func takeNextQueueSequence() throws -> UInt64 {
        guard nextQueueSequence < UInt64.max else {
            throw BackendMemoryAPIError.server(
                status: 507,
                message: "screenplay_outline_queue_sequence_exhausted"
            )
        }
        defer { nextQueueSequence += 1 }
        return nextQueueSequence
    }

    private func snapshotFor(
        _ entries: [ScreenplayOutlineMutationOutboxEntry],
        lastError: String = ""
    ) -> ScreenplayOutlineMutationOutboxSnapshot {
        let explicitError = lastError.trimmingCharacters(in: .whitespacesAndNewlines)
        return ScreenplayOutlineMutationOutboxSnapshot(
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

    private func publish(_ snapshot: ScreenplayOutlineMutationOutboxSnapshot) {
        DispatchQueue.main.async {
            NotificationCenter.default.post(
                name: .themScreenplayOutlineMutationOutboxUpdated,
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

    private func normalizedRecoveryOwnerScope(_ ownerUserIds: Set<String>) throws -> Set<String> {
        let normalized = Set(ownerUserIds.compactMap { ownerUserId -> String? in
            let clean = ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines)
            return clean.isEmpty ? nil : clean
        })
        guard !normalized.isEmpty else {
            throw ScreenplayOutlineMutationRecoveryError.ownerScopeRequired
        }
        return normalized
    }

    private func recoveryEntryIndex(
        id: String,
        projectId: String,
        allowedOwners: Set<String>
    ) throws -> Int {
        let cleanID = id.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanID.isEmpty, !cleanProjectId.isEmpty,
              let index = entries.firstIndex(where: { entry in
                  entry.id == cleanID &&
                      entry.projectId == cleanProjectId &&
                      allowedOwners.contains(entry.ownerUserId)
              }) else {
            throw ScreenplayOutlineMutationRecoveryError.entryUnavailable
        }
        return index
    }

    private func publishRetryRequested(projectId: String) {
        DispatchQueue.main.async {
            NotificationCenter.default.post(
                name: .themScreenplayOutlineMutationOutboxRetryRequested,
                object: nil,
                userInfo: ["projectId": projectId]
            )
        }
    }
}

nonisolated private struct ScreenplayOutlineMutationScopeKey: Hashable {
    let projectId: String
    let ownerUserId: String
}

nonisolated private struct ScreenplayOutlineMutationRecoveryExportEnvelope: Encodable {
    let schemaVersion = 1
    let exportedAt: TimeInterval
    let projectId: String
    let parkedHeadRequestId: String
    let entries: [ScreenplayOutlineMutationRecoveryExportEntry]
}

nonisolated private struct ScreenplayOutlineMutationRecoveryExportEntry: Encodable {
    let requestId: String
    let expectedOutlineRevision: Int
    let acts: [BackendScreenplayAct]
    let scenes: [BackendScreenplayScene]
    let beats: [BackendScreenplayBeat]
    let source: String
    let createdAt: TimeInterval
    let updatedAt: TimeInterval
    let status: ScreenplayOutlineMutationOutboxStatus
    let retries: Int
    let lastError: String
    let parkedReason: ScreenplayOutlineMutationParkedReason?

    init(_ entry: ScreenplayOutlineMutationOutboxEntry) {
        requestId = entry.id
        expectedOutlineRevision = entry.expectedOutlineRevision
        acts = entry.acts
        scenes = entry.scenes
        beats = entry.beats
        source = entry.source
        createdAt = entry.createdAt
        updatedAt = entry.updatedAt
        status = entry.status
        retries = entry.retries
        lastError = entry.lastError
        parkedReason = entry.parkedReason
    }
}

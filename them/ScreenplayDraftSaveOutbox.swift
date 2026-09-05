import Foundation
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

actor ScreenplayDraftSaveOutbox {
    typealias FileProtectionEnforcer = @Sendable (URL) throws -> Void

    static let shared = ScreenplayDraftSaveOutbox(storageDirectory: defaultStorageDirectory())

    private static let maxDraftBytes = 2 * 1024 * 1024
    private static let backoffSeconds: [TimeInterval] = [2, 5, 15, 60, 300]

    private let storageDirectory: URL
    private let manifestURL: URL
    private let fileManager: FileManager
    private let fileProtectionEnforcer: FileProtectionEnforcer?
    private var didLoad = false
    private var entries: [ScreenplayDraftSaveOutboxEntry] = []
    private var networkMonitor: NWPathMonitor?
    private let networkMonitorQueue = DispatchQueue(label: "io.them.screenplay-save-outbox.network")

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

    func snapshot(
        ownerUserId: String,
        projectId: String,
        draft: String
    ) -> (owner: ScreenplayDraftSaveOutboxSnapshot, draft: ScreenplayDraftSaveOutboxSnapshot) {
        do {
            try loadIfNeeded()
            let cleanOwnerUserId = ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanDraft = normalizedDraft(draft)
            let ownerEntries = entries.filter { $0.ownerUserId == cleanOwnerUserId }
            let draftEntries = ownerEntries.filter {
                $0.projectId == cleanProjectId && normalizedDraft($0.draft) == cleanDraft
            }
            // Both views come from the same actor-isolated read; badge totals do not
            // imply that newer edits, or another project's draft, have been queued.
            return (owner: snapshotFor(ownerEntries), draft: snapshotFor(draftEntries))
        } catch {
            let failed = snapshotFor([], lastError: error.localizedDescription)
            return (owner: failed, draft: failed)
        }
    }

    @discardableResult
    func enqueue(_ entry: ScreenplayDraftSaveOutboxEntry) throws -> ScreenplayDraftSaveOutboxSnapshot {
        try loadIfNeeded()
        guard entry.draft.utf8.count <= Self.maxDraftBytes else {
            throw BackendMemoryAPIError.server(status: 413, message: "screenplay_draft_too_large")
        }
        if let index = entries.firstIndex(where: { $0.id == entry.id }) {
            guard entries[index].projectId == entry.projectId,
                  entries[index].ownerUserId == entry.ownerUserId,
                  normalizedDraft(entries[index].draft) == normalizedDraft(entry.draft) else {
                throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_id_reused")
            }
            let nextSnapshot = snapshotFor(entries)
            publish(nextSnapshot)
            return nextSnapshot
        }
        if entries.contains(where: { existing in
            existing.projectId == entry.projectId &&
                existing.ownerUserId == entry.ownerUserId &&
                existing.status != .parked &&
                existing.baseVersionId == entry.baseVersionId &&
                normalizedDraft(existing.draft) == normalizedDraft(entry.draft)
        }) {
            let nextSnapshot = snapshotFor(entries)
            publish(nextSnapshot)
            return nextSnapshot
        }
        let previousEntries = entries
        entries.append(entry)
        entries.sort { lhs, rhs in
            if lhs.createdAt == rhs.createdAt { return lhs.id < rhs.id }
            return lhs.createdAt < rhs.createdAt
        }
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
    ) throws -> ScreenplayDraftSaveOutboxEntry? {
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

    func markInflight(id: String, now: Date = Date()) throws {
        try loadIfNeeded()
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        let previousEntries = entries
        entries[index].status = .inflight
        entries[index].updatedAt = now.timeIntervalSince1970
        try persistOrRestore(previousEntries)
        publishSnapshot()
    }

    func markSucceeded(
        id: String,
        serverVersionId: String,
        now: Date = Date()
    ) throws {
        try loadIfNeeded()
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        let previousEntries = entries
        let completed = entries.remove(at: index)
        entries.removeAll { entry in
            entry.projectId == completed.projectId &&
                entry.ownerUserId == completed.ownerUserId &&
                entry.status == .parked &&
                entry.createdAt <= completed.createdAt
        }
        let nextBase = serverVersionId.trimmingCharacters(in: .whitespacesAndNewlines)
        if !nextBase.isEmpty {
            for queuedIndex in entries.indices where
                entries[queuedIndex].projectId == completed.projectId &&
                entries[queuedIndex].ownerUserId == completed.ownerUserId &&
                entries[queuedIndex].createdAt >= completed.createdAt &&
                entries[queuedIndex].baseVersionId == completed.baseVersionId {
                entries[queuedIndex].baseVersionId = nextBase
                entries[queuedIndex].updatedAt = now.timeIntervalSince1970
            }
        }
        try persistOrRestore(previousEntries)
        publishSnapshot()
    }

    func remove(id: String) throws {
        try loadIfNeeded()
        let previousEntries = entries
        entries.removeAll { $0.id == id }
        try persistOrRestore(previousEntries)
        publishSnapshot()
    }

    func removeAll(projectId: String, ownerUserId: String) throws {
        try loadIfNeeded()
        let cleanProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanOwnerUserId = ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        let previousEntries = entries
        entries.removeAll { entry in
            entry.projectId == cleanProjectId &&
                entry.ownerUserId == cleanOwnerUserId
        }
        try persistOrRestore(previousEntries)
        publishSnapshot()
    }

    func markRetryable(id: String, error: String, now: Date = Date()) throws {
        try loadIfNeeded()
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        let previousEntries = entries
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
        try persistOrRestore(previousEntries)
        publishSnapshot()
    }

    func markParked(id: String, error: String, now: Date = Date()) throws {
        try loadIfNeeded()
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        let previousEntries = entries
        entries[index].status = .parked
        entries[index].updatedAt = now.timeIntervalSince1970
        entries[index].nextAttemptAt = 0
        entries[index].lastError = normalizedError(error)
        try persistOrRestore(previousEntries)
        publishSnapshot()
    }

    func entriesForTesting() throws -> [ScreenplayDraftSaveOutboxEntry] {
        try loadIfNeeded()
        return entries
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
            didLoad = true
            return
        }
        try enforceCompleteFileProtection(at: storageDirectory)
        try enforceCompleteFileProtection(at: manifestURL)
        let data = try Data(contentsOf: manifestURL)
        var restoredEntries = try JSONDecoder().decode([ScreenplayDraftSaveOutboxEntry].self, from: data)
        let now = Date().timeIntervalSince1970
        let requiresRecoveryWrite = restoredEntries.contains { $0.status == .inflight }
        for index in restoredEntries.indices where restoredEntries[index].status == .inflight {
            restoredEntries[index].status = .pending
            restoredEntries[index].nextAttemptAt = min(restoredEntries[index].nextAttemptAt, now)
            restoredEntries[index].lastError = "Interrupted while saving."
        }
        let previousEntries = entries
        entries = restoredEntries
        if requiresRecoveryWrite {
            try persistOrRestore(previousEntries)
        }
        didLoad = true
    }

    private func persistOrRestore(
        _ previousEntries: [ScreenplayDraftSaveOutboxEntry]
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

    private func normalizedDraft(_ draft: String) -> String {
        draft
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func normalizedError(_ error: String) -> String {
        let clean = error
            .replacingOccurrences(of: "\n", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return String((clean.isEmpty ? "Queued for retry." : clean).prefix(280))
    }
}

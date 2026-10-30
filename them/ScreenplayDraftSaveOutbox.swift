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
    var initialization: ScreenplayInitialProjectMetadata? = nil
    var deliveryOrigin: ScreenplayDraftSaveOrigin? = nil
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
    static let shared = ScreenplayDraftSaveOutbox(storageDirectory: defaultStorageDirectory())

    private static let maxDraftBytes = 2 * 1024 * 1024
    private static let backoffSeconds: [TimeInterval] = [2, 5, 15, 60, 300]

    private let storageDirectory: URL
    private let manifestURL: URL
    private let fileManager: FileManager
    private var didLoad = false
    private var entries: [ScreenplayDraftSaveOutboxEntry] = []
    private var networkMonitor: NWPathMonitor?
    private let networkMonitorQueue = DispatchQueue(label: "io.them.screenplay-save-outbox.network")

    init(storageDirectory: URL, fileManager: FileManager = .default) {
        self.storageDirectory = storageDirectory
        self.manifestURL = storageDirectory.appendingPathComponent("queue.json")
        self.fileManager = fileManager
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
        try loadIfNeeded()
        guard entry.draft.utf8.count <= Self.maxDraftBytes else {
            throw BackendMemoryAPIError.server(status: 413, message: "screenplay_draft_too_large")
        }
        if let index = entries.firstIndex(where: { $0.id == entry.id }) {
            guard entries[index].projectId == entry.projectId,
                  entries[index].ownerUserId == entry.ownerUserId,
                  entries[index].deliveryOrigin == entry.deliveryOrigin,
                  entries[index].draft.utf8.elementsEqual(entry.draft.utf8) else {
                throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_id_reused")
            }
            let nextSnapshot = snapshotFor(entries)
            publish(nextSnapshot)
            return nextSnapshot
        }
        if entries.contains(where: { existing in
            existing.projectId == entry.projectId &&
                existing.ownerUserId == entry.ownerUserId &&
                existing.deliveryOrigin == entry.deliveryOrigin &&
                existing.status != .parked &&
                existing.baseVersionId == entry.baseVersionId &&
                existing.draft.utf8.elementsEqual(entry.draft.utf8)
        }) {
            let nextSnapshot = snapshotFor(entries)
            publish(nextSnapshot)
            return nextSnapshot
        }
        entries.append(entry)
        entries.sort { lhs, rhs in
            if lhs.createdAt == rhs.createdAt { return lhs.id < rhs.id }
            return lhs.createdAt < rhs.createdAt
        }
        try persist()
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
            $0.projectId == cleanProjectId && $0.ownerUserId == cleanOwnerUserId && $0.initialization == nil
        }) else {
            return nil
        }
        let entry = entries[index]
        guard entry.status == .pending,
              force || entry.nextAttemptAt <= nowSeconds else {
            return nil
        }
        let previous = entries
        entries[index].status = .inflight
        entries[index].updatedAt = nowSeconds
        do { try persist() } catch { entries = previous; throw error }
        publishSnapshot()
        return entries[index]
    }

    /// Release only the exact claimed bytes; another request must not be changed.
    func releaseInflightClaim(_ claimed: ScreenplayDraftSaveOutboxEntry) throws {
        try loadIfNeeded()
        guard claimed.status == .inflight,
              let index = entries.firstIndex(where: { $0.id == claimed.id }),
              entries[index].status == .inflight else { return }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard try encoder.encode(entries[index]) == encoder.encode(claimed) else { return }
        let previous = entries
        entries[index].status = .pending
        do { try persist() } catch { entries = previous; throw error }
        publishSnapshot()
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
        entries[index].status = .inflight
        entries[index].updatedAt = now.timeIntervalSince1970
        try persist()
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
        entries.removeAll { entry in
            entry.projectId == completed.projectId &&
                entry.ownerUserId == completed.ownerUserId &&
                entry.deliveryOrigin == completed.deliveryOrigin &&
                entry.status == .parked &&
                entry.createdAt <= completed.createdAt
        }
        let nextBase = serverVersionId.trimmingCharacters(in: .whitespacesAndNewlines)
        if !nextBase.isEmpty {
            for queuedIndex in entries.indices where
                entries[queuedIndex].projectId == completed.projectId &&
                entries[queuedIndex].ownerUserId == completed.ownerUserId &&
                entries[queuedIndex].deliveryOrigin == completed.deliveryOrigin &&
                entries[queuedIndex].createdAt >= completed.createdAt &&
                entries[queuedIndex].baseVersionId == completed.baseVersionId {
                entries[queuedIndex].baseVersionId = nextBase
                entries[queuedIndex].updatedAt = now.timeIntervalSince1970
            }
        }
        do { try persist() } catch { entries = previous; throw error }
        publishSnapshot()
    }

    func remove(id: String) throws {
        try loadIfNeeded()
        entries.removeAll { $0.id == id }
        try persist()
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
            entries[index].lastError = "Server draft changed. Choose Keep Mine or Load Server."
        }
        do { try persist() } catch { entries = previous; throw error }
        publishSnapshot()
        return entries.last { $0.projectId == project && $0.ownerUserId == owner && $0.deliveryOrigin == deliveryOrigin }
    }

    func removeAll(projectId: String, ownerUserId: String) throws {
        try loadIfNeeded()
        let cleanProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanOwnerUserId = ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        entries.removeAll { entry in
            entry.projectId == cleanProjectId &&
                entry.ownerUserId == cleanOwnerUserId
        }
        try persist()
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
            didLoad = true
            return
        }
        let data = try Data(contentsOf: manifestURL)
        var restoredEntries = try JSONDecoder().decode([ScreenplayDraftSaveOutboxEntry].self, from: data)
        let now = Date().timeIntervalSince1970
        for index in restoredEntries.indices where restoredEntries[index].status == .inflight {
            restoredEntries[index].status = .pending
            restoredEntries[index].nextAttemptAt = min(restoredEntries[index].nextAttemptAt, now)
            restoredEntries[index].lastError = "Interrupted while saving."
        }
        entries = restoredEntries
        try persist()
        didLoad = true
    }

    private func persist() throws {
        try fileManager.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(entries)
        try data.write(to: manifestURL, options: .atomic)
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

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
    static let shared = ScreenplayDraftSaveOutbox(storageDirectory: defaultStorageDirectory())

    private static let maxDraftBytes = 2 * 1024 * 1024
    private static let maxReceipts = 256
    private static let backoffSeconds: [TimeInterval] = [2, 5, 15, 60, 300]

    private let storageDirectory: URL
    private let manifestURL: URL
    private let fileManager: FileManager
    private var didLoad = false
    private var entries: [ScreenplayDraftSaveOutboxEntry] = []
    private var receipts: [ScreenplayDraftSaveReceipt] = []
    private var receiptWaiters: [ScreenplayDraftSaveReceiptKey: [UUID: AsyncStream<ScreenplayDraftSaveReceipt>.Continuation]] = [:]
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
        let entryKey = receiptKey(for: entry)
        if let completed = receipts.first(where: {
            $0.key.ownerUserId == entryKey.ownerUserId &&
                $0.key.projectId == entryKey.projectId &&
                $0.key.clientRequestId == entryKey.clientRequestId
        }) {
            guard completed.key == entryKey else {
                throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_id_reused")
            }
            let nextSnapshot = snapshotFor(entries)
            publish(nextSnapshot)
            return nextSnapshot
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
        var nextEntries = entries
        nextEntries.append(entry)
        nextEntries.sort { lhs, rhs in
            if lhs.createdAt == rhs.createdAt { return lhs.id < rhs.id }
            return lhs.createdAt < rhs.createdAt
        }
        try commit(entries: nextEntries, receipts: receipts)
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
            $0.projectId == cleanProjectId &&
                $0.ownerUserId == cleanOwnerUserId &&
                $0.status != .parked
        }) else {
            return nil
        }
        let entry = entries[index]
        guard entry.status == .pending,
              force || entry.nextAttemptAt <= nowSeconds else {
            return nil
        }
        var nextEntries = entries
        nextEntries[index].status = .inflight
        nextEntries[index].updatedAt = nowSeconds
        try commit(entries: nextEntries, receipts: receipts)
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
        var nextEntries = entries
        nextEntries[index].status = .inflight
        nextEntries[index].updatedAt = now.timeIntervalSince1970
        try commit(entries: nextEntries, receipts: receipts)
        publishSnapshot()
    }

    @discardableResult
    func markAccepted(
        key: ScreenplayDraftSaveReceiptKey,
        proof: ScreenplayDraftSaveServerProof,
        now: Date = Date()
    ) throws -> ScreenplayDraftSaveReceipt {
        try loadIfNeeded()
        if let existing = receipts.first(where: { $0.key == key }) {
            guard existing.outcome == .accepted,
                  existing.serverVersionId == proof.versionId,
                  existing.serverDraftSHA256 == proof.canonicalDraftSHA256 else {
                throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_receipt_conflict")
            }
            return existing
        }
        guard let index = entries.firstIndex(where: { receiptKey(for: $0) == key }) else {
            throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_receipt_entry_missing")
        }
        var nextEntries = entries
        let completed = nextEntries.remove(at: index)
        let supersededEntries = nextEntries.filter { entry in
            entry.projectId == completed.projectId &&
                entry.ownerUserId == completed.ownerUserId &&
                entry.status == .parked &&
                entry.createdAt <= completed.createdAt &&
                !receipts.contains(where: { $0.key == receiptKey(for: entry) })
        }
        let supersededIDs = Set(supersededEntries.map(\.id))
        nextEntries.removeAll { supersededIDs.contains($0.id) }
        let nextBase = proof.versionId.trimmingCharacters(in: .whitespacesAndNewlines)
        if !nextBase.isEmpty {
            for queuedIndex in nextEntries.indices where
                nextEntries[queuedIndex].projectId == completed.projectId &&
                nextEntries[queuedIndex].ownerUserId == completed.ownerUserId &&
                nextEntries[queuedIndex].createdAt >= completed.createdAt &&
                nextEntries[queuedIndex].baseVersionId == completed.baseVersionId {
                nextEntries[queuedIndex].baseVersionId = nextBase
                nextEntries[queuedIndex].updatedAt = now.timeIntervalSince1970
            }
        }
        let receipt = ScreenplayDraftSaveReceipt(
            key: key,
            outcome: .accepted,
            serverVersionId: nextBase,
            serverDraftSHA256: proof.canonicalDraftSHA256,
            reasonCode: "",
            completedAt: now.timeIntervalSince1970
        )
        let supersededReceipts = supersededEntries.map { entry in
            ScreenplayDraftSaveReceipt(
                key: receiptKey(for: entry),
                outcome: .superseded,
                serverVersionId: nextBase,
                serverDraftSHA256: proof.canonicalDraftSHA256,
                reasonCode: "superseded_by_accepted_save",
                completedAt: now.timeIntervalSince1970
            )
        }
        let nextReceipts = (supersededReceipts + [receipt]).reduce(receipts) { appending($1, to: $0) }
        try commitReceiptTransition(entries: nextEntries, receipts: nextReceipts)
        supersededReceipts.forEach(finishWaiters)
        finishWaiters(with: receipt)
        publishSnapshot()
        return receipt
    }

    func markConflict(
        activeKey: ScreenplayDraftSaveReceiptKey,
        serverVersionId: String,
        serverDraft: String,
        reasonCode: String,
        now: Date = Date()
    ) throws -> ScreenplayDraftSaveReceipt {
        try loadIfNeeded()
        let cleanReason = normalizedReasonCode(reasonCode, fallback: "stale_version")
        let cleanVersionId = serverVersionId.trimmingCharacters(in: .whitespacesAndNewlines)
        let serverHash = serverDraft.isEmpty ? "" : ScreenplayDraftSaveCanonicalization.serverSHA256(serverDraft)
        if let existing = receipts.first(where: { $0.key == activeKey }) {
            guard existing.outcome == .conflict,
                  existing.serverVersionId == cleanVersionId,
                  existing.serverDraftSHA256 == serverHash,
                  existing.reasonCode == cleanReason else {
                throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_receipt_conflict")
            }
            return existing
        }
        guard let activeIndex = entries.firstIndex(where: { receiptKey(for: $0) == activeKey }) else {
            throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_receipt_entry_missing")
        }
        let completedAt = now.timeIntervalSince1970
        let receipt = ScreenplayDraftSaveReceipt(
            key: activeKey,
            outcome: .conflict,
            serverVersionId: cleanVersionId,
            serverDraftSHA256: serverHash,
            reasonCode: cleanReason,
            completedAt: completedAt
        )
        var nextEntries = entries
        nextEntries.remove(at: activeIndex)
        for index in nextEntries.indices where
            nextEntries[index].projectId == activeKey.projectId &&
            nextEntries[index].ownerUserId == activeKey.ownerUserId &&
            !receipts.contains(where: { $0.key == receiptKey(for: nextEntries[index]) }) {
            nextEntries[index].status = .parked
            nextEntries[index].updatedAt = completedAt
            nextEntries[index].nextAttemptAt = 0
            nextEntries[index].lastError = "Blocked by an unresolved save conflict."
        }
        let nextReceipts = appending(receipt, to: receipts)
        try commitReceiptTransition(entries: nextEntries, receipts: nextReceipts)
        finishWaiters(with: receipt)
        publishSnapshot()
        return receipt
    }

    @discardableResult
    func markSuperseded(
        key: ScreenplayDraftSaveReceiptKey,
        serverVersionId: String,
        serverDraft: String,
        reasonCode: String,
        now: Date = Date()
    ) throws -> ScreenplayDraftSaveReceipt {
        try loadIfNeeded()
        let nextBase = serverVersionId.trimmingCharacters(in: .whitespacesAndNewlines)
        let serverHash = ScreenplayDraftSaveCanonicalization.serverSHA256(serverDraft)
        let cleanReason = normalizedReasonCode(reasonCode, fallback: "already_saved_elsewhere")
        if let existing = receipts.first(where: { $0.key == key }) {
            guard existing.outcome == .superseded,
                  existing.serverVersionId == nextBase,
                  existing.serverDraftSHA256 == serverHash,
                  existing.reasonCode == cleanReason else {
                throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_receipt_conflict")
            }
            return existing
        }
        guard let index = entries.firstIndex(where: { receiptKey(for: $0) == key }) else {
            throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_receipt_entry_missing")
        }
        var nextEntries = entries
        let completed = nextEntries.remove(at: index)
        for queuedIndex in nextEntries.indices where
            nextEntries[queuedIndex].projectId == completed.projectId &&
            nextEntries[queuedIndex].ownerUserId == completed.ownerUserId &&
            nextEntries[queuedIndex].createdAt >= completed.createdAt &&
            nextEntries[queuedIndex].baseVersionId == completed.baseVersionId {
            nextEntries[queuedIndex].baseVersionId = nextBase
            nextEntries[queuedIndex].updatedAt = now.timeIntervalSince1970
        }
        let receipt = ScreenplayDraftSaveReceipt(
            key: key,
            outcome: .superseded,
            serverVersionId: nextBase,
            serverDraftSHA256: serverHash,
            reasonCode: cleanReason,
            completedAt: now.timeIntervalSince1970
        )
        let nextReceipts = appending(receipt, to: receipts)
        try commitReceiptTransition(entries: nextEntries, receipts: nextReceipts)
        finishWaiters(with: receipt)
        publishSnapshot()
        return receipt
    }

    @discardableResult
    func markRejected(
        key: ScreenplayDraftSaveReceiptKey,
        reasonCode: String,
        error: String,
        now: Date = Date()
    ) throws -> ScreenplayDraftSaveReceipt {
        try loadIfNeeded()
        let cleanReason = normalizedReasonCode(reasonCode, fallback: "save_rejected")
        if let existing = receipts.first(where: { $0.key == key }) {
            guard existing.outcome == .rejected,
                  existing.reasonCode == cleanReason else {
                throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_receipt_conflict")
            }
            return existing
        }
        guard let index = entries.firstIndex(where: { receiptKey(for: $0) == key }) else {
            throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_receipt_entry_missing")
        }
        var nextEntries = entries
        nextEntries[index].status = .parked
        nextEntries[index].updatedAt = now.timeIntervalSince1970
        nextEntries[index].nextAttemptAt = 0
        nextEntries[index].lastError = normalizedError(error)
        let receipt = ScreenplayDraftSaveReceipt(
            key: key,
            outcome: .rejected,
            serverVersionId: "",
            serverDraftSHA256: "",
            reasonCode: cleanReason,
            completedAt: now.timeIntervalSince1970
        )
        let nextReceipts = appending(receipt, to: receipts)
        try commitReceiptTransition(entries: nextEntries, receipts: nextReceipts)
        finishWaiters(with: receipt)
        publishSnapshot()
        return receipt
    }

    func receipt(for key: ScreenplayDraftSaveReceiptKey) throws -> ScreenplayDraftSaveReceipt? {
        try loadIfNeeded()
        return receipts.first(where: { $0.key == key })
    }

    func receiptStream(for key: ScreenplayDraftSaveReceiptKey) throws -> AsyncStream<ScreenplayDraftSaveReceipt> {
        try loadIfNeeded()
        if let existing = receipts.first(where: { $0.key == key }) {
            return AsyncStream { continuation in
                continuation.yield(existing)
                continuation.finish()
            }
        }
        let waiterID = UUID()
        let pair = AsyncStream<ScreenplayDraftSaveReceipt>.makeStream()
        receiptWaiters[key, default: [:]][waiterID] = pair.continuation
        pair.continuation.onTermination = { [weak self] _ in
            Task { await self?.cancelReceiptWaiter(key: key, waiterID: waiterID) }
        }
        return pair.stream
    }

    func markRetryable(id: String, error: String, now: Date = Date()) throws {
        try loadIfNeeded()
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        let retryCount = entries[index].retries + 1
        var nextEntries = entries
        nextEntries[index].retries = retryCount
        nextEntries[index].updatedAt = now.timeIntervalSince1970
        nextEntries[index].lastError = normalizedError(error)
        if retryCount > Self.backoffSeconds.count {
            nextEntries[index].status = .parked
            nextEntries[index].nextAttemptAt = 0
        } else {
            nextEntries[index].status = .pending
            nextEntries[index].nextAttemptAt = now.timeIntervalSince1970 + Self.backoffSeconds[retryCount - 1]
        }
        try commit(entries: nextEntries, receipts: receipts)
        publishSnapshot()
    }

    func markParked(id: String, error: String, now: Date = Date()) throws {
        try loadIfNeeded()
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        var nextEntries = entries
        nextEntries[index].status = .parked
        nextEntries[index].updatedAt = now.timeIntervalSince1970
        nextEntries[index].nextAttemptAt = 0
        nextEntries[index].lastError = normalizedError(error)
        try commit(entries: nextEntries, receipts: receipts)
        publishSnapshot()
    }

    func recoverInflightAfterReceiptPersistenceFailure(
        id: String,
        error: String,
        now: Date = Date()
    ) {
        guard let index = entries.firstIndex(where: { $0.id == id && $0.status == .inflight }) else {
            return
        }
        entries[index].status = .pending
        entries[index].updatedAt = now.timeIntervalSince1970
        entries[index].nextAttemptAt = now.timeIntervalSince1970 + Self.backoffSeconds[0]
        entries[index].lastError = normalizedError(error)
        // The durable manifest still contains `.inflight`; load recovery already
        // maps that state back to pending after a restart. This in-memory mirror
        // keeps the same retry available without requiring an app restart when
        // the filesystem becomes writable again.
        publishSnapshot()
    }

    func entriesForTesting() throws -> [ScreenplayDraftSaveOutboxEntry] {
        try loadIfNeeded()
        return entries
    }

    func receiptsForTesting() throws -> [ScreenplayDraftSaveReceipt] {
        try loadIfNeeded()
        return receipts
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
            receipts = []
            didLoad = true
            return
        }
        let data = try Data(contentsOf: manifestURL)
        let decoder = JSONDecoder()
        let restoredManifest: ScreenplayDraftSaveOutboxManifest
        if let manifest = try? decoder.decode(ScreenplayDraftSaveOutboxManifest.self, from: data) {
            guard manifest.schemaVersion == ScreenplayDraftSaveOutboxManifest.currentSchemaVersion else {
                throw BackendMemoryAPIError.server(status: 409, message: "screenplay_save_manifest_version_unsupported")
            }
            restoredManifest = manifest
        } else {
            restoredManifest = ScreenplayDraftSaveOutboxManifest(
                entries: try decoder.decode([ScreenplayDraftSaveOutboxEntry].self, from: data),
                receipts: []
            )
        }
        var restoredEntries = restoredManifest.entries
        let now = Date().timeIntervalSince1970
        for index in restoredEntries.indices where restoredEntries[index].status == .inflight {
            restoredEntries[index].status = .pending
            restoredEntries[index].nextAttemptAt = min(restoredEntries[index].nextAttemptAt, now)
            restoredEntries[index].lastError = "Interrupted while saving."
        }
        let restoredReceipts = Array(restoredManifest.receipts.suffix(Self.maxReceipts))
        try persist(entries: restoredEntries, receipts: restoredReceipts)
        entries = restoredEntries
        receipts = restoredReceipts
        didLoad = true
    }

    private func commit(
        entries nextEntries: [ScreenplayDraftSaveOutboxEntry],
        receipts nextReceipts: [ScreenplayDraftSaveReceipt]
    ) throws {
        try persist(entries: nextEntries, receipts: nextReceipts)
        entries = nextEntries
        receipts = nextReceipts
    }

    private func commitReceiptTransition(
        entries nextEntries: [ScreenplayDraftSaveOutboxEntry],
        receipts nextReceipts: [ScreenplayDraftSaveReceipt]
    ) throws {
        do {
            try commit(entries: nextEntries, receipts: nextReceipts)
        } catch {
            throw ScreenplayDraftSaveReceiptPersistenceError(message: error.localizedDescription)
        }
    }

    private func persist(
        entries: [ScreenplayDraftSaveOutboxEntry],
        receipts: [ScreenplayDraftSaveReceipt]
    ) throws {
        try fileManager.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(ScreenplayDraftSaveOutboxManifest(
            entries: entries,
            receipts: receipts
        ))
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

    private func normalizedDraft(_ draft: String) -> String {
        ScreenplayDraftSaveCanonicalization.serverDraft(draft)
    }

    private func normalizedError(_ error: String) -> String {
        let clean = error
            .replacingOccurrences(of: "\n", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return String((clean.isEmpty ? "Queued for retry." : clean).prefix(280))
    }

    private func normalizedReasonCode(_ value: String, fallback: String) -> String {
        let clean = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: #"[^a-z0-9_]+"#, with: "_", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "_"))
        return String((clean.isEmpty ? fallback : clean).prefix(80))
    }

    private func receiptKey(for entry: ScreenplayDraftSaveOutboxEntry) -> ScreenplayDraftSaveReceiptKey {
        ScreenplayDraftSaveReceiptKey(
            ownerUserId: entry.ownerUserId,
            projectId: entry.projectId,
            clientRequestId: entry.id,
            draft: entry.draft
        )
    }

    private func appending(
        _ receipt: ScreenplayDraftSaveReceipt,
        to existing: [ScreenplayDraftSaveReceipt]
    ) -> [ScreenplayDraftSaveReceipt] {
        var next = existing.filter { $0.key != receipt.key }
        next.append(receipt)
        return Array(next.suffix(Self.maxReceipts))
    }

    private func finishWaiters(with receipt: ScreenplayDraftSaveReceipt) {
        guard let continuations = receiptWaiters.removeValue(forKey: receipt.key)?.values else { return }
        continuations.forEach { continuation in
            continuation.yield(receipt)
            continuation.finish()
        }
    }

    private func cancelReceiptWaiter(key: ScreenplayDraftSaveReceiptKey, waiterID: UUID) {
        receiptWaiters[key]?.removeValue(forKey: waiterID)
        if receiptWaiters[key]?.isEmpty == true {
            receiptWaiters.removeValue(forKey: key)
        }
    }
}

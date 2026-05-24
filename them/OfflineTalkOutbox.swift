import Foundation
import Network

nonisolated extension Notification.Name {
    static let themOfflineTalkOutboxUpdated = Notification.Name("io.them.them.offlineTalkOutboxUpdated")
}

nonisolated enum OfflineTalkOutboxStatus: String, Codable, Equatable {
    case pending
    case inflight
    case parked
}

nonisolated struct OfflineTalkOutboxSnapshot: Codable, Equatable {
    var pendingCount: Int
    var inflightCount: Int
    var parkedCount: Int
    var lastError: String

    static let empty = OfflineTalkOutboxSnapshot(
        pendingCount: 0,
        inflightCount: 0,
        parkedCount: 0,
        lastError: ""
    )

    var activeCount: Int {
        pendingCount + inflightCount
    }

    var hasWork: Bool {
        activeCount > 0 || parkedCount > 0
    }

    var userVisibleStatus: String? {
        if inflightCount > 0 {
            return inflightCount == 1
                ? "Sending queued turn..."
                : "Sending \(inflightCount) queued turns..."
        }
        if pendingCount > 0 {
            return pendingCount == 1
                ? "Queued - will send when online."
                : "\(pendingCount) turns queued - will send when online."
        }
        if parkedCount > 0 {
            return parkedCount == 1
                ? "1 queued turn needs attention in Data Controls."
                : "\(parkedCount) queued turns need attention in Data Controls."
        }
        return nil
    }

    var notificationUserInfo: [String: Any] {
        [
            OfflineTalkOutbox.NotificationKey.pendingCount: pendingCount,
            OfflineTalkOutbox.NotificationKey.inflightCount: inflightCount,
            OfflineTalkOutbox.NotificationKey.parkedCount: parkedCount,
            OfflineTalkOutbox.NotificationKey.lastError: lastError,
        ]
    }

    init(
        pendingCount: Int,
        inflightCount: Int,
        parkedCount: Int,
        lastError: String
    ) {
        self.pendingCount = pendingCount
        self.inflightCount = inflightCount
        self.parkedCount = parkedCount
        self.lastError = lastError
    }

    init(notification: Notification) {
        let userInfo = notification.userInfo ?? [:]
        pendingCount = userInfo[OfflineTalkOutbox.NotificationKey.pendingCount] as? Int ?? 0
        inflightCount = userInfo[OfflineTalkOutbox.NotificationKey.inflightCount] as? Int ?? 0
        parkedCount = userInfo[OfflineTalkOutbox.NotificationKey.parkedCount] as? Int ?? 0
        lastError = userInfo[OfflineTalkOutbox.NotificationKey.lastError] as? String ?? ""
    }
}

nonisolated struct OfflineTalkOutboxEntry: Identifiable, Codable, Equatable {
    var id: String
    var createdAt: TimeInterval
    var updatedAt: TimeInterval
    var endpoint: String
    var method: String
    var urlString: String
    var headers: [String: String]
    var bodyRef: String
    var bodyByteCount: Int
    var idempotencyKey: String
    var timeoutInterval: TimeInterval
    var status: OfflineTalkOutboxStatus
    var retries: Int
    var nextAttemptAt: TimeInterval
    var lastError: String?
}

nonisolated struct OfflineTalkOutboxSendResult {
    let statusCode: Int
    let headers: [String: String]
    let body: Data

    init(statusCode: Int, headers: [String: String] = [:], body: Data = Data()) {
        self.statusCode = statusCode
        self.headers = headers
        self.body = body
    }
}

nonisolated struct OfflineTalkOutboxEnqueueResult {
    let entry: OfflineTalkOutboxEntry
    let snapshot: OfflineTalkOutboxSnapshot
}

nonisolated struct BackendTalkQueuedError: LocalizedError {
    let entryID: String
    let snapshot: OfflineTalkOutboxSnapshot
    let reason: String

    var errorDescription: String? {
        snapshot.userVisibleStatus ?? "Queued - will send when online."
    }
}

actor OfflineTalkOutbox {
    enum NotificationKey {
        static let pendingCount = "pendingCount"
        static let inflightCount = "inflightCount"
        static let parkedCount = "parkedCount"
        static let lastError = "lastError"
    }

    typealias Transport = (URLRequest) async throws -> OfflineTalkOutboxSendResult

    static let shared = OfflineTalkOutbox(storageDirectory: defaultStorageDirectory())

    private static let maxBodyBytes = 25 * 1024 * 1024
    private static let backoffSeconds: [TimeInterval] = [5, 15, 60, 300, 1_800]
    private static let endpoint = "/talk"

    private let storageDirectory: URL
    private let manifestURL: URL
    private let blobsDirectory: URL
    private let fileManager: FileManager
    private var didLoad = false
    private var entries: [OfflineTalkOutboxEntry] = []
    private var networkMonitor: NWPathMonitor?
    private let networkMonitorQueue = DispatchQueue(label: "io.them.offline-talk-outbox.network")

    init(storageDirectory: URL, fileManager: FileManager = .default) {
        self.storageDirectory = storageDirectory
        self.manifestURL = storageDirectory.appendingPathComponent("queue.jsonl")
        self.blobsDirectory = storageDirectory.appendingPathComponent("blobs", isDirectory: true)
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
        let outbox = self
        monitor.pathUpdateHandler = { path in
            guard path.status == .satisfied else { return }
            Task {
                _ = await outbox.drainDue()
            }
        }
        monitor.start(queue: networkMonitorQueue)
        networkMonitor = monitor
    }

    func stopNetworkMonitoring() {
        networkMonitor?.cancel()
        networkMonitor = nil
    }

    func snapshot() -> OfflineTalkOutboxSnapshot {
        do {
            try loadIfNeeded()
            return snapshotFor(entries)
        } catch {
            return snapshotFor(entries, lastError: error.localizedDescription)
        }
    }

    func allEntries() -> [OfflineTalkOutboxEntry] {
        do {
            try loadIfNeeded()
        } catch {
            return entries
        }
        return entries.sorted { lhs, rhs in
            if lhs.status != rhs.status {
                return statusSortKey(lhs.status) < statusSortKey(rhs.status)
            }
            return lhs.createdAt < rhs.createdAt
        }
    }

    func enqueue(
        request: URLRequest,
        body: Data,
        reason: String
    ) throws -> OfflineTalkOutboxEnqueueResult {
        try loadIfNeeded()
        try ensureStorageExists()

        guard request.httpMethod?.uppercased() == "POST",
              request.url?.path == Self.endpoint else {
            throw BackendError.stage("offline_outbox", "Only POST /talk can be queued.")
        }
        guard body.count <= Self.maxBodyBytes else {
            throw BackendError.stage("offline_outbox", "Queued talk turn is too large.")
        }
        guard let urlString = request.url?.absoluteString, !urlString.isEmpty else {
            throw BackendError.stage("offline_outbox", "Missing talk request URL.")
        }

        let idempotencyKey = normalizedHeader(request.value(forHTTPHeaderField: "X-Idempotency-Key"))
            ?? UUID().uuidString
        if let existingIndex = entries.firstIndex(where: { $0.idempotencyKey == idempotencyKey }) {
            entries[existingIndex].lastError = normalizedReason(reason)
            entries[existingIndex].updatedAt = Date().timeIntervalSince1970
            try persist()
            let nextSnapshot = snapshotFor(entries)
            publish(nextSnapshot)
            return OfflineTalkOutboxEnqueueResult(entry: entries[existingIndex], snapshot: nextSnapshot)
        }

        let id = UUID().uuidString.lowercased()
        let bodyRef = "blob-\(id).multipart"
        let now = Date().timeIntervalSince1970
        let entry = OfflineTalkOutboxEntry(
            id: id,
            createdAt: now,
            updatedAt: now,
            endpoint: Self.endpoint,
            method: "POST",
            urlString: urlString,
            headers: normalizedHeaders(request.allHTTPHeaderFields ?? [:], idempotencyKey: idempotencyKey),
            bodyRef: bodyRef,
            bodyByteCount: body.count,
            idempotencyKey: idempotencyKey,
            timeoutInterval: request.timeoutInterval > 0 ? request.timeoutInterval : 40,
            status: .pending,
            retries: 0,
            nextAttemptAt: now + Self.backoffSeconds[0],
            lastError: normalizedReason(reason)
        )

        try writeProtectedData(body, to: blobURL(for: bodyRef))
        entries.append(entry)
        try persist()
        let nextSnapshot = snapshotFor(entries)
        publish(nextSnapshot)
        return OfflineTalkOutboxEnqueueResult(entry: entry, snapshot: nextSnapshot)
    }

    @discardableResult
    func drainDue(
        now: Date = Date(),
        limit: Int = 6,
        transport: Transport? = nil
    ) async -> OfflineTalkOutboxSnapshot {
        do {
            try loadIfNeeded()
            try ensureStorageExists()
        } catch {
            let failedSnapshot = snapshotFor(entries, lastError: error.localizedDescription)
            publish(failedSnapshot)
            return failedSnapshot
        }

        let sender = transport ?? Self.liveTransport
        let nowSeconds = now.timeIntervalSince1970
        var sentCount = 0

        while sentCount < max(1, limit),
              let index = entries.firstIndex(where: { entry in
                  entry.status == .pending && entry.nextAttemptAt <= nowSeconds
              }) {
            sentCount += 1
            entries[index].status = .inflight
            entries[index].updatedAt = nowSeconds
            try? persist()
            publishSnapshot()

            let entry = entries[index]
            do {
                let request = try replayRequest(for: entry)
                let result = try await sender(request)
                try handleSendResult(result, forEntryID: entry.id, now: now)
            } catch {
                handleRetryableFailure(
                    entryID: entry.id,
                    message: error.localizedDescription,
                    now: now
                )
            }
            try? persist()
            publishSnapshot()
        }

        let nextSnapshot = snapshotFor(entries)
        publish(nextSnapshot)
        return nextSnapshot
    }

    func deleteParkedEntries() throws -> OfflineTalkOutboxSnapshot {
        try loadIfNeeded()
        let parked = entries.filter { $0.status == .parked }
        entries.removeAll { $0.status == .parked }
        for entry in parked {
            try? fileManager.removeItem(at: blobURL(for: entry.bodyRef))
        }
        try persist()
        let nextSnapshot = snapshotFor(entries)
        publish(nextSnapshot)
        return nextSnapshot
    }

    private static func defaultStorageDirectory() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return base
            .appendingPathComponent("io.them", isDirectory: true)
            .appendingPathComponent("OfflineTalkOutbox", isDirectory: true)
    }

    private static func liveTransport(_ request: URLRequest) async throws -> OfflineTalkOutboxSendResult {
        let (data, response) = try await URLSession.shared.data(for: request)
        let http = response as? HTTPURLResponse
        let headers = http?.allHeaderFields.reduce(into: [String: String]()) { result, pair in
            guard let key = pair.key as? String else { return }
            result[key] = String(describing: pair.value)
        } ?? [:]
        return OfflineTalkOutboxSendResult(
            statusCode: http?.statusCode ?? -1,
            headers: headers,
            body: data
        )
    }

    private func loadIfNeeded() throws {
        guard !didLoad else { return }
        didLoad = true
        entries = []
        guard fileManager.fileExists(atPath: manifestURL.path) else { return }

        let data = try Data(contentsOf: manifestURL)
        let raw = String(data: data, encoding: .utf8) ?? ""
        let decoder = JSONDecoder()
        let now = Date().timeIntervalSince1970
        entries = raw
            .split(separator: "\n")
            .compactMap { line -> OfflineTalkOutboxEntry? in
                guard let lineData = String(line).data(using: .utf8) else { return nil }
                guard var entry = try? decoder.decode(OfflineTalkOutboxEntry.self, from: lineData) else {
                    return nil
                }
                if entry.status == .inflight {
                    entry.status = .pending
                    entry.nextAttemptAt = min(entry.nextAttemptAt, now)
                    entry.lastError = "Interrupted while sending."
                }
                return entry
            }
    }

    private func persist() throws {
        try ensureStorageExists()
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        var data = Data()
        for entry in entries {
            let encoded = try encoder.encode(entry)
            data.append(encoded)
            data.append(0x0A)
        }
        try writeProtectedData(data, to: manifestURL)
    }

    private func ensureStorageExists() throws {
        try fileManager.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: blobsDirectory, withIntermediateDirectories: true)
        #if os(iOS)
        try? fileManager.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: storageDirectory.path
        )
        try? fileManager.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: blobsDirectory.path
        )
        #endif
    }

    private func writeProtectedData(_ data: Data, to url: URL) throws {
        try data.write(to: url, options: [.atomic])
        #if os(iOS)
        try fileManager.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: url.path
        )
        #endif
    }

    private func blobURL(for bodyRef: String) -> URL {
        blobsDirectory.appendingPathComponent(bodyRef)
    }

    private func replayRequest(for entry: OfflineTalkOutboxEntry) throws -> URLRequest {
        guard let url = URL(string: entry.urlString) else {
            throw BackendError.stage("offline_outbox", "Queued talk request URL is invalid.")
        }
        let body = try Data(contentsOf: blobURL(for: entry.bodyRef))
        var request = URLRequest(url: url)
        request.httpMethod = entry.method
        request.timeoutInterval = entry.timeoutInterval
        for (key, value) in entry.headers {
            request.setValue(value, forHTTPHeaderField: key)
        }
        request.httpBody = body
        return request
    }

    private func handleSendResult(
        _ result: OfflineTalkOutboxSendResult,
        forEntryID entryID: String,
        now: Date
    ) throws {
        guard let index = entries.firstIndex(where: { $0.id == entryID }) else { return }
        let status = result.statusCode
        if (200...299).contains(status) {
            let entry = entries.remove(at: index)
            try? fileManager.removeItem(at: blobURL(for: entry.bodyRef))
            return
        }
        if isRetryable(statusCode: status) {
            handleRetryableFailure(
                entryID: entryID,
                message: "HTTP \(status)",
                now: now
            )
            return
        }
        entries[index].status = .parked
        entries[index].updatedAt = now.timeIntervalSince1970
        entries[index].lastError = "HTTP \(status)"
    }

    private func handleRetryableFailure(
        entryID: String,
        message: String,
        now: Date
    ) {
        guard let index = entries.firstIndex(where: { $0.id == entryID }) else { return }
        var entry = entries[index]
        let nextRetryCount = entry.retries + 1
        entry.updatedAt = now.timeIntervalSince1970
        entry.retries = nextRetryCount
        entry.lastError = normalizedReason(message)
        if nextRetryCount > Self.backoffSeconds.count {
            entry.status = .parked
            entry.nextAttemptAt = 0
        } else {
            entry.status = .pending
            entry.nextAttemptAt = now.timeIntervalSince1970 + Self.backoffSeconds[nextRetryCount - 1]
        }
        entries[index] = entry
    }

    private func snapshotFor(
        _ entries: [OfflineTalkOutboxEntry],
        lastError: String = ""
    ) -> OfflineTalkOutboxSnapshot {
        let latestError = lastError.trimmingCharacters(in: .whitespacesAndNewlines)
        return OfflineTalkOutboxSnapshot(
            pendingCount: entries.filter { $0.status == .pending }.count,
            inflightCount: entries.filter { $0.status == .inflight }.count,
            parkedCount: entries.filter { $0.status == .parked }.count,
            lastError: latestError.isEmpty
                ? entries.last(where: { ($0.lastError ?? "").isEmpty == false })?.lastError ?? ""
                : latestError
        )
    }

    private func publishSnapshot() {
        publish(snapshotFor(entries))
    }

    private func publish(_ snapshot: OfflineTalkOutboxSnapshot) {
        DispatchQueue.main.async {
            NotificationCenter.default.post(
                name: .themOfflineTalkOutboxUpdated,
                object: nil,
                userInfo: snapshot.notificationUserInfo
            )
        }
    }

    private func statusSortKey(_ status: OfflineTalkOutboxStatus) -> Int {
        switch status {
        case .inflight: return 0
        case .pending: return 1
        case .parked: return 2
        }
    }

    private func isRetryable(statusCode: Int) -> Bool {
        statusCode == -1 ||
            statusCode == 408 ||
            statusCode == 425 ||
            statusCode == 429 ||
            (500...599).contains(statusCode)
    }

    private func normalizedHeader(_ raw: String?) -> String? {
        let trimmed = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : String(trimmed.prefix(128))
    }

    private func normalizedReason(_ raw: String) -> String {
        let clean = raw
            .replacingOccurrences(of: "\n", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return String((clean.isEmpty ? "Queued for retry." : clean).prefix(280))
    }

    private func normalizedHeaders(
        _ headers: [String: String],
        idempotencyKey: String
    ) -> [String: String] {
        var normalized = headers.reduce(into: [String: String]()) { result, pair in
            let key = pair.key.trimmingCharacters(in: .whitespacesAndNewlines)
            let value = pair.value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !key.isEmpty, !value.isEmpty else { return }
            result[key] = value
        }
        normalized["X-Idempotency-Key"] = idempotencyKey
        return normalized
    }
}

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
        if !lastError.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "Queued turns could not be read. Retry in Data Controls; existing files have been preserved."
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
    private static let talkEndpoint = "/talk"
    private static let screenplayQuestionResolutionEndpoint = "/memory/screenplay-question/resolve"
    private static let supportedEndpoints: Set<String> = [
        talkEndpoint,
        screenplayQuestionResolutionEndpoint,
    ]

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

    /// Presentation and destructive recovery must use the current credential
    /// partition, not the device-wide manifest or a caller-supplied owner.
    func recoveryState() -> (ownerID: String, snapshot: OfflineTalkOutboxSnapshot, entries: [OfflineTalkOutboxEntry]) {
        let owner = currentOwnerID()
        var loadError = ""
        do { try loadIfNeeded() } catch { loadError = error.localizedDescription }
        let owned = entries.filter { entryOwnerID($0) == owner }
            .sorted { $0.createdAt < $1.createdAt }
        return (owner, snapshotFor(owned, lastError: loadError), owned)
    }

    private func currentOwnerID() -> String {
        BackendAuthClient.currentAuthSessionState().user?.userId
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    private func entryOwnerID(_ entry: OfflineTalkOutboxEntry) -> String {
        headerValue(named: "X-User-Id", in: entry.headers) ?? ""
    }

    func pendingScreenplayQuestionResolutionIDs() -> Set<String> {
        do {
            try loadIfNeeded()
        } catch {
            return []
        }
        return Set(entries.compactMap { entry in
            guard entry.endpoint == Self.screenplayQuestionResolutionEndpoint,
                  entry.status == .pending || entry.status == .inflight else {
                return nil
            }
            return headerValue(
                named: "X-Screenplay-Question-ID",
                in: entry.headers
            )
        })
    }

    func enqueue(
        request: URLRequest,
        body: Data,
        reason: String,
        requiresManualRetry: Bool = false
    ) throws -> OfflineTalkOutboxEnqueueResult {
        try loadIfNeeded()
        try ensureStorageExists()

        guard request.httpMethod?.uppercased() == "POST",
              let endpoint = request.url?.path,
              Self.supportedEndpoints.contains(endpoint) else {
            throw BackendError.stage("offline_outbox", "This action cannot be queued.")
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
            if requiresManualRetry {
                entries[existingIndex].status = .parked
                entries[existingIndex].nextAttemptAt = 0
            }
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
            endpoint: endpoint,
            method: "POST",
            urlString: urlString,
            headers: normalizedHeaders(request.allHTTPHeaderFields ?? [:], idempotencyKey: idempotencyKey),
            bodyRef: bodyRef,
            bodyByteCount: body.count,
            idempotencyKey: idempotencyKey,
            timeoutInterval: request.timeoutInterval > 0 ? request.timeoutInterval : 40,
            status: requiresManualRetry ? .parked : .pending,
            retries: 0,
            nextAttemptAt: requiresManualRetry ? 0 : now + Self.backoffSeconds[0],
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
        entryID: String? = nil,
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
                    && (entryID == nil || entry.id == entryID)
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

    /// Only a writer's explicit retry may reactivate a retained provider failure.
    /// Preserve the exact body/key and never drain a different pending turn here.
    func retryParkedEntry(id: String, now: Date = Date(), transport: Transport? = nil) async throws -> OfflineTalkOutboxSnapshot {
        try loadIfNeeded()
        guard let index = entries.firstIndex(where: { $0.id == id && $0.status == .parked }) else {
            return snapshotFor(entries)
        }
        _ = try replayRequest(for: entries[index]) // Validate owner and readable body before changing durable state.
        let previous = entries[index]
        entries[index].status = .pending
        entries[index].updatedAt = now.timeIntervalSince1970
        entries[index].nextAttemptAt = now.timeIntervalSince1970
        entries[index].lastError = nil
        do { try persist() } catch { entries[index] = previous; throw error }
        return await drainDue(now: now, limit: 1, entryID: id, transport: transport)
    }

    func deleteParkedEntries(expectedOwnerID: String? = nil, confirmedEntryIDs: Set<String>? = nil) throws -> OfflineTalkOutboxSnapshot {
        try loadIfNeeded()
        let owner = currentOwnerID()
        guard expectedOwnerID == nil || expectedOwnerID == owner else {
            throw BackendError.stage("offline_outbox", "Account changed. Review retained turns again before deleting.")
        }
        let parked = entries.filter {
            $0.status == .parked && entryOwnerID($0) == owner
                && (confirmedEntryIDs?.contains($0.id) ?? true)
        }
        let removedIDs = Set(parked.map(\.id))
        let previous = entries
        entries.removeAll { removedIDs.contains($0.id) }
        // Persist removal before deleting payloads; a failed manifest write
        // must leave both the live actor and original bytes recoverable.
        do { try persist() } catch { entries = previous; throw error }
        for entry in parked {
            try? fileManager.removeItem(at: blobURL(for: entry.bodyRef))
        }
        publishSnapshot()
        return recoveryState().snapshot
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
        let data: Data
        do {
            data = try Data(contentsOf: manifestURL)
        } catch {
            let failure = error as NSError
            if failure.domain == NSCocoaErrorDomain && failure.code == NSFileReadNoSuchFileError {
                didLoad = true
                return
            }
            throw BackendError.stage("offline_outbox", "Queued turns could not be read. Existing files have been preserved.")
        }
        guard let raw = String(data: data, encoding: .utf8) else {
            throw BackendError.stage("offline_outbox", "Queued turns could not be decoded. Existing files have been preserved.")
        }
        let decoder = JSONDecoder()
        let now = Date().timeIntervalSince1970
        var restored: [OfflineTalkOutboxEntry] = []
        for line in raw.split(separator: "\n") {
            guard !line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
            guard var entry = try? decoder.decode(OfflineTalkOutboxEntry.self, from: Data(line.utf8)) else {
                throw BackendError.stage("offline_outbox", "Queued turns could not be decoded. Existing files have been preserved.")
            }
            if entry.status == .inflight {
                entry.status = .pending
                entry.nextAttemptAt = min(entry.nextAttemptAt, now)
                entry.lastError = "Interrupted while sending."
            }
            restored.append(entry)
        }
        // Commit only after the entire manifest succeeds. A failed read or
        // decode must remain retryable and cannot authorize overwriting it.
        entries = restored
        didLoad = true
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
        let queuedUserID = headerValue(named: "X-User-Id", in: entry.headers) ?? ""
        let currentAuth = BackendAuthClient.currentAuthSessionState()
        let currentUserID = currentAuth.user?.userId
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !queuedUserID.isEmpty {
            guard !currentUserID.isEmpty, queuedUserID == currentUserID else {
                throw BackendError.stage(
                    "offline_outbox",
                    "Queued action belongs to a different signed-in account."
                )
            }
            if let authorization = BackendAuthClient.authorizationHeaderValue() {
                request.setValue(authorization, forHTTPHeaderField: "Authorization")
            }
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
        if BackendProviderFailurePolicy.isQuotaExhausted(
            statusCode: status,
            data: result.body
        ) {
            entries[index].status = .parked
            entries[index].updatedAt = now.timeIntervalSince1970
            entries[index].nextAttemptAt = 0
            entries[index].lastError = BackendProviderFailurePolicy.userMessage
            return
        }
        if isRetryable(statusCode: status, body: result.body) {
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

    private func isRetryable(statusCode: Int, body: Data) -> Bool {
        let retryableStatusCodes = Set([408, 425, 429] + Array(500...599))
        return statusCode == -1 || BackendProviderFailurePolicy.shouldRetryHTTP(
            statusCode: statusCode,
            data: body,
            retryableStatusCodes: retryableStatusCodes
        )
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

    private func headerValue(named name: String, in headers: [String: String]) -> String? {
        let match = headers.first { key, _ in
            key.caseInsensitiveCompare(name) == .orderedSame
        }?.value
        let normalized = match?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return normalized.isEmpty ? nil : normalized
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

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
    var ownerUserId: String?
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

nonisolated enum OfflineTalkOutboxAuthenticationRequest: Equatable, Sendable {
    case current
    case refreshExpired
    case refreshAfterRejection
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
    typealias AuthenticationProvider = @Sendable (
        OfflineTalkOutboxAuthenticationRequest,
        String
    ) async throws -> BackendRequestAuthentication

    static let shared = OfflineTalkOutbox(storageDirectory: defaultStorageDirectory())

    private static let maxBodyBytes = 25 * 1024 * 1024
    private static let backoffSeconds: [TimeInterval] = [5, 15, 60, 300, 1_800]
    private static let talkEndpoint = "/talk"
    private static let screenplayQuestionResolutionEndpoint = "/memory/screenplay-question/resolve"
    private static let supportedEndpoints: Set<String> = [
        talkEndpoint,
        screenplayQuestionResolutionEndpoint,
    ]
    private static let persistedHeaderNames: [String: String] = [
        "accept": "Accept",
        "content-type": "Content-Type",
        "x-idempotency-key": "X-Idempotency-Key",
        "x-persona-key": "X-Persona-Key",
        "x-screenplay-question-id": "X-Screenplay-Question-ID",
        "x-talk-stream": "X-Talk-Stream",
        "x-them-client-build": "X-Them-Client-Build",
        "x-them-client-name": "X-Them-Client-Name",
        "x-them-client-platform": "X-Them-Client-Platform",
        "x-them-client-version": "X-Them-Client-Version",
        "x-them-outbox-action": "X-Them-Outbox-Action",
    ]

    private let storageDirectory: URL
    private let manifestURL: URL
    private let blobsDirectory: URL
    private let fileManager: FileManager
    private let authenticationProvider: AuthenticationProvider?
    private var didLoad = false
    private var entries: [OfflineTalkOutboxEntry] = []
    private var networkMonitor: NWPathMonitor?
    private let networkMonitorQueue = DispatchQueue(label: "io.them.offline-talk-outbox.network")

    init(
        storageDirectory: URL,
        fileManager: FileManager = .default,
        authenticationProvider: AuthenticationProvider? = nil
    ) {
        self.storageDirectory = storageDirectory
        self.manifestURL = storageDirectory.appendingPathComponent("queue.jsonl")
        self.blobsDirectory = storageDirectory.appendingPathComponent("blobs", isDirectory: true)
        self.fileManager = fileManager
        self.authenticationProvider = authenticationProvider
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
        reason: String
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
        let ownerUserId = normalizedHeader(
            request.value(forHTTPHeaderField: "X-User-Id")
        )
        let entry = OfflineTalkOutboxEntry(
            id: id,
            createdAt: now,
            updatedAt: now,
            endpoint: endpoint,
            method: "POST",
            urlString: urlString,
            ownerUserId: ownerUserId,
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
                var requestAuthentication = try await authentication(
                    for: entry,
                    request: .current
                )
                var didRefreshAuthentication = false
                if requestAuthentication.hasKnownExpiredCredential {
                    requestAuthentication = try await authentication(
                        for: entry,
                        request: .refreshExpired
                    )
                    didRefreshAuthentication = true
                }
                var request = try replayRequest(
                    for: entry,
                    authentication: requestAuthentication
                )
                var result = try await sender(request)
                if isRefreshableAuthenticationFailure(result),
                   !didRefreshAuthentication {
                    requestAuthentication = try await authentication(
                        for: entry,
                        request: .refreshAfterRejection
                    )
                    request = try replayRequest(
                        for: entry,
                        authentication: requestAuthentication
                    )
                    result = try await sender(request)
                }
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
        entries = []
        guard fileManager.fileExists(atPath: manifestURL.path) else {
            didLoad = true
            return
        }

        do {
            let data = try Data(contentsOf: manifestURL)
            let raw = String(data: data, encoding: .utf8) ?? ""
            let decoder = JSONDecoder()
            let now = Date().timeIntervalSince1970
            var didSanitizeStoredEntries = false
            entries = raw
                .split(separator: "\n")
                .compactMap { line -> OfflineTalkOutboxEntry? in
                    guard let lineData = String(line).data(using: .utf8) else { return nil }
                    guard var entry = try? decoder.decode(OfflineTalkOutboxEntry.self, from: lineData) else {
                        return nil
                    }
                    let ownerUserId = normalizedHeader(entry.ownerUserId)
                        ?? normalizedHeader(headerValue(named: "X-User-Id", in: entry.headers))
                    let safeHeaders = normalizedHeaders(
                        entry.headers,
                        idempotencyKey: entry.idempotencyKey
                    )
                    if entry.ownerUserId != ownerUserId || entry.headers != safeHeaders {
                        entry.ownerUserId = ownerUserId
                        entry.headers = safeHeaders
                        didSanitizeStoredEntries = true
                    }
                    if entry.status == .inflight {
                        entry.status = .pending
                        entry.nextAttemptAt = min(entry.nextAttemptAt, now)
                        entry.lastError = "Interrupted while sending."
                    }
                    return entry
                }
            if didSanitizeStoredEntries {
                try persist()
            }
            didLoad = true
        } catch {
            entries = []
            throw error
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

    private func authentication(
        for entry: OfflineTalkOutboxEntry,
        request: OfflineTalkOutboxAuthenticationRequest
    ) async throws -> BackendRequestAuthentication {
        let queuedUserID = normalizedHeader(entry.ownerUserId) ?? ""
        let currentAuthentication: BackendRequestAuthentication
        if let authenticationProvider {
            currentAuthentication = try await authenticationProvider(request, queuedUserID)
        } else {
            currentAuthentication = try await Self.liveAuthentication(
                request,
                expectedUserID: queuedUserID
            )
        }
        try validateAuthentication(
            currentAuthentication,
            queuedUserID: queuedUserID
        )
        if request != .current,
           currentAuthentication.hasKnownExpiredCredential {
            throw BackendError.stage(
                "offline_outbox",
                "Current credentials are still expired after refresh."
            )
        }
        return currentAuthentication
    }

    private static func liveAuthentication(
        _ request: OfflineTalkOutboxAuthenticationRequest,
        expectedUserID: String
    ) async throws -> BackendRequestAuthentication {
        var authentication = BackendAuthClient.currentRequestAuthentication()
        try validateLiveAuthentication(
            authentication,
            expectedUserID: expectedUserID
        )
        guard request != .current else { return authentication }

        let authSession = BackendAuthClient.currentAuthSessionState()
        let refreshAccessToken: Bool
        let refreshClientToken: Bool
        switch request {
        case .current:
            refreshAccessToken = false
            refreshClientToken = false
        case .refreshExpired:
            refreshAccessToken = authentication.accessTokenExpired
            refreshClientToken = authentication.clientTokenExpired
        case .refreshAfterRejection:
            refreshAccessToken = !authentication.accessToken.isEmpty || authSession.refreshTokenPresent
            refreshClientToken = true
        }

        if refreshAccessToken {
            guard authSession.refreshTokenPresent else {
                throw BackendMemoryAPIError.server(
                    status: 401,
                    message: "refresh_token_required"
                )
            }
            _ = try await BackendAuthClient.refreshAuthSession(force: true)
            authentication = BackendAuthClient.currentRequestAuthentication()
            try validateLiveAuthentication(
                authentication,
                expectedUserID: expectedUserID
            )
        }

        if refreshClientToken {
            _ = try await BackendMemoryAPI.shared.bootstrapSession(force: true)
            authentication = BackendAuthClient.currentRequestAuthentication()
            try validateLiveAuthentication(
                authentication,
                expectedUserID: expectedUserID
            )
        }

        return authentication
    }

    private static func validateLiveAuthentication(
        _ authentication: BackendRequestAuthentication,
        expectedUserID: String
    ) throws {
        let currentUserID = authentication.userID
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if expectedUserID.isEmpty {
            guard currentUserID.isEmpty else {
                throw BackendError.stage(
                    "offline_outbox",
                    "Queued action has no account owner and cannot be replayed while signed in."
                )
            }
            return
        }
        guard currentUserID == expectedUserID else {
            throw BackendError.stage(
                "offline_outbox",
                "Queued action belongs to a different signed-in account."
            )
        }
    }

    private func validateAuthentication(
        _ authentication: BackendRequestAuthentication,
        queuedUserID: String
    ) throws {
        try Self.validateLiveAuthentication(
            authentication,
            expectedUserID: queuedUserID
        )
    }

    private func replayRequest(
        for entry: OfflineTalkOutboxEntry,
        authentication currentAuthentication: BackendRequestAuthentication
    ) throws -> URLRequest {
        guard let url = URL(string: entry.urlString) else {
            throw BackendError.stage("offline_outbox", "Queued talk request URL is invalid.")
        }
        let body = try Data(contentsOf: blobURL(for: entry.bodyRef))
        var request = URLRequest(url: url)
        request.httpMethod = entry.method
        request.timeoutInterval = entry.timeoutInterval
        request.httpShouldHandleCookies = false
        for (key, value) in entry.headers {
            request.setValue(value, forHTTPHeaderField: key)
        }
        let currentUserID = currentAuthentication.userID
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !currentUserID.isEmpty {
            request.setValue(currentUserID, forHTTPHeaderField: "X-User-Id")
        }
        let currentClientToken = currentAuthentication.clientToken
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !currentClientToken.isEmpty {
            request.setValue(currentClientToken, forHTTPHeaderField: "X-Client-Token")
        }
        let currentAppToken = currentAuthentication.appToken
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !currentAppToken.isEmpty {
            request.setValue(currentAppToken, forHTTPHeaderField: "X-APP-TOKEN")
        }
        let currentAccessToken = currentAuthentication.accessToken
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !currentAccessToken.isEmpty {
            request.setValue("Bearer \(currentAccessToken)", forHTTPHeaderField: "Authorization")
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

    private func isRefreshableAuthenticationFailure(
        _ result: OfflineTalkOutboxSendResult
    ) -> Bool {
        // Queue replay can safely give any rejected credential envelope one
        // canonical refresh attempt. The original body and idempotency key are
        // reused, so a lost success response cannot create a second action.
        result.statusCode == 401
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
            let key = pair.key
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            let value = pair.value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let persistedName = Self.persistedHeaderNames[key], !value.isEmpty else { return }
            result[persistedName] = value
        }
        normalized["X-Idempotency-Key"] = idempotencyKey
        return normalized
    }
}

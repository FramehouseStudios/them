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
    var recoveryScope: OfflineTalkRecoveryScope? = nil
    private enum CodingKeys: String, CodingKey { case pendingCount, inflightCount, parkedCount, lastError }

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
        lastError: String,
        recoveryScope: OfflineTalkRecoveryScope? = nil
    ) {
        self.pendingCount = pendingCount
        self.inflightCount = inflightCount
        self.parkedCount = parkedCount
        self.lastError = lastError
        self.recoveryScope = recoveryScope
    }

    init?(notification: Notification) {
        guard let scope = OfflineTalkRecoveryScope(notification: notification), scope.isCurrent else { return nil }
        recoveryScope = scope
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
    var interruptedEnqueue: Bool? = nil
    var receivedReply: Bool? = nil
    var canResumeInterruptedEnqueue: Bool { interruptedEnqueue == true && status == .parked && receivedReply != true }
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
    private let requestIdentityProvider: @Sendable (Bool) -> BackendAuthRequestIdentity
    private let backendURLProvider: @Sendable () -> URL
    private let authRefresher: @Sendable (ScreenplayStudioAuthContext) async throws -> BackendAuthSessionState
    private var drainingScope: OfflineTalkRecoveryScope?
    private var didLoad = false
    private var entries: [OfflineTalkOutboxEntry] = []
    private var hasUnassignedBodies = false
    private var networkMonitor: NWPathMonitor?
    private let networkMonitorQueue = DispatchQueue(label: "io.them.offline-talk-outbox.network")

    init(storageDirectory: URL, fileManager: FileManager = .default,
         requestIdentityProvider: @escaping @Sendable (Bool) -> BackendAuthRequestIdentity = {
             BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: $0)
         }, backendURLProvider: @escaping @Sendable () -> URL = { BackendAuthClient.resolvedBackendBaseURL() },
         authRefresher: @escaping @Sendable (ScreenplayStudioAuthContext) async throws -> BackendAuthSessionState = {
             try await BackendAuthClient.refreshAuthSession(force: true, expectedOwner: $0)
         }) {
        self.storageDirectory = storageDirectory
        self.manifestURL = storageDirectory.appendingPathComponent("queue.jsonl")
        self.blobsDirectory = storageDirectory.appendingPathComponent("blobs", isDirectory: true)
        self.fileManager = fileManager
        self.requestIdentityProvider = requestIdentityProvider
        self.backendURLProvider = backendURLProvider
        self.authRefresher = authRefresher
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

    #if DEBUG
    nonisolated static func resetStoredQueueForUITesting() {
        try? FileManager.default.removeItem(at: defaultStorageDirectory())
    }

    func installRecoveryUITestFixture() throws {
        guard IOThemRuntime.isRunningUITests,
              ProcessInfo.processInfo.arguments.contains("--ui-talk-recovery-fixture") else { return }
        try loadIfNeeded()
        guard entries.isEmpty else { return }
        let identity = requestIdentityProvider(true)
        guard !identity.userID.isEmpty else { return }
        let interrupt = ProcessInfo.processInfo.arguments.contains("--ui-talk-interrupted-enqueue-fixture")
        var interruptedID: String?
        for (id, user) in [("ui-owned-talk", identity.userID), ("ui-foreign-talk", "fixture-other-owner"), ("ui-legacy-talk", "")] {
            var request = URLRequest(url: backendURLProvider().appendingPathComponent("talk"))
            request.httpMethod = "POST"
            if !user.isEmpty { request.setValue(user, forHTTPHeaderField: "X-User-Id") }
            request.setValue("text/plain; charset=utf-8", forHTTPHeaderField: "Content-Type")
            let entry = try persistNewEntry(request: request, body: Data("Recovery \(id)\r\n \t ".utf8),
                idempotencyKey: id, status: interrupt && id == "ui-owned-talk" ? .pending : .parked,
                reason: "UI recovery fixture: \(id)")
            if id == "ui-owned-talk", ProcessInfo.processInfo.arguments.contains("--ui-talk-received-reply-fixture"),
               let index = entries.firstIndex(where: { $0.id == entry.id }) {
                retainReceivedReply(.init(statusCode: 200, headers: ["content-type": "audio/mpeg",
                    "x-reply": "A held fixture reply", "x-turn-id": "ui-received-turn",
                    "x-session-id": "fixture-not-exportable"], body: Data("ID3Received audio fixture".utf8)), at: index, now: Date())
            }
            if interrupt && id == "ui-owned-talk" { interruptedID = entry.id }
        }
        if let interruptedID {
            let remaining = entries.filter { $0.id != interruptedID }
            try persist(remaining)
            entries = remaining; didLoad = false
            try loadIfNeeded()
        }
        publishSnapshot()
    }
    #endif

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
            return []
        }
        return visibleEntries(scope: currentScope()).sorted { lhs, rhs in
            if lhs.status != rhs.status {
                return statusSortKey(lhs.status) < statusSortKey(rhs.status)
            }
            return lhs.createdAt < rhs.createdAt
        }
    }

    func recoveryState(
        initiatingIdentity owner: BackendAuthRequestIdentity,
        backendURL: URL
    ) throws -> OfflineTalkRecoveryState {
        try requireScope(owner, backendURL: backendURL)
        try loadIfNeeded()
        let scope = OfflineTalkRecoveryScope(identity: owner, backendURL: backendURL)
        let visible = visibleEntries(scope: scope)
        try requireScope(owner, backendURL: backendURL)
        return .init(scope: scope, snapshot: snapshotFor(visible, scope: scope), entries: visible,
                     hasUnassignedEntries: hasUnassignedBodies || entries.contains { headerValue(named: "X-User-Id", in: $0.headers) == nil })
    }

    func pendingScreenplayQuestionResolutionIDs() -> Set<String> {
        do {
            try loadIfNeeded()
        } catch {
            return []
        }
        return Set(visibleEntries(scope: currentScope()).compactMap { entry in
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
        initiatingIdentity owner: BackendAuthRequestIdentity? = nil
    ) throws -> OfflineTalkOutboxEnqueueResult {
        if let owner {
            try owner.requireCurrentOwner(requestIdentityProvider(false))
            guard normalizedHeader(request.value(forHTTPHeaderField: "X-User-Id")) == owner.userID else {
                throw BackendMemoryAPIError.server(status: 409, message: "auth_request_superseded")
            }
        }
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
        if let existingIndex = entries.firstIndex(where: {
            $0.idempotencyKey == idempotencyKey && sameRequestScope($0, request: request)
        }) {
            let existingBody = try storedBody(for: entries[existingIndex], allowReceived: true)
            if existingBody != body {
                if let kept = entries.first(where: { entry in
                    entry.status == .parked && entry.idempotencyKey == idempotencyKey && sameRequestScope(entry, request: request)
                        && (try? storedBody(for: entry, allowReceived: true)) == body
                }) { throw OfflineTalkPayloadConflictError(entryID: kept.id) }
                let kept = try persistNewEntry(request: request, body: body, idempotencyKey: idempotencyKey,
                    status: .parked, reason: "Different payload reused a request ID. This copy was kept and was not sent. Export before deleting.")
                publishSnapshot()
                throw OfflineTalkPayloadConflictError(entryID: kept.id)
            }
            guard belongs(entries[existingIndex], scope: currentScope()) else { throw OfflineTalkPreviousOwnerError() }
            if entries[existingIndex].receivedReply == true {
                return .init(entry: entries[existingIndex], snapshot: snapshotFor(entries))
            }
            entries[existingIndex].lastError = normalizedReason(reason)
            entries[existingIndex].updatedAt = Date().timeIntervalSince1970
            try persist()
            let nextSnapshot = snapshotFor(entries)
            publish(nextSnapshot)
            return OfflineTalkOutboxEnqueueResult(entry: entries[existingIndex], snapshot: nextSnapshot)
        }

        let entry = try persistNewEntry(request: request, body: body, idempotencyKey: idempotencyKey, status: .pending, reason: reason)
        let nextSnapshot = snapshotFor(entries)
        publish(nextSnapshot)
        if !belongs(entry, scope: currentScope()) { throw OfflineTalkPreviousOwnerError() }
        return OfflineTalkOutboxEnqueueResult(entry: entry, snapshot: nextSnapshot)
    }

    private func persistNewEntry(request: URLRequest, body: Data, idempotencyKey: String,
                                 status: OfflineTalkOutboxStatus, reason: String) throws -> OfflineTalkOutboxEntry {
        guard let url = request.url, OfflineTalkRecoveryScope.sameBackend(url, url),
              Self.supportedEndpoints.contains(url.path), body.count <= Self.maxBodyBytes,
              request.timeoutInterval.isFinite else {
            throw BackendError.stage("offline_outbox", "This request cannot be stored safely. Its recovery queue was not changed.")
        }
        let id = UUID().uuidString.lowercased()
        let bodyRef = "blob-\(id).turn"
        let now = Date().timeIntervalSince1970
        let entry = OfflineTalkOutboxEntry(
            id: id,
            createdAt: now,
            updatedAt: now,
            endpoint: url.path,
            method: "POST",
            urlString: url.absoluteString,
            headers: normalizedHeaders(request.allHTTPHeaderFields ?? [:], idempotencyKey: idempotencyKey),
            bodyRef: bodyRef,
            bodyByteCount: body.count,
            idempotencyKey: idempotencyKey,
            timeoutInterval: request.timeoutInterval > 0 ? request.timeoutInterval : 40,
            status: status,
            retries: 0,
            nextAttemptAt: status == .pending ? now + Self.backoffSeconds[0] : 0,
            lastError: normalizedReason(reason)
        )

        do {
            let encoded = try OfflineTalkStoredBody(entry: entry, body: body).encoded()
            guard encoded.count <= Self.maxBodyBytes + 1_048_576 else {
                throw BackendError.stage("offline_outbox", "Queued request metadata is too large.")
            }
            try writeProtectedData(encoded, to: blobURL(for: bodyRef))
            let next = entries + [entry]
            try persist(next)
            entries = next
        } catch {
            // The complete, owner-bound body may already be durable. Rescan
            // before another enqueue, not just after the next app launch.
            didLoad = false
            throw error
        }
        return entry
    }

    func resumeInterruptedEntry(_ id: String, initiatingIdentity owner: BackendAuthRequestIdentity,
                                backendURL: URL) throws -> OfflineTalkOutboxSnapshot {
        try requireScope(owner, backendURL: backendURL)
        try loadIfNeeded()
        guard let index = entries.firstIndex(where: { $0.id == id }),
              entries[index].canResumeInterruptedEnqueue,
              belongs(entries[index], scope: .init(identity: owner, backendURL: backendURL)) else {
            throw BackendError.stage("offline_outbox", "This interrupted request cannot be queued from the current account and backend.")
        }
        _ = try storedBody(for: entries[index])
        var next = entries
        next[index].status = .pending
        next[index].interruptedEnqueue = nil
        next[index].updatedAt = Date().timeIntervalSince1970
        next[index].nextAttemptAt = 0
        next[index].lastError = "Recovered request queued by you."
        try requireScope(owner, backendURL: backendURL)
        try persist(next)
        entries = next
        let snapshot = snapshotFor(entries)
        publish(snapshot)
        return snapshot
    }

    func receivedReply(_ id: String, initiatingIdentity owner: BackendAuthRequestIdentity,
                       backendURL: URL) throws -> OfflineTalkReceivedReply {
        try requireScope(owner, backendURL: backendURL)
        try loadIfNeeded()
        guard let entry = entries.first(where: { $0.id == id && $0.receivedReply == true }),
              belongs(entry, scope: .init(identity: owner, backendURL: backendURL)) else {
            throw BackendError.stage("offline_outbox", "This saved reply is unavailable in the current account and backend.")
        }
        let record = try readStoredRecord(blobURL(for: entry.bodyRef))
        _ = try record.validatedBody(matching: entry)
        guard record.state == .received, let response = record.response else { throw BackendMemoryAPIError.invalidResponse }
        try requireScope(owner, backendURL: backendURL)
        return .init(entry: entry, response: response, pageDelivery: record.pageDelivery)
    }

    func acknowledgeReceivedReply(_ id: String, receiptID: String, initiatingIdentity owner: BackendAuthRequestIdentity,
                                  backendURL: URL, deliveryPlanID: UUID? = nil) throws {
        let reply = try receivedReply(id, initiatingIdentity: owner, backendURL: backendURL)
        if let plan = reply.pageDelivery, plan.id != deliveryPlanID {
            throw BackendError.stage("offline_outbox", "This reply has a pending page delivery. Confirm its saved page before acknowledging it.")
        }
        guard reply.response.id == receiptID else {
            throw BackendError.stage("offline_outbox", "The saved reply changed. Reopen it before acknowledging delivery.")
        }
        try requireScope(owner, backendURL: backendURL)
        let remaining = entries.filter { $0.id != id }
        do { try settleStoredBody(reply.entry); try persist(remaining) }
        catch { didLoad = false; throw error }
        entries = remaining
        try? fileManager.removeItem(at: blobURL(for: reply.entry.bodyRef))
        publishSnapshot()
    }

    /// The audio receipt is committed before this optional GET. Never repeat
    /// generation to repair missing metadata, and never resurrect a deleted or
    /// acknowledged entry after an outstanding lookup returns.
    func captureReceivedTurnMetadata(_ id: String, initiatingIdentity owner: BackendAuthRequestIdentity,
        backendURL: URL, client: BackendClient? = nil) async throws -> OfflineTalkReceivedReply {
        let packet = try receivedReply(id, initiatingIdentity: owner, backendURL: backendURL)
        let advertised = packet.response.headers["x-turn-meta-available"]?.lowercased() ?? ""
        guard packet.pageDelivery == nil, packet.response.turnMetadata == nil, ["1", "true"].contains(advertised) else { return packet }
        let identity = requestIdentityProvider(false)
        try requireScope(owner, backendURL: backendURL)
        let api: BackendClient
        if let client { api = client }
        else { api = await BackendClient(baseURL: backendURL, fallbackURL: backendURL, persistBackendBaseURL: false) }
        let currentScope = OfflineTalkRecoveryScope(identity: identity, backendURL: backendURL)
        let provider = requestIdentityProvider, originProvider = backendURLProvider
        let metadata = try await api.captureReceivedTurnMetadata(packet, initiatingIdentity: identity, backendURL: backendURL,
            currentScopeProvider: { .init(identity: provider(false), backendURL: originProvider()) })
        try requireScope(owner, backendURL: backendURL)
        guard currentScope.matches(identity: requestIdentityProvider(false), backendURL: backendURLProvider()) else { throw OfflineTalkPreviousOwnerError() }
        let fresh = try receivedReply(id, initiatingIdentity: owner, backendURL: backendURL)
        if fresh.pageDelivery != nil || fresh.response.turnMetadata != nil { return fresh }
        guard fresh.response.id == packet.response.id else { throw BackendMemoryAPIError.invalidResponse }
        var record = try readStoredRecord(blobURL(for: fresh.entry.bodyRef))
        _ = try record.validatedBody(matching: fresh.entry)
        record.response = try fresh.response.retainingTurnMetadata(metadata)
        try writeProtectedData(record.encoded(), to: blobURL(for: fresh.entry.bodyRef))
        return try receivedReply(id, initiatingIdentity: owner, backendURL: backendURL)
    }

    func preparePageDelivery(_ id: String, receiptID: String, projectID: String, documentID: String?,
        beforeDraft: String, afterDraft: String, initiatingIdentity owner: BackendAuthRequestIdentity,
        backendURL: URL) throws -> OfflineTalkPageDeliveryPlan {
        let packet = try receivedReply(id, initiatingIdentity: owner, backendURL: backendURL)
        guard packet.response.id == receiptID else { throw BackendMemoryAPIError.invalidResponse }
        var record = try readStoredRecord(blobURL(for: packet.entry.bodyRef))
        let originalBody = try record.validatedBody(matching: packet.entry)
        if let originalProject = try offlineTalkRequestProjectID(body: originalBody, headers: packet.entry.headers),
           originalProject != projectID {
            throw BackendError.stage("offline_outbox", "This reply was requested for another project. Open that project to recover it; the reply is kept.")
        }
        if let existing = packet.pageDelivery {
            guard existing.projectID == projectID,
                  existing.documentID == nil || existing.documentID == documentID else { throw OfflineTalkPreviousOwnerError() }
            return existing
        }
        let plan = OfflineTalkPageDeliveryPlan(id: UUID(), receiptID: receiptID, projectID: projectID,
            documentID: documentID, beforeDraft: beforeDraft, afterDraft: afterDraft)
        try plan.validate(response: packet.response)
        record.version = 3; record.pageDelivery = plan
        record.pageDeliveryDigest = try plan.integrityDigest()
        try writeProtectedData(record.encoded(), to: blobURL(for: packet.entry.bodyRef))
        return plan
    }

    @discardableResult
    func drainDue(
        now: Date = Date(),
        limit: Int = 6,
        initiatingIdentity owner: BackendAuthRequestIdentity = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: true),
        backendURL: URL = BackendAuthClient.resolvedBackendBaseURL(),
        transport: Transport? = nil
    ) async -> OfflineTalkOutboxSnapshot {
        let scope = OfflineTalkRecoveryScope(identity: owner, backendURL: backendURL)
        guard (try? requireScope(owner, backendURL: backendURL)) != nil else { return .empty }
        guard drainingScope == nil else { return snapshotFor(entries) }
        drainingScope = scope
        defer { drainingScope = nil }
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
              scope.matches(identity: requestIdentityProvider(false), backendURL: backendURLProvider()),
              !requestIdentityProvider(false).accessToken.isEmpty,
              let index = entries.firstIndex(where: { entry in
                  entry.status == .pending && entry.nextAttemptAt <= nowSeconds && belongs(entry, scope: scope)
              }) {
            sentCount += 1
            entries[index].status = .inflight
            entries[index].updatedAt = nowSeconds
            do { try persist() }
            catch {
                entries[index].status = .pending
                let failed = snapshotFor(entries, lastError: "Queued work could not be saved for sending. Its files were kept.")
                publish(failed)
                return failed
            }
            publishSnapshot()

            let entry = entries[index]
            do {
                let request = try replayRequest(for: entry, owner: owner, backendURL: backendURL)
                var result = try await sender(request)
                if result.statusCode == 401 {
                    try requireScope(owner, backendURL: backendURL)
                    let refreshed = try await authRefresher(owner.ownerContext)
                    try requireScope(owner, backendURL: backendURL)
                    if refreshed.isAuthenticated {
                        result = try await sender(replayRequest(for: entry, owner: owner, backendURL: backendURL))
                    }
                }
                try handleSendResult(result, forEntryID: entry.id, now: now)
                if transport == nil, entry.endpoint == Self.talkEndpoint, result.statusCode == 200 {
                    _ = try? await captureReceivedTurnMetadata(entry.id, initiatingIdentity: owner, backendURL: backendURL)
                }
            } catch {
                if !scope.matches(identity: requestIdentityProvider(false), backendURL: backendURLProvider()) {
                    if let retained = entries.firstIndex(where: { $0.id == entry.id }) { entries[retained].status = .pending }
                    try? persist()
                    break
                }
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

    func deleteParkedEntries(confirmedEntryIDs: Set<String>, initiatingIdentity owner: BackendAuthRequestIdentity,
                             backendURL: URL) throws -> OfflineTalkOutboxSnapshot {
        try requireScope(owner, backendURL: backendURL)
        try loadIfNeeded()
        let scope = OfflineTalkRecoveryScope(identity: owner, backendURL: backendURL)
        let eligible = Set(visibleEntries(scope: scope).filter { $0.status == .parked }.map(\.id))
        guard !confirmedEntryIDs.isEmpty, confirmedEntryIDs.isSubset(of: eligible) else {
            throw BackendError.stage("offline_outbox", "Queued recovery changed. Review the current entries before deleting.")
        }
        let parked = entries.filter { confirmedEntryIDs.contains($0.id) }
        let remaining = entries.filter { !confirmedEntryIDs.contains($0.id) }
        try requireScope(owner, backendURL: backendURL)
        do {
            for entry in parked { try settleStoredBody(entry) }
            try persist(remaining)
        } catch {
            if parked.contains(where: { $0.bodyRef.hasSuffix(".turn") }) { didLoad = false }
            throw error
        }
        entries = remaining
        for entry in parked {
            try? fileManager.removeItem(at: blobURL(for: entry.bodyRef))
        }
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
        let (data, response) = try await URLSession.shared.data(for: request, delegate: BackendHTTPRedirectGuard.shared)
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
        let data = fileManager.fileExists(atPath: manifestURL.path) ? try Data(contentsOf: manifestURL) : Data()
        guard let raw = String(data: data, encoding: .utf8) else {
            throw BackendError.stage("offline_outbox", "Recovery files could not be read. They were kept unchanged.")
        }
        let decoder = JSONDecoder()
        let now = Date().timeIntervalSince1970
        let loaded = try raw
            .split(separator: "\n")
            .map { line -> OfflineTalkOutboxEntry in
                guard let lineData = String(line).data(using: .utf8),
                      var entry = try? decoder.decode(OfflineTalkOutboxEntry.self, from: lineData),
                      entry.method == "POST", Self.supportedEndpoints.contains(entry.endpoint),
                      let url = URL(string: entry.urlString), url.path == entry.endpoint,
                      entry.bodyRef.hasPrefix("blob-"), (entry.bodyRef.hasSuffix(".multipart") || entry.bodyRef.hasSuffix(".turn")),
                      !entry.bodyRef.contains("/"), !entry.bodyRef.contains("\\"), !entry.bodyRef.contains("..") else {
                    throw BackendError.stage("offline_outbox", "Recovery files need repair. They were kept unchanged.")
                }
                if entry.status == .inflight {
                    entry.status = .pending
                    entry.nextAttemptAt = min(entry.nextAttemptAt, now)
                    entry.lastError = "Interrupted while sending."
                }
                return entry
            }
        guard Set(loaded.map(\.id)).count == loaded.count, Set(loaded.map(\.bodyRef)).count == loaded.count else {
            throw BackendError.stage("offline_outbox", "Recovery identifiers need repair. All files were kept unchanged.")
        }
        let reconciled = try reconcileStoredBodies(loaded)
        if reconciled.entries != loaded { try persist(reconciled.entries) }
        entries = reconciled.entries
        hasUnassignedBodies = reconciled.unassigned
        didLoad = true
        // A durable settled record is safe even if this best-effort unlink
        // fails. It can never become a newly recovered request.
        for url in reconciled.settled { try? fileManager.removeItem(at: url) }
    }

    private func reconcileStoredBodies(_ loaded: [OfflineTalkOutboxEntry]) throws
        -> (entries: [OfflineTalkOutboxEntry], unassigned: Bool, settled: [URL]) {
        guard fileManager.fileExists(atPath: blobsDirectory.path) else {
            guard !loaded.contains(where: { $0.bodyRef.hasSuffix(".turn") }) else {
                throw BackendError.stage("offline_outbox", "Queued body files are missing. The manifest was kept.")
            }
            return (loaded, false, [])
        }
        let files = try fileManager.contentsOfDirectory(at: blobsDirectory,
            includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey], options: [.skipsHiddenFiles])
        var next = loaded, unassigned = false, settled: [URL] = [], seen = Set<String>()
        let indexed = Set(loaded.map(\.bodyRef))
        for url in files {
            if url.lastPathComponent.hasSuffix(".multipart"), !indexed.contains(url.lastPathComponent) { unassigned = true; continue }
            guard url.lastPathComponent.hasSuffix(".turn") else { continue }
            let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            guard values.isRegularFile == true, values.isSymbolicLink != true else {
                throw BackendError.stage("offline_outbox", "Queued body files need repair. They were kept unchanged.")
            }
            let record = try readStoredRecord(url)
            let entry = record.entry
            let bodyID = String(url.deletingPathExtension().lastPathComponent.dropFirst(5))
            guard record.body.count <= Self.maxBodyBytes, !entry.id.isEmpty, UUID(uuidString: bodyID) != nil,
                  entry.bodyRef == url.lastPathComponent, entry.bodyRef.hasPrefix("blob-"), entry.method == "POST",
                  Self.supportedEndpoints.contains(entry.endpoint), let requestURL = URL(string: entry.urlString),
                  requestURL.path == entry.endpoint, OfflineTalkRecoveryScope.sameBackend(requestURL, requestURL),
                  !entry.idempotencyKey.isEmpty else {
                throw BackendError.stage("offline_outbox", "Queued request identity needs repair. All files were kept.")
            }
            let row = loaded.first { $0.id == entry.id }
            let migratingLegacy = row?.bodyRef.hasSuffix(".multipart") == true && record.response != nil
            _ = try record.validatedBody(matching: row, migratingLegacyReference: migratingLegacy)
            guard row != nil || !indexed.contains(entry.bodyRef) else {
                throw BackendError.stage("offline_outbox", "Queued body references disagree. All files were kept.")
            }
            seen.insert(entry.bodyRef)
            if record.state == .settled {
                next.removeAll { $0.id == entry.id }
                settled.append(url)
            } else if record.state == .received {
                guard headerValue(named: "X-User-Id", in: entry.headers) != nil else { unassigned = true; continue }
                var recovered = row ?? entry
                recovered.bodyRef = entry.bodyRef; recovered.bodyByteCount = entry.bodyByteCount
                recovered.status = .parked; recovered.receivedReply = true; recovered.interruptedEnqueue = nil
                recovered.lastError = receivedReplyMessage(record.response)
                if let index = next.firstIndex(where: { $0.id == entry.id }) { next[index] = recovered }
                else { next.append(recovered) }
            } else if row == nil {
                guard headerValue(named: "X-User-Id", in: entry.headers) != nil else { unassigned = true; continue }
                var recovered = entry
                recovered.status = .parked
                if entry.status == .pending {
                    recovered.interruptedEnqueue = true
                    recovered.lastError = "Interrupted before queue setup finished. Export or review this request before sending."
                }
                next.append(recovered)
            }
        }
        guard loaded.filter({ $0.bodyRef.hasSuffix(".turn") }).allSatisfy({ seen.contains($0.bodyRef) }) else {
            throw BackendError.stage("offline_outbox", "Queued body files are missing. All remaining files were kept.")
        }
        next.sort { $0.createdAt == $1.createdAt ? $0.id < $1.id : $0.createdAt < $1.createdAt }
        return (next, unassigned, settled)
    }

    private func readStoredRecord(_ url: URL) throws -> OfflineTalkStoredBody {
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size <= Self.maxBodyBytes + OfflineTalkStoredResponse.maxBodyBytes + 7_340_032 else {
            throw BackendError.stage("offline_outbox", "Queued body exceeds the recovery limit. Its file was kept.")
        }
        return try PropertyListDecoder().decode(OfflineTalkStoredBody.self, from: Data(contentsOf: url))
    }

    private func storedBody(for entry: OfflineTalkOutboxEntry, allowReceived: Bool = false) throws -> Data {
        guard entry.bodyRef.hasSuffix(".turn") else { return try Data(contentsOf: blobURL(for: entry.bodyRef)) }
        let record = try readStoredRecord(blobURL(for: entry.bodyRef))
        guard record.state == .ready || (allowReceived && record.state == .received) else {
            didLoad = false
            throw BackendError.stage("offline_outbox", "This request has already settled. Refresh recovery before retrying.")
        }
        return try record.validatedBody(matching: entry)
    }

    private func settleStoredBody(_ entry: OfflineTalkOutboxEntry) throws {
        guard entry.bodyRef.hasSuffix(".turn") else { return }
        let url = blobURL(for: entry.bodyRef)
        var record = try readStoredRecord(url)
        _ = try record.validatedBody(matching: entry)
        record.state = .settled
        try writeProtectedData(record.encoded(), to: url)
    }

    private func persist(_ nextEntries: [OfflineTalkOutboxEntry]? = nil) throws {
        try ensureStorageExists()
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        var data = Data()
        for entry in nextEntries ?? entries {
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

    private func replayRequest(for entry: OfflineTalkOutboxEntry, owner: BackendAuthRequestIdentity,
                               backendURL: URL) throws -> URLRequest {
        try requireScope(owner, backendURL: backendURL)
        let identity = requestIdentityProvider(false)
        try owner.requireCurrentOwner(identity)
        guard belongs(entry, scope: .init(identity: identity, backendURL: backendURL)), !identity.accessToken.isEmpty else {
            throw BackendError.stage("offline_outbox", "Sign in to the account and backend that owns this queued turn.")
        }
        guard let url = URL(string: entry.urlString) else {
            throw BackendError.stage("offline_outbox", "Queued talk request URL is invalid.")
        }
        let body = try storedBody(for: entry)
        var request = URLRequest(url: url)
        request.httpMethod = entry.method
        request.timeoutInterval = entry.timeoutInterval
        for (key, value) in entry.headers {
            request.setValue(value, forHTTPHeaderField: key)
        }
        request.setValue(entry.idempotencyKey, forHTTPHeaderField: "X-Idempotency-Key")
        request.setValue(identity.userID, forHTTPHeaderField: "X-User-Id")
        request.setValue("Bearer \(identity.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(identity.clientToken.isEmpty ? nil : identity.clientToken, forHTTPHeaderField: "X-Client-Token")
        request.httpBody = body
        try requireScope(owner, backendURL: backendURL)
        return request
    }

    func exportRecoveryEntry(_ id: String, initiatingIdentity owner: BackendAuthRequestIdentity,
                             backendURL: URL) throws -> OfflineTalkRecoveryArtifact {
        try requireScope(owner, backendURL: backendURL)
        try loadIfNeeded()
        guard let entry = entries.first(where: { $0.id == id && belongs($0, scope: .init(identity: owner, backendURL: backendURL)) }) else {
            throw BackendError.stage("offline_outbox", "This queued turn is not available in the current account and backend.")
        }
        let body = try storedBody(for: entry, allowReceived: true)
        var payload: [String: Any] = [
            "format": "them-queued-turn-recovery", "version": 1, "entry_id": entry.id,
            "endpoint": entry.endpoint, "created_at": entry.createdAt, "status": entry.status.rawValue,
            "content_type": headerValue(named: "Content-Type", in: entry.headers) ?? "application/octet-stream",
            "body_base64": body.base64EncodedString()
        ]
        if entry.receivedReply == true {
            let packet = try receivedReply(id, initiatingIdentity: owner, backendURL: backendURL)
            payload["response"] = packet.response.exportPayload
            if let plan = packet.pageDelivery { payload["page_delivery"] = try JSONSerialization.jsonObject(with: JSONEncoder().encode(plan)) }
        }
        let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys, .prettyPrinted])
        try requireScope(owner, backendURL: backendURL)
        return .init(filename: "them-queued-turn-\(UUID().uuidString.lowercased()).json", data: data)
    }


    private func handleSendResult(
        _ result: OfflineTalkOutboxSendResult,
        forEntryID entryID: String,
        now: Date
    ) throws {
        guard let index = entries.firstIndex(where: { $0.id == entryID }) else { return }
        let status = result.statusCode
        if (200...299).contains(status) {
            let entry = entries[index]
            if entry.endpoint == Self.talkEndpoint {
                retainReceivedReply(result, at: index, now: now)
                return
            }
            let remaining = entries.filter { $0.id != entryID }
            do {
                try settleStoredBody(entry)
                try persist(remaining)
            } catch {
                if entry.bodyRef.hasSuffix(".turn") { didLoad = false }
                throw error
            }
            entries = remaining
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

    private func receivedReplyMessage(_ response: OfflineTalkStoredResponse?) -> String {
        response?.bodyOmitted == true
            ? "Reply received. Audio exceeded the local recovery limit; reply metadata is kept. Export this result."
            : "Reply received and kept on this device. Export includes the response; app delivery is still pending."
    }

    private func retainReceivedReply(_ result: OfflineTalkOutboxSendResult, at index: Int, now: Date) {
        let original = entries[index]
        var responseStored = false
        do {
            let body = try storedBody(for: original)
            var entry = original
            if entry.bodyRef.hasSuffix(".multipart") { entry.bodyRef = "blob-\(UUID().uuidString.lowercased()).turn" }
            entry.bodyByteCount = body.count
            var record = OfflineTalkStoredBody(entry: entry, body: body)
            record.version = 2; record.state = .received
            record.response = try OfflineTalkStoredResponse(result)
            try writeProtectedData(record.encoded(), to: blobURL(for: entry.bodyRef))
            responseStored = true
            entry.status = .parked; entry.receivedReply = true; entry.interruptedEnqueue = nil
            entry.updatedAt = now.timeIntervalSince1970; entry.nextAttemptAt = 0
            entry.lastError = receivedReplyMessage(record.response)
            entries[index] = entry
            try persist()
            if original.bodyRef != entry.bodyRef { try? fileManager.removeItem(at: blobURL(for: original.bodyRef)) }
        } catch {
            // A known HTTP success is not a retryable generation failure.
            // Keep it held even if local response/index persistence failed.
            entries[index].status = .parked; entries[index].nextAttemptAt = 0
            if !responseStored {
                entries[index].lastError = "The server replied, but this device could not keep its response. The request is held to avoid another generation."
            }
            try? persist()
            didLoad = false
        }
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
        scope explicitScope: OfflineTalkRecoveryScope? = nil,
        lastError: String = ""
    ) -> OfflineTalkOutboxSnapshot {
        let scope = explicitScope ?? currentScope()
        let visible = entries.filter { belongs($0, scope: scope) }
        let latestError = lastError.trimmingCharacters(in: .whitespacesAndNewlines)
        return OfflineTalkOutboxSnapshot(
            pendingCount: visible.filter { $0.status == .pending }.count,
            inflightCount: visible.filter { $0.status == .inflight }.count,
            parkedCount: visible.filter { $0.status == .parked }.count,
            lastError: latestError.isEmpty
                ? visible.last(where: { ($0.lastError ?? "").isEmpty == false })?.lastError ?? ""
                : latestError,
            recoveryScope: scope
        )
    }

    private func publishSnapshot() {
        publish(snapshotFor(entries))
    }

    private func publish(_ snapshot: OfflineTalkOutboxSnapshot) {
        let identityProvider = requestIdentityProvider, urlProvider = backendURLProvider
        let identity = identityProvider(false)
        let scope = snapshot.recoveryScope ?? currentScope()
        guard scope.matches(identity: identity, backendURL: urlProvider()) else { return }
        let fields = snapshot.notificationUserInfo.merging(scope.notificationFields) { _, new in new }
        postBackendNotificationOnMain(name: .themOfflineTalkOutboxUpdated, userInfo: fields,
            initiatingIdentity: identity.userID.isEmpty ? nil : identity, identityProvider: identityProvider,
            deliveryCondition: { scope.matches(identity: identityProvider(false), backendURL: urlProvider()) })
    }

    private func currentScope() -> OfflineTalkRecoveryScope {
        .init(identity: requestIdentityProvider(false), backendURL: backendURLProvider())
    }

    private func belongs(_ entry: OfflineTalkOutboxEntry, scope: OfflineTalkRecoveryScope) -> Bool {
        guard !scope.owner.userID.isEmpty, headerValue(named: "X-User-Id", in: entry.headers) == scope.owner.userID,
              let url = URL(string: entry.urlString) else { return false }
        return OfflineTalkRecoveryScope.sameBackend(url, scope.backendURL)
    }

    private func visibleEntries(scope: OfflineTalkRecoveryScope) -> [OfflineTalkOutboxEntry] {
        entries.filter { belongs($0, scope: scope) }
    }

    private func requireScope(_ owner: BackendAuthRequestIdentity, backendURL: URL) throws {
        try owner.requireCurrentOwner(requestIdentityProvider(false))
        guard OfflineTalkRecoveryScope.sameBackend(backendURL, backendURLProvider()) else {
            throw BackendMemoryAPIError.server(status: 409, message: "auth_request_superseded")
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

    private func sameRequestScope(_ entry: OfflineTalkOutboxEntry, request: URLRequest) -> Bool {
        let incoming = request.allHTTPHeaderFields ?? [:]
        guard entry.urlString == request.url?.absoluteString,
              entry.method == request.httpMethod?.uppercased(),
              headerValue(named: "X-User-Id", in: entry.headers) == headerValue(named: "X-User-Id", in: incoming) else { return false }
        if headerValue(named: "X-User-Id", in: incoming) != nil { return true }
        let client = headerValue(named: "X-Client-Token", in: incoming)
        return client == headerValue(named: "X-Client-Token", in: entry.headers) &&
            (client != nil || headerValue(named: "Authorization", in: incoming) == headerValue(named: "Authorization", in: entry.headers))
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

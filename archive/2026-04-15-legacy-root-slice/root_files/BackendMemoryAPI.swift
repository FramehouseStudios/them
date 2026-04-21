import Foundation

nonisolated extension Notification.Name {
    static let themTurnCommitted = Notification.Name("io.them.them.turnCommitted")
    static let themBackendSyncUpdated = Notification.Name("io.them.them.backendSyncUpdated")
}

nonisolated struct BackendSyncState: Equatable {
    var status: String
    var sessionId: String
    var schemaVersion: Int
    var backendBuild: String
    var backendBootId: String
    var lastTurnId: String
    var lastUpdatedAt: TimeInterval
    var historyUpdatedAt: TimeInterval
    var memoryUpdatedAt: TimeInterval
    var stateVersion: String

    static let empty = BackendSyncState(
        status: "unknown",
        sessionId: "",
        schemaVersion: 0,
        backendBuild: "",
        backendBootId: "",
        lastTurnId: "",
        lastUpdatedAt: 0,
        historyUpdatedAt: 0,
        memoryUpdatedAt: 0,
        stateVersion: ""
    )
}

nonisolated struct BackendTurnCommittedEvent {
    let source: String
    let turnId: String
    let sessionId: String
    let stateVersion: String
    let lastUpdatedAt: TimeInterval
    let historyUpdatedAt: TimeInterval
    let memoryUpdatedAt: TimeInterval
    let userMessage: String?
    let assistantMessage: String?

    init?(notification: Notification) {
        guard let userInfo = notification.userInfo else { return nil }
        let source = String(describing: userInfo[BackendMemoryAPI.NotificationKey.source] ?? "")
        let turnId = String(describing: userInfo[BackendMemoryAPI.NotificationKey.turnId] ?? "")
        if source.isEmpty || turnId.isEmpty { return nil }
        self.source = source
        self.turnId = turnId
        self.sessionId = String(describing: userInfo[BackendMemoryAPI.NotificationKey.sessionId] ?? "")
        self.stateVersion = String(describing: userInfo[BackendMemoryAPI.NotificationKey.stateVersion] ?? "")
        self.lastUpdatedAt = Double(String(describing: userInfo[BackendMemoryAPI.NotificationKey.lastUpdatedAt] ?? "")) ?? 0
        self.historyUpdatedAt = Double(String(describing: userInfo[BackendMemoryAPI.NotificationKey.historyUpdatedAt] ?? "")) ?? 0
        self.memoryUpdatedAt = Double(String(describing: userInfo[BackendMemoryAPI.NotificationKey.memoryUpdatedAt] ?? "")) ?? 0
        self.userMessage = userInfo[BackendMemoryAPI.NotificationKey.userMessage] as? String
        self.assistantMessage = userInfo[BackendMemoryAPI.NotificationKey.assistantMessage] as? String
    }
}

nonisolated struct BackendReadResult<Payload> {
    let payload: Payload
    let sync: BackendSyncState
    let notModified: Bool
}

nonisolated struct BackendRememberedName: Decodable, Hashable {
    let name: String
    let relation: String
}

nonisolated struct BackendHistoryThread: Decodable, Hashable, Identifiable {
    let id: String
    let turn: Int
    let title: String
    let preview: String
    let user: String
    let assistant: String
    let updatedAt: TimeInterval
}

nonisolated struct BackendHistoryResponse: Decodable {
    let source: String
    let sourceIp: String
    let assistantName: String?
    let userName: String?
    let rememberedNames: [BackendRememberedName]
    let conversationCount: Int
    let lastConversationRecap: String?
    let lastConversationAt: TimeInterval?
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
    let threads: [BackendHistoryThread]
}

nonisolated struct BackendMemoryCard: Decodable, Hashable, Identifiable {
    let id: String
    let key: String
    let title: String
    let summary: String
    let emotionalTone: String
    let salience: Double
    let confidence: Double
    let rememberedAt: TimeInterval
    let snippets: [String]
    let referenceHint: String
    let source: String
}

nonisolated struct BackendMemoriesResponse: Decodable {
    let source: String
    let sourceIp: String
    let assistantName: String?
    let userName: String?
    let relationshipDepthScore: Double?
    let behaviorMode: String?
    let cycleIndex: Int?
    let season: Int?
    let seasonProgress: Double?
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
    let memories: [BackendMemoryCard]
    let conversationSamples: [BackendHistoryThread]
}

nonisolated struct BackendSessionResponse: Decodable {
    let clientToken: String
    let sessionId: String?
    let expiresIn: Int
    let assistantName: String?
    let assistantSelfName: String?
    let userName: String?
    let rememberedNames: [BackendRememberedName]
    let lastConversationRecap: String?
    let lastConversationSnapshot: String?
    let lastConversationAt: TimeInterval?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
}

nonisolated struct BackendHealthStatus {
    let ok: Bool
    let status: String
    let raw: String
    let sessionId: String
    let schemaVersion: Int
    let backendBuild: String
    let backendBootId: String
    let lastTurnId: String
    let lastUpdatedAt: TimeInterval
    let historyUpdatedAt: TimeInterval
    let memoryUpdatedAt: TimeInterval
    let stateVersion: String
}

nonisolated enum BackendMemoryAPIError: LocalizedError {
    case invalidBaseURL
    case invalidResponse
    case server(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidBaseURL:
            return "Invalid backend base URL."
        case .invalidResponse:
            return "Backend returned an invalid response."
        case .server(let status, let message):
            return "Backend error \(status): \(message)"
        }
    }
}

actor BackendMemoryAPI {
    static let shared = BackendMemoryAPI()

    enum NotificationKey {
        static let source = "source"
        static let turnId = "turn_id"
        static let sessionId = "session_id"
        static let stateVersion = "state_version"
        static let lastUpdatedAt = "last_updated_at"
        static let historyUpdatedAt = "history_updated_at"
        static let memoryUpdatedAt = "memory_updated_at"
        static let userMessage = "user_message"
        static let assistantMessage = "assistant_message"
        static let status = "status"
        static let schemaVersion = "schema_version"
        static let backendBuild = "backend_build"
        static let backendBootId = "backend_boot_id"
        static let lastTurnId = "last_turn_id"
    }

    enum DefaultsKey {
        static let baseURL = "backend_base_url"
        static let appToken = "app_token"
        static let clientToken = "client_token"
        static let assistantName = "assistant_self_name"
        static let userName = "user_primary_name"
    }

    private struct HistoryCacheEntry {
        let etag: String
        let payload: BackendHistoryResponse
        let sync: BackendSyncState
    }

    private struct MemoriesCacheEntry {
        let etag: String
        let payload: BackendMemoriesResponse
        let sync: BackendSyncState
    }

    private struct HealthPayload: Decodable {
        let ok: Bool?
        let status: String?
        let sessionId: String?
        let schemaVersion: Int?
        let backendBuild: String?
        let backendBootId: String?
        let lastTurnId: String?
        let lastUpdatedAt: TimeInterval?
        let historyUpdatedAt: TimeInterval?
        let memoryUpdatedAt: TimeInterval?
        let stateVersion: String?
    }

    private let devFallbackAppToken = "them-dev"
    private let session: URLSession
    private var cachedSession: BackendSessionResponse?
    private var cachedSessionAt: Date?
    private var syncState: BackendSyncState = .empty
    private var historyCacheByLimit: [Int: HistoryCacheEntry] = [:]
    private var memoriesCacheByLimit: [Int: MemoriesCacheEntry] = [:]

    init(session: URLSession = .shared) {
        self.session = session
    }

    func currentSyncState() -> BackendSyncState {
        syncState
    }

    func bootstrapSession(force: Bool = false) async throws -> BackendSessionResponse {
        if !force,
           let cachedSession,
           let cachedSessionAt,
           Date().timeIntervalSince(cachedSessionAt) < 90 {
            return cachedSession
        }
        var request = try makeRequest(path: "/session")
        request.httpMethod = "POST"
        let payload = try await run(request, as: BackendSessionResponse.self)
        cacheSession(payload)
        updateSyncState(syncFromSession(payload), emitTurnEvent: false)
        return payload
    }

    func fetchHealth() async throws -> BackendHealthStatus {
        do {
            return try await fetchHealth(path: "/bridge")
        } catch {
            return try await fetchHealth(path: "/health")
        }
    }

    private func fetchHealth(path: String) async throws -> BackendHealthStatus {
        let request = try makeRequest(path: path)
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        let raw = String(data: data, encoding: .utf8) ?? ""
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let payload = try? decoder.decode(HealthPayload.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: (200...299).contains(http.statusCode) ? "up" : "down")
        let payloadSync = syncFromHealthPayload(payload, ok: (200...299).contains(http.statusCode))
        let incomingSync = mergeSyncStates(base: payloadSync, incoming: headerSync)
        updateSyncState(incomingSync, emitTurnEvent: false)
        let latest = syncState
        let healthStatus = payload?.status?.trimmingCharacters(in: .whitespacesAndNewlines)
        return BackendHealthStatus(
            ok: (200...299).contains(http.statusCode),
            status: healthStatus?.isEmpty == false ? healthStatus! : latest.status,
            raw: raw,
            sessionId: latest.sessionId,
            schemaVersion: latest.schemaVersion,
            backendBuild: latest.backendBuild,
            backendBootId: latest.backendBootId,
            lastTurnId: latest.lastTurnId,
            lastUpdatedAt: latest.lastUpdatedAt,
            historyUpdatedAt: latest.historyUpdatedAt,
            memoryUpdatedAt: latest.memoryUpdatedAt,
            stateVersion: latest.stateVersion
        )
    }

    func fetchHistory(limit: Int = 120, force: Bool = false) async throws -> BackendReadResult<BackendHistoryResponse> {
        _ = try? await bootstrapSession(force: false)
        var request = try makeRequest(path: "/history", limit: limit)
        if !force, let cached = historyCacheByLimit[limit], !cached.etag.isEmpty {
            request.setValue(cached.etag, forHTTPHeaderField: "If-None-Match")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }

        if http.statusCode == 304, let cached = historyCacheByLimit[limit] {
            let headerSync = syncFromHeaders(http, fallbackStatus: "up")
            let incoming = mergeSyncStates(base: cached.sync, incoming: headerSync)
            updateSyncState(incoming, emitTurnEvent: false)
            return BackendReadResult(payload: cached.payload, sync: syncState, notModified: true)
        }

        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let payload = try decoder.decode(BackendHistoryResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromHistoryPayload(payload)
        let incoming = mergeSyncStates(base: bodySync, incoming: headerSync)
        updateSyncState(incoming, emitTurnEvent: true)
        let etag = normalizedEtag(from: http, fallbackStateVersion: syncState.stateVersion)
        historyCacheByLimit[limit] = HistoryCacheEntry(etag: etag, payload: payload, sync: syncState)
        return BackendReadResult(payload: payload, sync: syncState, notModified: false)
    }

    func fetchMemories(limit: Int = 36, force: Bool = false) async throws -> BackendReadResult<BackendMemoriesResponse> {
        _ = try? await bootstrapSession(force: false)
        var request = try makeRequest(path: "/memories", limit: limit)
        if !force, let cached = memoriesCacheByLimit[limit], !cached.etag.isEmpty {
            request.setValue(cached.etag, forHTTPHeaderField: "If-None-Match")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }

        if http.statusCode == 304, let cached = memoriesCacheByLimit[limit] {
            let headerSync = syncFromHeaders(http, fallbackStatus: "up")
            let incoming = mergeSyncStates(base: cached.sync, incoming: headerSync)
            updateSyncState(incoming, emitTurnEvent: false)
            return BackendReadResult(payload: cached.payload, sync: syncState, notModified: true)
        }

        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let payload = try decoder.decode(BackendMemoriesResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromMemoriesPayload(payload)
        let incoming = mergeSyncStates(base: bodySync, incoming: headerSync)
        updateSyncState(incoming, emitTurnEvent: true)
        let etag = normalizedEtag(from: http, fallbackStateVersion: syncState.stateVersion)
        memoriesCacheByLimit[limit] = MemoriesCacheEntry(etag: etag, payload: payload, sync: syncState)
        return BackendReadResult(payload: payload, sync: syncState, notModified: false)
    }

    func publishOptimisticTurn(
        userMessage: String,
        assistantMessage: String = "",
        turnId: String? = nil,
        lastUpdatedAt: TimeInterval = Date().timeIntervalSince1970 * 1000
    ) {
        let normalizedUser = userMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedAssistant = assistantMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        let nextTurn = turnId?.trimmingCharacters(in: .whitespacesAndNewlines)
        let fallbackTurn = syncState.lastTurnId.isEmpty ? "optimistic-\(Int(lastUpdatedAt))" : syncState.lastTurnId
        postTurnCommitted(
            source: "optimistic",
            turnId: (nextTurn?.isEmpty == false ? nextTurn! : fallbackTurn),
            sessionId: syncState.sessionId,
            stateVersion: syncState.stateVersion,
            lastUpdatedAt: lastUpdatedAt,
            historyUpdatedAt: syncState.historyUpdatedAt,
            memoryUpdatedAt: syncState.memoryUpdatedAt,
            userMessage: normalizedUser.isEmpty ? nil : normalizedUser,
            assistantMessage: normalizedAssistant.isEmpty ? nil : normalizedAssistant
        )
    }

    func recordTurnCommitted(
        turnId: String,
        sessionId: String? = nil,
        stateVersion: String? = nil,
        lastUpdatedAt: TimeInterval? = nil,
        historyUpdatedAt: TimeInterval? = nil,
        memoryUpdatedAt: TimeInterval? = nil,
        userMessage: String? = nil,
        assistantMessage: String? = nil
    ) {
        var incoming = BackendSyncState.empty
        incoming.status = "up"
        incoming.lastTurnId = turnId
        incoming.sessionId = sessionId ?? syncState.sessionId
        incoming.stateVersion = stateVersion ?? syncState.stateVersion
        incoming.lastUpdatedAt = lastUpdatedAt ?? max(syncState.lastUpdatedAt, Date().timeIntervalSince1970 * 1000)
        incoming.historyUpdatedAt = historyUpdatedAt ?? syncState.historyUpdatedAt
        incoming.memoryUpdatedAt = memoryUpdatedAt ?? syncState.memoryUpdatedAt
        updateSyncState(incoming, emitTurnEvent: false)
        postTurnCommitted(
            source: "authoritative",
            turnId: turnId,
            sessionId: syncState.sessionId,
            stateVersion: syncState.stateVersion,
            lastUpdatedAt: incoming.lastUpdatedAt,
            historyUpdatedAt: syncState.historyUpdatedAt,
            memoryUpdatedAt: syncState.memoryUpdatedAt,
            userMessage: userMessage,
            assistantMessage: assistantMessage
        )
    }

    func recordTurnCommitted(from response: HTTPURLResponse, userMessage: String? = nil, assistantMessage: String? = nil) {
        let turnId = headerValue(response, "x-turn-id").trimmingCharacters(in: .whitespacesAndNewlines)
        if turnId.isEmpty { return }
        let sessionId = headerValue(response, "x-session-id")
        let stateVersion = headerValue(response, "x-state-version")
        let lastUpdated = Double(headerValue(response, "x-last-updated-at")) ?? (Date().timeIntervalSince1970 * 1000)
        let historyUpdated = Double(headerValue(response, "x-history-updated-at")) ?? 0
        let memoryUpdated = Double(headerValue(response, "x-memory-updated-at")) ?? 0
        recordTurnCommitted(
            turnId: turnId,
            sessionId: sessionId.isEmpty ? nil : sessionId,
            stateVersion: stateVersion.isEmpty ? nil : stateVersion,
            lastUpdatedAt: lastUpdated,
            historyUpdatedAt: historyUpdated > 0 ? historyUpdated : nil,
            memoryUpdatedAt: memoryUpdated > 0 ? memoryUpdated : nil,
            userMessage: userMessage,
            assistantMessage: assistantMessage
        )
    }

    private func makeRequest(path: String, limit: Int) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL(), resolvingAgainstBaseURL: false) else {
            throw BackendMemoryAPIError.invalidBaseURL
        }
        components.path = path
        components.queryItems = [
            URLQueryItem(name: "limit", value: String(max(1, limit)))
        ]
        guard let url = components.url else {
            throw BackendMemoryAPIError.invalidBaseURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 12
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = appToken(), !token.isEmpty {
            request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
        }
        if let clientToken = clientToken(), !clientToken.isEmpty {
            request.setValue(clientToken, forHTTPHeaderField: "X-Client-Token")
        }
        return request
    }

    private func makeRequest(path: String) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL(), resolvingAgainstBaseURL: false) else {
            throw BackendMemoryAPIError.invalidBaseURL
        }
        components.path = path
        guard let url = components.url else {
            throw BackendMemoryAPIError.invalidBaseURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 12
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = appToken(), !token.isEmpty {
            request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
        }
        if let clientToken = clientToken(), !clientToken.isEmpty {
            request.setValue(clientToken, forHTTPHeaderField: "X-Client-Token")
        }
        return request
    }

    private func run<T: Decodable>(_ request: URLRequest, as type: T.Type) async throws -> T {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(T.self, from: data)
    }

    private func syncFromSession(_ payload: BackendSessionResponse) -> BackendSyncState {
        BackendSyncState(
            status: "up",
            sessionId: payload.sessionId ?? payload.clientToken,
            schemaVersion: payload.schemaVersion ?? 0,
            backendBuild: payload.backendBuild ?? "",
            backendBootId: payload.backendBootId ?? "",
            lastTurnId: payload.lastTurnId ?? "",
            lastUpdatedAt: payload.lastUpdatedAt ?? 0,
            historyUpdatedAt: payload.historyUpdatedAt ?? 0,
            memoryUpdatedAt: payload.memoryUpdatedAt ?? 0,
            stateVersion: payload.stateVersion ?? ""
        )
    }

    private func syncFromHealthPayload(_ payload: HealthPayload?, ok: Bool) -> BackendSyncState {
        BackendSyncState(
            status: payload?.status ?? (ok ? "up" : "down"),
            sessionId: payload?.sessionId ?? "",
            schemaVersion: payload?.schemaVersion ?? 0,
            backendBuild: payload?.backendBuild ?? "",
            backendBootId: payload?.backendBootId ?? "",
            lastTurnId: payload?.lastTurnId ?? "",
            lastUpdatedAt: payload?.lastUpdatedAt ?? 0,
            historyUpdatedAt: payload?.historyUpdatedAt ?? 0,
            memoryUpdatedAt: payload?.memoryUpdatedAt ?? 0,
            stateVersion: payload?.stateVersion ?? ""
        )
    }

    private func syncFromHistoryPayload(_ payload: BackendHistoryResponse) -> BackendSyncState {
        BackendSyncState(
            status: "up",
            sessionId: payload.sessionId ?? "",
            schemaVersion: payload.schemaVersion ?? 0,
            backendBuild: payload.backendBuild ?? "",
            backendBootId: payload.backendBootId ?? "",
            lastTurnId: payload.lastTurnId ?? "",
            lastUpdatedAt: payload.lastUpdatedAt ?? payload.lastConversationAt ?? 0,
            historyUpdatedAt: payload.historyUpdatedAt ?? payload.lastUpdatedAt ?? payload.lastConversationAt ?? 0,
            memoryUpdatedAt: payload.memoryUpdatedAt ?? 0,
            stateVersion: payload.stateVersion ?? ""
        )
    }

    private func syncFromMemoriesPayload(_ payload: BackendMemoriesResponse) -> BackendSyncState {
        BackendSyncState(
            status: "up",
            sessionId: payload.sessionId ?? "",
            schemaVersion: payload.schemaVersion ?? 0,
            backendBuild: payload.backendBuild ?? "",
            backendBootId: payload.backendBootId ?? "",
            lastTurnId: payload.lastTurnId ?? "",
            lastUpdatedAt: payload.lastUpdatedAt ?? 0,
            historyUpdatedAt: payload.historyUpdatedAt ?? 0,
            memoryUpdatedAt: payload.memoryUpdatedAt ?? payload.lastUpdatedAt ?? 0,
            stateVersion: payload.stateVersion ?? ""
        )
    }

    private func syncFromHeaders(_ http: HTTPURLResponse, fallbackStatus: String) -> BackendSyncState {
        BackendSyncState(
            status: headerValue(http, "x-backend-status").isEmpty ? fallbackStatus : headerValue(http, "x-backend-status"),
            sessionId: headerValue(http, "x-session-id"),
            schemaVersion: Int(headerValue(http, "x-schema-version")) ?? 0,
            backendBuild: headerValue(http, "x-backend-build"),
            backendBootId: headerValue(http, "x-backend-boot-id"),
            lastTurnId: headerValue(http, "x-last-turn-id"),
            lastUpdatedAt: Double(headerValue(http, "x-last-updated-at")) ?? 0,
            historyUpdatedAt: Double(headerValue(http, "x-history-updated-at")) ?? 0,
            memoryUpdatedAt: Double(headerValue(http, "x-memory-updated-at")) ?? 0,
            stateVersion: headerValue(http, "x-state-version")
        )
    }

    private func mergeSyncStates(base: BackendSyncState, incoming: BackendSyncState) -> BackendSyncState {
        var merged = base
        if !incoming.status.isEmpty, incoming.status != "unknown" { merged.status = incoming.status }
        if !incoming.sessionId.isEmpty { merged.sessionId = incoming.sessionId }
        if incoming.schemaVersion > 0 { merged.schemaVersion = incoming.schemaVersion }
        if !incoming.backendBuild.isEmpty { merged.backendBuild = incoming.backendBuild }
        if !incoming.backendBootId.isEmpty { merged.backendBootId = incoming.backendBootId }
        if !incoming.lastTurnId.isEmpty { merged.lastTurnId = incoming.lastTurnId }
        if incoming.lastUpdatedAt > 0 { merged.lastUpdatedAt = incoming.lastUpdatedAt }
        if incoming.historyUpdatedAt > 0 { merged.historyUpdatedAt = incoming.historyUpdatedAt }
        if incoming.memoryUpdatedAt > 0 { merged.memoryUpdatedAt = incoming.memoryUpdatedAt }
        if !incoming.stateVersion.isEmpty { merged.stateVersion = incoming.stateVersion }
        return merged
    }

    private func updateSyncState(_ incoming: BackendSyncState, emitTurnEvent: Bool) {
        let previous = syncState
        let merged = mergeSyncStates(base: previous, incoming: incoming)
        let syncChanged = merged != previous
        syncState = merged
        if syncChanged {
            NotificationCenter.default.post(
                name: .themBackendSyncUpdated,
                object: nil,
                userInfo: [
                    NotificationKey.status: merged.status,
                    NotificationKey.sessionId: merged.sessionId,
                    NotificationKey.schemaVersion: merged.schemaVersion,
                    NotificationKey.backendBuild: merged.backendBuild,
                    NotificationKey.backendBootId: merged.backendBootId,
                    NotificationKey.lastTurnId: merged.lastTurnId,
                    NotificationKey.lastUpdatedAt: merged.lastUpdatedAt,
                    NotificationKey.historyUpdatedAt: merged.historyUpdatedAt,
                    NotificationKey.memoryUpdatedAt: merged.memoryUpdatedAt,
                    NotificationKey.stateVersion: merged.stateVersion,
                ]
            )
        }
        if emitTurnEvent,
           !merged.lastTurnId.isEmpty,
           merged.lastTurnId != previous.lastTurnId {
            postTurnCommitted(
                source: "authoritative",
                turnId: merged.lastTurnId,
                sessionId: merged.sessionId,
                stateVersion: merged.stateVersion,
                lastUpdatedAt: merged.lastUpdatedAt,
                historyUpdatedAt: merged.historyUpdatedAt,
                memoryUpdatedAt: merged.memoryUpdatedAt,
                userMessage: nil,
                assistantMessage: nil
            )
        }
    }

    private func postTurnCommitted(
        source: String,
        turnId: String,
        sessionId: String,
        stateVersion: String,
        lastUpdatedAt: TimeInterval,
        historyUpdatedAt: TimeInterval,
        memoryUpdatedAt: TimeInterval,
        userMessage: String?,
        assistantMessage: String?
    ) {
        var userInfo: [AnyHashable: Any] = [
            NotificationKey.source: source,
            NotificationKey.turnId: turnId,
            NotificationKey.sessionId: sessionId,
            NotificationKey.stateVersion: stateVersion,
            NotificationKey.lastUpdatedAt: lastUpdatedAt,
            NotificationKey.historyUpdatedAt: historyUpdatedAt,
            NotificationKey.memoryUpdatedAt: memoryUpdatedAt,
        ]
        if let userMessage, !userMessage.isEmpty {
            userInfo[NotificationKey.userMessage] = userMessage
        }
        if let assistantMessage, !assistantMessage.isEmpty {
            userInfo[NotificationKey.assistantMessage] = assistantMessage
        }
        NotificationCenter.default.post(name: .themTurnCommitted, object: nil, userInfo: userInfo)
    }

    private func normalizedEtag(from http: HTTPURLResponse, fallbackStateVersion: String) -> String {
        let etag = headerValue(http, "ETag")
        if !etag.isEmpty { return etag }
        if !fallbackStateVersion.isEmpty { return "W/\"\(fallbackStateVersion)\"" }
        return ""
    }

    private func headerValue(_ response: HTTPURLResponse, _ name: String) -> String {
        if let value = response.value(forHTTPHeaderField: name), !value.isEmpty {
            return value
        }
        return ""
    }

    private func decodeErrorMessage(from data: Data) -> String {
        struct ErrorPayload: Decodable {
            let error: String?
            let stage: String?
        }
        if let payload = try? JSONDecoder().decode(ErrorPayload.self, from: data) {
            if let error = payload.error, !error.isEmpty {
                if let stage = payload.stage, !stage.isEmpty {
                    return "\(stage): \(error)"
                }
                return error
            }
        }
        return String(data: data, encoding: .utf8) ?? "Request failed."
    }

    private func baseURL() -> URL {
        if let fromDefaults = UserDefaults.standard.string(forKey: DefaultsKey.baseURL),
           !fromDefaults.isEmpty,
           let url = URL(string: fromDefaults) {
            return url
        }
        if let fromInfo = Bundle.main.object(forInfoDictionaryKey: "BACKEND_BASE_URL") as? String,
           !fromInfo.isEmpty,
           let url = URL(string: fromInfo) {
            return url
        }
        return URL(string: "http://127.0.0.1:3000")!
    }

    private func appToken() -> String? {
        if let fromDefaults = UserDefaults.standard.string(forKey: DefaultsKey.appToken), !fromDefaults.isEmpty {
            return fromDefaults
        }
        if let fromInfo = Bundle.main.object(forInfoDictionaryKey: "APP_TOKEN") as? String,
           !fromInfo.isEmpty {
            return fromInfo
        }
        let envValue = ProcessInfo.processInfo.environment["APP_TOKEN"] ?? ""
        if !envValue.isEmpty {
            return envValue
        }
        return devFallbackAppToken
    }

    private func clientToken() -> String? {
        let token = UserDefaults.standard.string(forKey: DefaultsKey.clientToken) ?? ""
        return token.isEmpty ? nil : token
    }

    private func cacheSession(_ sessionPayload: BackendSessionResponse) {
        cachedSession = sessionPayload
        cachedSessionAt = Date()

        UserDefaults.standard.set(sessionPayload.clientToken, forKey: DefaultsKey.clientToken)
        if let assistant = sessionPayload.assistantSelfName ?? sessionPayload.assistantName,
           !assistant.isEmpty {
            UserDefaults.standard.set(assistant, forKey: DefaultsKey.assistantName)
        }
        if let user = sessionPayload.userName, !user.isEmpty {
            UserDefaults.standard.set(user, forKey: DefaultsKey.userName)
        }
    }
}

func themDateFromEpoch(_ value: TimeInterval) -> Date {
    if value <= 0 { return .distantPast }
    if value > 10_000_000_000 {
        return Date(timeIntervalSince1970: value / 1000.0)
    }
    return Date(timeIntervalSince1970: value)
}

import Foundation
import CryptoKit

/// Versioned body record in the existing outbox's blobs directory. Metadata
/// and bytes are committed by one atomic file write; queue.jsonl is its index.
/// Old raw .multipart bodies remain readable and are never guessed into owners.
nonisolated struct OfflineTalkStoredBody: Codable {
    enum State: String, Codable { case ready, received, settled }
    var version: Int
    let entry: OfflineTalkOutboxEntry
    let body: Data
    let sha256: Data
    var state: State
    var response: OfflineTalkStoredResponse? = nil

    init(entry: OfflineTalkOutboxEntry, body: Data) {
        version = 1; self.entry = entry; self.body = body
        sha256 = Data(SHA256.hash(data: body)); state = .ready
    }

    func validatedBody(matching row: OfflineTalkOutboxEntry? = nil, migratingLegacyReference: Bool = false) throws -> Data {
        guard [1, 2].contains(version), body.count == entry.bodyByteCount,
              sha256 == Data(SHA256.hash(data: body)),
              row.map({ matches($0, migratingLegacyReference: migratingLegacyReference) }) ?? true,
              state != .received || (version == 2 && response != nil) else {
            throw BackendError.stage("offline_outbox", "Queued body identity could not be verified. All recovery files were kept.")
        }
        try response?.validate()
        return body
    }

    private func matches(_ row: OfflineTalkOutboxEntry, migratingLegacyReference: Bool) -> Bool {
        entry.id == row.id && entry.createdAt == row.createdAt && entry.endpoint == row.endpoint
            && entry.method == row.method && entry.urlString == row.urlString && entry.headers == row.headers
            && (migratingLegacyReference || (entry.bodyRef == row.bodyRef && entry.bodyByteCount == row.bodyByteCount))
            && entry.idempotencyKey == row.idempotencyKey && entry.timeoutInterval == row.timeoutInterval
    }

    func encoded() throws -> Data {
        let encoder = PropertyListEncoder(); encoder.outputFormat = .binary
        return try encoder.encode(self)
    }
}

/// Transport evidence, not acknowledgement that the writer saw/heard a reply.
/// Capture only product response headers, never cookies or session credentials.
nonisolated struct OfflineTalkStoredResponse: Codable {
    static let maxBodyBytes = 32 * 1024 * 1024
    // Finite allowlist: a future credential header must never inherit permission
    // merely because its name starts with a product namespace.
    private static let allowedHeaders = Set([
        "content-type", "x-transcript", "x-reply", "x-turn-id", "x-request-id", "x-state-version",
        "x-last-updated-at", "x-history-updated-at", "x-memory-updated-at", "x-persona-key", "x-user-name",
        "x-assistant-self-name", "x-confidence-class", "x-audio-duration-ms", "x-turn-status",
        "x-continue-reason", "x-turn-error-stage", "x-turn-error-message", "x-tts-first-bytes",
        "x-tts-total-ms", "x-tts-voice", "x-cycle-index", "x-voice-emotion-lane", "x-turn-meta-available",
        "x-reply-role", "x-dialogue-timeline", "x-canon-clarification", "x-speculative-reuse",
        "x-speculative-key", "x-speculative-prompt-hash", "x-safeguard-over-attachment"
    ]).union([
        "x-screenplay-": ["mode", "phase", "pack", "pack-lock", "project-id", "version-id", "repair-attempted",
            "repair-outcome", "repair-ms", "repair-reason", "target", "output", "output-available", "cues",
            "timing-source", "sync-ready", "authoritative", "quality-ok", "quality-reason", "quality-confidence",
            "quality-feature-act", "repair-directives"],
        "x-knowledge-": ["topics", "citations", "query-raw", "query-rewrite", "contradiction-risk", "contradiction-guard"],
        "x-creative-memory-": ["trace", "character-count", "episodic-count", "correction-count", "applied"],
        "x-ui-": ["orb-saturation", "orb-reactivity", "orb-smoothing", "voice-speed"],
        "x-note-": ["captured", "status", "target", "title", "text", "created-at", "path", "fallback-from", "error"],
        "x-task-": ["status", "action", "id", "title", "priority", "due-at", "completed-at"]
    ].flatMap { prefix, suffixes in suffixes.map { prefix + $0 } })
    let id: String
    let statusCode: Int
    let headers: [String: String]
    let body: Data
    let originalBodyBytes: Int
    let bodyOmitted: Bool
    let turnMetadata: Data?
    let sha256: Data

    init(_ result: OfflineTalkOutboxSendResult) throws {
        id = UUID().uuidString.lowercased(); statusCode = result.statusCode
        headers = result.headers.reduce(into: [:]) { out, pair in
            let name = pair.key.lowercased()
            if Self.allowedHeaders.contains(name) { out[name] = pair.value }
        }
        originalBodyBytes = result.body.count
        bodyOmitted = result.body.count > Self.maxBodyBytes
        body = bodyOmitted ? Data() : result.body
        turnMetadata = nil
        sha256 = try Self.digest(id: id, status: statusCode, headers: headers, body: body, originalBytes: originalBodyBytes, omitted: bodyOmitted)
    }

    func retainingTurnMetadata(_ data: Data) throws -> Self {
        try validate()
        return try Self(original: self, metadata: BackendTalkTurnMetaPayload.retainedData(data, expectedTurnID: headers["x-turn-id"] ?? ""))
    }

    private init(original: Self, metadata: Data) throws {
        // A reader of the earlier, incomplete result cannot acknowledge the
        // enriched result. Request/idempotency identity stays on the entry.
        id = UUID().uuidString.lowercased(); statusCode = original.statusCode; headers = original.headers; body = original.body
        originalBodyBytes = original.originalBodyBytes; bodyOmitted = original.bodyOmitted; turnMetadata = metadata
        sha256 = try Self.digest(id: id, status: statusCode, headers: headers, body: body,
            originalBytes: originalBodyBytes, omitted: bodyOmitted, metadata: metadata)
    }

    func validate() throws {
        guard UUID(uuidString: id) != nil, (200...299).contains(statusCode), body.count <= Self.maxBodyBytes,
              Set(headers.keys).isSubset(of: Self.allowedHeaders),
              (bodyOmitted ? (body.isEmpty && originalBodyBytes > Self.maxBodyBytes) : originalBodyBytes == body.count),
              (turnMetadata?.count ?? 0) <= 2 * 1024 * 1024,
              sha256 == (try Self.digest(id: id, status: statusCode, headers: headers, body: body,
                  originalBytes: originalBodyBytes, omitted: bodyOmitted, metadata: turnMetadata)) else {
            throw BackendError.stage("offline_outbox", "Saved reply integrity could not be verified. Recovery files were kept.")
        }
        if let turnMetadata {
            let sanitized = try BackendTalkTurnMetaPayload.retainedData(turnMetadata, expectedTurnID: headers["x-turn-id"] ?? "")
            guard sanitized == (try JSONSerialization.data(withJSONObject: JSONSerialization.jsonObject(with: turnMetadata), options: [.sortedKeys])) else {
                throw BackendMemoryAPIError.invalidResponse
            }
        }
    }

    var exportPayload: [String: Any] {
        var payload: [String: Any] = ["format": "them-received-talk-response", "version": turnMetadata == nil ? 1 : 2, "receipt_id": id,
         "status_code": statusCode, "headers": headers, "body_base64": body.base64EncodedString(),
         "body_omitted": bodyOmitted, "original_body_bytes": originalBodyBytes]
        if let turnMetadata { payload["turn_metadata_base64"] = turnMetadata.base64EncodedString() }
        return payload
    }

    private static func digest(id: String, status: Int, headers: [String: String], body: Data,
                               originalBytes: Int, omitted: Bool, metadata: Data? = nil) throws -> Data {
        var bytes = Data("talk-response-v1\n\(id)\n\(status)\n\(originalBytes)\n\(omitted)\n".utf8)
        bytes.append(try JSONSerialization.data(withJSONObject: headers, options: [.sortedKeys]))
        bytes.append(0x0A); bytes.append(body)
        if let metadata { bytes.append(Data("\nturn-metadata-v1:\(metadata.count)\n".utf8)); bytes.append(metadata) }
        return Data(SHA256.hash(data: bytes))
    }
}

nonisolated struct OfflineTalkReceivedReply {
    let entry: OfflineTalkOutboxEntry
    let response: OfflineTalkStoredResponse
}

nonisolated struct OfflineTalkRecoveryScope: Equatable, Sendable {
    let owner: ScreenplayStudioAuthContext
    let backendURL: URL

    init(identity: BackendAuthRequestIdentity, backendURL: URL) {
        owner = identity.ownerContext
        self.backendURL = backendURL
    }

    static func current() -> Self {
        .init(identity: BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false),
              backendURL: BackendAuthClient.resolvedBackendBaseURL())
    }

    func matches(identity: BackendAuthRequestIdentity, backendURL: URL) -> Bool {
        ScreenplayStudioAuthContextPolicy.matches(expected: owner, current: identity.ownerContext)
            && Self.sameBackend(self.backendURL, backendURL)
    }

    var isCurrent: Bool {
        matches(identity: BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false),
                backendURL: BackendAuthClient.resolvedBackendBaseURL())
    }

    static func sameBackend(_ lhs: URL, _ rhs: URL) -> Bool {
        guard ["http", "https"].contains(lhs.scheme?.lowercased() ?? ""),
              lhs.user == nil, lhs.password == nil, rhs.user == nil, rhs.password == nil else { return false }
        return BackendAPIResponseValidator.hasMatchingOrigin(requestURL: lhs, responseURL: rhs)
    }

    var notificationFields: [String: Any] {
        ["outboxOwner": owner.userID, "outboxIntent": owner.sessionIntentGeneration,
         "outboxBackend": backendURL.absoluteString]
    }

    init?(notification: Notification) {
        guard let fields = notification.userInfo,
              let user = fields["outboxOwner"] as? String,
              let generation = fields["outboxIntent"] as? Int,
              let rawURL = fields["outboxBackend"] as? String,
              let url = URL(string: rawURL) else { return nil }
        owner = .init(userID: user, sessionIntentGeneration: generation)
        backendURL = url
    }
}

nonisolated struct OfflineTalkRecoveryState {
    let scope: OfflineTalkRecoveryScope?
    let snapshot: OfflineTalkOutboxSnapshot
    let entries: [OfflineTalkOutboxEntry]
    let hasUnassignedEntries: Bool
    static let empty = Self(scope: nil, snapshot: .empty, entries: [], hasUnassignedEntries: false)
}

nonisolated struct OfflineTalkRecoveryArtifact {
    let filename: String
    let data: Data
}

nonisolated struct OfflineTalkPayloadConflictError: LocalizedError {
    let entryID: String
    var errorDescription: String? {
        "A different payload reused this request ID. Both copies were kept. The new copy was not sent; export it from Data Controls before deleting anything."
    }
}

nonisolated struct OfflineTalkPreviousOwnerError: LocalizedError {
    var errorDescription: String? {
        "Your turn was kept with the account and backend that started it. Return to that account and backend to continue."
    }
}

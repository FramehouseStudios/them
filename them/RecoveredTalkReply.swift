import Foundation

nonisolated enum BackendTalkResponseContent {
    static func string(_ response: HTTPURLResponse?, field: String) -> String? {
        guard let raw = response?.value(forHTTPHeaderField: field)?.removingPercentEncoding?.trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty else { return nil }
        return raw
    }

    static func screenplay(_ response: HTTPURLResponse?) -> BackendTalkScreenplayOutput? {
        guard let raw = string(response, field: "x-screenplay-output"),
              let data = raw.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(BackendTalkScreenplayOutput.self, from: data)
    }
}

/// The original typed request context, not the current Studio selection or a
/// service-reported project. This is evidence, not permission to mutate a draft:
/// revision IDs/excerpts cannot capture unsaved bytes. New requests retain an
/// exact local draft identity, which still is not authority to apply a result.
nonisolated struct RecoveredTalkWriteContext: Codable, Equatable {
    let projectID: String
    let documentRevisionID: String
    let target: String
    let promptSource: String
    let writeID: String
    let anchorLine: Int?
    let anchorEndLine: Int?
    let insertionMode: String
    var draftIdentity: ScreenplayDraftContentIdentity? = nil
    var replacementRange: RecoveredPageReplacementRange? = nil

    init?(metadata: BackendStudioThreadCommitMetadata?) {
        guard let metadata, metadata.isMeaningful else { return nil }
        projectID = metadata.screenplayProjectId
        documentRevisionID = metadata.screenplayDocumentRevisionId
        target = metadata.screenplayTarget
        promptSource = metadata.screenplayPromptSource
        writeID = metadata.screenplayWriteId
        anchorLine = metadata.screenplayAnchorLine
        anchorEndLine = metadata.screenplayAnchorEndLine
        insertionMode = metadata.screenplayInsertionMode
        draftIdentity = metadata.recoveryDraftIdentity
        replacementRange = metadata.recoveryReplacementRange
    }
}

/// Private on-device recovery evidence, never an authorization grant or proof
/// that the generated text has already been inserted/saved in a screenplay.
nonisolated struct RecoveredTalkReply: Codable, Identifiable, Equatable {
    let id: String
    let ownerID: String
    let receivedAt: TimeInterval
    let requestKey: String
    let requestURL: String
    let requestBodyRef: String
    let responseBodyRef: String
    let headers: [String: String]
    var originalWriteContext: RecoveredTalkWriteContext? = nil
    var retrievedScreenplayOutput: BackendTalkScreenplayOutput? = nil
    var pageApplication: RecoveredPageApplication? = nil

    var response: HTTPURLResponse? {
        guard let url = URL(string: requestURL) else { return nil }
        return HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)
    }
    var screenplay: BackendTalkScreenplayOutput? { retrievedScreenplayOutput ?? BackendTalkResponseContent.screenplay(response) }
    var projectID: String { BackendTalkResponseContent.string(response, field: "x-screenplay-project-id") ?? "" }
    var reply: String {
        if let screenplay, screenplay.writesToPage { return screenplay.text }
        return BackendTalkResponseContent.string(response, field: "x-reply") ?? ""
    }
    var transcript: String { BackendTalkResponseContent.string(response, field: "x-transcript") ?? "" }
    var turnID: String { BackendTalkResponseContent.string(response, field: "x-turn-id") ?? "" }
    var sessionID: String { BackendTalkResponseContent.string(response, field: "x-session-id") ?? "" }
    var hasOnlyPagePreview: Bool {
        let targets = [originalWriteContext?.target, BackendTalkResponseContent.string(response, field: "x-screenplay-target")]
        return targets.contains { $0?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "page" } && screenplay?.writesToPage != true
    }
    var canRetrieveFullPage: Bool {
        hasOnlyPagePreview && !ownerID.isEmpty && !turnID.isEmpty && !sessionID.isEmpty
    }

    static let retainedHeaderNames: Set<String> = [
        "content-type", "x-reply", "x-transcript", "x-turn-id", "x-request-id", "x-session-id",
        "x-state-version", "x-last-updated-at", "x-history-updated-at", "x-memory-updated-at",
        "x-screenplay-project-id", "x-screenplay-output", "x-screenplay-target", "x-reply-role",
    ]
}

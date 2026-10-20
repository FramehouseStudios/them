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

    var response: HTTPURLResponse? {
        guard let url = URL(string: requestURL) else { return nil }
        return HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)
    }
    var screenplay: BackendTalkScreenplayOutput? { BackendTalkResponseContent.screenplay(response) }
    var projectID: String { BackendTalkResponseContent.string(response, field: "x-screenplay-project-id") ?? "" }
    var reply: String {
        if let screenplay, screenplay.writesToPage { return screenplay.text }
        return BackendTalkResponseContent.string(response, field: "x-reply") ?? ""
    }
    var transcript: String { BackendTalkResponseContent.string(response, field: "x-transcript") ?? "" }
    var hasOnlyPagePreview: Bool {
        BackendTalkResponseContent.string(response, field: "x-screenplay-target")?.lowercased() == "page" && screenplay?.writesToPage != true
    }

    static let retainedHeaderNames: Set<String> = [
        "content-type", "x-reply", "x-transcript", "x-turn-id", "x-request-id", "x-session-id",
        "x-state-version", "x-last-updated-at", "x-history-updated-at", "x-memory-updated-at",
        "x-screenplay-project-id", "x-screenplay-output", "x-screenplay-target", "x-reply-role",
    ]
}

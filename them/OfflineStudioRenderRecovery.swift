import Foundation

/// A read-only interpretation of the canonical retained request/response. This
/// never creates talk/audio evidence, authorizes insertion, or acknowledges it.
nonisolated struct OfflineStudioRenderRecovery: Sendable {
    let transcript: String
    let reply: String
    let projectID: String
    let isComplete: Bool
    let qualityConfirmed: Bool

    static func supports(endpoint: String) -> Bool { StudioRenderEndpoint.paths.contains(endpoint) }

    init(packet: OfflineTalkReceivedReply) throws {
        guard Self.supports(endpoint: packet.entry.endpoint), let requestBody = packet.requestBody,
              !packet.response.bodyOmitted else { throw Self.unreadable() }
        try packet.response.validate()
        let decoder = JSONDecoder()
        let request = try decoder.decode(Request.self, from: requestBody)
        guard !request.transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw Self.unreadable() }
        transcript = request.transcript
        projectID = request.projectID ?? ""
        let markedComplete = packet.response.headers["x-them-render-complete"] == "1"
        if packet.entry.endpoint == StudioRenderEndpoint.oneShotPath {
            let payload = try decoder.decode(Payload.self, from: packet.response.body)
            let text = payload.reply ?? ""
            guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw Self.unreadable() }
            reply = text
            isComplete = markedComplete && payload.ok == true && payload.error == nil
            qualityConfirmed = isComplete && payload.quality?.ok == true
        } else {
            guard let stream = String(data: packet.response.body, encoding: .utf8) else { throw Self.unreadable() }
            var event = "message", dataLines: [String] = [], accumulated = ""
            var doneReply: String?, quality: Bool?, malformed = false, rejected = false
            func dispatch() {
                defer { event = "message"; dataLines.removeAll(keepingCapacity: true) }
                guard !dataLines.isEmpty, ["delta", "done", "error", "meta", "trace"].contains(event) else { return }
                guard let payload = try? decoder.decode(Payload.self, from: Data(dataLines.joined(separator: "\n").utf8)) else {
                    malformed = true; return
                }
                if let value = payload.quality?.ok { quality = value }
                if payload.error != nil || payload.ok == false { rejected = true }
                switch event {
                case "delta":
                    guard let delta = payload.delta else { malformed = true; return }
                    accumulated += delta
                case "done":
                    let text = payload.reply ?? accumulated
                    guard doneReply == nil,
                          !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                        malformed = true; return
                    }
                    doneReply = text
                case "error": rejected = true
                default: break
                }
            }
            for line in stream.components(separatedBy: "\n") {
                if line.isEmpty { dispatch() }
                else if line.hasPrefix("event:") { event = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces) }
                else if line.hasPrefix("data:") {
                    let value = line.dropFirst(5)
                    dataLines.append(String(value.first == " " ? value.dropFirst() : value))
                }
            }
            dispatch()
            let text = doneReply ?? accumulated
            guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw Self.unreadable() }
            reply = text
            isComplete = markedComplete && doneReply != nil && !malformed && !rejected
            qualityConfirmed = isComplete && quality == true
        }
    }

    private static func unreadable() -> BackendError {
        .stage("offline_outbox", "The saved Studio response could not be read here. Its recovery record is kept in Data Controls.")
    }

    private struct Request: Decodable {
        let transcript: String
        let projectID: String?
        enum CodingKeys: String, CodingKey { case transcript; case projectID = "screenplay_project_id" }
    }
    private struct Quality: Decodable { let ok: Bool }
    private struct Payload: Decodable {
        let ok: Bool?
        let delta: String?
        let reply: String?
        let error: String?
        let quality: Quality?
        enum CodingKeys: String, CodingKey { case ok, delta, reply, error; case quality = "screenplay_quality" }
    }
}

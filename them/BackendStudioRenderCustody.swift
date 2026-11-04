import Foundation

nonisolated enum StudioRenderEndpoint {
    static let oneShotPath = "/realtime/studio_render"
    static let streamPath = "/realtime/studio_render_stream"
    static let paths: Set<String> = [oneShotPath, streamPath]
}

/// A deadline cannot prove that generation never started. In particular it
/// must not turn an already-accepted stream into another model request.
nonisolated struct BackendStudioRenderDeadlineError: LocalizedError {
    var errorDescription: String? { "Studio did not finish in time. Review recovery before asking again; generation was not repeated automatically." }
}

nonisolated struct BackendStudioRenderUnconfirmedError: LocalizedError {
    let underlyingError: Error
    var errorDescription: String? { "Studio could not confirm this request's outcome. Its recovery request is held; review it before asking again. Generation was not repeated automatically." }
}

/// Complete, quality-validated render custody. This is text delivery evidence;
/// it must never be converted into a successful audio playback marker.
nonisolated struct BackendStudioRenderDeliveryReceipt: Equatable, Sendable {
    let receipt: OfflineTalkLiveReceipt
    let request: BackendTalkLiveRequestContext
    let writesToPage: Bool

    @MainActor func confirmPublishedPin(outbox: OfflineTalkOutbox = .shared) async {
        guard !writesToPage else { return }
        let owner = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false)
        guard ScreenplayStudioAuthContextPolicy.matches(expected: request.owner, current: owner.ownerContext) else { return }
        // A failed acknowledgement leaves the record available for review.
        _ = try? await outbox.confirmPublishedStudioPin(self, owner: owner)
    }
}

/// Extends the canonical outbox's admitted record, not a second render store.
/// SSE framing is reconstructed with LF; JSON string contents remain intact.
nonisolated struct BackendStudioRenderCustody: Sendable {
    let admission: OfflineTalkLiveAdmission
    let outbox: OfflineTalkOutbox

    /// AsyncBytes.lines may omit empty lines. The server emits an event field
    /// at each frame boundary; restore that delimiter without changing data.
    static func appendStreamLine(_ line: String, to frames: inout Data) {
        if line.hasPrefix("event:"), !frames.isEmpty, !frames.suffix(2).elementsEqual(Data("\n\n".utf8)) {
            frames.append(10)
        }
        frames.append(Data((line + "\n").utf8))
    }

    func delivery(owner: BackendAuthRequestIdentity, backendURL: URL) async throws -> BackendStudioRenderDeliveryReceipt {
        try await outbox.studioRenderDelivery(admission, owner: owner, backendURL: backendURL)
    }

    func retain(_ data: Data, response: HTTPURLResponse, complete: Bool) async throws {
        guard let url = response.url else { throw BackendMemoryAPIError.invalidResponse }
        do {
            let result = OfflineTalkOutboxSendResult(statusCode: response.statusCode,
                headers: response.allHeaderFields.reduce(into: [:]) { headers, item in
                    if let name = item.key as? String { headers[name] = String(describing: item.value) }
                }, body: data)
            let receipt = try await outbox.checkpointStudioRender(admission, response: result, responseURL: url, complete: complete)
            guard !receipt.bodyOmitted else {
                throw BackendError.stage("studio_render", "The response exceeded recovery storage limits. Its request is held; review it before continuing.")
            }
        } catch { throw BackendTalkCustodyError(underlyingError: error) }
    }
}

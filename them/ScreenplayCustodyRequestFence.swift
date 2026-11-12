import Foundation

/// A future-delivery fence is not evidence that these words were never saved.
nonisolated struct ScreenplayDraftCustodyBlockedReceipt: Codable, Equatable, Sendable {
    let requestDigest: String
    let serverRequestHash: String
    let headVersionIDAtFence: String
    let proof: String
    let httpStatusCode: Int
}

nonisolated struct BackendScreenplayFenceResponse: BackendScreenplaySyncEnvelope {
    let stage: String?
    let status: String?
    let proof: String?
    let projectId: String?
    let clientRequestId: String?
    let localRequestDigest: String?
    let requestHash: String?
    let headVersionIdAtFence: String?
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
}

nonisolated struct ScreenplayConfirmedBlockedCustodySave: Sendable {
    let requestID: String
    let projectID: String
    let owner: ScreenplayStudioAuthContext
    let origin: ScreenplayDraftSaveOrigin
    let receipt: ScreenplayDraftCustodyBlockedReceipt

    private init(entry: ScreenplayDraftSaveOutboxEntry, owner: ScreenplayStudioAuthContext,
                 origin: ScreenplayDraftSaveOrigin, receipt: ScreenplayDraftCustodyBlockedReceipt) {
        requestID = entry.id; projectID = entry.projectId; self.owner = owner
        self.origin = origin; self.receipt = receipt
    }

    static func verify(entry: ScreenplayDraftSaveOutboxEntry, localDigest: String,
                       result: BackendReadResult<BackendScreenplayFenceResponse>,
                       owner: ScreenplayStudioAuthContext, currentOwner: ScreenplayStudioAuthContext) -> Self? {
        let payload = result.payload
        guard entry.source == "studio_custody_selected", entry.hasExplicitBaseSelection,
              !entry.hasTerminalCustodyReceipt, entry.ownerUserId.utf8.elementsEqual(owner.userID.utf8),
              ScreenplayStudioAuthContextPolicy.matches(expected: owner, current: currentOwner),
              let origin = entry.deliveryOrigin, let responseURL = result.responseURL,
              origin.permitsBackend(responseURL), result.httpStatusCode == 200,
              payload.stage == "screenplay_version_fence", payload.status == "future_delivery_blocked",
              payload.proof == "pg_request_fence_v1", payload.projectId?.utf8.elementsEqual(entry.projectId.utf8) == true,
              payload.clientRequestId?.utf8.elementsEqual(entry.id.utf8) == true, payload.localRequestDigest == localDigest,
              isDigest(localDigest), let serverHash = payload.requestHash, isDigest(serverHash),
              let head = payload.headVersionIdAtFence, !head.isEmpty,
              head.utf8.count <= 128, head == head.trimmingCharacters(in: .whitespacesAndNewlines), head.rangeOfCharacter(from: .controlCharacters) == nil else { return nil }
        return .init(entry: entry, owner: owner, origin: origin,
            receipt: .init(requestDigest: localDigest, serverRequestHash: serverHash,
                           headVersionIDAtFence: head, proof: "pg_request_fence_v1", httpStatusCode: 200))
    }

    private static func isDigest(_ value: String) -> Bool {
        value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
    }
}

extension BackendMemoryAPI {
    func fenceScreenplayVersion(_ entry: ScreenplayDraftSaveOutboxEntry, localDigest: String,
                                maySend: @escaping @Sendable () async -> Bool,
                                initiatingIdentity owner: BackendAuthRequestIdentity) async throws -> BackendReadResult<BackendScreenplayFenceResponse> {
        guard let origin = entry.deliveryOrigin, entry.ownerUserId.utf8.elementsEqual(owner.userID.utf8),
              entry.source == "studio_custody_selected", !entry.hasTerminalCustodyReceipt,
              ![".", ".."].contains(entry.projectId),
              entry.projectId.range(of: "^[A-Za-z0-9._-]{1,64}$", options: .regularExpression) != nil,
              entry.id.range(of: "^[A-Za-z0-9._-]{1,96}$", options: .regularExpression) != nil,
              localDigest.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw BackendMemoryAPIError.invalidResponse }
        let identity = try await screenplayRequestIdentity(owner, expectedBackendURL: origin.backendURL)
        var request = try makeWriteRequest(path: "/screenplay/projects/\(entry.projectId)/version/fence", identity: identity)
        guard let requestURL = request.url, origin.permitsBackend(requestURL) else { throw BackendMemoryAPIError.invalidResponse }
        let payload: [String: Any] = ["client_request_id": entry.id, "draft": entry.draft,
            "title": entry.title, "phase": entry.phase, "source": entry.source, "notes": entry.notes,
            "base_version_id": entry.baseVersionId, "conflict_strategy": "reject_if_stale",
            "local_request_digest": localDigest,
            "studio_write_anchors": try JSONSerialization.jsonObject(with: JSONEncoder().encode(entry.studioWriteAnchors)),
            "screenplay_bindings": try JSONSerialization.jsonObject(with: JSONEncoder().encode(entry.screenplayBindings))]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        guard await maySend() else { throw BackendMemoryAPIError.server(status: 409, message: "The selected copy changed before the request was sent.") }
        try owner.requireCurrentOwner(BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false))
        guard origin.permitsBackend(BackendAuthClient.resolvedBackendBaseURL()) else {
            throw BackendMemoryAPIError.server(status: 409, message: "The selected backend changed before the request was sent.")
        }
        let (data, response) = try await screenplayHTTPResponse(for: request, owner: owner)
        guard response.statusCode == 200 else {
            throw BackendMemoryAPIError.server(status: response.statusCode, message: "The server could not confirm that the original request is blocked. Your copies remain available.")
        }
        return try screenplayReadResult(BackendScreenplayFenceResponse.self, data: data, response: response, owner: owner)
    }
}

/// Connected to explicit review only. It neither changes the page nor sends a replacement save.
@MainActor
enum ScreenplayHeldRequestFence {
    static func block(viewModel: ScreenplayStudioViewModel,
                      token: ScreenplayStudioViewModel.HeldDraftRecoveryReviewToken) async throws {
        guard let selected = viewModel.heldDraftRecoveryForReview(token),
              let origin = selected.deliveryOrigin, token.presentationDocumentID == origin.documentID,
              ScreenplayLiveDraftSyncService.shared.ownsEditor(viewModel) else { throw BackendMemoryAPIError.invalidResponse }
        let owner = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false)
        guard ScreenplayStudioAuthContextPolicy.matches(expected: token.owner, current: owner.ownerContext) else { throw BackendMemoryAPIError.invalidResponse }
        let outbox = ScreenplayDraftSaveOutbox.shared
        let intent = try await outbox.custodyFenceIntent(selectedID: selected.id, projectID: token.projectID,
            ownerUserID: token.owner.userID, deliveryOrigin: origin)
        let maySend: @Sendable () async -> Bool = { [weak viewModel] in
            let context = await MainActor.run {
                guard let viewModel else { return false }
                return viewModel.heldDraftRecoveryForReview(token) == selected && ScreenplayLiveDraftSyncService.shared.ownsEditor(viewModel)
            }
            guard context, let current = try? await outbox.custodyFenceIntent(selectedID: selected.id,
                projectID: token.projectID, ownerUserID: token.owner.userID, deliveryOrigin: origin) else { return false }
            return current.entry.id == intent.entry.id && current.digest == intent.digest
        }
        let result = try await BackendMemoryAPI.shared.fenceScreenplayVersion(intent.entry, localDigest: intent.digest,
            maySend: maySend, initiatingIdentity: owner)
        guard await maySend(), viewModel.heldDraftRecoveryForReview(token) == selected,
              ScreenplayLiveDraftSyncService.shared.ownsEditor(viewModel),
              let evidence = ScreenplayConfirmedBlockedCustodySave.verify(entry: intent.entry, localDigest: intent.digest,
                result: result, owner: token.owner, currentOwner: .current()) else { throw BackendMemoryAPIError.invalidResponse }
        try await outbox.recordConfirmedBlockedCustody(intent.entry, evidence: evidence)
        // The UI must require a new explicit selection/save and fetch its current head.
    }
}

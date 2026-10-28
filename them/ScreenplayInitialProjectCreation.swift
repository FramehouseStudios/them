import Foundation

/// Initial saves live in the existing durable draft-save outbox, not a second writer store.
nonisolated struct ScreenplayInitialProjectMetadata: Codable, Equatable, Sendable {
    let documentID: String
    let backendURL: URL
    let sourceProjectID: String
    var receiptVersionID: String? = nil

    func validate(owner: BackendAuthRequestIdentity, entry: ScreenplayDraftSaveOutboxEntry, requestURL: URL?) throws {
        guard entry.ownerUserId == owner.userID, !owner.userID.isEmpty,
              !documentID.isEmpty, let requestURL,
              OfflineTalkRecoveryScope.sameBackend(backendURL, requestURL) else {
            throw BackendMemoryAPIError.server(status: 409, message: "auth_request_superseded")
        }
    }

    static func origin(_ url: URL) throws -> URL {
        guard OfflineTalkRecoveryScope.sameBackend(url, url),
              var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            throw BackendMemoryAPIError.invalidBaseURL
        }
        parts.path = ""; parts.query = nil; parts.fragment = nil
        guard let result = parts.url else { throw BackendMemoryAPIError.invalidBaseURL }
        return result
    }
}

struct ScreenplayInitialProjectReceipt {
    let entry: ScreenplayDraftSaveOutboxEntry
    let project: BackendScreenplayProjectSummary
    let versionID: String
    let owner: BackendAuthRequestIdentity
    let localDraft: String
}

@MainActor
enum ScreenplayInitialProjectCreation {
    static func save(_ entry: ScreenplayDraftSaveOutboxEntry, owner: BackendAuthRequestIdentity,
                     localDraft: String, outbox: ScreenplayDraftSaveOutbox = .shared,
                     api: BackendMemoryAPI = .shared,
                     liveReplyOutbox: OfflineTalkOutbox = .shared) async throws -> ScreenplayInitialProjectReceipt {
        try owner.requireCurrentOwner(BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false))
        guard let metadata = entry.initialization else { throw BackendMemoryAPIError.invalidResponse }
        try metadata.validate(owner: owner, entry: entry, requestURL: BackendAuthClient.resolvedBackendBaseURL())
        try await outbox.beginInitialProject(id: entry.id, ownerUserID: owner.userID, backendURL: metadata.backendURL)
        do {
            let result = try await api.upsertScreenplayProject(projectId: entry.projectId, title: entry.title,
                phase: entry.phase, initialDraft: entry, initiatingIdentity: owner)
            try owner.requireCurrentOwner(BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false))
            try metadata.validate(owner: owner, entry: entry, requestURL: BackendAuthClient.resolvedBackendBaseURL())
            guard let project = result.payload.project, project.id == entry.projectId,
                  let version = result.payload.version, let versionID = result.payload.versionId,
                  !versionID.isEmpty, version.id == versionID,
                  version.draft?.utf8.elementsEqual(entry.draft.utf8) == true else {
                throw BackendMemoryAPIError.server(status: 503, message: "The first save was not acknowledged. Your original words are kept on this device.")
            }
            try await outbox.recordInitialProjectReceipt(id: entry.id, versionID: versionID)
            if let evidence = ScreenplayConfirmedDraftSave.initial(entry: entry, version: version,
                versionID: versionID, projectID: result.payload.projectId, responseURL: result.responseURL,
                owner: owner.ownerContext, currentOwner: .current()) {
                _ = try await liveReplyOutbox.recordConfirmedPageSave(evidence)
            }
            return .init(entry: entry, project: project, versionID: versionID, owner: owner, localDraft: localDraft)
        } catch {
            try? await outbox.releaseInitialProject(id: entry.id, error: error.localizedDescription)
            throw error
        }
    }
}

extension ScreenplayLiveDraftBridge {
    @discardableResult
    func adoptInitialProjectReceipt(_ receipt: ScreenplayInitialProjectReceipt,
                                    initiating: StudioActionDocumentContext) -> Bool {
        guard let metadata = receipt.entry.initialization,
              metadata.documentID == draftOrigin.documentID,
              (initiating.projectID == metadata.sourceProjectID || initiating.projectID == receipt.project.id),
              initiating.matches(.current(bridge: self)),
              (try? receipt.owner.requireCurrentOwner(BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false))) != nil,
              OfflineTalkRecoveryScope.sameBackend(metadata.backendURL, BackendAuthClient.resolvedBackendBaseURL()) else { return false }
        let dirty = !draftText.utf8.elementsEqual(receipt.entry.draft.utf8)
        ScreenplayLocalDraftRecoveryStore().save(ownerUserId: receipt.owner.userID, projectId: receipt.project.id,
            draft: draftText, baseVersionId: receipt.versionID, dirty: dirty)
        initialProjectReceipt = receipt
        preferredProjectID = receipt.project.id
        preferredVersionID = receipt.versionID
        return UserDefaults.standard.synchronize()
    }
}

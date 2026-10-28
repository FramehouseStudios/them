import Foundation

/// Captured with the save request; retrying an A save while viewing B must not
/// give that request B's document or backend identity.
nonisolated struct ScreenplayDraftSaveOrigin: Codable, Equatable, Sendable {
    let documentID: String
    let backendURL: URL

    func permitsBackend(_ url: URL) -> Bool {
        OfflineTalkRecoveryScope.sameBackend(backendURL, url)
    }

    static func restoredSnapshot(entry: ScreenplayDraftSaveOutboxEntry, draft: String,
        owner: ScreenplayStudioAuthContext, currentOwner: ScreenplayStudioAuthContext,
        backendURL: URL) -> ScreenplayLiveDraftOriginSnapshot? {
        guard entry.initialization == nil, entry.status == .pending || entry.status == .inflight,
              entry.ownerUserId == owner.userID,
              ScreenplayStudioAuthContextPolicy.matches(expected: owner, current: currentOwner),
              entry.draft.utf8.elementsEqual(draft.utf8), let origin = entry.deliveryOrigin,
              ScreenplayConfirmedDraftSave.validID(entry.projectId),
              ScreenplayConfirmedDraftSave.validID(origin.documentID), origin.permitsBackend(backendURL) else { return nil }
        return .init(projectID: entry.projectId, versionID: entry.baseVersionId, documentID: origin.documentID)
    }

    static func capture(document: ScreenplayLiveTalkDocument?, projectID: String,
                        owner: ScreenplayStudioAuthContext, isActiveEditor: Bool,
                        backendURL: URL) -> Self? {
        guard isActiveEditor, let document, document.owner == owner,
              document.projectID == projectID, ScreenplayConfirmedDraftSave.validID(projectID),
              ScreenplayConfirmedDraftSave.validID(document.documentID),
              ScreenplayConfirmedDraftSave.validID(owner.userID),
              let origin = try? ScreenplayInitialProjectMetadata.origin(backendURL) else { return nil }
        return .init(documentID: document.documentID, backendURL: origin)
    }
}

/// Proof of the immutable draft that the server actually acknowledged. This
/// value does not assert playback, publication, or permission to change a UI.
nonisolated struct ScreenplayConfirmedDraftSave: Sendable {
    let requestID: String
    let owner: ScreenplayStudioAuthContext
    let projectID: String
    let versionID: String
    let documentID: String
    let backendURL: URL
    let draft: String
    let promotedFromProjectID: String?
    let initialProjectReceiptID: String?
    let initialProjectVersionID: String?

    private init(entry: ScreenplayDraftSaveOutboxEntry, owner: ScreenplayStudioAuthContext,
                 versionID: String, origin: ScreenplayDraftSaveOrigin, responseURL: URL,
                 promotedFromProjectID: String? = nil) {
        requestID = entry.id; self.owner = owner; projectID = entry.projectId
        self.versionID = versionID; documentID = origin.documentID
        backendURL = responseURL; draft = entry.draft
        self.promotedFromProjectID = promotedFromProjectID
        initialProjectReceiptID = promotedFromProjectID == nil ? nil : entry.id
        initialProjectVersionID = promotedFromProjectID == nil ? nil : versionID
    }

    static func ordinary(entry: ScreenplayDraftSaveOutboxEntry, version: BackendScreenplayVersion?,
                         versionID: String?, projectID: String?, responseURL: URL?,
                         owner: ScreenplayStudioAuthContext, currentOwner: ScreenplayStudioAuthContext) -> Self? {
        guard entry.initialization == nil, let origin = entry.deliveryOrigin,
              let version, version.clientRequestId == entry.id,
              let responseOrigin = validated(entry: entry, origin: origin, version: version,
                  versionID: versionID, projectID: projectID, responseURL: responseURL,
                  owner: owner, currentOwner: currentOwner) else { return nil }
        return .init(entry: entry, owner: owner, versionID: version.id, origin: origin, responseURL: responseOrigin)
    }

    /// A readback can prove the same words already exist under another request
    /// ID. It must still prove exact project/document/origin and writer bytes.
    static func readback(entry: ScreenplayDraftSaveOutboxEntry, version: BackendScreenplayVersion,
                         projectID: String, responseURL: URL?, owner: ScreenplayStudioAuthContext,
                         currentOwner: ScreenplayStudioAuthContext) -> Self? {
        guard entry.initialization == nil, let origin = entry.deliveryOrigin,
              let responseOrigin = validated(entry: entry, origin: origin, version: version,
                  versionID: version.id, projectID: projectID, responseURL: responseURL,
                  owner: owner, currentOwner: currentOwner) else { return nil }
        return .init(entry: entry, owner: owner, versionID: version.id, origin: origin, responseURL: responseOrigin)
    }

    /// A stale background retry can already be satisfied by another request's
    /// current exact version. Explicit writer checkpoints still require a choice.
    static func passiveAutosaveReadback(entry: ScreenplayDraftSaveOutboxEntry,
        response: BackendScreenplayVersionMutationResponse, responseURL: URL?,
        owner: ScreenplayStudioAuthContext, currentOwner: ScreenplayStudioAuthContext) -> Self? {
        guard let project = response.project, let version = response.serverVersion,
              response.serverVersionId == version.id,
              passiveAutosaveTargetMatches(entry: entry, project: project, version: version) else { return nil }
        return readback(entry: entry, version: version, projectID: response.projectId ?? "",
            responseURL: responseURL, owner: owner, currentOwner: currentOwner)
    }

    static func passiveAutosaveTargetMatches(entry: ScreenplayDraftSaveOutboxEntry,
        project: BackendScreenplayProjectSummary, version: BackendScreenplayVersion) -> Bool {
        entry.initialization == nil && entry.isPassiveAutosave &&
            project.id == entry.projectId && project.title == entry.title &&
            project.activeVersionId == version.id && version.projectId == entry.projectId &&
            version.phase == entry.phase && version.draft?.utf8.elementsEqual(entry.draft.utf8) == true &&
            (version.studioWriteAnchors ?? []) == entry.studioWriteAnchors &&
            (version.screenplayBindings ?? []) == entry.screenplayBindings
    }

    static func initial(entry: ScreenplayDraftSaveOutboxEntry, version: BackendScreenplayVersion?,
                        versionID: String?, projectID: String?, responseURL: URL?,
                        owner: ScreenplayStudioAuthContext, currentOwner: ScreenplayStudioAuthContext) -> Self? {
        guard let metadata = entry.initialization, let version, version.clientRequestId == entry.id,
              metadata.sourceProjectID.isEmpty || validID(metadata.sourceProjectID) else { return nil }
        let origin = ScreenplayDraftSaveOrigin(documentID: metadata.documentID, backendURL: metadata.backendURL)
        guard entry.deliveryOrigin == origin,
              let responseOrigin = validated(entry: entry, origin: origin, version: version,
                  versionID: versionID, projectID: projectID, responseURL: responseURL,
                  owner: owner, currentOwner: currentOwner) else { return nil }
        return .init(entry: entry, owner: owner, versionID: version.id, origin: origin,
                     responseURL: responseOrigin, promotedFromProjectID: metadata.sourceProjectID)
    }

    private static func validated(entry: ScreenplayDraftSaveOutboxEntry, origin: ScreenplayDraftSaveOrigin,
        version: BackendScreenplayVersion, versionID: String?, projectID: String?, responseURL: URL?,
        owner: ScreenplayStudioAuthContext, currentOwner: ScreenplayStudioAuthContext) -> URL? {
        guard validID(entry.id, limit: 96), validID(entry.projectId), validID(owner.userID),
              validID(origin.documentID, limit: 128), validID(version.id), versionID == version.id,
              entry.ownerUserId == owner.userID,
              ScreenplayStudioAuthContextPolicy.matches(expected: owner, current: currentOwner),
              projectID == entry.projectId, version.projectId == entry.projectId,
              version.draft?.utf8.elementsEqual(entry.draft.utf8) == true,
              !entry.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let responseURL, OfflineTalkRecoveryScope.sameBackend(origin.backendURL, responseURL),
              let responseOrigin = try? ScreenplayInitialProjectMetadata.origin(responseURL) else { return nil }
        return responseOrigin
    }

    fileprivate static func validID(_ value: String, limit: Int = 128) -> Bool {
        !value.isEmpty && value.utf8.count <= limit &&
            value == value.trimmingCharacters(in: .whitespacesAndNewlines) &&
            value.rangeOfCharacter(from: .controlCharacters) == nil
    }
}

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
        let isRestorable = entry.status == .pending || entry.status == .inflight ||
            (entry.status == .parked && entry.lastError == ScreenplayDraftSaveOutbox.conflictReason)
        guard entry.initialization == nil, isRestorable,
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

/// A superseded save is proven only by an authenticated full-request replay.
/// This evidence does not authorize rebasing the current editor or removing a copy.
nonisolated struct ScreenplayConfirmedSupersededCustodySave: Sendable {
    let saved: ScreenplayConfirmedDraftSave
    let serverHeadID: String

    private init(saved: ScreenplayConfirmedDraftSave, serverHeadID: String) {
        self.saved = saved
        self.serverHeadID = serverHeadID
    }

    static func verify(entry: ScreenplayDraftSaveOutboxEntry,
                       result: BackendReadResult<BackendScreenplayVersionMutationResponse>,
                       owner: ScreenplayStudioAuthContext,
                       currentOwner: ScreenplayStudioAuthContext) -> Self? {
        let response = result.payload
        guard entry.source == "studio_custody_selected", entry.hasExplicitBaseSelection,
              ScreenplayConfirmedDraftSave.validID(entry.baseVersionId), result.httpStatusCode == 409,
              response.stage == "screenplay_version", response.status == "replayed_superseded",
              response.conflict == true, response.replayed == true, response.replayProof == "full_request_hash_v1",
              response.baseVersionId?.utf8.elementsEqual(entry.baseVersionId.utf8) == true,
              entry.ownerUserId.utf8.elementsEqual(owner.userID.utf8),
              owner.userID.utf8.elementsEqual(currentOwner.userID.utf8),
              response.projectId?.utf8.elementsEqual(entry.projectId.utf8) == true,
              let version = response.version, let head = response.serverVersionId,
              ScreenplayConfirmedDraftSave.validID(head), !head.utf8.elementsEqual(version.id.utf8),
              response.versionId?.utf8.elementsEqual(version.id.utf8) == true,
              version.projectId?.utf8.elementsEqual(entry.projectId.utf8) == true,
              version.clientRequestId?.utf8.elementsEqual(entry.id.utf8) == true,
              response.project?.id.utf8.elementsEqual(entry.projectId.utf8) == true,
              response.project?.activeVersionId?.utf8.elementsEqual(head.utf8) == true,
              version.phase?.utf8.elementsEqual(entry.phase.utf8) == true,
              version.source?.utf8.elementsEqual(entry.source.utf8) == true,
              version.notes?.utf8.elementsEqual(entry.notes.utf8) == true,
              ScreenplayDraftSaveMetadataPolicy.matchesServerEcho(
                requestedAnchors: entry.studioWriteAnchors, confirmedAnchors: version.studioWriteAnchors,
                requestedBindings: entry.screenplayBindings, confirmedBindings: version.screenplayBindings),
              let saved = ScreenplayConfirmedDraftSave.ordinary(entry: entry, version: version,
                versionID: response.versionId, projectID: response.projectId, responseURL: result.responseURL,
                owner: owner, currentOwner: currentOwner) else { return nil }
        return .init(saved: saved, serverHeadID: head)
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
              (!entry.draft.isEmpty || (entry.initialization == nil && validID(entry.baseVersionId))),
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

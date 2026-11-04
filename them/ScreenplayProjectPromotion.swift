import Foundation

struct ScreenplayLiveDraftOriginSnapshot: Codable, Equatable, Hashable {
    let updatedAt: Date
    let projectID: String
    let versionID: String
    let documentID: String?

    init(updatedAt: Date = Date(), projectID: String, versionID: String, documentID: String? = nil) {
        self.updatedAt = updatedAt
        self.projectID = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        self.versionID = versionID.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedDocumentID = documentID?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.documentID = normalizedDocumentID?.isEmpty == false ? normalizedDocumentID : nil
    }

    var isEmpty: Bool { projectID.isEmpty && versionID.isEmpty }
    static let empty = Self(updatedAt: .distantPast, projectID: "", versionID: "")
}

/// Editing text (including deleting every character) continues a document.
/// Only accepted project hydration, an explicit clear, or a verified initial
/// project receipt can establish a different document origin.
enum ScreenplayLiveDraftOriginEvent { case edit, acceptedLoad, newDocument }

enum ScreenplayLiveDraftOriginPolicy {
    static func next(from previous: ScreenplayLiveDraftOriginSnapshot,
                     event: ScreenplayLiveDraftOriginEvent, projectID: String, versionID: String,
                     promotedDocumentID: String? = nil) -> ScreenplayLiveDraftOriginSnapshot {
        let project = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let version = versionID.trimmingCharacters(in: .whitespacesAndNewlines)
        let promoted = previous.documentID != nil && previous.documentID == promotedDocumentID
        let hasOrigin = previous.documentID != nil || !previous.isEmpty
        let continuing = event == .edit && hasOrigin && !promoted
        let originProject = continuing ? previous.projectID : project
        let originVersion = continuing && previous.projectID != project ? previous.versionID : version
        let sameDocument = event != .newDocument && (previous.projectID == originProject || promoted)
        return .init(projectID: originProject, versionID: originVersion,
            documentID: sameDocument ? (previous.documentID ?? UUID().uuidString.lowercased()) : UUID().uuidString.lowercased())
    }

    static func restored(encoded: String?, draft: String, projectID: String, versionID: String,
                         fallbackProjectID: String, fallbackVersionID: String) -> ScreenplayLiveDraftOriginSnapshot {
        if let data = encoded?.data(using: .utf8) {
            let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
            if let origin = try? decoder.decode(ScreenplayLiveDraftOriginSnapshot.self, from: data),
               !origin.isEmpty || origin.documentID != nil { return origin }
        }
        guard ScreenplayLiveDraftTextPersistencePolicy.draftForStorage(draft) != nil else { return .empty }
        let project = ScreenplayLivePreferredContextPersistencePolicy.valueForStorage(projectID)
            ?? ScreenplayLivePreferredContextPersistencePolicy.valueForStorage(fallbackProjectID) ?? ""
        let version = ScreenplayLivePreferredContextPersistencePolicy.valueForStorage(versionID)
            ?? ScreenplayLivePreferredContextPersistencePolicy.valueForStorage(fallbackVersionID) ?? ""
        let origin = ScreenplayLiveDraftOriginSnapshot(projectID: project, versionID: version)
        return origin.isEmpty ? .empty : origin
    }

    static func encoded(_ origin: ScreenplayLiveDraftOriginSnapshot) -> String? {
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        return (try? encoder.encode(origin)).flatMap { String(data: $0, encoding: .utf8) }
    }
}

/// Eligibility for the existing restored/committed-page promotion capability.
/// Auth and exact-document identity stay owned by StudioActionDocumentContext.
struct ScreenplayRestoredLiveDraftProjectPromotionPolicy {
    static func committedDraftIsReady(write: ScreenplayCommittedWrite?, draft: String, auth: ScreenplayStudioAuthContext) -> Bool {
        guard let write, write.isAuthoritativeWrite, write.normalizedProjectID.isEmpty,
              !auth.userID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        return ScreenplayStudioAuthContextPolicy.matches(expected: write.authContext, current: auth)
            && write.committedDraft.utf8.elementsEqual(draft.utf8)
    }

    static func shouldCreateProject(
        isStudioSurfaceActive: Bool,
        draft: String,
        existingProjectID: String,
        isAutoCreatingProject: Bool,
        createKey: String,
        lastCreateKey: String
    ) -> Bool {
        guard isStudioSurfaceActive else { return false }
        guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        guard existingProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        guard !isAutoCreatingProject else { return false }
        guard !createKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        return createKey != lastCreateKey
    }

    static func canContinue(
        initiating: StudioActionDocumentContext, current: StudioActionDocumentContext,
        isStudioActive: Bool, isCancelled: Bool
    ) -> Bool {
        !isCancelled && isStudioActive && initiating.projectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && initiating.matches(current)
    }
}

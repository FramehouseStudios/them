import Foundation

/// A document lease does not freeze the writer's text. Ordinary edits stay in
/// the same document; loading another project or clearing it revokes the lease.
nonisolated struct ScreenplayLiveTalkDocument: Equatable, Sendable {
    let owner: ScreenplayStudioAuthContext
    let projectID: String
    let documentID: String

    func permits(owner: ScreenplayStudioAuthContext, projectID: String, documentID: String?,
                 promotedFromDocument: String? = nil) -> Bool {
        ScreenplayStudioAuthContextPolicy.matches(expected: self.owner, current: owner)
            && self.documentID == documentID
            && (self.projectID == projectID || (self.projectID.isEmpty && !projectID.isEmpty
                && promotedFromDocument == self.documentID))
    }
}

nonisolated struct ScreenplayLiveTalkPageContext: Equatable, Sendable {
    let request: BackendTalkLiveRequestContext
    let document: ScreenplayLiveTalkDocument

    @MainActor func permitsDelivery(in bridge: ScreenplayLiveDraftBridge) -> Bool {
        request.owner == document.owner && bridge.permitsLiveTalkDocument(document)
            && OfflineTalkRecoveryScope.sameBackend(request.backendURL, BackendAuthClient.resolvedBackendBaseURL())
    }
}

/// Each native editor owns one gate. Disk completion may resume the latest
/// reveal for this operation, but can never replay an obsolete coordinator
/// request or authorize a different range/text after a writer edit.
@MainActor
final class ScreenplayLivePageMutationGate {
    struct Mutation {
        let context: ScreenplayLiveTalkPageContext
        let before: String
        let range: NSRange
        let insertion: String
        let after: String

        func matches(_ other: Self) -> Bool {
            context == other.context && range == other.range
                && before.utf8.elementsEqual(other.before.utf8)
                && insertion.utf8.elementsEqual(other.insertion.utf8)
                && after.utf8.elementsEqual(other.after.utf8)
        }
    }

    private final class Attempt {
        let mutation: Mutation
        var resume: () -> Void
        var isCurrent: () -> Bool
        var stored = false
        var reportedConflict = false
        nonisolated deinit {}
        init(_ mutation: Mutation, isCurrent: @escaping () -> Bool, resume: @escaping () -> Void) {
            self.mutation = mutation; self.isCurrent = isCurrent; self.resume = resume
        }
    }

    private var attempt: Attempt?
    private let persist: (Mutation) async throws -> Void

    // No teardown touches actor state. Avoid executor-hopping destruction for
    // this coordinator-owned gate (the project's telemetry uses the same rule).
    nonisolated deinit {}

    init(persist: @escaping (Mutation) async throws -> Void = { mutation in
        let request = mutation.context.request
        let owner = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false)
        guard ScreenplayStudioAuthContextPolicy.matches(expected: request.owner, current: owner.ownerContext),
              ScreenplayStudioAuthContextPolicy.matches(expected: mutation.context.document.owner, current: owner.ownerContext) else {
            throw OfflineTalkPreviousOwnerError()
        }
        _ = try await OfflineTalkOutbox.shared.prepareLivePageDelivery(request.admission,
            projectID: mutation.context.document.projectID, documentID: mutation.context.document.documentID,
            beforeDraft: mutation.before, range: mutation.range, insertion: mutation.insertion,
            afterDraft: mutation.after, owner: owner, backendURL: request.backendURL)
    }) { self.persist = persist }

    /// True means the caller must leave native text unchanged. Nil context is
    /// the existing non-live editor path; it does not create a synthetic receipt.
    func shouldDefer(_ context: ScreenplayLiveTalkPageContext?, before: String, range: NSRange,
                     insertion: String, after: String, isCurrent: @escaping () -> Bool,
                     resume: @escaping () -> Void, onFailure: @escaping () -> Void) -> Bool {
        guard let context else { return false }
        guard isCurrent() else { return true }
        let mutation = Mutation(context: context, before: before, range: range, insertion: insertion, after: after)
        if let existing = attempt, existing.mutation.context.request.admission.entryID == context.request.admission.entryID {
            guard existing.mutation.matches(mutation) else {
                if !existing.reportedConflict {
                    existing.reportedConflict = true
                    Task { @MainActor in if isCurrent() { onFailure() } }
                }
                return true
            }
            existing.isCurrent = isCurrent; existing.resume = resume
            return !existing.stored
        }
        let pending = Attempt(mutation, isCurrent: isCurrent, resume: resume)
        attempt = pending
        Task { @MainActor [weak self, weak pending] in
            guard let self, let pending else { return }
            do {
                try await persist(mutation)
                guard attempt === pending else { return }
                pending.stored = true
                if pending.isCurrent() { pending.resume() }
            } catch {
                guard attempt === pending, pending.isCurrent() else { return }
                onFailure()
            }
        }
        return true
    }
}

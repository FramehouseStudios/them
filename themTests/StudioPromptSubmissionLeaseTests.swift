import Combine
import Foundation
import XCTest
@testable import them

@MainActor
final class StudioPromptSubmissionLeaseTests: XCTestCase {
    private let owner = ScreenplayStudioAuthContext(userID: "writer-a", sessionIntentGeneration: 7)
    private let backend = URL(string: "https://studio-owner.test")!

    func testCurrentSubmissionCanPublishAndFinishItsExistingState() {
        let a = state(), currentLease = lease(state: state())
        XCTAssertTrue(canPublish(currentLease, state: a))
        let finished = currentLease.finishedState(state: a)
        XCTAssertEqual(finished?.id, a.id)
        XCTAssertEqual(finished?.startedAt, a.startedAt)
        XCTAssertEqual(finished?.isComplete, true)
        XCTAssertFalse(canPublish(currentLease, state: a.completing()))
        XCTAssertNil(currentLease.finishedState(state: a.completing()), "A completed cleanup cannot clear a later unrelated UI operation")
    }

    func testSamePromptNewRequestCannotBePublishedOrCleanedByOldLease() {
        let a = state(), b = state(id: "request-b", time: 101)
        XCTAssertEqual(a.prompt, b.prompt)
        let old = lease(state: a)
        XCTAssertFalse(canPublish(old, state: b))
        XCTAssertNil(old.finishedState(state: b), "A must not clear B's busy/suggestion state")
    }

    func testReusedRequestIDStillRequiresItsExactOriginalStartedAt() {
        let a = state(), b = state(time: 101)
        XCTAssertEqual(a.id, b.id)
        let old = lease(state: a)
        XCTAssertFalse(canPublish(old, state: b))
        XCTAssertNil(old.finishedState(state: b))
    }

    func testDocumentSwitchRevokesPublicationButNotOriginalDispatchCleanup() {
        let a = state(), old = lease(state: state())
        XCTAssertFalse(canPublish(old, state: a, documentIsCurrent: false, selected: "project-b", origin: "project-b"))
        XCTAssertNotNil(old.finishedState(state: a), "A must release its own busy flag after a page switch")
        XCTAssertNil(old.finishedState(state: state(id: "request-b", time: 101)))
    }

    func testPendingSelectionObsoleteEditorCancellationAndBackendChangeCannotPublish() {
        let a = state(), old = lease(state: state())
        XCTAssertFalse(canPublish(old, state: a, selected: "project-b"))
        XCTAssertFalse(canPublish(old, state: a, currentEditor: false))
        XCTAssertFalse(canPublish(old, state: a, cancelled: true))
        XCTAssertFalse(canPublish(old, state: a, url: URL(string: "https://studio-owner.test:8443")!))
        XCTAssertFalse(canPublish(old, state: a, url: URL(string: "https://other.test")!))
    }

    func testCanonicalDocumentAuthAndIdentityRevocationReachPublicationGate() {
        let a = state(), old = lease(state: state())
        let reauthenticated = ScreenplayStudioAuthContext(userID: owner.userID, sessionIntentGeneration: 8)
        for currentOwner in [reauthenticated, .init(userID: "writer-b", sessionIntentGeneration: 7)] {
            let permitted = old.document.permits(owner: currentOwner, projectID: "project-a", documentID: "document-a")
            XCTAssertFalse(canPublish(old, state: a, documentIsCurrent: permitted))
            XCTAssertFalse(old.stillOwnsScope(documentID: "document-a", owner: currentOwner, backendURL: backend, isCurrentEditor: true))
        }
        XCTAssertFalse(old.stillOwnsScope(documentID: "document-b", owner: owner, backendURL: backend, isCurrentEditor: true))
        XCTAssertTrue(old.stillOwnsScope(documentID: "document-a", owner: owner, backendURL: backend, isCurrentEditor: true))
    }

    func testVerifiedUnboundPromotionSurvivesWhileVMSelectionCatchesUp() {
        let a = state(), old = lease(state: state(), project: "")
        let verified = old.document.permits(owner: owner, projectID: "first-project", documentID: "document-a", promotedFromDocument: "document-a")
        XCTAssertTrue(canPublish(old, state: a, documentIsCurrent: verified, selected: "", origin: "first-project"))
        XCTAssertTrue(canPublish(old, state: a, documentIsCurrent: verified, selected: "first-project", origin: "first-project"))
        let copied = old.document.permits(owner: owner, projectID: "copied-project", documentID: "document-a")
        XCTAssertFalse(canPublish(old, state: a, documentIsCurrent: copied, selected: "copied-project", origin: "copied-project"))
    }

    func testNewSeedIncludingCompositionOnlyEditIsNeverClearedAsOriginal() {
        let original = "\r\nCafe\u{0301}.  \t"
        XCTAssertTrue(StudioPromptSubmissionLease.mayClearSeed(original: original, current: original))
        XCTAssertFalse(StudioPromptSubmissionLease.mayClearSeed(original: original, current: "\r\nCaf\u{00e9}.  \t"))
        XCTAssertFalse(StudioPromptSubmissionLease.mayClearSeed(original: original, current: original + "New idea"))
    }

    func testNewReplacementSelectionIsNotClearedByOldRequest() {
        let target = UUID(), next = UUID()
        let old = lease(state: state(), pending: target, submitted: target)
        XCTAssertTrue(old.ownsReplacement(pendingID: target, submittedID: target))
        XCTAssertFalse(old.ownsReplacement(pendingID: next, submittedID: target))
        XCTAssertFalse(old.ownsReplacement(pendingID: next, submittedID: next))
    }

    func testTargetedStopCannotRevokeNewerReusedIDOrAnotherScope() throws {
        let scope = recoveryScope(), a = state()
        let signal = try XCTUnwrap(StudioPromptSubmissionLease.stopSignal(
            dispatchFingerprint: StudioPromptSubmissionLease.dispatchFingerprint(requestID: a.id),
            dispatchStartedAt: Date(timeIntervalSince1970: 100.5), scope: scope))
        let note = Notification(name: .themStudioPromptSubmissionStopped, object: signal)
        XCTAssertTrue(StudioPromptSubmissionLease.shouldRevoke(state: a, notification: note, currentScope: scope, isCurrentEditor: true))
        for current in [state(time: 101), state(id: "request-b"), a.completing(), .idle] {
            XCTAssertFalse(StudioPromptSubmissionLease.shouldRevoke(state: current, notification: note, currentScope: scope, isCurrentEditor: true))
        }
        XCTAssertFalse(StudioPromptSubmissionLease.shouldRevoke(state: a, notification: note, currentScope: recoveryScope(user: "writer-b"), isCurrentEditor: true))
        XCTAssertFalse(StudioPromptSubmissionLease.shouldRevoke(state: a, notification: note, currentScope: recoveryScope(url: URL(string: "https://other.test")!), isCurrentEditor: true))
        XCTAssertFalse(StudioPromptSubmissionLease.shouldRevoke(state: a, notification: note, currentScope: scope, isCurrentEditor: false))
    }

    func testUnrelatedVoiceStopAndEmptyTypedIDCannotProduceGlobalScreenStop() {
        for fingerprint in ["voice-hash", "", "typed:", "typed:  "] {
            XCTAssertNil(StudioPromptSubmissionLease.stopSignal(dispatchFingerprint: fingerprint,
                dispatchStartedAt: Date(), scope: recoveryScope()))
        }
        XCTAssertFalse(StudioPromptSubmissionLease.shouldRevoke(state: state(), notification:
            Notification(name: .themStudioPromptSubmissionStopped, object: nil), currentScope: recoveryScope(), isCurrentEditor: true))
    }

    func testOnlyExplicitNewTypedIDMaySupersedeTypedBusyState() {
        let typed = StudioPromptSubmissionLease.dispatchFingerprint(requestID: "request-a")
        XCTAssertTrue(StudioPromptSubmissionLease.maySupersedeTyped(dispatchFingerprint: typed, newRequestID: "request-b"))
        for next in ["", "  ", "request-a", " request-a "] {
            XCTAssertFalse(StudioPromptSubmissionLease.maySupersedeTyped(dispatchFingerprint: typed, newRequestID: next))
        }
        for current in ["voice-hash", "", "typed:", "typed:  "] {
            XCTAssertFalse(StudioPromptSubmissionLease.maySupersedeTyped(dispatchFingerprint: current, newRequestID: "request-b"))
        }
    }

    func testCommittedWriteWaitStopsOnLeaseRevocationWithoutReadingNewPageWrite() async {
        var reads = 0
        let result = await StudioPromptSubmissionLease.waitForCommittedWrite(submittedAt: Date(),
            isCurrent: { reads == 0 }, currentWrite: { reads += 1; return nil })
        XCTAssertNil(result)
        XCTAssertEqual(reads, 1)
    }

    func testCurrentCommittedWriteCanCompleteAndCancelledWaitCannotReadIt() async {
        let since = Date(), write = committedWrite(at: Date())
        let current = await StudioPromptSubmissionLease.waitForCommittedWrite(submittedAt: since,
            isCurrent: { true }, currentWrite: { write })
        XCTAssertEqual(current?.id, write.id)
        var reads = 0
        let cancelled = Task { @MainActor in
            await StudioPromptSubmissionLease.waitForCommittedWrite(submittedAt: since,
                isCurrent: { true }, currentWrite: { reads += 1; return write })
        }
        cancelled.cancel()
        let cancelledResult = await cancelled.value
        XCTAssertNil(cancelledResult)
        XCTAssertEqual(reads, 0)
    }

    func testScopedWatcherReleasesOriginalBusyStateWhenItsDocumentChanges() async {
        let changes = PassthroughSubject<Void, Never>(), observed = expectation(description: "watcher attached")
        var current = state(), documentOwned = true, checks = 0, revocations = 0
        let old = lease(state: current)
        let watcher = Task { @MainActor in
            await StudioPromptSubmissionLease.watchRevocation(changes: changes.eraseToAnyPublisher(),
                isCurrent: { old.ownsDispatch(state: current) && current.isActive },
                stillOwned: { checks += 1; if checks == 1 { observed.fulfill() }; return documentOwned },
                onRevoked: { revocations += 1; if let finished = old.finishedState(state: current) { current = finished } })
        }
        await fulfillment(of: [observed], timeout: 2)
        documentOwned = false; changes.send(())
        await watcher.value
        XCTAssertEqual(revocations, 1)
        XCTAssertTrue(current.isComplete)
    }

    func testDelayedWatcherEventCannotFinishNewerSubmission() async {
        let changes = PassthroughSubject<Void, Never>(), observed = expectation(description: "watcher attached")
        var current = state(), checks = 0, revocations = 0
        let old = lease(state: current)
        let watcher = Task { @MainActor in
            await StudioPromptSubmissionLease.watchRevocation(changes: changes.eraseToAnyPublisher(),
                isCurrent: { old.ownsDispatch(state: current) && current.isActive },
                stillOwned: { checks += 1; if checks == 1 { observed.fulfill() }; return true }, onRevoked: { revocations += 1 })
        }
        await fulfillment(of: [observed], timeout: 2)
        current = state(time: 101); changes.send(())
        await watcher.value
        XCTAssertEqual(revocations, 0)
        XCTAssertTrue(current.isActive)
        XCTAssertEqual(current.startedAt, Date(timeIntervalSince1970: 101))
    }

    #if DEBUG || os(macOS)
    func testExtractedDebugClassifierRetainsExistingRouting() {
        XCTAssertEqual(StudioPromptSubmissionLease.debugMemoryDomain(for: "I feel stuck", routesToPage: false), .companion)
        XCTAssertEqual(StudioPromptSubmissionLease.debugMemoryDomain(for: "I feel stuck with this scene", routesToPage: false), .mixed)
        XCTAssertEqual(StudioPromptSubmissionLease.debugMemoryDomain(for: "I feel stuck", routesToPage: true), .project)
        XCTAssertEqual(StudioPromptSubmissionLease.debugMemoryDomain(for: "Rewrite the midpoint", routesToPage: false), .project)
    }
    #endif

    private func state(id: String = "request-a", time: TimeInterval = 100) -> StudioPerceivedSpeedState {
        .start(requestID: id, prompt: "Write the same scene", target: .page, sourceRaw: "typed", now: Date(timeIntervalSince1970: time))
    }
    private func lease(state: StudioPerceivedSpeedState, project: String = "project-a", pending: UUID? = nil,
        submitted: UUID? = nil) -> StudioPromptSubmissionLease {
        .init(document: .init(owner: owner, projectID: project, documentID: "document-a"), backendURL: backend,
            state: state, pendingReplacementID: pending, submittedReplacementID: submitted)
    }
    private func canPublish(_ lease: StudioPromptSubmissionLease, state: StudioPerceivedSpeedState,
        documentIsCurrent: Bool = true, selected: String = "project-a", origin: String = "project-a",
        currentEditor: Bool = true, cancelled: Bool = false, url: URL? = nil) -> Bool {
        lease.mayPublish(state: state, documentIsCurrent: documentIsCurrent, backendURL: url ?? backend,
            selectedProjectID: selected, originProjectID: origin, isCurrentEditor: currentEditor, isCancelled: cancelled)
    }
    private func recoveryScope(user: String = "writer-a", url: URL? = nil) -> OfflineTalkRecoveryScope {
        .init(identity: .init(sessionEpoch: 1, userID: user, clientToken: "fixture-client", accessToken: "fixture-token", sessionIntentGeneration: 7),
            backendURL: url ?? backend)
    }
    private func committedWrite(at date: Date) -> ScreenplayCommittedWrite {
        .init(id: UUID(), writeID: "write-a", projectID: "project-a", versionID: "v1", previousDraft: "Before",
            committedDraft: "Before\nAfter", insertedText: "After", replacementApplied: false, replacedWriteID: nil,
            startLine: 2, endLine: 2, committedAt: date, authContext: owner)
    }
}

import Foundation
import SwiftUI
import XCTest
#if os(iOS)
    func testActualActiveStreamingPreviewCommitsOnlyAfterOriginalMutationIsDurable() async throws {
        try await proveNativeInsertion(mode: .streamCommit, activePreview: true)
    }

    func testActualActiveStreamingCommitCannotResumeAfterProjectSwitch() async throws {
        try await proveNativeInsertion(mode: .streamCommit, switchProject: true, activePreview: true)
    }

import UIKit
#endif
@testable import them

@MainActor
final class ScreenplayLivePageMutationGateTests: XCTestCase {
    private var directory: URL!
    private let backend = URL(string: "https://native-page.test")!
    private let owner = BackendAuthRequestIdentity(sessionEpoch: 1, userID: "page-writer",
        clientToken: "fixture-client", accessToken: "fixture-access", sessionIntentGeneration: 1)
    private let before = "INT. ROOM - NIGHT\n\nCafe\u{0301}.  \n"
    private let insertion = "JOHN\nKeep the scar."
    private var after: String { before + insertion }
    private var range: NSRange { NSRange(location: (before as NSString).length, length: 0) }

    override func setUp() {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("NativePage-\(UUID())")
    }
    override func tearDownWithError() throws {
        if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
    }

    func testNativeMutationWaitsForRealDurableIntentAndResumesOnlyLatestReveal() async throws {
        let box = queue(), context = try await context(box)
        let entered = expectation(description: "before disk"), resumed = expectation(description: "latest reveal")
        var release: CheckedContinuation<Void, Never>?, writes = 0, oldReplays = 0, latestReplays = 0
        let gate = ScreenplayLivePageMutationGate { [self] mutation in
            writes += 1
            await withCheckedContinuation { release = $0; entered.fulfill() }
            try await persist(mutation, in: box)
        }
        XCTAssertTrue(deferMutation(gate, context: context, resume: { oldReplays += 1 }))
        await fulfillment(of: [entered], timeout: 3)
        XCTAssertEqual(oldReplays, 0)
        XCTAssertTrue(deferMutation(gate, context: context, resume: { latestReplays += 1; resumed.fulfill() }))
        release?.resume()
        await fulfillment(of: [resumed], timeout: 3)
        XCTAssertEqual(writes, 1); XCTAssertEqual(oldReplays, 0); XCTAssertEqual(latestReplays, 1)
        XCTAssertFalse(deferMutation(gate, context: context, resume: { XCTFail("Authorized mutation was delayed again") }))
        let export = try await queue().exportRecoveryEntry(context.request.admission.entryID,
            initiatingIdentity: owner, backendURL: backend)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: export.data) as? [String: Any])
        let plan = try XCTUnwrap(json["page_delivery"] as? [String: Any])
        XCTAssertTrue((plan["afterDraft"] as? String)?.utf8.elementsEqual(after.utf8) == true)
        XCTAssertEqual(json["delivery_state"] as? String, "prepared_reply_incomplete")
    }

    func testScopeChangeDuringDiskWriteKeepsIntentWithoutResumingForeignDocument() async throws {
        let box = queue(), context = try await context(box)
        let entered = expectation(description: "disk held"), finished = expectation(description: "disk finished")
        var release: CheckedContinuation<Void, Never>?, current = true, replays = 0
        let gate = ScreenplayLivePageMutationGate { [self] mutation in
            await withCheckedContinuation { release = $0; entered.fulfill() }
            try await persist(mutation, in: box)
            finished.fulfill()
        }
        XCTAssertTrue(deferMutation(gate, context: context, isCurrent: { current }, resume: { replays += 1 }))
        await fulfillment(of: [entered], timeout: 3)
        current = false; release?.resume()
        await fulfillment(of: [finished], timeout: 3)
        await Task.yield()
        XCTAssertEqual(replays, 0)
        let kept = await queue().allEntries()
        XCTAssertEqual(kept.first?.hasLivePageIntent, true)
        XCTAssertTrue(deferMutation(gate, context: context, isCurrent: { current }, resume: { replays += 1 }))
        XCTAssertEqual(replays, 0)
    }

    func testChangedSelectionOrExactBytesCannotReuseEarlierAuthorization() async throws {
        let box = queue(), context = try await context(box)
        let resumed = expectation(description: "stored"), rejected = expectation(description: "changed bytes rejected")
        var writes = 0
        let gate = ScreenplayLivePageMutationGate { [self] mutation in
            writes += 1; try await persist(mutation, in: box)
        }
        XCTAssertTrue(deferMutation(gate, context: context, resume: { resumed.fulfill() }))
        await fulfillment(of: [resumed], timeout: 3)
        let composed = before.precomposedStringWithCanonicalMapping
        XCTAssertEqual(before, composed)
        XCTAssertTrue(gate.shouldDefer(context, before: composed, range: NSRange(location: 0, length: 0),
            insertion: insertion, after: insertion + composed, isCurrent: { true },
            resume: { XCTFail("Wrong selection reused authorization") }, onFailure: { rejected.fulfill() }))
        await fulfillment(of: [rejected], timeout: 3)
        XCTAssertEqual(writes, 1)
    }

    func testDiskFailurePreventsMutationAndDoesNotStartAnAutomaticWriteLoop() async throws {
        let box = queue(), context = try await context(box), failed = expectation(description: "failed once")
        var writes = 0
        let gate = ScreenplayLivePageMutationGate { _ in writes += 1; throw CocoaError(.fileWriteNoPermission) }
        XCTAssertTrue(deferMutation(gate, context: context, resume: { XCTFail("Disk failure changed text") },
            onFailure: { failed.fulfill() }))
        await fulfillment(of: [failed], timeout: 3)
        XCTAssertTrue(deferMutation(gate, context: context, resume: { XCTFail("Repeat bypassed failed custody") }))
        await Task.yield()
        XCTAssertEqual(writes, 1)
    }

    func testOrdinaryNonLiveEditorInsertionDoesNotCreateAReplyReceipt() {
        let gate = ScreenplayLivePageMutationGate { _ in XCTFail("Ordinary edit created synthetic reply custody") }
        XCTAssertFalse(deferMutation(gate, context: nil, resume: { XCTFail("Ordinary insertion was deferred") }))
    }

    func testDocumentLeaseAllowsEditsAndOnlyVerifiedInitialPromotion() {
        let auth = owner.ownerContext, doc = ScreenplayLiveTalkDocument(owner: owner.ownerContext, projectID: "", documentID: "d")
        XCTAssertTrue(doc.permits(owner: auth, projectID: "", documentID: "d"))
        XCTAssertFalse(doc.permits(owner: auth, projectID: "project-b", documentID: "d"))
        XCTAssertTrue(doc.permits(owner: auth, projectID: "first-project", documentID: "d", promotedFromDocument: "d"))
        XCTAssertFalse(doc.permits(owner: .init(userID: auth.userID, sessionIntentGeneration: 2), projectID: "", documentID: "d"))
        XCTAssertFalse(doc.permits(owner: auth, projectID: "", documentID: "cleared"))
        let bound = ScreenplayLiveTalkDocument(owner: auth, projectID: "a", documentID: "d")
        XCTAssertFalse(bound.permits(owner: auth, projectID: "b", documentID: "d", promotedFromDocument: "d"))
    }

    func testOwnerMismatchCannotStartANilContextLegacyPlaybackPlan() async throws {
        let bridge = ScreenplayLiveDraftBridge.shared
        bridge.reconcileAccountStorage()
        let saved = (bridge.draftText, bridge.preferredProjectID, bridge.preferredVersionID, bridge.pendingInsertion)
        defer {
            bridge.resetSyncedVoiceTurnTracking(); bridge.pendingInsertion = saved.3
            _ = bridge.adoptLoadedProjectDraft(saved.0, projectID: saved.1, versionID: saved.2, owner: .current())
        }
        _ = bridge.adoptLoadedProjectDraft(before, projectID: "owned-a", versionID: "v1", owner: .current())
        let document = try XCTUnwrap(bridge.captureLiveTalkDocument()), context = try await context(queue())
        ConfirmedStudioTurnPreparation.configureSyncedInsertion(enabled: true, requestID: context.request.requestID, bridge: bridge)
        bridge.pendingInsertion = nil
        let different = ScreenplayStudioAuthContext(userID: document.owner.userID + "-another",
            sessionIntentGeneration: document.owner.sessionIntentGeneration)
        bridge.stageLiveTalkPageContext(.init(admission: context.request.admission, owner: different, backendURL: backend), document: document)
        bridge.stageSyncedVoiceTurnAuthoritativeContent(text: insertion, timingSource: "fixture", audioDuration: 1)
        XCTAssertNil(bridge.startStagedSyncedVoiceInsert(audioDuration: 1, playbackTimeProvider: { 0 }, playbackObservationProvider: { nil }))
        XCTAssertNil(bridge.pendingInsertion)
        XCTAssertFalse(bridge.syncedVoiceTurnState.failureReason?.isEmpty ?? true)
    }

#if os(iOS)
    func testActualNativeStandardInsertionWaitsForDurableIntent() async throws {
        try await proveNativeInsertion(mode: .insert)
    }

    func testActualNativeVoiceRevealPrepareWaitsForDurableIntent() async throws {
        try await proveNativeInsertion(mode: .voiceRevealPrepare)
    }

    func testActualNativePrepareCannotResumeAfterProjectSwitch() async throws {
        try await proveNativeInsertion(mode: .voiceRevealPrepare, switchProject: true)
    }

    func testStopRevokesActualFallbackWhileItsIntentWriteIsHeld() async throws {
        try await proveNativeInsertion(mode: .insert, stopBeforePersistFinishes: true)
    }

    func testLiveNativeRequestCannotSilentlyFallBackWhenContextIsMissing() async throws {
        try await proveNativeInsertion(mode: .voiceRevealPrepare, missingContext: true)
    }

    private func proveNativeInsertion(mode: ScreenplayInsertionRequest.Mode, switchProject: Bool = false,
        stopBeforePersistFinishes: Bool = false, missingContext: Bool = false, activePreview: Bool = false) async throws {
        let bridge = ScreenplayLiveDraftBridge.shared
        bridge.reconcileAccountStorage()
        let saved = (bridge.draftText, bridge.preferredProjectID, bridge.preferredVersionID, bridge.pendingInsertion)
        defer {
            bridge.resetSyncedVoiceTurnTracking()
            bridge.pendingInsertion = saved.3
            _ = bridge.adoptLoadedProjectDraft(saved.0, projectID: saved.1, versionID: saved.2, owner: .current())
        }
        _ = bridge.adoptLoadedProjectDraft(before, projectID: "native-a", versionID: "v1", owner: .current())
        let document = try XCTUnwrap(bridge.captureLiveTalkDocument())
        let nativeBackend = BackendAuthClient.resolvedBackendBaseURL(), box = queue(backendURL: nativeBackend)
        let context = try await context(box, document: document, backendURL: nativeBackend)
        let anchor = ScreenplayPageAnchor(projectId: "", sceneId: "", beatId: nil, scriptNodeId: "",
            pageIndex: nil, rangeStart: 0, rangeEnd: 0, anchorLine: nil, anchorEndLine: nil, insertMode: nil)
        let timeline = ScreenplayDialogueTimelineRevision(turnId: "native-turn", revisionId: "r1", audioAssetId: "fixture",
            durationMs: 1_000, documentRevisionId: "", insertionAnchor: anchor, segments: [])
        let reveal = ScreenplayVoiceRevealPresentationState(sessionID: context.request.requestID, timeline: timeline,
            visibleUTF16Length: 0, activeSegmentID: nil, phase: .prepared)
        bridge.pendingInsertion = .init(text: insertion, mode: mode, requiresLivePageContext: true,
            livePageContext: missingContext ? nil : context,
            voiceRevealState: mode == .insert ? nil : reveal)
        if stopBeforePersistFinishes {
            bridge.prepareSyncedVoiceTurn(requestID: context.request.requestID, requiresLivePageContext: true)
            bridge.stageLiveTalkPageContext(context.request, document: document)
            XCTAssertNotNil(bridge.queueStagedLiveTalkPageFallback(insertion))
            XCTAssertEqual(bridge.pendingInsertion?.mode, .insert)
        }
        var model = before
        let editor = UITextView(); editor.text = before
        editor.selectedRange = range
        let coordinator = IOSCursorInsertTextEditor(text: Binding(get: { model }, set: { model = $0 }),
            activeScreenplayElement: .constant(.action), insertionRequest: Binding(get: { bridge.pendingInsertion }, set: { bridge.pendingInsertion = $0 }),
            lineJumpRequest: .constant(nil), lineHighlightRequest: .constant(nil), anchoredTextRectRequest: .constant(nil),
            anchoredTextRectSnapshot: .constant(nil), editorFocusRequest: .constant(nil), editorActionRequest: .constant(nil),
            editorSelection: .constant(nil), currentCursorLine: .constant(1), lastCommittedWrite: .constant(nil),
            pendingReplacementTarget: .constant(nil), submittedReplacementTarget: .constant(nil)).makeCoordinator()
        coordinator.textView = editor
        let heldText = activePreview ? before + "JOHN\nPartial" : before
        if activePreview {
            model = heldText; editor.text = heldText
            coordinator.streamingPreviewBaseText = before
            coordinator.streamingPreviewOriginalSelection = range
            coordinator.streamingPreviewRange = NSRange(location: range.location, length: ("JOHN\nPartial" as NSString).length)
        }
        coordinator.primeParagraphElements(for: heldText, attributedText: editor.attributedText)
        let entered = expectation(description: "native held"), savedIntent = expectation(description: "native stored")
        entered.isInverted = missingContext
        savedIntent.isInverted = missingContext
        var release: CheckedContinuation<Void, Never>?
        coordinator.livePageMutationGate = .init { [self] mutation in
            await withCheckedContinuation { release = $0; entered.fulfill() }
            // A task-owned queue/fixture identity isolates native ordering from
            // the host app's account; production uses the canonical default.
            try await persist(mutation, in: box)
            savedIntent.fulfill()
        }
        coordinator.beginRepresentableUpdate()
        coordinator.applyInsertion(try XCTUnwrap(bridge.pendingInsertion))
        coordinator.endRepresentableUpdate()
        await fulfillment(of: missingContext ? [entered, savedIntent] : [entered], timeout: missingContext ? 0.1 : 3)
        XCTAssertTrue((editor.text ?? "").utf8.elementsEqual(heldText.utf8))
        XCTAssertTrue(model.utf8.elementsEqual(heldText.utf8))
        if missingContext {
            let kept = await queue(backendURL: nativeBackend).allEntries()
            XCTAssertNotEqual(kept.first?.hasLivePageIntent, true)
            return
        }
        if stopBeforePersistFinishes {
            bridge.cancelStream(reason: .cancel)
            XCTAssertNil(bridge.pendingInsertion, "Stop left a queued live fallback authorized")
        }
        if switchProject {
            _ = bridge.adoptLoadedProjectDraft("B's exact words.  ", projectID: "native-b", versionID: "b1", owner: .current())
        }
        release?.resume()
        await fulfillment(of: [savedIntent], timeout: 3)
        let deadline = Date().addingTimeInterval(3)
        if switchProject || stopBeforePersistFinishes {
            await Task.yield()
            XCTAssertTrue(model.utf8.elementsEqual(heldText.utf8))
            XCTAssertTrue((editor.text ?? "").utf8.elementsEqual(heldText.utf8))
            if switchProject {
                XCTAssertEqual(bridge.preferredProjectID, "native-b")
                XCTAssertTrue(bridge.draftText.utf8.elementsEqual("B's exact words.  ".utf8))
            }
        } else {
            while model.utf8.elementsEqual(heldText.utf8), Date() < deadline { await Task.yield() }
            XCTAssertTrue(model.contains(insertion))
            XCTAssertTrue((editor.text ?? "").contains(insertion))
        }
        let rows = await queue(backendURL: nativeBackend).allEntries()
        XCTAssertEqual(rows.first?.hasLivePageIntent, true)
        if activePreview {
            let exported = try await box.exportRecoveryEntry(context.request.admission.entryID, initiatingIdentity: owner, backendURL: nativeBackend)
            let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: exported.data) as? [String: Any])
            let plan = try XCTUnwrap(payload["page_delivery"] as? [String: Any])
            XCTAssertEqual(plan["beforeDraft"] as? String, before)
            XCTAssertEqual(plan["afterDraft"] as? String, after)
            XCTAssertFalse((plan["beforeDraft"] as? String ?? "").contains("Partial"))
        }
    }
#endif

    private func deferMutation(_ gate: ScreenplayLivePageMutationGate, context: ScreenplayLiveTalkPageContext?,
        isCurrent: @escaping () -> Bool = { true }, resume: @escaping () -> Void,
        onFailure: @escaping () -> Void = { XCTFail("Unexpected custody failure") }) -> Bool {
        gate.shouldDefer(context, before: before, range: range, insertion: insertion, after: after,
            isCurrent: isCurrent, resume: resume, onFailure: onFailure)
    }
    private func queue(backendURL: URL? = nil) -> OfflineTalkOutbox {
        let owner = owner, backend = backendURL ?? backend
        return .init(storageDirectory: directory, requestIdentityProvider: { _ in owner }, backendURLProvider: { backend })
    }
    private func context(_ box: OfflineTalkOutbox, document: ScreenplayLiveTalkDocument? = nil, backendURL: URL? = nil) async throws -> ScreenplayLiveTalkPageContext {
        let backend = backendURL ?? backend
        var request = URLRequest(url: backend.appendingPathComponent("talk")); request.httpMethod = "POST"
        request.setValue(owner.userID, forHTTPHeaderField: "X-User-Id")
        request.setValue("Bearer \(owner.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("native-page-request", forHTTPHeaderField: "X-Idempotency-Key")
        request.setValue("audio/wav", forHTTPHeaderField: "Content-Type")
        let admission = try await box.admitLiveTalk(request: request, body: Data("Original request".utf8), owner: owner, backendURL: backend)
        return .init(request: .init(admission: admission, owner: document?.owner ?? owner.ownerContext, backendURL: backend),
            document: document ?? .init(owner: owner.ownerContext, projectID: "project-a", documentID: "document-a"))
    }
    private func persist(_ mutation: ScreenplayLivePageMutationGate.Mutation, in box: OfflineTalkOutbox) async throws {
        _ = try await box.prepareLivePageDelivery(mutation.context.request.admission,
            projectID: mutation.context.document.projectID, documentID: mutation.context.document.documentID,
            beforeDraft: mutation.before, range: mutation.range, insertion: mutation.insertion, afterDraft: mutation.after,
            owner: owner, backendURL: mutation.context.request.backendURL)
    }
}

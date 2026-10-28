import Foundation
import XCTest
@testable import them

@MainActor
final class ScreenplayRenderPageContextTests: XCTestCase {
    func testImmediateAndStreamedRenderCarryOriginalContextIntoNativeRequests() async throws {
        try await withContext { bridge, context in
            bridge.ingestVoiceTurn("JOHN\nKeep the scar.", pack: "scene", phase: "draft", projectId: context.document.projectID,
                versionId: "v1", forceInsert: true, livePageContext: context)
            XCTAssertEqual(bridge.pendingInsertion?.mode, .insert)
            XCTAssertEqual(bridge.pendingInsertion?.livePageContext, context)
            XCTAssertEqual(bridge.pendingInsertion?.requiresLivePageContext, true)
            bridge.commitStreamingVoiceTurn("JOHN\nI was listening.", pack: "scene", phase: "draft", projectId: context.document.projectID,
                versionId: "v1", forceInsert: true, livePageContext: context)
            XCTAssertEqual(bridge.pendingInsertion?.mode, .streamCommit)
            XCTAssertEqual(bridge.pendingInsertion?.livePageContext, context)
            XCTAssertEqual(bridge.pendingInsertion?.requiresLivePageContext, true)
            XCTAssertFalse(bridge.isStreamingDraftPreviewActive)
        }
    }

    func testSupersededDocumentCannotPublishRenderMetadataOrInsertion() async throws {
        try await withContext { bridge, context in
            bridge.adoptLoadedProjectDraft("Writer B exact words.  \r\n", projectID: "another-project", versionID: "b1", owner: .current())
            let originalTurn = bridge.latestVoiceTurn, originalDraft = bridge.draftText
            bridge.pendingInsertion = nil
            bridge.ingestVoiceTurn("Wrong A", pack: "a", phase: "draft", projectId: context.document.projectID,
                versionId: "a1", forceInsert: true, livePageContext: context)
            bridge.commitStreamingVoiceTurn("Wrong A final", pack: "a", phase: "draft", projectId: context.document.projectID,
                versionId: "a1", forceInsert: true, livePageContext: context)
            bridge.streamInsert("Wrong A direct", livePageContext: context)
            XCTAssertNil(bridge.pendingInsertion)
            XCTAssertEqual(bridge.latestVoiceTurn, originalTurn)
            XCTAssertTrue(bridge.draftText.utf8.elementsEqual(originalDraft.utf8))
            XCTAssertEqual(bridge.preferredProjectID, "another-project")
        }
    }

    func testWrongResponseProjectCannotRelabelOwnedOriginalDocument() async throws {
        try await withContext { bridge, context in
            bridge.pendingInsertion = nil
            bridge.ingestVoiceTurn("A reply for B", pack: "scene", phase: "draft", projectId: "other-project",
                versionId: "b1", forceInsert: true, livePageContext: context)
            XCTAssertNil(bridge.pendingInsertion)
            XCTAssertEqual(bridge.preferredProjectID, context.document.projectID)
        }
    }

    func testStaleMemoryCorrectionCancelsBeforeAnyValidationOrAPICall() async {
        let bridge = ScreenplayLiveDraftBridge.shared, original = bridge.latestAppliedMemory
        do {
            _ = try await bridge.saveInlineAppliedMemoryCorrection("") { false }
            XCTFail("An expired request entered memory correction")
        } catch { XCTAssertTrue(error is CancellationError) }
        XCTAssertEqual(bridge.latestAppliedMemory, original)
    }

    private func withContext(_ operation: (ScreenplayLiveDraftBridge, ScreenplayLiveTalkPageContext) throws -> Void) async throws {
        let bridge = ScreenplayLiveDraftBridge.shared
        bridge.reconcileAccountStorage()
        let draft = bridge.draftText, project = bridge.preferredProjectID, version = bridge.preferredVersionID
        let binding = bridge.projectBinding, pending = bridge.pendingInsertion
        let voice = bridge.latestVoiceTurn, pack = bridge.latestPack, phase = bridge.latestPhase, transcript = bridge.latestUserTranscript
        let status = bridge.autoInsertStatusText
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("RenderContext-\(UUID())")
        defer {
            bridge.cancelStream()
            bridge.projectBinding = binding
            bridge.adoptLoadedProjectDraft(draft, projectID: project, versionID: version, owner: .current())
            bridge.pendingInsertion = pending
            bridge.latestVoiceTurn = voice; bridge.latestPack = pack; bridge.latestPhase = phase
            bridge.latestUserTranscript = transcript; bridge.autoInsertStatusText = status
            try? FileManager.default.removeItem(at: directory)
        }
        bridge.adoptLoadedProjectDraft("INT. ROOM - NIGHT\nWriter words.", projectID: "render-context-\(UUID())", versionID: "v1", owner: .current())
        let document = try XCTUnwrap(bridge.captureLiveTalkDocument())
        let identity = BackendAuthRequestIdentity(sessionEpoch: 1, userID: document.owner.userID, clientToken: "fixture-client",
            accessToken: "fixture-access", sessionIntentGeneration: document.owner.sessionIntentGeneration)
        let backend = BackendAuthClient.resolvedBackendBaseURL()
        let outbox = OfflineTalkOutbox(storageDirectory: directory, requestIdentityProvider: { _ in identity }, backendURLProvider: { backend })
        var request = URLRequest(url: backend.appendingPathComponent(StudioRenderEndpoint.oneShotPath)); request.httpMethod = "POST"
        request.setValue(identity.userID, forHTTPHeaderField: "X-User-Id")
        request.setValue("Bearer \(identity.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Idempotency-Key"); request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body = try JSONSerialization.data(withJSONObject: ["transcript":"Write", "screenplay_target":"page", "screenplay_project_id":document.projectID])
        let admission = try await outbox.admitLiveStudioRender(request: request, body: body, owner: identity, backendURL: backend)
        try operation(bridge, .init(request: .init(admission: admission, owner: document.owner, backendURL: backend), document: document))
    }
}

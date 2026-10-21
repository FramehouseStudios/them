import XCTest
import SwiftUI
@testable import them
#if os(iOS)
import UIKit
#endif

@MainActor
final class ScreenplayPreviewCancellationTests: XCTestCase {
    private let baseline = "INT. ROOM - DAY\n\nThe writer's original words."
    private let page = "INT. OBSERVATORY - NIGHT\n\nMara watches the false stars.\n\nELI\nKeep the original words safe."

    func testInactivePreviewCleanupDoesNotCancelOrdinaryPageStream() async {
        await withBridge { bridge in
            bridge.streamInsert(page)
            await waitUntil { bridge.pendingInsertion != nil }
            let requestID = bridge.pendingInsertion?.id
            XCTAssertNotNil(requestID)
            bridge.cancelStreamingVoiceTurnPreview()
            guard bridge.pendingInsertion?.id == requestID else {
                XCTFail("Inactive preview cleanup replaced an unrelated page stream with cancellation")
                return
            }
            await waitUntil { bridge.pendingInsertion?.mode == .streamInsertFinalize }
            XCTAssertEqual(bridge.pendingInsertion?.mode, .streamInsertFinalize)
            XCTAssertEqual(bridge.pendingInsertion?.text, page)
        }
    }

    func testInactivePreviewCleanupPreservesAQueuedFinalCommit() async {
        await withBridge { bridge in
            let request = ScreenplayInsertionRequest(text: page, mode: .streamInsertFinalize)
            bridge.pendingInsertion = request
            bridge.cancelStreamingVoiceTurnPreview()
            XCTAssertEqual(bridge.pendingInsertion?.id, request.id)
            XCTAssertEqual(bridge.pendingInsertion?.text, page)
            XCTAssertEqual(bridge.pendingInsertion?.mode, .streamInsertFinalize)
        }
    }

    func testActivePreviewCancellationRestoresTheNativeBaseline() async throws {
        try await withBridge { bridge in
            bridge.previewVoiceTurn("INT. PREVIEW ONLY - NIGHT", pack: "", phase: "", projectId: bridge.preferredProjectID, versionId: bridge.preferredVersionID)
            let preview = try XCTUnwrap(bridge.pendingInsertion)
            XCTAssertEqual(preview.mode, .streamPreview)
            XCTAssertTrue(bridge.isStreamingDraftPreviewActive)
#if os(iOS)
            var model = baseline
            let editor = UITextView()
            editor.text = model
            let coordinator = makeCoordinator(text: Binding(get: { model }, set: { model = $0 }))
            coordinator.textView = editor
            coordinator.primeParagraphElements(for: model, attributedText: editor.attributedText)
            coordinator.applyInsertion(preview)
            XCTAssertTrue((editor.text ?? "").contains("PREVIEW ONLY"))
#endif
            bridge.cancelStreamingVoiceTurnPreview()
            XCTAssertFalse(bridge.isStreamingDraftPreviewActive)
            XCTAssertEqual(bridge.previewFormattingBaseDraft, baseline)
            let cancel = try XCTUnwrap(bridge.pendingInsertion)
            XCTAssertEqual(cancel.mode, .streamCancel)
#if os(iOS)
            coordinator.applyInsertion(cancel)
            XCTAssertEqual(editor.text, baseline)
            XCTAssertEqual(model, baseline)
#endif
        }
    }

    func testExplicitStopAndBargeInStillCancelAnOrdinaryStream() async {
        for reason in [ScreenplaySyncedInsertInterruptionReason.cancel, .bargeIn] {
            await withBridge { bridge in
                var interruptions: [ScreenplaySyncedInsertInterruptionReason] = []
                bridge.onPageGenerationInterrupted = { interruptions.append($0) }
                bridge.streamInsert(page)
                await waitUntil { bridge.pendingInsertion != nil }
                bridge.cancelStream(reason: reason)
                let cancellationID = bridge.pendingInsertion?.id
                // The actual Stop path also performs preview cleanup afterward.
                bridge.cancelStreamingVoiceTurnPreview()
                XCTAssertEqual(bridge.pendingInsertion?.id, cancellationID)
                XCTAssertEqual(bridge.pendingInsertion?.mode, .streamInsertCancel)
                XCTAssertEqual(interruptions, [reason])
                try? await Task.sleep(nanoseconds: 450_000_000)
                XCTAssertEqual(bridge.pendingInsertion?.id, cancellationID, "Cancelled stream emitted a late chunk")
                XCTAssertEqual(bridge.draftText, baseline)
            }
        }
    }

    private func waitUntil(_ predicate: () -> Bool) async {
        let deadline = Date().addingTimeInterval(3)
        while !predicate(), Date() < deadline {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    private func withBridge(_ body: (ScreenplayLiveDraftBridge) async throws -> Void) async rethrows {
        let bridge = ScreenplayLiveDraftBridge.shared
        let saved = (draft: bridge.draftText, pending: bridge.pendingInsertion,
                     voice: bridge.latestVoiceTurn, pack: bridge.latestPack,
                     phase: bridge.latestPhase, updated: bridge.lastUpdatedAt,
                     status: bridge.autoInsertStatusText, interrupt: bridge.onPageGenerationInterrupted)
        guard !bridge.isStreamingDraftPreviewActive, bridge.streamingProgress == 0 else {
            XCTFail("Test host already owns an active stream; refusing to replace it")
            return
        }
        bridge.onPageGenerationInterrupted = nil
        bridge.pendingInsertion = nil
        bridge.draftText = baseline
        defer {
            bridge.onPageGenerationInterrupted = nil
            bridge.cancelStreamingVoiceTurnPreview()
            bridge.cancelStream()
            bridge.draftText = saved.draft
            bridge.pendingInsertion = saved.pending
            bridge.latestVoiceTurn = saved.voice
            bridge.latestPack = saved.pack
            bridge.latestPhase = saved.phase
            bridge.lastUpdatedAt = saved.updated
            bridge.autoInsertStatusText = saved.status
            bridge.onPageGenerationInterrupted = saved.interrupt
        }
        try await body(bridge)
    }

#if os(iOS)
    private func makeCoordinator(text: Binding<String>) -> IOSCursorInsertTextEditor.Coordinator {
        IOSCursorInsertTextEditor(
            text: text, documentID: "preview-cancellation-test",
            activeScreenplayElement: .constant(.action),
            insertionRequest: .constant(nil), lineJumpRequest: .constant(nil),
            lineHighlightRequest: .constant(nil), anchoredTextRectRequest: .constant(nil),
            anchoredTextRectSnapshot: .constant(nil), editorFocusRequest: .constant(nil),
            editorActionRequest: .constant(nil), editorSelection: .constant(nil),
            currentCursorLine: .constant(1), lastCommittedWrite: .constant(nil),
            pendingReplacementTarget: .constant(nil), submittedReplacementTarget: .constant(nil)
        ).makeCoordinator()
    }
#endif
}

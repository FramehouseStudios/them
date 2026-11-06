import XCTest
@testable import ScreenplayStudio

final class ScreenplayEditorTextBindingPolicyTests: XCTestCase {
    func testDeferredNativeProtectionAndDocumentSwitchAreComposed() {
        for focused in [false, true] {
            for changedDocument in [false, true] {
                XCTAssertEqual(ScreenplayEditorTextBindingPolicy.shouldApplyModelText(
                    incomingText: "New model", currentEditorText: "Newer native words",
                    lastRenderedModelText: "Old model", isEditorFocused: focused,
                    documentDidChange: changedDocument, deferredAllows: false
                ), changedDocument, "Pending native text is protected only within its own document.")
            }
        }
    }

    func testByteDistinctRevisionIsNotBlockedByCanonicallyEqualStreamBaseline() {
        XCTAssertTrue(ScreenplayDeferredPublicationGate.shouldApplyBoundText(
            "cafe\u{0301}", currentText: "Native words", pendingExpectedText: nil,
            pendingText: nil, activeStreamingBaseText: "café"
        ))
    }

    func testDeferredMetadataRequiresTheExactPublishedText() {
        XCTAssertFalse(ScreenplayDeferredPublicationGate.acceptsTextGeneration(
            1, requirements: [1: .init(text: "café", requestID: nil)],
            currentText: "cafe\u{0301}", lastAppliedInsertionID: nil, activeInsertionRequestID: nil
        ))
    }

    func testDeferredPublicationRejectsByteDistinctBindingAndNativeText() {
        XCTAssertFalse(ScreenplayDeferredPublicationGate.acceptsNativeTextPublication(
            expectedBinding: "café", currentBinding: "cafe\u{0301}",
            queuedText: "Queued words", nativeText: "Queued words"
        ))
        XCTAssertFalse(ScreenplayDeferredPublicationGate.acceptsNativeTextPublication(
            expectedBinding: "Baseline", currentBinding: "Baseline",
            queuedText: "café", nativeText: "cafe\u{0301}"
        ))
    }

    func testByteDistinctModelTextMustNotBeMistakenForMatchingEditorText() {
        XCTAssertTrue(ScreenplayEditorTextBindingPolicy.shouldApplyModelText(
            incomingText: "cafe\u{0301}", currentEditorText: "café",
            lastRenderedModelText: "Old draft", isEditorFocused: true, documentDidChange: false
        ))
    }

    func testFreshByteDistinctModelRevisionMustNotBeMistakenForAStaleEcho() {
        XCTAssertTrue(ScreenplayEditorTextBindingPolicy.shouldApplyModelText(
            incomingText: "cafe\u{0301}", currentEditorText: "Writer's different words",
            lastRenderedModelText: "café", isEditorFocused: true, documentDidChange: false
        ))
    }

    func testAcknowledgementsDistinguishCanonicallyEquivalentWriterBytes() {
        var pending = ScreenplayEditorTextBindingPolicy.PendingPublications()
        pending.record("café")
        XCTAssertFalse(pending.acknowledge("cafe\u{0301}"))
        XCTAssertTrue(pending.acknowledge("café"))
    }

    func testAcknowledgementsRetireOnlyEarlierPublishedValues() {
        var pending = ScreenplayEditorTextBindingPolicy.PendingPublications()
        pending.record("motel sig")
        pending.record("motel sign")
        XCTAssertTrue(pending.acknowledge("motel sig"))
        XCTAssertTrue(pending.acknowledge("motel sign"))
        XCTAssertFalse(pending.acknowledge("motel sig"))
    }

    func testCoalescedAcknowledgementRetiresSkippedEarlierValues() {
        var pending = ScreenplayEditorTextBindingPolicy.PendingPublications()
        for text in ["a", "ab", "abc"] { pending.record(text) }
        XCTAssertTrue(pending.acknowledge("abc"))
        XCTAssertFalse(pending.acknowledge("ab"))
    }

    func testUnrelatedModelValueDoesNotConsumeNativeAcknowledgements() {
        var pending = ScreenplayEditorTextBindingPolicy.PendingPublications()
        pending.record("manual draft")
        XCTAssertFalse(pending.acknowledge("actual rewrite"))
        XCTAssertTrue(pending.acknowledge("manual draft"))
    }

    func testProjectResetCannotSuppressTheNextProjectsMatchingValue() {
        var pending = ScreenplayEditorTextBindingPolicy.PendingPublications()
        pending.record("same words")
        pending.reset()
        XCTAssertFalse(pending.acknowledge("same words"))
    }

    func testStaleModelEchoCannotReplaceFocusedEditorText() {
        XCTAssertFalse(ScreenplayEditorTextBindingPolicy.shouldApplyModelText(
            incomingText: "She cou",
            currentEditorText: "She count",
            lastRenderedModelText: "She cou",
            isEditorFocused: true,
            documentDidChange: false
        ))
    }

    func testNewModelTextStillReplacesFocusedEditorText() {
        XCTAssertTrue(ScreenplayEditorTextBindingPolicy.shouldApplyModelText(
            incomingText: "server revision",
            currentEditorText: "local draft",
            lastRenderedModelText: "older server revision",
            isEditorFocused: true,
            documentDidChange: false
        ))
    }

    func testDocumentSwitchAppliesItsDraftEvenWhenTextMatchesPriorModel() {
        XCTAssertTrue(ScreenplayEditorTextBindingPolicy.shouldApplyModelText(
            incomingText: "previous value",
            currentEditorText: "local edits",
            lastRenderedModelText: "previous value",
            isEditorFocused: true,
            documentDidChange: true
        ))
    }

    func testUnfocusedEditorAcceptsSameDocumentModelReplacement() {
        XCTAssertTrue(ScreenplayEditorTextBindingPolicy.shouldApplyModelText(
            incomingText: "restored server draft",
            currentEditorText: "local draft",
            lastRenderedModelText: "restored server draft",
            isEditorFocused: false,
            documentDidChange: false
        ))
    }

    func testAlreadyMatchingEditorNeedsNoProgrammaticWrite() {
        XCTAssertFalse(ScreenplayEditorTextBindingPolicy.shouldApplyModelText(
            incomingText: "exact draft",
            currentEditorText: "exact draft",
            lastRenderedModelText: "older draft",
            isEditorFocused: true,
            documentDidChange: false
        ))
    }
}

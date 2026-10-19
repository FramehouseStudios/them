import XCTest
@testable import ScreenplayStudio

final class ScreenplayEditorTextBindingPolicyTests: XCTestCase {
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

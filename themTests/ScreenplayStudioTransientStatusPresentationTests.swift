import XCTest
@testable import them

@MainActor
final class ScreenplayStudioTransientStatusPresentationTests: XCTestCase {
    func testRecoveryPreservesUsefulErrorMeaningWithinReadableBound() {
        let message = "Studio could not refresh this project because the server connection timed out. The draft shown on this page was not replaced, and no writing was removed. Check your connection, then retry."
        let presentation = makePresentation(
            errorText: "  Studio could not refresh this project\n because the server connection timed out.  The draft shown on this page was not replaced, and no writing was removed. Check your connection, then retry.  ",
            infoText: "Project updates are paused until the connection returns.",
            hasPersistedDocument: true
        )

        XCTAssertEqual(presentation.errorMessage, message)
        XCTAssertEqual(
            presentation.infoMessage,
            "Project updates are paused until the connection returns."
        )
        XCTAssertEqual(presentation.retry, .reloadStudio)
        XCTAssertEqual(
            presentation.draftProtectionMessage,
            "The last saved version remains available, and this draft remains open."
        )

        let longPresentation = makePresentation(
            errorText: String(repeating: "connection unavailable ", count: 40),
            infoText: ""
        )
        let boundedMessage = try? XCTUnwrap(longPresentation.errorMessage)
        XCTAssertLessThanOrEqual(
            boundedMessage?.count ?? .max,
            ScreenplayStudioTransientStatusPresentation.maximumErrorCharacters
        )
        XCTAssertTrue(boundedMessage?.hasSuffix("…") == true)
    }

    func testRecoveryChoosesExistingOperationForCurrentFailureContext() {
        XCTAssertEqual(
            makePresentation(
                errorText: "The server could not save this draft.",
                infoText: "Your draft is preserved on this device.",
                hasUnsavedDraftChanges: true,
                queuedDraftSaveCount: 1
            ).retry,
            .draftSync
        )
        XCTAssertEqual(
            makePresentation(
                errorText: "The outline could not sync.",
                infoText: "This outline change remains queued.",
                queuedOutlineMutationCount: 1
            ).retry,
            .outlineSync
        )
        XCTAssertEqual(
            makePresentation(
                errorText: "The draft save failed before confirmation.",
                infoText: "Your draft is preserved on this device.",
                hasUnsavedDraftChanges: true
            ).retry,
            .saveDraft
        )
    }

    func testRecoveryDoesNotOfferMeaninglessRetryForValidationErrors() {
        let presentation = makePresentation(
            errorText: "Select a project first.",
            infoText: "",
            hasSelectedProject: false,
            hasDraft: false
        )

        XCTAssertNil(presentation.retry)
        XCTAssertNil(presentation.draftProtectionMessage)
        XCTAssertNil(presentation.infoMessage)
    }

    func testRecoveryDoesNotMixAnUnrelatedEarlierSuccessIntoTheError() {
        let presentation = makePresentation(
            errorText: "Studio could not refresh this project.",
            infoText: "Carried this first Studio thread into the new project."
        )

        XCTAssertNil(presentation.infoMessage)
        XCTAssertEqual(presentation.retry, .reloadStudio)
    }

    func testRecoveryDoesNotReloadOverAnUnconfirmedInMemoryDraft() {
        let presentation = makePresentation(
            errorText: "Studio could not refresh project details.",
            infoText: "",
            hasUnsavedDraftChanges: true,
            isManualDraftEditing: true
        )

        XCTAssertNil(presentation.retry)
        XCTAssertEqual(
            presentation.draftProtectionMessage,
            "Your draft remains open in Studio. Save it before leaving."
        )
        XCTAssertFalse(presentation.draftProtectionMessage?.contains("safe") == true)
    }

    func testRecoveryMakesLocallyProtectedDraftStateExplicitWithoutRepeatingIt() {
        let presentation = makePresentation(
            errorText: "The local save queue could not be secured.",
            infoText: "Your draft is preserved on this device.",
            autosaveStatusText: "Saved locally",
            hasUnsavedDraftChanges: true
        )

        XCTAssertEqual(
            presentation.draftProtectionMessage,
            "Your local draft is safe on this device."
        )
        XCTAssertNil(presentation.infoMessage)
    }

    private func makePresentation(
        errorText: String,
        infoText: String,
        autosaveStatusText: String = "Ready",
        hasSelectedProject: Bool = true,
        hasDraft: Bool = true,
        hasUnsavedDraftChanges: Bool = false,
        isManualDraftEditing: Bool = false,
        hasPersistedDocument: Bool = false,
        queuedDraftSaveCount: Int = 0,
        queuedOutlineMutationCount: Int = 0
    ) -> ScreenplayStudioTransientStatusPresentation {
        ScreenplayStudioTransientStatusPresentation(
            errorText: errorText,
            infoText: infoText,
            autosaveStatusText: autosaveStatusText,
            hasSelectedProject: hasSelectedProject,
            hasDraft: hasDraft,
            hasUnsavedDraftChanges: hasUnsavedDraftChanges,
            isManualDraftEditing: isManualDraftEditing,
            hasPersistedDocument: hasPersistedDocument,
            queuedDraftSaveCount: queuedDraftSaveCount,
            queuedOutlineMutationCount: queuedOutlineMutationCount
        )
    }
}

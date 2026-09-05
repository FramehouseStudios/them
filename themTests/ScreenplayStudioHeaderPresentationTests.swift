import XCTest
@testable import them

@MainActor
final class ScreenplayStudioHeaderPresentationTests: XCTestCase {
    func testHeaderNeverReportsSavedWithoutASelectedProject() {
        let empty = makePresentation(
            isSaving: false,
            hasSelectedProject: false,
            hasDraft: false,
            hasUnsavedDraftChanges: false,
            hasPersistedDocument: false
        )
        XCTAssertEqual(empty.saveStatus, .notSaved)
        XCTAssertEqual(empty.saveStatus.text, "Not saved")
        XCTAssertEqual(empty.saveStatusTone, .muted)

        let liveDraft = makePresentation(
            isSaving: false,
            hasSelectedProject: false,
            hasDraft: true,
            hasUnsavedDraftChanges: true,
            hasPersistedDocument: true
        )
        XCTAssertEqual(liveDraft.saveStatus, .liveOnly)
        XCTAssertEqual(liveDraft.saveStatus.text, "Live only")
        XCTAssertEqual(liveDraft.saveStatusTone, .muted)

        let impossibleSavingState = makePresentation(
            isSaving: true,
            hasSelectedProject: false,
            hasDraft: true,
            hasUnsavedDraftChanges: false,
            hasPersistedDocument: true
        )
        XCTAssertNotEqual(impossibleSavingState.saveStatus, .saved)
        XCTAssertEqual(impossibleSavingState.saveStatus, .liveOnly)
    }

    func testHeaderSaveStatusUsesTrustworthyPrecedenceForASelectedProject() {
        XCTAssertEqual(
            makePresentation(
                isSaving: true,
                hasSelectedProject: true,
                hasDraft: true,
                hasUnsavedDraftChanges: true,
                hasPersistedDocument: true
            ).saveStatus,
            .saving
        )
        XCTAssertEqual(
            makePresentation(
                isSaving: false,
                hasSelectedProject: true,
                hasDraft: true,
                hasUnsavedDraftChanges: true,
                hasPersistedDocument: true
            ).saveStatus,
            .unsaved
        )
        XCTAssertEqual(
            makePresentation(
                isSaving: false,
                hasSelectedProject: true,
                hasDraft: true,
                hasUnsavedDraftChanges: false,
                hasPersistedDocument: true
            ).saveStatus,
            .saved
        )
        XCTAssertEqual(
            makePresentation(
                isSaving: false,
                hasSelectedProject: true,
                hasDraft: true,
                hasUnsavedDraftChanges: false,
                hasPersistedDocument: false
            ).saveStatus,
            .notSaved
        )
    }

    func testCompactHeaderKeepsSmallVisualChromeInsideAccessibleHitTargets() {
        XCTAssertGreaterThanOrEqual(
            ScreenplayStudioHeaderPresentation.compactInteractiveControlSize,
            44
        )
        XCTAssertLessThan(
            ScreenplayStudioHeaderPresentation.compactVisualControlSize,
            ScreenplayStudioHeaderPresentation.compactInteractiveControlSize
        )
        XCTAssertEqual(ScreenplayStudioHeaderPresentation.compactVisualControlSize, 28)
        XCTAssertEqual(ScreenplayStudioHeaderPresentation.controlSize(compact: true), 44)
        XCTAssertEqual(ScreenplayStudioHeaderPresentation.controlSize(compact: false), 28)
    }

    private func makePresentation(
        isSaving: Bool,
        hasSelectedProject: Bool,
        hasDraft: Bool,
        hasUnsavedDraftChanges: Bool,
        hasPersistedDocument: Bool
    ) -> ScreenplayStudioHeaderPresentation {
        ScreenplayStudioHeaderPresentation(
            isSaving: isSaving,
            hasSelectedProject: hasSelectedProject,
            hasDraft: hasDraft,
            hasUnsavedDraftChanges: hasUnsavedDraftChanges,
            hasPersistedDocument: hasPersistedDocument
        )
    }
}

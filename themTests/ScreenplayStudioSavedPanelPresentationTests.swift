import XCTest
import ScreenplayStudio
@testable import them

@MainActor
final class ScreenplayStudioSavedPanelPresentationTests: XCTestCase {
    func testSavedPanelPresentationPreservesSaveVersionAndEmptyStateRules() {
        let saving = makePresentation(
            isSaving: true,
            hasDraft: true,
            latestVersionID: "  version-abcdef  ",
            backgroundSyncNoticeText: "Saved locally.",
            hasSelectedProject: true
        )

        XCTAssertEqual(saving.saveTitle, "Saving…")
        XCTAssertEqual(saving.saveSystemImage, "arrow.clockwise")
        XCTAssertTrue(saving.saveDisabled)
        XCTAssertEqual(saving.latestVersionTag, "Version ABCDEF")
        XCTAssertTrue(saving.showsBackgroundSyncNotice)
        XCTAssertEqual(saving.versionsState, .empty)

        let blankDraft = makePresentation(
            isSaving: false,
            hasDraft: false,
            latestVersionID: " \n ",
            backgroundSyncNoticeText: "",
            hasSelectedProject: true
        )
        XCTAssertEqual(blankDraft.saveTitle, "Save Script")
        XCTAssertEqual(blankDraft.saveSystemImage, "square.and.arrow.down")
        XCTAssertTrue(blankDraft.saveDisabled)
        XCTAssertNil(blankDraft.latestVersionTag)
        XCTAssertFalse(blankDraft.showsBackgroundSyncNotice)
        XCTAssertEqual(blankDraft.versionsState, .empty)

        let readyWithoutProject = makePresentation(
            isSaving: false,
            hasDraft: true,
            latestVersionID: "v2",
            backgroundSyncNoticeText: " ",
            hasSelectedProject: false,
            snapshots: [makeSnapshot(id: "version-2", canRestore: true)]
        )
        XCTAssertTrue(readyWithoutProject.saveDisabled)
        XCTAssertEqual(readyWithoutProject.latestVersionTag, "Version V2")
        XCTAssertTrue(readyWithoutProject.showsBackgroundSyncNotice)
        XCTAssertEqual(readyWithoutProject.versionsState, .needsProject)
    }

    func testSavedPanelRowsReuseCanonicalSnapshotOrderLatestMarkerAndRestoreEligibility() {
        let newest = makeSnapshot(
            id: "newest-version",
            phaseTitle: "Studio Snapshot",
            timestamp: "just now",
            notes: "  Keep this note  ",
            canRestore: true
        )
        let older = makeSnapshot(
            id: "older-version",
            phaseTitle: "Draft",
            timestamp: nil,
            notes: nil,
            canRestore: false
        )
        let presentation = makePresentation(
            isSaving: false,
            hasDraft: true,
            latestVersionID: "newest-version",
            backgroundSyncNoticeText: "",
            hasSelectedProject: true,
            snapshots: [newest, older]
        )

        XCTAssertEqual(presentation.versionsState, .populated)
        XCTAssertEqual(presentation.versions.map(\.id), ["newest-version", "older-version"])
        XCTAssertEqual(presentation.versions.map(\.isLatest), [true, false])
        XCTAssertEqual(presentation.versions[0].snapshot.version.id, "newest-version")
        XCTAssertEqual(presentation.versions[0].snapshot.phaseTitle, "Studio Snapshot")
        XCTAssertEqual(presentation.versions[0].snapshot.relativeTimestampText, "just now")
        XCTAssertEqual(presentation.versions[0].snapshot.notes, "  Keep this note  ")
        XCTAssertTrue(presentation.versions[0].snapshot.canRestore)
        XCTAssertEqual(presentation.versions[1].snapshot.version.id, "older-version")
        XCTAssertFalse(presentation.versions[1].snapshot.canRestore)
    }

    private func makePresentation(
        isSaving: Bool,
        hasDraft: Bool,
        latestVersionID: String,
        backgroundSyncNoticeText: String,
        hasSelectedProject: Bool,
        snapshots: [ScreenplayStudioSnapshotPresentation] = []
    ) -> ScreenplayStudioSavedPanelPresentation {
        ScreenplayStudioSavedPanelPresentation(
            isSaving: isSaving,
            hasDraft: hasDraft,
            autosaveStatusText: "Autosaved",
            latestVersionID: latestVersionID,
            backgroundSyncNoticeText: backgroundSyncNoticeText,
            hasSelectedProject: hasSelectedProject,
            snapshotVersions: snapshots
        )
    }

    private func makeSnapshot(
        id: String,
        phaseTitle: String = "Draft",
        timestamp: String? = nil,
        notes: String? = nil,
        canRestore: Bool
    ) -> ScreenplayStudioSnapshotPresentation {
        ScreenplayStudioSnapshotPresentation(
            version: BackendScreenplayVersion(
                id: id,
                projectId: "project-1",
                phase: nil,
                source: nil,
                clientRequestId: nil,
                createdAt: nil,
                updatedAt: nil,
                prompt: nil,
                notes: notes,
                formatScore: nil,
                storyScore: nil,
                confidenceClass: nil,
                warnings: nil,
                draft: canRestore ? "INT. DINER - NIGHT" : " \n ",
                draftExcerpt: nil,
                studioWriteAnchors: nil,
                screenplayBindings: nil
            ),
            phaseTitle: phaseTitle,
            relativeTimestampText: timestamp,
            notes: notes,
            canRestore: canRestore
        )
    }
}

import XCTest
@testable import them

final class ScreenplayOfflineEditAdoptionPolicyTests: XCTestCase {
    func testOfflineEditsOnTheSameProjectAreAdopted() {
        XCTAssertTrue(ScreenplayOfflineEditAdoptionPolicy.shouldAdopt(
            projectsWereLoaded: false, selectedProjectId: "p1", pageProjectId: "p1",
            page: "INT. DOCK - DAY\n\nThe tide turns.", hasUnsavedEdits: true
        ))
    }

    func testNormalLaunchesAndOtherProjectsAreNotAdopted() {
        XCTAssertFalse(ScreenplayOfflineEditAdoptionPolicy.shouldAdopt(
            projectsWereLoaded: true, selectedProjectId: "p1", pageProjectId: "p1", page: "x", hasUnsavedEdits: true
        ), "a normal reload keeps its own protection rules")
        XCTAssertFalse(ScreenplayOfflineEditAdoptionPolicy.shouldAdopt(
            projectsWereLoaded: false, selectedProjectId: "p2", pageProjectId: "p1", page: "x", hasUnsavedEdits: true
        ), "a page bound to another project must not be written into this one")
        XCTAssertFalse(ScreenplayOfflineEditAdoptionPolicy.shouldAdopt(
            projectsWereLoaded: false, selectedProjectId: "p1", pageProjectId: "p1", page: "x", hasUnsavedEdits: false
        ))
        XCTAssertFalse(ScreenplayOfflineEditAdoptionPolicy.shouldAdopt(
            projectsWereLoaded: false, selectedProjectId: "", pageProjectId: "", page: "x", hasUnsavedEdits: true
        ))
        XCTAssertFalse(ScreenplayOfflineEditAdoptionPolicy.shouldAdopt(
            projectsWereLoaded: false, selectedProjectId: "p1", pageProjectId: "p1", page: " \n ", hasUnsavedEdits: true
        ))
    }
}

final class ScreenplayOfflineRecoveryBindingTests: XCTestCase {
    func testSelectionBeforeOfflineFetchPreservesTheSamePagesKnownBase() {
        let target = ScreenplayOfflineRecoveryBinding.target(
            selectedProjectId: " p1 ", selectedVersionId: "",
            projectsLoaded: false, pageProjectId: "p1", pageVersionId: " v9 "
        )
        XCTAssertEqual(target.projectId, "p1")
        XCTAssertEqual(target.versionId, "v9")
    }

    func testMissingBaseNeverBorrowsAnotherProjectsVersion() {
        let target = ScreenplayOfflineRecoveryBinding.target(
            selectedProjectId: "p2", selectedVersionId: "",
            projectsLoaded: false, pageProjectId: "p1", pageVersionId: "v9"
        )
        XCTAssertEqual(target.versionId, "")
    }

    func testLoadedSelectionDoesNotBorrowTheBridgesVersion() {
        let target = ScreenplayOfflineRecoveryBinding.target(
            selectedProjectId: "p1", selectedVersionId: "",
            projectsLoaded: true, pageProjectId: "p1", pageVersionId: "v9"
        )
        XCTAssertEqual(target.versionId, "")
    }

    func testOfflinePageIsFiledUnderItsOwnProject() {
        let target = ScreenplayOfflineRecoveryBinding.target(
            selectedProjectId: "", selectedVersionId: "",
            projectsLoaded: false, pageProjectId: " p1 ", pageVersionId: "v9"
        )
        XCTAssertEqual(target.projectId, "p1")
        XCTAssertEqual(target.versionId, "v9")
    }

    func testSelectedProjectWins() {
        let target = ScreenplayOfflineRecoveryBinding.target(
            selectedProjectId: "p2", selectedVersionId: "v2",
            projectsLoaded: false, pageProjectId: "p1", pageVersionId: "v9"
        )
        XCTAssertEqual(target.projectId, "p2")
        XCTAssertEqual(target.versionId, "v2")
    }

    func testALoadedListWithNoSelectionFilesNothing() {
        // Signed in, list loaded, writer on a scratch page: not any project's work.
        let target = ScreenplayOfflineRecoveryBinding.target(
            selectedProjectId: "", selectedVersionId: "",
            projectsLoaded: true, pageProjectId: "p1", pageVersionId: "v9"
        )
        XCTAssertEqual(target.projectId, "")
    }

    func testCleanServerPageKeepsTheOfferedWords() {
        XCTAssertTrue(ScreenplayOfflineRecoveryBinding.overwritesPendingRecovery(
            dirty: false, targetProjectId: "p1", draft: "Server page.",
            pendingProjectId: "p1", pendingDraft: "Server page. Fog lifts."
        ))
    }

    func testUnsavedPageStillUpdatesTheCopy() {
        XCTAssertFalse(ScreenplayOfflineRecoveryBinding.overwritesPendingRecovery(
            dirty: true, targetProjectId: "p1", draft: "New words.",
            pendingProjectId: "p1", pendingDraft: "Old words."
        ))
    }

    func testNoOfferOrAnotherProjectDoesNotBlock() {
        XCTAssertFalse(ScreenplayOfflineRecoveryBinding.overwritesPendingRecovery(
            dirty: false, targetProjectId: "p1", draft: "Page.",
            pendingProjectId: nil, pendingDraft: nil
        ))
        XCTAssertFalse(ScreenplayOfflineRecoveryBinding.overwritesPendingRecovery(
            dirty: false, targetProjectId: "p1", draft: "Page.",
            pendingProjectId: "p2", pendingDraft: "Other."
        ))
    }

    func testSameWordsAreNotAnOverwrite() {
        XCTAssertFalse(ScreenplayOfflineRecoveryBinding.overwritesPendingRecovery(
            dirty: false, targetProjectId: "p1", draft: "Page.\n",
            pendingProjectId: "p1", pendingDraft: "Page."
        ))
    }
}

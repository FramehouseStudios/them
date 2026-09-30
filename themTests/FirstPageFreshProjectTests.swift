import XCTest
@testable import them

final class FirstPageFreshProjectTests: XCTestCase {
    func testTitleComesFromTheSceneTheWriterTyped() {
        XCTAssertEqual(
            FirstPageFreshProject.title(fromSceneSeed: "A night nurse finds her missing brother’s coat in the hospital lost and found."),
            "Night Nurse Finds Her Missing Brother’s Coat"
        )
        XCTAssertEqual(FirstPageFreshProject.title(fromSceneSeed: "  "), "New Scene")
    }

    func testTheTitleEndsOnAWholePhraseNotAPreposition() {
        // 2026-09-30 projects drawer: "Senate Staffer Counts Votes On", "Clerk Stops The Clock On".
        XCTAssertEqual(FirstPageFreshProject.title(fromSceneSeed: "A clerk stops the clock on the senate floor at midnight."), "Clerk Stops The Clock")
        XCTAssertEqual(FirstPageFreshProject.title(fromSceneSeed: "Two sisters argue, then the lights go out."), "Two Sisters Argue")
        XCTAssertEqual(FirstPageFreshProject.title(fromSceneSeed: "Nora runs"), "Nora Runs")
        XCTAssertEqual(FirstPageFreshProject.title(fromSceneSeed: "A senate staffer counts votes on the last night of session."), "Senate Staffer Counts Votes")
    }

    func testWritesAreReadyOnceBoundToTheChosenEmptyProject() {
        XCTAssertTrue(FirstPageFreshProject.isBound(to: "new", boundProjectID: "new", draft: "  \n"))
        XCTAssertFalse(FirstPageFreshProject.isBound(to: "new", boundProjectID: "old", draft: ""))
        XCTAssertFalse(FirstPageFreshProject.isBound(to: "new", boundProjectID: "new", draft: "INT. DINER - NIGHT"), "the old script is still loaded")
        XCTAssertFalse(FirstPageFreshProject.isBound(to: "", boundProjectID: "", draft: ""))
    }

    func testAnEmptyOpenProjectIsReusedSoRetriesDoNotPileUpProjects() {
        XCTAssertTrue(FirstPageFreshProject.canReuse(selectedProjectID: "p1", draft: ""))
        XCTAssertFalse(FirstPageFreshProject.canReuse(selectedProjectID: "p1", draft: "INT. DINER - NIGHT"))
        XCTAssertFalse(FirstPageFreshProject.canReuse(selectedProjectID: "", draft: ""))
    }
}

final class SessionContinuityPromptScopeTests: XCTestCase {
    func testWhereWeLeftOffOnlyFillsPromptsForItsOwnProject() {
        XCTAssertTrue(SessionContinuityPromptScope.applies(snapshotProjectID: "project_diner", boundProjectID: " project_diner "))
        XCTAssertFalse(SessionContinuityPromptScope.applies(snapshotProjectID: "project_diner", boundProjectID: "project_hospital"))
        XCTAssertFalse(SessionContinuityPromptScope.applies(snapshotProjectID: "project_diner", boundProjectID: ""))
    }
}

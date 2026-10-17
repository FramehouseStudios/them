import XCTest
@testable import them

final class StudioNewProjectSeedPolicyTests: XCTestCase {
    func testLiveOnlyDraftBecomesTheNewProjectsFirstPage() {
        let draft = "  INT. PIER - NIGHT\r\n cafe\u{0301}  "
        XCTAssertEqual(Array(StudioNewProjectSeedPolicy.seedDraft(
            currentDraft: draft, hasSelectedProject: false).utf8), Array(draft.utf8))
    }

    func testAnotherProjectsPageIsNeverCopiedIntoANewProject() {
        XCTAssertEqual(
            StudioNewProjectSeedPolicy.seedDraft(currentDraft: "INT. MOTEL ROOM - NIGHT", hasSelectedProject: true),
            ""
        )
    }

    func testEmptyDraftSeedsNothing() {
        XCTAssertEqual(StudioNewProjectSeedPolicy.seedDraft(currentDraft: "   ", hasSelectedProject: false), "")
    }
}

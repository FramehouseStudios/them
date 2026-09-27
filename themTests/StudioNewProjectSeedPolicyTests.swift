import XCTest
@testable import them

final class StudioNewProjectSeedPolicyTests: XCTestCase {
    func testLiveOnlyDraftBecomesTheNewProjectsFirstPage() {
        XCTAssertEqual(
            StudioNewProjectSeedPolicy.seedDraft(currentDraft: "  INT. PIER - NIGHT  ", hasSelectedProject: false),
            "INT. PIER - NIGHT"
        )
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

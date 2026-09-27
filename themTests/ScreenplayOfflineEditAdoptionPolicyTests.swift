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

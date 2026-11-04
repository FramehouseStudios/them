import XCTest
@testable import them

@MainActor
final class StudioCraftFrameworkSelectionTests: XCTestCase {
    func testDefaultIsThreeActEvenWhenLegacyServerListsSaveTheCatFirst() {
        XCTAssertEqual(StudioCraftResilience.defaultFrameworkID, "three-act")
        XCTAssertEqual(StudioCraftResilience.preferredFrameworkID(selected: "", availableIDs: ["save-the-cat", "three-act"]), "three-act")
    }

    func testExplicitSelectionIsPreservedAndUnknownSelectionFallsBack() {
        let ids = ["save-the-cat", "three-act", "story-circle"]
        XCTAssertEqual(StudioCraftResilience.preferredFrameworkID(selected: " story-circle ", availableIDs: ids), "story-circle")
        XCTAssertEqual(StudioCraftResilience.preferredFrameworkID(selected: "missing", availableIDs: ids), "three-act")
    }

    func testUnavailableDefaultUsesAnAvailableFrameworkAndEmptyListStaysEmpty() {
        XCTAssertEqual(StudioCraftResilience.preferredFrameworkID(selected: "", availableIDs: ["hero-journey"]), "hero-journey")
        XCTAssertEqual(StudioCraftResilience.preferredFrameworkID(selected: "", availableIDs: []), "")
    }
}

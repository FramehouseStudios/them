import XCTest
@testable import them

/// Live 2026-09-28: a brand-new blank project showed the previous script's
/// "Project memory applied" card until the first page was written.
final class AppliedMemoryProjectScopeTests: XCTestCase {
    func testSwitchingProjectsDropsMemoryFromTheOldOne() {
        XCTAssertFalse(SessionContinuityPromptScope.keepsAppliedMemory(memoryProjectID: nil, switchingFrom: "project_a", to: "project_b"),
                       "unstamped Studio memory was learned on the project being left")
        XCTAssertFalse(SessionContinuityPromptScope.keepsAppliedMemory(memoryProjectID: "project_a", switchingFrom: "project_a", to: "project_b"))
    }

    func testMemoryStampedForTheNewProjectStays() {
        XCTAssertTrue(SessionContinuityPromptScope.keepsAppliedMemory(memoryProjectID: "project_b", switchingFrom: "project_a", to: " project_b "))
    }

    func testRestoringTheSavedProjectAtLaunchIsNotASwitch() {
        XCTAssertTrue(SessionContinuityPromptScope.keepsAppliedMemory(memoryProjectID: nil, switchingFrom: "", to: "project_a"))
        XCTAssertTrue(SessionContinuityPromptScope.keepsAppliedMemory(memoryProjectID: "project_a", switchingFrom: "  ", to: "project_a"))
    }
}

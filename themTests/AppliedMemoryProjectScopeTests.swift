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

    func testTheLaunchRecapMemoryOnlyAppliesToTheProjectThatIsOpen() {
        // 2026-09-30: a new blank project showed "Correction memory applied"
        // with the previous script's cast and threads.
        XCTAssertTrue(SessionContinuityPromptScope.appliesAtRestore(snapshotProjectID: "sine-die", openProjectID: "sine-die"))
        XCTAssertTrue(SessionContinuityPromptScope.appliesAtRestore(snapshotProjectID: "sine-die", openProjectID: " "), "nothing open yet: Home may show it")
        XCTAssertFalse(SessionContinuityPromptScope.appliesAtRestore(snapshotProjectID: "sine-die", openProjectID: "clerk-stops-the-clock"))
        XCTAssertFalse(SessionContinuityPromptScope.keepsAppliedMemory(memoryProjectID: "sine-die", switchingFrom: "", to: "clerk-stops-the-clock"), "a saved card for another project is not restored into this one")
        XCTAssertFalse(SessionContinuityPromptScope.showsAppliedMemory(memoryProjectID: "sine-die", openProjectID: "clerk-stops-the-clock"))
        XCTAssertTrue(SessionContinuityPromptScope.showsAppliedMemory(memoryProjectID: "sine-die", openProjectID: "sine-die"))
        XCTAssertTrue(SessionContinuityPromptScope.showsAppliedMemory(memoryProjectID: nil, openProjectID: "clerk-stops-the-clock"), "unstamped memory still shows")
    }

    func testTheRestoredContinuitySignalOnlyShowsForItsOwnProject() {
        // 2026-09-30: "Act III … 74 pages drafted" in a new blank script's Live Intent.
        let restored = CreativeCompanionSignalState(
            intent: .empty,
            presence: CreativePresenceSnapshot(title: HomeSessionContinuityCardPolicy.restoredContinuityPresenceTitle, detail: "74 pages drafted", updatedAt: Date()),
            proactiveSuggestion: nil
        )
        XCTAssertFalse(SessionContinuityPromptScope.visibleSignal(restored, restoredMemoryProjectID: "sine-die", openProjectID: "clerk").hasContent)
        XCTAssertFalse(SessionContinuityPromptScope.visibleSignal(restored, restoredMemoryProjectID: nil, openProjectID: "clerk").hasContent, "a saved signal of unknown origin stays hidden in an open script")
        XCTAssertTrue(SessionContinuityPromptScope.visibleSignal(restored, restoredMemoryProjectID: "sine-die", openProjectID: "sine-die").hasContent)
        let live = CreativeCompanionSignalState(
            intent: .empty,
            presence: CreativePresenceSnapshot(title: "Scene Partner", detail: "Writing the clerk", updatedAt: Date()),
            proactiveSuggestion: nil
        )
        XCTAssertEqual(SessionContinuityPromptScope.visibleSignal(live, restoredMemoryProjectID: "sine-die", openProjectID: "clerk"), live)
    }
}

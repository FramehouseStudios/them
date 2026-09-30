import XCTest
@testable import them

/// Live 2026-09-30: "Project memory applied … Next: Open on behavior that shows
/// the wound before anyone explains it." is the planner's template, not memory.
final class MemoryCardScaffoldTests: XCTestCase {
    private func state(nextThreeTurns: [String], nextScenePlan: String = "") -> ScreenplayStudioAppliedMemoryState {
        ScreenplayStudioAppliedMemoryState(
            id: UUID(), source: "test", nextScenePlan: nextScenePlan, nextThreeTurns: nextThreeTurns,
            characters: ["MAE"], correctedTerms: [], correctionReplacements: [],
            characterBibleApplied: false, correctionAppliedToPrompt: false, lastSavedCorrection: "", updatedAt: Date()
        )
    }

    func testPlannerWordingIsNotShownAsTheNextMove() {
        let lines = state(nextThreeTurns: [
            "Open on behavior that shows the wound before anyone explains it.",
            "Write the next scene: BUS DEPOT",
            "Mae hides the coat from the driver.",
        ]).storyRunwayLines
        XCTAssertEqual(lines.first { $0.hasPrefix("Next:") }, "Next: Mae hides the coat from the driver.")
    }

    func testOnlyScaffoldMeansNoNextLine() {
        let lines = state(nextThreeTurns: ["Open on behavior that shows the wound before anyone explains it."],
                          nextScenePlan: "Act I - Opening Image / Ordinary World: Plant the emotional question the ending must answer.").storyRunwayLines
        XCTAssertFalse(lines.contains { $0.hasPrefix("Next:") }, "\(lines)")
    }

    func testScaffoldClassifier() {
        XCTAssertTrue(ScreenplayFeatureProgressionGuide.isPlannerScaffold("Plant the emotional question the ending must answer."))
        XCTAssertTrue(ScreenplayFeatureProgressionGuide.isPlannerScaffold("  "))
        XCTAssertFalse(ScreenplayFeatureProgressionGuide.isPlannerScaffold("Mara names the judge."))
        // Memories Story Spine "Pressure" showed the step's pressure and obligation joined.
        XCTAssertTrue(ScreenplayFeatureProgressionGuide.isPlannerScaffold("Make the protagonist's wound, want, world, and tonal promise visible through behavior. Plant the emotional question the ending must answer."))
    }
}

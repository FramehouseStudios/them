import XCTest
@testable import them

final class StudioCreativeInstinctsTests: XCTestCase {
    func testProjectIDScopeWinsAndCorrectedPreferencesSortFirst() {
        let learned = preference(
            projectID: "split-ferries",
            projectTitle: "Split Ferries",
            family: "reversal_pressure",
            displayName: "Reversal pressure",
            effectiveScore: 20
        )
        let corrected = preference(
            projectID: "split-ferries",
            projectTitle: "Split Ferries",
            family: "relationship_pressure",
            displayName: "Relationship pressure",
            effectiveScore: 3,
            explicitStance: "prefer",
            correctedAt: 5_000
        )
        let sameTitleDifferentProject = preference(
            projectID: "archived-ferries",
            projectTitle: "Split Ferries",
            family: "choice_pressure",
            displayName: "Choice pressure",
            effectiveScore: 30
        )

        let result = StudioStoryMovePreferencePresentation.scoped(
            [learned, sameTitleDifferentProject, corrected],
            projectID: "split-ferries",
            projectTitle: "Split Ferries"
        )

        XCTAssertEqual(result.map(\.family), [
            "relationship_pressure",
            "reversal_pressure",
        ])
    }

    func testProjectTitleScopesWhenNoProjectIDExists() {
        let target = preference(
            projectID: "",
            projectTitle: "Split Ferries",
            family: "image_pressure",
            displayName: "Image pressure",
            effectiveScore: 4
        )
        let other = preference(
            projectID: "",
            projectTitle: "Night Window",
            family: "objective_pressure",
            displayName: "Objective pressure",
            effectiveScore: 8
        )

        let result = StudioStoryMovePreferencePresentation.scoped(
            [other, target],
            projectID: "",
            projectTitle: " split ferries "
        )

        XCTAssertEqual(result.map(\.family), ["image_pressure"])
    }

    private func preference(
        projectID: String,
        projectTitle: String,
        family: String,
        displayName: String,
        effectiveScore: Int,
        explicitStance: String = "",
        correctedAt: TimeInterval? = nil
    ) -> BackendStoryMovePreference {
        BackendStoryMovePreference(
            projectId: projectID,
            projectTitle: projectTitle,
            family: family,
            displayName: displayName,
            summary: "shape the next move",
            learnedScore: effectiveScore,
            effectiveScore: effectiveScore,
            evidenceCount: 2,
            selectedCount: 1,
            passedOverCount: 1,
            acceptedPageCount: 1,
            blockResolutionCount: 0,
            explicitStance: explicitStance,
            correctedAt: correctedAt,
            updatedAt: 5_000
        )
    }
}

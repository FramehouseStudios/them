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

    func testSuccessfulRescueProvenanceExplainsWhatClementineLearned() {
        let learned = BackendStoryMovePreference(
            projectId: "split-ferries",
            projectTitle: "Split Ferries",
            family: "relationship_pressure",
            displayName: "Relationship pressure",
            summary: "shape the next move",
            learnedScore: 14,
            effectiveScore: 14,
            evidenceCount: 3,
            selectedCount: 1,
            passedOverCount: 0,
            acceptedPageCount: 1,
            blockResolutionCount: 1,
            successfulRescueCount: 1,
            failedRescueCount: nil,
            explicitStance: "",
            correctedAt: nil,
            updatedAt: 5_000
        )

        XCTAssertEqual(
            learned.learningProvenanceSummary,
            "Learned from 1 rescue that worked · 1 page kept · 1 block cleared"
        )
    }

    func testFailedRescueProvenanceExplainsWhatClementineWillAvoidRepeating() {
        let learned = BackendStoryMovePreference(
            projectId: "split-ferries",
            projectTitle: "Split Ferries",
            family: "relationship_pressure",
            displayName: "Relationship pressure",
            summary: "shape the next move",
            learnedScore: -4,
            effectiveScore: -4,
            evidenceCount: 1,
            selectedCount: 0,
            passedOverCount: 0,
            acceptedPageCount: 0,
            blockResolutionCount: 0,
            successfulRescueCount: 0,
            failedRescueCount: 1,
            explicitStance: "",
            correctedAt: nil,
            updatedAt: 5_000
        )

        XCTAssertEqual(
            learned.learningProvenanceSummary,
            "Learned from 1 rescue that did not unblock you"
        )
        XCTAssertEqual(
            learned.creativeGuidanceSummary,
            "Clementine will not repeat this move by default."
        )
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
            successfulRescueCount: nil,
            failedRescueCount: nil,
            explicitStance: explicitStance,
            correctedAt: correctedAt,
            updatedAt: 5_000
        )
    }
}

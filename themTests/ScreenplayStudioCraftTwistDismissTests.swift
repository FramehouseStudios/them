import XCTest
import ScreenplayStudio
@testable import them

final class ScreenplayStudioCraftTwistDismissTests: XCTestCase {
    func testDismissUnkeptSuggestionRemovesItFromTheVisiblePass() {
        let dismissed = suggestion(id: "twist-dismiss", label: "False Exit")
        let kept = suggestion(id: "twist-keep", label: "Costly Return")
        let outcome = ScreenplayCraftTwistDismissal.resolve(
            cardID: dismissed.id,
            response: response([dismissed, kept])
        )

        guard case .dismissed(let remaining) = outcome else {
            return XCTFail("Expected a visible suggestion to be dismissed")
        }
        XCTAssertEqual(remaining.map(\.id), [kept.id])
    }

    func testDismissMissingSuggestionReportsTheNoLongerAvailableState() {
        let outcome = ScreenplayCraftTwistDismissal.resolve(cardID: "missing", response: nil)
        guard case .unavailable = outcome else {
            return XCTFail("Expected missing suggestion state to be unavailable")
        }
    }

    func testAlreadyDismissedSuggestionDoesNotMutateThePass() {
        let kept = suggestion(id: "twist-keep", label: "Costly Return")
        let outcome = ScreenplayCraftTwistDismissal.resolve(
            cardID: "missing",
            response: response([kept])
        )
        guard case .alreadyDismissed = outcome else {
            return XCTFail("Expected an absent card to stay dismissed")
        }
    }

    private func response(
        _ twists: [ScreenplayCraftTwistSuggestion]
    ) -> ScreenplayCraftTwistSuggestResponse {
        ScreenplayCraftTwistSuggestResponse(
            schemaVersion: 1,
            frameworkId: "save-the-cat",
            currentBeatId: "midpoint",
            source: "test",
            twists: twists
        )
    }

    private func suggestion(
        id: String,
        label: String
    ) -> ScreenplayCraftTwistSuggestion {
        ScreenplayCraftTwistSuggestion(
            id: id,
            label: label,
            hook: "A reversal hook.",
            severity: "low",
            rationale: "A useful pressure test."
        )
    }
}

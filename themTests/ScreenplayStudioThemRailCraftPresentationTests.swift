import XCTest
import ScreenplayStudio
@testable import them

@MainActor
final class ScreenplayStudioThemRailCraftPresentationTests: XCTestCase {
    func testCharacterMemoryPreservesVisibilityAndStatePrecedence() {
        let card = makeCharacterCard(id: "june-0", name: "JUNE")

        XCTAssertEqual(
            characterPresentation(hasResponse: false, cards: [card]).content,
            .hidden
        )
        XCTAssertEqual(
            characterPresentation(
                isLoading: true,
                errorText: "Character memory unavailable",
                hasResponse: false,
                cards: [card]
            ).content,
            .loading
        )
        XCTAssertEqual(
            characterPresentation(
                errorText: "  Character memory unavailable  ",
                hasResponse: false,
                cards: [card]
            ).content,
            .failure(message: "  Character memory unavailable  ")
        )
        XCTAssertEqual(
            characterPresentation(
                errorText: " \n ",
                hasResponse: true
            ).content,
            .empty
        )
        XCTAssertEqual(
            characterPresentation(hasResponse: true, cards: [card]).content,
            .cards([card])
        )
    }

    func testCharacterMemoryPreservesCardOrderAndCanonicalProjection() {
        let june = makeCharacterCard(id: "june-0", name: "JUNE")
        let leo = makeCharacterCard(id: "leo-1", name: "LEO")
        let presentation = characterPresentation(
            hasResponse: true,
            cards: [june, leo]
        )

        guard case .cards(let cards) = presentation.content else {
            return XCTFail("A nonempty character response should render projected cards.")
        }
        XCTAssertEqual(cards.map(\.id), ["june-0", "leo-1"])
        XCTAssertEqual(cards.map(\.name), ["JUNE", "LEO"])
        XCTAssertEqual(cards.first?.archetypeLabel, "Hero")
        XCTAssertEqual(cards.first?.archetypeSummary, "Carries the story's moral choice.")
        XCTAssertEqual(cards.first?.archetypeScoreLabel, "82%")
    }

    func testReversalCardsPreserveOuterVisibilityAndMainPrecedence() {
        let card = makeTwistCard(id: "twist-1", severity: "high")

        XCTAssertEqual(
            reversalPresentation(
                acceptedErrorText: "Accepted list unavailable",
                acceptedCount: 2,
                hasResponse: false,
                cards: [card]
            ).content,
            .hidden
        )
        XCTAssertEqual(
            reversalPresentation(
                isLoading: true,
                errorText: "Suggestion unavailable",
                hasResponse: false,
                cards: [card]
            ).content,
            .loading
        )
        XCTAssertEqual(
            reversalPresentation(
                errorText: "  Suggestion unavailable  ",
                hasResponse: false,
                cards: [card]
            ).content,
            .failure(message: "  Suggestion unavailable  ")
        )
        XCTAssertEqual(
            reversalPresentation(
                errorText: " \n ",
                hasResponse: true
            ).content,
            .empty
        )

        let populated = reversalPresentation(hasResponse: true, cards: [card])
        guard case .cards(let cards) = populated.content else {
            return XCTFail("A nonempty reversal response should render projected cards.")
        }
        XCTAssertEqual(cards.map(\.id), ["twist-1"])
        XCTAssertEqual(cards.first?.card, card)
    }

    func testReversalCardsPreserveBeatAndAcceptedNoticeRawRules() {
        let acceptedFailure = reversalPresentation(
            beatLabel: " ",
            acceptedErrorText: "  Accepted list unavailable  ",
            acceptedCount: 2,
            hasResponse: true
        )
        XCTAssertEqual(acceptedFailure.beatLabel, " ")
        XCTAssertEqual(
            acceptedFailure.acceptedNotice,
            .failure(message: "  Accepted list unavailable  ")
        )

        let singular = reversalPresentation(
            beatLabel: "",
            acceptedErrorText: " \n ",
            acceptedCount: 1,
            hasResponse: true
        )
        XCTAssertEqual(singular.beatLabel, "Beat-aware twist pass")
        XCTAssertEqual(
            singular.acceptedNotice,
            .count(message: "1 kept reversal linked to this project.")
        )

        XCTAssertEqual(
            reversalPresentation(
                acceptedCount: 2,
                hasResponse: true
            ).acceptedNotice,
            .count(message: "2 kept reversals linked to this project.")
        )
        XCTAssertEqual(
            reversalPresentation(hasResponse: true).acceptedNotice,
            .hidden
        )
    }

    func testReversalCardActionsAndSeverityAreProjectedBeforeRendering() {
        let available = makeTwistCard(id: "available", severity: " HIGH ")
        let accepted = makeTwistCard(id: "accepted", severity: "medium", isAccepted: true)
        let neutral = makeTwistCard(id: "neutral", severity: "unexpected")

        let enabled = reversalPresentation(
            hasResponse: true,
            cards: [available, accepted, neutral],
            hasSelectedProject: true
        )
        guard case .cards(let enabledCards) = enabled.content else {
            return XCTFail("Expected projected reversal cards.")
        }
        XCTAssertEqual(enabledCards.map(\.severity), [.high, .medium, .neutral])
        XCTAssertEqual(enabledCards.map(\.keepLabel), ["Keep", "Kept", "Keep"])
        XCTAssertEqual(enabledCards.map(\.keepSystemImage), ["pin", "checkmark.circle.fill", "pin"])
        XCTAssertEqual(enabledCards.map(\.isKeepEnabled), [true, false, true])
        XCTAssertEqual(enabledCards.map(\.isDismissEnabled), [true, true, true])
        XCTAssertEqual(enabledCards.map(\.showsMutationProgress), [false, false, false])

        let mutating = reversalPresentation(
            hasResponse: true,
            cards: [available, accepted],
            isMutating: true,
            hasSelectedProject: true
        )
        guard case .cards(let mutatingCards) = mutating.content else {
            return XCTFail("Expected mutating reversal cards.")
        }
        XCTAssertEqual(mutatingCards.map(\.isKeepEnabled), [false, false])
        XCTAssertEqual(mutatingCards.map(\.isDismissEnabled), [false, false])
        XCTAssertEqual(mutatingCards.map(\.showsMutationProgress), [true, true])

        let noProject = reversalPresentation(
            hasResponse: true,
            cards: [available],
            hasSelectedProject: false
        )
        guard case .cards(let noProjectCards) = noProject.content else {
            return XCTFail("Expected a reversal card without project actions.")
        }
        XCTAssertEqual(noProjectCards.map(\.isKeepEnabled), [false])
        XCTAssertEqual(noProjectCards.map(\.isDismissEnabled), [false])
    }

    private func characterPresentation(
        isLoading: Bool = false,
        errorText: String = "",
        hasResponse: Bool,
        cards: [BackendCharacterTraitCardState] = []
    ) -> ScreenplayStudioCharacterMemoryPresentation {
        ScreenplayStudioCharacterMemoryPresentationPlanner.make(
            isLoading: isLoading,
            errorText: errorText,
            hasResponse: hasResponse,
            cards: cards
        )
    }

    private func reversalPresentation(
        beatLabel: String = "Midpoint",
        acceptedErrorText: String = "",
        acceptedCount: Int = 0,
        isLoading: Bool = false,
        errorText: String = "",
        hasResponse: Bool,
        cards: [ScreenplayCraftTwistCardState] = [],
        isMutating: Bool = false,
        hasSelectedProject: Bool = false
    ) -> ScreenplayStudioReversalCardsPresentation {
        ScreenplayStudioReversalCardsPresentationPlanner.make(
            beatLabel: beatLabel,
            acceptedErrorText: acceptedErrorText,
            acceptedCount: acceptedCount,
            isLoading: isLoading,
            errorText: errorText,
            hasResponse: hasResponse,
            cards: cards,
            isMutating: isMutating,
            hasSelectedProject: hasSelectedProject
        )
    }

    private func makeCharacterCard(
        id: String,
        name: String
    ) -> BackendCharacterTraitCardState {
        BackendCharacterTraitCardState(
            id: id,
            name: name,
            summary: "Default: guarded",
            chips: ["guarded", "terse"],
            detail: "2 phrases | 1 goal",
            hasTraits: true,
            archetypeLabel: "Hero",
            archetypeSummary: "Carries the story's moral choice.",
            archetypeScoreLabel: "82%",
            hasArchetype: true,
            fieldProvenance: []
        )
    }

    private func makeTwistCard(
        id: String,
        severity: String,
        isAccepted: Bool = false
    ) -> ScreenplayCraftTwistCardState {
        let suggestion = ScreenplayCraftTwistSuggestion(
            id: id,
            label: "False Victory",
            hook: "The win becomes a trap.",
            severity: severity,
            rationale: "Re-aims the third act."
        )
        return ScreenplayCraftTwistCardState(
            id: id,
            label: suggestion.label,
            hook: suggestion.hook,
            severity: severity,
            rationale: suggestion.rationale,
            severityLabel: severity.trimmingCharacters(in: .whitespacesAndNewlines).capitalized,
            suggestion: suggestion,
            isAccepted: isAccepted
        )
    }
}

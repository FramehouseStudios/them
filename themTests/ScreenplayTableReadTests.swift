import XCTest
import ScreenplayStudio
@testable import them

final class ScreenplayTableReadParserTests: XCTestCase {
    func testBuildsNarrationAndCharacterDialogueWithoutSpeakingCuesOrParentheticals() {
        let draft = """
        INT. OBSERVATORY - NIGHT

        Rain needles the glass.

        MARA (V.O.)
        (barely audible)
        The stars are a recording.

        JOHN^
        Then who pressed play?

        CUT TO:
        """

        let lines = ScreenplayTableReadParser.lines(from: draft)

        XCTAssertEqual(lines.map(\.displayText), [
            "INT. OBSERVATORY - NIGHT",
            "Rain needles the glass.",
            "The stars are a recording.",
            "Then who pressed play?",
            "CUT TO:",
        ])
        XCTAssertEqual(lines.map(\.role), [
            .narrator,
            .narrator,
            .character("MARA"),
            .character("JOHN"),
            .narrator,
        ])
        XCTAssertEqual(lines.map(\.sourceLine), [1, 3, 7, 10, 12])
        XCTAssertEqual(lines.first?.spokenText, "Interior OBSERVATORY, NIGHT")
        XCTAssertEqual(lines.last?.spokenText, "Cut To.")
    }

    func testPageNumbersFollowStandardFiftyFiveLineScreenplayPagination() {
        let draft = (1...56).map { "Action line \($0)." }.joined(separator: "\n")

        let lines = ScreenplayTableReadParser.lines(from: draft)

        XCTAssertEqual(lines.count, 56)
        XCTAssertEqual(lines[54].page, 1)
        XCTAssertEqual(lines[55].page, 2)
    }

    func testCharacterNameNormalizationPreservesIdentityAndDropsDeliveryQualifiers() {
        XCTAssertEqual(ScreenplayTableReadParser.normalizedCharacterName("MARA (V.O.)"), "MARA")
        XCTAssertEqual(ScreenplayTableReadParser.normalizedCharacterName("JOHN (CONT'D)"), "JOHN")
        XCTAssertEqual(ScreenplayTableReadParser.normalizedCharacterName("SAM^"), "SAM")
    }

    func testPlaybackSpeedLabelsStayCompactAndHumanReadable() {
        XCTAssertEqual(ScreenplayTableReadPlayer.speedLabel(0.8), "0.8×")
        XCTAssertEqual(ScreenplayTableReadPlayer.speedLabel(1), "1×")
        XCTAssertEqual(ScreenplayTableReadPlayer.speedLabel(1.25), "1.25×")
        XCTAssertEqual(ScreenplayTableReadPlayer.speedLabel(1.5), "1.5×")
    }
}

final class ScreenplayTableReadResumeStoreTests: XCTestCase {
    func testCheckpointsAreProjectScopedAndRoundTripLineAndSpeed() throws {
        let suiteName = "ScreenplayTableReadResumeStoreTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }

        ScreenplayTableReadResumeStore.save(
            ScreenplayTableReadCheckpoint(lineIndex: 17, speed: 1.25),
            projectID: "project-a",
            defaults: defaults
        )
        ScreenplayTableReadResumeStore.save(
            ScreenplayTableReadCheckpoint(lineIndex: 3, speed: 0.8),
            projectID: "project-b",
            defaults: defaults
        )

        XCTAssertEqual(
            ScreenplayTableReadResumeStore.load(projectID: "project-a", defaults: defaults),
            ScreenplayTableReadCheckpoint(lineIndex: 17, speed: 1.25)
        )
        XCTAssertEqual(
            ScreenplayTableReadResumeStore.load(projectID: "project-b", defaults: defaults),
            ScreenplayTableReadCheckpoint(lineIndex: 3, speed: 0.8)
        )
        XCTAssertNil(ScreenplayTableReadResumeStore.load(projectID: "project-c", defaults: defaults))
    }
}

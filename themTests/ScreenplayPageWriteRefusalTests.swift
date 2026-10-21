import XCTest
import DraftStudio
@testable import them

final class ScreenplayPageWriteRefusalTests: XCTestCase {
    private struct Fixture: Decodable {
        let text: String
        let refused: Bool
        let hadRefusal: Bool
    }

    func testSharedServerFixturesAlsoGuardSwiftRoutingWithStalePageSignals() throws {
        let path = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("backend/tests/fixtures/screenplay_write_refusal.json")
        let fixtures = try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: path))
        XCTAssertEqual(fixtures.count, 18)
        for fixture in fixtures {
            let analysis = DraftStudioPageWritePolicy.analyze(fixture.text)
            XCTAssertEqual(analysis.refusesPageWrite, fixture.refused, fixture.text)
            XCTAssertEqual(analysis.hadRefusal, fixture.hadRefusal, fixture.text)
            guard fixture.refused else { continue }
            XCTAssertNil(ScreenplayIntentClassifier.permittedPageRoutingText(fixture.text), fixture.text)
            XCTAssertFalse(ScreenplayIntentClassifier.hasExplicitScriptIntent(fixture.text), fixture.text)
            for target in [DraftStudioPromptTarget.automatic, .page, .voicePin] {
                XCTAssertFalse(DraftStudioPromptRouter.shouldRouteToPage(
                    fixture.text, preferredTarget: target,
                    signals: .init(isForcedPageWrite: true, isExplicitPageWrite: true)
                ), fixture.text)
            }
        }
    }

    func testSeparatePositiveCommandRemainsUsableWithoutReintroducingRefusedVerbs() throws {
        let text = "Do not rewrite the scene; continue from here instead."
        let routing = try XCTUnwrap(ScreenplayIntentClassifier.permittedPageRoutingText(text))
        XCTAssertFalse(routing.lowercased().contains("rewrite"))
        XCTAssertTrue(routing.lowercased().contains("continue"))
        XCTAssertTrue(DraftStudioPromptRouter.shouldRouteToPage(text, preferredTarget: .page))
        XCTAssertFalse(DraftStudioPromptRouter.shouldRouteToPage(text, preferredTarget: .voicePin))
        XCTAssertEqual(ScreenplayStudioScreen.StudioPromptIntent.rewrite.preparing(text), text)
    }

    func testIntentPreparationAndLegacyWrappersPreserveRefusal() {
        let text = "Do not rewrite this scene. Just discuss it."
        for intent in ScreenplayStudioScreen.StudioPromptIntent.allCases {
            XCTAssertEqual(intent.preparing(text), text, "metadata must not contradict the writer")
            let legacy = "\(intent.promptInstruction)\n\nWriter request: \(text)"
            XCTAssertTrue(DraftStudioPageWritePolicy.analyze(legacy).refusesPageWrite)
        }
    }

    func testExtractedDirectLineCuePreservesBothExistingFamilies() {
        for text in ["write two action lines", "write three screenplay dialogue lines"] {
            XCTAssertTrue(ScreenplayIntentClassifier.directPageWriteLinesCue(in: ScreenplayIntentClassifier.normalize(text)))
        }
        XCTAssertFalse(ScreenplayIntentClassifier.directPageWriteLinesCue(in: "what is an action line"))
    }
}

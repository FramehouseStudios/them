import XCTest
@testable import them

final class ScreenplayStudioPromptIntentTests: XCTestCase {
    func testEveryIntentPreparesAUniqueActionableModelInstruction() {
        let prompt = "  Make the midpoint choice harder.  "
        let advice = ScreenplayStudioScreen.StudioPromptIntent.advice.preparing(prompt)
        let rewrite = ScreenplayStudioScreen.StudioPromptIntent.rewrite.preparing(prompt)
        let voicePin = ScreenplayStudioScreen.StudioPromptIntent.voicePin.preparing(prompt)
        let prepared = [advice, rewrite, voicePin]

        XCTAssertEqual(Set(prepared).count, 3)
        XCTAssertTrue(prepared.allSatisfy { $0.contains("Writer request: Make the midpoint choice harder.") })
        XCTAssertTrue(advice.contains("actionable story advice"))
        XCTAssertTrue(rewrite.contains("screenplay-ready rewritten material"))
        XCTAssertTrue(voicePin.contains("companion-side development guidance"))
    }

    func testIntentPreparationRejectsEmptyInputInsteadOfSendingAStyleOnlyPrompt() {
        for intent in ScreenplayStudioScreen.StudioPromptIntent.allCases {
            XCTAssertEqual(intent.preparing(" \n "), "")
        }
    }

    func testIntentCompatibilityNeverCommitsNotesOrAdviceAsPageCopy() {
        XCTAssertEqual(
            ScreenplayStudioScreen.StudioPromptIntent.voicePin.compatible(routesToPage: true),
            .rewrite
        )
        XCTAssertEqual(
            ScreenplayStudioScreen.StudioPromptIntent.advice.compatible(routesToPage: true),
            .rewrite
        )
        XCTAssertEqual(
            ScreenplayStudioScreen.StudioPromptIntent.rewrite.compatible(routesToPage: false),
            .advice
        )
        XCTAssertEqual(
            ScreenplayStudioScreen.StudioPromptIntent.voicePin.compatible(routesToPage: false),
            .voicePin
        )
    }

    func testLivePageWriteStripsSayPrefixAndRoutesToRewriteOnPage() throws {
        let plan = try XCTUnwrap(
            ScreenplayStudioLiveIntentComposerPlanner.make(
                rawPrompt: "Say: write the next beat and make the choice irreversible",
                intentKind: .screenplayPageWrite
            )
        )
        XCTAssertEqual(plan.prompt, "write the next beat and make the choice irreversible")
        XCTAssertEqual(plan.routingMode, .page)
        XCTAssertEqual(plan.intent, .rewrite)
    }

    func testLiveStoryAskStripsAskPrefixAndStaysInAdviceVoicePin() throws {
        let plan = try XCTUnwrap(
            ScreenplayStudioLiveIntentComposerPlanner.make(
                rawPrompt: "ASK: what does this character want most?",
                intentKind: .storyDevelopment
            )
        )
        XCTAssertEqual(plan.prompt, "what does this character want most?")
        XCTAssertEqual(plan.routingMode, .voicePin)
        XCTAssertEqual(plan.intent, .advice)
    }
}

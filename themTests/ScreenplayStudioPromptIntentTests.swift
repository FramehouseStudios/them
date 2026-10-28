import XCTest
@testable import them

final class ScreenplayStudioPromptIntentTests: XCTestCase {
    func testEveryIntentPreparesAUniqueActionableModelInstruction() {
        let prompt = "  Make the midpoint choice harder.  "
        let advice = ScreenplayStudioScreen.StudioPromptIntent.advice.preparing(prompt)
        let write = ScreenplayStudioScreen.StudioPromptIntent.write.preparing(prompt)
        let rewrite = ScreenplayStudioScreen.StudioPromptIntent.rewrite.preparing(prompt)
        let voicePin = ScreenplayStudioScreen.StudioPromptIntent.voicePin.preparing(prompt)
        let prepared = [advice, write, rewrite, voicePin]

        XCTAssertEqual(Set(prepared).count, 4)
        XCTAssertTrue(prepared.allSatisfy { $0.contains("Writer request: Make the midpoint choice harder.") })
        XCTAssertTrue(advice.contains("actionable story advice"))
        XCTAssertTrue(write.contains("Write screenplay-ready material"))
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
            .write
        )
        XCTAssertEqual(
            ScreenplayStudioScreen.StudioPromptIntent.advice.compatible(routesToPage: true),
            .write
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

    func testLivePageWriteStripsSayPrefixAndRoutesToWriteOnPage() throws {
        let plan = try XCTUnwrap(
            ScreenplayStudioLiveIntentComposerPlanner.make(
                rawPrompt: "Say: write the next beat and make the choice irreversible",
                intentKind: .screenplayPageWrite
            )
        )
        XCTAssertEqual(plan.prompt, "write the next beat and make the choice irreversible")
        XCTAssertEqual(plan.routingMode, .page)
        XCTAssertEqual(plan.intent, .write)
    }

    func testPageDestinationDefaultsToWriteAndPreservesExplicitRewrite() {
        typealias Intent = ScreenplayStudioScreen.StudioPromptIntent
        XCTAssertEqual(Intent.write.title, "Write")
        XCTAssertEqual(Intent.write.placeholder, "Describe what you want Clementine to write")
        for intent in [Intent.advice, .write, .voicePin] {
            XCTAssertEqual(intent.selectingDestination(.page), .write)
            XCTAssertEqual(intent.compatible(routesToPage: true), .write)
        }
        XCTAssertEqual(Intent.rewrite.selectingDestination(.page), .rewrite)
        XCTAssertEqual(Intent.rewrite.compatible(routesToPage: true), .rewrite)
        XCTAssertEqual(Intent.rewrite.placeholder, "Describe the rewrite you want on the page")
    }

    func testWriteAndRewriteStayOffThePageWhenDestinationChanges() {
        typealias Intent = ScreenplayStudioScreen.StudioPromptIntent
        for intent in [Intent.write, .rewrite] {
            XCTAssertEqual(intent.selectingDestination(.voicePin), .voicePin)
            XCTAssertEqual(intent.selectingDestination(.automatic), .advice)
            XCTAssertEqual(intent.compatible(routesToPage: false), .advice)
        }
        XCTAssertEqual(Intent.advice.selectingDestination(.voicePin), .advice)
        XCTAssertEqual(Intent.voicePin.selectingDestination(.voicePin), .voicePin)
    }

    func testWriteStoryAndContinuationKeepTheirRequestWithoutRewriteInstructions() {
        for request in [
            "Write a story about two astronauts discovering a painted sky.",
            "Continue the scene with JOHN finally listening.",
            "Write the next page. Keep the cafe\u{0301} detail.\nLeave the door open."
        ] {
            let intent = ScreenplayStudioScreen.StudioPromptIntent.advice.compatible(routesToPage: true)
            let prepared = intent.preparing(request)
            XCTAssertTrue(prepared.utf8.suffix(request.utf8.count).elementsEqual(request.utf8))
            XCTAssertFalse(intent.promptInstruction.lowercased().contains("rewrite"))
            XCTAssertFalse(intent.promptInstruction.lowercased().contains("rewritten"))
            XCTAssertFalse(prepared.contains("Intent: Produce screenplay-ready rewritten material"))
        }
    }

    func testExplicitRewriteInstructionAndWriterRequestAreUnchanged() {
        let intent = ScreenplayStudioScreen.StudioPromptIntent.rewrite.compatible(routesToPage: true)
        let request = "Rewrite only JOHN's fourth line on page 25. Keep everything else."
        XCTAssertEqual(intent.preparing(request),
            "Intent: Produce screenplay-ready rewritten material that directly answers the writer.\n\nWriter request: " + request)
        // Generic Write still follows a writer-requested revision; it does not
        // relabel every new-story/continuation request as a rewrite.
        XCTAssertTrue(ScreenplayStudioScreen.StudioPromptIntent.write.preparing(request).hasSuffix(request))
    }

    func testEveryIntentKeepsPageRefusalUnwrapped() {
        let request = "Do not rewrite this scene. Just discuss the ending."
        for intent in ScreenplayStudioScreen.StudioPromptIntent.allCases {
            XCTAssertEqual(intent.preparing("  " + request + "  "), request)
        }
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

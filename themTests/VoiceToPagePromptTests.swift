import XCTest
@testable import them

@MainActor
final class VoiceToPagePromptTests: XCTestCase {
    func testPromptCarriesFeatureScreenplayContinuityContract() {
        let prompt = VoiceToPageOrchestrator.makeScreenplaySystemPrompt()

        XCTAssertTrue(prompt.contains("feature-screenplay writing partner"))
        XCTAssertTrue(prompt.contains("Protect feature-length continuity"))
        XCTAssertTrue(prompt.contains("setups/payoffs"))
        XCTAssertTrue(prompt.contains("Output ONLY pure Fountain screenplay format"))
    }

    func testPromptIncludesActiveDraftExcerptForContinuation() {
        let draft = """
        INT. DINER - NIGHT

        JUNE watches rain tremble in the neon.

        MARCUS
        You always look at the door before you lie.
        """

        let prompt = VoiceToPageOrchestrator.makeScreenplaySystemPrompt(existingDraft: draft)

        XCTAssertTrue(prompt.contains("ACTIVE DRAFT EXCERPT"))
        XCTAssertTrue(prompt.contains("JUNE watches rain"))
        XCTAssertTrue(prompt.contains("continue from the live page"))
    }

    func testPromptIncludesCompactRecentTurns() {
        let prompt = VoiceToPageOrchestrator.makeScreenplaySystemPrompt(
            recentTurns: [
                (role: "user", text: "Keep the scene quiet."),
                (role: "assistant", text: "INT. DINER - NIGHT\n\nJUNE waits."),
            ]
        )

        XCTAssertTrue(prompt.contains("RECENT VOICE-TO-PAGE TURNS"))
        XCTAssertTrue(prompt.contains("USER: Keep the scene quiet."))
        XCTAssertTrue(prompt.contains("CLEMENTINE: INT. DINER - NIGHT"))
    }

    func testPrototypeRealtimeConnectStaysOnStableTurnBasedPath() async {
        let orchestrator = VoiceToPageOrchestrator()

        await orchestrator.connectRealtime()

        XCTAssertEqual(orchestrator.currentMode, .turnBased)
        XCTAssertFalse(orchestrator.useStreamCursor)
    }
}

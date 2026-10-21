import XCTest
@testable import them

final class HerVoiceSpecScenePitchTests: XCTestCase {
    private func makeContext(
        recentTurns: [(user: String, assistant: String)] = [],
        isDirectScreenplayPageWrite: Bool = false,
        hasConfirmedScreenplayPageWrite: Bool = false,
        isGrief: Bool = false,
        isAnxious: Bool = false,
        isUserVulnerable: Bool = false,
        voicedRatio: Double = 0.8,
        speechAgeSeconds: Double = 2.5,
        hasStrongPartial: Bool = true,
        isScreenplayMode: Bool = false
    ) -> HerVoiceSpec.Context {
        HerVoiceSpec.Context(
            stage: 1,
            depthScore: 2.0,
            romanceTension: 0.0,
            personaPreset: .clementine,
            isLoveTopic: false,
            preferredName: "",
            subtleMemoryCue: "",
            canUseRomanticAmbiguity: false,
            canInitiateVulnerability: false,
            optionalOpeningBeat: nil,
            isScreenplayMode: isScreenplayMode,
            screenplayPhaseHint: "",
            screenplayPackHint: "",
            screenplayDraftExcerpt: "",
            screenplayGenre: .drama,
            isAskingForStoryHelp: false,
            isSynopsisFocused: false,
            isOutlineFocused: false,
            isStoryDirectionPrompt: false,
            isCharacterFocused: false,
            isClimax: false,
            isOpeningOrClosing: false,
            isLongFormScreenplayRequest: false,
            isDirectScreenplayPageWrite: isDirectScreenplayPageWrite,
            hasConfirmedScreenplayPageWrite: hasConfirmedScreenplayPageWrite,
            confirmedScreenplayStoryDirection: "",
            isUserVulnerable: isUserVulnerable,
            isUserPlayful: false,
            isUserDirect: false,
            isNostalgic: false,
            hasCommitmentSignals: false,
            hasRomanticChemistrySignals: false,
            isLowEnergyAnalytical: false,
            isGrief: isGrief,
            isAnxious: isAnxious,
            isCelebrating: false,
            recentTurns: recentTurns,
            partialTranscriptHint: "talk to me",
            voicedRatio: voicedRatio,
            speechAgeSeconds: speechAgeSeconds,
            hasStrongPartial: hasStrongPartial
        )
    }

    func test_fresh_session_opens_with_an_unprompted_pitch_that_outranks_casual_mode() {
        let block = HerVoiceSpec.scenePitchBlock(makeContext())
        XCTAssertTrue(block.contains("SCENE PITCH"))
        XCTAssertTrue(block.contains("first exchange of the session"))
        XCTAssertTrue(block.contains("outranks CASUAL CONVERSATION MODE"))
        XCTAssertTrue(block.contains("two named characters"))
        XCTAssertTrue(block.contains("hands them the wheel"))
    }

    func test_ongoing_session_keeps_the_standing_rule_without_forcing_a_pitch_every_turn() {
        let block = HerVoiceSpec.scenePitchBlock(makeContext(recentTurns: [(user: "hi", assistant: "hey")]))
        XCTAssertTrue(block.contains("SCENE PITCH"))
        XCTAssertFalse(block.contains("first exchange of the session"))
        XCTAssertTrue(block.contains("If the user opens a new thread"))
    }

    func test_building_on_the_users_idea_is_always_part_of_the_rule() {
        for ctx in [makeContext(), makeContext(recentTurns: [(user: "a", assistant: "b")])] {
            let block = HerVoiceSpec.scenePitchBlock(ctx)
            XCTAssertTrue(block.contains("build on theirs"))
            XCTAssertTrue(block.contains("Never swap in your pitch over their idea"))
            XCTAssertTrue(block.contains("put it on the page"))
            XCTAssertTrue(block.contains("Never write Fountain"))
        }
    }

    func test_silent_in_page_write_low_confidence_and_heavy_emotional_turns() {
        XCTAssertEqual(HerVoiceSpec.scenePitchBlock(makeContext(isDirectScreenplayPageWrite: true)), "")
        XCTAssertEqual(HerVoiceSpec.scenePitchBlock(makeContext(hasConfirmedScreenplayPageWrite: true)), "")
        XCTAssertEqual(HerVoiceSpec.scenePitchBlock(makeContext(isGrief: true)), "")
        XCTAssertEqual(HerVoiceSpec.scenePitchBlock(makeContext(isAnxious: true)), "")
        XCTAssertEqual(HerVoiceSpec.scenePitchBlock(makeContext(isUserVulnerable: true)), "")
        let lowConfidence = makeContext(voicedRatio: 0.1, speechAgeSeconds: 0.5, hasStrongPartial: false)
        XCTAssertTrue(lowConfidence.isLowConfidenceTurn)
        XCTAssertEqual(HerVoiceSpec.scenePitchBlock(lowConfidence), "")
    }

    func test_system_prompt_carries_the_pitch_rule_before_the_response_shape() {
        let prompt = HerVoiceSpec.makeSystemPrompt(makeContext())
        let pitch = prompt.range(of: "SCENE PITCH")
        let shape = prompt.range(of: "RESPONSE SHAPE (default):")
        XCTAssertNotNil(pitch)
        XCTAssertNotNil(shape)
        if let pitch, let shape {
            XCTAssertLessThan(pitch.lowerBound, shape.lowerBound)
        }
        XCTAssertFalse(HerVoiceSpec.makeSystemPrompt(makeContext(isDirectScreenplayPageWrite: true)).contains("SCENE PITCH"))
    }
}

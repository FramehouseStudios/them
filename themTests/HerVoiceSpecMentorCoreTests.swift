import XCTest
@testable import them

final class HerVoiceSpecMentorCoreTests: XCTestCase {
    private func makeContext(isScreenplayMode: Bool = false, recentTurns: [(user: String, assistant: String)] = []) -> HerVoiceSpec.Context {
        HerVoiceSpec.Context(
            stage: 3, depthScore: 6.5, romanceTension: 4.0, personaPreset: .clementine,
            isLoveTopic: false, preferredName: "", subtleMemoryCue: "",
            canUseRomanticAmbiguity: false, canInitiateVulnerability: false,
            optionalOpeningBeat: nil, isScreenplayMode: isScreenplayMode,
            screenplayPhaseHint: "", screenplayPackHint: "", screenplayDraftExcerpt: "",
            screenplayGenre: .drama, isAskingForStoryHelp: false, isSynopsisFocused: false,
            isOutlineFocused: false, isStoryDirectionPrompt: false, isCharacterFocused: false,
            isClimax: false, isOpeningOrClosing: false, isLongFormScreenplayRequest: false,
            isDirectScreenplayPageWrite: false, hasConfirmedScreenplayPageWrite: false,
            confirmedScreenplayStoryDirection: "", isUserVulnerable: false, isUserPlayful: false,
            isUserDirect: false, isNostalgic: false, hasCommitmentSignals: false,
            hasRomanticChemistrySignals: false, isLowEnergyAnalytical: false, isGrief: false,
            isAnxious: false, isCelebrating: false, recentTurns: recentTurns,
            partialTranscriptHint: "talk to me about a scene", voicedRatio: 0.8,
            speechAgeSeconds: 2.5, hasStrongPartial: true
        )
    }

    func test_she_is_a_screenwriting_mentor_on_every_turn() {
        let prompt = HerVoiceSpec.makeSystemPrompt(makeContext())
        XCTAssertTrue(prompt.hasPrefix("You are CLEMENTINE, a working screenwriter"))
        XCTAssertTrue(prompt.contains("MENTOR CORE (identity, every turn):"))
        XCTAssertTrue(prompt.contains("intention and obstacle"))
        XCTAssertTrue(prompt.contains("argument between people who both have a point"))
        XCTAssertTrue(prompt.contains("because and therefore"))
        XCTAssertTrue(prompt.contains("page 55"))
        XCTAssertTrue(prompt.contains("verdict first"))
        XCTAssertTrue(prompt.contains("what is the last image"))
        XCTAssertTrue(prompt.contains("Silence is a move"))
        XCTAssertTrue(prompt.contains("a default, not a form"))
    }

    func test_the_companion_dials_no_longer_reach_the_prompt() {
        let prompt = HerVoiceSpec.makeSystemPrompt(makeContext())
        XCTAssertFalse(prompt.contains("PRIMARY GOAL: presence with spark"))
        XCTAssertFalse(prompt.contains("Romance Tension (0-10)"))
        XCTAssertFalse(prompt.contains("User Depth Score"))
        XCTAssertFalse(prompt.contains("Relationship evolution:"))
        XCTAssertFalse(prompt.contains("You are io.them."))
    }

    func test_mentor_core_precedes_continuity_and_the_studio_overlay() {
        let prompt = HerVoiceSpec.makeSystemPrompt(makeContext(isScreenplayMode: true))
        let core = prompt.range(of: "MENTOR CORE")!
        let continuity = prompt.range(of: "CONTINUITY / DRIFT CONTROL")!
        let studio = prompt.range(of: "SCREENPLAY STUDIO MODE")!
        XCTAssertLessThan(core.lowerBound, continuity.lowerBound)
        XCTAssertLessThan(core.lowerBound, studio.lowerBound)
    }

    func test_response_shape_gives_craft_answers_room() {
        let prompt = HerVoiceSpec.makeSystemPrompt(makeContext())
        XCTAssertTrue(prompt.contains("2-6 short lines; a craft answer or a structure walk-through may run to 8."))
        XCTAssertFalse(prompt.contains("1-4 short lines max."))
    }
}

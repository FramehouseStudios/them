import XCTest
@testable import them

/// The backend fits every system prompt to a per-turn budget and only keeps
/// tagged blocks whole. Her identity has to travel inside those tags or the
/// page map, the pitch rule and the dialogue-notes mode get cut mid-line.
final class HerVoiceSpecTrimTagsTests: XCTestCase {
    private func makeContext(
        isScreenplayMode: Bool = false,
        isDirectScreenplayPageWrite: Bool = false,
        isDialogueNotes: Bool = false
    ) -> HerVoiceSpec.Context {
        var ctx = HerVoiceSpec.Context(
            stage: 3, depthScore: 6.5, romanceTension: 4.0, personaPreset: .clementine,
            isLoveTopic: false, preferredName: "", subtleMemoryCue: "",
            canUseRomanticAmbiguity: false, canInitiateVulnerability: false,
            optionalOpeningBeat: nil, isScreenplayMode: isScreenplayMode,
            screenplayPhaseHint: "", screenplayPackHint: "",
            screenplayDraftExcerpt: isScreenplayMode ? "INT. PORCH - NIGHT" : "",
            screenplayGenre: .drama, isAskingForStoryHelp: isDialogueNotes, isSynopsisFocused: false,
            isOutlineFocused: false, isStoryDirectionPrompt: false, isCharacterFocused: false,
            isClimax: false, isOpeningOrClosing: false, isLongFormScreenplayRequest: false,
            isDirectScreenplayPageWrite: isDirectScreenplayPageWrite, hasConfirmedScreenplayPageWrite: false,
            confirmedScreenplayStoryDirection: "", isUserVulnerable: false, isUserPlayful: false,
            isUserDirect: false, isNostalgic: false, hasCommitmentSignals: false,
            hasRomanticChemistrySignals: false, isLowEnergyAnalytical: false, isGrief: false,
            isAnxious: false, isCelebrating: false, recentTurns: [],
            partialTranscriptHint: "talk to me about a scene", voicedRatio: 0.8,
            speechAgeSeconds: 2.5, hasStrongPartial: true
        )
        ctx.isDialogueNotesPrompt = isDialogueNotes
        return ctx
    }

    func test_mentor_core_travels_inside_its_protected_tag() {
        let prompt = HerVoiceSpec.makeSystemPrompt(makeContext())
        XCTAssertTrue(prompt.contains("<mentor_core>\n\(HerVoiceSpec.mentorCoreBlock)\n</mentor_core>"))
        XCTAssertEqual(prompt.components(separatedBy: "<mentor_core>").count, 2)
    }

    func test_scene_pitch_is_tagged_only_when_it_is_present() {
        let fresh = HerVoiceSpec.makeSystemPrompt(makeContext())
        XCTAssertTrue(fresh.contains("<scene_pitch>\nSCENE PITCH"))
        XCTAssertTrue(fresh.contains("</scene_pitch>"))
        let pageWrite = HerVoiceSpec.makeSystemPrompt(makeContext(isDirectScreenplayPageWrite: true))
        XCTAssertFalse(pageWrite.contains("<scene_pitch>"))
        XCTAssertFalse(pageWrite.contains("</scene_pitch>"))
    }

    func test_dialogue_notes_mode_is_tagged() {
        let prompt = HerVoiceSpec.makeSystemPrompt(makeContext(isScreenplayMode: true, isDialogueNotes: true))
        XCTAssertTrue(prompt.contains("<dialogue_notes>\nDIALOGUE NOTES MODE:"))
        XCTAssertTrue(prompt.contains("</dialogue_notes>"))
    }
}

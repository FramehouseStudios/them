import XCTest
@testable import them

final class ScreenplayIntentClassifierTests: XCTestCase {
    func test_story_help_is_recognized_from_pattern_families_not_exact_phrases() {
        let yes = [
            "Talk to me about a scene.",
            "I don't know where act two goes.",
            "Is this scene working?",
            "My ending feels flat.",
            "What should happen after the midpoint?",
            "Give me an idea for the opening.",
            "Notes on this line: I'm so angry at you.",
            "Help me fix the climax.",
            "I'm stuck on the second act.",
            "Walk me through the first plot point.",
        ]
        for text in yes { XCTAssertTrue(ScreenplayIntentClassifier.asksForStoryHelp(text), text) }
        let no = [
            "I had a rough morning.",
            "What should I make for dinner?",
            "How are you?",
            "Tell me about your day.",
            "My sister is visiting this weekend.",
        ]
        for text in no { XCTAssertFalse(ScreenplayIntentClassifier.asksForStoryHelp(text), text) }
    }

    func test_character_questions_need_a_character_and_a_cue() {
        XCTAssertTrue(ScreenplayIntentClassifier.asksAboutCharacter("Why does she stay with him?"))
        XCTAssertTrue(ScreenplayIntentClassifier.asksAboutCharacter("My protagonist feels flat."))
        XCTAssertTrue(ScreenplayIntentClassifier.asksAboutCharacter("What does the antagonist want?"))
        XCTAssertFalse(ScreenplayIntentClassifier.asksAboutCharacter("She called me back finally."))
        XCTAssertFalse(ScreenplayIntentClassifier.asksAboutCharacter("The character limit on the field is 40."))
    }

    func test_filmmaker_mode_sticks_when_the_script_is_in_the_room_or_recently_discussed() {
        let turns: [(user: String, assistant: String)] = [(user: "the diner scene", assistant: "Let him refill the coffee.")]
        XCTAssertTrue(ScreenplayIntentClassifier.shouldStayInFilmmakerMode(text: "What about the ending?", recentTurns: turns, hasScriptInRoom: false))
        XCTAssertTrue(ScreenplayIntentClassifier.shouldStayInFilmmakerMode(text: "Should she leave the page early?", recentTurns: [], hasScriptInRoom: true))
        XCTAssertFalse(ScreenplayIntentClassifier.shouldStayInFilmmakerMode(text: "What about lunch?", recentTurns: turns, hasScriptInRoom: true), "story-free small talk stays companion")
        XCTAssertFalse(ScreenplayIntentClassifier.shouldStayInFilmmakerMode(text: "The ending of that movie was wild", recentTurns: [], hasScriptInRoom: false), "no script in the room, no recent script talk")
        XCTAssertTrue(ScreenplayIntentClassifier.shouldStayInFilmmakerMode(text: "I'm stuck on the second act.", recentTurns: [], hasScriptInRoom: false), "a direct ask always counts")
    }

    func test_director_context_uses_the_classifier_for_story_help_and_character() {
        let store = HerEvolutionStore.shared
        XCTAssertTrue(HerDirectorContext.build(from: store, userText: "Talk to me about a scene.").isAskingForStoryHelp)
        XCTAssertTrue(HerDirectorContext.build(from: store, userText: "My ending feels flat.").isAskingForStoryHelp)
        XCTAssertTrue(HerDirectorContext.build(from: store, userText: "Why does she stay with him?").isCharacterFocused)
        XCTAssertFalse(HerDirectorContext.build(from: store, userText: "I had a rough morning.").isAskingForStoryHelp)
    }
}

final class DialogueNotesModeTests: XCTestCase {
    func test_dialogue_notes_are_recognized() {
        for text in [
            "Notes on this line: I'm so angry at you right now.",
            "Does this line work? He says: I'm scared we're going to lose the house.",
            "Is this exchange too on the nose?",
            "Here's my line. She says: You betrayed me.",
            "Marcus says: for the cup.",
        ] {
            XCTAssertTrue(ScreenplayIntentClassifier.asksForDialogueNotes(text), text)
        }
        for text in ["Write the next scene.", "Punch up this exchange.", "My sister says hi.", "What should happen after the midpoint?"] {
            XCTAssertFalse(ScreenplayIntentClassifier.asksForDialogueNotes(text), text)
        }
    }

    func test_director_context_and_studio_overlay_carry_the_notes_mode() {
        let director = HerDirectorContext.build(from: HerEvolutionStore.shared, userText: "Notes on this line: I'm so angry at you.")
        XCTAssertTrue(director.isDialogueNotesPrompt)
        var ctx = HerVoiceSpec.Context(
            stage: 1, depthScore: 0, romanceTension: 0, personaPreset: .clementine,
            isLoveTopic: false, preferredName: "", subtleMemoryCue: "",
            canUseRomanticAmbiguity: false, canInitiateVulnerability: false,
            optionalOpeningBeat: nil, isScreenplayMode: true,
            screenplayPhaseHint: "", screenplayPackHint: "", screenplayDraftExcerpt: "INT. PORCH - NIGHT",
            screenplayGenre: .drama, isAskingForStoryHelp: true, isSynopsisFocused: false,
            isOutlineFocused: false, isStoryDirectionPrompt: false, isCharacterFocused: false,
            isClimax: false, isOpeningOrClosing: false, isLongFormScreenplayRequest: false,
            isDirectScreenplayPageWrite: false, hasConfirmedScreenplayPageWrite: false,
            confirmedScreenplayStoryDirection: "", isUserVulnerable: false, isUserPlayful: false,
            isUserDirect: false, isNostalgic: false, hasCommitmentSignals: false,
            hasRomanticChemistrySignals: false, isLowEnergyAnalytical: false, isGrief: false,
            isAnxious: false, isCelebrating: false, recentTurns: [],
            partialTranscriptHint: "notes on this line", voicedRatio: 0.8,
            speechAgeSeconds: 2.5, hasStrongPartial: true
        )
        XCTAssertFalse(ctx.isDialogueNotesPrompt, "defaults off so existing call sites are unchanged")
        ctx.isDialogueNotesPrompt = true
        let prompt = HerVoiceSpec.makeSystemPrompt(ctx)
        XCTAssertTrue(prompt.contains("DIALOGUE NOTES MODE:"))
        XCTAssertTrue(prompt.contains("exactly one rewritten line in quotes"))
        XCTAssertFalse(prompt.contains("STORY ADVICE MODE:"), "notes mode replaces story advice for this turn")
        XCTAssertFalse(prompt.contains("PAGE WRITE MODE:"))
    }
}

import XCTest
import Foundation
@testable import them

@MainActor
final class ScreenplayPromptModeTests: XCTestCase {
    func testDirectorContextDetectsSynopsisDevelopmentPrompt() {
        let context = HerDirectorContext.build(
            from: HerEvolutionStore.shared,
            userText: "Write me a synopsis for a short thriller about a paramedic who keeps hearing tomorrow's emergency calls a day early."
        )

        XCTAssertTrue(context.isSynopsisFocused)
        XCTAssertTrue(context.isAskingForStoryHelp)
        XCTAssertFalse(context.isOutlineFocused)
        XCTAssertFalse(context.isLongFormScreenplayRequest)
    }

    func testDirectorContextDetectsLongFormScreenplayRequest() {
        let context = HerDirectorContext.build(
            from: HerEvolutionStore.shared,
            userText: "Write a longer scene and really play out the full sequence where she finally confronts her father."
        )

        XCTAssertTrue(context.isLongFormScreenplayRequest)
    }

    func testDirectorContextDetectsFeatureLengthScreenplayRequest() {
        let context = HerDirectorContext.build(
            from: HerEvolutionStore.shared,
            userText: "Help me finish this feature-length screenplay and shape act two of the whole movie."
        )

        XCTAssertTrue(context.isLongFormScreenplayRequest)
    }

    func testDirectorContextDetectsStoryDirectionPrompt() {
        let context = HerDirectorContext.build(
            from: HerEvolutionStore.shared,
            userText: "What if she calls him from the parking lot instead?"
        )

        XCTAssertTrue(context.isStoryDirectionPrompt)
        XCTAssertTrue(context.isAskingForStoryHelp)
    }

    func testDirectorContextDetectsOutlinePrompt() {
        let context = HerDirectorContext.build(
            from: HerEvolutionStore.shared,
            userText: "Give me a beat sheet outline for a contained motel-room thriller."
        )

        XCTAssertTrue(context.isSynopsisFocused)
        XCTAssertTrue(context.isOutlineFocused)
    }

    func testSystemPromptUsesSynopsisDevelopmentMode() {
        let prompt = HerVoiceSpec.makeSystemPrompt(makeContext(
            isSynopsisFocused: true,
            isAskingForStoryHelp: true,
            hasConfirmedScreenplayPageWrite: false,
            confirmedScreenplayStoryDirection: ""
        ))

        XCTAssertTrue(prompt.contains("SYNOPSIS DEVELOPMENT MODE"))
        XCTAssertTrue(prompt.contains("Do not output Fountain in this mode."))
        XCTAssertTrue(prompt.contains("dramatic engine"))
    }

    func testSystemPromptAddsOutlineFormattingWhenOutlineFocused() {
        let prompt = HerVoiceSpec.makeSystemPrompt(makeContext(
            isSynopsisFocused: true,
            isOutlineFocused: true,
            isAskingForStoryHelp: true,
            hasConfirmedScreenplayPageWrite: false,
            confirmedScreenplayStoryDirection: ""
        ))

        XCTAssertTrue(prompt.contains("OUTLINE / BEAT SHEET FORMAT"))
        XCTAssertTrue(prompt.contains("BEATS section"))
    }

    func testSystemPromptAddsLongFormPageWriteSignal() {
        let prompt = HerVoiceSpec.makeSystemPrompt(makeContext(
            isSynopsisFocused: false,
            isAskingForStoryHelp: false,
            isLongFormScreenplayRequest: true,
            isDirectScreenplayPageWrite: true,
            hasConfirmedScreenplayPageWrite: true,
            confirmedScreenplayStoryDirection: "Write a longer confrontation scene in the kitchen."
        ))

        XCTAssertTrue(prompt.contains("PAGE WRITE MODE"))
        XCTAssertTrue(prompt.contains("LONGER PAGE WRITE SIGNAL"))
        XCTAssertTrue(prompt.contains("full scene section or beat sequence"))
        XCTAssertTrue(prompt.contains("feature-length"))
        XCTAssertTrue(prompt.contains("act pressure"))
        XCTAssertTrue(prompt.contains("OUTPUT ONLY FOUNTAIN TEXT."))
    }

    func testSystemPromptUsesStoryAdviceMode() {
        let prompt = HerVoiceSpec.makeSystemPrompt(makeContext(
            isSynopsisFocused: false,
            isStoryDirectionPrompt: true,
            isAskingForStoryHelp: true,
            isDirectScreenplayPageWrite: false,
            hasConfirmedScreenplayPageWrite: false,
            confirmedScreenplayStoryDirection: ""
        ))

        XCTAssertTrue(prompt.contains("STORY ADVICE MODE"))
        XCTAssertTrue(prompt.contains("Do not output Fountain in this mode."))
        XCTAssertTrue(prompt.contains("Do not write sample screenplay text"))
    }

    func testSystemPromptUsesPageWriteModeForExplicitPages() {
        let prompt = HerVoiceSpec.makeSystemPrompt(makeContext(
            isSynopsisFocused: false,
            isAskingForStoryHelp: false,
            isDirectScreenplayPageWrite: true,
            hasConfirmedScreenplayPageWrite: false,
            confirmedScreenplayStoryDirection: "Write the next scene in the motel parking lot."
        ))

        XCTAssertTrue(prompt.contains("PAGE WRITE MODE"))
        XCTAssertTrue(prompt.contains("Do not give notes."))
        XCTAssertTrue(prompt.contains("OUTPUT ONLY FOUNTAIN TEXT."))
    }

    func testSystemPromptFramesClementineAsFeatureScreenwritingPartner() {
        let prompt = HerVoiceSpec.makeSystemPrompt(makeContext(
            isSynopsisFocused: false,
            isAskingForStoryHelp: false,
            isDirectScreenplayPageWrite: true,
            hasConfirmedScreenplayPageWrite: false,
            confirmedScreenplayStoryDirection: "Write the next scene in the motel parking lot."
        ))

        XCTAssertTrue(prompt.contains("feature-length scripts"))
        XCTAssertTrue(prompt.contains("from first page through final sequence"))
        XCTAssertFalse(prompt.contains("short film writer"))
    }

    func testCoWriterCompanionModeCarriesFeatureContinuityInstruction() {
        let instruction = StudioCompanionMode.coWriter.promptInstruction

        XCTAssertTrue(instruction.contains("emotionally present"))
        XCTAssertTrue(instruction.contains("feature-length continuity"))
        XCTAssertTrue(instruction.contains("setups/payoffs"))
    }

    private func makeContext(
        isSynopsisFocused: Bool,
        isOutlineFocused: Bool = false,
        isStoryDirectionPrompt: Bool = false,
        isAskingForStoryHelp: Bool,
        isLongFormScreenplayRequest: Bool = false,
        isDirectScreenplayPageWrite: Bool = false,
        hasConfirmedScreenplayPageWrite: Bool,
        confirmedScreenplayStoryDirection: String
    ) -> HerVoiceSpec.Context {
        HerVoiceSpec.Context(
            stage: 3,
            depthScore: 5.0,
            romanceTension: 1.0,
            personaPreset: .clementine,
            isLoveTopic: false,
            preferredName: "Joshua",
            subtleMemoryCue: "",
            canUseRomanticAmbiguity: false,
            canInitiateVulnerability: true,
            optionalOpeningBeat: nil,
            isScreenplayMode: true,
            screenplayPhaseHint: "scene_draft",
            screenplayPackHint: "Scene Draft",
            screenplayDraftExcerpt: "INT. KITCHEN - NIGHT\n\nShe stands at the sink, waiting.",
            screenplayGenre: .thriller,
            isAskingForStoryHelp: isAskingForStoryHelp,
            isSynopsisFocused: isSynopsisFocused,
            isOutlineFocused: isOutlineFocused,
            isStoryDirectionPrompt: isStoryDirectionPrompt,
            isCharacterFocused: false,
            isClimax: false,
            isOpeningOrClosing: false,
            isLongFormScreenplayRequest: isLongFormScreenplayRequest,
            isDirectScreenplayPageWrite: isDirectScreenplayPageWrite,
            hasConfirmedScreenplayPageWrite: hasConfirmedScreenplayPageWrite,
            confirmedScreenplayStoryDirection: confirmedScreenplayStoryDirection,
            isUserVulnerable: false,
            isUserPlayful: false,
            isUserDirect: true,
            isNostalgic: false,
            hasCommitmentSignals: false,
            hasRomanticChemistrySignals: false,
            isLowEnergyAnalytical: false,
            isGrief: false,
            isAnxious: false,
            isCelebrating: false,
            recentTurns: [],
            partialTranscriptHint: "",
            voicedRatio: 1.0,
            speechAgeSeconds: 2.0,
            hasStrongPartial: true
        )
    }
}

final class ScreenplayCompanionAnalyticsSnapshotTests: XCTestCase {
    func testLegacyAnalyticsDecodeDefaultsFirstPageTelemetryFields() throws {
        let data = Data(#"""
        {
          "updated_at": "2026-05-09T19:30:00Z",
          "total_turns": 4,
          "home_turns": 1,
          "studio_turns": 3,
          "voice_turns": 2,
          "typed_turns": 2,
          "mode_switches": 1,
          "memory_clears": 0,
          "thread_clears": 0,
          "last_surface_raw": "studio",
          "last_source_raw": "voice"
        }
        """#.utf8)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601

        let analytics = try decoder.decode(ScreenplayCompanionAnalyticsSnapshot.self, from: data)

        XCTAssertEqual(analytics.totalTurns, 4)
        XCTAssertEqual(analytics.lastSurface, .studio)
        XCTAssertEqual(analytics.lastSource, .voice)
        XCTAssertNil(analytics.firstPageWrittenAt)
        XCTAssertFalse(analytics.hasFirstPageWrittenEvent)
        XCTAssertEqual(analytics.firstPageWrittenSourceRaw, "")
    }

    func testFirstPageWrittenTelemetryRoundTripsSnakeCase() throws {
        let firstPageWrittenAt = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-05-09T19:45:00Z"))
        let analytics = ScreenplayCompanionAnalyticsSnapshot(
            updatedAt: firstPageWrittenAt,
            totalTurns: 1,
            homeTurns: 0,
            studioTurns: 1,
            voiceTurns: 1,
            typedTurns: 0,
            modeSwitches: 0,
            memoryClears: 0,
            threadClears: 0,
            lastSurfaceRaw: "studio",
            lastSourceRaw: "voice",
            firstPageWrittenAt: firstPageWrittenAt,
            firstPageWrittenSourceRaw: "voice",
            firstPageWrittenProjectId: "project-17",
            firstPageWrittenVersionId: "version-3"
        )
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]

        let encoded = try encoder.encode(analytics)
        let encodedString = try XCTUnwrap(String(data: encoded, encoding: .utf8))
        XCTAssertTrue(encodedString.contains("first_page_written_at"))
        XCTAssertTrue(encodedString.contains("first_page_written_project_id"))

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(ScreenplayCompanionAnalyticsSnapshot.self, from: encoded)

        XCTAssertEqual(decoded.firstPageWrittenAt, firstPageWrittenAt)
        XCTAssertEqual(decoded.firstPageWrittenSource, .voice)
        XCTAssertEqual(decoded.firstPageWrittenProjectId, "project-17")
        XCTAssertEqual(decoded.firstPageWrittenVersionId, "version-3")
        XCTAssertTrue(decoded.hasFirstPageWrittenEvent)
    }
}

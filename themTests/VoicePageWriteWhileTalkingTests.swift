import XCTest
@testable import them

final class VoicePageWriteWhileTalkingTests: XCTestCase {
    func testOnlyAPageRequestInAnOpenStudioStreams() {
        XCTAssertTrue(VoicePageWriteWhileTalking.streams(useScreenplayMode: true, shouldWriteToPage: true, autoInsertEnabled: true, studioActive: true))
        XCTAssertFalse(VoicePageWriteWhileTalking.streams(useScreenplayMode: true, shouldWriteToPage: false, autoInsertEnabled: true, studioActive: true), "conversation stays a Talk turn")
        XCTAssertFalse(VoicePageWriteWhileTalking.streams(useScreenplayMode: true, shouldWriteToPage: true, autoInsertEnabled: false, studioActive: true), "auto-insert off keeps the reviewed Talk path")
        XCTAssertFalse(VoicePageWriteWhileTalking.streams(useScreenplayMode: true, shouldWriteToPage: true, autoInsertEnabled: true, studioActive: false))
    }

    func testTheOfferNeverTalksOverAnyone() {
        XCTAssertTrue(VoicePageWriteWhileTalking.canSpeakOffer(micQuiet: true, assistantPlaying: false, replyInFlight: false))
        XCTAssertFalse(VoicePageWriteWhileTalking.canSpeakOffer(micQuiet: false, assistantPlaying: false, replyInFlight: false), "writer mid-sentence")
        XCTAssertFalse(VoicePageWriteWhileTalking.canSpeakOffer(micQuiet: true, assistantPlaying: true, replyInFlight: false), "she is already speaking")
        XCTAssertFalse(VoicePageWriteWhileTalking.canSpeakOffer(micQuiet: true, assistantPlaying: false, replyInFlight: true), "a reply is on its way")
    }

    func testTheStartLineInvitesMoreTalkAndIsNotAnOfferAnswer() {
        let line = VoicePageWriteWhileTalking.startLine(seed: "write the scene where June lies")
        XCTAssertEqual(line, VoicePageWriteWhileTalking.startLine(seed: "write the scene where June lies"))
        XCTAssertTrue(VoicePageWriteWhileTalking.startLines.contains(line))
        // If the mic ever hears her own line, it must not read as an answer to an offer.
        for spoken in VoicePageWriteWhileTalking.startLines + [VoicePageWriteWhileTalking.queuedLine, VoicePageWriteWhileTalking.heldBackLine] {
            XCTAssertNil(PageWriteReadBackOffer.choice(for: spoken), spoken)
        }
    }

    func testOnlyWordsHeardThisTurnCanActLocally() {
        // Real voice turns carry no client transcript; without on-device speech the app has
        // heard nothing yet, and the stale typed request must not be re-run.
        let stale = "Intent: Produce screenplay-ready rewritten material.\n\nWriter request: Write the next scene"
        let heard = VoicePageWriteWhileTalking.heardWords(clientTranscript: "", livePartial: "")
        XCTAssertEqual(heard, "")
        XCTAssertFalse(VoicePageWriteWhileTalking.routedOnHeardWords(heard: heard, routedText: stale))

        XCTAssertEqual(VoicePageWriteWhileTalking.heardWords(clientTranscript: "", livePartial: " write the diner scene "), "write the diner scene")
        XCTAssertEqual(VoicePageWriteWhileTalking.heardWords(clientTranscript: "The page", livePartial: "the pa"), "The page")
        XCTAssertTrue(VoicePageWriteWhileTalking.routedOnHeardWords(heard: "write the diner scene", routedText: "write the diner scene "))
        XCTAssertFalse(VoicePageWriteWhileTalking.routedOnHeardWords(heard: "write it", routedText: stale), "routed on older, longer text")
    }

    func testStudioVoiceTurnsWithoutHeardWordsAreTranscribedFirst() {
        XCTAssertTrue(VoicePageWriteWhileTalking.shouldTranscribeFirst(clientTranscript: "", livePartial: "", studioActive: true))
        XCTAssertFalse(VoicePageWriteWhileTalking.shouldTranscribeFirst(clientTranscript: "The page", livePartial: "", studioActive: true), "already known: no second STT")
        XCTAssertFalse(VoicePageWriteWhileTalking.shouldTranscribeFirst(clientTranscript: "", livePartial: "write the diner scene", studioActive: true), "on-device words heard this turn")
        XCTAssertFalse(VoicePageWriteWhileTalking.shouldTranscribeFirst(clientTranscript: "", livePartial: "", studioActive: false), "outside Studio Talk transcribes as before")
    }
}

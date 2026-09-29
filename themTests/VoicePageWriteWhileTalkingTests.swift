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
}

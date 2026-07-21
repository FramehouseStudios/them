import XCTest
@testable import them

final class StudioResponseStreamingTests: XCTestCase {
    func testStudioStreamsWheneverTheStudioSurfaceIsActive() {
        XCTAssertTrue(StudioResponseStreamingPolicy.shouldStream(isStudioSurfaceActive: true))
        XCTAssertFalse(StudioResponseStreamingPolicy.shouldStream(isStudioSurfaceActive: false))
    }

    func testStreamingAccumulatorPreservesScreenplayLineBreaksAcrossDeltas() {
        let heading = StudioResponseStreamingPolicy.appending(
            delta: "INT. ARCHIVE - NIGHT\n\n",
            to: ""
        )
        let page = StudioResponseStreamingPolicy.appending(
            delta: "MARA\nThe locker clicks open.",
            to: heading
        )

        XCTAssertEqual(page, "INT. ARCHIVE - NIGHT\n\nMARA\nThe locker clicks open.")
    }

    func testFirstStableSentenceCanSpeakBeforeResponseFinishes() {
        var segmenter = StreamingSpeechSegmenter()

        XCTAssertEqual(segmenter.ingest(cumulativeText: "I think Mara needs"), [])
        XCTAssertEqual(
            segmenter.ingest(cumulativeText: "I think Mara needs to lie here. Then Eli sees the receipt"),
            ["I think Mara needs to lie here."]
        )
        XCTAssertEqual(
            segmenter.ingest(cumulativeText: "I think Mara needs to lie here. Then Eli sees the receipt.", isFinal: true),
            ["Then Eli sees the receipt."]
        )
    }

    func testLongSentenceEmitsAtAWordBoundaryWithoutWaitingForPunctuation() {
        var segmenter = StreamingSpeechSegmenter()
        let partial = "The pressure keeps climbing because Mara has hidden the ferry manifest from Eli while June waits beside the locked gate and the last departure begins pulling away"

        let phrases = segmenter.ingest(cumulativeText: partial)

        XCTAssertEqual(phrases.count, 1)
        XCTAssertFalse(phrases[0].hasSuffix("aw"))
        XCTAssertLessThan(phrases[0].count, partial.count)
    }

    func testFinalFlushDoesNotRepeatAlreadySpokenText() {
        var segmenter = StreamingSpeechSegmenter()

        XCTAssertEqual(
            segmenter.ingest(cumulativeText: "The door opens. Mara freezes"),
            ["The door opens."]
        )
        XCTAssertEqual(
            segmenter.ingest(cumulativeText: "The door opens. Mara freezes.", isFinal: true),
            ["Mara freezes."]
        )
    }

    func testScreenplayMarkupIsCleanedForSpeech() {
        XCTAssertEqual(
            StreamingSpeechSegmenter.speakableText("```fountain\nINT. KITCHEN - NIGHT\n```"),
            "Interior. KITCHEN - NIGHT"
        )
    }
}

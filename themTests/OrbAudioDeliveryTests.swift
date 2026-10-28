import AVFoundation
import XCTest
@testable import them

@MainActor
final class OrbAudioDeliveryTests: XCTestCase {
    func testOnlySuccessfulCurrentPlayerCanFinishAndCallbackCanStartNextPlayer() async throws {
        let url = try audioFile(); defer { try? FileManager.default.removeItem(at: url) }
        let driver = OrbAudioDriver(); defer { driver.stop() }
        let finished = expectation(description: "current player successfully completed")
        try driver.play(url: url, onFinish: {
            finished.fulfill()
            try? driver.play(url: url)
        })
        let first = try XCTUnwrap(driver.currentPlayer)
        driver.audioPlayerDidFinishPlaying(first, successfully: true)
        await fulfillment(of: [finished], timeout: 2)
        XCTAssertTrue(driver.isSpeaking)
        XCTAssertFalse(driver.currentPlayer === first, "Cleanup must precede callback-created playback")
    }

    func testFailedAndDecodeCompletionNeverCallSuccess() async throws {
        let url = try audioFile(); defer { try? FileManager.default.removeItem(at: url) }
        let driver = OrbAudioDriver(); defer { driver.stop() }
        var successes = 0
        for decoding in [false, true] {
            let failed = expectation(description: "audio failure")
            try driver.play(url: url, onFailure: { failed.fulfill() }, onFinish: { successes += 1 })
            let current = try XCTUnwrap(driver.currentPlayer)
            if decoding { driver.audioPlayerDecodeErrorDidOccur(current, error: nil) }
            else { driver.audioPlayerDidFinishPlaying(current, successfully: false) }
            await fulfillment(of: [failed], timeout: 2)
            XCTAssertNil(driver.currentPlayer)
            XCTAssertFalse(driver.isSpeaking)
        }
        XCTAssertEqual(successes, 0)
    }

    func testQueuedOldCompletionAndDecodeErrorCannotFinishOrClearNewPlayer() async throws {
        let url = try audioFile(); defer { try? FileManager.default.removeItem(at: url) }
        let driver = OrbAudioDriver(); defer { driver.stop() }
        var successes = 0, failures = 0
        try driver.play(url: url)
        let old = try XCTUnwrap(driver.currentPlayer)
        driver.audioPlayerDidFinishPlaying(old, successfully: true)
        driver.audioPlayerDecodeErrorDidOccur(old, error: nil)
        try driver.play(url: url, onFailure: { failures += 1 }, onFinish: { successes += 1 })
        let current = try XCTUnwrap(driver.currentPlayer)
        await Task.yield()
        XCTAssertTrue(driver.currentPlayer === current)
        XCTAssertTrue(driver.isSpeaking)
        XCTAssertEqual(successes, 0)
        XCTAssertEqual(failures, 0)
        driver.stop()
        driver.audioPlayerDidFinishPlaying(current, successfully: true)
        await Task.yield()
        XCTAssertEqual(successes, 0, "Explicit Stop must never acknowledge delivery")
    }

    #if os(iOS)
    func testSessionInterruptionReportsFailureWithoutSuccessfulDelivery() async throws {
        let url = try audioFile(); defer { try? FileManager.default.removeItem(at: url) }
        let driver = OrbAudioDriver(); defer { driver.stop() }
        var successes = 0
        let failed = expectation(description: "interruption preserves reply")
        try driver.play(url: url, onFailure: { failed.fulfill() }, onFinish: { successes += 1 })
        NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: AVAudioSession.sharedInstance(),
            userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue])
        await fulfillment(of: [failed], timeout: 2)
        XCTAssertEqual(successes, 0)
        XCTAssertNil(driver.currentPlayer)
    }
    #endif

    private func audioFile() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("OrbDelivery-\(UUID()).wav")
        let format = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: 16_000, channels: 1))
        let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 480_000))
        buffer.frameLength = buffer.frameCapacity
        memset(try XCTUnwrap(buffer.floatChannelData?.pointee), 0, Int(buffer.frameLength) * MemoryLayout<Float>.size)
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        try file.write(from: buffer)
        return url
    }
}

import XCTest
@testable import them

final class ClementineVADPolicyTests: XCTestCase {
    func testGradualSpeechDoesNotBecomeNoise() {
        var floor: Float = 0.0018
        let speechRamp: [Float] = [
            0.0020, 0.0024, 0.0030, 0.0040, 0.0060,
            0.0080, 0.0100, 0.0140, 0.0200,
        ]

        for sample in speechRamp {
            floor = ClementineVADPolicy.updatedNoiseFloor(
                current: floor,
                observedRMS: sample
            )
        }

        XCTAssertLessThan(floor, 0.0020)
        let threshold = ClementineVADPolicy.startThreshold(
            noiseFloorRMS: floor,
            baseThreshold: 0.0062,
            sensitivity: 0.62
        )
        XCTAssertLessThan(threshold, speechRamp.last!)
        XCTAssertLessThan(threshold, 0.007)
    }

    func testQuietRoomPullsInflatedFloorDownQuickly() {
        var floor: Float = 0.0097
        for _ in 0..<20 {
            floor = ClementineVADPolicy.updatedNoiseFloor(
                current: floor,
                observedRMS: 0.0010
            )
        }

        XCTAssertLessThan(floor, 0.0015)
        XCTAssertGreaterThanOrEqual(floor, ClementineVADPolicy.minimumNoiseFloorRMS)
    }

    func testSensitivityLowersRequiredForegroundEnergy() {
        let lowSensitivity = ClementineVADPolicy.startThreshold(
            noiseFloorRMS: 0.0018,
            baseThreshold: 0.0062,
            sensitivity: 0.1
        )
        let highSensitivity = ClementineVADPolicy.startThreshold(
            noiseFloorRMS: 0.0018,
            baseThreshold: 0.0062,
            sensitivity: 1.0
        )

        XCTAssertGreaterThan(lowSensitivity, highSensitivity)
        XCTAssertGreaterThanOrEqual(highSensitivity, ClementineVADPolicy.minimumStartThreshold)
        XCTAssertLessThanOrEqual(lowSensitivity, ClementineVADPolicy.maximumStartThreshold)
    }

    func testLegacyVisibleMicSensitivitySettingIsHonored() {
        let suiteName = "ClementineVADPolicyTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }

        defaults.set(0.9, forKey: "orb_mic_sensitivity")
        XCTAssertEqual(ClementineVoiceSettings.vadSensitivity(defaults: defaults), 0.9)

        defaults.set(0.3, forKey: ClementineVoiceSettings.vadSensitivityKey)
        XCTAssertEqual(ClementineVoiceSettings.vadSensitivity(defaults: defaults), 0.3)
    }

    func testPlaybackLeakageDuringGraceWindowDoesNotInterrupt() {
        var baseline: Float = 0.002
        for sample: Float in [0.008, 0.014, 0.021, 0.023] {
            baseline = ClementineVADPolicy.playbackBaseline(
                current: baseline,
                observedRMS: sample,
                isCalibrating: true
            )
        }
        let threshold = ClementineVADPolicy.bargeInThreshold(
            dynamicStartThreshold: 0.006,
            noiseFloorRMS: 0.0015,
            playbackBaselineRMS: baseline
        )

        XCTAssertFalse(ClementineVADPolicy.shouldInterruptPlayback(
            elapsedSincePlaybackStart: 0.30,
            graceSeconds: 0.45,
            candidateHoldSeconds: 0.20,
            requiredHoldSeconds: 0.12,
            consecutiveLoudFrames: 4,
            rms: 0.03,
            threshold: threshold,
            playbackBaselineRMS: baseline
        ))
        XCTAssertGreaterThan(threshold, 0.023)
    }

    func testSustainedHumanSpeechCanStillInterruptAfterGrace() {
        let baseline: Float = 0.020
        let threshold = ClementineVADPolicy.bargeInThreshold(
            dynamicStartThreshold: 0.006,
            noiseFloorRMS: 0.0015,
            playbackBaselineRMS: baseline
        )

        XCTAssertTrue(ClementineVADPolicy.shouldInterruptPlayback(
            elapsedSincePlaybackStart: 0.80,
            graceSeconds: 0.45,
            candidateHoldSeconds: 0.14,
            requiredHoldSeconds: 0.12,
            consecutiveLoudFrames: 3,
            rms: 0.040,
            threshold: threshold,
            playbackBaselineRMS: baseline
        ))
        XCTAssertFalse(ClementineVADPolicy.shouldInterruptPlayback(
            elapsedSincePlaybackStart: 0.80,
            graceSeconds: 0.45,
            candidateHoldSeconds: 0.04,
            requiredHoldSeconds: 0.12,
            consecutiveLoudFrames: 1,
            rms: 0.024,
            threshold: threshold,
            playbackBaselineRMS: baseline
        ))
    }
}

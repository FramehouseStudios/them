import XCTest
@testable import them

@MainActor
final class VoiceNetworkConditionSmokeTests: XCTestCase {
    func testFastAndConstrainedTracesSelectDifferentSpeechBuffers() {
        let start = Date(timeIntervalSince1970: 1_000)
        var fastEstimator = StreamingSpeechNetworkEstimator()
        fastEstimator.observe(cumulativeText: String(repeating: "a", count: 30), at: start)
        fastEstimator.observe(
            cumulativeText: String(repeating: "a", count: 90),
            at: start.addingTimeInterval(0.08)
        )
        fastEstimator.markPlaybackStarted()

        var constrainedEstimator = StreamingSpeechNetworkEstimator()
        constrainedEstimator.observe(cumulativeText: String(repeating: "a", count: 24), at: start)
        constrainedEstimator.observe(
            cumulativeText: String(repeating: "a", count: 36),
            at: start.addingTimeInterval(0.55)
        )
        constrainedEstimator.markPlaybackStarted()

        XCTAssertEqual(fastEstimator.profile, .fast)
        XCTAssertEqual(constrainedEstimator.profile, .constrained)
        XCTAssertLessThan(
            fastEstimator.profile.forcedCharacters,
            constrainedEstimator.profile.forcedCharacters
        )
    }

    func testConstrainedBufferReducesChoppySpeechWithoutStarvingPlayback() {
        let mediumPartial = String(repeating: "word ", count: 25)
        let longPartial = String(repeating: "word ", count: 38)
        var fastSegmenter = StreamingSpeechSegmenter()
        var constrainedSegmenter = StreamingSpeechSegmenter()

        let fastPhrases = fastSegmenter.ingest(
            cumulativeText: mediumPartial,
            profile: .fast
        )
        let constrainedPhrases = constrainedSegmenter.ingest(
            cumulativeText: mediumPartial,
            profile: .constrained
        )
        let constrainedLongPhrases = constrainedSegmenter.ingest(
            cumulativeText: longPartial,
            profile: .constrained
        )

        XCTAssertFalse(fastPhrases.isEmpty)
        XCTAssertTrue(constrainedPhrases.isEmpty)
        XCTAssertFalse(constrainedLongPhrases.isEmpty)
        XCTAssertLessThanOrEqual(
            constrainedSegmenter.pendingText.count,
            StreamingSpeechChunkProfile.constrained.forcedCharacters
        )
    }

    func testEstimatorRecoversAfterSustainedNetworkImprovement() {
        let start = Date(timeIntervalSince1970: 2_000)
        var estimator = StreamingSpeechNetworkEstimator()
        var characterCount = 20
        var elapsed: TimeInterval = 0

        estimator.observe(cumulativeText: String(repeating: "a", count: characterCount), at: start)
        characterCount += 10
        elapsed += 0.60
        estimator.observe(
            cumulativeText: String(repeating: "a", count: characterCount),
            at: start.addingTimeInterval(elapsed)
        )
        XCTAssertEqual(estimator.networkClass, .constrained)

        for _ in 0..<14 {
            characterCount += 50
            elapsed += 0.08
            estimator.observe(
                cumulativeText: String(repeating: "a", count: characterCount),
                at: start.addingTimeInterval(elapsed)
            )
        }
        estimator.markPlaybackStarted()

        XCTAssertEqual(estimator.networkClass, .fast)
        XCTAssertEqual(estimator.profile, .fast)
    }

    func testLatencySLOCollectsEnoughSamplesBeforeJudging() {
        let samples = (0..<4).map {
            latencySample(
                id: "collecting-\($0)",
                transport: .realtimeVoice,
                firstTextMs: 900
            )
        }

        let health = ClementineLatencySLOEvaluator.evaluate(samples: samples)

        XCTAssertEqual(health.level, .collecting)
        XCTAssertEqual(health.evaluatedMetricCount, 0)
        XCTAssertEqual(health.pendingMetricCount, 9)
    }

    func testLatencySLOPassesResponsiveStudioSpeech() {
        let samples = (0..<5).map {
            latencySample(
                id: "healthy-\($0)",
                transport: .studioTypedSpeech,
                firstTextMs: 650 + Double($0 * 25),
                firstAudioMs: 1_250 + Double($0 * 40),
                bargeInAckMs: 70 + Double($0 * 4)
            )
        }

        let health = ClementineLatencySLOEvaluator.evaluate(samples: samples)

        XCTAssertEqual(health.level, .healthy)
        XCTAssertEqual(health.evaluatedMetricCount, 3)
        XCTAssertTrue(health.breaches.isEmpty)
    }

    func testLatencySLOSeparatesWarningFromCriticalRegression() {
        let warningSamples = (0..<5).map {
            latencySample(
                id: "warning-\($0)",
                transport: .realtimeVoice,
                firstAudioMs: 2_450
            )
        }
        let criticalSamples = (0..<5).map {
            latencySample(
                id: "critical-\($0)",
                transport: .realtimeVoice,
                firstAudioMs: 3_500
            )
        }

        let warning = ClementineLatencySLOEvaluator.evaluate(samples: warningSamples)
        let critical = ClementineLatencySLOEvaluator.evaluate(samples: criticalSamples)

        XCTAssertEqual(warning.level, .warning)
        XCTAssertEqual(warning.breaches.first?.metric, .firstAudio)
        XCTAssertEqual(warning.breaches.first?.isCritical, false)
        XCTAssertEqual(critical.level, .critical)
        XCTAssertEqual(critical.breaches.first?.isCritical, true)
    }

    private func latencySample(
        id: String,
        transport: ClementineLatencyTransport,
        firstTextMs: Double? = nil,
        firstAudioMs: Double? = nil,
        bargeInAckMs: Double? = nil
    ) -> ClementineLatencySample {
        ClementineLatencySample(
            id: id,
            transport: transport,
            startedAt: 0,
            firstTextMs: firstTextMs,
            firstAudioMs: firstAudioMs,
            bargeInAckMs: bargeInAckMs,
            speechNetworkClass: .balanced,
            speechTargetCharacters: nil
        )
    }
}

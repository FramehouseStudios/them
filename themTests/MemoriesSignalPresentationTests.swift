import XCTest
@testable import them

@MainActor
final class MemoriesSignalPresentationTests: XCTestCase {
    func testMissingOutOfRangeAndNonfiniteScoresAreUnavailable() {
        let invalid: [Double?] = [nil, -0.01, 1.01, .nan, .infinity, -.infinity]
        for value in invalid {
            XCTAssertNil(MemorySignalPresentation.validScore(value), "Invalid score: \(String(describing: value))")
            XCTAssertEqual(MemorySignalPresentation.score(value), "Not available")
        }
    }

    func testValidScoresIncludeZeroAndUseADeclaredHundredPointScale() {
        for (value, label) in [(0.0, "0/100"), (0.584, "58/100"), (1.0, "100/100")] {
            XCTAssertEqual(MemorySignalPresentation.validScore(value), value)
            XCTAssertEqual(MemorySignalPresentation.score(value), label)
        }
    }

    func testMissingAndNegativeCountsStayUnknownWhileZeroIsRecorded() {
        for value: Int? in [nil, -1, Int.min] {
            XCTAssertNil(MemorySignalPresentation.validCount(value))
            XCTAssertEqual(MemorySignalPresentation.count(value), "Not available")
        }
        for value in [0, 1, 12] {
            XCTAssertEqual(MemorySignalPresentation.validCount(value), value)
            XCTAssertEqual(MemorySignalPresentation.count(value), String(value))
        }
    }

    func testActivityAgeDistinguishesUnavailableFromZeroAndUsesSingularOnlyForOneDay() {
        let cases: [(Int?, String)] = [
            (nil, "Not available"), (-1, "Not available"),
            (0, "0 days"), (1, "1 day"), (2, "2 days"), (31, "31 days"),
        ]
        for (days, expected) in cases {
            XCTAssertEqual(MemorySignalPresentation.activityAge(days), expected)
        }
    }

    func testOverviewAverageRequiresKnownPositiveAndConsistentCardCounts() throws {
        let cases: [(String, [String: Any])] = [
            ("missing total", ["avg_quality_score": 0.7, "scored_cards": 1]),
            ("null total", ["avg_quality_score": 0.7, "scored_cards": 1, "total_cards": NSNull()]),
            ("empty snapshot", ["avg_quality_score": 0, "scored_cards": 0, "total_cards": 0]),
            ("negative total", ["avg_quality_score": 0.7, "scored_cards": 1, "total_cards": -1]),
            ("missing denominator", ["avg_quality_score": 0.7, "total_cards": 2]),
            ("null denominator", ["avg_quality_score": 0.7, "scored_cards": NSNull(), "total_cards": 2]),
            ("no scored cards", ["avg_quality_score": 0, "scored_cards": 0, "total_cards": 2]),
            ("negative denominator", ["avg_quality_score": 0.7, "scored_cards": -1, "total_cards": 2]),
            ("denominator exceeds total", ["avg_quality_score": 0.7, "scored_cards": 3, "total_cards": 2]),
        ]
        for (name, body) in cases {
            XCTAssertEqual(MemorySignalPresentation.average(try snapshot(body)), "Not available", name)
        }
    }

    func testOverviewAverageDoesNotInventMissingOrInvalidScores() throws {
        let cases: [[String: Any]] = [
            ["scored_cards": 1, "total_cards": 2],
            ["avg_quality_score": NSNull(), "scored_cards": 1, "total_cards": 2],
            ["avg_quality_score": -0.1, "scored_cards": 1, "total_cards": 2],
            ["avg_quality_score": 1.1, "scored_cards": 1, "total_cards": 2],
        ]
        for body in cases {
            XCTAssertEqual(MemorySignalPresentation.average(try snapshot(body)), "Not available")
        }
    }

    func testOverviewAverageRetainsARealZeroAndAllowsPartiallyScoredSnapshots() throws {
        let zero = try snapshot(["avg_quality_score": 0, "scored_cards": 1, "total_cards": 1])
        XCTAssertEqual(MemorySignalPresentation.average(zero), "0/100")
        let partial = try snapshot([
            "avg_quality_score": 0.75, "scored_cards": 2, "total_cards": 3, "unknown_quality_cards": 1,
        ])
        XCTAssertEqual(MemorySignalPresentation.average(partial), "75/100")
        XCTAssertEqual(partial.scoredCards, 2)
        XCTAssertEqual(partial.unknownQualityCards, 1)
    }

    func testScoreCoverageRequiresKnownConsistentCountsAndReportsRecordedZero() throws {
        let cases: [([String: Any], String)] = [
            ([:], "Not available"),
            (["total_cards": 2], "Not available"),
            (["scored_cards": 1], "Not available"),
            (["scored_cards": NSNull(), "total_cards": 2], "Not available"),
            (["scored_cards": 1, "total_cards": NSNull()], "Not available"),
            (["scored_cards": -1, "total_cards": 2], "Not available"),
            (["scored_cards": 0, "total_cards": -1], "Not available"),
            (["scored_cards": 3, "total_cards": 2], "Not available"),
            (["scored_cards": 0, "total_cards": 0], "0 of 0"),
            (["scored_cards": 0, "total_cards": 2], "0 of 2"),
            (["scored_cards": 1, "total_cards": 2], "1 of 2"),
            (["scored_cards": 2, "total_cards": 2], "2 of 2"),
        ]
        for (body, expected) in cases {
            XCTAssertEqual(MemorySignalPresentation.coverage(try snapshot(body)), expected)
        }
    }

    func testScoreBasisDisclosesRecordedSignalsDefaultsAndTypeAssignedScores() {
        let cases: [([String], String)] = [
            (["theme", "classifier", "fallback", "summarizer", "carry", "history_backfill",
              "promoted_history", "promoted_recap", "  THEME\n"],
             "Based on recorded feedback, use signals, and time since activity."),
            (["history", "recap"],
             "Based on elapsed time and a default starting score."),
            (["character_bible", "screenplay_project", "canon_correction", "canon_correction_undone",
              "canon_correction_ambiguous", "episodic_memory", "episodic_correction", "episodic_superseded"],
             "Assigned from this memory’s type and correction status."),
            (["", "unrecognized_source"],
             "Calculated by the memory system; its basis was not provided."),
        ]
        for (sources, expected) in cases {
            for source in sources {
                XCTAssertEqual(MemorySignalPresentation.scoreBasis(source: source), expected, source)
            }
        }
    }

    func testDecodedMissingNullAndInvalidSignalsRemainNilInDisplayedSnapshot() async throws {
        let keys = ["quality_score", "quality_hit_count", "quality_correction_count", "staleness_days", "confidence", "salience"]
        let nullSignals = Dictionary(uniqueKeysWithValues: keys.map { ($0, NSNull() as Any) })
        let payload = try memories([
            card(id: "missing"),
            card(id: "null", signals: nullSignals),
            card(id: "negative", signals: [
                "quality_score": -0.1, "quality_hit_count": -1, "quality_correction_count": -2, "staleness_days": -3,
                "confidence": -0.1, "salience": -0.2,
            ]),
            card(id: "above-range", signals: [
                "quality_score": 1.1, "quality_hit_count": -1, "quality_correction_count": -2, "staleness_days": -3,
                "confidence": 1.1, "salience": 1.2,
            ]),
        ])
        for id in ["missing", "null"] {
            let decoded = try XCTUnwrap(payload.memories.first { $0.id == id })
            XCTAssertNil(decoded.qualityScore)
            XCTAssertNil(decoded.qualityHitCount)
            XCTAssertNil(decoded.qualityCorrectionCount)
            XCTAssertNil(decoded.stalenessDays)
            XCTAssertNil(decoded.confidence)
            XCTAssertNil(decoded.salience)
        }
        // Invalid numbers decode as provided; the presentation mapper must reject them.
        XCTAssertEqual(payload.memories.first { $0.id == "negative" }?.qualityScore, -0.1)
        let vm = viewModel(payload)
        let outcome = await vm.load()
        XCTAssertEqual(outcome, .succeeded)
        for id in ["missing", "null", "negative", "above-range"] {
            let displayed = try XCTUnwrap(vm.memory(forID: id))
            XCTAssertNil(displayed.qualityScore, id)
            XCTAssertNil(displayed.qualityHitCount, id)
            XCTAssertNil(displayed.qualityCorrectionCount, id)
            XCTAssertNil(displayed.stalenessDays, id)
            XCTAssertNil(displayed.confidence, id)
            XCTAssertNil(displayed.salience, id)
            XCTAssertEqual(MemorySignalPresentation.score(displayed.qualityScore), "Not available", id)
            XCTAssertEqual(MemorySignalPresentation.score(displayed.confidence), "Not available", id)
            XCTAssertEqual(MemorySignalPresentation.score(displayed.salience), "Not available", id)
            XCTAssertEqual(MemorySignalPresentation.activityAge(displayed.stalenessDays), "Not available", id)
        }
    }

    func testDecodedRecordedZeroSignalsSurviveSnapshotMapping() async throws {
        let payload = try memories([card(id: "zero", signals: [
            "quality_score": 0, "quality_hit_count": 0, "quality_correction_count": 0, "staleness_days": 0,
            "confidence": 0, "salience": 0,
        ])])
        let vm = viewModel(payload)
        let outcome = await vm.load()
        XCTAssertEqual(outcome, .succeeded)
        let displayed = try XCTUnwrap(vm.memory(forID: "zero"))
        XCTAssertEqual(displayed.qualityScore, 0)
        XCTAssertEqual(displayed.qualityHitCount, 0)
        XCTAssertEqual(displayed.qualityCorrectionCount, 0)
        XCTAssertEqual(displayed.stalenessDays, 0)
        XCTAssertEqual(displayed.confidence, 0)
        XCTAssertEqual(displayed.salience, 0)
        XCTAssertEqual(MemorySignalPresentation.score(displayed.qualityScore), "0/100")
        XCTAssertEqual(MemorySignalPresentation.score(displayed.confidence), "0/100")
        XCTAssertEqual(MemorySignalPresentation.score(displayed.salience), "0/100")
        XCTAssertEqual(MemorySignalPresentation.count(displayed.qualityHitCount), "0")
        XCTAssertEqual(MemorySignalPresentation.activityAge(displayed.stalenessDays), "0 days")
    }

    private func snapshot(_ body: [String: Any]) throws -> BackendMemoryQualitySnapshot {
        try decoder().decode(BackendMemoryQualitySnapshot.self, from: JSONSerialization.data(withJSONObject: body))
    }

    private func memories(_ cards: [[String: Any]]) throws -> BackendMemoriesResponse {
        let body: [String: Any] = [
            "source": "test", "source_ip": "", "state_version": "signals-v1",
            "creative_memory_revision": "signals-cm1", "memories": cards, "conversation_samples": [],
        ]
        return try decoder().decode(BackendMemoriesResponse.self, from: JSONSerialization.data(withJSONObject: body))
    }

    private func card(id: String, signals: [String: Any] = [:]) -> [String: Any] {
        var body: [String: Any] = [
            "id": id, "key": "theme-\(id)", "title": "Memory \(id)", "summary": "A recorded memory.",
            "emotional_tone": "reflective", "remembered_at": 1,
            "snippets": [], "reference_hint": "", "source": "theme",
        ]
        body.merge(signals) { _, value in value }
        return body
    }

    private func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }

    private func viewModel(_ payload: BackendMemoriesResponse) -> MemoriesViewModel {
        MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in BackendReadResult(payload: payload, sync: .empty, notModified: false) },
            pendingQuestionLoader: { _ in nil }
        )
    }
}

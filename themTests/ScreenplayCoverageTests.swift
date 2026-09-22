import XCTest
@testable import them

final class ScreenplayCoverageTests: XCTestCase {
    private let sampleJSON = """
    {"schemaVersion":1,"title":"Kitchen","pageCount":1,"sceneCount":1,"overall":6.6,"grade":"C","verdict":"CONSIDER",
     "pillars":{"structure":{"score":4,"notes":["Too few pages to read an act shape; this is a scene, not a feature yet."]},
                "pacing":{"score":8,"notes":[]},
                "dialogue":{"score":9.1,"notes":["Lines dodge and pressure instead of announcing."]},
                "character":{"score":4.8,"notes":["MARA carries 67% of the lines; nobody pushes back."]},
                "format":{"score":9.3,"notes":["Clean pages; nothing between the reader and the story."]}},
     "structureTurns":[{"id":"first-plot-point","label":"Act One turn","sceneBoundaryNearby":false}],
     "works":["Clean pages; nothing between the reader and the story."],
     "missing":["Too few pages to read an act shape; this is a scene, not a feature yet."],
     "move":"Write the next scene so the act shape starts to show.",
     "spoken":"Here's my read on Kitchen. One page, one scene. Want to start there?",
     "warnings":[],"formatIssues":{"hard":0,"medium":0},"characters":["MARA","FRANK"],
     "stage":"screenplay_coverage","mode":"computed"}
    """

    private func decodeSample() throws -> BackendScreenplayCoverageReport {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(BackendScreenplayCoverageReport.self, from: Data(sampleJSON.utf8))
    }

    func test_report_decodes_the_route_payload_including_route_only_fields() throws {
        let report = try decodeSample()
        XCTAssertEqual(report.grade, "C")
        XCTAssertEqual(report.verdict, "CONSIDER")
        XCTAssertEqual(report.overall, 6.6, accuracy: 0.001)
        XCTAssertEqual(report.pillars.count, 5)
        XCTAssertEqual(report.pillars["dialogue"]?.score ?? 0, 9.1, accuracy: 0.001)
        XCTAssertEqual(report.pillars["pacing"]?.notes, [])
        XCTAssertEqual(report.structureTurns.first?.label, "Act One turn")
        XCTAssertEqual(report.formatIssues?.hard, 0)
        XCTAssertTrue(report.spoken.hasPrefix("Here's my read on Kitchen."))
    }

    func test_presentation_orders_pillars_and_formats_scores_and_verdict_line() throws {
        let report = try decodeSample()
        XCTAssertEqual(ScreenplayCoveragePresentation.pillarOrder, ["structure", "pacing", "dialogue", "character", "format"])
        XCTAssertEqual(ScreenplayCoveragePresentation.verdictLine(report), "C · Consider · 1 page, 1 scene")
        XCTAssertEqual(ScreenplayCoveragePresentation.scoreText(8), "8")
        XCTAssertEqual(ScreenplayCoveragePresentation.scoreText(9.1), "9.1")
        XCTAssertEqual(ScreenplayCoveragePresentation.fraction(for: 0), 0.04, accuracy: 0.0001)
        XCTAssertEqual(ScreenplayCoveragePresentation.fraction(for: 10), 1, accuracy: 0.0001)
        XCTAssertEqual(ScreenplayCoveragePresentation.fraction(for: 12), 1, accuracy: 0.0001)
        XCTAssertEqual(ScreenplayCoveragePresentation.title(for: "format"), "Format")
    }

    func test_speech_request_posts_trimmed_text_and_skips_blank() {
        let center = NotificationCenter()
        var received: [String] = []
        let token = center.addObserver(forName: .themClementineSpeakRequested, object: nil, queue: nil) { note in
            if let text = ScreenplayCoveragePresentation.speechText(from: note) { received.append(text) }
        }
        defer { center.removeObserver(token) }
        ScreenplayCoveragePresentation.requestSpeech("  Here's my read.  ", center: center)
        ScreenplayCoveragePresentation.requestSpeech("   ", center: center)
        XCTAssertEqual(received, ["Here's my read."])
    }

    @MainActor
    func test_snapshot_carries_the_compact_coverage_summary_for_her_turns() throws {
        let report = try decodeSample()
        StudioOutlineRegistry.shared.coverageSummary = StudioCoverageSummary(report: report)
        defer { StudioOutlineRegistry.shared.coverageSummary = nil }
        var snapshot = StudioCapabilitiesSnapshot()
        snapshot.coverage = StudioOutlineRegistry.shared.coverageSummary
        let data = try XCTUnwrap(snapshot.json().data(using: .utf8))
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let coverage = try XCTUnwrap(object["coverage"] as? [String: Any])
        XCTAssertEqual(coverage["grade"] as? String, "C")
        XCTAssertEqual(coverage["verdict"] as? String, "consider")
        XCTAssertEqual(coverage["page_count"] as? Int, 1)
        XCTAssertEqual((coverage["pillars"] as? [String: Double])?["dialogue"] ?? 0, 9.1, accuracy: 0.001)
        XCTAssertEqual((coverage["missing"] as? [String])?.count, 1)
        XCTAssertNil(StudioCapabilitiesSnapshot().coverage)
    }

    func test_refresh_policy_follows_page_and_scene_count_only() throws {
        let report = try decodeSample() // 1 page, 1 scene
        let onePage = "INT. KITCHEN - NIGHT\n\nMARA stands at the sink.\n\nMARA\nYou said you would call.\n"
        XCTAssertEqual(ScreenplayCoverageRefreshPolicy.shape(of: onePage), .init(pageCount: 1, sceneCount: 1))
        // Same shape: a word edit inside the page does not re-read.
        XCTAssertFalse(ScreenplayCoverageRefreshPolicy.shouldRefresh(current: report, draft: onePage, isRefreshing: false, isStreaming: false))
        // A new scene re-reads.
        let twoScenes = onePage + "\nEXT. PORCH - DAWN\n\nFRANK sits on the step.\n"
        XCTAssertTrue(ScreenplayCoverageRefreshPolicy.shouldRefresh(current: report, draft: twoScenes, isRefreshing: false, isStreaming: false))
        // No read yet and pages exist: read.
        XCTAssertTrue(ScreenplayCoverageRefreshPolicy.shouldRefresh(current: nil, draft: onePage, isRefreshing: false, isStreaming: false))
        // Empty draft, in-flight read, or live streaming: never.
        XCTAssertFalse(ScreenplayCoverageRefreshPolicy.shouldRefresh(current: nil, draft: "   ", isRefreshing: false, isStreaming: false))
        XCTAssertFalse(ScreenplayCoverageRefreshPolicy.shouldRefresh(current: report, draft: twoScenes, isRefreshing: true, isStreaming: false))
        XCTAssertFalse(ScreenplayCoverageRefreshPolicy.shouldRefresh(current: report, draft: twoScenes, isRefreshing: false, isStreaming: true))
    }
}

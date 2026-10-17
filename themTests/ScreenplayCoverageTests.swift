import XCTest
@testable import them

final class ScreenplayCoverageTests: XCTestCase {
    @MainActor
    func test_cancelled_request_cannot_publish_even_when_transport_returns_success() async throws {
        let vm = makeCoverageVM()
        defer { StudioOutlineRegistry.shared.clearCoverage() }
        let deferred = DeferredCoverageRequest(started: expectation(description: "request started"))
        let task = Task { await vm.refreshCoverage(request: deferred.fetch) }
        await fulfillment(of: [deferred.started], timeout: 2)
        task.cancel()
        deferred.finish(.success(try decodeSample()))
        await task.value
        XCTAssertNil(vm.coverageReport)
        XCTAssertEqual(vm.coverageErrorText, "")
        XCTAssertFalse(vm.isCoverageRefreshing)
    }

    @MainActor
    func test_older_completion_does_not_stop_newer_request_or_publish() async throws {
        let vm = makeCoverageVM()
        defer { StudioOutlineRegistry.shared.clearCoverage() }
        let first = DeferredCoverageRequest(started: expectation(description: "first started"))
        let second = DeferredCoverageRequest(started: expectation(description: "second started"))
        let report = try decodeSample()
        let a = Task { await vm.refreshCoverage(request: first.fetch) }
        await fulfillment(of: [first.started], timeout: 2)
        let b = Task { await vm.refreshCoverage(request: second.fetch) }
        await fulfillment(of: [second.started], timeout: 2)
        first.finish(.success(report))
        await a.value
        XCTAssertTrue(vm.isCoverageRefreshing)
        XCTAssertNil(vm.coverageReport)
        second.finish(.success(report))
        await b.value
        XCTAssertEqual(vm.coverageReport, report)
        XCTAssertFalse(vm.isCoverageRefreshing)
    }

    @MainActor
    func test_late_error_cannot_replace_newer_success_or_error_state() async throws {
        let vm = makeCoverageVM()
        defer { StudioOutlineRegistry.shared.clearCoverage() }
        let first = DeferredCoverageRequest(started: expectation(description: "old request started"))
        let report = try decodeSample()
        let a = Task { await vm.refreshCoverage(request: first.fetch) }
        await fulfillment(of: [first.started], timeout: 2)
        await vm.refreshCoverage { _, _ in report }
        first.finish(.failure(BackendMemoryAPIError.server(status: 503, message: "old_failure")))
        await a.value
        XCTAssertEqual(vm.coverageReport, report)
        XCTAssertEqual(vm.coverageErrorText, "")
        XCTAssertEqual(StudioOutlineRegistry.shared.coverageSummary, StudioCoverageSummary(report: report))
    }

    @MainActor
    func test_changed_word_rejects_inflight_read_but_keeps_completed_same_project_read() async throws {
        let vm = makeCoverageVM()
        defer { StudioOutlineRegistry.shared.clearCoverage() }
        let report = try decodeSample()
        await vm.refreshCoverage { _, _ in report }
        let before = vm.infoText
        await vm.refreshCoverage { _, _ in
            await Task.yield()
            vm.fountainDraft += "\nA new word."
            return report
        }
        XCTAssertEqual(vm.coverageReport, report)
        XCTAssertEqual(vm.infoText, before, "The rejected read must not announce completion.")
        XCTAssertFalse(vm.isCoverageRefreshing)
        vm.fountainDraft = "  \n"
        XCTAssertNil(vm.coverageReport)
        XCTAssertNil(StudioOutlineRegistry.shared.coverageSummary)
    }

    @MainActor
    func test_older_vm_cannot_clear_newer_vms_registry_entry() async throws {
        let a = makeCoverageVM()
        let b = makeCoverageVM()
        defer { StudioOutlineRegistry.shared.clearCoverage() }
        let report = try decodeSample()
        await a.refreshCoverage { _, _ in report }
        await b.refreshCoverage { _, _ in report }
        a.selectedProjectID = "project-b"
        a.fountainDraft = ""
        XCTAssertEqual(StudioOutlineRegistry.shared.coverageSummary, StudioCoverageSummary(report: report))
        XCTAssertEqual(b.coverageReport, report)
    }

    @MainActor
    func test_account_generation_change_hides_card_and_summary_without_waiting_for_notification() async throws {
        var auth = ScreenplayStudioAuthContext(userID: "writer-a", sessionIntentGeneration: 1)
        let vm = makeCoverageVM(auth: { auth })
        defer { StudioOutlineRegistry.shared.clearCoverage() }
        let report = try decodeSample()
        await vm.refreshCoverage { _, _ in report }
        auth = ScreenplayStudioAuthContext(userID: "writer-a", sessionIntentGeneration: 2)
        XCTAssertNil(vm.coverageReport)
        XCTAssertNil(StudioOutlineRegistry.shared.coverage(for: auth, projectID: "project-a"))
        await vm.refreshCoverage { _, _ in
            await Task.yield()
            auth = ScreenplayStudioAuthContext(userID: "writer-b", sessionIntentGeneration: 3)
            return report
        }
        XCTAssertNil(vm.coverageReport)
        XCTAssertNil(StudioOutlineRegistry.shared.coverage(for: auth, projectID: "project-a"))
    }

    @MainActor
    func test_delayed_identity_notification_preserves_fresh_matching_read() async throws {
        var auth = ScreenplayStudioAuthContext(userID: "writer-a", sessionIntentGeneration: 1)
        let vm = makeCoverageVM(auth: { auth })
        defer { StudioOutlineRegistry.shared.clearCoverage() }
        let report = try decodeSample()
        await vm.refreshCoverage { _, _ in report }
        auth = ScreenplayStudioAuthContext(userID: "writer-b", sessionIntentGeneration: 2)
        await vm.refreshCoverage { _, _ in report }
        NotificationCenter.default.post(name: .themBackendIdentityPartitionChanged, object: nil)
        let drained = expectation(description: "queued identity observer delivered")
        DispatchQueue.main.async { drained.fulfill() }
        await fulfillment(of: [drained], timeout: 2)
        XCTAssertEqual(vm.coverageReport, report)
        XCTAssertEqual(StudioOutlineRegistry.shared.coverage(for: auth, projectID: "project-a"), StudioCoverageSummary(report: report))
    }

    @MainActor
    func test_summary_is_scoped_to_normalized_project_and_account() throws {
        let report = try decodeSample()
        let auth = ScreenplayStudioAuthContext(userID: "writer-a", sessionIntentGeneration: 1)
        let context = ScreenplayCoverageContext(auth: auth, projectID: " project-a ", draft: "pages")
        let registry = StudioOutlineRegistry.shared
        defer { registry.clearCoverage() }
        registry.publishCoverage(report, context: context, requestID: UUID())
        XCTAssertNotNil(registry.coverage(for: auth, projectID: "project-a"))
        XCTAssertNil(registry.coverage(for: auth, projectID: "project-b"))
        XCTAssertNil(registry.coverage(for: auth, projectID: ""))
        XCTAssertNil(registry.coverage(for: ScreenplayStudioAuthContext(userID: "writer-b", sessionIntentGeneration: 1), projectID: "project-a"))
    }

    @MainActor
    private func makeCoverageVM(auth: (() -> ScreenplayStudioAuthContext)? = nil) -> ScreenplayStudioViewModel {
        let vm = ScreenplayStudioViewModel(coverageAuthContextProvider: auth)
        vm.selectedProjectID = "project-a"
        vm.fountainDraft = "INT. KITCHEN - NIGHT\n\nMARA\nKeep the light on."
        return vm
    }

    @MainActor
    func test_delayed_read_cannot_publish_or_speak_after_project_switch() async throws {
        let vm = ScreenplayStudioViewModel()
        vm.selectedProjectID = "project-a"
        vm.fountainDraft = "INT. KITCHEN - NIGHT\n\nMARA\nKeep the light on."
        let report = try decodeSample()
        var speech: [String] = []
        let observer = NotificationCenter.default.addObserver(
            forName: .themClementineSpeakRequested, object: nil, queue: nil
        ) { note in
            if let text = ScreenplayCoveragePresentation.speechText(from: note) { speech.append(text) }
        }
        defer {
            NotificationCenter.default.removeObserver(observer)
            StudioOutlineRegistry.shared.clearCoverage()
        }
        await vm.refreshCoverage(speak: true) { _, _ in
            // Change the real VM while its transport is suspended, not a fake
            // policy tested against itself. The returning payload is A's read.
            await Task.yield()
            vm.selectedProjectID = "project-b"
            vm.fountainDraft = "EXT. ROOF - DAWN\n\nJUNE\nDon't look down."
            return report
        }
        XCTAssertNil(vm.coverageReport)
        XCTAssertNil(StudioOutlineRegistry.shared.coverageSummary)
        XCTAssertTrue(speech.isEmpty)
        XCTAssertFalse(vm.infoText.contains("Clementine's read:"))
        XCTAssertFalse(vm.isCoverageRefreshing)
    }

    func test_speech_delivery_trims_text_and_stops_before_speaking() {
        var events: [String] = []
        let notification = Notification(
            name: .themClementineSpeakRequested,
            userInfo: ["text": "  Here's my read.\n"]
        )
        ScreenplayCoveragePresentation.deliverSpeech(
            from: notification, stop: { events.append("stop") }, speak: { events.append($0) }
        )
        XCTAssertEqual(events, ["stop", "Here's my read."])
    }

    func test_speech_delivery_ignores_missing_or_nontext_payload_without_interrupting() {
        var events: [String] = []
        for userInfo: [AnyHashable: Any] in [[:], ["text": 42]] {
            ScreenplayCoveragePresentation.deliverSpeech(
                from: Notification(name: .themClementineSpeakRequested, userInfo: userInfo),
                stop: { events.append("stop") }, speak: { events.append($0) }
            )
        }
        XCTAssertTrue(events.isEmpty)
    }

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
        let context = ScreenplayCoverageContext(auth: .current(), projectID: "project-a", draft: "pages")
        StudioOutlineRegistry.shared.publishCoverage(report, context: context, requestID: UUID())
        defer { StudioOutlineRegistry.shared.clearCoverage() }
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
}

@MainActor
private final class DeferredCoverageRequest {
    let started: XCTestExpectation
    private var continuation: CheckedContinuation<BackendScreenplayCoverageReport, Error>?
    init(started: XCTestExpectation) { self.started = started }
    func fetch(_ draft: String, _ title: String) async throws -> BackendScreenplayCoverageReport {
        try await withCheckedThrowingContinuation {
            continuation = $0
            started.fulfill()
        }
    }
    func finish(_ result: Result<BackendScreenplayCoverageReport, Error>) {
        continuation?.resume(with: result)
        continuation = nil
    }
}

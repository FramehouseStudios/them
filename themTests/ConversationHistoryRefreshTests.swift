import XCTest
@testable import them

@MainActor
final class ConversationHistoryRefreshTests: XCTestCase {
    func testRefreshKeepsTranscriptReadableThroughFailureAndRetryUpdatesLiveDetail() async throws {
        let suspended = SuspendedHistoryRead()
        var reads = 0
        let vm = ConversationHistoryViewModel(
            notificationCenter: NotificationCenter(),
            historyLoader: { force, since in
                reads += 1
                XCTAssertNil(since)
                if reads == 1 { return try Self.history(turns: [1], version: "v1") }
                XCTAssertTrue(force)
                if reads == 2 { return try await suspended.read() }
                return try Self.history(turns: [1], version: "v2", assistant: "The revised reply.")
            },
            deltaLoader: Self.unexpectedDelta
        )
        await vm.load()
        let original = try XCTUnwrap(vm.thread(forID: "turn-1"))
        vm.selection = original

        let refresh = Task { await vm.retry() }
        await eventually { suspended.isWaiting }
        XCTAssertTrue(vm.isRefreshing)
        XCTAssertEqual(vm.thread(forID: original.id), original)
        XCTAssertEqual(vm.selection?.id, original.id)

        suspended.complete(.failure(URLError(.notConnectedToInternet)))
        await refresh.value
        XCTAssertFalse(vm.isRefreshing)
        XCTAssertNotNil(vm.refreshError)
        XCTAssertEqual(vm.thread(forID: original.id), original)
        XCTAssertEqual(vm.selection?.id, original.id)

        await vm.retry()
        XCTAssertNil(vm.refreshError)
        XCTAssertFalse(vm.isRefreshing)
        XCTAssertEqual(vm.thread(forID: original.id)?.assistantMessage, "The revised reply.")
        XCTAssertEqual(vm.selection?.id, original.id)
        XCTAssertEqual(reads, 3)
    }

    func testInitialLoadFailureOffersRecoveryToRealHistory() async throws {
        var reads = 0
        let vm = ConversationHistoryViewModel(
            notificationCenter: NotificationCenter(),
            historyLoader: { force, _ in
                reads += 1
                if reads == 1 { throw URLError(.notConnectedToInternet) }
                XCTAssertTrue(force)
                return try Self.history(turns: [4], version: "v4")
            },
            deltaLoader: Self.unexpectedDelta
        )

        await vm.load()
        guard case .error = vm.state else { return XCTFail("Initial failure must expose recovery.") }
        XCTAssertFalse(vm.isRefreshing)
        await vm.retry()
        XCTAssertNotNil(vm.thread(forID: "turn-4"))
        XCTAssertNil(vm.refreshError)
        XCTAssertFalse(vm.isRefreshing)
    }

    func testCancelledRefreshPreservesTranscriptAndDoesNotPresentFailure() async throws {
        let suspended = SuspendedHistoryRead()
        var reads = 0
        let vm = ConversationHistoryViewModel(
            notificationCenter: NotificationCenter(),
            historyLoader: { _, _ in
                reads += 1
                if reads == 1 { return try Self.history(turns: [1], version: "v1") }
                return try await suspended.read()
            },
            deltaLoader: Self.unexpectedDelta
        )
        await vm.load()
        let original = vm.state
        let refresh = Task { await vm.retry() }
        await eventually { suspended.isWaiting }
        refresh.cancel()
        suspended.complete(.success(try Self.history(turns: [], version: "v2")))
        await refresh.value

        XCTAssertEqual(vm.state, original, "A cancelled result must not replace readable history.")
        XCTAssertNil(vm.refreshError)
        XCTAssertFalse(vm.isRefreshing)
    }

    func testAuthoritativeEventDuringFullReadWaitsAndUsesRenderedPayloadCursor() async throws {
        let center = NotificationCenter()
        let suspended = SuspendedHistoryRead()
        var reads = 0
        var deltaRequests: [(String, String?)] = []
        var unrelatedGlobalSync = BackendSyncState.empty
        unrelatedGlobalSync.stateVersion = "global-v99"
        unrelatedGlobalSync.lastTurnId = "turn-99"
        unrelatedGlobalSync.historyUpdatedAt = 99
        let vm = ConversationHistoryViewModel(
            notificationCenter: center,
            historyLoader: { _, _ in
                reads += 1
                if reads == 1 {
                    return try Self.history(turns: [1], version: "v1", sync: unrelatedGlobalSync)
                }
                return try await suspended.read()
            },
            deltaLoader: { version, turn in
                deltaRequests.append((version, turn))
                XCTAssertFalse(suspended.isWaiting, "Event reads must wait for the full read.")
                return try Self.delta(turns: [3], version: "v3", historyUpdatedAt: 3)
            }
        )
        await vm.load()
        let refresh = Task { await vm.retry() }
        await eventually { suspended.isWaiting }
        Self.postTurn(3, version: "v3", to: center)
        // Notification delivery enqueues a MainActor task. Give it a bounded
        // scheduling window while the full response remains suspended.
        try await Task.sleep(for: .milliseconds(20))
        XCTAssertTrue(deltaRequests.isEmpty)

        suspended.complete(.success(try Self.history(turns: [2, 1], version: "v2", sync: unrelatedGlobalSync)))
        await refresh.value
        await eventually { vm.thread(forID: "turn-3") != nil && !vm.isRefreshing }
        XCTAssertEqual(deltaRequests.count, 1)
        XCTAssertEqual(deltaRequests.first?.0, "v2")
        XCTAssertEqual(deltaRequests.first?.1, "turn-2")
        XCTAssertNotNil(vm.thread(forID: "turn-1"))
        XCTAssertNotNil(vm.thread(forID: "turn-2"))
    }

    func testOptimisticTurnArrivingDuringFullReadSurvivesOlderSnapshot() async throws {
        let center = NotificationCenter()
        let suspended = SuspendedHistoryRead()
        var reads = 0
        let vm = ConversationHistoryViewModel(
            notificationCenter: center,
            historyLoader: { _, _ in
                reads += 1
                if reads == 1 { return try Self.history(turns: [1], version: "v1") }
                return try await suspended.read()
            },
            deltaLoader: Self.unexpectedDelta
        )
        await vm.load()
        let refresh = Task { await vm.retry() }
        await eventually { suspended.isWaiting }
        Self.postTurn(2, version: "v1", source: "optimistic", to: center)
        await eventually { vm.thread(forID: "turn-2") != nil }
        suspended.complete(.success(try Self.history(turns: [1], version: "v1")))
        await refresh.value

        XCTAssertNotNil(vm.thread(forID: "turn-1"))
        XCTAssertEqual(vm.thread(forID: "turn-2")?.userMessage, "Writer turn 2")
        XCTAssertEqual(vm.thread(forID: "turn-2")?.assistantMessage, "Clementine turn 2")
    }

    func testAdvancedEmptyDeltaReadsFullSnapshotClearsSelectionAndResetsNilCursor() async throws {
        let center = NotificationCenter()
        var historyRequests: [(Bool, String?)] = []
        var deltaRequests: [(String, String?)] = []
        var staleGlobalSync = BackendSyncState.empty
        staleGlobalSync.stateVersion = "global-v99"
        staleGlobalSync.lastTurnId = "turn-99"
        let vm = ConversationHistoryViewModel(
            notificationCenter: center,
            historyLoader: { force, since in
                historyRequests.append((force, since))
                if historyRequests.count == 1 { return try Self.history(turns: [1], version: "v1") }
                return try Self.history(turns: [], version: "v2", historyUpdatedAt: 2, sync: staleGlobalSync)
            },
            deltaLoader: { version, since in
                deltaRequests.append((version, since))
                if deltaRequests.count == 1 {
                    return try Self.delta(turns: [], version: "v2", historyUpdatedAt: 2, sync: staleGlobalSync)
                }
                return try Self.delta(turns: [3], version: "v3", historyUpdatedAt: 3)
            }
        )
        await vm.load()
        vm.selection = vm.thread(forID: "turn-1")
        Self.postTurn(2, version: "v2", to: center)
        await eventually { vm.state == .empty && !vm.isRefreshing }

        XCTAssertNil(vm.selection)
        XCTAssertNil(vm.thread(forID: "turn-1"))
        XCTAssertEqual(historyRequests.count, 2)
        XCTAssertEqual(historyRequests.last?.0, true)
        XCTAssertNil(historyRequests.last?.1)
        XCTAssertEqual(deltaRequests.first?.0, "v1")
        XCTAssertEqual(deltaRequests.first?.1, "turn-1")

        Self.postTurn(3, version: "v3", to: center)
        await eventually { vm.thread(forID: "turn-3") != nil && !vm.isRefreshing }
        XCTAssertEqual(deltaRequests.count, 2)
        XCTAssertEqual(deltaRequests.last?.0, "v2")
        XCTAssertNil(deltaRequests.last?.1, "A cleared payload cursor must not inherit global turn-99.")
        XCTAssertNil(vm.thread(forID: "turn-1"))
    }

    func testNoChangeDeltaKeepsCurrentTranscriptAndSelection() async throws {
        let center = NotificationCenter()
        var deltaReads = 0
        let vm = ConversationHistoryViewModel(
            notificationCenter: center,
            historyLoader: { _, _ in try Self.history(turns: [1], version: "v1") },
            deltaLoader: { _, _ in
                deltaReads += 1
                return try Self.delta(turns: [], version: "v1", historyUpdatedAt: 1, noChange: true, cursorTurn: 1)
            }
        )
        await vm.load()
        let original = vm.state
        vm.selection = vm.thread(forID: "turn-1")
        Self.postTurn(2, version: "v2", to: center)
        await eventually { deltaReads == 1 && !vm.isRefreshing }
        XCTAssertEqual(vm.state, original)
        XCTAssertEqual(vm.selection?.id, "turn-1")
        XCTAssertNil(vm.refreshError)
    }

    func testFailedStateDeltaAndHistoryFallbackPreserveTranscriptAndOfferRetry() async throws {
        let center = NotificationCenter()
        var historyRequests: [(Bool, String?)] = []
        var deltaReads = 0
        let vm = ConversationHistoryViewModel(
            notificationCenter: center,
            historyLoader: { force, since in
                historyRequests.append((force, since))
                if historyRequests.count == 1 { return try Self.history(turns: [1], version: "v1") }
                if historyRequests.count == 2 { throw URLError(.networkConnectionLost) }
                return try Self.history(turns: [2, 1], version: "v2")
            },
            deltaLoader: { version, turn in
                deltaReads += 1
                XCTAssertEqual(version, "v1")
                XCTAssertEqual(turn, "turn-1")
                throw URLError(.cannotConnectToHost)
            }
        )
        await vm.load()
        let original = vm.state
        vm.selection = vm.thread(forID: "turn-1")
        Self.postTurn(2, version: "v2", to: center)
        await eventually { historyRequests.count == 2 && !vm.isRefreshing }

        XCTAssertEqual(deltaReads, 1)
        XCTAssertEqual(historyRequests.last?.0, false)
        XCTAssertEqual(historyRequests.last?.1, "turn-1")
        XCTAssertEqual(vm.state, original)
        XCTAssertEqual(vm.selection?.id, "turn-1")
        XCTAssertNotNil(vm.refreshError)

        await vm.retry()
        XCTAssertEqual(historyRequests.last?.0, true)
        XCTAssertNil(historyRequests.last?.1)
        XCTAssertNotNil(vm.thread(forID: "turn-2"))
        XCTAssertNotNil(vm.thread(forID: "turn-1"))
        XCTAssertNil(vm.refreshError)
    }

    func testEmptyDeltaForSameTurnEditRefreshesSelectedTranscriptFromFullSnapshot() async throws {
        let center = NotificationCenter()
        var historyRequests: [(Bool, String?)] = []
        var deltaReads = 0
        let vm = ConversationHistoryViewModel(
            notificationCenter: center,
            historyLoader: { force, since in
                historyRequests.append((force, since))
                if historyRequests.count == 1 { return try Self.history(turns: [1], version: "v1") }
                return try Self.history(
                    turns: [1], version: "v2", assistant: "Mara chooses the open door.", historyUpdatedAt: 2
                )
            },
            deltaLoader: { version, turn in
                deltaReads += 1
                XCTAssertEqual(version, "v1")
                XCTAssertEqual(turn, "turn-1")
                return try Self.delta(turns: [], version: "v2", historyUpdatedAt: 2, cursorTurn: 1)
            }
        )
        await vm.load()
        vm.selection = vm.thread(forID: "turn-1")
        Self.postTurn(1, version: "v2", to: center)
        await eventually { historyRequests.count == 2 && !vm.isRefreshing }

        XCTAssertEqual(deltaReads, 1)
        XCTAssertEqual(historyRequests.last?.0, true)
        XCTAssertNil(historyRequests.last?.1)
        XCTAssertEqual(vm.selection?.id, "turn-1")
        XCTAssertEqual(vm.thread(forID: "turn-1")?.assistantMessage, "Mara chooses the open door.")
        XCTAssertNil(vm.refreshError)
    }

    func testUnavailableStateRouteAndEmptyChangedHistoryDeltaRecoverWithFullSnapshot() async throws {
        let center = NotificationCenter()
        var historyRequests: [(Bool, String?)] = []
        let vm = ConversationHistoryViewModel(
            notificationCenter: center,
            historyLoader: { force, since in
                historyRequests.append((force, since))
                switch historyRequests.count {
                case 1:
                    return try Self.history(turns: [1], version: "v1")
                case 2:
                    return try Self.history(
                        turns: [], version: "v2", historyUpdatedAt: 2, isDelta: true, cursorTurn: 1
                    )
                default:
                    return try Self.history(
                        turns: [1], version: "v2", assistant: "The recovered revision.", historyUpdatedAt: 2
                    )
                }
            },
            deltaLoader: { _, _ in throw URLError(.cannotConnectToHost) }
        )
        await vm.load()
        vm.selection = vm.thread(forID: "turn-1")
        Self.postTurn(1, version: "v2", to: center)
        await eventually { historyRequests.count == 3 && !vm.isRefreshing }

        XCTAssertEqual(historyRequests.count, 3, "The fallback must request one full snapshot.")
        if historyRequests.count >= 3 {
            XCTAssertFalse(historyRequests[1].0)
            XCTAssertEqual(historyRequests[1].1, "turn-1")
            XCTAssertTrue(historyRequests[2].0)
            XCTAssertNil(historyRequests[2].1)
        }
        XCTAssertEqual(vm.selection?.id, "turn-1")
        XCTAssertEqual(vm.thread(forID: "turn-1")?.assistantMessage, "The recovered revision.")
        XCTAssertNil(vm.refreshError)
    }

    func testLegacyHistoryResponseWithoutDeltaFlagPreservesExistingRowsForRequestedDelta() async throws {
        var reads = 0
        let vm = ConversationHistoryViewModel(
            notificationCenter: NotificationCenter(),
            historyLoader: { _, since in
                reads += 1
                if reads == 1 { return try Self.history(turns: [1], version: "v1") }
                XCTAssertEqual(since, "turn-1")
                return try Self.history(turns: [2], version: "v2", isDelta: nil)
            },
            deltaLoader: Self.unexpectedDelta
        )
        await vm.load()
        await vm.load(force: true, sinceTurnId: "turn-1")

        XCTAssertEqual(reads, 2)
        XCTAssertNotNil(vm.thread(forID: "turn-1"), "Older responses must retain the requested delta semantics.")
        XCTAssertNotNil(vm.thread(forID: "turn-2"))
        XCTAssertNil(vm.refreshError)
    }

    func testExplicitUIFixtureIgnoresOptimisticAndAuthoritativeEventsAfterRefresh() async throws {
        let center = NotificationCenter()
        var liveHistoryReads = 0
        var liveDeltaReads = 0
        let vm = ConversationHistoryViewModel(
            notificationCenter: center,
            historyLoader: { _, _ in
                liveHistoryReads += 1
                throw URLError(.badServerResponse)
            },
            deltaLoader: { _, _ in
                liveDeltaReads += 1
                throw URLError(.badServerResponse)
            }
        )
        XCTAssertTrue(vm.installUITestFixtureIfNeeded(
            arguments: ["--ui-testing", "--ui-history-fixture"],
            now: Date(timeIntervalSince1970: 1_788_543_000)
        ))
        await vm.retry()
        let fixture = vm.state
        let subtitle = vm.subtitle
        Self.postTurn(99, version: "real-v99", source: "optimistic", to: center)
        Self.postTurn(100, version: "real-v100", to: center)
        try await Task.sleep(for: .milliseconds(20))

        XCTAssertEqual(liveHistoryReads, 0)
        XCTAssertEqual(liveDeltaReads, 0, "Fixture notifications must never call the real state transport.")
        XCTAssertEqual(vm.state, fixture)
        XCTAssertEqual(vm.subtitle, subtitle)
        XCTAssertNil(vm.thread(forID: "turn-99"))
        XCTAssertFalse(vm.isRefreshing)
        XCTAssertNil(vm.refreshError)
    }

    private func eventually(
        timeout: TimeInterval = 2,
        file: StaticString = #filePath,
        line: UInt = #line,
        _ predicate: () -> Bool
    ) async {
        let deadline = Date().addingTimeInterval(timeout)
        while !predicate(), Date() < deadline {
            try? await Task.sleep(for: .milliseconds(2))
        }
        XCTAssertTrue(predicate(), "Timed out waiting for the controlled History transition.", file: file, line: line)
    }

    private static func unexpectedDelta(_ version: String, _ turn: String?) async throws -> BackendReadResult<BackendStateDeltaResponse> {
        XCTFail("Unexpected state delta for \(version), \(turn ?? "nil").")
        throw URLError(.badServerResponse)
    }

    private static func history(
        turns: [Int],
        version: String,
        assistant: String? = nil,
        historyUpdatedAt: TimeInterval? = nil,
        isDelta: Bool? = false,
        cursorTurn: Int? = nil,
        sync: BackendSyncState = .empty
    ) throws -> BackendReadResult<BackendHistoryResponse> {
        var body: [String: Any] = [
            "source": "test", "sourceIp": "", "rememberedNames": [],
            "conversationCount": turns.count, "stateVersion": version,
            "historyUpdatedAt": historyUpdatedAt ?? Double(turns.max() ?? 0),
            "lastUpdatedAt": historyUpdatedAt ?? Double(turns.max() ?? 0),
            "threads": turns.map { row($0, assistant: assistant) },
        ]
        if let isDelta { body["isDelta"] = isDelta }
        if let latest = cursorTurn ?? turns.max() { body["lastTurnId"] = "turn-\(latest)" }
        let data = try JSONSerialization.data(withJSONObject: body)
        let payload = try JSONDecoder().decode(BackendHistoryResponse.self, from: data)
        return BackendReadResult(payload: payload, sync: sync, notModified: false)
    }

    private static func delta(
        turns: [Int],
        version: String,
        historyUpdatedAt: TimeInterval,
        noChange: Bool = false,
        cursorTurn: Int? = nil,
        sync: BackendSyncState = .empty
    ) throws -> BackendReadResult<BackendStateDeltaResponse> {
        var body: [String: Any] = [
            "source": "test", "sourceIp": "", "stateVersion": version,
            "historyUpdatedAt": historyUpdatedAt, "lastUpdatedAt": historyUpdatedAt,
            "isDelta": true, "deltaNoChange": noChange,
            "historyDelta": turns.map { row($0) }, "memoriesDelta": [],
        ]
        if let latest = cursorTurn ?? turns.max() { body["lastTurnId"] = "turn-\(latest)" }
        let data = try JSONSerialization.data(withJSONObject: body)
        let payload = try JSONDecoder().decode(BackendStateDeltaResponse.self, from: data)
        return BackendReadResult(payload: payload, sync: sync, notModified: false)
    }

    private static func row(_ turn: Int, assistant: String? = nil) -> [String: Any] {
        [
            "id": "turn-\(turn)", "turn": turn, "title": "Scene \(turn)",
            "updatedAt": Double(turn), "preview": "A saved choice.",
            "user": "Writer turn \(turn)", "assistant": assistant ?? "Clementine turn \(turn)",
        ]
    }

    private static func postTurn(_ turn: Int, version: String, source: String = "authoritative", to center: NotificationCenter) {
        center.post(name: .themTurnCommitted, object: nil, userInfo: [
            BackendMemoryAPI.NotificationKey.source: source,
            BackendMemoryAPI.NotificationKey.turnId: "turn-\(turn)",
            BackendMemoryAPI.NotificationKey.stateVersion: version,
            BackendMemoryAPI.NotificationKey.historyUpdatedAt: Double(turn),
            BackendMemoryAPI.NotificationKey.lastUpdatedAt: Double(turn),
            BackendMemoryAPI.NotificationKey.userMessage: "Writer turn \(turn)",
            BackendMemoryAPI.NotificationKey.assistantMessage: "Clementine turn \(turn)",
        ])
    }
}

@MainActor
private final class SuspendedHistoryRead {
    private var continuation: CheckedContinuation<BackendReadResult<BackendHistoryResponse>, Error>?
    var isWaiting: Bool { continuation != nil }

    func read() async throws -> BackendReadResult<BackendHistoryResponse> {
        try await withCheckedThrowingContinuation { continuation = $0 }
    }

    func complete(_ result: Result<BackendReadResult<BackendHistoryResponse>, Error>) {
        let pending = continuation
        continuation = nil
        pending?.resume(with: result)
    }
}

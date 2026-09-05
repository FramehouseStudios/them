import Combine
import XCTest
@testable import them

@MainActor
final class MemoriesRefreshTests: XCTestCase {
    func testSuspendedRefreshKeepsSelectedMemoryReadableThroughFailureAndRetry() async throws {
        let suspended = SuspendedMemoriesRead()
        var reads = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { force, since in
                reads += 1
                XCTAssertNil(since)
                if reads == 1 { return try Self.response(ids: ["a"], version: "v1") }
                XCTAssertTrue(force)
                if reads == 2 { return try await suspended.read() }
                return try Self.response(ids: ["a"], version: "v2", summary: "A corrected memory.")
            },
            pendingQuestionLoader: { _ in nil }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(Self.items(vm).first)
        vm.selection = original
        let refresh = Task { await vm.retry() }
        await eventually { suspended.isWaiting }
        XCTAssertTrue(vm.isRefreshing)
        XCTAssertEqual(Self.items(vm), [original])
        XCTAssertEqual(vm.selection, original)

        suspended.complete(.failure(URLError(.notConnectedToInternet)))
        let failed = await refresh.value
        XCTAssertEqual(failed, .failed)
        XCTAssertEqual(Self.items(vm), [original])
        XCTAssertEqual(vm.selection, original)
        XCTAssertNotNil(vm.refreshError)
        XCTAssertFalse(vm.isRefreshing)

        let recovered = await vm.retry()
        XCTAssertEqual(recovered, .succeeded)
        XCTAssertEqual(Self.items(vm).first?.summary, "A corrected memory.")
        XCTAssertEqual(vm.memory(forID: vm.selection?.id ?? "")?.summary, "A corrected memory.")
        XCTAssertNil(vm.refreshError)
    }

    func testInitialFailureRecoversThroughFullRetry() async throws {
        var reads = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { force, _ in
                reads += 1
                if reads == 1 { throw URLError(.cannotConnectToHost) }
                XCTAssertTrue(force)
                return try Self.response(ids: ["a"], version: "v1")
            },
            pendingQuestionLoader: { _ in nil }
        )
        let failed = await vm.load()
        XCTAssertEqual(failed, .failed)
        guard case .error = vm.state else { return XCTFail("Initial errors need a recovery state.") }
        let recovered = await vm.retry()
        XCTAssertEqual(recovered, .succeeded)
        XCTAssertEqual(Self.items(vm).map(\.id), ["a"])
        XCTAssertNil(vm.refreshError)
    }

    func testNoChangePreservesRowsAndOmittedQualityReceiptsAndPreferences() async throws {
        var reads = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                reads += 1
                if reads == 1 {
                    return try Self.response(ids: ["a"], version: "v1", metadata: Self.metadata)
                }
                return try Self.response(ids: [], version: "v1", noChange: true)
            },
            pendingQuestionLoader: { _ in nil }
        )
        _ = await vm.load()
        let original = vm.state
        let quality = vm.qualitySnapshot
        let receipts = vm.recentActionReceipts
        let preferences = vm.storyMovePreferences
        XCTAssertFalse(receipts.isEmpty)
        XCTAssertFalse(preferences.isEmpty)
        XCTAssertNotNil(quality)
        let result = await vm.refreshCrossDeviceMemoriesIfNeeded()

        XCTAssertEqual(result, .succeeded)
        XCTAssertEqual(vm.state, original)
        XCTAssertEqual(vm.qualitySnapshot, quality)
        XCTAssertEqual(vm.recentActionReceipts, receipts)
        XCTAssertEqual(vm.storyMovePreferences, preferences)
    }

    func testNoChangeAcceptsExplicitlyClearedMetadataArraysWithoutClearingCards() async throws {
        var reads = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                reads += 1
                if reads == 1 {
                    return try Self.response(ids: ["a"], version: "v1", metadata: Self.metadata)
                }
                return try Self.response(ids: [], version: "v1", noChange: true, metadata: [
                    "actionReceipts": ["count": 0, "items": []],
                    "storyMovePreferences": [],
                ])
            },
            pendingQuestionLoader: { _ in nil }
        )
        _ = await vm.load()
        _ = await vm.refreshCrossDeviceMemoriesIfNeeded()

        XCTAssertEqual(Self.items(vm).map(\.id), ["a"])
        XCTAssertTrue(vm.recentActionReceipts.isEmpty)
        XCTAssertTrue(vm.storyMovePreferences.isEmpty)
        XCTAssertEqual(vm.qualitySnapshot?.totalCards, 1)
    }

    func testEmptyAuthoritativeSnapshotDoesNotRecreateClearedMemoriesFromConversationSamples() async throws {
        var reads = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                reads += 1
                if reads == 1 { return try Self.response(ids: ["a"], version: "v1") }
                return try Self.response(ids: [], version: "v2", samples: [Self.conversationSample])
            },
            pendingQuestionLoader: { _ in nil }
        )
        _ = await vm.load()
        vm.selection = Self.items(vm).first
        _ = await vm.refreshCrossDeviceMemoriesIfNeeded()

        XCTAssertEqual(vm.state, .empty, "Historical samples are not permission to rebuild cleared memories.")
        XCTAssertNil(vm.selection)
        XCTAssertEqual(reads, 2)
    }

    func testChangedDeltaIsReplacementSnapshotAndRefreshesSelectedCard() async throws {
        var reads = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, since in
                reads += 1
                if reads == 1 { return try Self.response(ids: ["a", "b"], version: "v1") }
                XCTAssertEqual(since, "v1")
                return try Self.response(ids: ["b"], version: "v2", summary: "Revised on another device.")
            },
            pendingQuestionLoader: { _ in nil }
        )
        _ = await vm.load()
        vm.selection = Self.items(vm).first { $0.id == "b" }
        _ = await vm.refreshCrossDeviceMemoriesIfNeeded()

        XCTAssertEqual(Self.items(vm).map(\.id), ["b"])
        XCTAssertEqual(vm.memory(forID: vm.selection?.id ?? "")?.summary, "Revised on another device.")
        XCTAssertNil(vm.refreshError)
    }

    func testFullSnapshotClearsCreativeCardsAndPreferencesWithoutAccountVersionChange() async throws {
        var reads = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { force, since in
                reads += 1
                if reads == 1 {
                    return try Self.response(ids: ["a"], version: "account-v1", metadata: Self.metadata)
                }
                XCTAssertFalse(force)
                XCTAssertEqual(since, "account-v1")
                return try Self.response(
                    ids: [], version: "account-v1", metadata: [
                        "creativeMemoryRevision": "cm-cleared",
                        "storyMovePreferences": [], "actionReceipts": ["count": 0, "items": []],
                        "memoryQuality": ["totalCards": 0, "avgQualityScore": 0],
                    ], samples: [Self.conversationSample]
                )
            },
            pendingQuestionLoader: { _ in nil }
        )
        let loaded = await vm.load()
        XCTAssertEqual(loaded, .succeeded)
        vm.selection = try XCTUnwrap(Self.items(vm).first)
        XCTAssertFalse(vm.storyMovePreferences.isEmpty)
        XCTAssertFalse(vm.recentActionReceipts.isEmpty)

        let cleared = await vm.refreshCrossDeviceMemoriesIfNeeded()
        XCTAssertEqual(cleared, .succeeded)
        XCTAssertEqual(vm.state, .empty)
        XCTAssertNil(vm.selection)
        XCTAssertTrue(vm.storyMovePreferences.isEmpty)
        XCTAssertTrue(vm.recentActionReceipts.isEmpty)
        XCTAssertEqual(vm.qualitySnapshot?.totalCards, 0)
        XCTAssertNil(vm.refreshError)
        XCTAssertEqual(reads, 2)
    }

    func testBackgroundReadUsesPayloadCursorInsteadOfUnrelatedGlobalSync() async throws {
        var requests: [String?] = []
        var globalSync = BackendSyncState.empty
        globalSync.stateVersion = "global-v99"
        globalSync.lastTurnId = "turn-99"
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, since in
                requests.append(since)
                if requests.count == 1 {
                    return try Self.response(ids: ["a"], version: "payload-v1", sync: globalSync)
                }
                return try Self.response(ids: ["b"], version: "payload-v2", sync: globalSync)
            },
            pendingQuestionLoader: { _ in nil }
        )
        _ = await vm.load()
        _ = await vm.refreshCrossDeviceMemoriesIfNeeded()

        XCTAssertEqual(requests.count, 2)
        XCTAssertEqual(requests.last!, "payload-v1")
        XCTAssertEqual(Self.items(vm).map(\.id), ["b"])
    }

    func testAuthoritativeEventDuringSuspendedRefreshQueuesOneReadFromLatestAppliedCursor() async throws {
        let center = NotificationCenter()
        let suspended = SuspendedMemoriesRead()
        var requests: [(Bool, String?)] = []
        let vm = MemoriesViewModel(
            notificationCenter: center,
            memoriesLoader: { force, since in
                requests.append((force, since))
                if requests.count == 1 { return try Self.response(ids: ["a"], version: "v1") }
                if requests.count == 2 { return try await suspended.read() }
                XCTAssertFalse(suspended.isWaiting)
                return try Self.response(ids: ["a", "b", "c"], version: "v3")
            },
            pendingQuestionLoader: { _ in nil }
        )
        _ = await vm.load()
        let refresh = Task { await vm.retry() }
        await eventually { suspended.isWaiting }
        Self.postTurn(version: "v3", to: center)
        try await Task.sleep(for: .milliseconds(20))
        XCTAssertEqual(requests.count, 2, "Event refresh must not overlap the pending full read.")
        suspended.complete(.success(try Self.response(ids: ["a", "b"], version: "v2")))
        _ = await refresh.value
        await eventually { requests.count == 3 && !vm.isRefreshing }

        XCTAssertEqual(requests.count, 3)
        XCTAssertEqual(requests.last?.1, "v2")
        XCTAssertEqual(Set(Self.items(vm).map(\.id)), ["a", "b", "c"])
    }

    func testCancellationDefersRefreshWithoutRemovingCardsOrPresentingFailure() async throws {
        let suspended = SuspendedMemoriesRead()
        var reads = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                reads += 1
                if reads == 1 { return try Self.response(ids: ["a"], version: "v1") }
                return try await suspended.read()
            },
            pendingQuestionLoader: { _ in nil }
        )
        _ = await vm.load()
        let original = vm.state
        let refresh = Task { await vm.retry() }
        await eventually { suspended.isWaiting }
        refresh.cancel()
        suspended.complete(.success(try Self.response(ids: [], version: "v2")))
        let outcome = await refresh.value

        XCTAssertEqual(outcome, .deferred)
        XCTAssertEqual(vm.state, original)
        XCTAssertNil(vm.refreshError)
        XCTAssertFalse(vm.isRefreshing)
    }

    func testConfirmedForgetDuringSuspendedReadCannotResurrectDeletedCard() async throws {
        let suspended = SuspendedMemoriesRead()
        let (api, session) = Self.mutationAPI()
        defer { session.invalidateAndCancel() }
        var reads = 0
        let vm = MemoriesViewModel(
            api: api,
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                reads += 1
                if reads == 1 { return try Self.response(ids: ["a"], version: "v1") }
                if reads == 2 { return try await suspended.read() }
                return try Self.response(ids: [], version: "v2")
            },
            pendingQuestionLoader: { _ in nil }
        )
        _ = await vm.load()
        vm.selection = Self.items(vm).first
        let refresh = Task { await vm.retry() }
        await eventually { suspended.isWaiting }
        try await vm.forgetMemory(itemID: "a", key: "theme-a")
        XCTAssertEqual(vm.state, .empty)
        XCTAssertNil(vm.selection)
        var resurrected = false
        let observation = vm.$state.sink { state in
            if case .loaded(let items) = state, items.contains(where: { $0.id == "a" }) {
                resurrected = true
            }
        }
        defer { observation.cancel() }

        suspended.complete(.success(try Self.response(ids: ["a"], version: "v1")))
        _ = await refresh.value
        await eventually { reads == 3 && !vm.isRefreshing }
        XCTAssertFalse(resurrected, "A stale response must never publish a confirmed forgotten card.")
        XCTAssertEqual(vm.state, .empty)
    }

    func testConfirmedEditDuringSuspendedReadCannotBeOverwrittenByOldSnapshot() async throws {
        let suspended = SuspendedMemoriesRead()
        let (api, session) = Self.mutationAPI()
        defer { session.invalidateAndCancel() }
        var reads = 0
        let vm = MemoriesViewModel(
            api: api,
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                reads += 1
                if reads == 1 { return try Self.response(ids: ["a"], version: "v1") }
                if reads == 2 { return try await suspended.read() }
                return try Self.response(ids: ["a"], version: "v2", summary: "The confirmed correction.")
            },
            pendingQuestionLoader: { _ in nil }
        )
        _ = await vm.load()
        vm.selection = Self.items(vm).first
        let refresh = Task { await vm.retry() }
        await eventually { suspended.isWaiting }
        let updated = try await vm.updateMemory(
            itemID: "a", key: "theme-a", title: "Memory a",
            summary: "The confirmed correction.", reason: "The writer corrected this."
        )
        XCTAssertEqual(updated.summary, "The confirmed correction.")
        XCTAssertEqual(Self.items(vm).first?.summary, updated.summary)
        var reverted = false
        let observation = vm.$state.sink { state in
            if case .loaded(let items) = state,
               let memory = items.first(where: { $0.id == "a" }),
               memory.summary != "The confirmed correction." {
                reverted = true
            }
        }
        defer { observation.cancel() }

        suspended.complete(.success(try Self.response(ids: ["a"], version: "v1")))
        _ = await refresh.value
        await eventually { reads == 3 && !vm.isRefreshing }
        XCTAssertFalse(reverted)
        XCTAssertEqual(Self.items(vm).first?.summary, "The confirmed correction.")
        XCTAssertEqual(vm.memory(forID: vm.selection?.id ?? "")?.summary, "The confirmed correction.")
    }

    func testExplicitFixtureRequiresBothFlagsAndIgnoresLiveEventsAfterRetry() async throws {
        let center = NotificationCenter()
        var liveReads = 0
        var pendingReads = 0
        let vm = MemoriesViewModel(
            notificationCenter: center,
            memoriesLoader: { _, _ in
                liveReads += 1
                throw URLError(.badServerResponse)
            },
            pendingQuestionLoader: { _ in
                pendingReads += 1
                throw URLError(.badServerResponse)
            }
        )
        XCTAssertFalse(vm.installMemoriesUITestFixtureIfNeeded(arguments: ["--ui-testing"]))
        XCTAssertTrue(vm.installMemoriesUITestFixtureIfNeeded(arguments: ["--ui-testing", "--ui-memories-fixture"]))
        _ = await vm.retry()
        let fixture = vm.state
        Self.postTurn(version: "real-v99", to: center)
        Self.postTurn(version: "real-v100", source: "optimistic", to: center)
        try await Task.sleep(for: .milliseconds(20))

        XCTAssertEqual(vm.state, fixture)
        XCTAssertEqual(liveReads, 0)
        XCTAssertEqual(pendingReads, 0)
        XCTAssertFalse(Self.items(vm).isEmpty)
        XCTAssertNil(vm.refreshError)
    }

    func testUnchangedEditorBaselineValidatesAndClosingKeepsExistingSelection() async throws {
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in try Self.response(ids: ["a"], version: "v1") },
            pendingQuestionLoader: { _ in nil }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(Self.items(vm).first)
        vm.selection = original
        vm.beginEditingMemory(original)

        XCTAssertNoThrow(try vm.validateMemoryEdit(original))
        vm.endEditingMemory()
        XCTAssertEqual(vm.selection?.id, original.id)
        XCTAssertEqual(vm.memory(forID: original.id), original)
    }

    func testChangedCardRejectsOldEditorBaselineWithoutDiscardingWriterDraft() async throws {
        var reads = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                reads += 1
                return try Self.response(
                    ids: ["a"], version: reads == 1 ? "v1" : "v2",
                    summary: reads == 1 ? "The original memory." : "An unseen correction from another device."
                )
            },
            pendingQuestionLoader: { _ in nil }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(Self.items(vm).first)
        var draft = original
        draft.summary = "The writer's unfinished local correction."
        vm.selection = original
        vm.beginEditingMemory(original)
        _ = await vm.refreshCrossDeviceMemoriesIfNeeded()

        XCTAssertThrowsError(try vm.validateMemoryEdit(original))
        XCTAssertEqual(vm.selection?.id, original.id)
        XCTAssertEqual(vm.memory(forID: original.id)?.summary, "An unseen correction from another device.")
        XCTAssertEqual(draft.summary, "The writer's unfinished local correction.")
        vm.endEditingMemory()
        XCTAssertEqual(vm.selection?.id, original.id)
    }

    func testRemovedCardRetainsEditorSelectionUntilDraftIsDismissed() async throws {
        var reads = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                reads += 1
                return try Self.response(ids: reads == 1 ? ["a"] : [], version: reads == 1 ? "v1" : "v2")
            },
            pendingQuestionLoader: { _ in nil }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(Self.items(vm).first)
        vm.selection = original
        vm.beginEditingMemory(original)
        _ = await vm.refreshCrossDeviceMemoriesIfNeeded()

        XCTAssertEqual(vm.state, .empty)
        XCTAssertNil(vm.memory(forID: original.id))
        XCTAssertEqual(vm.selection?.id, original.id, "Removing the card must not silently dismiss an active draft.")
        XCTAssertThrowsError(try vm.validateMemoryEdit(original))
        vm.endEditingMemory()
        XCTAssertNil(vm.selection)
    }

    func testStaleEditorSaveIsRejectedBeforeAnyMutationTransportRequest() async throws {
        let (api, session) = Self.mutationAPI()
        defer { session.invalidateAndCancel() }
        var reads = 0
        let vm = MemoriesViewModel(
            api: api,
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                reads += 1
                return try Self.response(
                    ids: ["a"], version: reads == 1 ? "v1" : "v2",
                    summary: reads == 1 ? "The original memory." : "A newer saved correction."
                )
            },
            pendingQuestionLoader: { _ in nil }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(Self.items(vm).first)
        vm.selection = original
        vm.beginEditingMemory(original)
        _ = await vm.refreshCrossDeviceMemoriesIfNeeded()
        let requestsBeforeSave = MemoriesRefreshMutationURLProtocol.requestLog.snapshot

        do {
            _ = try await vm.updateMemory(
                itemID: original.id, key: original.key, title: original.title,
                summary: "The unsaved old-baseline edit.", reason: original.reason,
                expectedItem: original
            )
            XCTFail("A stale editor must resolve the changed card before submitting a write.")
        } catch {
            XCTAssertFalse(error.localizedDescription.isEmpty)
        }

        XCTAssertEqual(MemoriesRefreshMutationURLProtocol.requestLog.snapshot, requestsBeforeSave)
        XCTAssertEqual(vm.memory(forID: original.id)?.summary, "A newer saved correction.")
        XCTAssertEqual(vm.selection?.id, original.id)
        vm.endEditingMemory()
    }

    func testEditableUIFixtureRejectsSaveAndForgetBeforeAnyTransportRequest() async throws {
        let (api, session) = Self.mutationAPI()
        defer { session.invalidateAndCancel() }
        let vm = MemoriesViewModel(api: api, notificationCenter: NotificationCenter())
        XCTAssertTrue(vm.installMemoriesUITestFixtureIfNeeded(arguments: [
            "--ui-testing", "--ui-memories-fixture", "--ui-memories-editable-fixture",
        ]))
        let original = try XCTUnwrap(Self.items(vm).first)
        XCTAssertTrue(original.editable)
        vm.selection = original
        vm.beginEditingMemory(original)
        let fixture = vm.state
        let requestsBeforeMutations = MemoriesRefreshMutationURLProtocol.requestLog.snapshot

        do {
            _ = try await vm.updateMemory(
                itemID: original.id, key: original.key, title: original.title,
                summary: "Keep this typed correction in the editor.", reason: original.reason,
                expectedItem: original
            )
            XCTFail("An editable UI fixture must reject saves locally.")
        } catch {
            XCTAssertEqual((error as? URLError)?.code, .notConnectedToInternet)
        }
        do {
            try await vm.forgetMemory(itemID: original.id, key: original.key)
            XCTFail("A UI fixture must never submit deletion requests.")
        } catch {
            XCTAssertEqual((error as? URLError)?.code, .notConnectedToInternet)
        }

        XCTAssertEqual(MemoriesRefreshMutationURLProtocol.requestLog.snapshot, requestsBeforeMutations)
        XCTAssertEqual(vm.state, fixture)
        XCTAssertEqual(vm.selection?.id, original.id)
        vm.endEditingMemory()
    }

    private static func items(_ vm: MemoriesViewModel) -> [MemoryItem] {
        guard case .loaded(let items) = vm.state else { return [] }
        return items
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
        XCTAssertTrue(predicate(), "Timed out waiting for the controlled Memories transition.", file: file, line: line)
    }

    private static func response(
        ids: [String],
        version: String,
        summary: String = "The original memory.",
        noChange: Bool = false,
        metadata: [String: Any] = [:],
        samples: [[String: Any]] = [],
        sync: BackendSyncState = .empty
    ) throws -> BackendReadResult<BackendMemoriesResponse> {
        var body: [String: Any] = [
            "source": "test", "sourceIp": "", "stateVersion": version,
            "creativeMemoryRevision": "cm-\(version)",
            "memoryUpdatedAt": 1, "lastUpdatedAt": 1,
            "isDelta": true, "deltaNoChange": noChange,
            "memories": ids.map { card($0, summary: summary) }, "conversationSamples": samples,
        ]
        body.merge(metadata) { _, supplied in supplied }
        let data = try JSONSerialization.data(withJSONObject: body)
        let payload = try JSONDecoder().decode(BackendMemoriesResponse.self, from: data)
        return BackendReadResult(payload: payload, sync: sync, notModified: false)
    }

    private static func card(_ id: String, summary: String) -> [String: Any] {
        [
            "id": id, "key": "theme-\(id)", "title": "Memory \(id)", "summary": summary,
            "reason": "The writer shared this.", "emotionalTone": "reflective", "salience": 0.7,
            "confidence": 0.8, "rememberedAt": 1, "snippets": [], "editable": true,
            "referenceHint": "", "source": "theme",
        ]
    }

    private static var metadata: [String: Any] {
        [
            "memoryQuality": ["totalCards": 1, "avgQualityScore": 0.8],
            "actionReceipts": ["count": 1, "items": [[
                "id": "receipt-1", "type": "memory", "status": "saved", "target": "a",
                "summary": "Clementine remembered the correction.", "createdAt": 1,
            ]]],
            "storyMovePreferences": [[
                "projectId": "p1", "projectTitle": "The Crossing", "family": "physical-choice",
                "displayName": "Physical choices", "summary": "Make the choice physical.",
                "learnedScore": 1, "effectiveScore": 1, "evidenceCount": 1, "selectedCount": 1,
                "passedOverCount": 0, "acceptedPageCount": 1, "blockResolutionCount": 0,
                "explicitStance": "prefer",
            ]],
        ]
    }

    private static var conversationSample: [String: Any] {
        [
            "id": "turn-before-clear", "turn": 1, "title": "An old conversation",
            "preview": "History is separate from active memory.", "user": "An old message.",
            "assistant": "An old reply.", "updatedAt": 1,
        ]
    }

    private static func postTurn(version: String, source: String = "authoritative", to center: NotificationCenter) {
        center.post(name: .themTurnCommitted, object: nil, userInfo: [
            BackendMemoryAPI.NotificationKey.source: source,
            BackendMemoryAPI.NotificationKey.turnId: "turn-3",
            BackendMemoryAPI.NotificationKey.stateVersion: version,
            BackendMemoryAPI.NotificationKey.memoryUpdatedAt: 3,
            BackendMemoryAPI.NotificationKey.lastUpdatedAt: 3,
        ])
    }

    private static func mutationAPI() -> (BackendMemoryAPI, URLSession) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MemoriesRefreshMutationURLProtocol.self]
        let session = URLSession(configuration: configuration)
        return (
            BackendMemoryAPI(session: session, baseURL: URL(string: "https://memories-refresh.test")!),
            session
        )
    }
}

@MainActor
private final class SuspendedMemoriesRead {
    private var continuation: CheckedContinuation<BackendReadResult<BackendMemoriesResponse>, Error>?
    var isWaiting: Bool { continuation != nil }

    func read() async throws -> BackendReadResult<BackendMemoriesResponse> {
        try await withCheckedThrowingContinuation { continuation = $0 }
    }

    func complete(_ result: Result<BackendReadResult<BackendMemoriesResponse>, Error>) {
        let pending = continuation
        continuation = nil
        pending?.resume(with: result)
    }
}

private final class MemoriesRefreshMutationURLProtocol: URLProtocol {
    static let requestLog = MemoriesRefreshRequestLog()

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == "memories-refresh.test"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.requestLog.record(request.url?.path ?? "")
        let status: Int
        let body: String
        switch request.url?.path {
        case "/session":
            // These mutation tests need no new identity; bootstrap is best-effort.
            status = 503
            body = #"{"error":"session_fixture_unavailable"}"#
        case "/memories":
            status = 200
            body = #"{"source":"test","source_ip":"","state_version":"v1","creative_memory_revision":"cm-v1","memories":[],"conversation_samples":[]}"#
        case "/memories/forget":
            status = 200
            body = #"{"ok":true,"action":"forget","status":"forgotten","forgotten_id":"a","state_version":"v2","creative_memory_revision":"cm-v2"}"#
        case "/memories/update":
            status = 200
            body = #"{"ok":true,"action":"update","status":"updated","state_version":"v2","memory_card":{"id":"a","key":"theme-a","title":"Memory a","summary":"The confirmed correction.","reason":"The writer corrected this.","emotional_tone":"reflective","salience":0.7,"confidence":0.8,"remembered_at":2,"snippets":[],"editable":true,"reference_hint":"","source":"theme"}}"#
        default:
            client?.urlProtocol(self, didFailWithError: URLError(.unsupportedURL))
            return
        }
        guard let url = request.url,
              let response = HTTPURLResponse(
                url: url, statusCode: status, httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "application/json"]
              ) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

private final class MemoriesRefreshRequestLog: @unchecked Sendable {
    private let lock = NSLock()
    private var paths: [String] = []

    var snapshot: [String] {
        lock.lock()
        defer { lock.unlock() }
        return paths
    }

    func record(_ path: String) {
        lock.lock()
        defer { lock.unlock() }
        paths.append(path)
    }
}

import XCTest
@testable import them

@MainActor
final class MemoriesCardActionTests: XCTestCase {
    override func tearDown() {
        MemoryMutationURLProtocol.handler = nil
        super.tearDown()
    }

    func testHelpfulPinsDisplayedVersionDespiteUnrelatedNewerAPIRead() async throws {
        try await assertPinnedAction(.feedback("hit"))
    }

    func testPromotionPinsDisplayedVersionAndRequiresFreshSavedCard() async throws {
        try await assertPinnedAction(.promote)
    }

    private func assertPinnedAction(_ action: MemoryCardAction) async throws {
        let log = MemoryMutationRequestLog()
        let (api, session) = makeAPI(log: log, action: action)
        defer { session.invalidateAndCancel() }
        _ = try await api.fetchMemories(limit: 1, force: true)
        var reads = 0
        let vm = MemoriesViewModel(
            api: api, notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                reads += 1
                return try Self.read(cards: [Self.card(history: action == .promote && reads == 1)], version: reads == 1 ? "v1" : "v10")
            }, pendingQuestionLoader: { _ in nil }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(vm.memory(forID: action == .promote ? "history-turn-1" : "theme-warmth"))
        _ = try await api.fetchMemories(limit: 1, force: true)
        let saved = try await perform(action, on: vm, item: original)
        let path = action == .promote ? "/memories/promote" : "/memories/feedback"
        let request = try XCTUnwrap(log.requests.first { $0.url?.path == path })
        let body = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as? [String: Any])
        XCTAssertEqual(body["expected_state_version"] as? String, "v1")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-State-Version"), "v1")
        XCTAssertEqual(body["card_id"] as? String, original.id)
        XCTAssertEqual(saved.id, "theme-warmth")
        XCTAssertEqual(vm.memory(forID: saved.id), saved)
        XCTAssertEqual(reads, action == .promote ? 2 : 1)
    }

    func testExplicitBlankAPIBaselinesFailBeforeAnyTransport() async throws {
        let log = MemoryMutationRequestLog()
        let (api, session) = makeAPI(log: log)
        defer { session.invalidateAndCancel() }
        for revision in ["", "  \n"] {
            do {
                _ = try await api.markMemoryQuality(id: "theme-warmth", signal: "hit", expectedStateVersion: revision)
                XCTFail("Blank baselines cannot fall back to a global revision.")
            } catch BackendMemoryAPIError.invalidResponse {}
            do {
                _ = try await api.promoteMemoryCard(id: "history-turn-1", expectedStateVersion: revision)
                XCTFail("Blank baselines cannot bootstrap a write.")
            } catch BackendMemoryAPIError.invalidResponse {}
        }
        XCTAssertTrue(log.requests.isEmpty)
    }

    func testMissingDisplayedRevisionBlocksBothLiveActionsBeforeTransport() async throws {
        for action in [MemoryCardAction.feedback("hit"), .promote] {
            let log = MemoryMutationRequestLog()
            let (api, session) = makeAPI(log: log, action: action)
            defer { session.invalidateAndCancel() }
            let vm = MemoriesViewModel(
                api: api, notificationCenter: NotificationCenter(),
                memoriesLoader: { _, _ in try Self.read(cards: [Self.card(history: action == .promote)], version: "") },
                pendingQuestionLoader: { _ in nil }
            )
            _ = await vm.load()
            let item = try XCTUnwrap(vm.memory(forID: action == .promote ? "history-turn-1" : "theme-warmth"))
            do { _ = try await perform(action, on: vm, item: item); XCTFail("A write requires the displayed revision.") }
            catch MemoryCardActionError.unconfirmed {}
            XCTAssertTrue(log.requests.isEmpty)
        }
    }

    func testHelpfulRejectsWrongSuccessActionStatusAndTargetReceipts() async throws {
        try await assertRejectedReceipts(action: .feedback("hit"), overrides: [
            ["ok": false], ["action": "promote"], ["status": "correction"], ["themeKey": "other"],
            ["memoryCard": NSNull()], ["memoryCard": Self.card(id: "theme-other")],
            ["memoryCard": Self.card(key: "other")],
        ])
    }

    func testPromotionRejectsWrongSuccessActionStatusAndTargetReceipts() async throws {
        try await assertRejectedReceipts(action: .promote, overrides: [
            ["ok": false], ["action": "update"], ["status": "updated"], ["themeKey": "other"],
            ["memoryCard": NSNull()], ["memoryCard": Self.card(id: "theme-other")],
            ["memoryCard": Self.card(key: "other")],
        ])
    }

    private func assertRejectedReceipts(action: MemoryCardAction, overrides: [[String: Any]]) async throws {
        for override in overrides {
            let vm = MemoriesViewModel(
                notificationCenter: NotificationCenter(),
                memoriesLoader: { _, _ in try Self.read(cards: [Self.card(history: action == .promote)]) },
                pendingQuestionLoader: { _ in nil },
                cardActionLoader: { _, _, _ in try Self.receipt(action: action, overrides: override) }
            )
            _ = await vm.load()
            let item = try XCTUnwrap(vm.memory(forID: action == .promote ? "history-turn-1" : "theme-warmth"))
            vm.selection = item
            do { _ = try await perform(action, on: vm, item: item); XCTFail("An unrelated or malformed receipt is not confirmation.") }
            catch MemoryCardActionError.unconfirmed {}
            XCTAssertEqual(vm.memory(forID: item.id), item)
            XCTAssertEqual(vm.selection, item)
            XCTAssertNil(vm.actionNotice)
        }
    }

    func testChangedOrMismatchedCardCannotAuthorizeFeedback() async throws {
        var writes = 0
        var reads = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in reads += 1; return try Self.read(cards: [Self.card(summary: reads == 1 ? "Original." : "New version.")]) },
            pendingQuestionLoader: { _ in nil },
            cardActionLoader: { _, _, _ in writes += 1; return try Self.receipt() }
        )
        _ = await vm.load()
        let item = try XCTUnwrap(vm.memory(forID: "theme-warmth"))
        do {
            _ = try await vm.markMemoryQuality(itemID: item.id, key: "wrong", signal: "hit", expectedItem: item)
            XCTFail("The reviewed key must match.")
        } catch MemoryCardActionError.changed {}
        _ = await vm.retry()
        do { _ = try await perform(.feedback("hit"), on: vm, item: item); XCTFail("Stale content cannot authorize feedback.") }
        catch MemoryCardActionError.changed {}
        XCTAssertEqual(writes, 0)
    }

    func testStructuredAndReadOnlyCardsCannotSendThemeFeedback() async throws {
        for row in [Self.card(id: "character-mara"), Self.card(history: true), Self.card(overrides: ["editable": false])] {
            var writes = 0
            let vm = MemoriesViewModel(
                notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in try Self.read(cards: [row]) },
                pendingQuestionLoader: { _ in nil }, cardActionLoader: { _, _, _ in writes += 1; return try Self.receipt() }
            )
            _ = await vm.load()
            let item = try XCTUnwrap(vm.memory(forID: row["id"] as! String))
            do { _ = try await perform(.feedback("hit"), on: vm, item: item); XCTFail("Helpful is a theme-only action.") }
            catch MemoryCardActionError.unavailable {}
            XCTAssertEqual(writes, 0)
        }
    }

    func testConsecutiveHelpfulActionsUseMatchingReceiptRevisionOnly() async throws {
        var revisions: [String] = []
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in try Self.read(cards: [Self.card(), Self.card(id: "theme-other", key: "other")]) },
            pendingQuestionLoader: { _ in nil },
            cardActionLoader: { _, item, version in
                revisions.append(version)
                return try Self.receipt(overrides: ["themeKey": item.key, "memoryCard": Self.card(id: item.id, key: item.key, votes: 1)])
            }
        )
        _ = await vm.load()
        let first = try XCTUnwrap(vm.memory(forID: "theme-warmth"))
        let other = try XCTUnwrap(vm.memory(forID: "theme-other"))
        let saved = try await perform(.feedback("hit"), on: vm, item: first)
        XCTAssertEqual(saved.qualityHitCount, 1)
        _ = try await perform(.feedback("hit"), on: vm, item: saved)
        _ = try await perform(.feedback("hit"), on: vm, item: other)
        XCTAssertEqual(revisions, ["v1", "v2", "v1"])
    }

    func testPendingCardActionBlocksDuplicateCorrectionAndForget() async throws {
        let pending = PendingMemoryMutation()
        var writes = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in try Self.read() },
            pendingQuestionLoader: { _ in nil },
            cardActionLoader: { _, _, _ in writes += 1; return try await pending.wait() }
        )
        _ = await vm.load()
        let item = try XCTUnwrap(vm.memory(forID: "theme-warmth"))
        let saving = Task { try await perform(.feedback("hit"), on: vm, item: item) }
        await waitForAction(pending)
        do { _ = try await perform(.feedback("hit"), on: vm, item: item); XCTFail("Duplicate submission must be blocked.") }
        catch MemoryCardActionError.inProgress {}
        do { try await vm.forgetMemory(itemID: item.id, key: item.key); XCTFail("Forget must wait for feedback.") }
        catch MemoryForgetError.inProgress {}
        do {
            _ = try await vm.updateMemory(itemID: item.id, key: item.key, title: "A", summary: "B", reason: "C")
            XCTFail("Correction must wait for feedback.")
        } catch MemoriesViewModel.MemoryEditConflict.inProgress {}
        pending.complete(.success(try Self.receipt()))
        _ = try await saving.value
        XCTAssertEqual(writes, 1)
    }

    func testSingleCardReceiptCannotAdvanceTheWholeListsDeltaCursor() async throws {
        var reads = 0
        var mutationSync = BackendSyncState.empty
        mutationSync.stateVersion = "v2"
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(), memoriesLoader: { _, since in
                reads += 1
                if reads > 1 { XCTAssertEqual(since, "v1", "Only a list response can advance the list cursor.") }
                return try Self.read(cards: [Self.card(), Self.card(id: "theme-other", key: "other", summary: reads == 1 ? "Old unseen content." : "New content from the full response.")], version: reads == 1 ? "v1" : "v2")
            }, pendingQuestionLoader: { _ in nil }, cardActionLoader: { _, _, _ in try Self.receipt(sync: mutationSync) }
        )
        _ = await vm.load()
        _ = try await perform(.feedback("hit"), on: vm, item: XCTUnwrap(vm.memory(forID: "theme-warmth")))
        _ = await vm.refreshCrossDeviceMemoriesIfNeeded()
        XCTAssertEqual(reads, 2)
        XCTAssertEqual(vm.memory(forID: "theme-other")?.summary, "New content from the full response.")
    }

    func testHelpfulWaitsForPendingCorrectionOrForget() async throws {
        for forget in [false, true] {
            let pending = PendingMemoryMutation()
            var writes = 0
            let vm = MemoriesViewModel(
                notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in try Self.read() }, pendingQuestionLoader: { _ in nil },
                forgetLoader: { _, _ in try await pending.wait() }, correctionLoader: { _, _, _ in try await pending.wait() },
                cardActionLoader: { _, _, _ in writes += 1; return try Self.receipt() }
            )
            _ = await vm.load()
            let item = try XCTUnwrap(vm.memory(forID: "theme-warmth"))
            let saving = Task {
                if forget { try await vm.forgetMemory(itemID: item.id, key: item.key) }
                else { _ = try await vm.updateMemory(itemID: item.id, key: item.key, title: "A", summary: "B", reason: "C") }
            }
            await waitForAction(pending)
            do { _ = try await perform(.feedback("hit"), on: vm, item: item); XCTFail("Other memory writes must finish first.") }
            catch MemoryCardActionError.inProgress {}
            pending.complete(.failure(URLError(.notConnectedToInternet)))
            do { try await saving.value; XCTFail("The fixture write fails.") } catch is URLError {}
            XCTAssertEqual(writes, 0)
        }
    }

    func testDelayedFeedbackRereadsWithoutReplacingNewerContentOrSelection() async throws {
        let pending = PendingMemoryMutation()
        var reads = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { force, since in
                reads += 1
                if reads > 1 { XCTAssertTrue(force); XCTAssertNil(since) }
                return try Self.read(cards: [Self.card(summary: reads == 1 ? "Original." : "Changed elsewhere.", votes: reads > 2 ? 4 : 0), Self.card(id: "theme-other", key: "other")], version: "v\(reads)")
            }, pendingQuestionLoader: { _ in nil }, cardActionLoader: { _, _, _ in try await pending.wait() }
        )
        _ = await vm.load()
        let item = try XCTUnwrap(vm.memory(forID: "theme-warmth"))
        vm.selection = item
        let saving = Task { try await perform(.feedback("hit"), on: vm, item: item) }
        await waitForAction(pending)
        _ = await vm.retry()
        let other = try XCTUnwrap(vm.memory(forID: "theme-other"))
        vm.selection = other
        pending.complete(.success(try Self.receipt()))
        let saved = try await saving.value
        XCTAssertEqual(saved.summary, "Changed elsewhere.")
        XCTAssertEqual(saved.qualityHitCount, 4)
        XCTAssertEqual(vm.selection, other)
        XCTAssertEqual(reads, 3)
    }

    func testFailedFeedbackReconciliationPreservesNewerCard() async throws {
        let pending = PendingMemoryMutation()
        var reads = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
                reads += 1
                if reads == 3 { throw URLError(.notConnectedToInternet) }
                return try Self.read(cards: [Self.card(summary: reads == 1 ? "Original." : "Newer.")])
            }, pendingQuestionLoader: { _ in nil }, cardActionLoader: { _, _, _ in try await pending.wait() }
        )
        _ = await vm.load()
        let item = try XCTUnwrap(vm.memory(forID: "theme-warmth"))
        let saving = Task { try await perform(.feedback("hit"), on: vm, item: item) }
        await waitForAction(pending)
        _ = await vm.retry()
        pending.complete(.success(try Self.receipt()))
        do { _ = try await saving.value; XCTFail("Reconciliation must succeed before confirmation.") }
        catch MemoryCardActionError.unconfirmed {}
        XCTAssertEqual(vm.memory(forID: item.id)?.summary, "Newer.")
        XCTAssertNil(vm.actionNotice)
    }

    func testPromotionCannotSucceedWithOnlyAnUnrelatedMatchingTitle() async throws {
        var reads = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
                reads += 1
                return try Self.read(cards: reads == 1 ? [Self.card(history: true)] : [Self.card(id: "theme-other", key: "other")])
            }, pendingQuestionLoader: { _ in nil }, cardActionLoader: { _, _, _ in try Self.receipt(action: .promote) }
        )
        _ = await vm.load()
        let item = try XCTUnwrap(vm.memory(forID: "history-turn-1"))
        do { _ = try await perform(.promote, on: vm, item: item); XCTFail("A title match cannot confirm promotion.") }
        catch MemoryCardActionError.unavailable {}
        XCTAssertNil(vm.actionNotice)
        XCTAssertNil(vm.memory(forID: "theme-warmth"))
    }

    func testPromotionKeepsSourceConversationAndSelectsTheFreshSavedMemory() async throws {
        var reads = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
                reads += 1
                let history = Self.card(history: true, overrides: ["source": " history "])
                return try Self.read(cards: reads == 1 ? [history] : [history, Self.card(summary: "Fresh saved memory.")])
            }, pendingQuestionLoader: { _ in nil }, cardActionLoader: { _, _, _ in try Self.receipt(action: .promote) }
        )
        _ = await vm.load()
        let item = try XCTUnwrap(vm.memory(forID: "history-turn-1"))
        vm.selection = item
        let saved = try await perform(.promote, on: vm, item: item)
        XCTAssertEqual(saved.summary, "Fresh saved memory.")
        XCTAssertEqual(vm.selection, saved)
        XCTAssertEqual(vm.memory(forID: item.id), item)
        XCTAssertEqual(vm.actionNotice, "Saved as a memory.")
    }

    func testPromotionReadFailureKeepsSourceWithoutClaimingItWasSaved() async throws {
        var reads = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
                reads += 1
                if reads > 1 { throw URLError(.notConnectedToInternet) }
                return try Self.read(cards: [Self.card(history: true)])
            }, pendingQuestionLoader: { _ in nil }, cardActionLoader: { _, _, _ in try Self.receipt(action: .promote) }
        )
        _ = await vm.load()
        let item = try XCTUnwrap(vm.memory(forID: "history-turn-1"))
        vm.selection = item
        do { _ = try await perform(.promote, on: vm, item: item); XCTFail("An unread saved result is unconfirmed.") }
        catch MemoryCardActionError.unconfirmed {}
        XCTAssertEqual(vm.selection, item)
        XCTAssertEqual(vm.memory(forID: item.id), item)
        XCTAssertNil(vm.actionNotice)
        XCTAssertNotNil(vm.refreshError)
    }

    func testConflictRefreshesButCannotRetryWithOldCard() async throws {
        var reads = 0
        var writes = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
                reads += 1
                return try Self.read(cards: [Self.card(summary: reads == 1 ? "Original." : "Changed elsewhere.")])
            }, pendingQuestionLoader: { _ in nil }, cardActionLoader: { _, _, _ in
                writes += 1
                throw BackendMemoryAPIError.server(status: 409, message: "stale_memory_state_version")
            }
        )
        _ = await vm.load()
        let item = try XCTUnwrap(vm.memory(forID: "theme-warmth"))
        for _ in 0..<2 {
            do { _ = try await perform(.feedback("hit"), on: vm, item: item); XCTFail("Stale actions require review.") }
            catch MemoryCardActionError.changed {}
        }
        XCTAssertEqual(writes, 1)
        XCTAssertEqual(vm.memory(forID: item.id)?.summary, "Changed elsewhere.")
    }

    func testCardActionFixtureReplacesInjectedWriteTransport() async throws {
        var writes = 0
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), cardActionLoader: { _, _, _ in
            writes += 1
            return try Self.receipt()
        })
        XCTAssertTrue(vm.installMemoriesUITestFixtureIfNeeded(arguments: ["--ui-testing", "--ui-memories-fixture", "--ui-memories-card-actions-fixture"]))
        let item = try XCTUnwrap(vm.memory(forID: "theme-lighthouse"))
        do { _ = try await perform(.feedback("hit"), on: vm, item: item); XCTFail("A read fixture cannot send writes.") }
        catch let error as URLError { XCTAssertEqual(error.code, .notConnectedToInternet) }
        XCTAssertEqual(writes, 0)
    }

    private func perform(_ action: MemoryCardAction, on vm: MemoriesViewModel, item: MemoryItem) async throws -> MemoryItem {
        switch action {
        case .feedback(let signal): return try await vm.markMemoryQuality(itemID: item.id, key: item.key, signal: signal, expectedItem: item)
        case .promote: return try await vm.promoteMemory(itemID: item.id, key: item.key, title: item.title, summary: item.summary, reason: item.reason, expectedItem: item)
        }
    }

    private func waitForAction(_ pending: PendingMemoryMutation) async {
        for _ in 0..<100 where !pending.isWaiting { await Task.yield() }
        XCTAssertTrue(pending.isWaiting)
    }

    private func makeAPI(log: MemoryMutationRequestLog, action: MemoryCardAction = .feedback("hit")) -> (BackendMemoryAPI, URLSession) {
        MemoryMutationURLProtocol.handler = { request in
            log.append(request)
            switch request.url?.path {
            case "/session": return try Self.data(["client_token": "card-action-fixture", "expires_in": 3600, "remembered_names": []])
            case "/memories": return try Self.data(["source": "test", "sourceIp": "", "stateVersion": "v9", "memories": [], "conversationSamples": []])
            case "/memories/feedback", "/memories/promote": return try Self.receiptData(action: action)
            default: throw URLError(.unsupportedURL)
            }
        }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MemoryMutationURLProtocol.self]
        let session = URLSession(configuration: config)
        return (BackendMemoryAPI(session: session, baseURL: URL(string: "https://memory-mutation.test")!), session)
    }

    nonisolated private static func card(id: String = "theme-warmth", key: String = "warmth", history: Bool = false, summary: String = "Original.", votes: Int = 0, overrides: [String: Any] = [:]) -> [String: Any] {
        var row: [String: Any] = [
            "id": history ? "history-turn-1" : id, "key": key, "title": "The promise", "summary": summary,
            "reason": "A recurring image.", "emotionalTone": "hopeful", "salience": 0.7, "confidence": 0.8,
            "rememberedAt": 1, "snippets": [], "referenceHint": "", "source": history ? "history" : "theme",
            "editable": !history, "qualityHitCount": votes,
        ]
        row.merge(overrides) { _, new in new }
        return row
    }

    nonisolated private static func read(cards: [[String: Any]]? = nil, version: String = "v1") throws -> BackendReadResult<BackendMemoriesResponse> {
        let body: [String: Any] = ["source": "test", "sourceIp": "", "stateVersion": version, "memories": cards ?? [card()], "conversationSamples": []]
        return BackendReadResult(payload: try JSONDecoder().decode(BackendMemoriesResponse.self, from: data(body)), sync: .empty, notModified: false)
    }

    nonisolated private static func receiptData(action: MemoryCardAction = .feedback("hit"), overrides: [String: Any] = [:]) throws -> Data {
        var body: [String: Any] = [
            "ok": true, "action": action == .promote ? "promote" : "feedback", "status": action == .promote ? "promoted_created" : "hit",
            "stateVersion": "v2", "themeKey": "warmth", "memoryCard": card(votes: 1),
        ]
        body.merge(overrides) { _, new in new }
        return try data(body)
    }

    nonisolated private static func receipt(action: MemoryCardAction = .feedback("hit"), overrides: [String: Any] = [:], sync: BackendSyncState = .empty) throws -> BackendReadResult<BackendMemoryMutationResponse> {
        BackendReadResult(payload: try JSONDecoder().decode(BackendMemoryMutationResponse.self, from: receiptData(action: action, overrides: overrides)), sync: sync, notModified: false)
    }

    nonisolated private static func data(_ body: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: body) }
}

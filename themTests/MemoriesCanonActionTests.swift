import XCTest
@testable import them

@MainActor
final class MemoriesCanonActionTests: XCTestCase {
    override func tearDown() {
        MemoryMutationURLProtocol.handler = nil
        super.tearDown()
    }

    func testUndoPinsReviewedCreativeRevisionDespiteNewerGlobalRead() async throws {
        try await assertPinnedAction(resolving: false)
    }

    func testResolutionPinsReviewedCreativeRevisionDespiteNewerGlobalRead() async throws {
        try await assertPinnedAction(resolving: true)
    }

    private func assertPinnedAction(resolving: Bool) async throws {
        let log = MemoryMutationRequestLog()
        let (api, session) = makeAPI(log: log, resolving: resolving)
        defer { session.invalidateAndCancel() }
        _ = try await api.fetchMemories(limit: 1, force: true)
        var reads = 0
        let vm = MemoriesViewModel(
            api: api, notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
                reads += 1
                return try Self.read(resolving: resolving, completed: reads > 1)
            }, pendingQuestionLoader: { _ in nil }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(items(vm).first)
        vm.selection = original
        _ = try await api.fetchMemories(limit: 1, force: true)
        try await perform(on: vm, original: original)
        let request = try XCTUnwrap(log.requests.first { $0.url?.path == (resolving ? "/memories/corrections/resolve" : "/memories/corrections/undo") })
        let body = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as? [String: Any])
        XCTAssertEqual(body["expected_creative_memory_revision"] as? String, "cm1")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Creative-Memory-Revision"), "cm1")
        XCTAssertEqual(reads, 2)
        XCTAssertNil(vm.selection)
        XCTAssertNotNil(vm.actionNotice)
        XCTAssertEqual(items(vm).first?.correctionReceipt?.status, resolving ? "active" : "undone")
    }

    func testExplicitBlankAPIRevisionsRejectAllCanonOverloadsBeforeTransport() async throws {
        let log = MemoryMutationRequestLog()
        let (api, session) = makeAPI(log: log)
        defer { session.invalidateAndCancel() }
        for revision in ["", " \n"] {
            do { _ = try await api.undoCanonCorrection(receiptID: "receipt", expectedCreativeMemoryRevision: revision); XCTFail("An explicit blank revision cannot bootstrap a write.") }
            catch BackendMemoryAPIError.invalidResponse {}
            do { _ = try await api.resolveCanonCorrection(ambiguityID: "choice", selectedFacts: Self.facts, expectedCreativeMemoryRevision: revision); XCTFail("An explicit blank revision cannot bootstrap a write.") }
            catch BackendMemoryAPIError.invalidResponse {}
            do { _ = try await api.resolveCanonCorrection(ambiguityID: "choice", selectedFact: Self.facts[0], expectedCreativeMemoryRevision: revision); XCTFail("The legacy overload must preserve the pinned revision.") }
            catch BackendMemoryAPIError.invalidResponse {}
        }
        XCTAssertTrue(log.requests.isEmpty)
    }

    func testMissingDisplayedRevisionCannotUseMutationLoader() async throws {
        for resolving in [false, true] {
            var writes = 0
            let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
                try Self.read(resolving: resolving, version: "")
            }, pendingQuestionLoader: { _ in nil }, canonActionLoader: { _, _ in
                writes += 1
                return try Self.response(resolving: resolving)
            })
            _ = await vm.load()
            do { try await perform(on: vm, original: XCTUnwrap(items(vm).first)); XCTFail("Only displayed revisions authorize canon changes.") }
            catch MemoryCanonActionError.unconfirmed {}
            XCTAssertEqual(writes, 0)
        }
    }

    func testUndoRejectsWrongSuccessStatusIdentityAndProjectReceipts() async throws {
        try await assertRejected(resolving: false, overrides: [
            ["ok": false], ["action": "resolve_correction"], ["status": "active"], ["correctionReceipt": NSNull()],
            ["correctionReceipt": Self.receipt(status: "active")], ["correctionReceipt": Self.receipt(id: "wrong", status: "undone")],
            ["correctionReceipt": Self.receipt(status: "undone", project: "another-project")],
            ["correctionReceipt": Self.receipt(status: "undone", matched: ["An unrelated fact."])],
        ])
    }

    func testResolutionRejectsWrongReceiptAmbiguityOrFacts() async throws {
        try await assertRejected(resolving: true, overrides: [
            ["ok": false], ["action": "undo_correction"], ["status": "pending"], ["correctionAmbiguity": NSNull()],
            ["correctionReceipt": Self.receipt(id: "unrelated")], ["correctionReceipt": Self.receipt(status: "undone")],
            ["correctionReceipt": Self.receipt(project: "another-project")],
            ["correctionReceipt": Self.receipt(matched: ["An unselected fact."])],
            ["correctionAmbiguity": Self.ambiguity(id: "wrong", resolved: true)],
            ["correctionAmbiguity": Self.ambiguity(resolved: true, selected: [Self.facts[0]])],
        ])
    }

    private func assertRejected(resolving: Bool, overrides: [[String: Any]]) async throws {
        for override in overrides {
            let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in try Self.read(resolving: resolving) }, pendingQuestionLoader: { _ in nil }, canonActionLoader: { _, _ in try Self.response(resolving: resolving, overrides: override) })
            _ = await vm.load()
            let original = try XCTUnwrap(items(vm).first)
            vm.selection = original
            do { try await perform(on: vm, original: original); XCTFail("An unrelated or malformed response cannot confirm a canon mutation.") }
            catch MemoryCanonActionError.unconfirmed {}
            XCTAssertEqual(vm.selection, original)
            XCTAssertEqual(items(vm).first, original)
            XCTAssertNil(vm.actionNotice)
        }
    }

    func testResolutionRejectsEmptyDuplicateAndUnreviewedFactsBeforeWriting() async throws {
        var writes = 0
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in try Self.read(resolving: true) }, pendingQuestionLoader: { _ in nil }, canonActionLoader: { _, _ in writes += 1; return try Self.response(resolving: true) })
        _ = await vm.load()
        let ambiguity = try XCTUnwrap(items(vm).first?.correctionAmbiguity)
        for facts in [[], [Self.facts[0], Self.facts[0]], ["Unknown fact."], [Self.facts[0], "Unknown fact."]] {
            do { try await vm.resolveCanonCorrection(ambiguityID: ambiguity.id, selectedFacts: facts, expectedAmbiguity: ambiguity); XCTFail("Every selected fact must belong to the reviewed choice.") }
            catch MemoryCanonActionError.invalidSelection {}
        }
        XCTAssertEqual(writes, 0)
    }

    func testChangedAndRemovedCorrectionCannotBeReused() async throws {
        for resolving in [false, true] {
            var reads = 0
            var writes = 0
            let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
                reads += 1
                return try Self.read(resolving: resolving, text: reads == 1 ? Self.correction : "A changed correction.")
            }, pendingQuestionLoader: { _ in nil }, canonActionLoader: { _, _ in writes += 1; return try Self.response(resolving: resolving) })
            _ = await vm.load()
            let original = try XCTUnwrap(items(vm).first)
            _ = await vm.retry()
            do { try await perform(on: vm, original: original); XCTFail("The original correction must match the current list.") }
            catch MemoryCanonActionError.changed {}
            vm.state = .empty
            do { try await perform(on: vm, original: original); XCTFail("A removed correction cannot be changed.") }
            catch MemoryCanonActionError.unavailable {}
            XCTAssertEqual(writes, 0)
        }
    }

    func testConflictRefreshesWithoutDiscardingSelectionOrAuthorizingOldChoice() async throws {
        var reads = 0
        var writes = 0
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
            reads += 1
            return try Self.read(resolving: true, text: reads == 1 ? Self.correction : "A changed correction.")
        }, pendingQuestionLoader: { _ in nil }, canonActionLoader: { _, _ in
            writes += 1
            throw BackendMemoryAPIError.server(status: 409, message: "accepted_canon_fact_not_found")
        })
        _ = await vm.load()
        let original = try XCTUnwrap(items(vm).first)
        vm.selection = original
        for _ in 0..<2 {
            do { try await perform(on: vm, original: original); XCTFail("The old choice cannot override newer canon.") }
            catch MemoryCanonActionError.changed {}
        }
        XCTAssertEqual(writes, 1)
        XCTAssertEqual(vm.selection, original)
        XCTAssertEqual(items(vm).first?.summary, "A changed correction.")
    }

    func testReconciliationFailureKeepsChoicesAndDoesNotConfirmSuccess() async throws {
        for resolving in [false, true] {
            var reads = 0
            let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
                reads += 1
                if reads > 1 { throw URLError(.notConnectedToInternet) }
                return try Self.read(resolving: resolving)
            }, pendingQuestionLoader: { _ in nil }, canonActionLoader: { _, _ in try Self.response(resolving: resolving) })
            _ = await vm.load()
            let original = try XCTUnwrap(items(vm).first)
            vm.selection = original
            do { try await perform(on: vm, original: original); XCTFail("The full read must confirm the saved canon.") }
            catch MemoryCanonActionError.unconfirmed {}
            XCTAssertEqual(vm.selection, original)
            XCTAssertEqual(items(vm).first, original)
            XCTAssertNil(vm.actionNotice)
        }
    }

    func testNewerCorrectionConflictExplainsWhichUndoMustHappenFirst() async throws {
        var reads = 0
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
            reads += 1
            return try Self.read()
        }, pendingQuestionLoader: { _ in nil }, canonActionLoader: { _, _ in
            throw BackendMemoryAPIError.server(status: 409, message: "Undo the newer correction for this project first.")
        })
        _ = await vm.load()
        let original = try XCTUnwrap(items(vm).first)
        vm.selection = original
        do { try await perform(on: vm, original: original); XCTFail("Undo must respect the project's correction order.") }
        catch MemoryCanonActionError.newerCorrection {}
        XCTAssertEqual(reads, 2)
        XCTAssertEqual(vm.selection, original)
        XCTAssertNil(vm.actionNotice)
    }

    func testFreshReadMissingTheExpectedReceiptKeepsOriginalDetailAvailable() async throws {
        var reads = 0
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
            reads += 1
            return try Self.read(resolving: true, cards: reads == 1 ? nil : [])
        }, pendingQuestionLoader: { _ in nil }, canonActionLoader: { _, _ in try Self.response(resolving: true) })
        _ = await vm.load()
        let original = try XCTUnwrap(items(vm).first)
        vm.selection = original
        do { try await perform(on: vm, original: original); XCTFail("An empty list is not proof that the chosen correction was applied.") }
        catch MemoryCanonActionError.changed {}
        XCTAssertEqual(vm.selection, original, "Keep the original detail so its failure and choices remain visible.")
        XCTAssertNil(vm.actionNotice)
    }

    func testDelayedUndoCannotReplaceNewerCanonOrHijackAnotherSelection() async throws {
        let pending = PendingMemoryMutation()
        var reads = 0
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
            reads += 1
            return try Self.read(text: reads == 1 ? Self.correction : "Newer canon.")
        }, pendingQuestionLoader: { _ in nil }, canonActionLoader: { _, _ in try await pending.wait() })
        _ = await vm.load()
        let original = try XCTUnwrap(items(vm).first)
        vm.selection = original
        let undoing = Task { try await perform(on: vm, original: original) }
        await waitForAction(pending)
        _ = await vm.retry()
        vm.selection = nil
        pending.complete(.success(try Self.response()))
        do { try await undoing.value; XCTFail("A late undo acknowledgment cannot replace the later full read.") }
        catch MemoryCanonActionError.changed {}
        XCTAssertEqual(items(vm).first?.summary, "Newer canon.")
        XCTAssertNil(vm.selection)
        XCTAssertNil(vm.actionNotice)
        XCTAssertEqual(reads, 3)
    }

    func testPendingCanonActionBlocksDuplicateAndOtherMemoryMutations() async throws {
        let pending = PendingMemoryMutation()
        var writes = 0
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in try Self.read() }, pendingQuestionLoader: { _ in nil }, canonActionLoader: { _, _ in writes += 1; return try await pending.wait() })
        _ = await vm.load()
        let original = try XCTUnwrap(items(vm).first)
        let undoing = Task { try await perform(on: vm, original: original) }
        await waitForAction(pending)
        do { try await perform(on: vm, original: original); XCTFail("Duplicate undo must be blocked.") }
        catch MemoryCanonActionError.inProgress {}
        do { try await vm.forgetMemory(itemID: original.id, key: original.key); XCTFail("Forget must wait.") }
        catch MemoryForgetError.inProgress {}
        do { _ = try await vm.updateMemory(itemID: original.id, key: original.key, title: "A", summary: "B", reason: "C"); XCTFail("Correction must wait.") }
        catch MemoriesViewModel.MemoryEditConflict.inProgress {}
        pending.complete(.failure(URLError(.notConnectedToInternet)))
        do { try await undoing.value; XCTFail("Fixture failed offline.") } catch is URLError {}
        XCTAssertEqual(writes, 1)
    }

    func testConfirmedIdempotentCanonReceiptsStillRequireAFullRead() async throws {
        for resolving in [false, true] {
            var reads = 0
            let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
                reads += 1
                return try Self.read(resolving: resolving, completed: reads > 1)
            }, pendingQuestionLoader: { _ in nil }, canonActionLoader: { _, _ in
                try Self.response(resolving: resolving, overrides: ["status": resolving ? "already_resolved" : "already_undone"])
            })
            _ = await vm.load()
            try await perform(on: vm, original: XCTUnwrap(items(vm).first))
            XCTAssertEqual(reads, 2)
            XCTAssertNotNil(vm.actionNotice)
        }
    }

    func testCanonFixtureReplacesInjectedMutationTransport() async throws {
        var writes = 0
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), canonActionLoader: { _, _ in writes += 1; return try Self.response() })
        XCTAssertTrue(vm.installMemoriesUITestFixtureIfNeeded(arguments: ["--ui-testing", "--ui-memories-fixture", "--ui-memories-canon-fixture"]))
        let ambiguity = try XCTUnwrap(items(vm).first?.correctionAmbiguity)
        do {
            try await vm.resolveCanonCorrection(ambiguityID: ambiguity.id, selectedFacts: ambiguity.candidateFacts, expectedAmbiguity: ambiguity)
            XCTFail("The fixture must replace injected transport with its local offline failure.")
        } catch let error as URLError { XCTAssertEqual(error.code, .notConnectedToInternet) }
        XCTAssertEqual(writes, 0)
    }

    private func perform(on vm: MemoriesViewModel, original: MemoryItem) async throws {
        if let ambiguity = original.correctionAmbiguity {
            try await vm.resolveCanonCorrection(ambiguityID: ambiguity.id, selectedFacts: Self.facts, expectedAmbiguity: ambiguity)
        } else {
            let receipt = try XCTUnwrap(original.correctionReceipt)
            try await vm.undoCanonCorrection(receiptID: receipt.id, expectedReceipt: receipt)
        }
    }

    private func items(_ vm: MemoriesViewModel) -> [MemoryItem] {
        if case .loaded(let items) = vm.state { return items }
        return []
    }

    private func waitForAction(_ pending: PendingMemoryMutation) async {
        for _ in 0..<100 where !pending.isWaiting { await Task.yield() }
        XCTAssertTrue(pending.isWaiting)
    }

    private func makeAPI(log: MemoryMutationRequestLog, resolving: Bool = false) -> (BackendMemoryAPI, URLSession) {
        MemoryMutationURLProtocol.handler = { request in
            log.append(request)
            switch request.url?.path {
            case "/session": return try Self.data(["client_token": "canon-fixture", "expires_in": 3600, "remembered_names": []])
            case "/memories": return try Self.data(["source": "test", "sourceIp": "", "stateVersion": "v9", "creativeMemoryRevision": "cm9", "memories": [], "conversationSamples": []])
            case "/memories/corrections/undo", "/memories/corrections/resolve": return try Self.responseData(resolving: resolving)
            default: throw URLError(.unsupportedURL)
            }
        }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MemoryMutationURLProtocol.self]
        let session = URLSession(configuration: config)
        return (BackendMemoryAPI(session: session, baseURL: URL(string: "https://memory-mutation.test")!), session)
    }

    nonisolated private static var facts: [String] { ["Mara left June at the dock.", "Mara left Eli at the dock."] }
    nonisolated private static var correction: String { "Mara returns for both of them." }

    nonisolated private static func receipt(id: String = "receipt", status: String = "active", project: String = "project-a", matched: [String]? = nil, text: String = correction) -> [String: Any] {
        ["id": id, "status": status, "projectId": project, "projectTitle": "The Crossing", "correctionText": text, "matchedFacts": matched ?? facts, "replacementFacts": [correction], "createdAt": 1]
    }

    nonisolated private static func ambiguity(id: String = "choice", resolved: Bool = false, selected: [String]? = nil, text: String = correction) -> [String: Any] {
        ["id": id, "status": resolved ? "resolved" : "pending", "projectId": "project-a", "projectTitle": "The Crossing", "correctionText": text, "candidateFacts": facts, "selectedFacts": resolved ? (selected ?? facts) : [], "receiptId": resolved ? "receipt" : "", "createdAt": 1]
    }

    nonisolated private static func card(resolving: Bool, completed: Bool, text: String) -> [String: Any] {
        let choice = resolving && !completed
        var row: [String: Any] = [
            "id": choice ? "correction-choice-choice" : "correction-receipt", "key": choice ? "correction-ambiguity:choice" : "correction:receipt",
            "title": "The Crossing canon", "summary": text, "reason": "A writer correction.", "emotionalTone": "hopeful",
            "salience": 0.7, "confidence": 0.8, "rememberedAt": 1, "snippets": [], "referenceHint": "", "source": "canon_correction",
            "editable": false, "isCorrectionMemory": true,
        ]
        if choice { row["correctionAmbiguity"] = ambiguity(text: text) }
        else { row["correctionReceipt"] = receipt(status: completed && !resolving ? "undone" : "active", text: text) }
        return row
    }

    nonisolated private static func read(resolving: Bool = false, completed: Bool = false, version: String = "cm1", text: String = correction, cards: [[String: Any]]? = nil) throws -> BackendReadResult<BackendMemoriesResponse> {
        let body: [String: Any] = ["source": "test", "sourceIp": "", "stateVersion": "v1", "creativeMemoryRevision": version, "memories": cards ?? [card(resolving: resolving, completed: completed, text: text)], "conversationSamples": []]
        return BackendReadResult(payload: try JSONDecoder().decode(BackendMemoriesResponse.self, from: data(body)), sync: .empty, notModified: false)
    }

    nonisolated private static func responseData(resolving: Bool = false, overrides: [String: Any] = [:]) throws -> Data {
        var body: [String: Any] = ["ok": true, "action": resolving ? "resolve_correction" : "undo_correction", "status": resolving ? "resolved" : "undone", "creativeMemoryRevision": "cm2", "correctionReceipt": receipt(status: resolving ? "active" : "undone")]
        if resolving { body["correctionAmbiguity"] = ambiguity(resolved: true) }
        body.merge(overrides) { _, new in new }
        return try data(body)
    }

    nonisolated private static func response(resolving: Bool = false, overrides: [String: Any] = [:]) throws -> BackendReadResult<BackendMemoryMutationResponse> {
        BackendReadResult(payload: try JSONDecoder().decode(BackendMemoryMutationResponse.self, from: responseData(resolving: resolving, overrides: overrides)), sync: .empty, notModified: false)
    }

    nonisolated private static func data(_ body: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: body) }
}

import XCTest
@testable import them

@MainActor
final class MemoriesCorrectionTests: XCTestCase {
    override func tearDown() {
        CorrectionURLProtocol.handler = nil
        super.tearDown()
    }

    func testThemeSavePinsDisplayedStateDespiteNewerGlobalRead() async throws {
        try await assertPinnedSave(character: false)
    }

    func testCharacterBibleSavePinsDisplayedCreativeRevisionDespiteNewerGlobalRead() async throws {
        try await assertPinnedSave(character: true)
    }

    private func assertPinnedSave(character: Bool) async throws {
        let recorder = CorrectionRequestLog()
        let (api, session) = makeAPI(recorder: recorder, character: character)
        defer { session.invalidateAndCancel() }
        let global = try await api.fetchMemories(limit: 1, force: true)
        let vm = MemoriesViewModel(
            api: api, notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in try Self.read(character: character, sync: global.sync) },
            pendingQuestionLoader: { _ in nil }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(vm.memory(forID: character ? "character-mara" : "theme-a"))
        _ = try await api.fetchMemories(limit: 1, force: true)
        let updated = try await save(vm, original)
        let request = try XCTUnwrap(recorder.snapshot.first { $0.url?.path == (character ? "/memories/character-bible/update" : "/memories/update") })
        let body = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as? [String: Any])
        if character {
            XCTAssertEqual(body["expected_creative_memory_revision"] as? String, "cm1")
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-Creative-Memory-Revision"), "cm1")
            XCTAssertNotNil(body["character_bible"])
        } else {
            XCTAssertEqual(body["expected_state_version"] as? String, "v1")
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-State-Version"), "v1")
        }
        XCTAssertEqual(updated.summary, "The confirmed correction.")
        XCTAssertEqual(vm.memory(forID: original.id), updated)
    }

    func testConsecutiveCorrectionsUseOnlyTheMatchingReceiptsRevision() async throws {
        for character in [false, true] {
            var revisions: [(String, String)] = []
            let vm = MemoriesViewModel(
                notificationCenter: NotificationCenter(),
                memoriesLoader: { _, _ in try Self.read(character: character) }, pendingQuestionLoader: { _ in nil },
                correctionLoader: { _, state, creative in
                    revisions.append((state, creative))
                    return try Self.receipt(character: character)
                }
            )
            _ = await vm.load()
            let original = try XCTUnwrap(vm.memory(forID: character ? "character-mara" : "theme-a"))
            let corrected = try await save(vm, original)
            _ = try await save(vm, corrected)
            XCTAssertEqual(revisions.count, 2)
            XCTAssertEqual(revisions[0].0, "v1")
            XCTAssertEqual(revisions[0].1, "cm1")
            XCTAssertEqual(revisions[1].0, character ? "v1" : "v2")
            XCTAssertEqual(revisions[1].1, character ? "cm2" : "cm1")
        }
    }

    func testConfirmedCorrectionDoesNotAdvanceAnUnreviewedCardsRevision() async throws {
        var revisions: [String] = []
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                let body: [String: Any] = [
                    "source": "test", "sourceIp": "", "stateVersion": "v1", "creativeMemoryRevision": "cm1",
                    "memories": [Self.card(), Self.card(id: "theme-b", key: "theme-b")], "conversationSamples": [],
                ]
                return BackendReadResult(payload: try JSONDecoder().decode(BackendMemoriesResponse.self, from: Self.data(body)), sync: .empty, notModified: false)
            }, pendingQuestionLoader: { _ in nil },
            correctionLoader: { edited, state, _ in
                revisions.append(state)
                return try Self.receipt(overrides: ["memoryCard": Self.card(id: edited.id, key: edited.key, summary: edited.summary)])
            }
        )
        _ = await vm.load()
        let first = try XCTUnwrap(vm.memory(forID: "theme-a"))
        let other = try XCTUnwrap(vm.memory(forID: "theme-b"))
        _ = try await save(vm, first)
        _ = try await save(vm, other)
        XCTAssertEqual(revisions, ["v1", "v1"])
    }

    func testAppliedReadReplacesPerCardCorrectionRevision() async throws {
        var reads = 0
        var revisions: [String] = []
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                reads += 1
                return try Self.read(stateVersion: reads == 1 ? "v1" : "v3")
            }, pendingQuestionLoader: { _ in nil },
            correctionLoader: { _, state, _ in revisions.append(state); return try Self.receipt() }
        )
        _ = await vm.load()
        _ = try await save(vm, XCTUnwrap(vm.memory(forID: "theme-a")))
        _ = await vm.retry()
        _ = try await save(vm, XCTUnwrap(vm.memory(forID: "theme-a")))
        XCTAssertEqual(revisions, ["v1", "v3"])
    }

    func testReadOnlyFixtureCannotUseInjectedCorrectionTransport() async throws {
        var writes = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            correctionLoader: { _, _, _ in writes += 1; return try Self.receipt() }
        )
        XCTAssertTrue(vm.installMemoriesUITestFixtureIfNeeded(arguments: [
            "--ui-testing", "--ui-memories-fixture", "--ui-memories-editable-fixture",
        ]))
        let original = try XCTUnwrap(vm.memory(forID: "ui-lighthouse"))
        do {
            _ = try await save(vm, original)
            XCTFail("Read fixtures must replace all mutation transports with local failures.")
        } catch {
            XCTAssertEqual((error as? URLError)?.code, .notConnectedToInternet)
        }
        XCTAssertEqual(writes, 0)
        XCTAssertEqual(vm.memory(forID: original.id), original)
    }

    func testExplicitBlankCorrectionRevisionsFailBeforeBootstrapOrTransport() async throws {
        let recorder = CorrectionRequestLog()
        let (api, session) = makeAPI(recorder: recorder)
        defer { session.invalidateAndCancel() }
        do {
            _ = try await api.updateMemoryCard(id: "theme-a", title: "A", summary: "B", reason: "C", expectedStateVersion: " \n ")
            XCTFail("Blank explicit state must not fall back to global sync.")
        } catch BackendMemoryAPIError.invalidResponse {}
        do {
            _ = try await api.updateCharacterBibleMemory(id: "character-mara", characterBible: Self.bible, expectedCreativeMemoryRevision: "\t")
            XCTFail("Blank explicit creative revision must not fall back to global sync.")
        } catch BackendMemoryAPIError.invalidResponse {}
        XCTAssertTrue(recorder.snapshot.isEmpty)
    }

    func testMissingDisplayedRevisionNeverSendsEitherCorrection() async throws {
        for character in [false, true] {
            let recorder = CorrectionRequestLog()
            let (api, session) = makeAPI(recorder: recorder, character: character)
            defer { session.invalidateAndCancel() }
            let vm = MemoriesViewModel(
                api: api, notificationCenter: NotificationCenter(),
                memoriesLoader: { _, _ in try Self.read(character: character, includeRevisions: false) },
                pendingQuestionLoader: { _ in nil }
            )
            _ = await vm.load()
            let original = try XCTUnwrap(vm.memory(forID: character ? "character-mara" : "theme-a"))
            do {
                _ = try await save(vm, original)
                XCTFail("A missing displayed baseline cannot authorize a correction.")
            } catch MemoriesViewModel.MemoryEditConflict.needsRefresh {}
            XCTAssertTrue(recorder.snapshot.isEmpty)
            XCTAssertEqual(vm.memory(forID: original.id), original)
        }
    }

    func testInvalidCorrectionReceiptsNeverReplaceTheMemory() async throws {
        let variations: [[String: Any]] = [
            ["ok": false], ["action": "forget"], ["status": "pending"],
            ["memoryCard": NSNull()], ["memoryCard": Self.card(id: "other", key: "theme-a")],
            ["memoryCard": Self.card(id: "theme-a", key: "other")],
        ]
        for variation in variations {
            let vm = MemoriesViewModel(
                notificationCenter: NotificationCenter(),
                memoriesLoader: { _, _ in try Self.read() }, pendingQuestionLoader: { _ in nil },
                correctionLoader: { _, _, _ in try Self.receipt(overrides: variation) }
            )
            _ = await vm.load()
            let original = try XCTUnwrap(vm.memory(forID: "theme-a"))
            vm.selection = original
            do {
                _ = try await save(vm, original)
                XCTFail("An invalid receipt must keep the editor draft unconfirmed.")
            } catch MemoriesViewModel.MemoryEditConflict.invalidReceipt {}
            XCTAssertEqual(vm.memory(forID: original.id), original)
            XCTAssertEqual(vm.selection, original)
        }
    }

    func testCharacterRecordedReceiptIsAcceptedButThemeRecordedReceiptIsNot() async throws {
        for character in [true, false] {
            let vm = MemoriesViewModel(
                notificationCenter: NotificationCenter(),
                memoriesLoader: { _, _ in try Self.read(character: character) }, pendingQuestionLoader: { _ in nil },
                correctionLoader: { _, _, _ in try Self.receipt(character: character, overrides: ["status": "recorded"]) }
            )
            _ = await vm.load()
            let original = try XCTUnwrap(vm.memory(forID: character ? "character-mara" : "theme-a"))
            do {
                _ = try await save(vm, original)
                XCTAssertTrue(character)
            } catch MemoriesViewModel.MemoryEditConflict.invalidReceipt {
                XCTAssertFalse(character)
            }
        }
    }

    func testPendingCorrectionPreservesMemoryBlocksDuplicateAndForgetThenCanRetryFailure() async throws {
        let pending = PendingCorrection()
        var writes = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in try Self.read() }, pendingQuestionLoader: { _ in nil },
            correctionLoader: { _, _, _ in
                writes += 1
                if writes == 1 { return try await pending.wait() }
                return try Self.receipt()
            }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(vm.memory(forID: "theme-a"))
        let task = Task { try await save(vm, original) }
        for _ in 0..<100 where !pending.isWaiting { await Task.yield() }
        XCTAssertTrue(pending.isWaiting)
        XCTAssertEqual(vm.memory(forID: original.id), original)
        do {
            _ = try await save(vm, original)
            XCTFail("A second Save must not dispatch.")
        } catch MemoriesViewModel.MemoryEditConflict.inProgress {}
        do {
            try await vm.forgetMemory(itemID: original.id, key: original.key, expectedItem: original)
            XCTFail("Forget must not race a pending correction.")
        } catch MemoryForgetError.inProgress {}
        pending.complete(.failure(URLError(.timedOut)))
        do {
            _ = try await task.value
            XCTFail("A lost response is not proof of a save.")
        } catch {
            XCTAssertEqual((error as? URLError)?.code, .timedOut)
        }
        XCTAssertEqual(vm.memory(forID: original.id), original)
        _ = try await save(vm, original)
        XCTAssertEqual(writes, 2)
        XCTAssertEqual(vm.memory(forID: original.id)?.summary, "The confirmed correction.")
    }

    func testDelayedSaveReceiptCannotReplaceANewerRead() async throws {
        let pending = PendingCorrection()
        var reads = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                reads += 1
                return try Self.read(summary: reads == 1 ? "Original." : "A newer saved correction.", stateVersion: reads == 1 ? "v1" : "v3")
            }, pendingQuestionLoader: { _ in nil },
            correctionLoader: { _, _, _ in try await pending.wait() }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(vm.memory(forID: "theme-a"))
        vm.selection = original
        vm.beginEditingMemory(original)
        let saving = Task { try await save(vm, original) }
        for _ in 0..<100 where !pending.isWaiting { await Task.yield() }
        XCTAssertTrue(pending.isWaiting)
        _ = await vm.retry()
        let newer = try XCTUnwrap(vm.memory(forID: original.id))
        pending.complete(.success(try Self.receipt()))
        do {
            _ = try await saving.value
            XCTFail("A delayed receipt must not replace a newer saved snapshot.")
        } catch MemoriesViewModel.MemoryEditConflict.changed {}
        XCTAssertEqual(vm.memory(forID: original.id), newer)
        XCTAssertEqual(newer.summary, "A newer saved correction.")
        XCTAssertEqual(vm.selection, original, "Keep the editor and its draft open for review.")
    }

    func testDelayedReceiptCannotOverwriteNewSnapshotEvenWhenTextMatchesOriginal() async throws {
        let pending = PendingCorrection()
        var reads = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                reads += 1
                return try Self.read(stateVersion: reads == 1 ? "v1" : "v3")
            }, pendingQuestionLoader: { _ in nil },
            correctionLoader: { _, _, _ in try await pending.wait() }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(vm.memory(forID: "theme-a"))
        let saving = Task { try await save(vm, original) }
        for _ in 0..<100 where !pending.isWaiting { await Task.yield() }
        XCTAssertTrue(pending.isWaiting)
        _ = await vm.retry()
        pending.complete(.success(try Self.receipt()))
        do {
            _ = try await saving.value
            XCTFail("A newer snapshot can restore the original text; a delayed receipt must not overwrite it.")
        } catch MemoriesViewModel.MemoryEditConflict.changed {}
        XCTAssertEqual(reads, 3)
        XCTAssertEqual(vm.memory(forID: original.id), original)
    }

    func testSaveReconcilesAnInterveningReadAndUsesFreshRevisionForNextSave() async throws {
        let pending = PendingCorrection()
        var reads = 0
        var sentVersions: [String] = []
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                reads += 1
                return try Self.read(
                    summary: reads < 3 ? "Original." : "The confirmed correction.",
                    stateVersion: reads < 3 ? "v1" : "v4"
                )
            }, pendingQuestionLoader: { _ in nil },
            correctionLoader: { _, version, _ in
                sentVersions.append(version)
                if sentVersions.count == 1 { return try await pending.wait() }
                return try Self.receipt(overrides: ["stateVersion": "v5"])
            }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(vm.memory(forID: "theme-a"))
        let saving = Task { try await save(vm, original) }
        for _ in 0..<100 where !pending.isWaiting { await Task.yield() }
        XCTAssertTrue(pending.isWaiting)
        _ = await vm.retry()
        pending.complete(.success(try Self.receipt()))
        let updated = try await saving.value
        XCTAssertEqual(updated.summary, "The confirmed correction.")
        XCTAssertEqual(reads, 3)
        _ = try await save(vm, updated)
        XCTAssertEqual(sentVersions, ["v1", "v4"])
    }

    func testConflictRefreshesLatestCardButRequiresAReopenedBaseline() async throws {
        var reads = 0
        var writes = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                reads += 1
                return try Self.read(summary: reads == 1 ? "Original." : "Corrected elsewhere.")
            }, pendingQuestionLoader: { _ in nil },
            correctionLoader: { _, _, _ in
                writes += 1
                if writes == 1 { throw BackendMemoryAPIError.server(status: 409, message: "stale_creative_memory_revision") }
                return try Self.receipt()
            }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(vm.memory(forID: "theme-a"))
        vm.selection = original
        vm.beginEditingMemory(original)
        do {
            _ = try await save(vm, original)
            XCTFail("Conflict must leave the draft unconfirmed.")
        } catch MemoriesViewModel.MemoryEditConflict.changed {}
        let latest = try XCTUnwrap(vm.memory(forID: original.id))
        XCTAssertEqual(latest.summary, "Corrected elsewhere.")
        XCTAssertEqual(vm.selection, original)
        do {
            _ = try await save(vm, original)
            XCTFail("A stale editor cannot retry over the updated card.")
        } catch MemoriesViewModel.MemoryEditConflict.changed {}
        XCTAssertEqual(writes, 1)
        vm.endEditingMemory()
        vm.beginEditingMemory(latest)
        _ = try await save(vm, latest)
        XCTAssertEqual(writes, 2)
    }

    func testEditorCannotAuthorizeDifferentIDOrKey() async throws {
        var writes = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in try Self.read() }, pendingQuestionLoader: { _ in nil },
            correctionLoader: { _, _, _ in writes += 1; return try Self.receipt() }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(vm.memory(forID: "theme-a"))
        for (id, key) in [("other", original.key), (original.id, "other")] {
            do {
                _ = try await vm.updateMemory(itemID: id, key: key, title: "A", summary: "B", reason: "C", expectedItem: original)
                XCTFail("A correction must stay bound to its original target.")
            } catch MemoriesViewModel.MemoryEditConflict.changed {}
        }
        XCTAssertEqual(writes, 0)
    }

    private func save(_ vm: MemoriesViewModel, _ original: MemoryItem) async throws -> MemoryItem {
        try await vm.updateMemory(
            itemID: original.id, key: original.key, title: original.title,
            summary: "The confirmed correction.", reason: original.reason,
            characterBible: original.characterBible, expectedItem: original
        )
    }

    private func makeAPI(recorder: CorrectionRequestLog, character: Bool = false) -> (BackendMemoryAPI, URLSession) {
        CorrectionURLProtocol.handler = { request in
            recorder.append(request)
            switch request.url?.path {
            case "/session": return try Self.data(["client_token": "correction-fixture", "expires_in": 3600, "remembered_names": []])
            case "/memories": return try Self.data(["source": "test", "sourceIp": "", "stateVersion": "v9", "creativeMemoryRevision": "cm9", "memories": [], "conversationSamples": []])
            case "/memories/update", "/memories/character-bible/update": return try Self.receiptData(character: character)
            default: throw URLError(.unsupportedURL)
            }
        }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CorrectionURLProtocol.self]
        let session = URLSession(configuration: config)
        return (BackendMemoryAPI(session: session, baseURL: URL(string: "https://correction.test")!), session)
    }

    nonisolated private static var bible: BackendCharacterBibleMemory {
        BackendCharacterBibleMemory(character: "Mara", canon: ["Mara keeps her promise."], corrections: [], correctedTerms: [], correctionReplacements: [], arc: nil, voice: nil, tags: nil)
    }

    nonisolated private static func card(id: String = "theme-a", key: String = "theme-a", summary: String = "Original.", character: Bool = false) -> [String: Any] {
        var row: [String: Any] = [
            "id": character ? "character-mara" : id, "key": character ? "character:Mara" : key,
            "title": "The promise", "summary": summary, "reason": "A writer correction.",
            "emotionalTone": "hopeful", "salience": 0.7, "confidence": 0.8, "rememberedAt": 1,
            "snippets": [], "referenceHint": "", "source": "theme", "editable": true,
        ]
        if character {
            row["characterBible"] = ["character": "Mara", "canon": ["Mara keeps her promise."], "corrections": [], "correctedTerms": [], "correctionReplacements": []]
        }
        return row
    }

    nonisolated private static func read(character: Bool = false, summary: String = "Original.", includeRevisions: Bool = true, sync: BackendSyncState = .empty, stateVersion: String = "v1") throws -> BackendReadResult<BackendMemoriesResponse> {
        var body: [String: Any] = ["source": "test", "sourceIp": "", "memories": [card(summary: summary, character: character)], "conversationSamples": []]
        if includeRevisions { body["stateVersion"] = stateVersion; body["creativeMemoryRevision"] = "cm1" }
        return BackendReadResult(payload: try JSONDecoder().decode(BackendMemoriesResponse.self, from: data(body)), sync: sync, notModified: false)
    }

    nonisolated private static func receiptData(character: Bool = false, overrides: [String: Any] = [:]) throws -> Data {
        var body: [String: Any] = ["ok": true, "action": character ? "character_bible_update" : "update", "status": "updated", "stateVersion": "v2", "creativeMemoryRevision": "cm2", "memoryCard": card(summary: "The confirmed correction.", character: character)]
        body.merge(overrides) { _, new in new }
        return try data(body)
    }

    nonisolated private static func receipt(character: Bool = false, overrides: [String: Any] = [:]) throws -> BackendReadResult<BackendMemoryMutationResponse> {
        BackendReadResult(payload: try JSONDecoder().decode(BackendMemoryMutationResponse.self, from: receiptData(character: character, overrides: overrides)), sync: .empty, notModified: false)
    }

    nonisolated private static func data(_ body: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: body) }
}

@MainActor
private final class PendingCorrection {
    private var continuation: CheckedContinuation<BackendReadResult<BackendMemoryMutationResponse>, Error>?
    var isWaiting: Bool { continuation != nil }
    func wait() async throws -> BackendReadResult<BackendMemoryMutationResponse> {
        try await withCheckedThrowingContinuation { continuation = $0 }
    }
    func complete(_ result: Result<BackendReadResult<BackendMemoryMutationResponse>, Error>) {
        let pending = continuation
        continuation = nil
        pending?.resume(with: result)
    }
}

private final class CorrectionRequestLog: @unchecked Sendable {
    private let lock = NSLock()
    private var requests: [URLRequest] = []
    var snapshot: [URLRequest] { lock.lock(); defer { lock.unlock() }; return requests }
    func append(_ request: URLRequest) { lock.lock(); defer { lock.unlock() }; requests.append(request) }
}

private final class CorrectionURLProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> Data)?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "correction.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            var captured = request
            if captured.httpBody == nil, let stream = request.httpBodyStream {
                stream.open()
                defer { stream.close() }
                var body = Data()
                var buffer = [UInt8](repeating: 0, count: 4096)
                while true {
                    let count = stream.read(&buffer, maxLength: buffer.count)
                    if count < 0 { throw stream.streamError ?? URLError(.cannotDecodeRawData) }
                    if count == 0 { break }
                    body.append(contentsOf: buffer.prefix(count))
                }
                captured.httpBody = body
            }
            guard let handler = Self.handler else { throw URLError(.unsupportedURL) }
            let body = try handler(captured)
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: body)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

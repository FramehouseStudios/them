import XCTest
@testable import them

@MainActor
final class MemoriesForgetTests: XCTestCase {
    func testPendingForgetKeepsCardAndSelectionAndFailureCanBeRetried() async throws {
        let suspended = SuspendedMemoryForget()
        var calls = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in try Self.memories(ids: ["memory-a", "memory-b"]) },
            pendingQuestionLoader: { _ in nil },
            forgetLoader: { id, key in
                calls += 1
                XCTAssertEqual(id, "memory-a")
                XCTAssertEqual(key, "theme-memory-a")
                if calls == 1 { return try await suspended.wait() }
                return try Self.receipt(forgottenID: id)
            }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(vm.memory(forID: "memory-a"))
        vm.selection = original
        let deletion = Task { try await vm.forgetMemory(itemID: original.id, key: original.key, expectedItem: original) }
        await eventually { suspended.isWaiting }

        XCTAssertEqual(vm.memory(forID: original.id), original)
        XCTAssertEqual(vm.selection, original)
        XCTAssertNil(vm.actionNotice)
        suspended.complete(.failure(URLError(.networkConnectionLost)))
        do {
            try await deletion.value
            XCTFail("A failed deletion must remain unconfirmed.")
        } catch {
            XCTAssertEqual((error as? URLError)?.code, .networkConnectionLost)
        }
        XCTAssertEqual(vm.memory(forID: original.id), original)
        XCTAssertEqual(vm.selection, original)
        XCTAssertNil(vm.actionNotice)

        try await vm.forgetMemory(itemID: original.id, key: original.key, expectedItem: original)
        XCTAssertEqual(calls, 2)
        XCTAssertNil(vm.memory(forID: original.id))
        XCTAssertNotNil(vm.memory(forID: "memory-b"))
        XCTAssertNil(vm.selection)
        XCTAssertFalse(vm.actionNotice?.isEmpty ?? true)
    }

    func testFalseWrongActionWrongStatusAndUnmatchedReceiptsNeverRemoveCard() async throws {
        let invalidReceipts = [
            try Self.receipt(ok: false, forgottenID: "memory-a"),
            try Self.receipt(action: "update", forgottenID: "memory-a"),
            try Self.receipt(status: "pending", forgottenID: "memory-a"),
            try Self.receipt(forgottenID: "memory-b"),
            try Self.receipt(forgottenID: nil),
            try Self.receipt(forgottenID: " \n "),
        ]
        for (index, receipt) in invalidReceipts.enumerated() {
            var calls = 0
            let vm = MemoriesViewModel(
                notificationCenter: NotificationCenter(),
                memoriesLoader: { _, _ in try Self.memories(ids: ["memory-a", "memory-b"]) },
                pendingQuestionLoader: { _ in nil },
                forgetLoader: { _, _ in
                    calls += 1
                    return receipt
                }
            )
            _ = await vm.load()
            let original = try XCTUnwrap(vm.memory(forID: "memory-a"))
            vm.selection = original
            do {
                try await vm.forgetMemory(itemID: original.id, key: original.key, expectedItem: original)
                XCTFail("Invalid receipt \(index) must not authorize local removal.")
            } catch {
                XCTAssertFalse(error.localizedDescription.isEmpty)
            }
            XCTAssertEqual(calls, 1)
            XCTAssertEqual(vm.memory(forID: original.id), original, "Receipt \(index) removed the target.")
            XCTAssertNotNil(vm.memory(forID: "memory-b"))
            XCTAssertEqual(vm.selection, original)
            XCTAssertNil(vm.actionNotice)
        }
    }

    func testConfirmedReceiptNormalizesIDAndRemovesOnlyItsExistingScope() async throws {
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in try Self.memories(ids: ["memory-a", "memory-b"]) },
            pendingQuestionLoader: { _ in nil },
            forgetLoader: { _, _ in try Self.receipt(forgottenID: " MeMoRy-\n A ") }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(vm.memory(forID: "memory-a"))
        vm.selection = original
        try await vm.forgetMemory(itemID: original.id, key: original.key, expectedItem: original)

        XCTAssertNil(vm.memory(forID: "memory-a"))
        XCTAssertNotNil(vm.memory(forID: "memory-b"))
        XCTAssertNil(vm.selection)
        XCTAssertFalse(vm.actionNotice?.isEmpty ?? true)
    }

    func testConfirmedRepeatDeletionIsAcceptedWhenDurableRecordWasAlreadyAbsent() async throws {
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in try Self.memories(ids: ["memory-a"]) },
            pendingQuestionLoader: { _ in nil },
            forgetLoader: { id, _ in try Self.receipt(forgottenID: id, durableMemoryDeleted: false) }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(vm.memory(forID: "memory-a"))
        vm.selection = original
        try await vm.forgetMemory(itemID: original.id, key: original.key, expectedItem: original)

        XCTAssertEqual(vm.state, .empty)
        XCTAssertNil(vm.selection)
        XCTAssertFalse(vm.actionNotice?.isEmpty ?? true)
    }

    func testSecondSubmissionDuringPendingForgetDoesNotSendAnotherRequest() async throws {
        let suspended = SuspendedMemoryForget()
        var calls = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in try Self.memories(ids: ["memory-a"]) },
            pendingQuestionLoader: { _ in nil },
            forgetLoader: { _, _ in
                calls += 1
                return try await suspended.wait()
            }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(vm.memory(forID: "memory-a"))
        vm.selection = original
        let first = Task { try await vm.forgetMemory(itemID: original.id, key: original.key, expectedItem: original) }
        await eventually { suspended.isWaiting }
        do {
            try await vm.forgetMemory(itemID: original.id, key: original.key, expectedItem: original)
            XCTFail("A duplicate confirmation must not start another delete.")
        } catch {
            XCTAssertFalse(error.localizedDescription.isEmpty)
        }
        XCTAssertEqual(calls, 1)
        XCTAssertEqual(vm.memory(forID: original.id), original)
        suspended.complete(.success(try Self.receipt(forgottenID: original.id)))
        try await first.value
        XCTAssertEqual(calls, 1)
        XCTAssertNil(vm.memory(forID: original.id))
    }

    func testChangedConfirmationTargetIsRejectedBeforeForgetLoaderRuns() async throws {
        var reads = 0
        var calls = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                reads += 1
                return try Self.memories(ids: ["memory-a"], summary: reads == 1 ? "The original memory." : "A newer correction.")
            },
            pendingQuestionLoader: { _ in nil },
            forgetLoader: { id, _ in
                calls += 1
                return try Self.receipt(forgottenID: id)
            }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(vm.memory(forID: "memory-a"))
        vm.selection = original
        _ = await vm.retry()
        do {
            try await vm.forgetMemory(itemID: original.id, key: original.key, expectedItem: original)
            XCTFail("Confirmation of an old card must not delete its changed replacement.")
        } catch {
            XCTAssertFalse(error.localizedDescription.isEmpty)
        }
        XCTAssertEqual(calls, 0)
        XCTAssertEqual(vm.memory(forID: original.id)?.summary, "A newer correction.")
        XCTAssertEqual(vm.selection?.id, original.id)
        XCTAssertNil(vm.actionNotice)
    }

    func testAlreadyRemovedConfirmationTargetIsRejectedBeforeForgetLoaderRuns() async throws {
        var reads = 0
        var calls = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                reads += 1
                return try Self.memories(ids: reads == 1 ? ["memory-a"] : [])
            },
            pendingQuestionLoader: { _ in nil },
            forgetLoader: { id, _ in
                calls += 1
                return try Self.receipt(forgottenID: id)
            }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(vm.memory(forID: "memory-a"))
        _ = await vm.retry()
        do {
            try await vm.forgetMemory(itemID: original.id, key: original.key, expectedItem: original)
            XCTFail("A removed confirmation target must not submit another mutation.")
        } catch {
            XCTAssertFalse(error.localizedDescription.isEmpty)
        }
        XCTAssertEqual(calls, 0)
        XCTAssertEqual(vm.state, .empty)
        XCTAssertNil(vm.actionNotice)
    }

    func testConfirmedItemCannotAuthorizeDifferentIDOrKey() async throws {
        var calls = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in try Self.memories(ids: ["memory-a", "memory-b"]) },
            pendingQuestionLoader: { _ in nil },
            forgetLoader: { id, _ in
                calls += 1
                return try Self.receipt(forgottenID: id)
            }
        )
        _ = await vm.load()
        let confirmed = try XCTUnwrap(vm.memory(forID: "memory-a"))
        for (id, key) in [("memory-b", "theme-memory-b"), ("memory-a", "different-theme")] {
            do {
                try await vm.forgetMemory(itemID: id, key: key, expectedItem: confirmed)
                XCTFail("Confirmation must stay bound to both the selected card and its deletion key.")
            } catch {
                XCTAssertFalse(error.localizedDescription.isEmpty)
            }
        }
        XCTAssertEqual(calls, 0)
        XCTAssertNotNil(vm.memory(forID: "memory-a"))
        XCTAssertNotNil(vm.memory(forID: "memory-b"))
    }

    func testCrossDeviceConflictReloadsLatestMemoryBeforeWriterCanConfirmAgain() async throws {
        var reads = 0
        var writes = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                reads += 1
                return try Self.memories(
                    ids: ["memory-a"],
                    summary: reads == 1 ? "The original memory." : "Corrected on another device."
                )
            },
            pendingQuestionLoader: { _ in nil },
            forgetLoader: { id, _ in
                writes += 1
                if writes == 1 {
                    throw BackendMemoryAPIError.server(status: 409, message: "stale_memory_state_version")
                }
                return try Self.receipt(forgottenID: id)
            }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(vm.memory(forID: "memory-a"))
        do {
            try await vm.forgetMemory(itemID: original.id, key: original.key, expectedItem: original)
            XCTFail("A conflict cannot confirm deletion.")
        } catch {
            XCTAssertTrue((error as? BackendMemoryAPIError)?.isCrossDeviceMemoryConflict == true)
        }
        XCTAssertEqual(reads, 2)
        XCTAssertNil(vm.actionNotice)
        let latest = try XCTUnwrap(vm.memory(forID: original.id))
        XCTAssertEqual(latest.summary, "Corrected on another device.")

        do {
            try await vm.forgetMemory(itemID: original.id, key: original.key, expectedItem: original)
            XCTFail("The previous confirmation cannot authorize the corrected card.")
        } catch MemoryForgetError.changed {}
        XCTAssertEqual(writes, 1)

        try await vm.forgetMemory(itemID: latest.id, key: latest.key, expectedItem: latest)
        XCTAssertEqual(writes, 2)
        XCTAssertNil(vm.memory(forID: latest.id))
        XCTAssertNotNil(vm.actionNotice)
    }

    func testConfirmationExplainsActualCharacterHistoryRecapAndEpisodeScope() async throws {
        let cases = [
            ("character-mara", "character:Mara", "across your account"),
            ("history-turn-3", "turn_3", "saved conversation turn from History"),
            ("memory-last-recap", "recap", "recap and its snapshot"),
            ("episode-3", "episode:3", "saved creative episode"),
            ("memory-a", "theme-memory-a", "does not erase every mention"),
        ]
        let keys = Dictionary(uniqueKeysWithValues: cases.map { ($0.0, $0.1) })
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in try Self.memories(ids: cases.map { $0.0 }, keys: keys) },
            pendingQuestionLoader: { _ in nil }
        )
        _ = await vm.load()
        for (id, _, scope) in cases {
            let item = try XCTUnwrap(vm.memory(forID: id))
            let message = MemoryForgetPresentation.confirmationMessage(for: item)
            XCTAssertTrue(message.contains(scope), "Scope is missing for \(id).")
            XCTAssertTrue(message.contains(item.title))
            XCTAssertTrue(message.contains("no undo"))
        }
    }

    func testDelayedForgetPreservesChangedRecreatedAndNewSameKeyCards() async throws {
        for scenario in 0..<4 {
            let pending = SuspendedMemoryForget()
            var reads = 0
            let vm = MemoriesViewModel(
                notificationCenter: NotificationCenter(),
                memoriesLoader: { _, _ in
                    reads += 1
                    if reads == 1 { return try Self.memories(ids: ["memory-a"]) }
                    switch scenario {
                    case 0: return try Self.memories(ids: ["memory-a"], summary: "A newer correction.")
                    case 1: return try Self.memories(ids: ["memory-a", "memory-b"], keys: ["memory-b": "theme-memory-a"])
                    case 2: return try Self.memories(ids: ["memory-b"], keys: ["memory-b": "theme-memory-a"])
                    default: return try Self.memories(ids: ["memory-a"])
                    }
                }, pendingQuestionLoader: { _ in nil },
                forgetLoader: { _, _ in try await pending.wait() }
            )
            _ = await vm.load()
            let original = try XCTUnwrap(vm.memory(forID: "memory-a"))
            let forgetting = Task { try await vm.forgetMemory(itemID: original.id, key: original.key, expectedItem: original) }
            await eventually { pending.isWaiting }
            _ = await vm.retry()
            let newer = vm.state
            pending.complete(.success(try Self.receipt(forgottenID: original.id)))
            do {
                try await forgetting.value
                XCTFail("A delayed receipt must not hide scenario \(scenario)'s newer memory.")
            } catch MemoryForgetError.changed {}
            XCTAssertEqual(reads, 3, "Reconcile after receipt before trusting a newer snapshot.")
            XCTAssertEqual(vm.state, newer)
            XCTAssertNil(vm.actionNotice)
        }
    }

    func testDelayedForgetReconcilesAbsencePreservesOtherSelectionAndLatestCursor() async throws {
        for alreadyAbsent in [false, true] {
            let pending = SuspendedMemoryForget()
            var cursors: [String?] = []
            let vm = MemoriesViewModel(
                notificationCenter: NotificationCenter(),
                memoriesLoader: { _, since in
                    cursors.append(since)
                    if cursors.count == 1 { return try Self.memories(ids: ["memory-a"], version: "v1") }
                    if cursors.count == 2 {
                        return try Self.memories(ids: alreadyAbsent ? ["memory-b"] : ["memory-a", "memory-b"], version: "v3")
                    }
                    return try Self.memories(ids: ["memory-b"], version: "v4")
                }, pendingQuestionLoader: { _ in nil },
                forgetLoader: { _, _ in try await pending.wait() }
            )
            _ = await vm.load()
            let original = try XCTUnwrap(vm.memory(forID: "memory-a"))
            let forgetting = Task { try await vm.forgetMemory(itemID: original.id, key: original.key, expectedItem: original) }
            await eventually { pending.isWaiting }
            _ = await vm.retry()
            let other = try XCTUnwrap(vm.memory(forID: "memory-b"))
            vm.selection = other
            var oldSync = BackendSyncState.empty
            oldSync.stateVersion = "v2"
            pending.complete(.success(try Self.receipt(forgottenID: original.id, sync: oldSync)))
            try await forgetting.value
            XCTAssertNil(vm.memory(forID: original.id))
            XCTAssertEqual(vm.selection, other)
            XCTAssertNotNil(vm.actionNotice)
            _ = await vm.refreshCrossDeviceMemoriesIfNeeded()
            XCTAssertEqual(cursors.count, 4)
            XCTAssertEqual(cursors.last!, "v4", "An old receipt must not rewind the applied read cursor.")
        }
    }

    func testDelayedForgetWithFailedReconciliationKeepsLastReadableSnapshot() async throws {
        let pending = SuspendedMemoryForget()
        var reads = 0
        let vm = MemoriesViewModel(
            notificationCenter: NotificationCenter(),
            memoriesLoader: { _, _ in
                reads += 1
                if reads > 2 { throw URLError(.networkConnectionLost) }
                return try Self.memories(ids: ["memory-a"], version: reads == 1 ? "v1" : "v3")
            }, pendingQuestionLoader: { _ in nil },
            forgetLoader: { _, _ in try await pending.wait() }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(vm.memory(forID: "memory-a"))
        let forgetting = Task { try await vm.forgetMemory(itemID: original.id, key: original.key, expectedItem: original) }
        await eventually { pending.isWaiting }
        _ = await vm.retry()
        pending.complete(.success(try Self.receipt(forgottenID: original.id)))
        do {
            try await forgetting.value
            XCTFail("An unverified reconciliation must retain readable data.")
        } catch MemoryForgetError.invalidReceipt {}
        XCTAssertEqual(vm.memory(forID: original.id), original)
        XCTAssertNil(vm.actionNotice)
        XCTAssertNotNil(vm.refreshError)
    }

    func testErrorCopyDoesNotClaimAFailedResponseMeansNothingWasDeleted() {
        let uncertain = MemoryForgetPresentation.errorMessage(for: URLError(.timedOut))
        XCTAssertTrue(uncertain.contains("Couldn’t confirm"))
        XCTAssertTrue(uncertain.contains("refresh Memories"))
        XCTAssertFalse(uncertain.localizedCaseInsensitiveContains("nothing changed"))
        XCTAssertFalse(uncertain.localizedCaseInsensitiveContains("was not deleted"))

        let auth = MemoryForgetPresentation.errorMessage(for: BackendMemoryAPIError.server(status: 401, message: "user_auth_required"))
        XCTAssertTrue(auth.contains("Sign in"))
        let conflict = MemoryForgetPresentation.errorMessage(for: BackendMemoryAPIError.server(status: 409, message: "stale_memory_state_version"))
        XCTAssertTrue(conflict.contains("changed"))
        XCTAssertTrue(conflict.contains("Forget again"))
    }

    private static func memories(
        ids: [String],
        summary: String = "The original memory.",
        keys: [String: String] = [:],
        version: String = "snapshot"
    ) throws -> BackendReadResult<BackendMemoriesResponse> {
        let cards: [[String: Any]] = ids.map { id in
            [
                "id": id, "key": keys[id] ?? "theme-\(id)", "title": "Saved \(id)", "summary": summary,
                "emotionalTone": "reflective", "salience": 0.7, "confidence": 0.8,
                "rememberedAt": 1, "snippets": [], "referenceHint": "", "source": "theme", "editable": true,
            ]
        }
        let data = try JSONSerialization.data(withJSONObject: [
            "source": "test", "sourceIp": "", "stateVersion": version,
            "memories": cards, "conversationSamples": [],
        ])
        let payload = try JSONDecoder().decode(BackendMemoriesResponse.self, from: data)
        return BackendReadResult(payload: payload, sync: .empty, notModified: false)
    }

    private static func receipt(
        ok: Bool = true,
        action: String = "forget",
        status: String = "forgotten",
        forgottenID: String?,
        durableMemoryDeleted: Bool? = nil,
        sync: BackendSyncState = .empty
    ) throws -> BackendReadResult<BackendMemoryMutationResponse> {
        var body: [String: Any] = ["ok": ok, "action": action, "status": status, "stateVersion": "forgotten-v2"]
        if let forgottenID { body["forgottenId"] = forgottenID }
        if let durableMemoryDeleted { body["durableMemoryDeleted"] = durableMemoryDeleted }
        let data = try JSONSerialization.data(withJSONObject: body)
        let payload = try JSONDecoder().decode(BackendMemoryMutationResponse.self, from: data)
        return BackendReadResult(payload: payload, sync: sync, notModified: false)
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
        XCTAssertTrue(predicate(), "Timed out waiting for the controlled Forget request.", file: file, line: line)
    }
}

@MainActor
private final class SuspendedMemoryForget {
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

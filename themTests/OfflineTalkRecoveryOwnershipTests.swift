import Foundation
import XCTest
@testable import them

final class OfflineTalkRecoveryOwnershipTests: XCTestCase {
    private var directory: URL!
    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("TalkRecovery-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory.appendingPathComponent("blobs"), withIntermediateDirectories: true)
    }
    override func tearDownWithError() throws {
        try FileManager.default.removeItem(at: directory)
    }

    func testRecoveryShowsAndDeletesOnlyCurrentOwnersConfirmedWork() async throws {
        let a = entry("a", user: "writer-a"), b = entry("b", user: "writer-b"), legacy = entry("legacy", user: "")
        try seed([a, b, legacy])
        let state = TalkRecoveryOwnerState(user: "writer-b")
        let outbox = queue(state)
        let visible = await outbox.allEntries()
        XCTAssertEqual(visible.map(\.id), [b.id])
        let snapshot = await outbox.snapshot()
        XCTAssertEqual(snapshot.parkedCount, 1)
        _ = try await outbox.deleteParkedEntries(confirmedEntryIDs: [b.id], initiatingIdentity: state.identity(), backendURL: state.url())
        let retained = try readManifest()
        XCTAssertEqual(Set(retained.map(\.id)), [a.id, legacy.id])
        XCTAssertEqual(try? Data(contentsOf: blob(a)), Data("words-a".utf8))
        XCTAssertEqual(try? Data(contentsOf: blob(legacy)), Data("words-legacy".utf8))
        state.change(user: "writer-a")
        let restored = await queue(state).allEntries()
        XCTAssertEqual(restored.map(\.id), [a.id])
    }

    func testDifferentBytesUnderSameRequestKeyArePreservedButNotAcknowledgedAsRetry() async throws {
        let state = TalkRecoveryOwnerState(user: "writer-a")
        let outbox = queue(state)
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("writer-a", forHTTPHeaderField: "X-User-Id")
        request.setValue("request-a", forHTTPHeaderField: "X-Idempotency-Key")
        _ = try await outbox.enqueue(request: request, body: Data("first words".utf8), reason: "offline")
        do {
            _ = try await outbox.enqueue(request: request, body: Data("different words".utf8), reason: "offline")
            XCTFail("Different words were falsely acknowledged as the original queued turn.")
        } catch {
            XCTAssertTrue(error.localizedDescription.contains("kept"))
        }
        let entries = try readManifest()
        XCTAssertEqual(entries.count, 2)
        XCTAssertEqual(entries.filter { $0.status == .parked }.count, 1)
        let bytes = try entries.map { try Data(contentsOf: blob($0)) }
        XCTAssertEqual(Set(bytes), [Data("first words".utf8), Data("different words".utf8)])
    }

    func testDifferentBackendIsNotRetriedOrMutatedWithCurrentCredentials() async throws {
        var old = entry("other-origin", user: "writer-a")
        old.urlString = "https://other.them.test/talk"
        old.status = .pending
        try seed([old])
        let state = TalkRecoveryOwnerState(user: "writer-a")
        var calls = 0
        _ = await queue(state).drainDue(now: Date().addingTimeInterval(10), initiatingIdentity: state.identity(), backendURL: state.url()) { _ in
            calls += 1
            return .init(statusCode: 200)
        }
        XCTAssertEqual(calls, 0)
        XCTAssertEqual(try readManifest(), [old], "Inactive backend work must not consume retries or be deleted.")
        XCTAssertEqual(try Data(contentsOf: blob(old)), Data("words-other-origin".utf8))
    }

    func testStaleConfirmationCannotDeleteAfterLoginIntentChanges() async throws {
        let a = entry("a", user: "writer-a")
        try seed([a])
        let state = TalkRecoveryOwnerState(user: "writer-a"), outbox = queue(state)
        let confirmationOwner = state.identity()
        state.change(user: "writer-a")
        do {
            _ = try await outbox.deleteParkedEntries(confirmedEntryIDs: [a.id], initiatingIdentity: confirmationOwner, backendURL: state.url())
            XCTFail("A confirmation from an earlier login was accepted.")
        } catch {}
        XCTAssertEqual(try readManifest(), [a])
        XCTAssertEqual(try Data(contentsOf: blob(a)), Data("words-a".utf8))
    }

    func testDeleteKeepsParkedWorkNotInTheConfirmedSet() async throws {
        let confirmed = entry("confirmed", user: "writer-a"), later = entry("later", user: "writer-a")
        try seed([confirmed, later])
        let state = TalkRecoveryOwnerState(user: "writer-a")
        _ = try await queue(state).deleteParkedEntries(confirmedEntryIDs: [confirmed.id], initiatingIdentity: state.identity(), backendURL: state.url())
        XCTAssertEqual(try readManifest(), [later])
        XCTAssertEqual(try Data(contentsOf: blob(later)), Data("words-later".utf8))
    }

    func testExportPreservesExactBodyWithoutCredentialHeadersAndRejectsOtherOwners() async throws {
        var a = entry("a", user: "writer-a")
        a.headers["Authorization"] = "Bearer fixture-secret"
        a.headers["X-Client-Token"] = "fixture-client-secret"
        let foreign = entry("foreign", user: "writer-b"), legacy = entry("legacy", user: "")
        try seed([a, foreign, legacy])
        let exact = Data("Cafe\u{301}\r\n \t ".utf8)
        try exact.write(to: blob(a))
        let state = TalkRecoveryOwnerState(user: "writer-a"), outbox = queue(state)
        let export = try await outbox.exportRecoveryEntry(a.id, initiatingIdentity: state.identity(), backendURL: state.url())
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: export.data) as? [String: Any])
        XCTAssertEqual(Data(base64Encoded: try XCTUnwrap(object["body_base64"] as? String)), exact)
        XCTAssertNil(object["headers"])
        XCTAssertFalse(String(decoding: export.data, as: UTF8.self).contains("fixture-secret"))
        XCTAssertFalse(String(decoding: export.data, as: UTF8.self).contains("fixture-client-secret"))
        for unavailable in [foreign, legacy] {
            do {
                _ = try await outbox.exportRecoveryEntry(unavailable.id, initiatingIdentity: state.identity(), backendURL: state.url())
                XCTFail("An unavailable owner's turn was exported.")
            } catch {}
        }
        XCTAssertEqual(try readManifest(), [a, foreign, legacy])
    }

    func testCorruptManifestIsKeptAndCannotSilentlyDropRows() async throws {
        let a = entry("a", user: "writer-a")
        try seed([a])
        let manifest = directory.appendingPathComponent("queue.jsonl")
        let valid = try Data(contentsOf: manifest), damaged = valid + Data("not-json\n".utf8)
        try damaged.write(to: manifest)
        let state = TalkRecoveryOwnerState(user: "writer-a"), outbox = queue(state)
        do {
            _ = try await outbox.deleteParkedEntries(confirmedEntryIDs: [a.id], initiatingIdentity: state.identity(), backendURL: state.url())
            XCTFail("Corrupt manifest was accepted.")
        } catch {}
        XCTAssertEqual(try Data(contentsOf: manifest), damaged)
        XCTAssertTrue(FileManager.default.fileExists(atPath: blob(a).path))
        try valid.write(to: manifest)
        let recovered = await outbox.allEntries()
        XCTAssertEqual(recovered, [a], "A failed read must be retryable after repair.")
    }

    func testSharedBodyReferenceAndInvalidReplayEndpointFailClosed() async throws {
        let a = entry("a", user: "writer-a")
        for sharedBody in [true, false] {
            var invalid = entry("invalid", user: "writer-a")
            if sharedBody { invalid.bodyRef = a.bodyRef }
            else { invalid.urlString = "https://them.test/account" }
            try seed([a, invalid])
            let manifest = try Data(contentsOf: directory.appendingPathComponent("queue.jsonl"))
            let state = TalkRecoveryOwnerState(user: "writer-a")
            do {
                _ = try await queue(state).deleteParkedEntries(confirmedEntryIDs: [a.id], initiatingIdentity: state.identity(), backendURL: state.url())
                XCTFail("An ambiguous recovery manifest was accepted.")
            } catch {}
            XCTAssertEqual(try Data(contentsOf: directory.appendingPathComponent("queue.jsonl")), manifest)
            XCTAssertTrue(FileManager.default.fileExists(atPath: blob(a).path))
        }
    }

    func testManifestWriteFailureNeverUnlinksConfirmedBody() async throws {
        let a = entry("a", user: "writer-a")
        try seed([a])
        let state = TalkRecoveryOwnerState(user: "writer-a"), outbox = queue(state)
        _ = await outbox.allEntries()
        let manifest = directory.appendingPathComponent("queue.jsonl")
        try FileManager.default.moveItem(at: manifest, to: directory.appendingPathComponent("manifest-backup"))
        try FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
        do {
            _ = try await outbox.deleteParkedEntries(confirmedEntryIDs: [a.id], initiatingIdentity: state.identity(), backendURL: state.url())
            XCTFail("Deletion was acknowledged despite failed manifest persistence.")
        } catch {}
        XCTAssertEqual(try Data(contentsOf: blob(a)), Data("words-a".utf8))
        let retained = await outbox.allEntries()
        XCTAssertEqual(retained, [a])
    }

    func testLateAcceptedReplaySettlesOnlyItsEntryAndOverlappingDrainDoesNotSend() async throws {
        var a = entry("a", user: "writer-a"), b = entry("b", user: "writer-b")
        a.status = .pending; b.status = .pending
        try seed([a, b])
        let state = TalkRecoveryOwnerState(user: "writer-a"), outbox = queue(state)
        let started = expectation(description: "A's request reached transport"), gate = TalkReplayGate()
        let owner = state.identity()
        let drain = Task {
            await outbox.drainDue(initiatingIdentity: owner, backendURL: state.url()) { request in
                XCTAssertEqual(request.value(forHTTPHeaderField: "X-User-Id"), "writer-a")
                started.fulfill()
                return await gate.wait()
            }
        }
        await fulfillment(of: [started], timeout: 3)
        state.change(user: "writer-b")
        _ = await outbox.drainDue(initiatingIdentity: state.identity(), backendURL: state.url()) { _ in
            XCTFail("Overlapping drain sent while A's transport was outstanding.")
            return .init(statusCode: 200)
        }
        await gate.release()
        _ = await drain.value
        XCTAssertEqual(try readManifest(), [b])
        XCTAssertEqual(try Data(contentsOf: blob(b)), Data("words-b".utf8))
    }

    func testOwnerSwitchDuring401RefreshDoesNotReplayOrConsumeRetryBudget() async throws {
        var a = entry("a", user: "writer-a"); a.status = .pending
        try seed([a])
        let state = TalkRecoveryOwnerState(user: "writer-a")
        let outbox = OfflineTalkOutbox(storageDirectory: directory, requestIdentityProvider: { _ in state.identity() },
            backendURLProvider: { state.url() }, authRefresher: { _ in state.change(user: "writer-b"); return .signedOut })
        var calls = 0
        _ = await outbox.drainDue(initiatingIdentity: state.identity(), backendURL: state.url()) { _ in
            calls += 1
            return .init(statusCode: 401)
        }
        XCTAssertEqual(calls, 1)
        let retained = try XCTUnwrap(readManifest().first)
        XCTAssertEqual(retained.status, .pending)
        XCTAssertEqual(retained.retries, 0)
        XCTAssertEqual(try Data(contentsOf: blob(a)), Data("words-a".utf8))
    }

    func test401RefreshReplaysOnceWithCurrentTokenAndUnchangedBodyAndRequestKey() async throws {
        var a = entry("a", user: "writer-a"); a.status = .pending
        try seed([a])
        let state = TalkRecoveryOwnerState(user: "writer-a")
        let outbox = OfflineTalkOutbox(storageDirectory: directory, requestIdentityProvider: { _ in state.identity() },
            backendURLProvider: { state.url() }, authRefresher: { _ in
                state.rotateToken()
                return .init(user: .init(userId: "writer-a", email: "fixture@example.test", authProvider: nil,
                    emailVerified: true, emailVerifiedAt: nil, createdAt: nil, updatedAt: nil),
                    accessTokenPresent: true, refreshTokenPresent: true, accessExpiresAt: 0, refreshExpiresAt: 0,
                    currentSessionId: "fixture-session", currentFamilyId: "fixture-family", tokenType: "Bearer",
                    pendingEmailVerification: false, verificationRequired: false)
            })
        var requests: [URLRequest] = []
        _ = await outbox.drainDue(initiatingIdentity: state.identity(), backendURL: state.url()) { request in
            requests.append(request)
            return .init(statusCode: requests.count == 1 ? 401 : 200)
        }
        XCTAssertEqual(requests.count, 2)
        XCTAssertEqual(requests.map { $0.value(forHTTPHeaderField: "Authorization") }, ["Bearer fixture-access", "Bearer fixture-rotated"])
        XCTAssertTrue(requests.allSatisfy { $0.httpBody == Data("words-a".utf8) && $0.value(forHTTPHeaderField: "X-Idempotency-Key") == "request-a" })
        XCTAssertTrue(try readManifest().isEmpty)
    }

    func testSnapshotRejectsUnscopedAndDifferentBackendNotifications() {
        XCTAssertNil(OfflineTalkOutboxSnapshot(notification: .init(name: .themOfflineTalkOutboxUpdated, userInfo: [:])))
        let scope = OfflineTalkRecoveryScope.current()
        var fields = scope.notificationFields
        fields["outboxBackend"] = "https://unrelated.example.test"
        XCTAssertNil(OfflineTalkOutboxSnapshot(notification: .init(name: .themOfflineTalkOutboxUpdated, userInfo: fields)))
    }

    private func queue(_ state: TalkRecoveryOwnerState) -> OfflineTalkOutbox {
        OfflineTalkOutbox(storageDirectory: directory, requestIdentityProvider: { _ in state.identity() }, backendURLProvider: { state.url() })
    }
    private func entry(_ id: String, user: String) -> OfflineTalkOutboxEntry {
        .init(id: id, createdAt: 1, updatedAt: 1, endpoint: "/talk", method: "POST", urlString: "https://them.test/talk",
              headers: user.isEmpty ? [:] : ["X-User-Id": user], bodyRef: "blob-\(id).multipart", bodyByteCount: Data("words-\(id)".utf8).count,
              idempotencyKey: "request-\(id)", timeoutInterval: 15, status: .parked, retries: 0, nextAttemptAt: 0, lastError: "Kept offline")
    }
    private func blob(_ entry: OfflineTalkOutboxEntry) -> URL { directory.appendingPathComponent("blobs").appendingPathComponent(entry.bodyRef) }
    private func seed(_ entries: [OfflineTalkOutboxEntry]) throws {
        let encoder = JSONEncoder()
        var manifest = Data()
        for entry in entries {
            manifest.append(try encoder.encode(entry)); manifest.append(10)
            try Data("words-\(entry.id)".utf8).write(to: blob(entry))
        }
        try manifest.write(to: directory.appendingPathComponent("queue.jsonl"))
    }
    private func readManifest() throws -> [OfflineTalkOutboxEntry] {
        try Data(contentsOf: directory.appendingPathComponent("queue.jsonl")).split(separator: 10).map {
            try JSONDecoder().decode(OfflineTalkOutboxEntry.self, from: Data($0))
        }
    }
}

private actor TalkReplayGate {
    private var continuation: CheckedContinuation<OfflineTalkOutboxSendResult, Never>?
    private var released = false
    func wait() async -> OfflineTalkOutboxSendResult {
        if released { return .init(statusCode: 200) }
        return await withCheckedContinuation { continuation = $0 }
    }
    func release() { released = true; continuation?.resume(returning: .init(statusCode: 200)); continuation = nil }
}

private final class TalkRecoveryOwnerState: @unchecked Sendable {
    private let lock = NSLock()
    private var user: String
    private var generation = 1
    private var accessToken = "fixture-access"
    init(user: String) { self.user = user }
    func identity() -> BackendAuthRequestIdentity {
        lock.lock(); defer { lock.unlock() }
        return .init(sessionEpoch: generation, userID: user, clientToken: "fixture-client", accessToken: accessToken, sessionIntentGeneration: generation)
    }
    func change(user: String) { lock.lock(); defer { lock.unlock() }; self.user = user; generation += 1 }
    func rotateToken() { lock.lock(); defer { lock.unlock() }; accessToken = "fixture-rotated" }
    func url() -> URL { URL(string: "https://them.test")! }
}

import Foundation
import XCTest
@testable import them

final class OfflineTalkEnqueueRecoveryTests: XCTestCase {
    private var directory: URL!
    private let backend = URL(string: "https://them.test")!
    private let exact = Data([0, 255, 13, 10]) + Data("Cafe\u{0301}.\r\n \t ".utf8)

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("TalkEnqueue-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory.appendingPathComponent("blobs"), withIntermediateDirectories: true)
    }
    override func tearDownWithError() throws { try FileManager.default.removeItem(at: directory) }

    func testManifestFailureLeavesAnOwnedRequestRecoverableAfterRelaunchWithoutSendingIt() async throws {
        let original = queue()
        _ = await original.allEntries()
        let manifest = directory.appendingPathComponent("queue.jsonl")
        try FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
        do {
            _ = try await original.enqueue(request: request(), body: exact, reason: "offline", initiatingIdentity: owner())
            XCTFail("The failed manifest write was acknowledged.")
        } catch {}
        try FileManager.default.removeItem(at: manifest)
        let restored = queue()
        let recovery = try await restored.recoveryState(initiatingIdentity: owner(), backendURL: backend)
        XCTAssertEqual(recovery.entries.count, 1, "An interrupted enqueue disappeared from recovery.")
        let entry = try XCTUnwrap(recovery.entries.first)
        XCTAssertEqual(entry.status, .parked, "Recovery must require review, not an automatic paid retry.")
        let artifact = try await restored.exportRecoveryEntry(entry.id, initiatingIdentity: owner(), backendURL: backend)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: artifact.data) as? [String: Any])
        XCTAssertEqual(Data(base64Encoded: try XCTUnwrap(json["body_base64"] as? String)), exact)
        var calls = 0
        _ = await restored.drainDue(now: .distantFuture, initiatingIdentity: owner(), backendURL: backend) { _ in
            calls += 1; return .init(statusCode: 200)
        }
        XCTAssertEqual(calls, 0)
        let again = try await queue().recoveryState(initiatingIdentity: owner(), backendURL: backend)
        XCTAssertEqual(again.entries.map(\.id), [entry.id])
    }

    func testLegacyBodyWithoutOwnershipStaysQuarantinedAndHasARecoveryNotice() async throws {
        let blob = directory.appendingPathComponent("blobs/blob-legacy.multipart")
        try exact.write(to: blob)
        let state = try await queue().recoveryState(initiatingIdentity: owner(), backendURL: backend)
        XCTAssertTrue(state.entries.isEmpty)
        XCTAssertTrue(state.hasUnassignedEntries, "Unassigned bytes must not silently disappear from recovery status.")
        XCTAssertEqual(try Data(contentsOf: blob), exact)
    }

    func testInvalidProducerOriginsCannotPoisonAnExistingOwnedQueue() async throws {
        let outbox = queue()
        let kept = try await outbox.enqueue(request: request(), body: exact, reason: "offline").entry
        let manifestURL = directory.appendingPathComponent("queue.jsonl"), manifest = try Data(contentsOf: manifestURL)
        for url in ["ftp://them.test/talk", "https://fixture-user:fixture-password@them.test/talk"] {
            var invalid = request(); invalid.url = URL(string: url)
            do {
                _ = try await outbox.enqueue(request: invalid, body: exact, reason: "offline")
                XCTFail("An invalid origin was durably stored.")
            } catch {}
        }
        let recovery = try await queue().recoveryState(initiatingIdentity: owner(), backendURL: backend)
        XCTAssertEqual(recovery.entries.map(\.id), [kept.id])
        XCTAssertEqual(try Data(contentsOf: manifestURL), manifest)
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: directory.appendingPathComponent("blobs").path).count, 1)
    }

    func testRecoveredIntentRequiresItsOwnerAndOriginAndReplaysOriginalBytesAndRequestID() async throws {
        let (restored, entry) = try await interrupted()
        let otherOwner = queue(user: "writer-b")
        let hidden = try await otherOwner.recoveryState(initiatingIdentity: owner("writer-b"), backendURL: backend)
        XCTAssertTrue(hidden.entries.isEmpty)
        do {
            _ = try await otherOwner.resumeInterruptedEntry(entry.id, initiatingIdentity: owner("writer-b"), backendURL: backend)
            XCTFail("Another account resumed the request.")
        } catch {}
        let otherURL = URL(string: "https://other.them.test")!
        let otherBackend = queue(url: otherURL)
        do {
            _ = try await otherBackend.resumeInterruptedEntry(entry.id, initiatingIdentity: owner(), backendURL: otherURL)
            XCTFail("Another backend resumed the request.")
        } catch {}
        _ = try await restored.resumeInterruptedEntry(entry.id, initiatingIdentity: owner(), backendURL: backend)
        let beforeSend = try await queue().recoveryState(initiatingIdentity: owner(), backendURL: backend)
        XCTAssertEqual(beforeSend.entries.map(\.id), [entry.id])
        XCTAssertEqual(beforeSend.entries.first?.status, .pending)
        XCTAssertNil(beforeSend.entries.first?.interruptedEnqueue)
        var calls = 0
        let pending = await queue().drainDue(now: .distantFuture, initiatingIdentity: owner(), backendURL: backend) { request in
            calls += 1
            XCTAssertEqual(request.httpBody, self.exact)
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-Idempotency-Key"), "durable-request")
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-User-Id"), "writer-a")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer fixture-access")
            return .init(statusCode: 500)
        }
        XCTAssertEqual(calls, 1)
        XCTAssertEqual(pending.pendingCount, 1)
    }

    func testCorruptedStoredBodyFailsClosedWithoutRewritingManifestOrOtherFiles() async throws {
        let outbox = queue()
        let entry = try await outbox.enqueue(request: request(), body: exact, reason: "offline").entry
        let bodyURL = directory.appendingPathComponent("blobs").appendingPathComponent(entry.bodyRef)
        var record = try XCTUnwrap(PropertyListSerialization.propertyList(from: Data(contentsOf: bodyURL), format: nil) as? [String: Any])
        record["sha256"] = Data(repeating: 0, count: 32)
        let corrupted = try PropertyListSerialization.data(fromPropertyList: record, format: .binary, options: 0)
        try corrupted.write(to: bodyURL)
        let manifest = directory.appendingPathComponent("queue.jsonl"), original = try Data(contentsOf: manifest)
        do {
            _ = try await queue().recoveryState(initiatingIdentity: owner(), backendURL: backend)
            XCTFail("Corrupted recovery bytes were accepted.")
        } catch {}
        XCTAssertEqual(try Data(contentsOf: manifest), original)
        XCTAssertEqual(try Data(contentsOf: bodyURL), corrupted)
    }

    func testAcceptedRequestCannotReappearWhenBodyUnlinkFails() async throws {
        let outbox = queue(fileManager: RetainingTalkBodyFileManager())
        let entry = try await outbox.enqueue(request: request(), body: exact, reason: "offline").entry
        _ = await outbox.drainDue(now: .distantFuture, initiatingIdentity: owner(), backendURL: backend) { _ in .init(statusCode: 200) }
        let bodyURL = directory.appendingPathComponent("blobs").appendingPathComponent(entry.bodyRef)
        let record = try PropertyListDecoder().decode(OfflineTalkStoredBody.self, from: Data(contentsOf: bodyURL))
        XCTAssertEqual(record.state, .settled)
        XCTAssertEqual(try record.validatedBody(matching: entry), exact)
        let relaunched = queue()
        let state = try await relaunched.recoveryState(initiatingIdentity: owner(), backendURL: backend)
        XCTAssertTrue(state.entries.isEmpty)
        var calls = 0
        _ = await relaunched.drainDue(now: .distantFuture, initiatingIdentity: owner(), backendURL: backend) { _ in
            calls += 1; return .init(statusCode: 200)
        }
        XCTAssertEqual(calls, 0)
    }

    func testSettledBodyReconcilesAnOldManifestAfterAcknowledgementPersistenceFails() async throws {
        let outbox = queue()
        let entry = try await outbox.enqueue(request: request(), body: exact, reason: "offline").entry
        let manifest = directory.appendingPathComponent("queue.jsonl"), backup = directory.appendingPathComponent("manifest-backup")
        _ = await outbox.drainDue(now: .distantFuture, initiatingIdentity: owner(), backendURL: backend) { _ in
            try FileManager.default.moveItem(at: manifest, to: backup)
            try FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
            return .init(statusCode: 200)
        }
        let record = try PropertyListDecoder().decode(OfflineTalkStoredBody.self,
            from: Data(contentsOf: directory.appendingPathComponent("blobs").appendingPathComponent(entry.bodyRef)))
        XCTAssertEqual(record.state, .settled)
        try FileManager.default.removeItem(at: manifest)
        try FileManager.default.moveItem(at: backup, to: manifest)
        let state = try await queue().recoveryState(initiatingIdentity: owner(), backendURL: backend)
        XCTAssertTrue(state.entries.isEmpty, "An acknowledged request was recovered as new work.")
    }

    func testConfirmedDeletionCannotRecoverAgainWhenBodyUnlinkFails() async throws {
        let outbox = queue(fileManager: RetainingTalkBodyFileManager())
        let entry = try await outbox.enqueue(request: request(), body: exact, reason: "offline").entry
        _ = await outbox.drainDue(now: .distantFuture, initiatingIdentity: owner(), backendURL: backend) { _ in .init(statusCode: 400) }
        _ = try await outbox.deleteParkedEntries(confirmedEntryIDs: [entry.id], initiatingIdentity: owner(), backendURL: backend)
        XCTAssertTrue(FileManager.default.fileExists(atPath: directory.appendingPathComponent("blobs").appendingPathComponent(entry.bodyRef).path))
        let state = try await queue().recoveryState(initiatingIdentity: owner(), backendURL: backend)
        XCTAssertTrue(state.entries.isEmpty)
    }

    private func interrupted() async throws -> (OfflineTalkOutbox, OfflineTalkOutboxEntry) {
        let original = queue()
        _ = await original.allEntries()
        let manifest = directory.appendingPathComponent("queue.jsonl")
        try FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
        do { _ = try await original.enqueue(request: request(), body: exact, reason: "offline") }
        catch {}
        try FileManager.default.removeItem(at: manifest)
        let restored = queue()
        let state = try await restored.recoveryState(initiatingIdentity: owner(), backendURL: backend)
        return (restored, try XCTUnwrap(state.entries.first))
    }

    private func owner(_ user: String = "writer-a") -> BackendAuthRequestIdentity {
        .init(sessionEpoch: 1, userID: user, clientToken: "fixture-client", accessToken: "fixture-access", sessionIntentGeneration: 1)
    }
    private func queue(user: String = "writer-a", url: URL? = nil, fileManager: FileManager = .default) -> OfflineTalkOutbox {
        let identity = owner(user), origin = url ?? backend
        return OfflineTalkOutbox(storageDirectory: directory, fileManager: fileManager,
            requestIdentityProvider: { _ in identity }, backendURLProvider: { origin })
    }
    private func request() -> URLRequest {
        var request = URLRequest(url: backend.appendingPathComponent("talk"))
        request.httpMethod = "POST"
        request.setValue("writer-a", forHTTPHeaderField: "X-User-Id")
        request.setValue("durable-request", forHTTPHeaderField: "X-Idempotency-Key")
        request.setValue("multipart/form-data; boundary=fixture", forHTTPHeaderField: "Content-Type")
        return request
    }
}

private final class RetainingTalkBodyFileManager: FileManager, @unchecked Sendable {
    override func removeItem(at URL: URL) throws {
        if URL.pathExtension == "turn" { throw NSError(domain: "FixtureUnlinkDenied", code: 1) }
        try super.removeItem(at: URL)
    }
}


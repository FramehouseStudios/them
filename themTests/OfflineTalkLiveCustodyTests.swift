import Foundation
import XCTest
@testable import them

@MainActor
final class OfflineTalkLiveCustodyTests: XCTestCase {
    private var directory: URL!
    private let state = LiveCustodyOwner()
    private let backend = URL(string: "https://live-custody.test")!
    private let body = Data("Original exact audio\r\n \t ".utf8)
    private let audio = Data("ID3exact accepted response".utf8)

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("LiveCustody-\(UUID())")
        state.set("writer-a")
    }
    override func tearDownWithError() throws {
        if let directory, FileManager.default.fileExists(atPath: directory.path) {
            try FileManager.default.removeItem(at: directory)
        }
    }

    func testLiveAdmissionNeverAutomaticallyGeneratesBeforeCompletionOrAfterRelaunch() async throws {
        let box = queue()
        let admission = try await box.admitLiveTalk(request: request(), body: body,
            owner: state.identity(), backendURL: backend)
        let rows = await box.allEntries()
        XCTAssertEqual(rows.first?.status, .parked)
        XCTAssertEqual(rows.first?.id, admission.entryID)
        var calls = 0
        _ = await queue().drainDue(now: .distantFuture, initiatingIdentity: state.identity(), backendURL: backend) { _ in
            calls += 1; return .init(statusCode: 200)
        }
        XCTAssertEqual(calls, 0, "An admitted live turn is not permission to generate again")
    }

    func testAdmissionCleanupCannotEraseAcceptedResponse() async throws {
        let box = queue()
        let admission = try await box.admitLiveTalk(request: request(), body: body,
            owner: state.identity(), backendURL: backend)
        let receipt = try await box.completeLiveTalk(admission, response: accepted(), responseURL: backend.appendingPathComponent("talk"))
        let retired = try await box.endLiveTalkWithoutAcceptedResponse(admission)
        XCTAssertFalse(retired)
        let kept = try await queue().receivedReply(receipt.entryID, initiatingIdentity: state.identity(), backendURL: backend)
        XCTAssertEqual(kept.response.id, receipt.responseID)
        XCTAssertEqual(kept.response.body, audio)
    }

    func testAcceptedReplySurvivesOwnerChangeAndRelaunchOnlyForOriginalWriter() async throws {
        let box = queue(), owner = state.identity()
        let admission = try await box.admitLiveTalk(request: request(), body: body, owner: owner, backendURL: backend)
        state.set("writer-b")
        let receipt = try await box.completeLiveTalk(admission, response: accepted(), responseURL: backend.appendingPathComponent("talk"))
        let otherWriterRows = await box.allEntries()
        XCTAssertTrue(otherWriterRows.isEmpty)
        do {
            _ = try await box.receivedReply(receipt.entryID, initiatingIdentity: state.identity(), backendURL: backend)
            XCTFail("Another writer read the accepted reply")
        } catch { }
        state.set("writer-a") // A fresh login intent may recover A's kept work.
        let reopened = queue()
        let reply = try await reopened.receivedReply(receipt.entryID, initiatingIdentity: state.identity(), backendURL: backend)
        XCTAssertEqual(reply.response.id, receipt.responseID)
        XCTAssertEqual(reply.response.body, audio)
        let artifact = try await reopened.exportRecoveryEntry(receipt.entryID, initiatingIdentity: state.identity(), backendURL: backend)
        let exported = try XCTUnwrap(JSONSerialization.jsonObject(with: artifact.data) as? [String: Any])
        XCTAssertEqual(exported["body_base64"] as? String, body.base64EncodedString())
        var sends = 0
        _ = await reopened.drainDue(now: .distantFuture, initiatingIdentity: state.identity(), backendURL: backend) { _ in
            sends += 1; return .init(statusCode: 200)
        }
        XCTAssertEqual(sends, 0)
    }

    func testLiveRequestDoesNotPersistSessionOrProviderCredentials() async throws {
        var req = request()
        req.setValue("Bearer fixture-access", forHTTPHeaderField: "Authorization")
        req.setValue("fixture-app-secret", forHTTPHeaderField: "X-APP-TOKEN")
        req.setValue("fixture-client", forHTTPHeaderField: "X-Client-Token")
        req.setValue("fixture-tts-secret", forHTTPHeaderField: "X-TTS-API-Key")
        let box = queue()
        _ = try await box.admitLiveTalk(request: req, body: body, owner: state.identity(), backendURL: backend)
        let rows = await box.allEntries()
        let row = try XCTUnwrap(rows.first)
        let names = Set(row.headers.keys.map { $0.lowercased() })
        XCTAssertTrue(names.isDisjoint(with: ["authorization", "x-app-token", "x-client-token", "x-tts-api-key"]))
        XCTAssertEqual(row.headers["X-User-Id"], "writer-a")
    }

    func testWrongResponseOriginCannotCompleteAnAdmission() async throws {
        let box = queue()
        let admission = try await box.admitLiveTalk(request: request(), body: body, owner: state.identity(), backendURL: backend)
        do {
            _ = try await box.completeLiveTalk(admission, response: accepted(), responseURL: URL(string: "https://other.test/talk")!)
            XCTFail("Different origin completed the live request")
        } catch { }
        let rows = await box.allEntries()
        XCTAssertNotEqual(rows.first?.receivedReply, true)
    }

    func testRepeatedCompletionPreservesReceiptAndRejectsChangedAcceptedBytes() async throws {
        let box = queue()
        let admission = try await box.admitLiveTalk(request: request(), body: body, owner: state.identity(), backendURL: backend)
        let first = try await box.completeLiveTalk(admission, response: accepted(), responseURL: backend.appendingPathComponent("talk"))
        let again = try await box.completeLiveTalk(admission, response: accepted(), responseURL: backend.appendingPathComponent("talk"))
        XCTAssertEqual(first.responseID, again.responseID)
        do {
            _ = try await box.completeLiveTalk(admission,
                response: .init(statusCode: 200, headers: accepted().headers, body: Data("changed".utf8)), responseURL: backend.appendingPathComponent("talk"))
            XCTFail("Changed accepted bytes were acknowledged as the old response")
        } catch { }
        let original = try await box.receivedReply(first.entryID, initiatingIdentity: state.identity(), backendURL: backend)
        XCTAssertEqual(original.response.body, audio)
        XCTAssertEqual(original.response.id, first.responseID)
    }

    func testIndexFailureLeavesAcceptedBlobRecoverable() async throws {
        let box = queue()
        let admission = try await box.admitLiveTalk(request: request(), body: body, owner: state.identity(), backendURL: backend)
        let manifest = directory.appendingPathComponent("queue.jsonl")
        let backup = directory.appendingPathComponent("index-backup")
        try FileManager.default.moveItem(at: manifest, to: backup)
        try FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
        let receipt = try await box.completeLiveTalk(admission, response: accepted(), responseURL: backend.appendingPathComponent("talk"))
        try FileManager.default.removeItem(at: manifest)
        try FileManager.default.moveItem(at: backup, to: manifest)
        let recovered = try await queue().receivedReply(receipt.entryID, initiatingIdentity: state.identity(), backendURL: backend)
        XCTAssertEqual(recovered.response.id, receipt.responseID)
        XCTAssertEqual(recovered.response.body, audio)
    }

    func testUnsuccessfulHTTPResponseCannotBecomeAcceptedCustody() async throws {
        let box = queue()
        let admission = try await box.admitLiveTalk(request: request(), body: body, owner: state.identity(), backendURL: backend)
        do {
            _ = try await box.completeLiveTalk(admission, response: .init(statusCode: 503, body: audio), responseURL: backend.appendingPathComponent("talk"))
            XCTFail("A failure response became an accepted receipt")
        } catch { }
        let rows = await box.allEntries()
        XCTAssertNotEqual(rows.first?.receivedReply, true)
    }

    func testWrongRequestIdentityCannotBeAdmitted() async throws {
        let box = queue()
        var req = request()
        req.setValue("other-writer", forHTTPHeaderField: "X-User-Id")
        do {
            _ = try await box.admitLiveTalk(request: req, body: body, owner: state.identity(), backendURL: backend)
            XCTFail("Caller-supplied user ID overrode captured identity")
        } catch { }
        let rows = await box.allEntries()
        XCTAssertTrue(rows.isEmpty)
    }

    func testRepeatedAdmissionDoesNotAuthorizeAnotherLiveSend() async throws {
        let box = queue()
        _ = try await box.admitLiveTalk(request: request(), body: body, owner: state.identity(), backendURL: backend)
        do {
            _ = try await box.admitLiveTalk(request: request(), body: body, owner: state.identity(), backendURL: backend)
            XCTFail("A second admission authorized a duplicate live send")
        } catch is BackendTalkQueuedError { }
        let rows = await box.allEntries()
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows.first?.status, .parked)
    }

    func testConflictingAdmissionKeepsBothExactBodiesWithoutSendingEither() async throws {
        let box = queue()
        _ = try await box.admitLiveTalk(request: request(), body: body, owner: state.identity(), backendURL: backend)
        let changed = Data("Different exact words\r\n \t ".utf8)
        do {
            _ = try await box.admitLiveTalk(request: request(), body: changed, owner: state.identity(), backendURL: backend)
            XCTFail("Changed words reused an earlier admission")
        } catch is OfflineTalkPayloadConflictError { }
        let rows = await box.allEntries()
        XCTAssertEqual(rows.count, 2)
        var kept: Set<Data> = []
        for row in rows {
            let artifact = try await box.exportRecoveryEntry(row.id, initiatingIdentity: state.identity(), backendURL: backend)
            let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: artifact.data) as? [String: Any])
            kept.insert(try XCTUnwrap(Data(base64Encoded: try XCTUnwrap(payload["body_base64"] as? String))))
            XCTAssertEqual(row.status, .parked)
        }
        XCTAssertEqual(kept, Set([body, changed]))
    }

    func testBodyWriteFailureCannotAcknowledgeAcceptedCustodyOrPermitDrain() async throws {
        let box = queue()
        let admission = try await box.admitLiveTalk(request: request(), body: body, owner: state.identity(), backendURL: backend)
        let blobs = directory.appendingPathComponent("blobs")
        try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: blobs.path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: blobs.path) }
        do {
            _ = try await box.completeLiveTalk(admission, response: accepted(), responseURL: backend.appendingPathComponent("talk"))
            XCTFail("Failed body write produced a successful live receipt")
        } catch { }
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: blobs.path)
        let reopened = queue()
        let rows = await reopened.allEntries()
        XCTAssertEqual(rows.first?.status, .parked)
        XCTAssertNotEqual(rows.first?.receivedReply, true)
        var sends = 0
        _ = await reopened.drainDue(now: .distantFuture, initiatingIdentity: state.identity(), backendURL: backend) { _ in
            sends += 1; return .init(statusCode: 200)
        }
        XCTAssertEqual(sends, 0)
    }

    func testBrokenIndexCannotBlockASecondAlreadyAcceptedResponse() async throws {
        let box = queue()
        let a = try await box.admitLiveTalk(request: request(), body: body, owner: state.identity(), backendURL: backend)
        var next = request()
        next.setValue("second-live-request", forHTTPHeaderField: "X-Idempotency-Key")
        let b = try await box.admitLiveTalk(request: next, body: body, owner: state.identity(), backendURL: backend)
        let manifest = directory.appendingPathComponent("queue.jsonl"), backup = directory.appendingPathComponent("index-backup")
        try FileManager.default.moveItem(at: manifest, to: backup)
        try FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
        let first = try await box.completeLiveTalk(a, response: accepted(), responseURL: backend.appendingPathComponent("talk"))
        let second = try await box.completeLiveTalk(b, response: accepted(), responseURL: backend.appendingPathComponent("talk"))
        try FileManager.default.removeItem(at: manifest)
        try FileManager.default.moveItem(at: backup, to: manifest)
        let reopened = queue()
        for receipt in [first, second] {
            let reply = try await reopened.receivedReply(receipt.entryID, initiatingIdentity: state.identity(), backendURL: backend)
            XCTAssertEqual(reply.response.body, audio)
            XCTAssertEqual(reply.response.id, receipt.responseID)
        }
        var sends = 0
        _ = await reopened.drainDue(now: .distantFuture, initiatingIdentity: state.identity(), backendURL: backend) { _ in
            sends += 1; return .init(statusCode: 200)
        }
        XCTAssertEqual(sends, 0)
    }

    func testRetiredCapabilityCannotResurrectAcknowledgedWork() async throws {
        let box = queue()
        let a = try await box.admitLiveTalk(request: request(), body: body, owner: state.identity(), backendURL: backend)
        let receipt = try await box.completeLiveTalk(a, response: accepted(), responseURL: backend.appendingPathComponent("talk"))
        try await box.acknowledgeReceivedReply(receipt.entryID, receiptID: receipt.responseID,
            initiatingIdentity: state.identity(), backendURL: backend)
        do {
            _ = try await box.completeLiveTalk(a, response: accepted(), responseURL: backend.appendingPathComponent("talk"))
            XCTFail("An old capability resurrected acknowledged work")
        } catch { }
        let rows = await queue().allEntries()
        XCTAssertTrue(rows.isEmpty)
    }

    private func queue() -> OfflineTalkOutbox {
        let state = state, backend = backend
        return .init(storageDirectory: directory, requestIdentityProvider: { _ in state.identity() }, backendURLProvider: { backend })
    }
    private func request() -> URLRequest {
        var request = URLRequest(url: backend.appendingPathComponent("talk"))
        request.httpMethod = "POST"
        request.setValue(state.identity().userID, forHTTPHeaderField: "X-User-Id")
        request.setValue("Bearer \(state.identity().accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("live-request", forHTTPHeaderField: "X-Idempotency-Key")
        request.setValue("audio/wav", forHTTPHeaderField: "Content-Type")
        return request
    }
    private func accepted() -> OfflineTalkOutboxSendResult {
        .init(statusCode: 200, headers: ["content-type": "audio/mpeg", "x-reply": "Kept scene", "x-turn-id": "live-turn"], body: audio)
    }
}

private nonisolated final class LiveCustodyOwner: @unchecked Sendable {
    private let lock = NSLock()
    private var user = "writer-a"
    private var generation = 1
    func set(_ value: String) { lock.lock(); user = value; generation += 1; lock.unlock() }
    func identity() -> BackendAuthRequestIdentity {
        lock.lock(); defer { lock.unlock() }
        return .init(sessionEpoch: generation, userID: user, clientToken: "fixture-client", accessToken: "fixture-access",
            sessionIntentGeneration: generation)
    }
}

import XCTest
@testable import them

final class OfflineTalkOutboxTests: XCTestCase {
    private var directory: URL!

    override func setUpWithError() throws {
        try super.setUpWithError()
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("OfflineTalkOutboxTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        if let directory {
            try? FileManager.default.removeItem(at: directory)
        }
        directory = nil
        try super.tearDownWithError()
    }

    func testEnqueuePersistsMultipartRequestAndRestoresOnRelaunch() async throws {
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.timeoutInterval = 12
        request.setValue("multipart/form-data; boundary=test", forHTTPHeaderField: "Content-Type")
        request.setValue("idem-1", forHTTPHeaderField: "X-Idempotency-Key")
        let body = Data("hello audio".utf8)

        let result = try await outbox.enqueue(request: request, body: body, reason: "offline")

        XCTAssertEqual(result.snapshot.pendingCount, 1)
        XCTAssertEqual(result.entry.idempotencyKey, "idem-1")
        XCTAssertEqual(result.entry.bodyByteCount, body.count)

        let relaunched = OfflineTalkOutbox(storageDirectory: directory)
        let entries = await relaunched.allEntries()
        XCTAssertEqual(entries.count, 1)
        XCTAssertEqual(entries.first?.idempotencyKey, "idem-1")
        let snapshot = await relaunched.snapshot()
        XCTAssertEqual(snapshot.pendingCount, 1)
    }

    func testDrainDueSendsPendingEntryAndRemovesItOnSuccess() async throws {
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=test", forHTTPHeaderField: "Content-Type")
        request.setValue("idem-success", forHTTPHeaderField: "X-Idempotency-Key")
        let body = Data("queued-body".utf8)

        _ = try await outbox.enqueue(request: request, body: body, reason: "offline")
        var sentBodies: [Data] = []

        let drained = await outbox.drainDue(now: Date().addingTimeInterval(10)) { replayRequest in
            sentBodies.append(replayRequest.httpBody ?? Data())
            XCTAssertEqual(replayRequest.value(forHTTPHeaderField: "X-Idempotency-Key"), "idem-success")
            return OfflineTalkOutboxSendResult(statusCode: 200)
        }

        XCTAssertEqual(sentBodies, [body])
        XCTAssertEqual(drained.pendingCount, 0)
        let entries = await outbox.allEntries()
        XCTAssertEqual(entries, [])
    }

    func testRetryableFailureBacksOffThenDrainsOnLaterSuccess() async throws {
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=test", forHTTPHeaderField: "Content-Type")
        request.setValue("idem-retry", forHTTPHeaderField: "X-Idempotency-Key")

        _ = try await outbox.enqueue(request: request, body: Data("retry".utf8), reason: "503")
        let start = Date().addingTimeInterval(10)
        var calls = 0

        let failed = await outbox.drainDue(now: start) { _ in
            calls += 1
            return OfflineTalkOutboxSendResult(statusCode: 503)
        }

        XCTAssertEqual(calls, 1)
        XCTAssertEqual(failed.pendingCount, 1)
        var entries = await outbox.allEntries()
        XCTAssertEqual(entries.first?.retries, 1)
        XCTAssertEqual(entries.first?.status, .pending)

        let notYet = await outbox.drainDue(now: start.addingTimeInterval(1)) { _ in
            calls += 1
            return OfflineTalkOutboxSendResult(statusCode: 200)
        }

        XCTAssertEqual(calls, 1)
        XCTAssertEqual(notYet.pendingCount, 1)

        entries = await outbox.allEntries()
        let due = Date(timeIntervalSince1970: entries.first?.nextAttemptAt ?? start.timeIntervalSince1970)
        let drained = await outbox.drainDue(now: due.addingTimeInterval(0.1)) { _ in
            calls += 1
            return OfflineTalkOutboxSendResult(statusCode: 200)
        }

        XCTAssertEqual(calls, 2)
        XCTAssertEqual(drained.pendingCount, 0)
        let finalEntries = await outbox.allEntries()
        XCTAssertEqual(finalEntries, [])
    }

    func testNonRetryableClientErrorParksAndCanBeDeleted() async throws {
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=test", forHTTPHeaderField: "Content-Type")
        request.setValue("idem-park", forHTTPHeaderField: "X-Idempotency-Key")

        _ = try await outbox.enqueue(request: request, body: Data("bad".utf8), reason: "400")
        let parked = await outbox.drainDue(now: Date().addingTimeInterval(10)) { _ in
            OfflineTalkOutboxSendResult(statusCode: 400)
        }

        XCTAssertEqual(parked.parkedCount, 1)
        var entries = await outbox.allEntries()
        XCTAssertEqual(entries.first?.status, .parked)

        let cleared = try await outbox.deleteParkedEntries()
        XCTAssertEqual(cleared.parkedCount, 0)
        entries = await outbox.allEntries()
        XCTAssertEqual(entries, [])
    }
}

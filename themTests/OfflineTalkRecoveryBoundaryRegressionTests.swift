import Foundation
import XCTest
@testable import them

final class OfflineTalkRecoveryBoundaryRegressionTests: XCTestCase {
    private var directory: URL!
    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("TalkBoundary-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }
    override func tearDownWithError() throws {
        if let directory { try FileManager.default.removeItem(at: directory) }
        directory = nil
    }

    func testCollidingKeysKeepDifferentAccountsAndBackends() async throws {
        let box = OfflineTalkOutbox(storageDirectory: directory)
        for index in 0..<3 {
            let owner = index == 1 ? "writer-b" : "writer-a"
            let url = index == 2 ? "https://other.them.test/talk" : "https://them.test/talk"
            _ = try? await box.enqueue(request: request(owner: owner, url: url), body: Data("body-\(index)".utf8), reason: "offline")
        }
        let rows = try readEntries()
        XCTAssertEqual(rows.count, 3, "Unrelated work collapsed into one request ID.")
        XCTAssertEqual(Set(try rows.map { try Data(contentsOf: bodyURL($0)) }), Set((0..<3).map { Data("body-\($0)".utf8) }))
    }

    func testChangedBodyCannotAcknowledgeAnEarlierPayload() async throws {
        let box = OfflineTalkOutbox(storageDirectory: directory)
        let owner = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: true).userID
        let req = request(owner: owner, url: BackendAuthClient.resolvedBackendBaseURL().appendingPathComponent("talk").absoluteString)
        let first = Data("First cafe\u{0301}\r\n \t ".utf8), second = Data("Changed exact words\r\n\t".utf8)
        _ = try? await box.enqueue(request: req, body: first, reason: "offline")
        do {
            _ = try await box.enqueue(request: req, body: second, reason: "offline")
            XCTFail("Changed words received an earlier payload's successful queue receipt.")
        } catch { }
        let rows = try readEntries()
        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(Set(try rows.map { try Data(contentsOf: bodyURL($0)) }), Set([first, second]))
    }

    func testForeignParkedWorkIsNotPresentedOrDeleted() async throws {
        let box = OfflineTalkOutbox(storageDirectory: directory)
        let foreign = "foreign-\(UUID().uuidString)"
        XCTAssertNotEqual(BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false).userID, foreign)
        _ = try? await box.enqueue(request: request(owner: foreign), body: Data("Other writer exact words".utf8), reason: "offline")
        var rows = try readEntries()
        XCTAssertEqual(rows.count, 1)
        rows[0].status = .parked
        try writeEntries(rows)
        let reopened = OfflineTalkOutbox(storageDirectory: directory)
        let visible = await reopened.allEntries()
        XCTAssertTrue(visible.isEmpty, "Current account was shown another owner's recovery row.")
        do {
            _ = try await reopened.deleteParkedEntries()
            XCTFail("Current account deleted another owner's parked work.")
        } catch { }
        XCTAssertEqual(try readEntries().count, 1)
        XCTAssertTrue(FileManager.default.fileExists(atPath: bodyURL(rows[0]).path))
    }

    func testAnotherBackendDoesNotConsumeRetryBudget() async throws {
        let box = OfflineTalkOutbox(storageDirectory: directory)
        let owner = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: true).userID
        _ = try? await box.enqueue(request: request(owner: owner, url: "https://different-\(UUID().uuidString).example.invalid/talk"), body: Data("Wrong origin".utf8), reason: "offline")
        _ = await box.drainDue(now: Date().addingTimeInterval(100)) { _ in
            XCTFail("Work was forwarded to another backend.")
            return .init(statusCode: 503)
        }
        XCTAssertEqual(try readEntries().first?.retries, 0, "Unrelated work consumed retry state.")
    }

    private func request(owner: String, url: String = "https://them.test/talk") -> URLRequest {
        var result = URLRequest(url: URL(string: url)!)
        result.httpMethod = "POST"
        result.setValue(owner, forHTTPHeaderField: "X-User-Id")
        result.setValue("same-request-key", forHTTPHeaderField: "X-Idempotency-Key")
        return result
    }
    private func bodyURL(_ entry: OfflineTalkOutboxEntry) -> URL {
        directory.appendingPathComponent("blobs").appendingPathComponent(entry.bodyRef)
    }
    private func readEntries() throws -> [OfflineTalkOutboxEntry] {
        let data = try Data(contentsOf: directory.appendingPathComponent("queue.jsonl"))
        return try String(decoding: data, as: UTF8.self).split(separator: "\n").map { try JSONDecoder().decode(OfflineTalkOutboxEntry.self, from: Data($0.utf8)) }
    }
    private func writeEntries(_ entries: [OfflineTalkOutboxEntry]) throws {
        var data = Data()
        for entry in entries { data.append(try JSONEncoder().encode(entry)); data.append(0x0A) }
        try data.write(to: directory.appendingPathComponent("queue.jsonl"), options: .atomic)
    }
}

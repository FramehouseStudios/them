import Foundation
import XCTest
@testable import them

final class OnboardingInputRecoveryTests: XCTestCase {
    private func root() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("onboarding-input-\(UUID().uuidString)", isDirectory: true)
    }
    private func fields(_ premise: String) -> OnboardingInputFields {
        .init(nameUTF8: Data("  E\u{301}va \t".utf8), premiseUTF8: Data(premise.utf8), nameWasEdited: true, premiseWasEdited: true)
    }
    private func verified(_ result: OnboardingInputWriteResult, file: StaticString = #filePath, line: UInt = #line) throws -> OnboardingInputDescriptor {
        guard case let .verified(value) = result else { XCTFail("Expected verified custody", file: file, line: line); throw CocoaError(.fileWriteUnknown) }
        return value
    }

    func testExactRawUTF8SurvivesRecreationWithTruthfulSchema() throws {
        let directory = root(); defer { try? FileManager.default.removeItem(at: directory) }
        let store = UnassignedLegacyRecoveryVault.onboardingInputs(rootDirectory: directory)
        XCTAssertEqual(store.inventory(), .missing)
        let raw = fields("\r\nINT. CAFE\u{301} - NIGHT\r\n  Keep 👩🏽‍🚀. \t\r\n")
        let descriptor = try verified(store.checkpoint(raw, expected: nil, revisionID: UUID().uuidString))
        let recreated = UnassignedLegacyRecoveryVault.onboardingInputs(rootDirectory: directory)
        XCTAssertEqual(recreated.inventory(), .present(descriptor))
        let copy = try XCTUnwrap(recreated.reveal(expected: descriptor))
        XCTAssertEqual(copy.fields, raw)
        let data = try Data(contentsOf: directory.appendingPathComponent("current.json"))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["provenance"] as? String, "unassigned_onboarding_input")
        for key in ["ownerUserID", "projectID", "backendOrigin", "pendingIntent"] { XCTAssertNil(json[key]) }
    }

    func testFreshWriterAndABACannotOverwriteAnExistingCapture() throws {
        let directory = root(); defer { try? FileManager.default.removeItem(at: directory) }
        let store = UnassignedLegacyRecoveryVault.onboardingInputs(rootDirectory: directory)
        let a = fields("first"), b = fields("second")
        let first = try verified(store.checkpoint(a, expected: nil, revisionID: UUID().uuidString))
        XCTAssertEqual(store.checkpoint(b, expected: nil, revisionID: UUID().uuidString), .occupied(first))
        let second = try verified(store.checkpoint(b, expected: first, revisionID: UUID().uuidString))
        let third = try verified(store.checkpoint(a, expected: second, revisionID: UUID().uuidString))
        XCTAssertNotEqual(first, third)
        XCTAssertEqual(store.checkpoint(b, expected: first, revisionID: UUID().uuidString), .occupied(third))
        XCTAssertFalse(store.discard(expected: first))
        XCTAssertEqual(store.reveal(expected: third)?.fields, a)
        XCTAssertLessThanOrEqual(try FileManager.default.contentsOfDirectory(atPath: directory.path).filter { $0.hasSuffix(".json") }.count, 2)
    }

    func testInterruptedCandidateRemainsRecoverableAndExactRetryFinishesRetirement() throws {
        let directory = root(); defer { try? FileManager.default.removeItem(at: directory) }
        let ordinary = UnassignedLegacyRecoveryVault.onboardingInputs(rootDirectory: directory)
        let old = try verified(ordinary.checkpoint(fields("old"), expected: nil, revisionID: UUID().uuidString))
        let interrupted = UnassignedLegacyRecoveryVault.onboardingInputs(rootDirectory: directory, fileProtectionEnforcer: { url in
            if url.lastPathComponent == "pending.json" { throw CocoaError(.fileWriteNoPermission) }
        })
        let revision = UUID().uuidString, nextFields = fields("new exact bytes")
        XCTAssertEqual(interrupted.checkpoint(nextFields, expected: old, revisionID: revision), .unconfirmed)
        XCTAssertTrue(FileManager.default.fileExists(atPath: directory.appendingPathComponent("current.json").path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: directory.appendingPathComponent("pending.json").path))
        let next = try verified(ordinary.checkpoint(nextFields, expected: old, revisionID: revision))
        XCTAssertEqual(ordinary.reveal(expected: next)?.fields, nextFields)
        XCTAssertFalse(FileManager.default.fileExists(atPath: directory.appendingPathComponent("pending.json").path))
    }

    func testCapAndMalformedEvidenceKeepExistingBytesUntouched() throws {
        let directory = root(); defer { try? FileManager.default.removeItem(at: directory) }
        let store = UnassignedLegacyRecoveryVault.onboardingInputs(rootDirectory: directory)
        let old = try verified(store.checkpoint(fields("preserve me"), expected: nil, revisionID: UUID().uuidString))
        let url = directory.appendingPathComponent("current.json"), before = try Data(contentsOf: url)
        var huge = fields(""); huge.premiseUTF8 = Data(repeating: 97, count: OnboardingInputCustody.maximumCheckpointBytes)
        XCTAssertEqual(store.checkpoint(huge, expected: old, revisionID: UUID().uuidString), .tooLarge)
        XCTAssertEqual(try Data(contentsOf: url), before)
        let corrupt = Data("unconfirmed candidate".utf8), candidate = directory.appendingPathComponent("pending.json")
        try corrupt.write(to: candidate)
        XCTAssertEqual(store.inventory(), .unconfirmed)
        XCTAssertEqual(store.checkpoint(fields("later"), expected: old, revisionID: UUID().uuidString), .unconfirmed)
        XCTAssertFalse(store.discard(expected: old))
        XCTAssertEqual(store.earlierCopyDescriptor(), old)
        XCTAssertEqual(store.revealEarlierCopy(expected: old)?.fields, fields("preserve me"))
        XCTAssertEqual(try Data(contentsOf: candidate), corrupt)
        XCTAssertEqual(try Data(contentsOf: url), before)
    }

    func testEarlierCopyRejectsStaleCurrentAndANewValidPendingCheckpoint() throws {
        let directory = root(); defer { try? FileManager.default.removeItem(at: directory) }
        let store = UnassignedLegacyRecoveryVault.onboardingInputs(rootDirectory: directory)
        let first = try verified(store.checkpoint(fields("earlier"), expected: nil, revisionID: UUID().uuidString))
        let pending = directory.appendingPathComponent("pending.json"), current = directory.appendingPathComponent("current.json")
        let malformed = Data("{\"schemaVersion\":".utf8)
        try malformed.write(to: pending)
        XCTAssertEqual(store.earlierCopyDescriptor(), first)

        // Fixture repair followed by a real canonical advance makes the old selection stale.
        try FileManager.default.removeItem(at: pending)
        let second = try verified(store.checkpoint(fields("new current"), expected: first, revisionID: UUID().uuidString))
        try malformed.write(to: pending)
        let currentBytes = try Data(contentsOf: current)
        XCTAssertNil(store.revealEarlierCopy(expected: first))
        XCTAssertEqual(store.earlierCopyDescriptor(), second)
        XCTAssertEqual(try Data(contentsOf: current), currentBytes)
        XCTAssertEqual(try Data(contentsOf: pending), malformed)

        // A fully written pending checkpoint is healthy even when its original ACK failed.
        try FileManager.default.removeItem(at: pending)
        let interrupted = UnassignedLegacyRecoveryVault.onboardingInputs(rootDirectory: directory, fileProtectionEnforcer: { url in
            if url.lastPathComponent == "pending.json" { throw CocoaError(.fileWriteNoPermission) }
        })
        XCTAssertEqual(interrupted.checkpoint(fields("newest pending"), expected: second, revisionID: UUID().uuidString), .unconfirmed)
        let pendingBytes = try Data(contentsOf: pending)
        guard case .present(let newest) = store.inventory() else { return XCTFail("Valid pending checkpoint should be discoverable") }
        XCTAssertNil(store.earlierCopyDescriptor())
        XCTAssertNil(store.revealEarlierCopy(expected: second))
        XCTAssertEqual(store.reveal(expected: newest)?.fields, fields("newest pending"))
        XCTAssertEqual(try Data(contentsOf: current), currentBytes)
        XCTAssertEqual(try Data(contentsOf: pending), pendingBytes)
    }

    func testEarlierCopyRequiresIndependentCurrentProtection() throws {
        let directory = root(); defer { try? FileManager.default.removeItem(at: directory) }
        let store = UnassignedLegacyRecoveryVault.onboardingInputs(rootDirectory: directory)
        let descriptor = try verified(store.checkpoint(fields("protected earlier"), expected: nil, revisionID: UUID().uuidString))
        let current = directory.appendingPathComponent("current.json"), pending = directory.appendingPathComponent("pending.json")
        let currentBytes = try Data(contentsOf: current), malformed = Data("truncated".utf8)
        try malformed.write(to: pending)
        let unavailable = UnassignedLegacyRecoveryVault.onboardingInputs(rootDirectory: directory, fileProtectionEnforcer: { url in
            if url.lastPathComponent == "current.json" { throw CocoaError(.fileReadNoPermission) }
        })
        XCTAssertNil(unavailable.earlierCopyDescriptor())
        XCTAssertNil(unavailable.revealEarlierCopy(expected: descriptor))
        XCTAssertEqual(try Data(contentsOf: current), currentBytes)
        XCTAssertEqual(try Data(contentsOf: pending), malformed)
    }

    func testDiscardIsExactAndDoesNotAuthorizeAStaleWriter() throws {
        let directory = root(); defer { try? FileManager.default.removeItem(at: directory) }
        let store = UnassignedLegacyRecoveryVault.onboardingInputs(rootDirectory: directory)
        let old = try verified(store.checkpoint(fields("old"), expected: nil, revisionID: UUID().uuidString))
        XCTAssertTrue(store.discard(expected: old)); XCTAssertEqual(store.inventory(), .missing)
        let next = try verified(store.checkpoint(fields("new"), expected: nil, revisionID: UUID().uuidString))
        XCTAssertFalse(store.discard(expected: old))
        XCTAssertEqual(store.checkpoint(fields("stale"), expected: old, revisionID: UUID().uuidString), .occupied(next))
    }

    func testConcurrentAdvancesHaveOneWinnerAndBoundedFiles() throws {
        let directory = root(); defer { try? FileManager.default.removeItem(at: directory) }
        let store = UnassignedLegacyRecoveryVault.onboardingInputs(rootDirectory: directory)
        let initial = try verified(store.checkpoint(fields("initial"), expected: nil, revisionID: UUID().uuidString))
        let results = Results()
        let inputs = [fields("writer one"), fields("writer two")]
        DispatchQueue.concurrentPerform(iterations: 2) { index in
            results.append(store.checkpoint(inputs[index], expected: initial, revisionID: UUID().uuidString))
        }
        XCTAssertEqual(results.values.filter { if case .verified = $0 { true } else { false } }.count, 1)
        XCTAssertEqual(results.values.filter { if case .occupied = $0 { true } else { false } }.count, 1)
        XCTAssertLessThanOrEqual(try FileManager.default.contentsOfDirectory(atPath: directory.path).filter { $0.hasSuffix(".json") }.count, 2)
    }
}

private final class Results: @unchecked Sendable {
    private let lock = NSLock()
    private var results: [OnboardingInputWriteResult] = []
    func append(_ result: OnboardingInputWriteResult) { lock.lock(); defer { lock.unlock() }; results.append(result) }
    var values: [OnboardingInputWriteResult] { lock.lock(); defer { lock.unlock() }; return results }
}

import Foundation
import XCTest
@testable import them

final class ScreenplayRecoveryOverflowStoreTests: XCTestCase {
    @MainActor
    func testExactBytesSurviveStoreRecreation() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let draft = "\r\nINT. CAFE - NIGHT\r\n\r\nCafe\u{301}.  \t\r\n"
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)

        let stored = try storedSnapshot(store.saveIfVacant(
            ownerUserID: " writer-a ",
            projectID: " project-a ",
            draft: draft,
            baseVersionID: "base-a",
            savedAt: 1_700_000_000.125
        ))
        let reopened = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let restored = try presentSnapshot(reopened.load(ownerUserID: "writer-a", projectID: "project-a"))

        XCTAssertEqual(restored, stored)
        XCTAssertEqual(Data(restored.draft.utf8), Data(draft.utf8))
        XCTAssertEqual(restored.savedAt.bitPattern, 1_700_000_000.125.bitPattern)
    }

    @MainActor
    func testOwnerAndProjectScopesRemainIndependent() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        _ = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer-a", projectID: "project-a", draft: "A", baseVersionID: "base-a"
        ))

        XCTAssertEqual(store.load(ownerUserID: "writer-b", projectID: "project-a"), .missing)
        XCTAssertEqual(store.load(ownerUserID: "writer-a", projectID: "project-b"), .missing)
        _ = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer-b", projectID: "project-a", draft: "B", baseVersionID: "base-b"
        ))
        _ = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer-a", projectID: "project-b", draft: "C", baseVersionID: "base-c"
        ))

        XCTAssertEqual(try presentSnapshot(store.load(ownerUserID: "writer-a", projectID: "project-a")).draft, "A")
        XCTAssertEqual(try presentSnapshot(store.load(ownerUserID: "writer-b", projectID: "project-a")).draft, "B")
        XCTAssertEqual(try presentSnapshot(store.load(ownerUserID: "writer-a", projectID: "project-b")).draft, "C")
    }

    @MainActor
    func testDistinctWriteCannotReplaceCommittedCopy() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let original = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", draft: "First\n", baseVersionID: "base-1", savedAt: 1
        ))
        let canonical = try onlyJSONFile(in: root)
        let originalBytes = try Data(contentsOf: canonical)

        let result = store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", draft: "Second\n", baseVersionID: "base-2", savedAt: 2
        )
        guard case .occupied(let occupied) = result else {
            return XCTFail("Expected occupied, got \(result)")
        }

        XCTAssertEqual(occupied, original)
        XCTAssertEqual(try Data(contentsOf: canonical), originalBytes)
        XCTAssertEqual(try presentSnapshot(store.load(ownerUserID: "writer", projectID: "project")), original)
    }

    @MainActor
    func testMatchingWriteReturnsPresentWithoutChangingFile() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let original = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", draft: "Same", baseVersionID: "base", savedAt: 1
        ))
        let canonical = try onlyJSONFile(in: root)
        let originalBytes = try Data(contentsOf: canonical)

        let result = store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", draft: "Same", baseVersionID: "base", savedAt: 999
        )
        guard case .present(let present) = result else {
            return XCTFail("Expected present, got \(result)")
        }

        XCTAssertEqual(present, original)
        XCTAssertEqual(try Data(contentsOf: canonical), originalBytes)
    }

    @MainActor
    func testCanonicallyEquivalentUnicodeBytesRemainDistinct() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let decomposed = "Cafe\u{301}.\r\n"
        let composed = "Caf\u{00E9}.\r\n"
        let original = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", draft: decomposed, baseVersionID: "base"
        ))

        let result = store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", draft: composed, baseVersionID: "base"
        )
        guard case .occupied(let occupied) = result else {
            return XCTFail("Expected occupied, got \(result)")
        }

        XCTAssertEqual(Data(occupied.draft.utf8), Data(decomposed.utf8))
        XCTAssertEqual(occupied.contentDigest, original.contentDigest)
    }

    @MainActor
    func testCorruptCanonicalFileIsKeptAndBlocksReuseAndDeletion() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let original = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", draft: "Protected", baseVersionID: "base"
        ))
        let canonical = try onlyJSONFile(in: root)
        let corrupt = Data("{\"schemaVersion\":1,\"draft\":\"partial".utf8)
        try corrupt.write(to: canonical, options: .atomic)

        XCTAssertEqual(store.load(ownerUserID: "writer", projectID: "project"), .unconfirmed)
        XCTAssertEqual(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", draft: "Replacement", baseVersionID: "new-base"
        ), .unconfirmed)
        XCTAssertEqual(store.deleteIfMatching(
            ownerUserID: "writer", projectID: "project", expected: original
        ), .unconfirmed)
        XCTAssertEqual(try Data(contentsOf: canonical), corrupt)
    }

    @MainActor
    func testStaleSnapshotCannotDeleteNewerRecord() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let stale = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", draft: "Old", baseVersionID: "base-old", savedAt: 1
        ))
        XCTAssertEqual(store.deleteIfMatching(
            ownerUserID: "writer", projectID: "project", expected: stale
        ), .deleted)
        let current = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", draft: "New", baseVersionID: "base-new", savedAt: 2
        ))

        XCTAssertEqual(store.deleteIfMatching(
            ownerUserID: "writer", projectID: "project", expected: stale
        ), .changed)
        XCTAssertEqual(try presentSnapshot(store.load(ownerUserID: "writer", projectID: "project")), current)
    }

    @MainActor
    func testExactDeleteDoesNotTouchOtherProject() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let projectA = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project-a", draft: "A", baseVersionID: "base-a"
        ))
        let projectB = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project-b", draft: "B", baseVersionID: "base-b"
        ))

        XCTAssertEqual(store.deleteIfMatching(
            ownerUserID: "writer", projectID: "project-a", expected: projectA
        ), .deleted)
        XCTAssertEqual(store.load(ownerUserID: "writer", projectID: "project-a"), .missing)
        XCTAssertEqual(try presentSnapshot(store.load(ownerUserID: "writer", projectID: "project-b")), projectB)
    }

    @MainActor
    func testProtectionFailureAfterCandidateWriteLeavesNoRecoveryFile() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(
            rootDirectory: root,
            fileProtectionEnforcer: { url in
                if url.lastPathComponent.hasPrefix(".overflow-") {
                    throw CocoaError(.fileWriteUnknown)
                }
            }
        )

        XCTAssertEqual(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", draft: "Page", baseVersionID: "base"
        ), .unconfirmed)
        XCTAssertTrue(try allFiles(in: root).isEmpty)
    }

    @MainActor
    func testUnreadableProtectedCanonicalFileIsKeptAndBlocksReuse() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let writableStore = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        _ = try storedSnapshot(writableStore.saveIfVacant(
            ownerUserID: "writer", projectID: "project", draft: "Protected", baseVersionID: "base"
        ))
        let canonical = try onlyJSONFile(in: root)
        let originalBytes = try Data(contentsOf: canonical)
        let protectedStore = ScreenplayRecoveryOverflowStore(
            rootDirectory: root,
            fileProtectionEnforcer: { url in
                if url.pathExtension == "json" {
                    throw CocoaError(.fileReadNoPermission)
                }
            }
        )

        XCTAssertEqual(protectedStore.load(ownerUserID: "writer", projectID: "project"), .unconfirmed)
        XCTAssertEqual(protectedStore.saveIfVacant(
            ownerUserID: "writer", projectID: "project", draft: "Replacement", baseVersionID: "new-base"
        ), .unconfirmed)
        XCTAssertEqual(try Data(contentsOf: canonical), originalBytes)
    }

    @MainActor
    func testOversizeDraftFailsClosedWithoutWriting() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let draft = String(repeating: "x", count: ScreenplayRecoveryOverflowStore.maximumDraftBytes + 1)

        XCTAssertEqual(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", draft: draft, baseVersionID: "base"
        ), .unconfirmed)
        XCTAssertFalse(FileManager.default.fileExists(atPath: root.path))
    }

    private func temporaryRoot() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("screenplay-overflow-tests-\(UUID().uuidString)", isDirectory: true)
    }

    private func allFiles(in root: URL) throws -> [URL] {
        guard FileManager.default.fileExists(atPath: root.path) else { return [] }
        let enumerator = FileManager.default.enumerator(
            at: root,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: []
        )
        return (enumerator?.allObjects as? [URL] ?? []).filter {
            (try? $0.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true
        }
    }

    private func onlyJSONFile(in root: URL) throws -> URL {
        let files = try allFiles(in: root).filter { $0.pathExtension == "json" }
        return try XCTUnwrap(files.first, "Expected a canonical JSON file")
    }

    private func storedSnapshot(
        _ result: ScreenplayRecoveryOverflowWriteResult,
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws -> ScreenplayRecoveryOverflowSnapshot {
        guard case .stored(let snapshot) = result else {
            XCTFail("Expected stored, got \(result)", file: file, line: line)
            throw TestError.unexpectedResult
        }
        return snapshot
    }

    private func presentSnapshot(
        _ result: ScreenplayRecoveryOverflowLoadResult,
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws -> ScreenplayRecoveryOverflowSnapshot {
        guard case .present(let snapshot) = result else {
            XCTFail("Expected present, got \(result)", file: file, line: line)
            throw TestError.unexpectedResult
        }
        return snapshot
    }

    private enum TestError: Error {
        case unexpectedResult
    }
}

import Foundation
import XCTest
@testable import them

final class ScreenplayRecoveryOverflowStoreTests: XCTestCase {
    private let backend = URL(string: "https://api.them.test/v1")!

    @MainActor
    func testExactBytesSurviveStoreRecreation() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let draft = "\r\nINT. CAFE - NIGHT\r\n\r\nCafe\u{301}.  \t\r\n"
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)

        let stored = try storedSnapshot(store.saveIfVacant(
            ownerUserID: " writer-a ",
            projectID: " project-a ",
            backendURL: backend,
            documentID: "document",
            draft: draft,
            baseVersionID: "base-a",
            savedAt: 1_700_000_000.125
        ))
        let reopened = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let restored = try presentSnapshot(reopened.load(ownerUserID: "writer-a", projectID: "project-a", backendURL: backend, documentID: "document"))

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
            ownerUserID: "writer-a", projectID: "project-a", backendURL: backend, documentID: "document", draft: "A", baseVersionID: "base-a"
        ))

        XCTAssertEqual(store.load(ownerUserID: "writer-b", projectID: "project-a", backendURL: backend, documentID: "document"), .missing)
        XCTAssertEqual(store.load(ownerUserID: "writer-a", projectID: "project-b", backendURL: backend, documentID: "document"), .missing)
        _ = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer-b", projectID: "project-a", backendURL: backend, documentID: "document", draft: "B", baseVersionID: "base-b"
        ))
        _ = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer-a", projectID: "project-b", backendURL: backend, documentID: "document", draft: "C", baseVersionID: "base-c"
        ))

        XCTAssertEqual(try presentSnapshot(store.load(ownerUserID: "writer-a", projectID: "project-a", backendURL: backend, documentID: "document")).draft, "A")
        XCTAssertEqual(try presentSnapshot(store.load(ownerUserID: "writer-b", projectID: "project-a", backendURL: backend, documentID: "document")).draft, "B")
        XCTAssertEqual(try presentSnapshot(store.load(ownerUserID: "writer-a", projectID: "project-b", backendURL: backend, documentID: "document")).draft, "C")
    }

    @MainActor
    func testDistinctWriteCannotReplaceCommittedCopy() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let original = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document", draft: "First\n", baseVersionID: "base-1", savedAt: 1
        ))
        let canonical = try onlyJSONFile(in: root)
        let originalBytes = try Data(contentsOf: canonical)

        let result = store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document", draft: "Second\n", baseVersionID: "base-2", savedAt: 2
        )
        guard case .occupied(let occupied) = result else {
            return XCTFail("Expected occupied, got \(result)")
        }

        XCTAssertEqual(occupied, original)
        XCTAssertEqual(try Data(contentsOf: canonical), originalBytes)
        XCTAssertEqual(try presentSnapshot(store.load(ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document")), original)
    }

    @MainActor
    func testMatchingWriteReturnsPresentWithoutChangingFile() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let original = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document", draft: "Same", baseVersionID: "base", savedAt: 1
        ))
        let canonical = try onlyJSONFile(in: root)
        let originalBytes = try Data(contentsOf: canonical)

        let result = store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document", draft: "Same", baseVersionID: "base", savedAt: 999
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
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document", draft: decomposed, baseVersionID: "base"
        ))

        let result = store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document", draft: composed, baseVersionID: "base"
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
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document", draft: "Protected", baseVersionID: "base"
        ))
        let canonical = try onlyJSONFile(in: root)
        let corrupt = Data("{\"schemaVersion\":1,\"draft\":\"partial".utf8)
        try corrupt.write(to: canonical, options: .atomic)

        XCTAssertEqual(store.load(ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document"), .unconfirmed)
        XCTAssertEqual(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document", draft: "Replacement", baseVersionID: "new-base"
        ), .unconfirmed)
        XCTAssertEqual(store.deleteIfMatching(
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document", expected: original
        ), .unconfirmed)
        XCTAssertEqual(try Data(contentsOf: canonical), corrupt)
    }

    @MainActor
    func testStaleSnapshotCannotDeleteNewerRecord() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let stale = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document", draft: "Old", baseVersionID: "base-old", savedAt: 1
        ))
        XCTAssertEqual(store.deleteIfMatching(
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document", expected: stale
        ), .deleted)
        let current = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document", draft: "New", baseVersionID: "base-new", savedAt: 2
        ))

        XCTAssertEqual(store.deleteIfMatching(
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document", expected: stale
        ), .changed)
        XCTAssertEqual(try presentSnapshot(store.load(ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document")), current)
    }

    @MainActor
    func testExactDeleteDoesNotTouchOtherProject() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let projectA = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project-a", backendURL: backend, documentID: "document", draft: "A", baseVersionID: "base-a"
        ))
        let projectB = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project-b", backendURL: backend, documentID: "document", draft: "B", baseVersionID: "base-b"
        ))

        XCTAssertEqual(store.deleteIfMatching(
            ownerUserID: "writer", projectID: "project-a", backendURL: backend, documentID: "document", expected: projectA
        ), .deleted)
        XCTAssertEqual(store.load(ownerUserID: "writer", projectID: "project-a", backendURL: backend, documentID: "document"), .missing)
        XCTAssertEqual(try presentSnapshot(store.load(ownerUserID: "writer", projectID: "project-b", backendURL: backend, documentID: "document")), projectB)
    }

    @MainActor
    func testProtectionFailureAfterCandidateWriteLeavesDiscoverableRecoveryEvidence() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(
            rootDirectory: root,
            fileProtectionEnforcer: { url in
                if url.lastPathComponent.contains(".pending.") {
                    throw CocoaError(.fileWriteUnknown)
                }
            }
        )

        XCTAssertEqual(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document", draft: "Page", baseVersionID: "base"
        ), .unconfirmed)
        XCTAssertEqual(try pendingJSONFiles(in: root).count, 1)

        let reopened = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let restored = try presentSnapshot(reopened.discover(
            ownerUserID: "writer", projectID: "project", backendURL: backend
        ))
        XCTAssertEqual(restored.draft, "Page")
        XCTAssertEqual(restored.baseVersionID, "base")
    }

    @MainActor
    func testUnreadableProtectedCanonicalFileIsKeptAndBlocksReuse() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let writableStore = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        _ = try storedSnapshot(writableStore.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document", draft: "Protected", baseVersionID: "base"
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

        XCTAssertEqual(protectedStore.load(ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document"), .unconfirmed)
        XCTAssertEqual(protectedStore.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document", draft: "Replacement", baseVersionID: "new-base"
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
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document", draft: draft, baseVersionID: "base"
        ), .unconfirmed)
        XCTAssertFalse(FileManager.default.fileExists(atPath: root.path))
    }

    @MainActor
    func testPendingRecordSurvivesRelaunchAndIsPromotedWithoutByteChanges() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let original = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document", draft: "Exact\r\nbytes  \t\n", baseVersionID: "base", savedAt: 42.25
        ))
        let canonical = try onlyJSONFile(in: root)
        let originalBytes = try Data(contentsOf: canonical)
        let pending = pendingURL(for: original, canonical: canonical)
        try FileManager.default.moveItem(at: canonical, to: pending)

        let reopened = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let restored = try presentSnapshot(reopened.load(
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document"
        ))

        XCTAssertEqual(restored, original)
        XCTAssertEqual(Data(restored.draft.utf8), Data(original.draft.utf8))
        XCTAssertEqual(try Data(contentsOf: onlyJSONFile(in: root)), originalBytes)
        XCTAssertFalse(FileManager.default.fileExists(atPath: pending.path))
    }

    @MainActor
    func testDistinctPendingRecordsFailClosedAndRemainUnchanged() throws {
        let root = temporaryRoot()
        let secondRoot = temporaryRoot()
        defer {
            try? FileManager.default.removeItem(at: root)
            try? FileManager.default.removeItem(at: secondRoot)
        }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let first = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document", draft: "First", baseVersionID: "base-1", savedAt: 1
        ))
        let canonical = try onlyJSONFile(in: root)
        let firstPending = pendingURL(for: first, canonical: canonical)
        try FileManager.default.moveItem(at: canonical, to: firstPending)

        let secondStore = ScreenplayRecoveryOverflowStore(rootDirectory: secondRoot)
        let second = try storedSnapshot(secondStore.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document", draft: "Second", baseVersionID: "base-2", savedAt: 2
        ))
        let secondCanonical = try onlyJSONFile(in: secondRoot)
        let secondPending = pendingURL(for: second, canonical: canonical)
        try FileManager.default.copyItem(at: secondCanonical, to: secondPending)
        let firstBytes = try Data(contentsOf: firstPending)
        let secondBytes = try Data(contentsOf: secondPending)

        XCTAssertEqual(store.load(
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document"
        ), .unconfirmed)
        XCTAssertEqual(try Data(contentsOf: firstPending), firstBytes)
        XCTAssertEqual(try Data(contentsOf: secondPending), secondBytes)
    }

    @MainActor
    func testCorruptPendingRecordBlocksReuseAndExactDeletionWithoutMutation() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let original = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document", draft: "Original", baseVersionID: "base"
        ))
        let canonical = try onlyJSONFile(in: root)
        let corruptID = UUID().uuidString.lowercased()
        let corrupt = canonical.deletingLastPathComponent().appendingPathComponent(
            ".\(canonical.deletingPathExtension().lastPathComponent).pending.\(corruptID).json"
        )
        let corruptBytes = Data("{\"draft\":\"partial".utf8)
        try corruptBytes.write(to: corrupt)

        XCTAssertEqual(store.load(
            ownerUserID: "writer", projectID: "project", backendURL: backend, documentID: "document"
        ), .unconfirmed)
        XCTAssertEqual(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document", draft: "Replacement", baseVersionID: "new"
        ), .unconfirmed)
        XCTAssertEqual(store.deleteIfMatching(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document", expected: original
        ), .unconfirmed)
        XCTAssertEqual(try Data(contentsOf: corrupt), corruptBytes)
    }

    @MainActor
    func testExactDeleteRemovesCandidateOnlyRecord() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let original = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document", draft: "Candidate", baseVersionID: "base"
        ))
        let canonical = try onlyJSONFile(in: root)
        let pending = pendingURL(for: original, canonical: canonical)
        try FileManager.default.moveItem(at: canonical, to: pending)

        XCTAssertEqual(store.deleteIfMatching(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document", expected: original
        ), .deleted)
        XCTAssertTrue(try allJSONFiles(in: root).isEmpty)
    }

    @MainActor
    func testBackendAndDocumentOriginsAreIndependentAndInvalidOriginFailsClosed() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let original = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "shared-project", backendURL: backend,
            documentID: "document-a", draft: "A", baseVersionID: "base"
        ))
        let otherBackend = URL(string: "https://other.them.test/v1")!

        XCTAssertEqual(store.load(
            ownerUserID: "writer", projectID: "shared-project", backendURL: otherBackend,
            documentID: "document-a"
        ), .missing)
        XCTAssertEqual(store.load(
            ownerUserID: "writer", projectID: "shared-project", backendURL: backend,
            documentID: "document-b"
        ), .missing)
        XCTAssertEqual(store.deleteIfMatching(
            ownerUserID: "writer", projectID: "shared-project", backendURL: otherBackend,
            documentID: "document-a", expected: original
        ), .changed)
        XCTAssertEqual(store.load(
            ownerUserID: "writer", projectID: "shared-project",
            backendURL: URL(fileURLWithPath: "/tmp/not-a-backend"), documentID: "document-a"
        ), .unconfirmed)
        XCTAssertEqual(try presentSnapshot(store.load(
            ownerUserID: "writer", projectID: "shared-project", backendURL: backend,
            documentID: "document-a"
        )), original)
    }

    @MainActor
    func testDiscoverSurvivesDocumentRotationAndWrongDocumentCannotDelete() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let original = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document-a", draft: "Protected words", baseVersionID: "base"
        ))

        XCTAssertEqual(try presentSnapshot(store.discover(
            ownerUserID: "writer", projectID: "project", backendURL: backend
        )), original)
        XCTAssertEqual(store.load(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document-b"
        ), .missing)
        XCTAssertEqual(store.deleteIfMatching(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document-b", expected: original
        ), .changed)
        XCTAssertEqual(try presentSnapshot(store.discover(
            ownerUserID: "writer", projectID: "project", backendURL: backend
        )), original)
    }

    @MainActor
    func testDifferentDocumentCannotClaimOccupiedProjectBackendLocator() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let original = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document-a", draft: "A", baseVersionID: "base-a"
        ))

        XCTAssertEqual(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document-b", draft: "B", baseVersionID: "base-b"
        ), .occupied(original))
        XCTAssertEqual(store.load(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document-b"
        ), .missing)
        XCTAssertEqual(try presentSnapshot(store.discover(
            ownerUserID: "writer", projectID: "project", backendURL: backend
        )), original)
    }

    @MainActor
    func testLocatorOnlyCrashIsCleanedWithoutInventingRecoveryBytes() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let interrupted = ScreenplayRecoveryOverflowStore(
            rootDirectory: root,
            fileProtectionEnforcer: { url in
                if url.lastPathComponent.contains(".locator.json") {
                    throw CocoaError(.fileWriteUnknown)
                }
            }
        )

        XCTAssertEqual(interrupted.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document", draft: "Never written", baseVersionID: "base"
        ), .unconfirmed)
        XCTAssertEqual(try locatorJSONFiles(in: root).count, 1)
        XCTAssertTrue(try recoveryJSONFiles(in: root).isEmpty)

        let reopened = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        XCTAssertEqual(reopened.discover(
            ownerUserID: "writer", projectID: "project", backendURL: backend
        ), .missing)
        XCTAssertTrue(try locatorJSONFiles(in: root).isEmpty)
    }

    @MainActor
    func testExactDeleteRetiresLocatorAndAllowsNewDocument() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let first = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document-a", draft: "A", baseVersionID: "base-a"
        ))
        XCTAssertEqual(store.deleteIfMatching(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document-a", expected: first
        ), .deleted)
        XCTAssertEqual(store.discover(
            ownerUserID: "writer", projectID: "project", backendURL: backend
        ), .missing)

        let second = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document-b", draft: "B", baseVersionID: "base-b"
        ))
        XCTAssertEqual(try presentSnapshot(store.discover(
            ownerUserID: "writer", projectID: "project", backendURL: backend
        )), second)
    }

    @MainActor
    func testExactLoadBackfillsMissingLocatorForExistingRecord() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let original = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document", draft: "Legacy v2 file", baseVersionID: "base"
        ))
        for locator in try locatorJSONFiles(in: root) {
            try FileManager.default.removeItem(at: locator)
        }

        XCTAssertEqual(try presentSnapshot(store.load(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document"
        )), original)
        XCTAssertEqual(try locatorJSONFiles(in: root).count, 1)
        XCTAssertEqual(try presentSnapshot(store.discover(
            ownerUserID: "writer", projectID: "project", backendURL: backend
        )), original)
    }

    @MainActor
    func testCorruptLocatorBlocksDiscoverySaveAndDeletionWithoutMutation() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ScreenplayRecoveryOverflowStore(rootDirectory: root)
        let original = try storedSnapshot(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document-a", draft: "Protected", baseVersionID: "base"
        ))
        let canonical = try onlyJSONFile(in: root)
        let canonicalBytes = try Data(contentsOf: canonical)
        let locator = try XCTUnwrap(locatorJSONFiles(in: root).first)
        let corruptBytes = Data("{\"documentID\":\"partial".utf8)
        try corruptBytes.write(to: locator, options: .atomic)

        XCTAssertEqual(store.discover(
            ownerUserID: "writer", projectID: "project", backendURL: backend
        ), .unconfirmed)
        XCTAssertEqual(store.saveIfVacant(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document-b", draft: "Replacement", baseVersionID: "new"
        ), .unconfirmed)
        XCTAssertEqual(store.deleteIfMatching(
            ownerUserID: "writer", projectID: "project", backendURL: backend,
            documentID: "document-a", expected: original
        ), .unconfirmed)
        XCTAssertEqual(try Data(contentsOf: locator), corruptBytes)
        XCTAssertEqual(try Data(contentsOf: canonical), canonicalBytes)
    }

    func testExclusiveLocatorCreationHasExactlyOneWinnerUnderContention() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        for iteration in 0..<100 {
            let destination = root.appendingPathComponent("locator-\(iteration)")
            let payloads = [Data("A".utf8), Data("B".utf8)]
            let results = CreationResults()

            DispatchQueue.concurrentPerform(iterations: 2) { index in
                results.append(ScreenplayRecoveryExclusiveFileCreation.create(
                    payloads[index], at: destination
                ))
            }

            XCTAssertEqual(results.values.filter { $0 == .created }.count, 1)
            XCTAssertEqual(results.values.filter { $0 == .destinationExists }.count, 1)
            XCTAssertTrue(payloads.contains(try Data(contentsOf: destination)))
        }
    }

    func testExclusivePromotionHasExactlyOneWinnerUnderContention() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        for iteration in 0..<100 {
            let directory = root.appendingPathComponent("race-\(iteration)", isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let sources = [directory.appendingPathComponent("a"), directory.appendingPathComponent("b")]
            try Data("A".utf8).write(to: sources[0])
            try Data("B".utf8).write(to: sources[1])
            let destination = directory.appendingPathComponent("destination")
            let results = PromotionResults()

            DispatchQueue.concurrentPerform(iterations: 2) { index in
                results.append(ScreenplayRecoveryExclusiveFilePromotion.promote(
                    source: sources[index], destination: destination
                ))
            }

            XCTAssertEqual(results.values.filter { $0 == .promoted }.count, 1)
            XCTAssertEqual(results.values.filter { $0 == .destinationExists }.count, 1)
            XCTAssertTrue([Data("A".utf8), Data("B".utf8)].contains(try Data(contentsOf: destination)))
            XCTAssertEqual(sources.filter { FileManager.default.fileExists(atPath: $0.path) }.count, 1)
        }
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

    private func allJSONFiles(in root: URL) throws -> [URL] {
        try allFiles(in: root).filter { $0.pathExtension == "json" }
    }

    private func locatorJSONFiles(in root: URL) throws -> [URL] {
        try allJSONFiles(in: root).filter { $0.lastPathComponent.contains(".locator.json") }
    }

    private func recoveryJSONFiles(in root: URL) throws -> [URL] {
        try allJSONFiles(in: root).filter { !$0.lastPathComponent.contains(".locator.json") }
    }

    private func pendingJSONFiles(in root: URL) throws -> [URL] {
        try allJSONFiles(in: root).filter { $0.lastPathComponent.contains(".pending.") }
    }

    private func onlyJSONFile(in root: URL) throws -> URL {
        let files = try recoveryJSONFiles(in: root).filter { !$0.lastPathComponent.contains(".pending.") }
        return try XCTUnwrap(files.first, "Expected a canonical JSON file")
    }

    private func pendingURL(
        for snapshot: ScreenplayRecoveryOverflowSnapshot,
        canonical: URL
    ) -> URL {
        let digest = canonical.deletingPathExtension().lastPathComponent
        return canonical.deletingLastPathComponent().appendingPathComponent(
            ".\(digest).pending.\(snapshot.recordID).json"
        )
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

    private final class PromotionResults: @unchecked Sendable {
        private let lock = NSLock()
        private var storage: [ScreenplayRecoveryExclusivePromotionResult] = []

        var values: [ScreenplayRecoveryExclusivePromotionResult] {
            lock.lock()
            defer { lock.unlock() }
            return storage
        }

        func append(_ value: ScreenplayRecoveryExclusivePromotionResult) {
            lock.lock()
            storage.append(value)
            lock.unlock()
        }
    }

    private final class CreationResults: @unchecked Sendable {
        private let lock = NSLock()
        private var storage: [ScreenplayRecoveryExclusiveCreationResult] = []

        var values: [ScreenplayRecoveryExclusiveCreationResult] {
            lock.lock()
            defer { lock.unlock() }
            return storage
        }

        func append(_ value: ScreenplayRecoveryExclusiveCreationResult) {
            lock.lock()
            storage.append(value)
            lock.unlock()
        }
    }
}

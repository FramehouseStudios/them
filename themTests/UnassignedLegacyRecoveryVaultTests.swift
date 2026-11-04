import Foundation
import XCTest
@testable import them

final class UnassignedLegacyRecoveryVaultTests: XCTestCase {
    func testDeviceRecoveryEligibilityRejectsAccountAndInconsistentHints() {
        let base = "screenplay.studio.localDraftRecovery.v1"
        let outbox = "screenplay-draft-save-outbox"
        XCTAssertTrue(UnassignedDeviceRecoveryPolicy.allows(slot: .ordinary, ownerHint: "", storageKey: base))
        XCTAssertTrue(UnassignedDeviceRecoveryPolicy.allows(slot: .draftSaveOutbox, ownerHint: "", storageKey: outbox))
        XCTAssertFalse(UnassignedDeviceRecoveryPolicy.allows(slot: .ordinary, ownerHint: "writer-a", storageKey: base))
        XCTAssertFalse(UnassignedDeviceRecoveryPolicy.allows(slot: .ordinary, ownerHint: "", storageKey: base + ".owner.d3JpdGVyLWE"))
        XCTAssertFalse(UnassignedDeviceRecoveryPolicy.allows(slot: .draftSaveOutbox, ownerHint: "writer-a", storageKey: outbox))
        XCTAssertFalse(UnassignedDeviceRecoveryPolicy.allows(slot: .draftSaveOutbox, ownerHint: "", storageKey: base))
    }

    @MainActor
    func testPropertyListCopyRevealsExactUTF8AndExportsUnknownOrigin() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let vault = UnassignedLegacyRecoveryVault(rootDirectory: root)
        let draft = "\r\nINT. CAFE - NIGHT\r\nCafe\u{301}.  \t\r\n"
        let source = try UnassignedLegacyRecoverySource.propertyList(
            ownerHint: "writer-a",
            projectHint: "project-a",
            legacyStorageKeyHint: "legacy-owner-key",
            slot: .ordinary,
            candidate: [
                "draft": draft,
                "baseVersionId": "base-a",
                "dirty": true,
                "savedAt": 1_700_000_000.125,
            ]
        )

        let descriptor = try verifiedDescriptor(vault.preserve(source, capturedAt: 42.25))
        XCTAssertEqual(descriptor.provenance, "unassigned_legacy_origin")
        XCTAssertEqual(descriptor.sourceByteCount, source.payload.count)
        let record = try revealedRecord(vault.reveal(recordID: descriptor.recordID))
        XCTAssertEqual(record.sourcePayload, source.payload)
        XCTAssertEqual(record.decodedFields?.draftUTF8, Data(draft.utf8))
        XCTAssertEqual(record.decodedFields?.baseVersionUTF8, Data("base-a".utf8))
        XCTAssertEqual(record.decodedFields?.savedAt.bitPattern, 1_700_000_000.125.bitPattern)

        let artifact = try exportArtifact(vault.export(recordID: descriptor.recordID, exportedAt: 100))
        XCTAssertEqual(artifact.mimeType, "application/json")
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: artifact.data) as? [String: Any])
        XCTAssertEqual(json["provenance"] as? String, "unassigned_legacy_origin")
        XCTAssertTrue((json["warning"] as? String)?.contains("must not be auto-attributed") == true)
        XCTAssertEqual(Data(base64Encoded: try XCTUnwrap(json["sourcePayload"] as? String)), source.payload)
        XCTAssertNil(json["backendOrigin"])
        XCTAssertNil(json["documentID"])
    }

    @MainActor
    func testRepeatedUpgradeIsIdempotentAndChangedDowngradeCopyIsAdditional() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let vault = UnassignedLegacyRecoveryVault(rootDirectory: root)
        let first = opaqueSource(Data("first exact copy".utf8))
        let firstDescriptor = try verifiedDescriptor(vault.preserve(first, capturedAt: 1))
        guard case .alreadyVerified(let repeated) = vault.preserve(first, capturedAt: 999) else {
            return XCTFail("Expected exact re-upgrade to reuse the verified record")
        }
        XCTAssertEqual(repeated, firstDescriptor)

        let second = opaqueSource(Data("second downgrade copy".utf8))
        let secondDescriptor = try verifiedDescriptor(vault.preserve(second, capturedAt: 2))
        XCTAssertNotEqual(secondDescriptor.recordID, firstDescriptor.recordID)
        let inventory = try availableInventory(vault.inventory())
        XCTAssertEqual(inventory.records.map(\.recordID).sorted(),
                       [firstDescriptor.recordID, secondDescriptor.recordID].sorted())
        XCTAssertEqual(inventory.unconfirmedEvidenceCount, 0)
    }

    @MainActor
    func testReconstructedPropertyListSourceIsDeterministic() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let vault = UnassignedLegacyRecoveryVault(rootDirectory: root)
        func source() throws -> UnassignedLegacyRecoverySource {
            try .propertyList(
                ownerHint: "writer", projectHint: "project", legacyStorageKeyHint: "legacy",
                slot: .ordinary,
                candidate: [
                    "draft": "Cafe\u{301}", "baseVersionId": "base", "dirty": true, "savedAt": 42.25,
                ]
            )
        }
        let firstSource = try source()
        let first = try verifiedDescriptor(vault.preserve(firstSource, capturedAt: 1))
        let reconstructed = try source()
        XCTAssertEqual(reconstructed.payload, firstSource.payload)
        guard case .alreadyVerified(let repeated) = vault.preserve(reconstructed, capturedAt: 2) else {
            return XCTFail("Expected deterministic property-list reconstruction")
        }
        XCTAssertEqual(repeated, first)
    }

    func testPropertyListConstructorRejectsExtraFieldsInsteadOfDroppingEvidence() {
        XCTAssertThrowsError(try UnassignedLegacyRecoverySource.propertyList(
            ownerHint: "writer", projectHint: "project", legacyStorageKeyHint: "legacy",
            slot: .ordinary,
            candidate: [
                "draft": "words", "baseVersionId": "base", "dirty": true, "savedAt": 1.0,
                "unexpected": "must not be silently dropped",
            ]
        ))
    }

    @MainActor
    func testCorruptOpaqueInputIsPreservedAndExportedWithoutInventedFields() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let vault = UnassignedLegacyRecoveryVault(rootDirectory: root)
        let source = UnassignedLegacyRecoverySource(
            ownerHint: "anonymous",
            projectHint: "possibly-project",
            legacyStorageKeyHint: "legacy",
            slot: .preservedConflict,
            encoding: .binaryPropertyList,
            payload: Data([0x00, 0xff, 0x13, 0x37])
        )
        let descriptor = try verifiedDescriptor(vault.preserve(source, capturedAt: 1))
        let record = try revealedRecord(vault.reveal(recordID: descriptor.recordID))
        XCTAssertEqual(record.sourcePayload, source.payload)
        XCTAssertNil(record.decodedFields)
        let export = try exportArtifact(vault.export(recordID: descriptor.recordID, exportedAt: 2))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: export.data) as? [String: Any])
        XCTAssertEqual(Data(base64Encoded: try XCTUnwrap(json["sourcePayload"] as? String)), source.payload)
    }

    @MainActor
    func testProtectionInterruptionLeavesSourceUnretiredAndRetryPromotesCandidate() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let source = opaqueSource(Data("writer words".utf8))
        let interrupted = UnassignedLegacyRecoveryVault(
            rootDirectory: root,
            fileProtectionEnforcer: { url in
                if url.lastPathComponent.contains(".pending.") {
                    throw CocoaError(.fileWriteUnknown)
                }
            }
        )
        XCTAssertEqual(interrupted.preserve(source, capturedAt: 1), .unconfirmed)
        XCTAssertEqual(source.payload, Data("writer words".utf8), "Caller-owned source remains unchanged")
        XCTAssertEqual(try regularFiles(in: root).filter { $0.lastPathComponent.contains(".pending.") }.count, 1)

        let reopened = UnassignedLegacyRecoveryVault(rootDirectory: root)
        let descriptor = try verifiedDescriptor(reopened.preserve(source, capturedAt: 2))
        XCTAssertEqual(try revealedRecord(reopened.reveal(recordID: descriptor.recordID)).sourcePayload, source.payload)
    }

    @MainActor
    func testCorruptCanonicalBlocksReplacementAndRemainsByteExact() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let vault = UnassignedLegacyRecoveryVault(rootDirectory: root)
        let source = opaqueSource(Data("writer words".utf8))
        let descriptor = try verifiedDescriptor(vault.preserve(source, capturedAt: 1))
        let canonical = root.appendingPathComponent("\(descriptor.recordID).json")
        let corrupt = Data("{\"partial\":".utf8)
        try corrupt.write(to: canonical, options: .atomic)

        XCTAssertEqual(vault.preserve(source, capturedAt: 2), .unconfirmed)
        XCTAssertEqual(vault.reveal(recordID: descriptor.recordID), .unconfirmed)
        XCTAssertEqual(vault.export(recordID: descriptor.recordID), .unconfirmed)
        XCTAssertEqual(try Data(contentsOf: canonical), corrupt)
        let inventory = try availableInventory(vault.inventory())
        XCTAssertTrue(inventory.records.isEmpty)
        XCTAssertEqual(inventory.unconfirmedEvidenceCount, 1)
    }

    @MainActor
    func testOversizedSourceAndInvalidRecordIDFailClosedWithoutWriting() {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let vault = UnassignedLegacyRecoveryVault(rootDirectory: root)
        let source = opaqueSource(Data(repeating: 0x78,
            count: UnassignedLegacyRecoveryVault.maximumSourceBytes + 1))
        XCTAssertEqual(vault.preserve(source), .unconfirmed)
        XCTAssertFalse(FileManager.default.fileExists(atPath: root.path))
        XCTAssertEqual(vault.reveal(recordID: "../../escape"), .unconfirmed)
        XCTAssertEqual(vault.export(recordID: "../../escape"), .unconfirmed)
    }

    private func opaqueSource(_ payload: Data) -> UnassignedLegacyRecoverySource {
        UnassignedLegacyRecoverySource(
            ownerHint: "writer",
            projectHint: "project",
            legacyStorageKeyHint: "screenplay.studio.localDraftRecovery.v1.owner",
            slot: .ordinary,
            encoding: .opaque,
            payload: payload
        )
    }

    private func temporaryRoot() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("legacy-recovery-vault-tests-\(UUID().uuidString)", isDirectory: true)
    }

    private func regularFiles(in root: URL) throws -> [URL] {
        guard FileManager.default.fileExists(atPath: root.path) else { return [] }
        return try FileManager.default.contentsOfDirectory(
            at: root,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: []
        ).filter { (try? $0.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true }
    }

    private func verifiedDescriptor(
        _ result: UnassignedLegacyRecoveryPreservationResult,
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws -> UnassignedLegacyRecoveryDescriptor {
        guard case .verified(let descriptor) = result else {
            XCTFail("Expected verified, got \(result)", file: file, line: line)
            throw TestError.unexpectedResult
        }
        return descriptor
    }

    private func revealedRecord(
        _ result: UnassignedLegacyRecoveryRevealResult,
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws -> UnassignedLegacyRecoveryRecord {
        guard case .present(let record) = result else {
            XCTFail("Expected present, got \(result)", file: file, line: line)
            throw TestError.unexpectedResult
        }
        return record
    }

    private func availableInventory(
        _ result: UnassignedLegacyRecoveryInventoryResult,
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws -> UnassignedLegacyRecoveryInventory {
        guard case .available(let inventory) = result else {
            XCTFail("Expected inventory, got \(result)", file: file, line: line)
            throw TestError.unexpectedResult
        }
        return inventory
    }

    private func exportArtifact(
        _ result: UnassignedLegacyRecoveryExportResult,
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws -> UnassignedLegacyRecoveryExportArtifact {
        guard case .available(let artifact) = result else {
            XCTFail("Expected export, got \(result)", file: file, line: line)
            throw TestError.unexpectedResult
        }
        return artifact
    }

    private enum TestError: Error {
        case unexpectedResult
    }
}

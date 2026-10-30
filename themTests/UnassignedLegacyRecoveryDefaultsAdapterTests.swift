import Foundation
import XCTest
@testable import them

final class UnassignedLegacyRecoveryDefaultsAdapterTests: XCTestCase {
    @MainActor
    func testInventoryFindsRootAndOwnerScopedSlotsWithoutOriginAttribution() throws {
        let context = makeContext()
        defer { context.cleanup() }
        let ownerKey = storageKey(baseKey: context.baseKey, owner: "writer-a")
        context.defaults.set([
            "project-a": projectPayload(ordinary: "Ordinary", preserved: "Preserved"),
        ], forKey: ownerKey)
        context.defaults.set([
            "legacy-project": projectPayload(ordinary: "Ownerless", preserved: nil),
        ], forKey: context.baseKey)

        let inventory = context.adapter.inventory()
        XCTAssertEqual(inventory.unconfirmedEvidenceCount, 0)
        XCTAssertEqual(inventory.evidenceState, .recordsAvailable)
        XCTAssertFalse(inventory.canReportActiveSourceEmpty)
        XCTAssertEqual(inventory.records.count, 3)
        XCTAssertEqual(Set(inventory.records.map(\.source.ownerHint)), ["", "writer-a"])
        XCTAssertEqual(Set(inventory.records.map(\.source.projectHint)), ["project-a", "legacy-project"])
        XCTAssertEqual(Set(inventory.records.map(\.slot)), [.ordinary, .preservedConflict])
        XCTAssertTrue(inventory.records.allSatisfy {
            $0.source.legacyStorageKeyHint == $0.storageKey &&
                $0.source.encoding == .binaryPropertyList &&
                $0.supportsExactSlotRemoval
        })
    }

    @MainActor
    func testOwnerlessInventoryExcludesAccountScopedSources() {
        let context = makeContext()
        defer { context.cleanup() }
        let ownerKey = storageKey(baseKey: context.baseKey, owner: "writer-a")
        let ownerValue = ["project": projectPayload(ordinary: "Private", preserved: nil)]
        context.defaults.set(ownerValue, forKey: ownerKey)
        context.defaults.set(["legacy": projectPayload(ordinary: "Ownerless", preserved: nil)], forKey: context.baseKey)

        let inventory = context.adapter.inventory(unscopedOnly: true)
        XCTAssertEqual(inventory.records.count, 1)
        XCTAssertEqual(inventory.records.first?.projectKey, "legacy")
        XCTAssertEqual(inventory.unconfirmedEvidenceCount, 0)
        XCTAssertEqual(canonical(context.defaults.object(forKey: ownerKey)), canonical(ownerValue))
    }

    func testEvidenceStateNeverCallsUnconfirmedInputEmpty() {
        XCTAssertEqual(UnassignedLegacyDefaultsInventory(records: [], unconfirmedEvidenceCount: 0).evidenceState,
                       .confirmedEmpty)
        XCTAssertEqual(UnassignedLegacyDefaultsInventory(records: [], unconfirmedEvidenceCount: 1).evidenceState,
                       .unconfirmedEvidenceOnly)
        XCTAssertFalse(UnassignedLegacyDefaultsInventory(records: [], unconfirmedEvidenceCount: 1)
            .canReportActiveSourceEmpty)
    }

    @MainActor
    func testPreserveOnlyVerifiesCustodyAndLeavesSourceUnchanged() throws {
        let context = makeContext()
        defer { context.cleanup() }
        let key = storageKey(baseKey: context.baseKey, owner: "writer")
        let value = ["project": projectPayload(ordinary: "Exact words", preserved: nil)]
        context.defaults.set(value, forKey: key)
        let record = try XCTUnwrap(context.adapter.inventory().records.first)

        guard case .verified(let descriptor, sourceDisposition: .retained) =
            context.adapter.preserve(record, capturedAt: 1) else {
            return XCTFail("Expected retained verified custody")
        }
        XCTAssertEqual(canonical(context.defaults.object(forKey: key)), canonical(value))
        guard case .present(let revealed) = context.vault.reveal(recordID: descriptor.recordID) else {
            return XCTFail("Expected exact vault record")
        }
        XCTAssertEqual(revealed.sourcePayload, record.source.payload)
    }

    @MainActor
    func testExactOrdinaryRemovalKeepsPreservedAndUnknownProjectFields() throws {
        let context = makeContext()
        defer { context.cleanup() }
        let key = storageKey(baseKey: context.baseKey, owner: "writer")
        var project = projectPayload(ordinary: "Ordinary", preserved: "Preserved")
        project["futureField"] = "must remain"
        context.defaults.set([
            "project": project,
            "other-project": projectPayload(ordinary: "Other", preserved: nil),
        ], forKey: key)
        let record = try XCTUnwrap(context.adapter.inventory().records.first {
            $0.projectKey == "project" && $0.slot == .ordinary
        })

        guard case .verified(_, sourceDisposition: .removed) =
            context.adapter.preserveAndRemoveIfUnchanged(record, capturedAt: 1) else {
            return XCTFail("Expected exact verified slot removal")
        }
        let stored = try XCTUnwrap(context.defaults.dictionary(forKey: key))
        let storedProject = try XCTUnwrap(stored["project"] as? [String: Any])
        XCTAssertNil(storedProject["draft"])
        XCTAssertNil(storedProject["baseVersionId"])
        XCTAssertNil(storedProject["dirty"])
        XCTAssertNil(storedProject["savedAt"])
        XCTAssertEqual(storedProject["futureField"] as? String, "must remain")
        XCTAssertEqual((storedProject["preservedConflict"] as? [String: Any])?["draft"] as? String,
                       "Preserved")
        XCTAssertEqual((stored["other-project"] as? [String: Any])?["draft"] as? String, "Other")
    }

    @MainActor
    func testStaleInventoryFailsBeforeCustodyWithoutRemovingNewSource() throws {
        let context = makeContext()
        defer { context.cleanup() }
        let key = storageKey(baseKey: context.baseKey, owner: "writer")
        context.defaults.set(["project": projectPayload(ordinary: "First", preserved: nil)], forKey: key)
        let stale = try XCTUnwrap(context.adapter.inventory().records.first)
        context.defaults.set(["project": projectPayload(ordinary: "Changed", preserved: nil)], forKey: key)

        XCTAssertEqual(context.adapter.preserveAndRemoveIfUnchanged(stale, capturedAt: 1), .sourceChanged)
        XCTAssertEqual((context.defaults.dictionary(forKey: key)?["project"] as? [String: Any])?["draft"] as? String,
                       "Changed")
        XCTAssertEqual(context.vault.inventory(), .missing)
    }

    @MainActor
    func testChangeAfterCustodyRetainsChangedSourceAndReportsIt() throws {
        let context = makeContext(afterCustody: { defaults, key in
            defaults.set(["project": [
                "draft": "Changed after copy",
                "baseVersionId": "base",
                "dirty": true,
                "savedAt": 1.0,
            ]], forKey: key)
        })
        defer { context.cleanup() }
        let key = storageKey(baseKey: context.baseKey, owner: "writer")
        context.hookStorageKey = key
        context.defaults.set(["project": projectPayload(ordinary: "Original", preserved: nil)], forKey: key)
        let record = try XCTUnwrap(context.adapter.inventory().records.first)

        guard case .verified(let descriptor, sourceDisposition: .retainedChanged) =
            context.adapter.preserveAndRemoveIfUnchanged(record, capturedAt: 1) else {
            return XCTFail("Expected changed source to remain")
        }
        XCTAssertEqual((context.defaults.dictionary(forKey: key)?["project"] as? [String: Any])?["draft"] as? String,
                       "Changed after copy")
        XCTAssertNotEqual(context.vault.reveal(recordID: descriptor.recordID), .missing)
    }

    @MainActor
    func testPersistenceUncertaintyNeverClaimsRemoval() throws {
        let context = makeContext(synchronize: { false })
        defer { context.cleanup() }
        let key = storageKey(baseKey: context.baseKey, owner: "writer")
        context.defaults.set(["project": projectPayload(ordinary: "Words", preserved: nil)], forKey: key)
        let record = try XCTUnwrap(context.adapter.inventory().records.first)

        guard case .verified(_, sourceDisposition: .removalUnconfirmed) =
            context.adapter.preserveAndRemoveIfUnchanged(record, capturedAt: 1) else {
            return XCTFail("Persistence uncertainty must not claim removal")
        }
    }

    @MainActor
    func testMalformedEvidenceIsVaultedOpaqueAndNeverRemoved() throws {
        let context = makeContext()
        defer { context.cleanup() }
        let key = storageKey(baseKey: context.baseKey, owner: "writer")
        context.defaults.set(["project": "malformed project payload"], forKey: key)
        let record = try XCTUnwrap(context.adapter.inventory().records.first)
        XCTAssertEqual(record.slot, .malformedSource)
        XCTAssertEqual(record.source.encoding, .opaque)
        XCTAssertFalse(record.supportsExactSlotRemoval)

        guard case .verified(let descriptor, sourceDisposition: .retained) =
            context.adapter.preserveAndRemoveIfUnchanged(record, capturedAt: 1) else {
            return XCTFail("Malformed source must be retained")
        }
        XCTAssertEqual(context.defaults.dictionary(forKey: key)?["project"] as? String,
                       "malformed project payload")
        guard case .present(let revealed) = context.vault.reveal(recordID: descriptor.recordID) else {
            return XCTFail("Malformed evidence must remain exportable")
        }
        XCTAssertEqual(revealed.sourcePayload, record.source.payload)
        XCTAssertNil(revealed.decodedFields)
    }

    @MainActor
    func testDowngradeReupgradeIsIdempotentAndChangedCopyAddsRecord() throws {
        let context = makeContext()
        defer { context.cleanup() }
        let key = storageKey(baseKey: context.baseKey, owner: "writer")
        func install(_ words: String) {
            context.defaults.set(["project": projectPayload(ordinary: words, preserved: nil)], forKey: key)
        }
        install("First")
        let first = try XCTUnwrap(context.adapter.inventory().records.first)
        guard case .verified(let firstDescriptor, sourceDisposition: .removed) =
            context.adapter.preserveAndRemoveIfUnchanged(first, capturedAt: 1) else {
            return XCTFail("Expected first migration")
        }

        install("First")
        let replay = try XCTUnwrap(context.adapter.inventory().records.first)
        guard case .verified(let replayDescriptor, sourceDisposition: .removed) =
            context.adapter.preserveAndRemoveIfUnchanged(replay, capturedAt: 2) else {
            return XCTFail("Expected idempotent re-upgrade")
        }
        XCTAssertEqual(replayDescriptor.recordID, firstDescriptor.recordID)

        install("Second")
        let second = try XCTUnwrap(context.adapter.inventory().records.first)
        guard case .verified(let secondDescriptor, sourceDisposition: .removed) =
            context.adapter.preserveAndRemoveIfUnchanged(second, capturedAt: 3) else {
            return XCTFail("Expected changed downgrade copy")
        }
        XCTAssertNotEqual(secondDescriptor.recordID, firstDescriptor.recordID)
        guard case .available(let inventory) = context.vault.inventory() else {
            return XCTFail("Expected vault inventory")
        }
        XCTAssertEqual(inventory.records.count, 2)
    }

    private func projectPayload(ordinary: String?, preserved: String?) -> [String: Any] {
        var value: [String: Any] = [:]
        if let ordinary {
            value["draft"] = ordinary
            value["baseVersionId"] = "base"
            value["dirty"] = true
            value["savedAt"] = 42.25
        }
        if let preserved {
            value["preservedConflict"] = [
                "draft": preserved,
                "baseVersionId": "preserved-base",
                "dirty": true,
                "savedAt": 43.25,
            ]
        }
        return value
    }

    private func storageKey(baseKey: String, owner: String) -> String {
        let encoded = Data(owner.utf8).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return "\(baseKey).owner.\(encoded)"
    }

    private func canonical(_ value: Any?) -> Data? {
        guard let value else { return nil }
        return try? PropertyListSerialization.data(fromPropertyList: value, format: .xml, options: 0)
    }

    @MainActor
    private func makeContext(
        synchronize: (() -> Bool)? = nil,
        afterCustody: ((UserDefaults, String) -> Void)? = nil
    ) -> TestContext {
        let suite = "legacy-defaults-adapter-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("legacy-defaults-vault-\(UUID().uuidString)", isDirectory: true)
        let vault = UnassignedLegacyRecoveryVault(rootDirectory: root)
        let baseKey = "legacy.test.\(UUID().uuidString)"
        let context = TestContext(defaults: defaults, suite: suite, root: root,
            vault: vault, baseKey: baseKey)
        context.adapter = UnassignedLegacyRecoveryDefaultsAdapter(
            defaults: defaults,
            baseKey: baseKey,
            vault: vault,
            synchronizePersistence: synchronize,
            afterCustodyVerification: afterCustody.map { callback in
                { callback(defaults, context.hookStorageKey) }
            }
        )
        return context
    }

    @MainActor
    private final class TestContext {
        let defaults: UserDefaults
        let suite: String
        let root: URL
        let vault: UnassignedLegacyRecoveryVault
        let baseKey: String
        var hookStorageKey = ""
        var adapter: UnassignedLegacyRecoveryDefaultsAdapter!

        init(defaults: UserDefaults, suite: String, root: URL,
             vault: UnassignedLegacyRecoveryVault, baseKey: String) {
            self.defaults = defaults
            self.suite = suite
            self.root = root
            self.vault = vault
            self.baseKey = baseKey
        }

        func cleanup() {
            defaults.removePersistentDomain(forName: suite)
            try? FileManager.default.removeItem(at: root)
        }
    }
}

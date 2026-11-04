import Foundation
import XCTest
@testable import them

@MainActor
final class ScreenplayRecoveryMultiSlotIntegrationTests: XCTestCase {
    func testConditionalDeletionRetiresOnlyTheReviewedCopy() throws {
        let suite = "them.multi-slot-merge.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        store.savePreservedConflict(ownerUserId: "owner", projectId: "project", draft: "First",
                                    baseVersionId: "one", savedAt: 1)
        store.savePreservedConflict(ownerUserId: "owner", projectId: "project", draft: "Second",
                                    baseVersionId: "two", savedAt: 2)
        XCTAssertEqual(store.matchRecoverySlot(ownerUserId: "owner", projectId: "project",
            slot: .preservedConflict, draft: "Second", baseVersionId: "two", savedAt: 2), .matching)
        XCTAssertEqual(store.deleteRecoverySlotIfMatching(ownerUserId: "owner", projectId: "project",
            slot: .preservedConflict, draft: "Second", baseVersionId: "two", savedAt: 2), .deleted)
        XCTAssertEqual(store.firstPreservedConflict(ownerUserId: "owner", projectId: "project")?.draft, "First")
    }

    func testLegacyAndMultipleCopiesRemainVisibleAndCannotBeOverwritten() throws {
        let suite = "them.legacy-multi-merge.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let ownerKey = ScreenplayOwnerScopedStoragePolicy.storageKey(baseKey: "recovery", ownerUserID: "owner")
        defaults.set(["project": [
            "preservedConflicts": [["draft": "Array copy", "baseVersionId": "one", "dirty": true, "savedAt": 1.0]],
            "preservedConflict": ["draft": "Legacy copy", "baseVersionId": "two", "dirty": true, "savedAt": 2.0],
            "draft": "Ordinary copy", "baseVersionId": "base", "dirty": true, "savedAt": 3.0,
        ]], forKey: ownerKey)
        XCTAssertEqual(store.nextPreservedConflict(ownerUserId: "owner", projectId: "project",
            after: "Array copy", savedAt: 1)?.draft, "Legacy copy")
        XCTAssertEqual(store.saveInVacantRecoverySlot(ownerUserId: "owner", projectId: "project",
            draft: "Third copy", baseVersionId: "three"), .occupied)
        store.clearMatchingRecovery(ownerUserId: "owner", projectId: "project", draft: "Array copy", baseVersionId: "one")
        XCTAssertEqual(store.firstPreservedConflict(ownerUserId: "owner", projectId: "project")?.draft, "Array copy")
        XCTAssertEqual(store.nextPreservedConflict(ownerUserId: "owner", projectId: "project",
            after: "Array copy", savedAt: 1)?.draft, "Legacy copy")
    }
}

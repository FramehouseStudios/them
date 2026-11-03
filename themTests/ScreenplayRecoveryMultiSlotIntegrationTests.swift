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
            slot: .preservedConflict, draft: "First", baseVersionId: "one", savedAt: 1), .changed)
        XCTAssertEqual(store.deleteRecoverySlotIfMatching(ownerUserId: "owner", projectId: "project",
            slot: .preservedConflict, draft: "First", baseVersionId: "one", savedAt: 1), .changed)
        XCTAssertEqual(store.firstPreservedConflict(ownerUserId: "owner", projectId: "project")?.draft, "First")
        XCTAssertEqual(store.matchRecoverySlot(ownerUserId: "owner", projectId: "project",
            slot: .preservedConflict, draft: "Second", baseVersionId: "two", savedAt: 2), .matching)
        XCTAssertEqual(store.deleteRecoverySlotIfMatching(ownerUserId: "owner", projectId: "project",
            slot: .preservedConflict, draft: "Second", baseVersionId: "two", savedAt: 2), .deleted)
        XCTAssertEqual(store.firstPreservedConflict(ownerUserId: "owner", projectId: "project")?.draft, "First")
    }

    func testDiscardingCurrentCopySurfacesRetainedCopy() throws {
        let suite = "them.multi-slot-display.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let owner = "owner"
        let project = "project"
        store.savePreservedConflict(ownerUserId: owner, projectId: project, draft: "Older words",
                                    baseVersionId: "old", savedAt: 1)
        store.savePreservedConflict(ownerUserId: owner, projectId: project, draft: "Newer words",
                                    baseVersionId: "new", savedAt: 2)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            studioAuthContextProvider: { .init(userID: owner, sessionIntentGeneration: 1) })
        model.selectedProjectID = project
        model.applyServerDraft("Server words", versionId: "server")
        XCTAssertEqual(model.recoveryCandidate?.draft, "Newer words")
        model.discardLocalRecoveryCopy()
        XCTAssertEqual(model.recoveryCandidate?.draft, "Older words")
        XCTAssertEqual(store.matchRecoverySlot(ownerUserId: owner, projectId: project,
            slot: .preservedConflict, draft: "Older words", baseVersionId: "old", savedAt: 1), .matching)
    }

    func testAdvancingCopiesKeepsAllTextAndRejectsStaleSelection() throws {
        let suite = "them.multi-slot-advance.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        for (draft, time) in [("First", 1.0), ("Second", 2.0), ("Third", 3.0)] {
            store.savePreservedConflict(ownerUserId: "owner", projectId: "project", draft: draft,
                                        baseVersionId: "base", savedAt: time)
        }
        XCTAssertTrue(store.advancePreservedConflict(ownerUserId: "owner", projectId: "project",
            draft: "Third", baseVersionId: "base", savedAt: 3))
        XCTAssertEqual(store.currentPreservedConflict(ownerUserId: "owner", projectId: "project")?.draft, "First")
        XCTAssertFalse(store.advancePreservedConflict(ownerUserId: "owner", projectId: "project",
            draft: "Third", baseVersionId: "base", savedAt: 3))
        XCTAssertTrue(store.advancePreservedConflict(ownerUserId: "owner", projectId: "project",
            draft: "First", baseVersionId: "base", savedAt: 1))
        XCTAssertEqual(store.currentPreservedConflict(ownerUserId: "owner", projectId: "project")?.draft, "Second")
        let payload = try XCTUnwrap(store.payloads(ownerUserId: "owner")["project"])
        let archived = try XCTUnwrap(payload["preservedConflicts"] as? [[String: Any]])
        let current = try XCTUnwrap(payload["preservedConflict"] as? [String: Any])
        XCTAssertEqual(Set((archived + [current]).compactMap { $0["draft"] as? String }), Set(["First", "Second", "Third"]))
    }

    func testWriterCanReviewNextCopyWithoutChangingPageOrDeletingCopies() throws {
        let suite = "them.multi-slot-navigation.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let owner = "owner", project = "project"
        store.savePreservedConflict(ownerUserId: owner, projectId: project, draft: "Older words", baseVersionId: "old", savedAt: 1)
        store.savePreservedConflict(ownerUserId: owner, projectId: project, draft: "Newer words", baseVersionId: "new", savedAt: 2)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store,
            studioAuthContextProvider: { .init(userID: owner, sessionIntentGeneration: 1) })
        model.selectedProjectID = project
        model.applyServerDraft("Server words", versionId: "server")
        XCTAssertTrue(model.canReviewNextRecoveryCopy)
        model.reviewNextRecoveryCopy()
        XCTAssertEqual(model.recoveryCandidate?.draft, "Older words")
        XCTAssertEqual(model.fountainDraft, "Server words")
        model.reviewNextRecoveryCopy()
        XCTAssertEqual(model.recoveryCandidate?.draft, "Newer words")
        XCTAssertEqual(store.firstPreservedConflict(ownerUserId: owner, projectId: project)?.draft, "Older words")
    }

    func testMatchingServerPageDoesNotRetireMultiplePreservedCopies() throws {
        let suite = "them.multi-slot-server-match.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        store.savePreservedConflict(ownerUserId: "owner", projectId: "project", draft: "Other words",
                                    baseVersionId: "old", savedAt: 1)
        store.savePreservedConflict(ownerUserId: "owner", projectId: "project", draft: "Server words",
                                    baseVersionId: "new", savedAt: 2)
        XCTAssertEqual(store.recoverySnapshot(ownerUserId: "owner", projectId: "project",
                                               serverDraft: "Server words")?.draft, "Server words")
        let payload = try XCTUnwrap(store.payloads(ownerUserId: "owner")["project"])
        XCTAssertEqual((payload["preservedConflict"] as? [String: Any])?["draft"] as? String, "Server words")
        XCTAssertEqual((payload["preservedConflicts"] as? [[String: Any]])?.first?["draft"] as? String, "Other words")
    }

    func testAmbiguousOrMalformedCopiesCannotBeDeleted() throws {
        let suite = "them.multi-slot-ambiguous.\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let ownerKey = ScreenplayOwnerScopedStoragePolicy.storageKey(baseKey: "recovery", ownerUserID: "owner")
        let copy: [String: Any] = ["draft": "Words", "baseVersionId": "base", "dirty": true, "savedAt": 1.0]
        for archive: Any in [[copy], "malformed"] {
            defaults.set(["project": ["preservedConflict": copy, "preservedConflicts": archive]], forKey: ownerKey)
            XCTAssertEqual(store.deleteRecoverySlotIfMatching(ownerUserId: "owner", projectId: "project",
                slot: .preservedConflict, draft: "Words", baseVersionId: "base", savedAt: 1), .changed)
            let payload = store.payloads(ownerUserId: "owner")["project"]
            XCTAssertNotNil(payload?["preservedConflict"])
            XCTAssertNotNil(payload?["preservedConflicts"])
        }
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

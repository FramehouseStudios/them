import Foundation
import Combine
import XCTest
@testable import them

@MainActor
final class ScreenplayLiveDraftOriginTests: XCTestCase {
    func testCapturingExistingDocumentDoesNotRepublishItsOrigin() {
        withBridge { bridge in
            bridge.adoptLoadedProjectDraft("Writer words", projectID: "capture-a", versionID: "v1", owner: .current())
            var publications = 0
            let observation = bridge.$draftOrigin.dropFirst().sink { _ in publications += 1 }
            let first = bridge.captureLiveTalkDocument()
            let second = bridge.captureLiveTalkDocument()
            XCTAssertNotNil(first)
            XCTAssertEqual(first, second)
            XCTAssertEqual(publications, 0, "Reading a stable target should not trigger another SwiftUI update")
            withExtendedLifetime(observation) {}
        }
    }

    func testQueuedHydrationPublishesWordsWithTheirOriginalDocumentIdentity() {
        withBridge { bridge in
            let owner = ScreenplayStudioAuthContext.current()
            bridge.adoptLoadedProjectDraft("Temporary launch context", projectID: "temporary", versionID: "temp", owner: owner)
            let raw = "INT. CAFE - NIGHT\r\nCafe\u{0301} stays. \t "
            let entry = ScreenplayDraftSaveOutboxEntry(id: "queued-origin", projectId: "restored-project",
                ownerUserId: owner.userID, draft: raw, title: "Restored", phase: "scene_draft", notes: "",
                source: "studio_manual", studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "saved-base",
                createdAt: 1, updatedAt: 1, status: .pending, retries: 0, nextAttemptAt: 0, lastError: "",
                deliveryOrigin: .init(documentID: "original-queued-document", backendURL: BackendAuthClient.resolvedBackendBaseURL()))
            var publishedOrigins: [String?] = []
            let observation = bridge.$draftText.dropFirst().sink { text in
                if text.utf8.elementsEqual(raw.utf8) { publishedOrigins.append(bridge.draftOrigin.documentID) }
            }
            XCTAssertTrue(bridge.adoptLoadedProjectDraft(raw, projectID: entry.projectId,
                versionID: entry.baseVersionId, owner: owner, queuedEntry: entry))
            XCTAssertEqual(bridge.draftOrigin.documentID, "original-queued-document")
            XCTAssertEqual(bridge.captureLiveTalkDocument()?.documentID, "original-queued-document")
            XCTAssertEqual(publishedOrigins, ["original-queued-document"], "Text observers saw a replacement UUID")
            XCTAssertEqual(Data(bridge.draftText.utf8), Data(raw.utf8))
            withExtendedLifetime(observation) {}
        }
    }

    func testUnicodeEquivalentStringsRemainDifferentDraftObservations() {
        let decomposed = "Cafe\u{0301}.  \r\n"
        let composed = decomposed.precomposedStringWithCanonicalMapping
        XCTAssertEqual(decomposed, composed, "Control: Swift treats these distinct byte sequences as equal")
        XCTAssertNotEqual(ScreenplayDraftTextObservation(text: decomposed), ScreenplayDraftTextObservation(text: composed))
        XCTAssertEqual(ScreenplayDraftTextObservation(text: decomposed), ScreenplayDraftTextObservation(text: decomposed))
    }

    func testActualDebounceKeepsUnicodeCompositionOnlyEditInRecovery() async {
        let suite = "origin-unicode-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "unicode-recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.autosaveEnabled = false
        let project = "unicode-observation-\(UUID().uuidString)"
        model.selectedProjectID = project
        let raw = "INT. CAFE - NIGHT\r\nCafe\u{0301}.  \r\n"
        model.applyServerDraft(raw, versionId: "unicode-base")
        let baseline = expectation(description: "Initial exact bytes passed the real debounce")
        let initial = model.$autosaveStatusText.filter { $0 == "Live draft" }.first().sink { _ in baseline.fulfill() }
        await fulfillment(of: [baseline], timeout: 3)
        let changed = expectation(description: "Composition-only edit passed the real debounce")
        let edit = model.$autosaveStatusText.filter { $0 == "Create project to save" }.first().sink { _ in changed.fulfill() }
        let composed = raw.precomposedStringWithCanonicalMapping
        model.fountainDraft = composed
        await fulfillment(of: [changed], timeout: 3)
        let owner = ScreenplayStudioAuthContext.current().userID
        let kept = store.payloads(ownerUserId: owner)[project]?["draft"] as? String
        XCTAssertTrue(kept?.utf8.elementsEqual(composed.utf8) == true)
        XCTAssertFalse(kept?.utf8.elementsEqual(raw.utf8) == true)
        withExtendedLifetime((initial, edit)) {}
    }

    func testDeletingTextAndRestoringEmptyDraftKeepsOriginalProjectWhileAnotherIsSelected() {
        let a = ScreenplayLiveDraftOriginSnapshot(projectID: "a", versionID: "a1", documentID: "document-a")
        let edited = ScreenplayLiveDraftOriginPolicy.next(from: a, event: .edit, projectID: "b", versionID: "b1")
        let restored = ScreenplayLiveDraftOriginPolicy.restored(encoded: ScreenplayLiveDraftOriginPolicy.encoded(edited),
            draft: "", projectID: "b", versionID: "b1", fallbackProjectID: "", fallbackVersionID: "")
        XCTAssertEqual(restored.projectID, "a")
        XCTAssertEqual(restored.versionID, "a1")
        XCTAssertEqual(restored.documentID, "document-a")
    }

    func testInitialProjectPromotionKeepsDocumentButUnrelatedLoadedProjectDoesNot() {
        let initial = ScreenplayLiveDraftOriginSnapshot(projectID: "", versionID: "", documentID: "document-a")
        let promoted = ScreenplayLiveDraftOriginPolicy.next(from: initial, event: .edit,
            projectID: "first-project", versionID: "v1", promotedDocumentID: "document-a")
        XCTAssertEqual(promoted.documentID, initial.documentID)
        XCTAssertEqual(promoted.projectID, "first-project")
        let unrelated = ScreenplayLiveDraftOriginPolicy.next(from: promoted, event: .acceptedLoad,
            projectID: "other-project", versionID: "v2")
        XCTAssertNotEqual(unrelated.documentID, promoted.documentID)
    }

    func testPendingPreferenceAndDeletionCannotRelabelNonemptyWriterDraft() {
        withBridge { bridge in
            let owner = ScreenplayStudioAuthContext.current()
            XCTAssertTrue(bridge.adoptLoadedProjectDraft("INT. ROOM - NIGHT\n\nWriter words.  ",
                projectID: "origin-a", versionID: "a1", owner: owner))
            let document = bridge.draftOrigin.documentID
            bridge.preferredProjectID = "pending-b"
            bridge.preferredVersionID = "b1"
            XCTAssertEqual(bridge.draftOrigin.projectID, "origin-a")
            XCTAssertNil(bridge.captureLiveTalkDocument(), "A pending B selection cannot capture A as B's voice target")
            bridge.draftText = ""
            XCTAssertEqual(bridge.draftOrigin.projectID, "origin-a")
            XCTAssertEqual(bridge.draftOrigin.versionID, "a1")
            XCTAssertEqual(bridge.draftOrigin.documentID, document)
        }
    }

    func testBlankProjectSelectionAndExplicitClearEachEstablishTheirOwnDocument() {
        withBridge { bridge in
            bridge.adoptLoadedProjectDraft("", projectID: "blank-a", versionID: "a1", owner: .current())
            let a = bridge.draftOrigin.documentID
            bridge.preferredProjectID = "blank-b"
            let b = bridge.draftOrigin.documentID
            XCTAssertEqual(bridge.draftOrigin.projectID, "blank-b")
            XCTAssertNotEqual(a, b)
            bridge.clearDraft()
            let cleared = bridge.draftOrigin.documentID
            bridge.clearDraft()
            XCTAssertNotNil(cleared)
            XCTAssertNotEqual(cleared, b)
            XCTAssertNotEqual(bridge.draftOrigin.documentID, cleared)
        }
    }

    func testAcceptedEqualByteProjectHydrationUpdatesActualBridgeOrigin() {
        withBridge { bridge in
            let raw = "\r\nINT. CAFE - NIGHT\r\nCafe\u{0301}.\r\n \t "
            bridge.adoptLoadedProjectDraft(raw, projectID: "same-a", versionID: "a1", owner: .current())
            let original = bridge.draftOrigin.documentID
            let model = ScreenplayStudioViewModel()
            model.autosaveEnabled = false
            model.selectedProjectID = "same-b"
            model.applyServerDraft(raw, versionId: "b1")
            XCTAssertTrue(bridge.draftText.utf8.elementsEqual(raw.utf8))
            XCTAssertEqual(bridge.draftOrigin.projectID, "same-b")
            XCTAssertEqual(bridge.draftOrigin.versionID, "b1")
            XCTAssertNotEqual(bridge.draftOrigin.documentID, original)
        }
    }

    func testProtectedManualEditsDoNotAdoptRejectedServerBytesOrOrigin() {
        withBridge { bridge in
            let model = ScreenplayStudioViewModel()
            model.autosaveEnabled = false
            model.selectedProjectID = "protected-origin"
            model.applyServerDraft("Original", versionId: "v1")
            model.fountainDraft = "Writer's exact new words.  "
            model.noteManualDraftEdit()
            bridge.draftText = model.fountainDraft
            let before = bridge.draftOrigin
            model.applyServerDraft("Other device words", versionId: "v2")
            XCTAssertEqual(bridge.draftOrigin, before)
            XCTAssertTrue(bridge.draftText.utf8.elementsEqual(model.fountainDraft.utf8))
        }
    }

    func testPreviousOwnerCannotInstallLoadedWordsOrChangeOrigin() {
        withBridge { bridge in
            let before = bridge.draftOrigin
            let words = bridge.draftText
            let current = ScreenplayStudioAuthContext.current()
            let previous = ScreenplayStudioAuthContext(userID: current.userID,
                sessionIntentGeneration: current.sessionIntentGeneration + 1)
            XCTAssertFalse(bridge.adoptLoadedProjectDraft("Other owner's words", projectID: "other", versionID: "v2", owner: previous))
            XCTAssertEqual(bridge.draftOrigin, before)
            XCTAssertTrue(bridge.draftText.utf8.elementsEqual(words.utf8))
        }
    }

    func testAcceptedUnboundEmptyDraftDoesNotFallBackToOldProjectBinding() {
        withBridge { bridge in
            bridge.projectBinding = .init(updatedAt: Date(), projectID: "bound-a", projectTitle: "A",
                versionID: "a1", phase: "", draftSceneCount: 0, outlineSceneCount: 0,
                boundSceneCount: 0, draftCharacterCount: 0, projectCharacterCount: 0,
                boundCharacterCount: 0, sceneBindings: [])
            bridge.adoptLoadedProjectDraft("Bound words", projectID: "bound-a", versionID: "a1", owner: .current())
            let boundDocument = bridge.draftOrigin.documentID
            XCTAssertTrue(bridge.adoptLoadedProjectDraft("", projectID: "", versionID: "", owner: .current()))
            XCTAssertEqual(bridge.draftOrigin.projectID, "")
            XCTAssertEqual(bridge.draftOrigin.versionID, "")
            XCTAssertNotEqual(bridge.draftOrigin.documentID, boundDocument)
        }
    }

    func testObsoleteStudioModelCannotHydrateOrSynchronizeOverTheCurrentEditor() {
        withBridge { bridge in
            let old = ScreenplayStudioViewModel()
            old.autosaveEnabled = false
            old.selectedProjectID = "obsolete-a"
            old.applyServerDraft("Original A", versionId: "a1")
            let current = ScreenplayStudioViewModel()
            current.autosaveEnabled = false
            current.selectedProjectID = "current-b"
            current.applyServerDraft("Current B words.  ", versionId: "b1")
            let origin = bridge.draftOrigin
            old.applyServerDraft("Late A response", versionId: "a2")
            old.refreshLiveDraftBridgeContext()
            XCTAssertFalse(old.mirrorDraftIntoLiveBridgeIfOwned(old.fountainDraft),
                "A mounted obsolete screen must not mirror its delayed observer into B")
            XCTAssertFalse(current.mirrorDraftIntoLiveBridgeIfOwned("Obsolete B observer"))
            XCTAssertEqual(bridge.draftOrigin, origin)
            XCTAssertEqual(bridge.preferredProjectID, "current-b")
            XCTAssertTrue(bridge.draftText.utf8.elementsEqual("Current B words.  ".utf8))
            XCTAssertTrue(ScreenplayLiveDraftSyncService.shared.ownsEditor(current))
            XCTAssertFalse(ScreenplayLiveDraftSyncService.shared.ownsEditor(old))
            current.fountainDraft += "\r\nCafe\u{0301}.  "
            XCTAssertTrue(current.mirrorDraftIntoLiveBridgeIfOwned(current.fountainDraft))
            XCTAssertTrue(bridge.draftText.utf8.elementsEqual(current.fountainDraft.utf8))
            XCTAssertEqual(bridge.draftOrigin.documentID, origin.documentID)
        }
    }

    private func withBridge(_ operation: (ScreenplayLiveDraftBridge) -> Void) {
        let bridge = ScreenplayLiveDraftBridge.shared
        bridge.reconcileAccountStorage()
        let draft = bridge.draftText, project = bridge.preferredProjectID, version = bridge.preferredVersionID
        let binding = bridge.projectBinding
        defer {
            bridge.projectBinding = binding
            bridge.adoptLoadedProjectDraft(draft, projectID: project, versionID: version, owner: .current())
        }
        operation(bridge)
    }
}

import XCTest
@testable import them

final class UITestDraftRestoreSeedTests: XCTestCase {
    func testDebugRestoreFixturePreservesRawBytesInTheExistingOwnerStore() throws {
        let suite = "them.restore-seed.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let draft = "Title:\r\n    WALL_E\r\n\r\nINT. ROOM - NIGHT\r\n\r\nA cafe\u{0301} closes.\r\n \t "
        UITestLaunchConfiguration.applyIfNeeded(arguments: ["--ui-testing"], environment: [
            "THEM_UITEST_USER_ID": "writer-a",
            "THEM_UITEST_RESTORE_UNBOUND_DRAFT_BASE64": Data(draft.utf8).base64EncodedString(),
        ], defaults: defaults)
        let key = ScreenplayOwnerScopedStoragePolicy.storageKey(baseKey: "studio_live_draft_text_v1", ownerUserID: "writer-a")
        XCTAssertEqual(Data(try XCTUnwrap(defaults.string(forKey: key)).utf8), Data(draft.utf8))
        XCTAssertNil(defaults.string(forKey: ScreenplayOwnerScopedStoragePolicy.storageKey(
            baseKey: "studio_live_draft_text_v1", ownerUserID: "writer-b")))
    }

    func testNoTestingFlagOrOwnerCannotSeedAWorkspace() throws {
        let suite = "them.restore-seed.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let encoded = Data("INT. ROOM - NIGHT".utf8).base64EncodedString()
        UITestLaunchConfiguration.applyIfNeeded(arguments: [], environment: [
            "THEM_UITEST_USER_ID": "writer-a", "THEM_UITEST_RESTORE_UNBOUND_DRAFT_BASE64": encoded,
        ], defaults: defaults)
        UITestLaunchConfiguration.applyIfNeeded(arguments: ["--ui-testing"], environment: [
            "THEM_UITEST_RESTORE_UNBOUND_DRAFT_BASE64": encoded,
        ], defaults: defaults)
        XCTAssertFalse(defaults.dictionaryRepresentation().keys.contains { $0.hasPrefix("studio_live_draft_text_v1") })
    }

    func testInvalidBase64OrUTF8CannotReplaceAnExistingDraft() throws {
        let suite = "them.restore-seed.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let key = ScreenplayOwnerScopedStoragePolicy.storageKey(baseKey: "studio_live_draft_text_v1", ownerUserID: "writer-a")
        defaults.set("Existing exact words.\n ", forKey: key)
        for encoded in ["not base64!", Data([0xff]).base64EncodedString()] {
            UITestLaunchConfiguration.applyIfNeeded(arguments: ["--ui-testing"], environment: [
                "THEM_UITEST_USER_ID": "writer-a", "THEM_UITEST_RESTORE_UNBOUND_DRAFT_BASE64": encoded,
            ], defaults: defaults)
            XCTAssertEqual(defaults.string(forKey: key), "Existing exact words.\n ")
        }
    }
}

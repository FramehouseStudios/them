import Foundation
import XCTest
@testable import them

final class ScreenplayLiveDraftFileStoreResetTests: XCTestCase {
    private var directory: URL!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("io-them-live-draft-reset-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    func test_ui_test_reset_removes_every_live_draft_journal_and_nothing_else() throws {
        let anonymousOwner = ScreenplayOwnerScopedStoragePolicy.storageKey(
            baseKey: "live-screenplay-draft",
            ownerUserID: ""
        ) + ".fountain"
        let signedInOwner = ScreenplayOwnerScopedStoragePolicy.storageKey(
            baseKey: "live-screenplay-draft",
            ownerUserID: "ui-auth-resume-user"
        ) + ".fountain"
        let journals = ["live-screenplay-draft.fountain", anonymousOwner, signedInOwner]
        for name in journals {
            try Data("INT. KITCHEN - DAY\n".utf8).write(to: directory.appendingPathComponent(name))
        }
        let unrelatedFile = directory.appendingPathComponent("notes.txt")
        try Data("keep".utf8).write(to: unrelatedFile)
        let unrelatedDirectory = directory.appendingPathComponent("OfflineTalkOutbox", isDirectory: true)
        try FileManager.default.createDirectory(at: unrelatedDirectory, withIntermediateDirectories: true)
        let lookalike = directory.appendingPathComponent("live-screenplay-draft-notes.md")
        try Data("keep".utf8).write(to: lookalike)

        ScreenplayLiveDraftFileStore.removeAllForUITesting(in: directory)

        for name in journals {
            XCTAssertFalse(
                FileManager.default.fileExists(atPath: directory.appendingPathComponent(name).path),
                "\(name) survived the UI-test reset"
            )
        }
        XCTAssertTrue(FileManager.default.fileExists(atPath: unrelatedFile.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: unrelatedDirectory.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: lookalike.path))
    }

    func test_journal_matcher_accepts_only_draft_journals() {
        XCTAssertTrue(ScreenplayLiveDraftFileStore.isLiveDraftJournal(URL(fileURLWithPath: "/x/live-screenplay-draft.fountain")))
        XCTAssertTrue(ScreenplayLiveDraftFileStore.isLiveDraftJournal(URL(fileURLWithPath: "/x/live-screenplay-draft.owner.YW5vbnltb3Vz.fountain")))
        XCTAssertFalse(ScreenplayLiveDraftFileStore.isLiveDraftJournal(URL(fileURLWithPath: "/x/live-screenplay-draft-notes.md")))
        XCTAssertFalse(ScreenplayLiveDraftFileStore.isLiveDraftJournal(URL(fileURLWithPath: "/x/other.fountain")))
    }

    func test_missing_directory_is_a_no_op() {
        ScreenplayLiveDraftFileStore.removeAllForUITesting(
            in: directory.appendingPathComponent("missing", isDirectory: true)
        )
    }
}

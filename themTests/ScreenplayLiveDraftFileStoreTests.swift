import Foundation
import XCTest
@testable import them

#if DEBUG
final class ScreenplayLiveDraftFileStoreTests: XCTestCase {
    private var directory: URL!
    private var fileManager: LiveDraftTestFileManager!
    private let journals: [(owner: String?, draft: String)] = [
        (nil, "Legacy draft"),
        ("", "Anonymous draft"),
        ("user-a", "CLEMENTINE\nKeep the first writer's page."),
        ("user-b", "The second writer's page."),
    ]

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("io-them-live-draft-tests-\(UUID().uuidString)", isDirectory: true)
        fileManager = LiveDraftTestFileManager(applicationSupport: directory)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        for journal in journals {
            ScreenplayLiveDraftFileStore.persist(journal.draft, ownerUserID: journal.owner, fileManager: fileManager)
        }
    }

    override func tearDownWithError() throws {
        try FileManager.default.removeItem(at: directory)
        fileManager = nil
        directory = nil
    }

    func testExplicitUITestResetClearsLegacyAnonymousAndAuthenticatedJournalsOnly() throws {
        let journalDirectory = directory.appendingPathComponent("io.them", isDirectory: true)
        let unrelatedNames = [
            "writer-notes.fountain",
            "live-screenplay-draft.owner.user-a.fountain.backup",
            "live-screenplay-draft.owner..fountain",
        ]
        for name in unrelatedNames {
            try Data("Keep this file".utf8).write(to: journalDirectory.appendingPathComponent(name))
        }
        let nestedDirectory = journalDirectory.appendingPathComponent(
            "live-screenplay-draft.owner.directory.fountain", isDirectory: true
        )
        try fileManager.createDirectory(at: nestedDirectory, withIntermediateDirectories: true)
        let nestedFile = nestedDirectory.appendingPathComponent("keep.txt")
        try Data("Keep this nested file".utf8).write(to: nestedFile)
        let link = journalDirectory.appendingPathComponent("live-screenplay-draft.owner.link.fountain")
        try fileManager.createSymbolicLink(at: link, withDestinationURL: nestedFile)
        assertJournalsRestored()

        try ScreenplayLiveDraftFileStore.resetStoredDraftsForUITesting(
            arguments: ["them", "--ui-testing", "--ui-reset-state"],
            fileManager: fileManager
        )

        for journal in journals {
            XCTAssertEqual(
                ScreenplayLiveDraftFileStore.restoredDraft(ownerUserID: journal.owner, fileManager: fileManager),
                ""
            )
        }
        for name in unrelatedNames {
            XCTAssertEqual(
                try String(contentsOf: journalDirectory.appendingPathComponent(name), encoding: .utf8),
                "Keep this file"
            )
        }
        XCTAssertEqual(try String(contentsOf: nestedFile, encoding: .utf8), "Keep this nested file")
        XCTAssertEqual(try fileManager.destinationOfSymbolicLink(atPath: link.path), nestedFile.path)
    }

    func testResetRequiresExplicitUITestingAndResetWithoutPreserveState() throws {
        for arguments in [
            ["them"],
            ["them", "--ui-reset-state"],
            ["them", "--studio-eval", "--ui-reset-state"],
            ["them", "--ui-testing"],
            ["them", "--ui-testing", "--ui-preserve-state"],
            ["them", "--ui-testing", "--ui-reset-state", "--ui-preserve-state"],
        ] {
            try ScreenplayLiveDraftFileStore.resetStoredDraftsForUITesting(
                arguments: arguments,
                fileManager: fileManager
            )
            assertJournalsRestored()
        }
    }

    func testNormalRemovalStillRemovesOnlyTheRequestedOwner() {
        ScreenplayLiveDraftFileStore.remove(ownerUserID: "user-a", fileManager: fileManager)

        for journal in journals {
            XCTAssertEqual(
                ScreenplayLiveDraftFileStore.restoredDraft(ownerUserID: journal.owner, fileManager: fileManager),
                journal.owner == "user-a" ? "" : journal.draft
            )
        }
        ScreenplayLiveDraftFileStore.remove(fileManager: fileManager)
        XCTAssertEqual(ScreenplayLiveDraftFileStore.restoredDraft(fileManager: fileManager), "")
        XCTAssertEqual(
            ScreenplayLiveDraftFileStore.restoredDraft(ownerUserID: "", fileManager: fileManager),
            "Anonymous draft"
        )
    }

    private func assertJournalsRestored(file: StaticString = #filePath, line: UInt = #line) {
        for journal in journals {
            XCTAssertEqual(
                ScreenplayLiveDraftFileStore.restoredDraft(ownerUserID: journal.owner, fileManager: fileManager),
                journal.draft,
                file: file,
                line: line
            )
        }
    }
}

private final class LiveDraftTestFileManager: FileManager, @unchecked Sendable {
    let applicationSupport: URL

    init(applicationSupport: URL) {
        self.applicationSupport = applicationSupport
        super.init()
    }

    override func urls(for directory: FileManager.SearchPathDirectory, in domainMask: FileManager.SearchPathDomainMask) -> [URL] {
        directory == .applicationSupportDirectory ? [applicationSupport] : super.urls(for: directory, in: domainMask)
    }
}
#endif

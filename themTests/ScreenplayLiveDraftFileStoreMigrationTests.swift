import Foundation
import XCTest
@testable import them

final class ScreenplayLiveDraftFileStoreMigrationTests: XCTestCase {
    private var directory: URL!
    private var fileManager: MigrationFileManager!
    private let draft = "  INT. CAFE\u{301} — NIGHT\r\n\r\nJOHN\r\nI won’t leave.  \r\n"

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("them-journal-migration-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        fileManager = MigrationFileManager(root: directory)
    }

    override func tearDownWithError() throws {
        try FileManager.default.removeItem(at: directory)
    }

    func testFailedDestinationWriteKeepsExactLegacyJournal() {
        XCTAssertTrue(ScreenplayLiveDraftFileStore.persist(draft, fileManager: fileManager))
        XCTAssertEqual(Data(ScreenplayLiveDraftFileStore.restoredDraft(fileManager: fileManager).utf8), Data(draft.utf8))
        fileManager.failDirectoryCreation = true

        ScreenplayLiveDraftFileStore.migrateDraftIfNeeded(from: nil, to: "owner-a", fileManager: fileManager)

        XCTAssertEqual(
            Data(ScreenplayLiveDraftFileStore.restoredDraft(fileManager: fileManager).utf8), Data(draft.utf8),
            "Failed owner migration must retain the original journal's exact bytes."
        )
        XCTAssertEqual(ScreenplayLiveDraftFileStore.restoredDraft(ownerUserID: "owner-a", fileManager: fileManager), "")
    }

    func testSuccessfulMigrationPreservesExactBytesAndOtherOwner() {
        XCTAssertTrue(ScreenplayLiveDraftFileStore.persist(draft, fileManager: fileManager))
        XCTAssertTrue(ScreenplayLiveDraftFileStore.persist("OTHER OWNER\n", ownerUserID: "owner-b", fileManager: fileManager))

        ScreenplayLiveDraftFileStore.migrateDraftIfNeeded(from: nil, to: "owner-a", fileManager: fileManager)

        XCTAssertEqual(Data(ScreenplayLiveDraftFileStore.restoredDraft(ownerUserID: "owner-a", fileManager: fileManager).utf8), Data(draft.utf8))
        XCTAssertEqual(ScreenplayLiveDraftFileStore.restoredDraft(fileManager: fileManager), "")
        XCTAssertEqual(ScreenplayLiveDraftFileStore.restoredDraft(ownerUserID: "owner-b", fileManager: fileManager), "OTHER OWNER\n")
    }

    func testFailedMigrationCanRetryWithoutLosingOrDuplicatingBytes() throws {
        XCTAssertTrue(ScreenplayLiveDraftFileStore.persist(draft, fileManager: fileManager))
        fileManager.failDirectoryCreation = true
        ScreenplayLiveDraftFileStore.migrateDraftIfNeeded(from: nil, to: "owner-a", fileManager: fileManager)
        XCTAssertEqual(Data(ScreenplayLiveDraftFileStore.restoredDraft(fileManager: fileManager).utf8), Data(draft.utf8))
        fileManager.failDirectoryCreation = false
        ScreenplayLiveDraftFileStore.migrateDraftIfNeeded(from: nil, to: "owner-a", fileManager: fileManager)
        ScreenplayLiveDraftFileStore.migrateDraftIfNeeded(from: nil, to: "owner-a", fileManager: fileManager)

        XCTAssertEqual(Data(ScreenplayLiveDraftFileStore.restoredDraft(ownerUserID: "owner-a", fileManager: fileManager).utf8), Data(draft.utf8))
        XCTAssertEqual(ScreenplayLiveDraftFileStore.restoredDraft(fileManager: fileManager), "")
        let journals = try FileManager.default.contentsOfDirectory(at: directory.appendingPathComponent("io.them"), includingPropertiesForKeys: nil)
        XCTAssertEqual(journals.count, 1, "Successful repeated migration must leave one complete destination journal.")
    }

    func testExistingDestinationPreservesBothItAndTheLegacyJournal() {
        XCTAssertTrue(ScreenplayLiveDraftFileStore.persist(draft, fileManager: fileManager))
        XCTAssertTrue(ScreenplayLiveDraftFileStore.persist("EXISTING OWNER DRAFT\n", ownerUserID: "owner-a", fileManager: fileManager))

        ScreenplayLiveDraftFileStore.migrateDraftIfNeeded(from: nil, to: "owner-a", fileManager: fileManager)

        XCTAssertEqual(Data(ScreenplayLiveDraftFileStore.restoredDraft(fileManager: fileManager).utf8), Data(draft.utf8))
        XCTAssertEqual(ScreenplayLiveDraftFileStore.restoredDraft(ownerUserID: "owner-a", fileManager: fileManager), "EXISTING OWNER DRAFT\n")
    }

    func testMissingSourceDoesNotCreateDestination() throws {
        ScreenplayLiveDraftFileStore.migrateDraftIfNeeded(from: nil, to: "owner-a", fileManager: fileManager)

        XCTAssertEqual(ScreenplayLiveDraftFileStore.restoredDraft(ownerUserID: "owner-a", fileManager: fileManager), "")
        XCTAssertTrue(try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).isEmpty)
    }

    private final class MigrationFileManager: FileManager, @unchecked Sendable {
        let root: URL
        var failDirectoryCreation = false

        init(root: URL) {
            self.root = root
            super.init()
        }

        override func urls(for directory: SearchPathDirectory, in domainMask: SearchPathDomainMask) -> [URL] {
            directory == .applicationSupportDirectory ? [root] : super.urls(for: directory, in: domainMask)
        }

        override func createDirectory(
            at url: URL,
            withIntermediateDirectories createIntermediates: Bool,
            attributes: [FileAttributeKey: Any]? = nil
        ) throws {
            if failDirectoryCreation { throw CocoaError(.fileWriteNoPermission) }
            try super.createDirectory(at: url, withIntermediateDirectories: createIntermediates, attributes: attributes)
        }
    }
}

import XCTest
@testable import them

final class AccountExportFilenameTests: XCTestCase {
    func testServerNameIsKeptAndABlankOneFallsBack() {
        XCTAssertEqual(AccountExportFilename.clean(" them-export-2026-09-28.json "), "them-export-2026-09-28.json")
        XCTAssertEqual(AccountExportFilename.clean("  "), "io-them-account-export.json")
    }
}

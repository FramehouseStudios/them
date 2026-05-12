import XCTest
@testable import them

final class ScreenplayExportFormatRefreshPolicyTests: XCTestCase {
    func testAutoRefreshRequiresLoadedProjectListAndNonTestRuntime() {
        XCTAssertTrue(
            ScreenplayExportFormatRefreshPolicy.shouldAutoRefresh(
                projectListLoadedFromBackend: true,
                isRunningTests: false
            )
        )
        XCTAssertFalse(
            ScreenplayExportFormatRefreshPolicy.shouldAutoRefresh(
                projectListLoadedFromBackend: false,
                isRunningTests: false
            )
        )
        XCTAssertFalse(
            ScreenplayExportFormatRefreshPolicy.shouldAutoRefresh(
                projectListLoadedFromBackend: true,
                isRunningTests: true
            )
        )
    }
}

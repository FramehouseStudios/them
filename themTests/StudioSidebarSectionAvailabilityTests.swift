import XCTest
@testable import them

final class StudioSidebarSectionAvailabilityTests: XCTestCase {
    func testPhoneDrawerOffersProjectsOnly() {
        #if os(iOS)
        XCTAssertEqual(ScreenplayStudioScreen.SidebarSection.available, [.projects])
        #else
        XCTAssertEqual(ScreenplayStudioScreen.SidebarSection.available, ScreenplayStudioScreen.SidebarSection.allCases)
        #endif
    }
}

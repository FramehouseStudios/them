import XCTest
@testable import them

final class CreativeIntentHomeCopyTests: XCTestCase {
    func testHomeCardNeverShowsModelGuidance() {
        let kinds: [CreativeIntentKind] = [
            .screenplayPageWrite, .storyDevelopment, .mixedSupport,
            .companionSupport, .practicalSupport, .reflectiveSupport,
        ]
        for kind in kinds {
            let line = kind.homeCardLine
            XCTAssertFalse(line.isEmpty, "\(kind)")
            XCTAssertFalse(line.localizedCaseInsensitiveContains("the user"), "\(kind): \(line)")
            XCTAssertLessThanOrEqual(line.count, 60, "\(kind): \(line)")
        }
    }
}

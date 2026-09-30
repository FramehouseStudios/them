import XCTest
@testable import them

final class ScreenplayCastFocusTests: XCTestCase {
    func testExtensionsDoNotTakeACastPlace() {
        // 74-page run 2026-09-30: "BELL (CONT'D)" crowded DECKER out of eight places.
        let cues = ["NORA", "BELL", "BELL (CONT'D)", "MARCHETTI (V.O.)", "MARCHETTI", "RUIZ", "TEDDY (O.S.)", "JUNE", "CAL", "DANNY", "DECKER"]
        XCTAssertEqual(ScreenplayCastFocus.names(cues), ["NORA", "BELL", "MARCHETTI", "RUIZ", "TEDDY", "JUNE", "CAL", "DANNY"])
        XCTAssertEqual(ScreenplayCastFocus.names(cues, limit: 20).last, "DECKER")
    }

    func testNamesThatAreNotCuesPassThroughTrimmed() {
        XCTAssertEqual(ScreenplayCastFocus.names([" Nora ", "nora", "DR. SMITH"]), ["Nora", "DR. SMITH"])
    }
}

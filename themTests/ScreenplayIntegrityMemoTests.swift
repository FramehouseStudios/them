import XCTest
import ScreenplayStudio
@testable import them

/// The Studio page re-read a 74-page script for its integrity issues on every
/// render, holding the main thread for seconds (2026-09-30).
final class ScreenplayIntegrityMemoTests: XCTestCase {
    private let clean = "INT. PIER - NIGHT\n\nFog rolls over the water.\n\nNORA\nIs anyone out there?"
    private let chatter = "INT. PIER - NIGHT\n\nFog rolls over the water.\n\nSure! Do you want me to write the next scene for you?"

    func testAnswersFollowTheTextNotTheLastCall() {
        XCTAssertEqual(FountainFormatter.screenplayIntegrityIssues(in: clean), [])
        XCTAssertEqual(FountainFormatter.screenplayIntegrityIssues(in: chatter).count, 1)
        XCTAssertEqual(FountainFormatter.screenplayIntegrityIssues(in: clean), [])
        XCTAssertEqual(FountainFormatter.screenplayIntegrityIssues(in: chatter).count, 1)
    }

    func testAskingAgainForTheSameLongDraftIsImmediate() {
        let scene = "INT. SENATE CORRIDOR - NIGHT\n\nA clock over the chamber doors reads 8:02.\n\nNORA\nAbernathy, Baptiste, Cole.\n\nDANNY\nCole's a maybe.\n\n"
        let draft = String(repeating: scene, count: 600)
        let first = FountainFormatter.screenplayIntegrityIssues(in: draft)
        let start = Date()
        for _ in 0..<5 {
            XCTAssertEqual(FountainFormatter.screenplayIntegrityIssues(in: draft), first)
        }
        XCTAssertLessThan(Date().timeIntervalSince(start), 0.25, "five renders of the same draft must not re-read it")
    }
}

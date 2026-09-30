import XCTest
@testable import them

/// A 75-page script was still "Act II" at FADE OUT because every project was
/// planned against 110 pages (74-page run, 2026-09-30).
final class ScreenplayTargetLengthTests: XCTestCase {
    private var defaults: UserDefaults!
    private let suite = "ScreenplayTargetLengthTests"

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: suite)
        defaults.removePersistentDomain(forName: suite)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suite)
        super.tearDown()
    }

    func testAnUnsetProjectKeepsTheFeatureDefault() {
        XCTAssertEqual(ScreenplayTargetLength.pages(forProject: "p1", ownerUserID: "u1", defaults: defaults), 110)
        XCTAssertNil(ScreenplayTargetLength.chosenPages(forProject: "p1", ownerUserID: "u1", defaults: defaults))
    }

    func testTheWritersLengthIsKeptPerProjectAndAccount() {
        ScreenplayTargetLength.set(75, forProject: "p1", ownerUserID: "u1", defaults: defaults)
        XCTAssertEqual(ScreenplayTargetLength.pages(forProject: "p1", ownerUserID: "u1", defaults: defaults), 75)
        XCTAssertEqual(ScreenplayTargetLength.pages(forProject: "p2", ownerUserID: "u1", defaults: defaults), 110)
        XCTAssertEqual(ScreenplayTargetLength.pages(forProject: "p1", ownerUserID: "u2", defaults: defaults), 110, "another account never sees it")
        ScreenplayTargetLength.set(nil, forProject: "p1", ownerUserID: "u1", defaults: defaults)
        XCTAssertEqual(ScreenplayTargetLength.pages(forProject: "p1", ownerUserID: "u1", defaults: defaults), 110)
    }

    func testLengthsAreClampedToTheRange() {
        ScreenplayTargetLength.set(1, forProject: "p1", ownerUserID: "u1", defaults: defaults)
        XCTAssertEqual(ScreenplayTargetLength.pages(forProject: "p1", ownerUserID: "u1", defaults: defaults), 5)
        ScreenplayTargetLength.set(900, forProject: "p1", ownerUserID: "u1", defaults: defaults)
        XCTAssertEqual(ScreenplayTargetLength.pages(forProject: "p1", ownerUserID: "u1", defaults: defaults), 180)
    }

    func testA75PageScriptReachesActThreeWhereAFeatureWouldStillBeInActTwo() {
        let short = ScreenplayFeatureProgressionGuide.guide(actPosition: "", currentPage: 70, targetPages: 75)
        let feature = ScreenplayFeatureProgressionGuide.guide(actPosition: "", currentPage: 70, targetPages: 110)
        XCTAssertEqual(short.currentAct, "Act III")
        XCTAssertEqual(feature.currentAct, "Act II")
        XCTAssertEqual(short.progressText, "p70 / 75")
    }
}

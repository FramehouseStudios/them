import XCTest
import SwiftUI
import ScreenplayStudio
@testable import them

/// Founder, 2026-10-01: the original peach by default, dark when the writer
/// picks it; the screenplay page stays white paper in both.
final class IOThemAppearanceTests: XCTestCase {
    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: IOThemAppearance.storageKey)
        IOThemAppearance.apply(.peach)
        super.tearDown()
    }

    func test_peach_is_the_default() {
        UserDefaults.standard.removeObject(forKey: IOThemAppearance.storageKey)
        XCTAssertEqual(IOThemAppearance(rawValue: UserDefaults.standard.string(forKey: IOThemAppearance.storageKey) ?? "") ?? .peach, .peach)
        XCTAssertEqual(IOThemAppearance.allCases.map(\.title), ["Dark", "Peach"])
    }

    func test_dark_changes_the_ground_text_and_chrome_but_not_the_script_page() {
        IOThemAppearance.apply(.peach)
        let peach = (ground: IOThemColors.Background.peachMid, text: IOThemColors.Text.primary, chrome: IOThemColors.StudioChrome.topBar, page: IOThemColors.Paper.script)
        IOThemAppearance.apply(.dark)
        XCTAssertNotEqual(IOThemColors.Background.peachMid, peach.ground)
        XCTAssertNotEqual(IOThemColors.Text.primary, peach.text)
        XCTAssertNotEqual(IOThemColors.StudioChrome.topBar, peach.chrome)
        XCTAssertEqual(IOThemColors.Paper.script, peach.page)
        XCTAssertEqual(IOThemAppearance.dark.colorScheme, .dark)
    }
}

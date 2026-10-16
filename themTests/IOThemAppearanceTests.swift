import XCTest
import SwiftUI
import ScreenplayStudio
#if canImport(UIKit)
import UIKit
#endif
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

    func test_design_polish_preserves_the_orb_and_all_existing_destinations() {
        IOThemAppearance.apply(.peach)
        let orb = [IOThemColors.Orb.bgTop, IOThemColors.Orb.bgMid, IOThemColors.Orb.bgBottom]
        IOThemAppearance.apply(.dark)
        XCTAssertEqual([IOThemColors.Orb.bgTop, IOThemColors.Orb.bgMid, IOThemColors.Orb.bgBottom], orb)
        XCTAssertEqual(ThemTab.allCases.map(\.title), ["Home", "Studio", "Memories", "Settings"])
        let destinations = ThemHomeDestination.memoriesTab + ThemHomeDestination.settingsTab
        XCTAssertEqual(Set(destinations), Set(ThemHomeDestination.allCases))
        XCTAssertEqual(destinations.count, 12)
        XCTAssertEqual(Set(destinations.map(\.accessibilityIdentifier)).count, 12)
        XCTAssertEqual(ThemHomeDestination.account.title(signedIn: false), "Sign In")
        XCTAssertEqual(ThemHomeDestination.account.title(signedIn: true), "Account")
    }

    #if canImport(UIKit)
    @MainActor
    func test_secondary_navigation_ink_contrast_on_each_theme_background() {
        for appearance in IOThemAppearance.allCases {
            IOThemAppearance.apply(appearance)
            for ground in [IOThemColors.Background.peachTop, IOThemColors.Background.peachMid, IOThemColors.Background.peachBottom] {
                XCTAssertGreaterThanOrEqual(contrast(IOThemColors.Text.secondary, on: ground), 4.5, appearance.title)
            }
        }
    }

    @MainActor
    func test_studio_element_ink_contrast_in_both_themes() {
        for appearance in IOThemAppearance.allCases {
            IOThemAppearance.apply(appearance)
            XCTAssertGreaterThanOrEqual(contrast(IOThemColors.StudioChrome.selectedElementInk,
                                                on: IOThemColors.StudioChrome.selectedElement), 4.5, appearance.title)
            for ground in [IOThemColors.Background.peachTop, IOThemColors.Paper.script] {
                XCTAssertGreaterThanOrEqual(contrast(IOThemColors.StudioChrome.text,
                                                    on: IOThemColors.StudioChrome.panel, under: ground), 4.5, appearance.title)
            }
        }
    }

    @MainActor
    private func contrast(_ ink: Color, on ground: Color, under substrate: Color = .white) -> Double {
        func rgba(_ color: Color) -> (rgb: [Double], alpha: Double) {
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            XCTAssertTrue(UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a))
            return ([Double(r), Double(g), Double(b)], Double(a))
        }
        func paint(_ color: (rgb: [Double], alpha: Double), on background: [Double]) -> [Double] {
            zip(color.rgb, background).map { $0.0 * color.alpha + $0.1 * (1 - color.alpha) }
        }
        func luminance(_ rgb: [Double]) -> Double {
            zip(rgb, [0.2126, 0.7152, 0.0722]).reduce(0) { result, channel in
                let linear = channel.0 <= 0.04045 ? channel.0 / 12.92 : pow((channel.0 + 0.055) / 1.055, 2.4)
                return result + linear * channel.1
            }
        }
        let background = paint(rgba(ground), on: rgba(substrate).rgb)
        let values = [luminance(paint(rgba(ink), on: background)), luminance(background)].sorted()
        return (values[1] + 0.05) / (values[0] + 0.05)
    }
    #endif

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

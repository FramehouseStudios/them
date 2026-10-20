import XCTest
import SwiftUI
import ScreenplayStudio
@testable import them

#if canImport(UIKit)
@MainActor
final class ScreenplayIntegrityBannerLayoutTests: XCTestCase {
    func testIntegrityBannerRendersAtNarrowPhoneWidths() throws {
        let issues = FountainFormatter.screenplayIntegrityIssues(in:
            "Can you help me with this scene?\n\nWhat do you think of this scene?")
        XCTAssertFalse(issues.isEmpty)
        let actions = ScreenplayStudioDraftIntegrityActions(
            onOpenInspector: {}, onReview: { _ in }, onMoveToPin: { _ in },
            onRemove: { _ in }, onMoveAllToPin: {})
        for width in [320.0, 390.0] {
            let renderer = ImageRenderer(content:
                ScreenplayStudioPageIntegrityBanner(issues: issues, actions: actions)
                    .frame(width: width)
                    .background(IOThemColors.Paper.surface)
                    .environment(\.colorScheme, .light))
            let image = try XCTUnwrap(renderer.uiImage)
            XCTAssertEqual(image.size.width, width, accuracy: 1)
            XCTAssertLessThan(image.size.height, 400, "Banner should not expand into vertical letter wrapping")
            let attachment = XCTAttachment(image: image)
            attachment.name = "integrity-banner-\(Int(width))"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }
}
#endif

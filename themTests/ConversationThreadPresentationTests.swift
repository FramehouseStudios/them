import XCTest
import SwiftUI
#if os(iOS)
import UIKit
#endif
@testable import them

final class ConversationThreadPresentationTests: XCTestCase {
    #if os(iOS)
    @MainActor
    func testConversationDetailRendersAtNarrowWidth() throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
        let previousKey = scene.windows.first(where: \.isKeyWindow)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 375, height: 667)
        defer { window.isHidden = true; previousKey?.makeKey() }
        let thread = ConversationThread(id: "saved-fixture", turn: 1, title: "A signal from the empty capsule",
            lastUpdated: Date(), preview: "Short preview only",
            userMessage: "Write a scene where Mara hears a voice from the empty capsule.",
            assistantMessage: "INT. CAPSULE - NIGHT\n\nMara lifts the dead radio. A breath answers.\n\nMARA\nWho's there?")
        for (name, category) in [("default", ContentSizeCategory.large), ("large-text", .accessibilityExtraExtraExtraLarge)] {
            window.rootViewController = UIHostingController(rootView:
                NavigationStack { ConversationThreadDetailView(thread: thread) }
                    .environment(\.sizeCategory, category))
            window.makeKeyAndVisible()
            window.layoutIfNeeded()
            let image = UIGraphicsImageRenderer(size: window.bounds.size).image { _ in
                XCTAssertTrue(window.drawHierarchy(in: window.bounds, afterScreenUpdates: true))
            }
            let attachment = XCTAttachment(image: image)
            attachment.name = "conversation-375-\(name)"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }
    #endif

    func testSharedConversationKeepsCompleteOriginalMessagesNotTruncatedPreview() {
        let user = "INT. CAPSULE - NIGHT\r\n\r\nMARA\r\nKeep my café and 🎬 exactly.\r\n"
        let reply = String(repeating: "A long reply must remain readable.\n", count: 90) + "THE FINAL LINE.\n"
        let thread = ConversationThread(id: "turn-1", turn: 1, title: "The capsule",
            lastUpdated: Date(), preview: "truncated preview", userMessage: user, assistantMessage: reply)
        XCTAssertEqual(thread.exportText, "The capsule\n\nYou\n" + user + "\n\nClementine\n" + reply)
        XCTAssertFalse(thread.exportText.contains(thread.preview))
        XCTAssertTrue(thread.exportText.hasSuffix("THE FINAL LINE.\n"))
    }
}

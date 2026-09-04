import XCTest

final class ConversationHistoryResponsiveUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testNarrowHistoryOpensTheCompleteWriterAndClementineTranscript() throws {
        #if os(iOS)
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing",
            "--ui-reset-state",
            "--ui-skip-onboarding",
            "--ui-history-fixture",
            "-studio_debug_submit_transport_mode",
            "stub",
        ]
        app.launch()
        defer { app.terminate() }

        XCTAssertTrue(element("home.surface", in: app).waitForExistence(timeout: 8))
        XCTAssertTrue(element("home.orb", in: app).waitForExistence(timeout: 4))
        app.buttons["home.open-more"].tap()
        XCTAssertTrue(element("home.more.surface", in: app).waitForExistence(timeout: 5))

        let historyRoute = app.buttons["home.more.history"]
        scrollUntilHittable(historyRoute, app: app)
        XCTAssertTrue(historyRoute.isHittable, "Home → More did not expose History at narrow width.")
        historyRoute.tap()

        XCTAssertTrue(element("history.screen", in: app).waitForExistence(timeout: 6))
        XCTAssertTrue(element("history.summary", in: app).waitForExistence(timeout: 3))
        assertMinimumTarget(app.buttons["history.done"])

        let thread = app.buttons["history.thread.history-fixture-lighthouse"]
        XCTAssertTrue(thread.waitForExistence(timeout: 3))
        assertMinimumTarget(thread)
        thread.tap()

        XCTAssertTrue(element("history.detail.screen", in: app).waitForExistence(timeout: 5))
        XCTAssertTrue(element("history.detail.title", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("history.detail.metadata", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("history.detail.writer", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("history.detail.clementine", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Writer"].exists)
        XCTAssertTrue(app.staticTexts["Clementine"].exists)

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Conversation History - Transcript"
        attachment.lifetime = .keepAlways
        add(attachment)

        let back = app.navigationBars.buttons.firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 3), "Transcript reader did not expose a Back action.")
        assertMinimumTarget(back)
        back.tap()

        XCTAssertTrue(element("history.screen", in: app).waitForExistence(timeout: 4))
        app.buttons["history.done"].tap()
        XCTAssertTrue(element("home.surface", in: app).waitForExistence(timeout: 6))
        XCTAssertTrue(element("home.orb", in: app).waitForExistence(timeout: 3))
        #else
        throw XCTSkip("The responsive History transcript check is iPhone-specific.")
        #endif
    }

    private func assertMinimumTarget(
        _ element: XCUIElement,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertTrue(element.exists, file: file, line: line)
        XCTAssertTrue(element.isHittable, file: file, line: line)
        XCTAssertGreaterThanOrEqual(element.frame.height, 43.5, file: file, line: line)
    }

    private func scrollUntilHittable(_ element: XCUIElement, app: XCUIApplication) {
        for _ in 0..<14 where !element.isHittable {
            app.swipeUp()
        }
    }

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: identifier).firstMatch
    }
}

import XCTest

final class HomeUtilitySheetsResponsiveUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testNarrowHomeMoreUtilitySheetsRemainReadableAndDismissCleanly() throws {
        #if os(iOS)
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing",
            "--ui-reset-state",
            "--ui-skip-onboarding",
            "-studio_debug_submit_transport_mode",
            "stub",
        ]
        app.launch()
        defer { app.terminate() }

        assertHomeReady(app)

        openUtility(route: "home.more.tasks", screen: "tasks.screen", app: app)
        assertTopAction("tasks.done", app: app)
        XCTAssertTrue(element("tasks.summary", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(app.textFields["tasks.new-title"].waitForExistence(timeout: 3))
        assertMinimumTarget(app.buttons["tasks.add"], requireHittable: false)
        attachScreenshot(named: "Home Utility - Tasks")
        dismissUtility(button: "tasks.done", app: app)

        openUtility(route: "home.more.recap", screen: "recap.screen", app: app)
        assertTopAction("recap.done", app: app)
        XCTAssertTrue(element("recap.summary", in: app).waitForExistence(timeout: 3))
        for identifier in [
            "recap.window.today",
            "recap.window.yesterday",
            "recap.window.last_7_days",
        ] {
            XCTAssertTrue(app.buttons[identifier].waitForExistence(timeout: 3), "Missing recap period \(identifier).")
            assertMinimumTarget(app.buttons[identifier])
        }
        assertMinimumTarget(app.buttons["recap.refresh"], requireHittable: false)
        attachScreenshot(named: "Home Utility - Recap")
        dismissUtility(button: "recap.done", app: app)

        openUtility(route: "home.more.trust", screen: "trust.screen", app: app)
        assertTopAction("trust.done", app: app)
        XCTAssertTrue(element("trust.header", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Clementine"].exists || app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "Clementine")).count > 0)
        let dataControls = app.buttons["trust.open-data-controls"]
        scrollUntilHittable(dataControls, app: app)
        assertMinimumTarget(dataControls)
        let privacyPolicy = app.buttons["trust.open-privacy-policy"]
        scrollUntilHittable(privacyPolicy, app: app)
        assertMinimumTarget(privacyPolicy)
        attachScreenshot(named: "Home Utility - Trust Center")
        dismissUtility(button: "trust.done", app: app)

        openUtility(route: "home.more.companion", screen: "companion-controls.screen", app: app)
        assertTopAction("companion-controls.done", app: app)
        XCTAssertTrue(element("companion-controls.header", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Clementine"].waitForExistence(timeout: 3))
        for identifier in [
            "companion-controls.mode.coach",
            "companion-controls.mode.co_writer",
            "companion-controls.mode.comfort",
        ] {
            let mode = app.buttons[identifier]
            XCTAssertTrue(mode.waitForExistence(timeout: 3), "Missing responsive companion mode \(identifier).")
            assertMinimumTarget(mode)
        }
        attachScreenshot(named: "Home Utility - Clementine Controls")
        dismissUtility(button: "companion-controls.done", app: app)

        openMore(app)
        let report = app.buttons["home.more.report"]
        scrollUntilHittable(report, app: app)
        XCTAssertTrue(report.isHittable)
        report.tap()

        let talkDiagnosticsRoute = app.buttons["report.talk-diagnostics"].firstMatch
        XCTAssertTrue(talkDiagnosticsRoute.waitForExistence(timeout: 5))
        talkDiagnosticsRoute.tap()

        XCTAssertTrue(element("talk-diagnostics.screen", in: app).waitForExistence(timeout: 6))
        XCTAssertTrue(element("talk-diagnostics.header", in: app).waitForExistence(timeout: 3))
        assertMinimumTarget(app.buttons["talk-diagnostics.done"])
        assertMinimumTarget(app.buttons["talk-diagnostics.refresh"], requireHittable: false)
        XCTAssertTrue(element("talk-diagnostics.latency", in: app).waitForExistence(timeout: 3))
        attachScreenshot(named: "Home Utility - Talk Diagnostics")
        dismissUtility(button: "talk-diagnostics.done", app: app)
        #else
        throw XCTSkip("The responsive Home utility-sheet check is iPhone-specific.")
        #endif
    }

    private func openUtility(
        route: String,
        screen: String,
        app: XCUIApplication
    ) {
        openMore(app)
        let destination = app.buttons[route]
        scrollUntilHittable(destination, app: app)
        XCTAssertTrue(destination.isHittable, "Home → More route \(route) is not reachable.")
        destination.tap()
        XCTAssertTrue(element(screen, in: app).waitForExistence(timeout: 6), "Route \(route) did not open \(screen).")
    }

    private func openMore(_ app: XCUIApplication) {
        assertHomeReady(app)
        let more = app.buttons["home.open-more"]
        XCTAssertTrue(more.isHittable)
        more.tap()
        XCTAssertTrue(element("home.more.surface", in: app).waitForExistence(timeout: 5))
    }

    private func dismissUtility(button identifier: String, app: XCUIApplication) {
        let done = app.buttons[identifier]
        XCTAssertTrue(done.isHittable, "Dismiss action \(identifier) is not reachable.")
        done.tap()
        assertHomeReady(app)
    }

    private func assertHomeReady(_ app: XCUIApplication) {
        XCTAssertTrue(element("home.surface", in: app).waitForExistence(timeout: 7))
        XCTAssertTrue(element("home.companion-identity", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("home.orb", in: app).waitForExistence(timeout: 3))
    }

    private func assertTopAction(
        _ identifier: String,
        app: XCUIApplication,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let action = app.buttons[identifier]
        XCTAssertTrue(action.waitForExistence(timeout: 3), file: file, line: line)
        assertMinimumTarget(action, file: file, line: line)
    }

    private func assertMinimumTarget(
        _ element: XCUIElement,
        requireHittable: Bool = true,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertTrue(element.exists, file: file, line: line)
        if requireHittable {
            XCTAssertTrue(element.isHittable, file: file, line: line)
        }
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

    private func attachScreenshot(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

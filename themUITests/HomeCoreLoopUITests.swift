import XCTest

final class HomeCoreLoopUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testNarrowHomeKeepsCoreLoopVisibleAndConnectsMoreTools() throws {
        #if os(iOS)
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing",
            "--ui-reset-state",
            "--ui-skip-onboarding",
            "-studio_debug_submit_transport_mode",
            "stub",
            "-studio_auto_insert",
            "1",
        ]
        app.launch()
        defer { app.terminate() }

        XCTAssertTrue(element(identifier: "home.surface", in: app).waitForExistence(timeout: 8))
        XCTAssertTrue(element(identifier: "home.companion-identity", in: app).waitForExistence(timeout: 4))

        for identifier in [
            "home.open-studio",
            "home.open-memories",
            "home.open-account",
            "home.open-more",
        ] {
            let destination = app.buttons[identifier]
            XCTAssertTrue(destination.waitForExistence(timeout: 4), "Missing primary destination \(identifier).")
            XCTAssertTrue(destination.isHittable, "Primary destination \(identifier) is clipped or obscured.")
        }

        let talk = app.buttons["home.talk.button"]
        XCTAssertTrue(talk.waitForExistence(timeout: 4))
        XCTAssertFalse(talk.label.localizedCaseInsensitiveContains("hold"))

        let persistenceWait = XCTWaiter.wait(
            for: [XCTestExpectation(description: "Talk remains visible after the former six-second timeout")],
            timeout: 7.0,
            enforceOrder: false
        )
        XCTAssertEqual(persistenceWait, .timedOut)
        XCTAssertTrue(talk.exists, "The Talk action disappeared after six seconds.")
        XCTAssertTrue(talk.isHittable, "The persistent Talk action is obscured.")

        app.buttons["home.open-more"].tap()
        XCTAssertTrue(element(identifier: "home.more.surface", in: app).waitForExistence(timeout: 5))

        let expectedSecondaryDestinations = [
            "home.more.voiceSettings",
            "home.more.companion",
            "home.more.history",
            "home.more.notes",
            "home.more.tasks",
            "home.more.recap",
            "home.more.trust",
            "home.more.data",
            "home.more.privacy",
            "home.more.report",
        ]
        for identifier in expectedSecondaryDestinations {
            XCTAssertTrue(
                app.buttons[identifier].waitForExistence(timeout: 2),
                "More did not expose connected destination \(identifier)."
            )
        }
        XCTAssertTrue(element(identifier: "home.more.persona-status", in: app).waitForExistence(timeout: 2))

        let dataControls = app.buttons["home.more.data"]
        for _ in 0..<6 where !dataControls.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(dataControls.isHittable, "Data controls could not be reached in More.")
        dataControls.tap()
        XCTAssertTrue(element(identifier: "data.controls.screen", in: app).waitForExistence(timeout: 6))
        #else
        throw XCTSkip("The narrow home core-loop check is iPhone-specific.")
        #endif
    }

    private func element(identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: identifier).firstMatch
    }
}

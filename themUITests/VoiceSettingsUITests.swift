import XCTest

final class VoiceSettingsUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testNarrowHomeMoreOpensResponsiveVoiceSettings() throws {
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

        let more = app.buttons["home.open-more"]
        XCTAssertTrue(more.waitForExistence(timeout: 8))
        XCTAssertTrue(more.isHittable)
        more.tap()

        let voiceSettingsRoute = app.buttons["home.more.voiceSettings"]
        XCTAssertTrue(voiceSettingsRoute.waitForExistence(timeout: 5))
        XCTAssertTrue(voiceSettingsRoute.isHittable)
        voiceSettingsRoute.tap()

        XCTAssertTrue(element("voice-settings.screen", in: app).waitForExistence(timeout: 6))
        XCTAssertTrue(app.staticTexts[VoiceSettingsPresentationCopy.companionName].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts[VoiceSettingsPresentationCopy.title].waitForExistence(timeout: 3))

        let done = app.buttons["voice-settings.done"]
        XCTAssertTrue(done.waitForExistence(timeout: 3))
        XCTAssertTrue(done.isHittable)
        XCTAssertGreaterThanOrEqual(done.frame.height, 43.5)
        attachScreenshot(named: "Voice Settings - Top")

        for identifier in [
            "voice-settings.header-chip.relationship",
            "voice-settings.header-chip.creative-context",
            "voice-settings.header-chip.live-controls",
            "voice-settings.mic-sensitivity",
            "voice-settings.silence-threshold",
            "voice-settings.minimum-speech-length",
            "voice-settings.speaking-pace",
            "voice-settings.auto-insert",
            "voice-settings.live-script-preview",
        ] {
            XCTAssertTrue(
                element(identifier, in: app).waitForExistence(timeout: 2),
                "Voice Settings is missing \(identifier)."
            )
        }

        let serverDefault = app.buttons["voice-settings.realtime-supplier.server_default"]
        scrollUntilHittable(serverDefault, app: app, direction: .up)
        XCTAssertTrue(serverDefault.isHittable)
        XCTAssertGreaterThanOrEqual(serverDefault.frame.height, 43.5)

        let relationship = element("voice-settings.metric.sessions", in: app)
        scrollUntilHittable(relationship, app: app, direction: .up)
        XCTAssertTrue(relationship.isHittable)

        for identifier in [
            "voice-settings.metric.sessions",
            "voice-settings.metric.messages",
            "voice-settings.metric.depth",
            "voice-settings.metric.tension",
        ] {
            XCTAssertTrue(element(identifier, in: app).exists, "Missing relationship metric \(identifier).")
        }
        attachScreenshot(named: "Voice Settings - Relationship")

        scrollUntilHittable(done, app: app, direction: .down)
        XCTAssertTrue(done.isHittable)
        done.tap()
        XCTAssertTrue(element("home.surface", in: app).waitForExistence(timeout: 5))
        #else
        throw XCTSkip("The narrow Voice Settings check is iPhone-specific.")
        #endif
    }

    private enum ScrollDirection {
        case up
        case down
    }

    private func scrollUntilHittable(
        _ element: XCUIElement,
        app: XCUIApplication,
        direction: ScrollDirection
    ) {
        for _ in 0..<10 where !element.isHittable {
            switch direction {
            case .up:
                app.swipeUp()
            case .down:
                app.swipeDown()
            }
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

private enum VoiceSettingsPresentationCopy {
    static let companionName = "Clementine"
    static let title = "Voice & Studio"
}

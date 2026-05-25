import XCTest

final class V1SmokeUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func test_first_run_onboarding_unlocks_companion() {
        let app = launchApp(skipOnboarding: false)

        let nameField = textInput("onboarding.name.field", in: app)
        XCTAssertTrue(nameField.waitForExistence(timeout: 8))
        nameField.tap()
        nameField.typeText("Ava")

        let sceneField = textInput("onboarding.scene.field", in: app)
        XCTAssertTrue(sceneField.waitForExistence(timeout: 3))
        sceneField.tap()
        sceneField.typeText("A woman finds a blue key under a motel door.")

        let startButton = app.buttons["onboarding.start-page"]
        XCTAssertTrue(startButton.waitForExistence(timeout: 3))
        startButton.tap()

        XCTAssertTrue(waitForDraft(in: app, containing: "INT. KITCHEN - DAY", timeout: 10))
    }

    func test_record_voice_turn_round_trips_to_screenplay() {
        let app = launchApp(
            openStudio: true,
            openCommandBar: true,
            routePage: true,
            autoSubmitPagePrompt: "Write a tense kitchen scene where Lucy leaves before Frank can explain."
        )

        XCTAssertTrue(waitForDraft(in: app, containing: "INT. KITCHEN - DAY", timeout: 10))
        XCTAssertTrue(waitForDraft(in: app, containing: "LUCY", timeout: 5))
    }

    func test_screenplay_export_returns_a_file() {
        let app = launchApp(openStudio: true, openExportTools: true, structuralSeed: true)
        XCTAssertTrue(waitForDraft(in: app, containing: "INT. DINER - NIGHT", timeout: 10))

        let exportMenu = app.buttons["studio.export.menu"]
        if !exportMenu.waitForExistence(timeout: 4) {
            app.swipeUp()
        }
        XCTAssertTrue(exportMenu.waitForExistence(timeout: 6))
        exportMenu.tap()

        let markdownItem = app.buttons["studio.export.md"]
        if markdownItem.waitForExistence(timeout: 3) {
            markdownItem.tap()
        } else {
            app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "Markdown")).firstMatch.tap()
        }

        XCTAssertTrue(staticText(containing: "Saved", in: app).waitForExistence(timeout: 6))
    }

    func test_memory_recall_includes_a_mentioned_character() {
        let app = launchApp(
            openStudio: true,
            openCommandBar: true,
            routeVoicePin: true,
            autoSubmitVoicePinPrompt: "I feel stuck. Remember Mara: she jokes when she is terrified. Give me one story note about Mara."
        )

        XCTAssertTrue(staticText(containing: "Mara", in: app).waitForExistence(timeout: 8))
    }

    func test_realtime_fallback_does_not_crash_companion() {
        let app = launchApp(openDataControls: true, realtimeStub: true)

        XCTAssertTrue(app.otherElements["data.controls.screen"].waitForExistence(timeout: 8))
        XCTAssertTrue(staticText(containing: "Realtime Provider", in: app).waitForExistence(timeout: 5))
        XCTAssertTrue(staticText(containing: "Stub", in: app).waitForExistence(timeout: 5))
        XCTAssertTrue(staticText(containing: "deterministic stub path", in: app).waitForExistence(timeout: 5))
    }

    private func launchApp(
        skipOnboarding: Bool = true,
        openStudio: Bool = false,
        openDataControls: Bool = false,
        openCommandBar: Bool = false,
        openExportTools: Bool = false,
        structuralSeed: Bool = false,
        realtimeStub: Bool = false,
        routePage: Bool = false,
        routeVoicePin: Bool = false,
        autoSubmitPagePrompt: String? = nil,
        autoSubmitVoicePinPrompt: String? = nil
    ) -> XCUIApplication {
        let app = XCUIApplication()
        var arguments = [
            "--ui-testing",
            "--ui-reset-state",
            "-studio_debug_submit_transport_mode",
            "stub",
            "-studio_auto_insert",
            "1"
        ]
        if skipOnboarding {
            arguments.append("--ui-skip-onboarding")
        }
        if openStudio {
            arguments.append("--ui-open-studio")
        }
        if openDataControls {
            arguments.append("--ui-open-data-controls")
        }
        if openCommandBar {
            arguments.append("--ui-open-commandbar")
        }
        if openExportTools {
            arguments.append("--ui-open-export-tools")
        }
        if structuralSeed {
            arguments.append(contentsOf: [
                "-studio_debug_seed_structural_token",
                "\(Int(Date().timeIntervalSince1970 * 1_000))"
            ])
        }
        if realtimeStub {
            arguments.append("--ui-realtime-stub")
        }
        if routePage {
            arguments.append("--ui-route-page")
        }
        if routeVoicePin {
            arguments.append("--ui-route-voice-pin")
        }
        if let autoSubmitPagePrompt {
            arguments.append(contentsOf: ["--ui-auto-submit-page-prompt", autoSubmitPagePrompt])
        }
        if let autoSubmitVoicePinPrompt {
            arguments.append(contentsOf: ["--ui-auto-submit-voice-pin-prompt", autoSubmitVoicePinPrompt])
        }
        app.launchArguments = arguments
        app.launch()
        return app
    }

    private func textInput(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        let deadline = Date().addingTimeInterval(8)
        var fallback: XCUIElement?
        while Date() < deadline {
            if let field = hittableElement(in: app.textFields.matching(identifier: identifier)) {
                return field
            }
            if let textView = hittableElement(in: app.textViews.matching(identifier: identifier)) {
                return textView
            }
            if fallback == nil {
                fallback = firstExistingElement(in: app.textFields.matching(identifier: identifier))
                    ?? firstExistingElement(in: app.textViews.matching(identifier: identifier))
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        return fallback ?? app.textFields[identifier]
    }

    private func hittableElement(in query: XCUIElementQuery) -> XCUIElement? {
        for index in 0..<query.count {
            let element = query.element(boundBy: index)
            if element.exists, element.isHittable {
                return element
            }
        }
        return nil
    }

    private func firstExistingElement(in query: XCUIElementQuery) -> XCUIElement? {
        for index in 0..<query.count {
            let element = query.element(boundBy: index)
            if element.exists {
                return element
            }
        }
        return nil
    }

    private func waitForDraft(
        in app: XCUIApplication,
        containing text: String,
        timeout: TimeInterval
    ) -> Bool {
        let surface = app.otherElements["studio.draft.surface"]
        let snapshot = app.staticTexts["studio.draft.snapshot"]
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if snapshot.exists,
               snapshot.label.localizedCaseInsensitiveContains(text) {
                return true
            }
            if surface.waitForExistence(timeout: 0.5),
               let value = surface.value as? String,
               value.localizedCaseInsensitiveContains(text) {
                return true
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        return false
    }

    private func staticText(containing text: String, in app: XCUIApplication) -> XCUIElement {
        app.staticTexts
            .matching(NSPredicate(format: "label CONTAINS[c] %@", text))
            .firstMatch
    }
}

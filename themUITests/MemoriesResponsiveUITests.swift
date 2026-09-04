import XCTest

final class MemoriesResponsiveUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testNarrowMemoriesPreservesReadableCardsThroughRefreshFailureAndRecovery() throws {
        #if os(iOS)
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing",
            "--ui-reset-state",
            "--ui-skip-onboarding",
            "--ui-open-memories",
            "--ui-memories-fixture",
            "--ui-memories-refresh-failure",
            "--ui-memories-editable-fixture",
            "-studio_debug_submit_transport_mode",
            "stub",
        ]
        app.launch()
        defer { app.terminate() }

        XCTAssertTrue(element("memories.screen", in: app).waitForExistence(timeout: 8))
        XCTAssertTrue(element("memories.summary", in: app).waitForExistence(timeout: 3))
        assertMinimumTarget(app.buttons["memories.return"])

        let memory = app.buttons["memories.card.ui-lighthouse"]
        XCTAssertTrue(memory.waitForExistence(timeout: 4))
        assertMinimumTarget(memory)

        let refresh = app.buttons["memories.refresh"]
        assertMinimumTarget(refresh)
        refresh.tap()
        XCTAssertTrue(element("memories.refresh-error", in: app).waitForExistence(timeout: 4))
        XCTAssertEqual(refresh.label, "Retry refresh")
        XCTAssertTrue(memory.isHittable, "A failed refresh must keep remembered cards readable.")
        capture("Memories - Refresh recovery")
        memory.tap()

        XCTAssertTrue(element("memories.detail.screen", in: app).waitForExistence(timeout: 5))
        XCTAssertEqual(element("memories.detail.title", in: app).label, "The lighthouse promise")
        XCTAssertEqual(
            element("memories.detail.summary", in: app).label,
            "Mara keeps returning to the lighthouse when she needs to make a difficult choice."
        )
        capture("Memories - Readable detail")
        goBack(in: app)

        XCTAssertTrue(element("memories.screen", in: app).waitForExistence(timeout: 4))
        XCTAssertTrue(element("memories.refresh-error", in: app).exists)
        assertMinimumTarget(refresh)
        refresh.tap()
        let recovered = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"),
            object: element("memories.refresh-error", in: app)
        )
        XCTAssertEqual(XCTWaiter.wait(for: [recovered], timeout: 4), .completed)
        XCTAssertEqual(refresh.label, "Refresh memories")
        XCTAssertTrue(memory.isHittable)
        capture("Memories - Refreshed cards")
        memory.tap()
        XCTAssertTrue(element("memories.detail.screen", in: app).waitForExistence(timeout: 5))
        XCTAssertEqual(
            element("memories.detail.summary", in: app).label,
            "Mara returns to the lighthouse to tell June the truth."
        )

        let correct = app.buttons["memories.detail.correct"]
        XCTAssertTrue(correct.waitForExistence(timeout: 3))
        assertMinimumTarget(correct)
        correct.tap()
        let title = app.textFields["memories.editor.title"]
        XCTAssertTrue(title.waitForExistence(timeout: 3))
        title.tap()
        title.typeText(" — local draft")
        let draftTitle = try XCTUnwrap(title.value as? String)
        XCTAssertTrue(draftTitle.contains("local draft"))
        app.buttons["memories.editor.save"].tap()
        XCTAssertTrue(element("memories.editor.error", in: app).waitForExistence(timeout: 4))
        XCTAssertTrue(element("memories.editor.error", in: app).label.contains("You’re offline"))
        XCTAssertEqual(title.value as? String, draftTitle, "A failed correction must preserve the writer's draft.")
        capture("Memories - Correction failure preserves draft")
        app.buttons["memories.editor.cancel"].tap()
        XCTAssertTrue(element("memories.detail.screen", in: app).waitForExistence(timeout: 4))
        XCTAssertEqual(element("memories.detail.title", in: app).label, "The lighthouse promise")
        goBack(in: app)

        assertMinimumTarget(app.buttons["memories.return"])
        app.buttons["memories.return"].tap()
        XCTAssertTrue(element("home.surface", in: app).waitForExistence(timeout: 6))
        XCTAssertTrue(element("home.orb", in: app).waitForExistence(timeout: 3))
        #else
        throw XCTSkip("The responsive Memories recovery check is iPhone-specific.")
        #endif
    }

    private func goBack(in app: XCUIApplication) {
        let back = app.navigationBars.buttons.firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 3))
        assertMinimumTarget(back)
        back.tap()
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
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

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: identifier).firstMatch
    }
}

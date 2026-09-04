import XCTest

final class DataControlsResponsiveUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testNarrowHomeMoreDataControlsAndNestedRecoverySurfaces() throws {
        #if os(iOS)
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing",
            "--ui-reset-state",
            "--ui-skip-onboarding",
            "--ui-outline-recovery-fixture",
            "-studio_debug_submit_transport_mode",
            "stub",
        ]
        app.launch()
        defer { app.terminate() }

        let more = app.buttons["home.open-more"]
        XCTAssertTrue(more.waitForExistence(timeout: 8))
        more.tap()

        let dataRoute = app.buttons["home.more.data"]
        scrollUntilHittable(dataRoute, app: app, direction: .up)
        XCTAssertTrue(dataRoute.isHittable, "Data Controls must remain reachable from Home → More.")
        dataRoute.tap()

        XCTAssertTrue(element("data.controls.screen", in: app).waitForExistence(timeout: 6))
        XCTAssertTrue(element("data.controls.header", in: app).waitForExistence(timeout: 3))

        let dataDone = app.buttons["data.controls.done"]
        XCTAssertTrue(dataDone.waitForExistence(timeout: 3))
        assertAccessibleTarget(dataDone)
        attachScreenshot(named: "Data Controls - Top")

        let outlineRefresh = app.buttons["data.outline-recovery.refresh"]
        scrollUntilHittable(outlineRefresh, app: app, direction: .up)
        XCTAssertTrue(outlineRefresh.isHittable)
        assertAccessibleTarget(outlineRefresh)

        let inspect = app.buttons["data.outline-recovery.inspect.ui-stale-outline-head"]
        XCTAssertTrue(inspect.waitForExistence(timeout: 6))
        scrollUntilHittable(inspect, app: app, direction: .up)
        XCTAssertTrue(inspect.isHittable)
        assertAccessibleTarget(inspect)

        for identifier in [
            "data.outline-recovery.export.ui-stale-outline-head",
            "data.outline-recovery.discard.ui-stale-outline-head",
        ] {
            let action = app.buttons[identifier]
            XCTAssertTrue(action.exists, "Missing outline recovery action \(identifier).")
            XCTAssertGreaterThanOrEqual(action.frame.height, 43.5)
        }

        inspect.tap()
        XCTAssertTrue(element("data.outline-recovery.detail", in: app).waitForExistence(timeout: 5))

        let detailDone = app.buttons["data.outline-recovery.detail.done"]
        let detailExport = app.buttons["data.outline-recovery.detail.export"]
        XCTAssertTrue(detailDone.waitForExistence(timeout: 3))
        XCTAssertTrue(detailExport.waitForExistence(timeout: 3))
        assertAccessibleTarget(detailDone)
        assertAccessibleTarget(detailExport)
        attachScreenshot(named: "Data Controls - Outline Recovery Detail")
        detailDone.tap()

        XCTAssertTrue(element("data.controls.screen", in: app).waitForExistence(timeout: 5))
        let launchDoctor = app.buttons["data.launch-doctor.open"]
        scrollUntilHittable(launchDoctor, app: app, direction: .up)
        XCTAssertTrue(launchDoctor.isHittable)
        assertAccessibleTarget(launchDoctor)
        launchDoctor.tap()

        XCTAssertTrue(element("launch-doctor.screen", in: app).waitForExistence(timeout: 5))
        XCTAssertTrue(element("launch-doctor.header", in: app).waitForExistence(timeout: 3))
        XCTAssertTrue(element("launch-doctor.summary", in: app).waitForExistence(timeout: 3))

        let doctorDone = app.buttons["launch-doctor.done"]
        let firstStatus = app.buttons["launch-doctor.status.talk_pipeline.not_started"]
        XCTAssertTrue(doctorDone.waitForExistence(timeout: 3))
        XCTAssertTrue(firstStatus.waitForExistence(timeout: 3))
        assertAccessibleTarget(doctorDone)
        assertAccessibleTarget(firstStatus)
        attachScreenshot(named: "Data Controls - V1 Launch Doctor")
        doctorDone.tap()

        XCTAssertTrue(element("data.controls.screen", in: app).waitForExistence(timeout: 5))
        XCTAssertTrue(dataDone.isHittable)
        dataDone.tap()
        XCTAssertTrue(element("home.surface", in: app).waitForExistence(timeout: 5))
        #else
        throw XCTSkip("The responsive Data Controls check is iPhone-specific.")
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
        for _ in 0..<14 where !element.isHittable {
            switch direction {
            case .up:
                app.swipeUp()
            case .down:
                app.swipeDown()
            }
        }
    }

    private func assertAccessibleTarget(
        _ element: XCUIElement,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertTrue(element.isHittable, file: file, line: line)
        XCTAssertGreaterThanOrEqual(element.frame.height, 43.5, file: file, line: line)
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

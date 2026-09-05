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

    func testForgetRequiresConfirmationPreservesFailedDeletionAndRecovers() throws {
        #if os(iOS)
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing", "--ui-reset-state", "--ui-skip-onboarding", "--ui-open-memories",
            "--ui-memories-fixture", "--ui-memories-forget-fixture",
            "-studio_debug_submit_transport_mode", "stub",
        ]
        app.launch()
        defer { app.terminate() }

        XCTAssertTrue(element("memories.screen", in: app).waitForExistence(timeout: 8))
        let card = app.buttons["memories.card.ui-lighthouse"]
        XCTAssertTrue(card.waitForExistence(timeout: 4))
        card.tap()
        XCTAssertTrue(element("memories.detail.screen", in: app).waitForExistence(timeout: 4))
        let forget = app.buttons["memories.detail.forget"]
        XCTAssertTrue(forget.isHittable)
        forget.tap()
        let confirm = app.buttons["Forget memory"].firstMatch
        let keep = app.buttons["Keep memory"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        capture("Memories - Native forget confirmation")
        XCTAssertTrue(keep.isHittable, app.debugDescription)
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "The lighthouse promise")).firstMatch.exists)
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "no undo")).firstMatch.exists)
        capture("Memories - Forget confirmation")
        keep.tap()
        XCTAssertTrue(element("memories.detail.screen", in: app).exists)
        XCTAssertFalse(element("memories.forget.error", in: app).exists)
        goBack(in: app)
        XCTAssertTrue(card.waitForExistence(timeout: 3), "Cancel must leave the saved memory intact.")
        XCTAssertFalse(element("memories.action-notice", in: app).exists)
        card.tap()

        forget.tap()
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        confirm.tap()
        let failure = element("memories.forget.error", in: app)
        XCTAssertTrue(failure.waitForExistence(timeout: 4))
        XCTAssertTrue(failure.label.contains("Couldn’t confirm"))
        XCTAssertTrue(element("memories.detail.summary", in: app).exists)
        capture("Memories - Unconfirmed deletion stays readable")

        let retry = app.buttons["memories.forget.retry"]
        assertMinimumTarget(retry)
        retry.tap()
        XCTAssertTrue(confirm.waitForExistence(timeout: 3), "Retry must ask for confirmation again.")
        confirm.tap()
        XCTAssertTrue(element("memories.screen", in: app).waitForExistence(timeout: 4))
        let notice = element("memories.action-notice", in: app)
        XCTAssertTrue(notice.waitForExistence(timeout: 4))
        XCTAssertEqual(notice.label, "Forgot “The lighthouse promise”.")
        XCTAssertFalse(card.exists)
        XCTAssertTrue(app.buttons["memories.card.ui-causeway"].exists)
        capture("Memories - Confirmed deletion")

        let refresh = app.buttons["memories.refresh"]
        refresh.tap()
        let refreshed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "isEnabled == true AND label == %@", "Refresh memories"),
            object: refresh
        )
        XCTAssertEqual(XCTWaiter.wait(for: [refreshed], timeout: 4), .completed)
        XCTAssertFalse(card.exists, "A refresh must not resurrect the confirmed forgotten card.")
        let remaining = app.buttons["memories.card.ui-causeway"]
        XCTAssertTrue(remaining.exists)
        remaining.tap()
        XCTAssertTrue(forget.waitForExistence(timeout: 3))
        forget.tap()
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        confirm.tap()
        XCTAssertTrue(app.staticTexts["I am still getting to know you."].waitForExistence(timeout: 4))
        XCTAssertEqual(notice.label, "Forgot “The tide cuts off retreat”.")
        XCTAssertFalse(remaining.exists)
        assertMinimumTarget(app.buttons["Start Talking"])
        capture("Memories - Last deletion leaves a useful empty state")
        app.buttons["memories.return"].tap()
        XCTAssertTrue(element("home.orb", in: app).waitForExistence(timeout: 4))
        #else
        throw XCTSkip("The Forget confirmation workflow is iPhone-specific.")
        #endif
    }

    func testCorrectionConflictKeepsDraftAndReopenedMemoryCanSave() throws {
        #if os(iOS)
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing", "--ui-reset-state", "--ui-skip-onboarding", "--ui-open-memories",
            "--ui-memories-fixture", "--ui-memories-editable-fixture", "--ui-memories-correction-conflict",
            "-studio_debug_submit_transport_mode", "stub",
        ]
        app.launch()
        defer { app.terminate() }
        let card = app.buttons["memories.card.ui-lighthouse"]
        XCTAssertTrue(card.waitForExistence(timeout: 8))
        card.tap()
        let correct = app.buttons["memories.detail.correct"]
        XCTAssertTrue(correct.waitForExistence(timeout: 4))
        correct.tap()
        let title = app.textFields["memories.editor.title"]
        XCTAssertTrue(title.waitForExistence(timeout: 4))
        title.tap()
        title.typeText(" — my correction")
        let draft = try XCTUnwrap(title.value as? String)
        let save = app.buttons["memories.editor.save"]
        save.tap()
        let error = element("memories.editor.error", in: app)
        XCTAssertTrue(error.waitForExistence(timeout: 4))
        XCTAssertTrue(error.label.contains("changed while you were correcting"))
        XCTAssertTrue(error.label.contains("Your draft is still here"))
        XCTAssertEqual(title.value as? String, draft)
        capture("Memories - Cross-device conflict preserves correction")

        save.tap()
        XCTAssertTrue(error.exists, "Retrying the old draft must not overwrite the newer memory.")
        XCTAssertEqual(title.value as? String, draft)
        app.buttons["memories.editor.cancel"].tap()
        let summary = element("memories.detail.summary", in: app)
        XCTAssertTrue(summary.waitForExistence(timeout: 4))
        XCTAssertEqual(summary.label, "Mara returns to the lighthouse to tell June the truth.")
        XCTAssertEqual(element("memories.detail.title", in: app).label, "The lighthouse promise")

        correct.tap()
        XCTAssertTrue(title.waitForExistence(timeout: 4))
        XCTAssertFalse(error.exists)
        title.tap()
        title.typeText(" — reviewed")
        let revised = try XCTUnwrap(title.value as? String)
        save.tap()
        let editorDismissed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: save)
        XCTAssertEqual(XCTWaiter.wait(for: [editorDismissed], timeout: 4), .completed)
        XCTAssertEqual(element("memories.detail.title", in: app).label, revised)
        capture("Memories - Reviewed correction saved")
        goBack(in: app)
        app.buttons["memories.refresh"].tap()
        XCTAssertTrue(card.waitForExistence(timeout: 4))
        card.tap()
        XCTAssertEqual(element("memories.detail.title", in: app).label, revised)
        goBack(in: app)
        app.buttons["memories.return"].tap()
        XCTAssertTrue(element("home.orb", in: app).waitForExistence(timeout: 4))
        #else
        throw XCTSkip("The narrow correction conflict workflow is iPhone-specific.")
        #endif
    }

    func testHelpfulRecoveryAndSaveConversationAsMemory() throws {
        #if os(iOS)
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing", "--ui-reset-state", "--ui-skip-onboarding", "--ui-open-memories",
            "--ui-memories-fixture", "--ui-memories-card-actions-fixture",
            "-studio_debug_submit_transport_mode", "stub",
        ]
        app.launch()
        defer { app.terminate() }
        let theme = app.buttons["memories.card.theme-lighthouse"]
        XCTAssertTrue(theme.waitForExistence(timeout: 8))
        theme.tap()
        let helpful = app.buttons["memories.detail.helpful"]
        reveal(helpful, in: app)
        assertMinimumTarget(helpful)
        helpful.tap()
        let error = element("memories.card-action.error", in: app)
        XCTAssertTrue(error.waitForExistence(timeout: 4))
        XCTAssertTrue(error.label.contains("Couldn’t confirm"))
        XCTAssertTrue(error.label.contains("refresh Memories"))
        capture("Memories - Helpful failure stays readable")
        goBack(in: app)
        app.buttons["memories.refresh"].tap()
        XCTAssertTrue(theme.waitForExistence(timeout: 4))
        theme.tap()
        reveal(helpful, in: app)
        helpful.tap()
        let confirmation = element("memories.card-action.notice", in: app)
        XCTAssertTrue(confirmation.waitForExistence(timeout: 4))
        XCTAssertEqual(confirmation.label, "Feedback saved.")
        let votes = app.staticTexts["1 helpful / 0 fix"]
        XCTAssertTrue(votes.waitForExistence(timeout: 4))
        XCTAssertFalse(error.exists)
        reveal(votes, in: app)
        capture("Memories - Helpful confirmation")
        goBack(in: app)
        XCTAssertEqual(element("memories.action-notice", in: app).label, "Feedback saved.")

        let conversation = app.buttons["memories.card.history-turn-2"]
        XCTAssertTrue(conversation.waitForExistence(timeout: 4))
        conversation.tap()
        let promote = app.buttons["memories.detail.promote"]
        reveal(promote, in: app)
        assertMinimumTarget(promote)
        XCTAssertEqual(promote.label, "Save as memory")
        XCTAssertFalse(helpful.exists, "Do not offer unsupported Helpful feedback on conversation cards.")
        capture("Memories - Save a conversation as memory")
        promote.tap()
        XCTAssertTrue(app.buttons["memories.detail.correct"].waitForExistence(timeout: 4))
        XCTAssertEqual(element("memories.detail.title", in: app).label, "The tide cuts off retreat")
        reveal(helpful, in: app)
        XCTAssertTrue(helpful.isEnabled)
        XCTAssertFalse(promote.exists)
        capture("Memories - Saved conversation becomes editable")
        goBack(in: app)
        let saved = app.buttons["memories.card.theme-turn_2"]
        XCTAssertTrue(saved.waitForExistence(timeout: 5), "The full read must return the saved card.")
        XCTAssertTrue(conversation.exists, "Saving a memory must not remove the source conversation.")
        XCTAssertEqual(element("memories.action-notice", in: app).label, "Saved as a memory.")
        saved.tap()
        XCTAssertEqual(element("memories.detail.title", in: app).label, "The tide cuts off retreat")
        XCTAssertTrue(app.buttons["memories.detail.correct"].exists)
        reveal(helpful, in: app)
        XCTAssertTrue(helpful.isEnabled)
        XCTAssertFalse(promote.exists)
        goBack(in: app)
        app.buttons["memories.refresh"].tap()
        XCTAssertTrue(saved.waitForExistence(timeout: 4))
        theme.tap()
        XCTAssertTrue(votes.waitForExistence(timeout: 4), "Feedback must survive a full refresh.")
        goBack(in: app)
        app.buttons["memories.return"].tap()
        XCTAssertTrue(element("home.orb", in: app).waitForExistence(timeout: 4))
        #else
        throw XCTSkip("The narrow memory card action workflow is iPhone-specific.")
        #endif
    }

    func testCanonChoicesSurviveFailureAndUndoRequiresConfirmation() throws {
        #if os(iOS)
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing", "--ui-reset-state", "--ui-skip-onboarding", "--ui-open-memories",
            "--ui-memories-fixture", "--ui-memories-canon-fixture",
            "-studio_debug_submit_transport_mode", "stub",
        ]
        app.launch()
        defer { app.terminate() }
        let choice = app.buttons["memories.card.correction-choice-ui-canon-choice"]
        XCTAssertTrue(choice.waitForExistence(timeout: 8))
        choice.tap()
        let apply = app.buttons["memories.canon-clarification.apply"]
        reveal(app.buttons["memories.canon-clarification.select-all"], in: app)
        XCTAssertFalse(apply.isEnabled)
        let first = app.buttons["memories.canon-clarification.fact.0"]
        let second = app.buttons["memories.canon-clarification.fact.1"]
        assertMinimumTarget(first)
        assertMinimumTarget(second)
        first.tap()
        XCTAssertEqual(first.value as? String, "Selected")
        XCTAssertEqual(second.value as? String, "Not selected")
        reveal(apply, in: app)
        assertMinimumTarget(apply)
        apply.tap()
        let error = element("memories.canon-action.error", in: app)
        XCTAssertTrue(error.waitForExistence(timeout: 4))
        XCTAssertTrue(error.label.contains("Your choices are still here"))
        XCTAssertEqual(first.value as? String, "Selected")
        XCTAssertEqual(second.value as? String, "Not selected")
        capture("Memories - Canon failure preserves selected facts")
        goBack(in: app)
        app.buttons["memories.refresh"].tap()
        XCTAssertTrue(choice.waitForExistence(timeout: 4))
        choice.tap()
        reveal(first, in: app)
        first.tap()
        reveal(apply, in: app)
        apply.tap()
        let receipt = app.buttons["memories.card.correction-ui-canon-receipt"]
        XCTAssertTrue(receipt.waitForExistence(timeout: 5))
        XCTAssertEqual(element("memories.action-notice", in: app).label, "Correction applied to the facts you selected.")
        XCTAssertFalse(choice.exists)
        receipt.tap()
        let undo = app.buttons["memories.canon-action.undo"]
        reveal(undo, in: app)
        assertMinimumTarget(undo)
        capture("Memories - Confirmed selected-fact correction")
        undo.tap()
        let confirm = app.buttons["Undo correction"].firstMatch
        let keep = app.buttons["Keep correction"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Mara returns for both")).firstMatch.exists)
        capture("Memories - Confirm before restoring prior canon")
        keep.tap()
        XCTAssertTrue(undo.isEnabled)
        XCTAssertFalse(error.exists)
        undo.tap()
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        confirm.tap()
        XCTAssertTrue(error.waitForExistence(timeout: 4))
        XCTAssertTrue(undo.exists, "An unconfirmed undo must keep the original correction visible.")
        capture("Memories - Undo failure remains recoverable")
        reveal(undo, in: app)
        undo.tap()
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        confirm.tap()
        XCTAssertTrue(receipt.waitForExistence(timeout: 5))
        XCTAssertEqual(element("memories.action-notice", in: app).label, "Correction undone. The prior canon is restored.")
        app.buttons["memories.refresh"].tap()
        receipt.tap()
        XCTAssertTrue(app.staticTexts["Undone"].waitForExistence(timeout: 4))
        XCTAssertFalse(undo.exists)
        capture("Memories - Undo stays recorded after refresh")
        goBack(in: app)
        app.buttons["memories.return"].tap()
        XCTAssertTrue(element("home.orb", in: app).waitForExistence(timeout: 4))
        #else
        throw XCTSkip("The canon confirmation workflow is iPhone-specific.")
        #endif
    }

    func testCreativePreferencesPreserveFailedChangesAndConfirmProjectReset() throws {
        #if os(iOS)
        let app = launchPreferenceFixture()
        defer { app.terminate() }
        let toggle = app.buttons["memories.story-preferences.toggle"]
        assertMinimumTarget(toggle)
        toggle.tap()
        let adjust = app.buttons["memories.story-preference.emotional_reveal.menu"]
        reveal(adjust, in: app)
        assertMinimumTarget(adjust)
        capture("Memories - Readable creative preferences")
        adjust.tap()
        app.buttons["Suggest More Like This"].tap()
        let error = element("memories.story-preferences.error", in: app)
        XCTAssertTrue(error.waitForExistence(timeout: 4))
        XCTAssertTrue(error.label.contains("Check your connection"))
        XCTAssertTrue(adjust.exists, "An unconfirmed write must preserve the reviewed preference.")
        capture("Memories - Preference failure remains recoverable")

        app.buttons["memories.refresh"].tap()
        reveal(adjust, in: app)
        adjust.tap()
        app.buttons["Suggest More Like This"].tap()
        XCTAssertTrue(app.staticTexts["Your choice: more"].waitForExistence(timeout: 4))
        XCTAssertTrue(element("memories.action-notice", in: app).label.contains("Clementine will suggest more"))
        adjust.tap()
        app.buttons["Suggest Less Like This"].tap()
        XCTAssertTrue(app.staticTexts["Your choice: less"].waitForExistence(timeout: 4))
        app.buttons["memories.refresh"].tap()
        XCTAssertTrue(app.staticTexts["Your choice: less"].waitForExistence(timeout: 4))
        capture("Memories - Saved preference survives refresh")

        let reset = app.buttons["memories.story-preferences.reset-all"]
        reveal(reset, in: app)
        assertMinimumTarget(reset)
        reset.tap()
        let confirm = app.buttons["Reset Project Preferences"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "The Last Crossing at the Lighthouse")).firstMatch.exists)
        capture("Memories - Reviewed project reset confirmation")
        app.buttons["Cancel"].tap()
        XCTAssertTrue(app.staticTexts["Your choice: less"].exists)
        reset.tap()
        confirm.tap()
        XCTAssertTrue(error.waitForExistence(timeout: 4))
        XCTAssertTrue(app.staticTexts["Your choice: less"].exists, "An offline reset cannot clear local preferences.")
        capture("Memories - Failed reset preserves preferences")
        app.buttons["memories.refresh"].tap()
        reveal(reset, in: app)
        reset.tap()
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        confirm.tap()
        let removed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: toggle)
        XCTAssertEqual(XCTWaiter.wait(for: [removed], timeout: 4), .completed)
        XCTAssertTrue(element("memories.action-notice", in: app).label.contains("Story facts stay intact"))
        app.buttons["memories.refresh"].tap()
        XCTAssertFalse(toggle.exists)
        XCTAssertTrue(app.buttons["memories.card.ui-lighthouse"].exists, "Resetting preferences must preserve remembered story facts.")
        capture("Memories - Preference reset preserves story memories")
        app.buttons["memories.return"].tap()
        XCTAssertTrue(element("home.orb", in: app).waitForExistence(timeout: 4))
        #else
        throw XCTSkip("Creative preference interaction is an iPhone workflow.")
        #endif
    }

    func testSingleCreativePreferenceResetRequiresReviewAndPreservesOfflineState() throws {
        #if os(iOS)
        let app = launchPreferenceFixture()
        defer { app.terminate() }
        app.buttons["memories.story-preferences.toggle"].tap()
        let adjust = app.buttons["memories.story-preference.emotional_reveal.menu"]
        reveal(adjust, in: app)
        adjust.tap()
        app.buttons["Reset This Preference…"].tap()
        let confirm = app.buttons["Reset This Preference"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        capture("Memories - Reviewed single preference reset")
        app.buttons["Cancel"].tap()
        XCTAssertTrue(adjust.exists)
        for attempt in 0..<2 {
            reveal(adjust, in: app)
            adjust.tap()
            app.buttons["Reset This Preference…"].tap()
            XCTAssertTrue(confirm.waitForExistence(timeout: 3))
            confirm.tap()
            if attempt == 0 {
                XCTAssertTrue(element("memories.story-preferences.error", in: app).waitForExistence(timeout: 4))
                XCTAssertTrue(adjust.exists)
                app.buttons["memories.refresh"].tap()
            }
        }
        let removed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: adjust)
        XCTAssertEqual(XCTWaiter.wait(for: [removed], timeout: 4), .completed)
        XCTAssertTrue(element("memories.action-notice", in: app).label.contains("preference reset"))
        app.buttons["memories.refresh"].tap()
        XCTAssertFalse(adjust.exists)
        XCTAssertTrue(app.buttons["memories.card.ui-lighthouse"].exists)
        #else
        throw XCTSkip("Creative preference reset is an iPhone workflow.")
        #endif
    }

    private func launchPreferenceFixture() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing", "--ui-reset-state", "--ui-skip-onboarding", "--ui-open-memories",
            "--ui-memories-fixture", "--ui-memories-preferences-fixture",
            "-studio_debug_submit_transport_mode", "stub",
        ]
        app.launch()
        XCTAssertTrue(element("memories.screen", in: app).waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["memories.story-preferences.toggle"].waitForExistence(timeout: 4))
        return app
    }

    private func reveal(_ target: XCUIElement, in app: XCUIApplication) {
        XCTAssertTrue(target.waitForExistence(timeout: 4))
        for _ in 0..<5 where !target.isHittable { app.swipeUp() }
        XCTAssertTrue(target.isHittable, app.debugDescription)
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

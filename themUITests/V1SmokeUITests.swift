import Foundation
import XCTest

final class V1SmokeUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func test_home_and_studio_primary_surfaces_remain_available() {
        let home = launchApp()
#if os(macOS)
        openHomeSurface(in: home)
#endif
        XCTAssertTrue(element(identifier: "home.surface", in: home).waitForExistence(timeout: 8))
        XCTAssertTrue(home.buttons["home.open-studio"].waitForExistence(timeout: 5))
        home.terminate()

        let studio = launchApp(openStudio: true)
        XCTAssertTrue(element(identifier: "studio.surface", in: studio).waitForExistence(timeout: 10))
        studio.terminate()
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

    func test_sequential_screenplay_batches_insert_once_and_survive_relaunch() throws {
        let firstAnchor = "INT. KITCHEN - DAY"
        let secondAnchor = "EXT. FERRY TERMINAL - DAWN"
        var app = launchApp(
            openStudio: true,
            openCommandBar: true,
            routePage: true
        )

        try submitStudioWriterBlockPrompt(
            "Write the first page batch for Lucy and Frank.",
            in: app
        )
        XCTAssertTrue(waitForDraft(in: app, containing: firstAnchor, timeout: 10))
        try submitStudioWriterBlockPrompt(
            "Continue with the second batch at the ferry terminal.",
            in: app
        )
        XCTAssertTrue(waitForDraft(in: app, containing: secondAnchor, timeout: 10))
        XCTAssertTrue(
            waitForDraftOccurrences(
                in: app,
                expected: [firstAnchor: 1, secondAnchor: 1],
                timeout: 5
            ),
            "Sequential page batches were missing or duplicated before relaunch."
        )
        app.terminate()

        app = launchApp(
            openStudio: true,
            routePage: true,
            resetState: false
        )
        defer { app.terminate() }

        XCTAssertTrue(waitForDraft(in: app, containing: firstAnchor, timeout: 10))
        XCTAssertTrue(waitForDraft(in: app, containing: secondAnchor, timeout: 5))
        XCTAssertTrue(
            waitForDraftOccurrences(
                in: app,
                expected: [firstAnchor: 1, secondAnchor: 1],
                timeout: 5
            ),
            "Sequential page batches did not restore exactly once after relaunch."
        )
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

    func test_realtime_network_faults_resolve_exactly_once() {
        assertRealtimeNetworkFault(
            stage: "speech",
            outcome: "standard_voice_fallback",
            responseCount: 0,
            fallbackCount: 1,
            duplicateSuppressed: 0
        )
        assertRealtimeNetworkFault(
            stage: "transcription",
            outcome: "standard_voice_fallback",
            responseCount: 0,
            fallbackCount: 1,
            duplicateSuppressed: 0
        )
        assertRealtimeNetworkFault(
            stage: "thinking",
            outcome: "repaired_response",
            responseCount: 1,
            fallbackCount: 0,
            duplicateSuppressed: 1
        )
        assertRealtimeNetworkFault(
            stage: "playback",
            outcome: "repaired_response",
            responseCount: 1,
            fallbackCount: 0,
            duplicateSuppressed: 1
        )
    }

    func test_canon_clarification_is_visible_in_companion_and_studio() {
        let companion = launchApp(showCanonClarification: true)
        XCTAssertTrue(companion.otherElements["canon.clarification.card"].waitForExistence(timeout: 8))
        XCTAssertTrue(staticText(containing: "Mara goes back for both", in: companion).exists)
        XCTAssertEqual(companion.buttons.matching(identifier: "canon.clarification.fact").count, 2)
        let apply = companion.buttons["canon.clarification.apply"]
        XCTAssertTrue(apply.exists)
        XCTAssertFalse(apply.isEnabled)
        companion.buttons["canon.clarification.select-all"].tap()
        XCTAssertTrue(apply.isEnabled)
        XCTAssertTrue(staticText(containing: "2 selected", in: companion).exists)
        companion.buttons["canon.clarification.later"].tap()
        XCTAssertFalse(companion.otherElements["canon.clarification.card"].waitForExistence(timeout: 1))
        companion.terminate()

        let studio = launchApp(openStudio: true, showCanonClarification: true)
        XCTAssertTrue(studio.otherElements["canon.clarification.card"].waitForExistence(timeout: 8))
        XCTAssertTrue(staticText(containing: "Which existing story facts", in: studio).exists)
    }

    func test_draft_conflict_load_server_replaces_local_page() {
        let app = launchApp(
            openStudio: true,
            structuralSeed: true,
            showDraftConflict: true
        )
        defer { app.terminate() }

        let banner = staticText(containing: "Server draft changed", in: app)
        XCTAssertTrue(
            banner.waitForExistence(timeout: 10),
            "Conflict banner missing. Accessibility hierarchy:\n\(app.debugDescription)"
        )
        XCTAssertTrue(waitForDraft(in: app, containing: "INT. DINER - NIGHT", timeout: 5))

        let loadServer = app.buttons["studio.conflict.load-server"]
        if !loadServer.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(loadServer.waitForExistence(timeout: 3), "Load Server action was not exposed.")
        XCTAssertTrue(loadServer.isHittable, "Load Server action was visible but not hittable.")
        loadServer.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()

        XCTAssertTrue(
            waitForDraft(in: app, containing: "EXT. FERRY TERMINAL - DAWN", timeout: 5),
            "Load Server did not replace the local page. Accessibility hierarchy:\n\(app.debugDescription)"
        )
        XCTAssertTrue(
            waitForDisappearance(of: banner, timeout: 5),
            "Conflict banner remained after Load Server. Accessibility hierarchy:\n\(app.debugDescription)"
        )
        XCTAssertTrue(
            staticText(containing: "Loaded latest server draft", in: app).waitForExistence(timeout: 5),
            "Load Server confirmation was not presented."
        )
    }

    func test_draft_conflict_keep_mine_preserves_local_page() {
        let app = launchApp(
            openStudio: true,
            structuralSeed: true,
            showDraftConflict: true,
            conflictSaveSuccess: true
        )
        defer { app.terminate() }

        let banner = staticText(containing: "Server draft changed", in: app)
        XCTAssertTrue(
            banner.waitForExistence(timeout: 10),
            "Conflict banner missing. Accessibility hierarchy:\n\(app.debugDescription)"
        )
        XCTAssertTrue(waitForDraft(in: app, containing: "INT. DINER - NIGHT", timeout: 5))

        let keepMine = app.buttons["studio.conflict.keep-mine"]
        if !keepMine.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(keepMine.waitForExistence(timeout: 3), "Keep Mine action was not exposed.")
        XCTAssertTrue(keepMine.isHittable, "Keep Mine action was visible but not hittable.")
        keepMine.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()

        XCTAssertTrue(
            waitForDraft(in: app, containing: "INT. DINER - NIGHT", timeout: 5),
            "Keep Mine replaced the local page unexpectedly. Accessibility hierarchy:\n\(app.debugDescription)"
        )
        XCTAssertTrue(
            waitForDisappearance(of: banner, timeout: 5),
            "Conflict banner remained after Keep Mine. Accessibility hierarchy:\n\(app.debugDescription)"
        )
        XCTAssertTrue(
            staticText(containing: "Local draft saved", in: app).waitForExistence(timeout: 5),
            "Keep Mine confirmation was not presented."
        )
    }

    func test_studio_compact_drawers_fit_phone_and_remain_mutually_exclusive() {
        let app = launchApp(openStudio: true, structuralSeed: true)
        defer { app.terminate() }

        let studio = app.otherElements["studio.surface"]
        XCTAssertTrue(
            studio.waitForExistence(timeout: 10),
            "Studio surface did not open. Accessibility hierarchy:\n\(app.debugDescription)"
        )
        XCTAssertLessThanOrEqual(
            studio.frame.maxX,
            app.frame.maxX + 1,
            "Studio extended past the phone viewport: studio=\(studio.frame), app=\(app.frame)"
        )
        let compactDone = app.buttons["studio.compact.done"]
        XCTAssertTrue(compactDone.waitForExistence(timeout: 5), "Compact close control was not exposed.")
        let leftToggle = app.buttons["studio.sidebar.left.toggle"]
        XCTAssertTrue(
            waitForHittability(of: compactDone, timeout: 3),
            "Compact close control was compressed or obstructed: control=\(compactDone.frame), left=\(leftToggle.frame), app=\(app.frame)"
        )
        XCTAssertGreaterThanOrEqual(
            compactDone.frame.minY,
            54,
            "Compact header remained underneath the phone status region: control=\(compactDone.frame)"
        )

        let leftDrawer = element(identifier: "studio.sidebar.left.drawer", in: app)
        let rightDrawer = element(identifier: "studio.sidebar.right.drawer", in: app)
        XCTAssertFalse(leftDrawer.exists, "Project drawer should begin closed on compact layouts.")
        XCTAssertFalse(rightDrawer.exists, "Inspector drawer should begin closed on compact layouts.")

        XCTAssertTrue(leftToggle.waitForExistence(timeout: 5))
        XCTAssertTrue(leftToggle.isHittable)
        leftToggle.tap()
        XCTAssertTrue(leftDrawer.waitForExistence(timeout: 5), "Project drawer did not open.")
        XCTAssertFalse(rightDrawer.exists, "Inspector remained open behind the project drawer.")

        let rightToggle = app.buttons["studio.sidebar.right.toggle"]
        XCTAssertTrue(rightToggle.waitForExistence(timeout: 5))
        XCTAssertTrue(rightToggle.isHittable)
        rightToggle.tap()
        XCTAssertTrue(rightDrawer.waitForExistence(timeout: 5), "Inspector drawer did not open.")
        XCTAssertTrue(
            waitForDisappearance(of: leftDrawer, timeout: 5),
            "Project drawer remained open behind the inspector."
        )

        rightToggle.tap()
        XCTAssertTrue(
            waitForDisappearance(of: rightDrawer, timeout: 5),
            "Inspector drawer did not close."
        )
        XCTAssertTrue(waitForDraft(in: app, containing: "INT. DINER - NIGHT", timeout: 5))
    }

    func test_restored_screenplay_question_can_be_answered_or_skipped() {
        let answerApp = launchApp(
            openStudio: true,
            showPendingScreenplayQuestion: true
        )
        revealStudioPendingQuestion(in: answerApp)
        let answerCard = element(identifier: "studio.pending-question", in: answerApp)
        XCTAssertTrue(
            answerCard.waitForExistence(timeout: 8),
            "The restored Clementine question was not visible. Accessibility hierarchy:\n\(answerApp.debugDescription)"
        )
        let questionText = element(identifier: "studio.pending-question.text", in: answerApp)
        XCTAssertTrue(questionText.waitForExistence(timeout: 3), "The restored question text was missing.")
        let questionTextContent = [
            questionText.label,
            questionText.value as? String ?? ""
        ].joined(separator: " ")
        XCTAssertTrue(
            questionTextContent.localizedCaseInsensitiveContains("What does Mara learn"),
            "The restored question text did not match the active project: \(questionTextContent)"
        )
        answerApp.buttons["studio.pending-question.answer"].tap()
        let answerField = element(identifier: "studio.prompt.field", in: answerApp)
        XCTAssertTrue(answerField.waitForExistence(timeout: 5))
        answerField.tap()
        answerField.typeText("She learns that love means trusting June to choose for herself.")
        submitFocusedPrompt(in: answerApp, field: answerField)
        XCTAssertTrue(
            waitForDisappearance(of: answerCard, timeout: 5),
            "The answered question remained visible after submitting from the keyboard."
        )
        answerApp.terminate()

        let skipApp = launchApp(
            openStudio: true,
            showPendingScreenplayQuestion: true
        )
        defer { skipApp.terminate() }
        revealStudioPendingQuestion(in: skipApp)
        let skipCard = element(identifier: "studio.pending-question", in: skipApp)
        XCTAssertTrue(skipCard.waitForExistence(timeout: 8))
        XCTAssertEqual(
            skipApp.descendants(matching: .any).matching(identifier: "studio.pending-question").count,
            1,
            "Studio exposed duplicate pending-question cards."
        )
        let skipButton = skipApp.buttons["studio.pending-question.skip"]
        XCTAssertTrue(skipButton.isEnabled, "Skip was visible but disabled by unrelated companion work.")
        XCTAssertTrue(skipButton.isHittable, "Skip was visible but its touch target was covered.")
        skipButton.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(
            waitForDisappearance(of: skipCard, timeout: 5),
            "The skipped question remained visible after the decline was recorded. Accessibility hierarchy:\n\(skipApp.debugDescription)"
        )
    }

    func test_provisional_story_options_require_an_explicit_selection() {
        let app = launchApp(
            openStudio: true,
            showProvisionalScreenplayOptions: true
        )
        defer { app.terminate() }
        revealStudioPendingQuestion(in: app)

        let card = element(identifier: "studio.pending-question", in: app)
        XCTAssertTrue(card.waitForExistence(timeout: 8))
        XCTAssertTrue(
            element(identifier: "studio.pending-question.options", in: app)
                .waitForExistence(timeout: 3)
        )
        XCTAssertEqual(
            app.buttons.matching(
                NSPredicate(format: "identifier BEGINSWITH %@", "studio.pending-question.option-")
            ).count,
            3,
            "Clementine should expose exactly three provisional choices. Accessibility hierarchy:\n\(app.debugDescription)"
        )

        let optionTwo = app.buttons["studio.pending-question.option-2"]
        XCTAssertTrue(optionTwo.waitForExistence(timeout: 3))
        XCTAssertTrue(optionTwo.isHittable)
        optionTwo.tap()
        XCTAssertTrue(
            waitForDisappearance(of: card, timeout: 5),
            "The chosen provisional option remained unresolved."
        )
        XCTAssertTrue(
            staticText(containing: "Option 2 saved", in: app).waitForExistence(timeout: 3)
        )
    }

    func test_pending_screenplay_question_appears_in_memories_and_opens_studio() {
        let app = launchApp(
            openMemories: true,
            showPendingScreenplayQuestion: true
        )
        defer { app.terminate() }

        let questionCard = element(identifier: "memories.pending-question", in: app)
        #if os(macOS)
        XCTAssertTrue(
            app.sheets.firstMatch.waitForExistence(timeout: 8),
            "Memories did not open as a desktop sheet."
        )
        #else
        XCTAssertTrue(
            app.otherElements["memories.screen"].waitForExistence(timeout: 8),
            "Memories did not open."
        )
        #endif
        XCTAssertTrue(
            questionCard.waitForExistence(timeout: 5),
            "Memories did not surface the unresolved screenplay question."
        )
        let questionText = element(identifier: "memories.pending-question.text", in: app)
        XCTAssertTrue(questionText.waitForExistence(timeout: 3))
        let questionTextContent = [
            questionText.label,
            questionText.value as? String ?? "",
        ].joined(separator: " ")
        XCTAssertTrue(
            questionTextContent.localizedCaseInsensitiveContains("What does Mara learn"),
            "Memories surfaced the wrong screenplay question: \(questionTextContent)"
        )

        let openStudio = app.buttons["memories.pending-question.open-studio"]
        XCTAssertTrue(openStudio.waitForExistence(timeout: 3))
        XCTAssertTrue(openStudio.isHittable)
        openStudio.tap()

        XCTAssertTrue(
            element(identifier: "studio.surface", in: app).waitForExistence(timeout: 8),
            "Open Studio did not return the writer to the screenplay workspace."
        )
        revealStudioPendingQuestion(in: app)
        XCTAssertTrue(
            element(identifier: "studio.pending-question", in: app).waitForExistence(timeout: 5),
            "The unresolved question did not follow the writer into Studio."
        )
    }

    @MainActor
    func test_backend_project_restore_loads_seeded_screenplay_session() async throws {
        let baseURL = URL(string: "http://127.0.0.1:31337")!
        guard await backendRestoreContractIsAvailable(baseURL: baseURL) else {
            throw XCTSkip("Backend restore contract server is not running on \(baseURL.absoluteString).")
        }

        let fixture = try await seedBackendRestoreContractFixture(baseURL: baseURL)
        try await assertBackendProjectRestoreLoads(fixture)
    }

    @MainActor
    func test_screenplay_save_outbox_survives_relaunch_and_reconnects_once() async throws {
        let configuredPort = Int(
            ProcessInfo.processInfo.environment["THEM_UITEST_SCREENPLAY_SAVE_BACKEND_PORT"] ?? ""
        ) ?? 31337
        let baseURL = try XCTUnwrap(URL(string: "http://127.0.0.1:\(configuredPort)"))
        guard await backendRestoreContractIsAvailable(baseURL: baseURL) else {
            throw XCTSkip("Screenplay save recovery server is not running on \(baseURL.absoluteString).")
        }

        let fixture = try await seedBackendRestoreContractFixture(baseURL: baseURL)
        let marker = "SAVE-OUTBOX-\(UUID().uuidString.uppercased())"
        var app = launchApp(
            openStudio: true,
            screenplaySaveNetworkFaultMarker: marker,
            restoreProjectID: fixture.projectID,
            restoreVersionID: fixture.versionID,
            restoreLoadToken: fixture.loadToken,
            launchEnvironment: fixture.appLaunchEnvironment
        )

        XCTAssertTrue(app.otherElements["studio.surface"].waitForExistence(timeout: 12))
        var queuedSnapshot: [String: Any] = [:]
        XCTAssertTrue(
            waitForRestoreSnapshot(in: app, timeout: 60) { snapshot in
                queuedSnapshot = snapshot
                return stringValue(snapshot["selected_project_id"]).lowercased() == fixture.projectID.lowercased()
                    && stringValue(snapshot["draft_tail_preview"]).contains(marker)
                    && intValue(snapshot["queued_draft_save_count"]) == 1
                    && intValue(snapshot["parked_draft_save_count"]) == 0
                    && boolValue(snapshot["has_unsaved_draft_changes"])
                    && stringValue(snapshot["autosave_status_text"])
                        .localizedCaseInsensitiveContains("queued locally")
                    && stringValue(snapshot["error_text"]).isEmpty
            },
            "Offline screenplay save was not durably queued before termination. Snapshot: \(queuedSnapshot)"
        )
        app.terminate()

        app = launchApp(
            openStudio: true,
            resetState: false,
            launchEnvironment: fixture.appLaunchEnvironment
        )
        defer { app.terminate() }

        XCTAssertTrue(app.otherElements["studio.surface"].waitForExistence(timeout: 12))
        var recoveredSnapshot: [String: Any] = [:]
        XCTAssertTrue(
            waitForRestoreSnapshot(in: app, timeout: 75) { snapshot in
                recoveredSnapshot = snapshot
                return stringValue(snapshot["selected_project_id"]).lowercased() == fixture.projectID.lowercased()
                    && stringValue(snapshot["draft_tail_preview"]).contains(marker)
                    && intValue(snapshot["queued_draft_save_count"]) == 0
                    && intValue(snapshot["parked_draft_save_count"]) == 0
                    && !boolValue(snapshot["has_unsaved_draft_changes"])
                    && !boolValue(snapshot["is_saving"])
                    && stringValue(snapshot["latest_version_id"]).lowercased() != fixture.versionID.lowercased()
                    && stringValue(snapshot["error_text"]).isEmpty
            },
            "Queued screenplay save did not reconnect automatically after relaunch. Snapshot: \(recoveredSnapshot)"
        )

        let projectResponse = try await requestJSON(
            baseURL: baseURL,
            path: "/screenplay/projects/\(fixture.projectID)",
            method: "GET",
            headers: [
                "X-APP-TOKEN": fixture.appLaunchEnvironment["THEM_UITEST_APP_TOKEN"] ?? "them-dev",
                "X-Client-Token": fixture.appLaunchEnvironment["THEM_UITEST_CLIENT_TOKEN"] ?? "",
                "Authorization": "Bearer \(fixture.appLaunchEnvironment["THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN"] ?? "")",
            ],
            body: nil,
            queryItems: [
                URLQueryItem(name: "include_drafts", value: "1"),
                URLQueryItem(name: "version_limit", value: "24"),
            ]
        )
        try assertHTTP(projectResponse, context: "recovered screenplay project")
        let envelope = projectResponse.payload["payload"] as? [String: Any] ?? projectResponse.payload
        let project = envelope["project"] as? [String: Any] ?? envelope
        let versions = project["versions"] as? [[String: Any]] ?? []
        let recoveredVersions = versions.filter { version in
            stringValue(version["draft"]).contains(marker)
        }
        XCTAssertEqual(
            recoveredVersions.count,
            1,
            "The recovered local save must create exactly one server version: \(versions)"
        )
        let recoveredVersion = try XCTUnwrap(recoveredVersions.first)
        let recoveredVersionID = try firstNonEmptyString(
            recoveredVersion["id"],
            recoveredVersion["version_id"],
            message: "Recovered server version did not expose an id."
        )
        XCTAssertEqual(
            stringValue(project["active_version_id"] ?? project["activeVersionId"]).lowercased(),
            recoveredVersionID.lowercased()
        )
        XCTAssertEqual(stringValue(recoveredVersion["source"]), "studio_manual")
        XCTAssertFalse(
            stringValue(recoveredVersion["client_request_id"] ?? recoveredVersion["clientRequestId"]).isEmpty,
            "The recovered version must retain its idempotency key."
        )
    }

    @MainActor
    func test_screenplay_save_outbox_refreshes_auth_and_resolves_stale_conflict_once() async throws {
        let configuredPort = Int(
            ProcessInfo.processInfo.environment["THEM_UITEST_SCREENPLAY_SAVE_BACKEND_PORT"] ?? ""
        ) ?? 31337
        let baseURL = try XCTUnwrap(URL(string: "http://127.0.0.1:\(configuredPort)"))
        guard await backendRestoreContractIsAvailable(baseURL: baseURL) else {
            throw XCTSkip("Screenplay save recovery server is not running on \(baseURL.absoluteString).")
        }

        let fixture = try await seedBackendRestoreContractFixture(baseURL: baseURL)
        let marker = "SAVE-CONFLICT-\(UUID().uuidString.uppercased())"
        var app = launchApp(
            openStudio: true,
            screenplaySaveNetworkFaultMarker: marker,
            restoreProjectID: fixture.projectID,
            restoreVersionID: fixture.versionID,
            restoreLoadToken: fixture.loadToken,
            launchEnvironment: fixture.appLaunchEnvironment
        )

        XCTAssertTrue(app.otherElements["studio.surface"].waitForExistence(timeout: 12))
        var queuedSnapshot: [String: Any] = [:]
        XCTAssertTrue(
            waitForRestoreSnapshot(in: app, timeout: 60) { snapshot in
                queuedSnapshot = snapshot
                return stringValue(snapshot["draft_tail_preview"]).contains(marker)
                    && intValue(snapshot["queued_draft_save_count"]) == 1
                    && intValue(snapshot["parked_draft_save_count"]) == 0
                    && boolValue(snapshot["has_unsaved_draft_changes"])
                    && stringValue(snapshot["error_text"]).isEmpty
            },
            "Offline screenplay save was not queued before stale-version setup. Snapshot: \(queuedSnapshot)"
        )
        app.terminate()

        let ownerHeaders = [
            "X-APP-TOKEN": fixture.appLaunchEnvironment["THEM_UITEST_APP_TOKEN"] ?? "them-dev",
            "X-Client-Token": fixture.appLaunchEnvironment["THEM_UITEST_CLIENT_TOKEN"] ?? "",
            "Authorization": "Bearer \(fixture.appLaunchEnvironment["THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN"] ?? "")",
        ]
        let competingDraft = "\(fixture.expectedDraft)\n\nSERVER-COLLABORATOR-\(UUID().uuidString.uppercased())"
        let competingSave = try await requestJSON(
            baseURL: baseURL,
            path: "/screenplay/projects/\(fixture.projectID)/version",
            method: "POST",
            headers: ownerHeaders,
            body: [
                "draft": competingDraft,
                "title": "Concurrent server revision",
                "phase": "scene_draft",
                "source": "ui_network_fault_competitor",
                "base_version_id": fixture.versionID,
                "conflict_strategy": "reject_if_stale",
                "client_request_id": "ui-competitor-\(UUID().uuidString.lowercased())",
            ]
        )
        try assertHTTP(competingSave, context: "competing screenplay version")
        let competingVersionID = try firstNonEmptyString(
            competingSave.payload["version_id"],
            competingSave.payload["server_version_id"],
            message: "Competing screenplay save did not return a version id."
        )

        app = launchApp(
            openStudio: true,
            screenplaySaveExpireAuthOnce: true,
            resetState: false,
            launchEnvironment: fixture.appLaunchEnvironment
        )
        defer { app.terminate() }

        XCTAssertTrue(app.otherElements["studio.surface"].waitForExistence(timeout: 12))
        var conflictSnapshot: [String: Any] = [:]
        XCTAssertTrue(
            waitForRestoreSnapshot(in: app, timeout: 75) { snapshot in
                conflictSnapshot = snapshot
                return stringValue(snapshot["selected_project_id"]).lowercased() == fixture.projectID.lowercased()
                    && stringValue(snapshot["conflict_project_id"]).lowercased() == fixture.projectID.lowercased()
                    && stringValue(snapshot["conflict_server_version_id"]).lowercased() == competingVersionID.lowercased()
                    && stringValue(snapshot["draft_tail_preview"]).contains(marker)
                    && intValue(snapshot["queued_draft_save_count"]) == 0
                    && intValue(snapshot["parked_draft_save_count"]) == 0
                    && boolValue(snapshot["has_unsaved_draft_changes"])
                    && stringValue(snapshot["error_text"]).isEmpty
            },
            "Expired auth was not refreshed into a clean stale-version decision. Snapshot: \(conflictSnapshot)"
        )

        let preResolutionProject = try await requestJSON(
            baseURL: baseURL,
            path: "/screenplay/projects/\(fixture.projectID)",
            method: "GET",
            headers: ownerHeaders,
            body: nil,
            queryItems: [
                URLQueryItem(name: "include_drafts", value: "1"),
                URLQueryItem(name: "version_limit", value: "24"),
            ]
        )
        try assertHTTP(preResolutionProject, context: "pre-resolution screenplay project")
        let preResolutionEnvelope = preResolutionProject.payload["payload"] as? [String: Any]
            ?? preResolutionProject.payload
        let preResolutionBody = preResolutionEnvelope["project"] as? [String: Any]
            ?? preResolutionEnvelope
        let preResolutionVersions = preResolutionBody["versions"] as? [[String: Any]] ?? []
        XCTAssertEqual(
            preResolutionVersions.filter { stringValue($0["draft"]).contains(marker) }.count,
            0,
            "A stale queued save must not commit before the writer chooses a resolution."
        )

        let keepMine = app.buttons["studio.conflict.keep-mine"]
        if !keepMine.isHittable { app.swipeUp() }
        XCTAssertTrue(keepMine.waitForExistence(timeout: 5), "Keep Mine was not exposed for the recovered conflict.")
        XCTAssertTrue(keepMine.isHittable, "Keep Mine was visible but not hittable for the recovered conflict.")
        keepMine.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()

        var resolvedSnapshot: [String: Any] = [:]
        XCTAssertTrue(
            waitForRestoreSnapshot(in: app, timeout: 75) { snapshot in
                resolvedSnapshot = snapshot
                return stringValue(snapshot["conflict_project_id"]).isEmpty
                    && stringValue(snapshot["draft_tail_preview"]).contains(marker)
                    && intValue(snapshot["queued_draft_save_count"]) == 0
                    && intValue(snapshot["parked_draft_save_count"]) == 0
                    && !boolValue(snapshot["has_unsaved_draft_changes"])
                    && !boolValue(snapshot["is_saving"])
                    && stringValue(snapshot["error_text"]).isEmpty
            },
            "Keep Mine did not resolve the recovered conflict cleanly. Snapshot: \(resolvedSnapshot)"
        )

        let resolvedProject = try await requestJSON(
            baseURL: baseURL,
            path: "/screenplay/projects/\(fixture.projectID)",
            method: "GET",
            headers: ownerHeaders,
            body: nil,
            queryItems: [
                URLQueryItem(name: "include_drafts", value: "1"),
                URLQueryItem(name: "version_limit", value: "24"),
            ]
        )
        try assertHTTP(resolvedProject, context: "resolved screenplay project")
        let resolvedEnvelope = resolvedProject.payload["payload"] as? [String: Any] ?? resolvedProject.payload
        let resolvedBody = resolvedEnvelope["project"] as? [String: Any] ?? resolvedEnvelope
        let resolvedVersions = resolvedBody["versions"] as? [[String: Any]] ?? []
        let localVersions = resolvedVersions.filter { stringValue($0["draft"]).contains(marker) }
        XCTAssertEqual(localVersions.count, 1, "Keep Mine must commit exactly one recovered local version.")
        let localVersion = try XCTUnwrap(localVersions.first)
        XCTAssertEqual(stringValue(localVersion["source"]), "studio_conflict_resolve")
        XCTAssertFalse(
            stringValue(localVersion["client_request_id"] ?? localVersion["clientRequestId"]).isEmpty,
            "The resolved local version must retain an idempotency key."
        )
        let localVersionID = try firstNonEmptyString(
            localVersion["id"],
            localVersion["version_id"],
            message: "Resolved local version did not expose an id."
        )
        XCTAssertEqual(
            stringValue(resolvedBody["active_version_id"] ?? resolvedBody["activeVersionId"]).lowercased(),
            localVersionID.lowercased()
        )
    }

    @MainActor
    func test_cross_platform_backend_project_restore_loads_preseeded_screenplay_session() async throws {
        guard let fixture = try restoreContractFixtureFromEnvironment() else {
            throw XCTSkip("No cross-platform restore fixture was provided.")
        }
        try await assertBackendProjectRestoreLoads(fixture)
    }

    @MainActor
    func test_cross_platform_project_and_canon_correction_survive_restart() async throws {
        guard let fixture = try restoreContractFixtureFromEnvironment() else {
            throw XCTSkip("No cross-platform restore fixture was provided.")
        }
        guard !fixture.expectedCanonCorrectionTitle.isEmpty,
              !fixture.expectedCanonCorrectionText.isEmpty,
              !fixture.expectedRetiredCanonFacts.isEmpty else {
            throw XCTSkip("The cross-platform fixture does not include a canon correction contract.")
        }

        try await assertBackendProjectRestoreLoads(fixture)
        assertCanonCorrectionRestoresAcrossRelaunch(fixture)
    }

    @MainActor
    func test_cross_platform_learned_answer_appears_after_relaunch() async throws {
        guard let fixture = try learnedMemoryFixtureFromEnvironment() else {
            throw XCTSkip("No cross-platform learned-memory fixture was provided.")
        }

        switch fixture.handoffStage {
        case "iphone_source":
            try await assertIPhoneRescueRejectionPersists(fixture)
        case "mac_repair":
            try assertMacAdaptsAndCorrectsRescue(fixture)
        case "iphone_round_trip":
            try await assertIPhoneReceivesCorrectionAndProtectsCanon(fixture)
        default:
            XCTFail("Unknown learned-memory handoff stage: \(fixture.handoffStage)")
        }
    }

    @MainActor
    private func assertIPhoneRescueRejectionPersists(
        _ fixture: LearnedMemoryFixture
    ) async throws {
        let app = launchLearnedMemoryStudio(fixture)
        defer { app.terminate() }

        XCTAssertTrue(
            element(identifier: "studio.surface", in: app).waitForExistence(timeout: 12),
            "Studio did not open for the iPhone source handoff."
        )
        try submitStudioWriterBlockPrompt(fixture.writerBlockPrompt, in: app)
        XCTAssertTrue(
            waitForAccessibilityText(
                identifier: "studio.voice-pin.latest.output",
                containing: fixture.baselineStrongestMove,
                in: app,
                timeout: 35
            ),
            "The source iPhone did not receive the baseline reversal rescue."
        )

        let rejectionCommit = try await requestJSON(
            baseURL: fixture.baseURL,
            path: "/realtime/turn_commit",
            method: "POST",
            headers: fixture.authorizedHeaders,
            body: [
                "transcript": "That did not help. I am still stuck. Try a different move.",
                "reply": "You are right. I will change the story engine.",
                "request_id": "cross-device-rescue-failed-\(UUID().uuidString.lowercased())",
                "studio": [
                    "screenplay_project_id": fixture.projectID,
                    "screenplay_project_title": fixture.projectTitle,
                    "screenplay_target": "voice_pin",
                    "screenplay_prompt_source": "typed",
                    "screenplay_act": "Act II",
                    "screenplay_feature_sequence": fixture.featureSequence,
                ],
            ]
        )
        try assertHTTP(rejectionCommit, context: "cross-device failed-rescue commit")

        revealStudioCreativeInstincts(in: app)
        let refresh = element(identifier: "studio.story-preferences.refresh", in: app)
        makeHittable(refresh, in: app)
        XCTAssertTrue(refresh.waitForExistence(timeout: 5) && refresh.isHittable)
#if os(macOS)
        refresh.click()
#else
        refresh.tap()
#endif
        let rejectedPreference = element(
            identifier: "studio.story-preference.\(fixture.preferenceFamily)",
            in: app
        )
        XCTAssertTrue(
            waitForAccessibilityText(
                in: rejectedPreference,
                containing: "did not unblock you",
                timeout: 20
            ),
            "The source iPhone did not persist the failed rescue into Creative Instincts."
        )
    }

    @MainActor
    private func assertMacAdaptsAndCorrectsRescue(
        _ fixture: LearnedMemoryFixture
    ) throws {
        let app = launchLearnedMemoryStudio(fixture)
        defer { app.terminate() }

        XCTAssertTrue(
            element(identifier: "studio.surface", in: app).waitForExistence(timeout: 12),
            "Studio did not open for the macOS repair handoff."
        )
        try submitStudioWriterBlockPrompt(fixture.writerBlockPrompt, in: app)
        XCTAssertTrue(
            waitForAccessibilityText(
                identifier: "studio.voice-pin.latest.output",
                containing: fixture.repairedStrongestMove,
                in: app,
                timeout: 35
            ),
            "macOS repeated the rejected reversal instead of adapting the rescue."
        )
        XCTAssertTrue(
            waitForAccessibilityText(
                identifier: "studio.voice-pin.latest.output",
                containing: fixture.repairMemoryLine,
                in: app,
                timeout: 5
            ),
            "macOS adapted without acknowledging the failed iPhone rescue."
        )

        revealStudioCreativeInstincts(in: app)
        let preference = element(
            identifier: "studio.story-preference.\(fixture.preferenceFamily)",
            in: app
        )
        XCTAssertTrue(
            waitForAccessibilityText(in: preference, containing: "did not unblock you", timeout: 20),
            "macOS did not restore the iPhone rescue evidence after backend restart."
        )
        let preferAction = waitForFirstVisibleElement(
            in: app.buttons.matching(
                identifier: "studio.story-preference.\(fixture.preferenceFamily).prefer"
            ),
            app: app,
            timeout: 8
        )
        XCTAssertNotNil(preferAction, "macOS did not expose the real prefer correction control.")
        guard let preferAction else { return }
        makeHittable(preferAction, in: app)
        XCTAssertTrue(preferAction.isHittable)
#if os(macOS)
        preferAction.click()
#else
        preferAction.tap()
#endif
        XCTAssertTrue(
            waitForAccessibilityText(in: preference, containing: "corrected", timeout: 15),
            studioInstinctCorrectionFailure(in: app)
        )
    }

    @MainActor
    private func assertIPhoneReceivesCorrectionAndProtectsCanon(
        _ fixture: LearnedMemoryFixture
    ) async throws {
        var app = launchApp(
            openMemories: true,
            liveMemory: true,
            launchEnvironment: fixture.appLaunchEnvironment
        )
        let memoriesSurface = learnedMemorySurface(in: app)
        XCTAssertTrue(
            memoriesSurface.waitForExistence(timeout: 12),
            "Memories did not open on the returning iPhone."
        )
        let preferenceToggle = element(identifier: "memories.story-preferences.toggle", in: app)
        XCTAssertTrue(preferenceToggle.waitForExistence(timeout: 30))
        preferenceToggle.tap()
        let preference = element(
            identifier: "memories.story-preference.\(fixture.preferenceFamily)",
            in: app
        )
        XCTAssertTrue(
            waitForAccessibilityText(in: preference, containing: "corrected", timeout: 30),
            "The macOS correction did not appear in iPhone Memories after relaunch."
        )
        preferenceToggle.tap()
        let card = learnedMemoryCard(character: fixture.character, in: memoriesSurface)
        XCTAssertTrue(
            card.waitForExistence(timeout: 30),
            "The original iPhone character learning disappeared during the rescue handoff."
        )
        openLearnedMemoryCard(card, in: memoriesSurface)
        assertLearnedMemoryFields(fixture, prefix: "memory.learned-field", in: app)
        app.terminate()

        app = launchLearnedMemoryStudio(fixture)
        defer { app.terminate() }
        XCTAssertTrue(
            element(identifier: "studio.surface", in: app).waitForExistence(timeout: 12),
            "Studio did not reopen on the returning iPhone."
        )
        try submitStudioWriterBlockPrompt(fixture.writerBlockPrompt, in: app)
        XCTAssertTrue(
            waitForAccessibilityText(
                identifier: "studio.voice-pin.latest.output",
                containing: fixture.correctedStrongestMove,
                in: app,
                timeout: 35
            ),
            "The returning iPhone did not honor the explicit macOS rescue correction."
        )

        let canonCommit = try await requestJSON(
            baseURL: fixture.baseURL,
            path: "/realtime/turn_commit",
            method: "POST",
            headers: fixture.authorizedHeaders,
            body: [
                "transcript": "Keep this accepted page and its setup as canon.",
                "reply": fixture.acceptedCanonPage,
                "request_id": "cross-device-due-canon-\(UUID().uuidString.lowercased())",
                "studio": [
                    "screenplay_project_id": fixture.projectID,
                    "screenplay_project_title": fixture.projectTitle,
                    "screenplay_target": "page",
                    "screenplay_prompt_source": "typed",
                    "screenplay_anchor_scene_label": "INT. CLOCK TOWER - NIGHT",
                    "screenplay_inserted_text": fixture.acceptedCanonPage,
                    "screenplay_act": "Act II",
                    "screenplay_feature_sequence": fixture.featureSequence,
                    "screenplay_scene_summary": "Mara hides the red locket inside the courthouse clock.",
                    "screenplay_current_beat": "Mara leaves without telling Eli where the locket is.",
                    "screenplay_character_focus": ["Mara", "Eli"],
                    "screenplay_unresolved_setups": [fixture.dueSetup],
                    "screenplay_act_three_payoff_path": [fixture.duePayoff],
                ],
            ]
        )
        try assertHTTP(canonCommit, context: "cross-device due-canon commit")

        try submitStudioWriterBlockPrompt(fixture.writerBlockPrompt, in: app)
        XCTAssertTrue(
            waitForAccessibilityText(
                identifier: "studio.voice-pin.latest.output",
                containing: fixture.canonStrongestMove,
                in: app,
                timeout: 35
            ),
            "Due canon did not outrank the corrected cross-device instinct."
        )
        XCTAssertTrue(
            waitForAccessibilityText(
                identifier: "studio.voice-pin.latest.output",
                containing: fixture.dueSetup,
                in: app,
                timeout: 5
            ),
            "The returning iPhone rescue omitted the protected due setup."
        )
    }

    @MainActor
    private func launchLearnedMemoryStudio(
        _ fixture: LearnedMemoryFixture
    ) -> XCUIApplication {
        launchApp(
            openStudio: true,
            openCommandBar: true,
            liveMemory: true,
            restoreProjectID: fixture.projectID,
            submitTransportMode: "live-backend",
            launchEnvironment: fixture.appLaunchEnvironment
        )
    }

    @MainActor
    func test_studio_writer_block_rescue_follows_instinct_then_protects_due_canon() async throws {
        guard let fixture = try studioInstinctFixtureFromEnvironment() else {
            throw XCTSkip("No Studio writer-block instinct fixture was provided.")
        }

        let launchStudio = {
            self.launchApp(
                openStudio: true,
                openCommandBar: true,
                liveMemory: true,
                restoreProjectID: fixture.projectID,
                submitTransportMode: "live-backend",
                launchEnvironment: fixture.appLaunchEnvironment
            )
        }
        var app = launchStudio()
        defer { app.terminate() }

        XCTAssertTrue(
            element(identifier: "studio.surface", in: app).waitForExistence(timeout: 12),
            "Studio did not open for the writer-block instinct smoke."
        )
        try submitStudioWriterBlockPrompt(fixture.prompt, in: app)
        let baselineMatched = waitForAccessibilityText(
            identifier: "studio.voice-pin.latest.output",
            containing: fixture.baselineStrongestMove,
            in: app,
            timeout: 35
        )
        try recordStudioInstinctEvidence(
            stage: "01-baseline",
            expected: [fixture.baselineStrongestMove],
            in: app,
            fixture: fixture
        )
        XCTAssertTrue(
            baselineMatched,
            "The baseline writer-block response did not expose \(fixture.baselineStrongestMove). Accessibility hierarchy:\n\(app.debugDescription)"
        )

        let rejectionCommit = try await requestJSON(
            baseURL: fixture.baseURL,
            path: "/realtime/turn_commit",
            method: "POST",
            headers: fixture.authorizedHeaders,
            body: [
                "transcript": "That did not help. I am still stuck. Try a different move.",
                "reply": "You are right. I will change the story engine.",
                "request_id": "ui-instinct-rescue-failed-\(UUID().uuidString.lowercased())",
                "studio": [
                    "screenplay_project_id": fixture.projectID,
                    "screenplay_project_title": fixture.projectTitle,
                    "screenplay_target": "voice_pin",
                    "screenplay_prompt_source": "typed",
                    "screenplay_act": "Act II",
                    "screenplay_feature_sequence": fixture.baselineFeatureSequence,
                ],
            ]
        )
        try assertHTTP(rejectionCommit, context: "writer-block failed-rescue commit")

        revealStudioCreativeInstincts(in: app)
        let rejectedPreference = element(
            identifier: "studio.story-preference.\(fixture.rejectedPreferenceFamily)",
            in: app
        )
        let refreshRejectedPreference = element(
            identifier: "studio.story-preferences.refresh",
            in: app
        )
        makeHittable(refreshRejectedPreference, in: app)
        XCTAssertTrue(
            refreshRejectedPreference.waitForExistence(timeout: 5) && refreshRejectedPreference.isHittable,
            "Creative Instincts did not expose refresh after the rejected rescue."
        )
#if os(macOS)
        refreshRejectedPreference.click()
#else
        refreshRejectedPreference.tap()
#endif
        XCTAssertTrue(
            waitForAccessibilityText(
                in: rejectedPreference,
                containing: "did not unblock you",
                timeout: 20
            ),
            "Studio did not explain which delivered rescue failed."
        )
        XCTAssertTrue(
            waitForAccessibilityText(
                in: rejectedPreference,
                containing: "will not repeat this move",
                timeout: 5
            ),
            "Studio did not explain how the rejected rescue changes future guidance."
        )
        try recordStudioInstinctEvidence(
            stage: "02-rescue-rejected",
            expected: ["did not unblock you", "will not repeat this move"],
            in: app,
            fixture: fixture,
            preferenceFamily: fixture.rejectedPreferenceFamily
        )

        app.terminate()
        app = launchStudio()
        XCTAssertTrue(
            element(identifier: "studio.surface", in: app).waitForExistence(timeout: 12),
            "Studio did not reopen after the rejected rescue."
        )
        try submitStudioWriterBlockPrompt(fixture.prompt, in: app)
        let repairedMatched = waitForAccessibilityText(
            identifier: "studio.voice-pin.latest.output",
            containing: fixture.repairedStrongestMove,
            in: app,
            timeout: 35
        )
        let repairMemoryMatched = waitForAccessibilityText(
            identifier: "studio.voice-pin.latest.output",
            containing: fixture.repairMemoryLine,
            in: app,
            timeout: 5
        )
        try recordStudioInstinctEvidence(
            stage: "03-relaunch-adapted",
            expected: [fixture.repairedStrongestMove, fixture.repairMemoryLine],
            in: app,
            fixture: fixture,
            preferenceFamily: fixture.repairedPreferenceFamily
        )
        XCTAssertTrue(
            repairedMatched,
            "Clementine repeated the rejected rescue instead of adapting after relaunch."
        )
        XCTAssertTrue(
            repairMemoryMatched,
            "Clementine adapted after relaunch but did not acknowledge what she learned."
        )

        let rescueCommit = try await requestJSON(
            baseURL: fixture.baseURL,
            path: "/realtime/turn_commit",
            method: "POST",
            headers: fixture.authorizedHeaders,
            body: [
                "transcript": "That solved the block. Keep this page.",
                "reply": fixture.rescueAcceptedPage,
                "request_id": "ui-instinct-rescue-success-\(UUID().uuidString.lowercased())",
                "studio": [
                    "screenplay_project_id": fixture.projectID,
                    "screenplay_project_title": fixture.projectTitle,
                    "screenplay_target": "page",
                    "screenplay_prompt_source": "typed",
                    "screenplay_anchor_scene_label": "INT. FERRY WAITING ROOM - NIGHT",
                    "screenplay_inserted_text": fixture.rescueAcceptedPage,
                    "screenplay_act": "Act II",
                    "screenplay_scene_summary": "Mara finds the last ticket, but Eli lets it fall as the ferry leaves.",
                    "screenplay_current_beat": "The apparent way out closes and forces a costlier next tactic.",
                    "screenplay_character_focus": ["Mara", "Eli"],
                ],
            ]
        )
        try assertHTTP(rescueCommit, context: "writer-block successful-rescue commit")

        app.terminate()
        app = launchStudio()
        XCTAssertTrue(
            element(identifier: "studio.surface", in: app).waitForExistence(timeout: 12),
            "Studio did not reopen after the accepted rescue."
        )
        revealStudioCreativeInstincts(in: app)
        let repairedPreference = element(
            identifier: "studio.story-preference.\(fixture.repairedPreferenceFamily)",
            in: app
        )
        XCTAssertTrue(
            waitForAccessibilityText(
                in: repairedPreference,
                containing: "rescue that worked",
                timeout: 20
            ),
            "Studio did not explain that the adapted rescue got the writer moving."
        )
        try recordStudioInstinctEvidence(
            stage: "04-repaired-rescue-learned",
            expected: [fixture.repairedStrongestMove, "rescue that worked"],
            in: app,
            fixture: fixture,
            preferenceFamily: fixture.repairedPreferenceFamily
        )

        try await setStudioStoryPosition(
            act: "Act I",
            featureSequence: "Opening Sequence",
            currentBeat: "Mara first sees Eli holding a ferry ticket he should not have.",
            fixture: fixture
        )
        app.terminate()
        app = launchStudio()
        XCTAssertTrue(
            element(identifier: "studio.surface", in: app).waitForExistence(timeout: 12),
            "Studio did not reopen in the Act I isolation check."
        )
        try submitStudioWriterBlockPrompt(fixture.prompt, in: app)
        let otherActMatched = waitForAccessibilityText(
            identifier: "studio.voice-pin.latest.output",
            containing: fixture.otherActStrongestMove,
            in: app,
            timeout: 35
        )
        try recordStudioInstinctEvidence(
            stage: "05-other-act-unaffected",
            expected: [fixture.otherActStrongestMove],
            in: app,
            fixture: fixture,
            preferenceFamily: fixture.rejectedPreferenceFamily
        )
        XCTAssertTrue(
            otherActMatched,
            "The rejected Act II rescue incorrectly changed Clementine's Act I instincts."
        )

        try await setStudioStoryPosition(
            act: "Act II",
            featureSequence: "Bad Guys Close In",
            currentBeat: "Mara cannot decide whether to trust Eli.",
            fixture: fixture
        )
        app.terminate()
        app = launchStudio()
        XCTAssertTrue(
            element(identifier: "studio.surface", in: app).waitForExistence(timeout: 12),
            "Studio did not reopen after restoring the Act II story position."
        )
        revealStudioCreativeInstincts(in: app)
        let preference = element(
            identifier: "studio.story-preference.\(fixture.preferenceFamily)",
            in: app
        )
        XCTAssertTrue(
            preference.waitForExistence(timeout: 20),
            "The preference required by the writer-block smoke was missing."
        )
        let preferActionQuery = app.buttons.matching(
            identifier: "studio.story-preference.\(fixture.preferenceFamily).prefer"
        )
        let preferAction = waitForFirstVisibleElement(
            in: preferActionQuery,
            app: app,
            timeout: 8
        )
        XCTAssertNotNil(
            preferAction,
            "The Creative Instincts row did not expose a visible primary correction action."
        )
        guard let preferAction else { return }
        makeHittable(preferAction, in: app)
        XCTAssertTrue(
            preferAction.isHittable,
            "The Creative Instincts primary correction action was visible but not interactive."
        )
#if os(macOS)
        preferAction.click()
#else
        preferAction.tap()
#endif
        let correctionSurfaced = waitForAccessibilityText(
            in: preference,
            containing: "corrected",
            timeout: 15
        )
        XCTAssertTrue(correctionSurfaced, studioInstinctCorrectionFailure(in: app))

        try submitStudioWriterBlockPrompt(fixture.prompt, in: app)
        let correctedMatched = waitForAccessibilityText(
            identifier: "studio.voice-pin.latest.output",
            containing: fixture.correctedStrongestMove,
            in: app,
            timeout: 35
        )
        try recordStudioInstinctEvidence(
            stage: "06-explicit-correction",
            expected: [fixture.correctedStrongestMove],
            in: app,
            fixture: fixture
        )
        XCTAssertTrue(
            correctedMatched,
            "The corrected instinct did not change Clementine's strongest rescue move."
        )

        let canonCommit = try await requestJSON(
            baseURL: fixture.baseURL,
            path: "/realtime/turn_commit",
            method: "POST",
            headers: fixture.authorizedHeaders,
            body: [
                "transcript": "Keep this accepted page and its setup as canon.",
                "reply": fixture.acceptedPage,
                "request_id": "ui-instinct-canon-\(UUID().uuidString.lowercased())",
                "studio": [
                    "screenplay_project_id": fixture.projectID,
                    "screenplay_project_title": fixture.projectTitle,
                    "screenplay_target": "page",
                    "screenplay_prompt_source": "typed",
                    "screenplay_anchor_scene_label": "INT. CLOCK TOWER - NIGHT",
                    "screenplay_inserted_text": fixture.acceptedPage,
                    "screenplay_act": "Act II",
                    "screenplay_scene_summary": "Mara hides the red locket inside the courthouse clock.",
                    "screenplay_current_beat": "Mara leaves the clock tower without telling Eli where the locket is.",
                    "screenplay_character_focus": ["Mara", "Eli"],
                    "screenplay_unresolved_setups": [fixture.dueSetup],
                    "screenplay_act_three_payoff_path": [fixture.duePayoff],
                ],
            ]
        )
        try assertHTTP(canonCommit, context: "writer-block due-canon commit")

        try submitStudioWriterBlockPrompt(fixture.prompt, in: app)
        let canonMoveMatched = waitForAccessibilityText(
            identifier: "studio.voice-pin.latest.output",
            containing: fixture.canonStrongestMove,
            in: app,
            timeout: 35
        )
        let dueSetupMatched = waitForAccessibilityText(
            identifier: "studio.voice-pin.latest.output",
            containing: fixture.dueSetup,
            in: app,
            timeout: 5
        )
        try recordStudioInstinctEvidence(
            stage: "07-canon-protected",
            expected: [fixture.canonStrongestMove, fixture.dueSetup],
            in: app,
            fixture: fixture
        )
        XCTAssertTrue(
            canonMoveMatched,
            "Due canon did not outrank the corrected creative instinct."
        )
        XCTAssertTrue(
            dueSetupMatched,
            "The protected due setup was missing from Clementine's rescue."
        )
    }

    @MainActor
    private func assertBackendProjectRestoreLoads(_ fixture: RestoreContractFixture) async throws {
        let app = launchApp(
            openStudio: true,
            restoreProjectID: fixture.projectID,
            restoreVersionID: fixture.versionID,
            restoreLoadToken: fixture.loadToken,
            launchEnvironment: fixture.appLaunchEnvironment
        )
        defer { app.terminate() }

        XCTAssertTrue(app.otherElements["studio.surface"].waitForExistence(timeout: 12))
        XCTAssertTrue(waitForDraft(in: app, containing: "INT. ROOM - NIGHT", timeout: 45))
        XCTAssertTrue(waitForDraft(in: app, containing: "He waits, still.", timeout: 10))

        var finalSnapshot: [String: Any] = [:]
        var finalFailures: [String] = []
        let restored = waitForRestoreSnapshot(in: app, timeout: 60) { snapshot in
            finalSnapshot = snapshot
            finalFailures = restoreSnapshotFailures(snapshot, fixture: fixture)
            return finalFailures.isEmpty
        }
        XCTAssertTrue(
            restored,
            "Restore snapshot failed: \(finalFailures.joined(separator: ", ")). Snapshot: \(finalSnapshot)"
        )
    }

    private func restoreSnapshotFailures(
        _ snapshot: [String: Any],
        fixture: RestoreContractFixture
    ) -> [String] {
        let reopenedLineageKeys = arrayValue(snapshot["restored_reopened_lineage_keys"])
            .map { $0.lowercased() }
        let approvedEmails = arrayValue(snapshot["approved_emails"])
            .map { $0.lowercased() }
        let expectedDraft = fixture.expectedDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        var failures: [String] = []

        func require(_ condition: @autoclosure () -> Bool, _ label: String) {
            if !condition() { failures.append(label) }
        }

        require(stringValue(snapshot["selected_project_id"]).lowercased() == fixture.projectID.lowercased(), "selected_project_id")
        require(stringValue(snapshot["latest_version_id"]).lowercased() == fixture.versionID.lowercased(), "latest_version_id")
        require(boolValue(snapshot["selected_project_present"]), "selected_project_present")
        require(boolValue(snapshot["load_project_ready"]), "load_project_ready")
        require(stringValue(snapshot["load_project_stage"]).lowercased() == "editor_ready", "load_project_stage")
        require(intValue(snapshot["load_project_token"]) == fixture.loadToken, "load_project_token")
        require(stringValue(snapshot["load_project_error"]).isEmpty, "load_project_error")
        require(stringValue(snapshot["restored_focused_diff_key"]).lowercased() == fixture.expectedFocusedDiffKey.lowercased(), "restored_focused_diff_key")
        require(reopenedLineageKeys.contains(fixture.expectedReopenedLineageKey.lowercased()), "restored_reopened_lineage_keys")
        require(stringValue(snapshot["restored_latest_reopened_write_id"]).lowercased() == fixture.expectedReopenedWriteID.lowercased(), "restored_latest_reopened_write_id")
        require(intValue(snapshot["reopened_diff_count"]) > 0, "reopened_diff_count")
        require(intValue(snapshot["ask_note_history_count"]) >= 3, "ask_note_history_count")
        require(intValue(snapshot["backend_ask_note_history_count"]) >= 3, "backend_ask_note_history_count")
        require(
            normalizedScreenplayText(stringValue(snapshot["latest_ask_note_inserted_text"]))
                .contains(normalizedScreenplayText(fixture.expectedAskNoteText)),
            "latest_ask_note_inserted_text"
        )
        require(intValue(snapshot["draft_character_count"]) == expectedDraft.count, "draft_character_count")
        require(stringValue(snapshot["draft_fingerprint"]) == draftFingerprint(expectedDraft), "draft_fingerprint")
        require(intValue(snapshot["collaborator_count"]) >= 1, "collaborator_count")
        require(approvedEmails.contains(fixture.expectedCollaboratorEmail.lowercased()), "approved_emails")
        require(intValue(snapshot["comment_count"]) >= 1, "comment_count")
        require(normalizedScreenplayText(stringValue(snapshot["latest_comment_text"])) == normalizedScreenplayText(fixture.expectedCommentText), "latest_comment_text")
        require(stringValue(snapshot["latest_comment_author"]).lowercased() == fixture.expectedCollaboratorEmail.lowercased(), "latest_comment_author")
        require(boolValue(snapshot["latest_comment_resolved"]), "latest_comment_resolved")
        require(!boolValue(snapshot["latest_comment_deleted"]), "latest_comment_deleted")
        require(stringValue(snapshot["error_text"]).isEmpty, "error_text")
        return failures
    }

    @MainActor
    private func assertCanonCorrectionRestoresAcrossRelaunch(_ fixture: RestoreContractFixture) {
        for launchIndex in 1...2 {
            let app = launchApp(
                openMemories: true,
                launchEnvironment: fixture.appLaunchEnvironment
            )
            XCTAssertTrue(
                app.otherElements["memories.screen"].waitForExistence(timeout: 12),
                "Memories did not open on authenticated launch \(launchIndex)."
            )

            let correctionCard = app.buttons
                .matching(NSPredicate(
                    format: "label CONTAINS[c] %@",
                    fixture.expectedCanonCorrectionTitle
                ))
                .firstMatch
            XCTAssertTrue(
                correctionCard.waitForExistence(timeout: 30),
                "Canon correction was not restored on authenticated launch \(launchIndex)."
            )
            if !correctionCard.isHittable {
                app.swipeUp()
            }
            correctionCard.tap()

            XCTAssertTrue(
                staticText(containing: fixture.expectedCanonCorrectionText, in: app)
                    .waitForExistence(timeout: 10),
                "The authoritative replacement was missing on launch \(launchIndex)."
            )
            for retiredFact in fixture.expectedRetiredCanonFacts {
                XCTAssertTrue(
                    staticText(containing: retiredFact, in: app).waitForExistence(timeout: 5),
                    "Retired canon was missing from the correction receipt on launch \(launchIndex): \(retiredFact)"
                )
            }
            app.terminate()
        }
    }

    private func launchApp(
        skipOnboarding: Bool = true,
        openStudio: Bool = false,
        openMemories: Bool = false,
        openDataControls: Bool = false,
        openCommandBar: Bool = false,
        openExportTools: Bool = false,
        structuralSeed: Bool = false,
        realtimeStub: Bool = false,
        routePage: Bool = false,
        routeVoicePin: Bool = false,
        showCanonClarification: Bool = false,
        showDraftConflict: Bool = false,
        conflictSaveSuccess: Bool = false,
        liveMemory: Bool = false,
        showPendingScreenplayQuestion: Bool = false,
        showProvisionalScreenplayOptions: Bool = false,
        realtimeNetworkFaultStage: String? = nil,
        screenplaySaveNetworkFaultMarker: String? = nil,
        screenplaySaveExpireAuthOnce: Bool = false,
        autoSubmitPagePrompt: String? = nil,
        autoSubmitVoicePinPrompt: String? = nil,
        restoreProjectID: String? = nil,
        restoreVersionID: String? = nil,
        restoreLoadToken: Int? = nil,
        submitTransportMode: String = "stub",
        resetState: Bool = true,
        launchEnvironment: [String: String] = [:]
    ) -> XCUIApplication {
        let app = XCUIApplication()
        var arguments = [
            "--ui-testing",
            "-studio_debug_submit_transport_mode",
            submitTransportMode,
            "-studio_auto_insert",
            "1"
        ]
        if resetState {
            arguments.append("--ui-reset-state")
        } else {
            arguments.append("--ui-preserve-state")
        }
        if skipOnboarding {
            arguments.append("--ui-skip-onboarding")
        }
        if openStudio {
            arguments.append("--ui-open-studio")
        }
        if openMemories {
            arguments.append("--ui-open-memories")
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
        if showCanonClarification {
            arguments.append("--ui-show-canon-clarification")
        }
        if showDraftConflict {
            arguments.append("--ui-show-draft-conflict")
        }
        if conflictSaveSuccess {
            arguments.append("--ui-conflict-save-success")
        }
        if liveMemory {
            arguments.append("--ui-live-memory")
        }
        if showPendingScreenplayQuestion {
            arguments.append("--ui-show-pending-screenplay-question")
        }
        if showProvisionalScreenplayOptions {
            arguments.append("--ui-show-pending-screenplay-question")
            arguments.append("--ui-show-provisional-screenplay-options")
        }
        if let realtimeNetworkFaultStage {
            arguments.append(contentsOf: [
                "--ui-realtime-network-fault",
                realtimeNetworkFaultStage,
            ])
        }
        if let screenplaySaveNetworkFaultMarker {
            arguments.append(contentsOf: [
                "--ui-screenplay-save-network-fault",
                "--ui-screenplay-save-network-fault-marker",
                screenplaySaveNetworkFaultMarker,
                "--ui-screenplay-save-network-fault-url",
                "http://127.0.0.1:3999",
            ])
        }
        if screenplaySaveExpireAuthOnce {
            arguments.append("--ui-screenplay-save-expire-auth-once")
        }
        if let autoSubmitPagePrompt {
            arguments.append(contentsOf: ["--ui-auto-submit-page-prompt", autoSubmitPagePrompt])
        }
        if let autoSubmitVoicePinPrompt {
            arguments.append(contentsOf: ["--ui-auto-submit-voice-pin-prompt", autoSubmitVoicePinPrompt])
        }
        if let restoreProjectID {
            arguments.append(contentsOf: ["-studio_debug_load_project_id", restoreProjectID])
        }
        if let restoreVersionID {
            arguments.append(contentsOf: ["-studio_debug_load_project_version_id", restoreVersionID])
        }
        if let restoreLoadToken {
            arguments.append(contentsOf: [
                "-studio_debug_load_project_ack_token",
                "0",
                "-studio_debug_load_project_token",
                "\(restoreLoadToken)"
            ])
        }
        app.launchArguments = arguments
        if !launchEnvironment.isEmpty {
            app.launchEnvironment = launchEnvironment
        }
        app.launch()
#if os(macOS)
        app.activate()
        if !app.windows.firstMatch.waitForExistence(timeout: 2) {
            let fileMenu = app.menuBars.menuBarItems["File"]
            if fileMenu.exists {
                fileMenu.click()
                let newWindow = app.menuItems["New Window"]
                if newWindow.waitForExistence(timeout: 2) {
                    newWindow.click()
                }
            }
        }
        if openStudio,
           !element(identifier: "studio.surface", in: app).waitForExistence(timeout: 2) {
            let openStudioButton = app.buttons["home.open-studio"]
            if openStudioButton.waitForExistence(timeout: 5), openStudioButton.isHittable {
                openStudioButton.click()
            }
        }
#endif
        return app
    }

#if os(macOS)
    private func openHomeSurface(in app: XCUIApplication) {
        if element(identifier: "home.surface", in: app).exists {
            return
        }
        let workspaceMenu = app.menuBars.menuBarItems["Workspace"]
        XCTAssertTrue(workspaceMenu.waitForExistence(timeout: 3))
        workspaceMenu.click()
        let homeItem = app.menuItems["Home"]
        XCTAssertTrue(homeItem.waitForExistence(timeout: 3))
        homeItem.click()
    }
#endif

    private func revealStudioPendingQuestion(in app: XCUIApplication) {
        let card = element(identifier: "studio.pending-question", in: app)
        let deadline = Date().addingTimeInterval(8)
        let rightToggle = app.buttons["studio.sidebar.right.toggle"]
        while Date() < deadline, !card.exists {
            if rightToggle.waitForExistence(timeout: 0.5),
               rightToggle.isHittable,
               rightToggle.label.localizedCaseInsensitiveContains("Open") {
                rightToggle.tap()
            }
            let themTab = app.buttons["io.them"]
            if themTab.exists, themTab.isHittable, !themTab.isSelected {
                themTab.tap()
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
    }

    private func submitFocusedPrompt(in app: XCUIApplication, field: XCUIElement) {
#if os(iOS)
        let toolbarSend = app.buttons["studio.prompt.keyboard-send"]
        if toolbarSend.waitForExistence(timeout: 5), toolbarSend.isHittable {
            toolbarSend.tap()
            return
        }
        let sendKey = app.keyboards.buttons
            .matching(NSPredicate(format: "label ==[c] %@", "send"))
            .firstMatch
        XCTAssertTrue(
            sendKey.waitForExistence(timeout: 5),
            "The Studio prompt did not expose the keyboard Send action."
        )
        sendKey.tap()
#elseif os(macOS)
        field.typeKey(.return, modifierFlags: [.command])
#else
        field.typeText("\n")
#endif
    }

    private func assertRealtimeNetworkFault(
        stage: String,
        outcome: String,
        responseCount: Int,
        fallbackCount: Int,
        duplicateSuppressed: Int
    ) {
        let app = launchApp(realtimeNetworkFaultStage: stage)
        defer { app.terminate() }

        let result = element(identifier: "realtime.network-fault.result", in: app)
        XCTAssertTrue(
            result.waitForExistence(timeout: 8),
            "No network-fault receipt appeared for \(stage). Accessibility hierarchy:\n\(app.debugDescription)"
        )
        let deadline = Date().addingTimeInterval(8)
        var receipt = accessibilityText(of: result)
        while Date() < deadline, !receipt.contains("complete=true") {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            receipt = accessibilityText(of: result)
        }

        XCTAssertTrue(receipt.contains("stage=\(stage)"), "Wrong stage receipt: \(receipt)")
        XCTAssertTrue(receipt.contains("outcome=\(outcome)"), "Wrong recovery outcome: \(receipt)")
        XCTAssertTrue(
            receipt.contains("response_count=\(responseCount)"),
            "Unexpected repaired response count: \(receipt)"
        )
        XCTAssertTrue(
            receipt.contains("fallback_count=\(fallbackCount)"),
            "Unexpected standard fallback count: \(receipt)"
        )
        XCTAssertTrue(
            receipt.contains("duplicate_suppressed=\(duplicateSuppressed)"),
            "Duplicate callback handling was wrong: \(receipt)"
        )
        XCTAssertTrue(receipt.contains("complete=true"), "Network-fault smoke did not complete: \(receipt)")
    }

    private func accessibilityText(of element: XCUIElement) -> String {
        let label = element.label.trimmingCharacters(in: .whitespacesAndNewlines)
        if !label.isEmpty { return label }
        return (element.value as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
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
            if snapshot.exists {
                if snapshot.label.localizedCaseInsensitiveContains(text) {
                    return true
                }
                if let value = snapshot.value as? String,
                   value.localizedCaseInsensitiveContains(text) {
                    return true
                }
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

    private func waitForDraftOccurrences(
        in app: XCUIApplication,
        expected: [String: Int],
        timeout: TimeInterval
    ) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            let draft = accessibleDraftText(in: app)
            if expected.allSatisfy({ occurrenceCount(of: $0.key, in: draft) == $0.value }) {
                return true
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        return false
    }

    private func accessibleDraftText(in app: XCUIApplication) -> String {
        let snapshot = app.staticTexts["studio.draft.snapshot"]
        if snapshot.exists {
            if let value = snapshot.value as? String, !value.isEmpty {
                return value
            }
            if !snapshot.label.isEmpty {
                return snapshot.label
            }
        }
        let surface = app.otherElements["studio.draft.surface"]
        return surface.value as? String ?? ""
    }

    private func occurrenceCount(of needle: String, in haystack: String) -> Int {
        guard !needle.isEmpty else { return 0 }
        var count = 0
        var searchRange = haystack.startIndex..<haystack.endIndex
        while let range = haystack.range(of: needle, options: .caseInsensitive, range: searchRange) {
            count += 1
            searchRange = range.upperBound..<haystack.endIndex
        }
        return count
    }

    private func staticText(containing text: String, in app: XCUIApplication) -> XCUIElement {
        app.staticTexts
            .matching(NSPredicate(format: "label CONTAINS[c] %@", text))
            .firstMatch
    }

    private func element(identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(identifier: identifier)
            .firstMatch
    }

    private func waitForDisappearance(
        of element: XCUIElement,
        timeout: TimeInterval
    ) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if !element.exists {
                return true
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        return !element.exists
    }

    private func waitForHittability(
        of element: XCUIElement,
        timeout: TimeInterval
    ) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if element.exists, element.isHittable {
                return true
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        return element.exists && element.isHittable
    }

    private func waitForFirstVisibleElement(
        in query: XCUIElementQuery,
        app: XCUIApplication,
        timeout: TimeInterval
    ) -> XCUIElement? {
        let drawer = element(identifier: "studio.sidebar.right.drawer", in: app)
        let interactionSurface = drawer.exists ? drawer : app
        let deadline = Date().addingTimeInterval(timeout)
        var swipes = 0
        while Date() < deadline {
            if let match = query.allElementsBoundByIndex.first(where: { $0.exists && $0.isHittable }) {
                return match
            }
            if swipes < 4 {
                interactionSurface.swipeDown()
            } else if swipes < 12 {
                interactionSurface.swipeUp()
            }
            swipes += 1
            RunLoop.current.run(until: Date().addingTimeInterval(0.15))
        }
        return query.allElementsBoundByIndex.first(where: { $0.exists && $0.isHittable })
    }

    private func revealStudioCreativeInstincts(in app: XCUIApplication) {
        let commandBarToggle = app.buttons["studio.commandbar.toggle"]
        if commandBarToggle.waitForExistence(timeout: 2),
           commandBarToggle.isHittable,
           accessibilityText(of: commandBarToggle).localizedCaseInsensitiveContains("hide") {
#if os(macOS)
            commandBarToggle.click()
#else
            commandBarToggle.tap()
#endif
        }
        let section = element(identifier: "studio.story-preferences", in: app)
        let rightDrawer = element(identifier: "studio.sidebar.right.drawer", in: app)
        let rightToggle = app.buttons["studio.sidebar.right.toggle"]
        if !rightDrawer.exists,
           rightToggle.waitForExistence(timeout: 5),
           rightToggle.isHittable {
            rightToggle.tap()
        }
        let deadline = Date().addingTimeInterval(12)
        while Date() < deadline, (!section.exists || !section.isHittable) {
            let interactionSurface = rightDrawer.exists ? rightDrawer : app
            interactionSurface.swipeUp()
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        XCTAssertTrue(section.exists && section.isHittable, "Studio did not reveal Creative Instincts.")
    }

    private func makeHittable(_ element: XCUIElement, in app: XCUIApplication) {
        guard element.exists, !element.isHittable else { return }
#if os(macOS)
        app.activate()
        let interactionSurface = app.windows.firstMatch
        guard interactionSurface.waitForExistence(timeout: 3) else { return }
        for _ in 0..<4 where !element.isHittable {
            interactionSurface.swipeDown()
        }
        for _ in 0..<8 where !element.isHittable {
            interactionSurface.swipeUp()
        }
#else
        let drawer = self.element(identifier: "studio.sidebar.right.drawer", in: app)
        let interactionSurface = drawer.exists ? drawer : app
        for _ in 0..<4 where !element.isHittable {
            interactionSurface.swipeDown()
        }
        for _ in 0..<8 where !element.isHittable {
            interactionSurface.swipeUp()
        }
#endif
    }

    private func submitStudioWriterBlockPrompt(
        _ prompt: String,
        in app: XCUIApplication
    ) throws {
#if os(macOS)
        app.activate()
        _ = app.windows.firstMatch.waitForExistence(timeout: 3)
#endif
        let home = element(identifier: "home.surface", in: app)
        if home.exists {
            let continueWriting = app.buttons["home.session-continuity.open-studio"]
            let openStudio = app.buttons["home.open-studio"]
            if continueWriting.waitForExistence(timeout: 3), continueWriting.isHittable {
#if os(macOS)
                continueWriting.click()
#else
                continueWriting.tap()
#endif
            } else {
                makeHittable(openStudio, in: app)
                if openStudio.exists, openStudio.isHittable {
#if os(macOS)
                    openStudio.click()
#else
                    openStudio.tap()
#endif
                }
            }
            XCTAssertTrue(
                waitForDisappearance(of: home, timeout: 8),
                "Home did not hand the restored project back to Studio."
            )
        }
        let field = element(identifier: "studio.prompt.field", in: app)
        if !field.exists {
            let commandBarToggle = app.buttons["studio.commandbar.toggle"]
            let rightDrawer = element(identifier: "studio.sidebar.right.drawer", in: app)
            let interactionSurface = rightDrawer.exists ? rightDrawer : app
            for _ in 0..<12 where !commandBarToggle.isHittable {
                interactionSurface.swipeDown()
            }
            if commandBarToggle.waitForExistence(timeout: 3), commandBarToggle.isHittable {
#if os(macOS)
                commandBarToggle.click()
#else
                commandBarToggle.tap()
#endif
            }
        }
        if !field.isHittable {
            let rightToggle = app.buttons["studio.sidebar.right.toggle"]
            if rightToggle.waitForExistence(timeout: 3),
               rightToggle.isHittable,
               rightToggle.label.localizedCaseInsensitiveContains("Open") {
                rightToggle.tap()
            }
            makeHittable(field, in: app)
        }
        XCTAssertTrue(
            field.waitForExistence(timeout: 8),
            "Studio prompt field was missing."
        )
#if os(macOS)
        let window = app.windows.firstMatch
        let fieldIsVisible = field.frame.width > 1 &&
            field.frame.height > 1 &&
            window.frame.intersects(field.frame)
        XCTAssertTrue(
            field.isHittable || fieldIsVisible,
            "Studio prompt field was outside the active desktop window."
        )
        if field.isHittable {
            field.click()
        } else {
            field.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).click()
        }
#else
        XCTAssertTrue(field.isHittable, "Studio prompt field was not tappable.")
        field.tap()
#endif
#if os(iOS)
        field.tap(withNumberOfTaps: 3, numberOfTouches: 1)
        field.typeText(XCUIKeyboardKey.delete.rawValue)
#elseif os(macOS)
        field.typeKey("a", modifierFlags: [.command])
        field.typeKey(.delete, modifierFlags: [])
#endif
        field.typeText(prompt)
        submitFocusedPrompt(in: app, field: field)
    }

    private func setStudioStoryPosition(
        act: String,
        featureSequence: String,
        currentBeat: String,
        fixture: StudioInstinctFixture
    ) async throws {
        let projectUpdate = try await requestJSON(
            baseURL: fixture.baseURL,
            path: "/screenplay/projects",
            method: "POST",
            headers: fixture.authorizedHeaders,
            body: [
                "project_id": fixture.projectID,
                "title": fixture.projectTitle,
                "phase": "scene_draft",
                "act_position": act,
                "protagonist_want": "get Eli onto the last ferry",
                "protagonist_need": "stop using control as a substitute for trust",
                "activate": true,
            ]
        )
        try assertHTTP(projectUpdate, context: "writer-block story-position project update")

        let continuityUpdate = try await requestJSON(
            baseURL: fixture.baseURL,
            path: "/realtime/turn_commit",
            method: "POST",
            headers: fixture.authorizedHeaders,
            body: [
                "transcript": "Track the screenplay at \(act) for this continuity check.",
                "reply": "I am tracking the current act and sequence.",
                "request_id": "ui-instinct-position-\(UUID().uuidString.lowercased())",
                "studio": [
                    "screenplay_project_id": fixture.projectID,
                    "screenplay_project_title": fixture.projectTitle,
                    "screenplay_target": "voice_pin",
                    "screenplay_prompt_source": "typed",
                    "screenplay_act": act,
                    "screenplay_feature_sequence": featureSequence,
                    "screenplay_current_beat": currentBeat,
                    "screenplay_character_focus": ["Mara", "Eli"],
                ],
            ]
        )
        try assertHTTP(continuityUpdate, context: "writer-block story-position continuity update")
    }

    private func waitForAccessibilityText(
        identifier: String,
        containing expected: String,
        in app: XCUIApplication,
        timeout: TimeInterval
    ) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if accessibilityTexts(identifier: identifier, in: app).contains(where: {
                $0.localizedCaseInsensitiveContains(expected)
            }) {
                return true
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.15))
        }
        return accessibilityTexts(identifier: identifier, in: app).contains(where: {
            $0.localizedCaseInsensitiveContains(expected)
        })
    }

    private func accessibilityTexts(
        identifier: String,
        in app: XCUIApplication
    ) -> [String] {
        app.staticTexts
            .matching(identifier: identifier)
            .allElementsBoundByIndex
            .map { accessibilityText(of: $0) }
            .filter { !$0.isEmpty }
    }

    private func waitForAccessibilityText(
        in target: XCUIElement,
        containing expected: String,
        timeout: TimeInterval
    ) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if target.exists,
               accessibilityText(of: target)
                .localizedCaseInsensitiveContains(expected) {
                return true
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.15))
        }
        return target.exists &&
            accessibilityText(of: target)
                .localizedCaseInsensitiveContains(expected)
    }

    private func recordStudioInstinctEvidence(
        stage: String,
        expected: [String],
        in app: XCUIApplication,
        fixture: StudioInstinctFixture,
        preferenceFamily: String? = nil
    ) throws {
        let observed = accessibilityTexts(
            identifier: "studio.voice-pin.latest.output",
            in: app
        )
        .reduce(into: [String]()) { values, value in
            guard !values.contains(value) else { return }
            values.append(value)
        }
        .joined(separator: "\n")
        let preference = element(
            identifier: "studio.story-preference.\(preferenceFamily ?? fixture.preferenceFamily)",
            in: app
        )
        let preferenceState = preference.exists ? accessibilityText(of: preference) : ""
        let preferenceError = element(
            identifier: "studio.story-preferences.error",
            in: app
        )
        let preferenceErrorText = preferenceError.exists
            ? accessibilityText(of: preferenceError)
            : ""
        let matched = expected.allSatisfy {
            observed.localizedCaseInsensitiveContains($0) ||
                preferenceState.localizedCaseInsensitiveContains($0)
        }
        let screenshot: XCUIScreenshot
#if os(macOS)
        let appWindow = app.windows.firstMatch
        screenshot = appWindow.exists ? appWindow.screenshot() : app.screenshot()
#else
        screenshot = app.screenshot()
#endif
        let attachment = XCTAttachment(screenshot: screenshot)
        let stem = "\(fixture.evidencePlatform)-\(stage)"
        attachment.name = "studio-instinct-\(stem).png"
        attachment.lifetime = .keepAlways
        add(attachment)
        let payload: [String: Any] = [
            "schema_version": 1,
            "platform": fixture.evidencePlatform,
            "stage": stage,
            "expected": expected,
            "observed": observed,
            "matched": matched,
            "preference_state": preferenceState,
            "preference_error": preferenceErrorText,
        ]
        let data = try JSONSerialization.data(
            withJSONObject: payload,
            options: [.prettyPrinted, .sortedKeys]
        )
        let observation = XCTAttachment(
            data: data,
            uniformTypeIdentifier: "public.json"
        )
        observation.name = "studio-instinct-\(stem).json"
        observation.lifetime = .keepAlways
        add(observation)
    }

    private func studioInstinctCorrectionFailure(in app: XCUIApplication) -> String {
        let preferenceError = element(
            identifier: "studio.story-preferences.error",
            in: app
        )
        let errorText = preferenceError.exists
            ? accessibilityText(of: preferenceError)
            : "none"
        return "Studio did not surface the explicit preference correction. Preference error: \(errorText)."
    }

    private struct StudioInstinctFixture {
        let baseURL: URL
        let appToken: String
        let clientToken: String
        let accessToken: String
        let projectID: String
        let projectTitle: String
        let baselineFeatureSequence: String
        let preferenceFamily: String
        let rejectedPreferenceFamily: String
        let repairedPreferenceFamily: String
        let prompt: String
        let baselineStrongestMove: String
        let repairedStrongestMove: String
        let repairMemoryLine: String
        let otherActStrongestMove: String
        let correctedStrongestMove: String
        let canonStrongestMove: String
        let acceptedPage: String
        let rescueAcceptedPage: String
        let dueSetup: String
        let duePayoff: String
        let evidencePlatform: String
        let appLaunchEnvironment: [String: String]

        var authorizedHeaders: [String: String] {
            [
                "X-APP-TOKEN": appToken,
                "X-Client-Token": clientToken,
                "Authorization": "Bearer \(accessToken)",
            ]
        }
    }

    private func studioInstinctFixtureFromEnvironment(
        _ environment: [String: String] = ProcessInfo.processInfo.environment
    ) throws -> StudioInstinctFixture? {
        let encoded = (environment["THEM_UITEST_STUDIO_INSTINCT_FIXTURE_BASE64URL"] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !encoded.isEmpty else { return nil }
        var base64 = encoded
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        base64 += String(repeating: "=", count: (4 - (base64.count % 4)) % 4)
        guard let data = Data(base64Encoded: base64),
              let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw NSError(
                domain: "themUITests.studioInstinct",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Could not decode Studio instinct fixture JSON."]
            )
        }

        let baseURLString = try firstNonEmptyString(
            payload["baseURL"],
            payload["base_url"],
            message: "Studio instinct fixture missing baseURL."
        )
        guard let baseURL = URL(string: baseURLString) else {
            throw NSError(
                domain: "themUITests.studioInstinct",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "Studio instinct fixture has an invalid baseURL."]
            )
        }
        let appToken = try firstNonEmptyString(
            payload["appToken"],
            payload["app_token"],
            message: "Studio instinct fixture missing appToken."
        )
        let userID = try firstNonEmptyString(
            payload["userID"],
            payload["user_id"],
            message: "Studio instinct fixture missing userID."
        )
        let clientToken = try firstNonEmptyString(
            payload["clientToken"],
            payload["client_token"],
            message: "Studio instinct fixture missing clientToken."
        )
        let accessToken = try firstNonEmptyString(
            payload["accessToken"],
            payload["access_token"],
            message: "Studio instinct fixture missing accessToken."
        )
        let clientTokenExpiry = try firstNonEmptyString(
            payload["clientTokenExpiry"],
            payload["client_token_expiry"],
            message: "Studio instinct fixture missing clientTokenExpiry."
        )
        let clientTokenCachedAt = max(1, intValue(payload["clientTokenCachedAt"]))
        return StudioInstinctFixture(
            baseURL: baseURL,
            appToken: appToken,
            clientToken: clientToken,
            accessToken: accessToken,
            projectID: try firstNonEmptyString(
                payload["projectID"],
                payload["project_id"],
                message: "Studio instinct fixture missing projectID."
            ),
            projectTitle: try firstNonEmptyString(
                payload["projectTitle"],
                payload["project_title"],
                message: "Studio instinct fixture missing projectTitle."
            ),
            baselineFeatureSequence: try firstNonEmptyString(
                payload["baselineFeatureSequence"],
                payload["baseline_feature_sequence"],
                message: "Studio instinct fixture missing baselineFeatureSequence."
            ),
            preferenceFamily: try firstNonEmptyString(
                payload["preferenceFamily"],
                payload["preference_family"],
                message: "Studio instinct fixture missing preferenceFamily."
            ),
            rejectedPreferenceFamily: try firstNonEmptyString(
                payload["rejectedPreferenceFamily"],
                payload["rejected_preference_family"],
                message: "Studio instinct fixture missing rejectedPreferenceFamily."
            ),
            repairedPreferenceFamily: try firstNonEmptyString(
                payload["repairedPreferenceFamily"],
                payload["repaired_preference_family"],
                message: "Studio instinct fixture missing repairedPreferenceFamily."
            ),
            prompt: try firstNonEmptyString(
                payload["prompt"],
                message: "Studio instinct fixture missing prompt."
            ),
            baselineStrongestMove: try firstNonEmptyString(
                payload["baselineStrongestMove"],
                message: "Studio instinct fixture missing baselineStrongestMove."
            ),
            repairedStrongestMove: try firstNonEmptyString(
                payload["repairedStrongestMove"],
                message: "Studio instinct fixture missing repairedStrongestMove."
            ),
            repairMemoryLine: try firstNonEmptyString(
                payload["repairMemoryLine"],
                message: "Studio instinct fixture missing repairMemoryLine."
            ),
            otherActStrongestMove: try firstNonEmptyString(
                payload["otherActStrongestMove"],
                message: "Studio instinct fixture missing otherActStrongestMove."
            ),
            correctedStrongestMove: try firstNonEmptyString(
                payload["correctedStrongestMove"],
                message: "Studio instinct fixture missing correctedStrongestMove."
            ),
            canonStrongestMove: try firstNonEmptyString(
                payload["canonStrongestMove"],
                message: "Studio instinct fixture missing canonStrongestMove."
            ),
            acceptedPage: try firstNonEmptyString(
                payload["acceptedPage"],
                message: "Studio instinct fixture missing acceptedPage."
            ),
            rescueAcceptedPage: try firstNonEmptyString(
                payload["rescueAcceptedPage"],
                message: "Studio instinct fixture missing rescueAcceptedPage."
            ),
            dueSetup: try firstNonEmptyString(
                payload["dueSetup"],
                message: "Studio instinct fixture missing dueSetup."
            ),
            duePayoff: try firstNonEmptyString(
                payload["duePayoff"],
                message: "Studio instinct fixture missing duePayoff."
            ),
            evidencePlatform: try firstNonEmptyString(
                payload["evidencePlatform"],
                message: "Studio instinct fixture missing evidencePlatform."
            ),
            appLaunchEnvironment: [
                "THEM_UITEST_BACKEND_BASE_URL": baseURLString,
                "THEM_UITEST_APP_TOKEN": appToken,
                "THEM_UITEST_USER_ID": userID,
                "THEM_UITEST_CLIENT_TOKEN": clientToken,
                "THEM_UITEST_CLIENT_TOKEN_CACHED_AT": "\(clientTokenCachedAt)",
                "THEM_UITEST_CLIENT_TOKEN_BASE_URL": baseURLString,
                "THEM_UITEST_CLIENT_TOKEN_EXPIRY": clientTokenExpiry,
                "THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN": accessToken,
                "THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN_ENABLED": "1",
                "THEM_UITEST_AUTH_SIGNED_IN": "1",
            ]
        )
    }

    private struct LearnedMemoryFixture {
        let baseURL: URL
        let appToken: String
        let clientToken: String
        let accessToken: String
        let character: String
        let field: String
        let value: String
        let status: String
        let source: String
        let preferenceFamily: String
        let preferenceLabel: String
        let preferenceStance: String
        let projectID: String
        let projectTitle: String
        let handoffStage: String
        let featureSequence: String
        let writerBlockPrompt: String
        let baselineStrongestMove: String
        let repairedStrongestMove: String
        let repairMemoryLine: String
        let correctedStrongestMove: String
        let canonStrongestMove: String
        let acceptedCanonPage: String
        let dueSetup: String
        let duePayoff: String
        let appLaunchEnvironment: [String: String]

        var characterKey: String { Self.accessibilityKey(character) }
        var fieldKey: String { Self.accessibilityKey(field) }
        var authorizedHeaders: [String: String] {
            [
                "X-APP-TOKEN": appToken,
                "X-Client-Token": clientToken,
                "Authorization": "Bearer \(accessToken)",
            ]
        }

        private static func accessibilityKey(_ value: String) -> String {
            let characters = value
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
                .map { $0.isLetter || $0.isNumber ? $0 : "-" }
            return String(characters).trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        }
    }

    private func assertLearnedMemoryFields(
        _ fixture: LearnedMemoryFixture,
        prefix: String,
        in app: XCUIApplication
    ) {
        let fieldPrefix = "\(prefix).\(fixture.fieldKey)"
        let value = element(identifier: "\(fieldPrefix).value", in: app)
        XCTAssertTrue(
            value.waitForExistence(timeout: 12),
            "Learned value was missing at \(fieldPrefix). Accessibility hierarchy:\n\(app.debugDescription)"
        )
        XCTAssertTrue(
            accessibilityText(of: value).localizedCaseInsensitiveContains(fixture.value),
            "Expected learned value '\(fixture.value)', got '\(accessibilityText(of: value))'."
        )

        let status = element(identifier: "\(fieldPrefix).status", in: app)
        XCTAssertTrue(status.waitForExistence(timeout: 5))
        XCTAssertTrue(
            accessibilityText(of: status).localizedCaseInsensitiveContains(fixture.status),
            "Expected status '\(fixture.status)', got '\(accessibilityText(of: status))'."
        )

        let source = element(identifier: "\(fieldPrefix).source", in: app)
        XCTAssertTrue(source.waitForExistence(timeout: 5))
        XCTAssertTrue(
            accessibilityText(of: source).localizedCaseInsensitiveContains(fixture.source),
            "Expected source '\(fixture.source)', got '\(accessibilityText(of: source))'."
        )
    }

    private func learnedMemorySurface(in app: XCUIApplication) -> XCUIElement {
#if os(macOS)
        return app.sheets.firstMatch
#else
        return app.otherElements["memories.screen"]
#endif
    }

    private func learnedMemoryCard(character: String, in surface: XCUIElement) -> XCUIElement {
        surface.descendants(matching: .any)
            .matching(NSPredicate(
                format: "label CONTAINS[c] %@",
                "\(character) Character Memory"
            ))
            .firstMatch
    }

    private func openLearnedMemoryCard(
        _ card: XCUIElement,
        in surface: XCUIElement
    ) {
        if card.isHittable {
            card.tap()
            return
        }

#if os(macOS)
        card.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
#else
        surface.swipeUp()
        XCTAssertTrue(
            waitForHittability(of: card, timeout: 5),
            "The learned-memory card never became tappable."
        )
        card.tap()
#endif
    }

    private func closeLearnedMemorySurfaceIfNeeded(
        _ surface: XCUIElement,
        in app: XCUIApplication
    ) {
#if os(macOS)
        let returnButton = surface.buttons
            .matching(NSPredicate(format: "label BEGINSWITH[c] %@", "Return"))
            .firstMatch
        XCTAssertTrue(
            returnButton.waitForExistence(timeout: 5),
            "Memories did not expose its Return control."
        )
        if returnButton.isHittable {
            returnButton.tap()
        } else {
            returnButton.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(
            waitForDisappearance(of: surface, timeout: 8),
            "Memories remained open after Return."
        )
#else
        _ = app
#endif
    }

    private func learnedMemoryFixtureFromEnvironment(
        _ environment: [String: String] = ProcessInfo.processInfo.environment
    ) throws -> LearnedMemoryFixture? {
        let encoded = (environment["THEM_UITEST_LEARNED_MEMORY_FIXTURE_BASE64URL"] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !encoded.isEmpty else { return nil }
        var base64 = encoded
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        base64 += String(repeating: "=", count: (4 - (base64.count % 4)) % 4)
        guard let data = Data(base64Encoded: base64),
              let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw NSError(
                domain: "themUITests.learnedMemory",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Could not decode learned-memory fixture JSON."]
            )
        }

        let baseURL = try firstNonEmptyString(
            payload["baseURL"],
            payload["base_url"],
            message: "Learned-memory fixture missing baseURL."
        )
        guard let resolvedBaseURL = URL(string: baseURL) else {
            throw NSError(
                domain: "themUITests.learnedMemory",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "Learned-memory fixture has an invalid baseURL."]
            )
        }
        let appToken = stringValue(payload["appToken"]).isEmpty
            ? "them-dev"
            : stringValue(payload["appToken"])
        let userID = try firstNonEmptyString(
            payload["userID"],
            payload["user_id"],
            message: "Learned-memory fixture missing userID."
        )
        let clientToken = try firstNonEmptyString(
            payload["clientToken"],
            payload["client_token"],
            message: "Learned-memory fixture missing clientToken."
        )
        let accessToken = try firstNonEmptyString(
            payload["accessToken"],
            payload["access_token"],
            message: "Learned-memory fixture missing accessToken."
        )
        let cachedAt = max(1, intValue(payload["clientTokenCachedAt"]))
        let expiry = try firstNonEmptyString(
            payload["clientTokenExpiry"],
            payload["client_token_expiry"],
            message: "Learned-memory fixture missing clientTokenExpiry."
        )
        return LearnedMemoryFixture(
            baseURL: resolvedBaseURL,
            appToken: appToken,
            clientToken: clientToken,
            accessToken: accessToken,
            character: try firstNonEmptyString(
                payload["character"],
                message: "Learned-memory fixture missing character."
            ),
            field: try firstNonEmptyString(
                payload["field"],
                message: "Learned-memory fixture missing field."
            ),
            value: try firstNonEmptyString(
                payload["value"],
                message: "Learned-memory fixture missing value."
            ),
            status: try firstNonEmptyString(
                payload["status"],
                message: "Learned-memory fixture missing status."
            ),
            source: try firstNonEmptyString(
                payload["source"],
                message: "Learned-memory fixture missing source."
            ),
            preferenceFamily: try firstNonEmptyString(
                payload["preferenceFamily"],
                payload["preference_family"],
                message: "Learned-memory fixture missing preference family."
            ),
            preferenceLabel: try firstNonEmptyString(
                payload["preferenceLabel"],
                payload["preference_label"],
                message: "Learned-memory fixture missing preference label."
            ),
            preferenceStance: try firstNonEmptyString(
                payload["preferenceStance"],
                payload["preference_stance"],
                message: "Learned-memory fixture missing preference stance."
            ),
            projectID: try firstNonEmptyString(
                payload["projectID"],
                payload["project_id"],
                message: "Learned-memory fixture missing project ID."
            ),
            projectTitle: try firstNonEmptyString(
                payload["projectTitle"],
                payload["project_title"],
                message: "Learned-memory fixture missing project title."
            ),
            handoffStage: try firstNonEmptyString(
                payload["handoffStage"],
                payload["handoff_stage"],
                message: "Learned-memory fixture missing handoff stage."
            ),
            featureSequence: try firstNonEmptyString(
                payload["featureSequence"],
                payload["feature_sequence"],
                message: "Learned-memory fixture missing feature sequence."
            ),
            writerBlockPrompt: try firstNonEmptyString(
                payload["writerBlockPrompt"],
                payload["writer_block_prompt"],
                message: "Learned-memory fixture missing writer-block prompt."
            ),
            baselineStrongestMove: try firstNonEmptyString(
                payload["baselineStrongestMove"],
                message: "Learned-memory fixture missing baseline rescue."
            ),
            repairedStrongestMove: try firstNonEmptyString(
                payload["repairedStrongestMove"],
                message: "Learned-memory fixture missing repaired rescue."
            ),
            repairMemoryLine: try firstNonEmptyString(
                payload["repairMemoryLine"],
                message: "Learned-memory fixture missing repair acknowledgment."
            ),
            correctedStrongestMove: try firstNonEmptyString(
                payload["correctedStrongestMove"],
                message: "Learned-memory fixture missing corrected rescue."
            ),
            canonStrongestMove: try firstNonEmptyString(
                payload["canonStrongestMove"],
                message: "Learned-memory fixture missing canon rescue."
            ),
            acceptedCanonPage: try firstNonEmptyString(
                payload["acceptedCanonPage"],
                message: "Learned-memory fixture missing accepted canon page."
            ),
            dueSetup: try firstNonEmptyString(
                payload["dueSetup"],
                message: "Learned-memory fixture missing due setup."
            ),
            duePayoff: try firstNonEmptyString(
                payload["duePayoff"],
                message: "Learned-memory fixture missing due payoff."
            ),
            appLaunchEnvironment: [
                "THEM_UITEST_BACKEND_BASE_URL": baseURL,
                "THEM_UITEST_APP_TOKEN": appToken,
                "THEM_UITEST_USER_ID": userID,
                "THEM_UITEST_CLIENT_TOKEN": clientToken,
                "THEM_UITEST_CLIENT_TOKEN_CACHED_AT": "\(cachedAt)",
                "THEM_UITEST_CLIENT_TOKEN_BASE_URL": baseURL,
                "THEM_UITEST_CLIENT_TOKEN_EXPIRY": expiry,
                "THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN": accessToken,
                "THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN_ENABLED": "1",
                "THEM_UITEST_AUTH_SIGNED_IN": "1",
            ]
        )
    }

    private struct RestoreContractFixture {
        let projectID: String
        let versionID: String
        let loadToken: Int
        let expectedDraft: String
        let expectedAskNoteText: String
        let expectedFocusedDiffKey: String
        let expectedReopenedWriteID: String
        let expectedReopenedLineageKey: String
        let expectedCollaboratorEmail: String
        let expectedCommentText: String
        let expectedCanonCorrectionTitle: String
        let expectedCanonCorrectionText: String
        let expectedRetiredCanonFacts: [String]
        let appLaunchEnvironment: [String: String]
    }

    private func restoreContractFixtureFromEnvironment(
        _ environment: [String: String] = ProcessInfo.processInfo.environment
    ) throws -> RestoreContractFixture? {
        let directEnvironmentRaw = (environment["THEM_UITEST_RESTORE_FIXTURE_JSON"] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let encodedEnvironmentRaw = (environment["THEM_UITEST_RESTORE_FIXTURE_BASE64URL"] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        var normalizedBase64 = encodedEnvironmentRaw
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let paddingCount = (4 - (normalizedBase64.count % 4)) % 4
        normalizedBase64 += String(repeating: "=", count: paddingCount)
        let decodedEnvironmentRaw = Data(base64Encoded: normalizedBase64)
            .flatMap { String(data: $0, encoding: .utf8) }?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let environmentRaw = directEnvironmentRaw.isEmpty
            ? decodedEnvironmentRaw
            : directEnvironmentRaw
        let fixturePath = (environment["THEM_UITEST_RESTORE_FIXTURE_PATH"] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let fileRaw = fixturePath.isEmpty
            ? ""
            : ((try? String(contentsOfFile: fixturePath, encoding: .utf8)) ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
        let raw = environmentRaw.isEmpty ? fileRaw : environmentRaw
        guard !raw.isEmpty else { return nil }
        guard let data = raw.data(using: .utf8),
              let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw NSError(
                domain: "themUITests.restore",
                code: 3,
                userInfo: [NSLocalizedDescriptionKey: "Could not decode cross-platform restore fixture JSON."]
            )
        }
        let baseURL = try firstNonEmptyString(payload["baseURL"], payload["base_url"], message: "Restore fixture missing baseURL.")
        let appToken = stringValue(payload["appToken"]).isEmpty ? "them-dev" : stringValue(payload["appToken"])
        let userID = try firstNonEmptyString(payload["userID"], payload["user_id"], message: "Restore fixture missing userID.")
        let clientToken = try firstNonEmptyString(payload["clientToken"], payload["client_token"], message: "Restore fixture missing clientToken.")
        let clientTokenCachedAt = intValue(payload["clientTokenCachedAt"]) > 0
            ? intValue(payload["clientTokenCachedAt"])
            : Int(Date().timeIntervalSince1970)
        let clientTokenExpiry = try firstNonEmptyString(payload["clientTokenExpiry"], payload["client_token_expiry"], message: "Restore fixture missing clientTokenExpiry.")
        let accessToken = try firstNonEmptyString(payload["accessToken"], payload["access_token"], message: "Restore fixture missing accessToken.")
        let fullThreadStateJSON = try firstNonEmptyString(payload["fullThreadStateJSON"], payload["full_thread_state_json"], message: "Restore fixture missing fullThreadStateJSON.")
        let askHistoryJSON = try firstNonEmptyString(payload["askHistoryJSON"], payload["ask_history_json"], message: "Restore fixture missing askHistoryJSON.")
        let acknowledgedJSON = try firstNonEmptyString(payload["acknowledgedJSON"], payload["acknowledged_json"], message: "Restore fixture missing acknowledgedJSON.")
        let acknowledgedWriteIDsJSON = try firstNonEmptyString(payload["acknowledgedWriteIDsJSON"], payload["acknowledged_write_ids_json"], message: "Restore fixture missing acknowledgedWriteIDsJSON.")

        let expectedDraft = try firstNonEmptyString(
            payload["expectedDraft"],
            payload["expected_draft"],
            message: "Restore fixture missing expectedDraft."
        )
        let expectedAskNoteText = stringValue(
            payload["expectedAskNoteText"] ?? payload["expected_ask_note_text"]
        )
        return RestoreContractFixture(
            projectID: try firstNonEmptyString(payload["projectID"], payload["project_id"], message: "Restore fixture missing projectID."),
            versionID: try firstNonEmptyString(payload["versionID"], payload["version_id"], message: "Restore fixture missing versionID."),
            loadToken: max(1, intValue(payload["loadToken"] ?? payload["load_token"])),
            expectedDraft: expectedDraft,
            expectedAskNoteText: expectedAskNoteText.isEmpty ? expectedDraft : expectedAskNoteText,
            expectedFocusedDiffKey: try firstNonEmptyString(payload["expectedFocusedDiffKey"], payload["expected_focused_diff_key"], message: "Restore fixture missing expectedFocusedDiffKey."),
            expectedReopenedWriteID: try firstNonEmptyString(payload["expectedReopenedWriteID"], payload["expected_reopened_write_id"], message: "Restore fixture missing expectedReopenedWriteID."),
            expectedReopenedLineageKey: try firstNonEmptyString(payload["expectedReopenedLineageKey"], payload["expected_reopened_lineage_key"], message: "Restore fixture missing expectedReopenedLineageKey."),
            expectedCollaboratorEmail: try firstNonEmptyString(payload["expectedCollaboratorEmail"], payload["expected_collaborator_email"], message: "Restore fixture missing expectedCollaboratorEmail."),
            expectedCommentText: try firstNonEmptyString(payload["expectedCommentText"], payload["expected_comment_text"], message: "Restore fixture missing expectedCommentText."),
            expectedCanonCorrectionTitle: stringValue(
                payload["expectedCanonCorrectionTitle"] ?? payload["expected_canon_correction_title"]
            ),
            expectedCanonCorrectionText: stringValue(
                payload["expectedCanonCorrectionText"] ?? payload["expected_canon_correction_text"]
            ),
            expectedRetiredCanonFacts: arrayValue(
                payload["expectedRetiredCanonFacts"] ?? payload["expected_retired_canon_facts"]
            ),
            appLaunchEnvironment: [
                "THEM_UITEST_BACKEND_BASE_URL": baseURL,
                "THEM_UITEST_APP_TOKEN": appToken,
                "THEM_UITEST_USER_ID": userID,
                "THEM_UITEST_CLIENT_TOKEN": clientToken,
                "THEM_UITEST_CLIENT_TOKEN_CACHED_AT": "\(clientTokenCachedAt)",
                "THEM_UITEST_CLIENT_TOKEN_BASE_URL": baseURL,
                "THEM_UITEST_CLIENT_TOKEN_EXPIRY": clientTokenExpiry,
                "THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN": accessToken,
                "THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN_ENABLED": "1",
                "THEM_UITEST_AUTH_SIGNED_IN": "1",
                "THEM_UITEST_STUDIO_FULL_THREAD_STATE_JSON": fullThreadStateJSON,
                "THEM_UITEST_STUDIO_ASK_NOTE_HISTORY_JSON": askHistoryJSON,
                "THEM_UITEST_STUDIO_DIFF_ACKNOWLEDGED_JSON": acknowledgedJSON,
                "THEM_UITEST_STUDIO_DIFF_ACKNOWLEDGED_WRITEIDS_JSON": acknowledgedWriteIDsJSON,
            ]
        )
    }

    private func backendRestoreContractIsAvailable(baseURL: URL) async -> Bool {
        do {
            let response = try await requestJSON(
                baseURL: baseURL,
                path: "/health",
                method: "GET",
                headers: [:],
                body: nil
            )
            return response.status == 200
        } catch {
            return false
        }
    }

    private func seedBackendRestoreContractFixture(baseURL: URL) async throws -> RestoreContractFixture {
        let appToken = "them-dev"
        let stamp = "\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(6).lowercased())"
        let projectID = "studio-ios-restore-\(stamp)"
        let projectKey = "project:\(projectID)"
        let title = "Studio iOS Restore \(stamp)"

        let firstWriteID = UUID().uuidString.lowercased()
        let secondWriteID = UUID().uuidString.lowercased()
        let thirdWriteID = UUID().uuidString.lowercased()
        let lineageKey = "lineage:\(firstWriteID)"
        let focusedDiffKey = "write:\(firstWriteID)"
        let firstText = "INT. ROOM - NIGHT\n\nHe closes the blinds and waits."
        let secondText = "INT. ROOM - NIGHT\n\nHe waits."
        let thirdText = "INT. ROOM - NIGHT\n\nHe waits, still."
        let now = Date()

        let firstEntry = studioRestoreExchange(
            prompt: "Write one new action line: He closes the blinds and waits.",
            insertedText: firstText,
            writeID: firstWriteID,
            replacedWriteID: "",
            timestamp: now.addingTimeInterval(-2)
        )
        let secondEntry = studioRestoreExchange(
            prompt: "Rewrite only the last line shorter. Replace that line and do not add a new slugline or any extra lines.",
            insertedText: secondText,
            writeID: secondWriteID,
            replacedWriteID: firstWriteID,
            timestamp: now.addingTimeInterval(-1)
        )
        let thirdEntry = studioRestoreExchange(
            prompt: "Rewrite that same line again, but make it more visual. Replace the same line only.",
            insertedText: thirdText,
            writeID: thirdWriteID,
            replacedWriteID: secondWriteID,
            timestamp: now
        )

        let threadViewState: [String: Any] = [
            "searchText": "",
            "selectedFilterRaw": "all",
            "selectedSceneKey": "",
            "scrollTargetKey": stringValue(firstEntry["id"]).lowercased(),
            "collapsedSectionKeys": [],
            "focusedDiffKey": focusedDiffKey,
            "reopenedLineageKeys": [lineageKey],
            "latestReopenedWriteID": thirdWriteID,
        ]
        let acknowledgedFingerprint = normalizedScreenplayText(secondText).lowercased()

        let signup = try await requestJSON(
            baseURL: baseURL,
            path: "/auth/signup",
            method: "POST",
            headers: ["X-APP-TOKEN": appToken],
            body: [
                "email": "studio-ios-restore-\(stamp)@example.test",
                "password": "ThemRestore-\(stamp)-aA1!",
                "display_name": "Studio iOS Restore Contract",
            ]
        )
        try assertHTTP(signup, context: "signup")
        let user = signup.payload["user"] as? [String: Any] ?? [:]
        let accessToken = try firstNonEmptyString(
            signup.payload["access_token"],
            signup.payload["accessToken"],
            message: "Signup did not return an access token."
        )
        let refreshToken = try firstNonEmptyString(
            signup.payload["refresh_token"],
            signup.payload["refreshToken"],
            message: "Signup did not return a refresh token."
        )
        let userID = try firstNonEmptyString(
            user["id"],
            user["user_id"],
            user["userId"],
            signup.payload["user_id"],
            signup.payload["userId"],
            message: "Signup did not return a user id."
        )

        let session = try await requestJSON(
            baseURL: baseURL,
            path: "/session",
            method: "POST",
            headers: [
                "X-APP-TOKEN": appToken,
                "Authorization": "Bearer \(accessToken)",
            ],
            body: [:]
        )
        try assertHTTP(session, context: "session")
        let clientToken = try firstNonEmptyString(
            session.payload["client_token"],
            session.payload["session_id"],
            message: "Session did not return a client token."
        )
        let expiresIn = max(60, intValue(session.payload["expires_in"]))
        let clientTokenExpiry = ISO8601DateFormatter().string(from: Date().addingTimeInterval(TimeInterval(expiresIn)))
        let ownerHeaders = [
            "X-APP-TOKEN": appToken,
            "Authorization": "Bearer \(accessToken)",
            "X-Client-Token": clientToken,
        ]

        let projectState = try await requestJSON(
            baseURL: baseURL,
            path: "/screenplay/projects",
            method: "POST",
            headers: ownerHeaders,
            body: [
                "project_id": projectID,
                "title": title,
                "phase": "scene_draft",
                "activate": true,
                "studio_thread_view_state": [
                    "search_text": "",
                    "selected_filter_raw": "all",
                    "selected_scene_key": "",
                    "scroll_target_key": stringValue(firstEntry["id"]).lowercased(),
                    "collapsed_section_keys": [],
                    "focused_diff_key": focusedDiffKey,
                    "reopened_lineage_keys": [lineageKey],
                    "latest_reopened_write_id": thirdWriteID,
                ],
                "studio_diff_acknowledged_entries": [[
                    "key": lineageKey,
                    "fingerprint": acknowledgedFingerprint,
                    "write_id": secondWriteID,
                ]],
            ]
        )
        try assertHTTP(projectState, context: "project state")

        let version = try await requestJSON(
            baseURL: baseURL,
            path: "/screenplay/projects/\(projectID)/version",
            method: "POST",
            headers: ownerHeaders,
            body: [
                "draft": thirdText,
                "title": title,
                "phase": "scene_draft",
                "source": "studio_clementine_page_write",
                "base_version_id": "",
            ]
        )
        try assertHTTP(version, context: "project version")
        let versionID = try firstNonEmptyString(
            version.payload["version_id"],
            version.payload["server_version_id"],
            message: "Seeded version did not return an id."
        )

        let collaboratorEmail = "ios-restore-collab-\(projectID)@example.com"
        let commentText = "iOS restore collaboration note \(projectID)"
        let collaborator = try await requestJSON(
            baseURL: baseURL,
            path: "/screenplay/projects/\(projectID)/collaborators",
            method: "POST",
            headers: ownerHeaders,
            body: [
                "email": collaboratorEmail,
                "action": "approve",
                "note": "Seeded before Studio iOS restore.",
                "invited_by": "studio-ios-restore-contract",
            ]
        )
        try assertHTTP(collaborator, context: "collaborator")
        let comment = try await requestJSON(
            baseURL: baseURL,
            path: "/screenplay/projects/\(projectID)/comments",
            method: "POST",
            headers: ownerHeaders,
            body: [
                "text": commentText,
                "author_email": collaboratorEmail,
                "author_name": "Studio iOS Restore",
                "actor_email": collaboratorEmail,
                "anchor_line": 1,
                "version_id": versionID,
                "type": "text",
                "action": "create",
            ]
        )
        try assertHTTP(comment, context: "comment")
        let commentPayload = comment.payload["comment"] as? [String: Any] ?? [:]
        let commentID = try firstNonEmptyString(
            commentPayload["id"],
            comment.payload["comment_id"],
            message: "Seeded comment did not return an id."
        )
        let resolvedComment = try await requestJSON(
            baseURL: baseURL,
            path: "/screenplay/projects/\(projectID)/comments",
            method: "POST",
            headers: ownerHeaders,
            body: [
                "action": "resolve",
                "comment_id": commentID,
                "actor_email": collaboratorEmail,
                "author_email": collaboratorEmail,
            ]
        )
        try assertHTTP(resolvedComment, context: "resolve comment")

        let fullThreadStateJSON = try jsonString([projectKey: threadViewState])
        let askHistoryJSON = try jsonString([projectKey: [thirdEntry, secondEntry, firstEntry]])
        let acknowledgedJSON = try jsonString([projectKey: [lineageKey: acknowledgedFingerprint]])
        let acknowledgedWriteIDsJSON = try jsonString([projectKey: [lineageKey: secondWriteID]])
        let loadToken = Int(Date().timeIntervalSince1970 * 1000) % 1_000_000_000

        return RestoreContractFixture(
            projectID: projectID,
            versionID: versionID,
            loadToken: loadToken,
            expectedDraft: thirdText,
            expectedAskNoteText: thirdText,
            expectedFocusedDiffKey: focusedDiffKey,
            expectedReopenedWriteID: thirdWriteID,
            expectedReopenedLineageKey: lineageKey,
            expectedCollaboratorEmail: collaboratorEmail,
            expectedCommentText: commentText,
            expectedCanonCorrectionTitle: "",
            expectedCanonCorrectionText: "",
            expectedRetiredCanonFacts: [],
            appLaunchEnvironment: [
                "THEM_UITEST_BACKEND_BASE_URL": baseURL.absoluteString,
                "THEM_UITEST_APP_TOKEN": appToken,
                "THEM_UITEST_USER_ID": userID,
                "THEM_UITEST_CLIENT_TOKEN": clientToken,
                "THEM_UITEST_CLIENT_TOKEN_CACHED_AT": "\(Int(Date().timeIntervalSince1970))",
                "THEM_UITEST_CLIENT_TOKEN_BASE_URL": baseURL.absoluteString,
                "THEM_UITEST_CLIENT_TOKEN_EXPIRY": clientTokenExpiry,
                "THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN": accessToken,
                "THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN_ENABLED": "1",
                "THEM_UITEST_AUTH_DEBUG_REFRESH_TOKEN": refreshToken,
                "THEM_UITEST_AUTH_SIGNED_IN": "1",
                "THEM_UITEST_STUDIO_FULL_THREAD_STATE_JSON": fullThreadStateJSON,
                "THEM_UITEST_STUDIO_ASK_NOTE_HISTORY_JSON": askHistoryJSON,
                "THEM_UITEST_STUDIO_DIFF_ACKNOWLEDGED_JSON": acknowledgedJSON,
                "THEM_UITEST_STUDIO_DIFF_ACKNOWLEDGED_WRITEIDS_JSON": acknowledgedWriteIDsJSON,
            ]
        )
    }

    private func studioRestoreExchange(
        prompt: String,
        insertedText: String,
        writeID: String,
        replacedWriteID: String,
        timestamp: Date
    ) -> [String: Any] {
        [
            "id": UUID().uuidString,
            "backendThreadID": "",
            "backendTurn": NSNull(),
            "requestID": "studio-ios-fixture-\(UUID().uuidString.lowercased())",
            "prompt": prompt,
            "target": "page",
            "source": "typed",
            "noteTitle": "Wrote to page",
            "noteBody": String(normalizedScreenplayText(insertedText).prefix(220)),
            "developmentText": NSNull(),
            "writeID": writeID,
            "replacedWriteID": replacedWriteID,
            "anchorLine": 1,
            "anchorEndLine": 3,
            "anchorSceneLabel": "INT. ROOM - NIGHT",
            "anchorExcerpt": insertedText,
            "insertedText": insertedText,
            "replacementApplied": !replacedWriteID.isEmpty,
            "revisedBlockText": replacedWriteID.isEmpty ? NSNull() : insertedText,
            "resolvedAnchorExcerpt": insertedText,
            "timestamp": ISO8601DateFormatter().string(from: timestamp),
        ]
    }

    private struct JSONResponse {
        let status: Int
        let payload: [String: Any]
    }

    private func requestJSON(
        baseURL: URL,
        path: String,
        method: String,
        headers: [String: String],
        body: [String: Any]?,
        queryItems: [URLQueryItem] = []
    ) async throws -> JSONResponse {
        var components = try XCTUnwrap(URLComponents(url: baseURL, resolvingAgainstBaseURL: false))
        components.path = "/" + path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }
        let url = try XCTUnwrap(components.url)
        var request = URLRequest(url: url)
        request.httpMethod = method
        for (key, value) in headers {
            request.setValue(value, forHTTPHeaderField: key)
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let payload = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
        return JSONResponse(status: status, payload: payload)
    }

    private func assertHTTP(_ response: JSONResponse, context: String) throws {
        guard (200...299).contains(response.status) else {
            throw NSError(
                domain: "themUITests.restore",
                code: response.status,
                userInfo: [NSLocalizedDescriptionKey: "\(context) failed with \(response.status): \(response.payload)"]
            )
        }
    }

    private func jsonString(_ object: Any) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        guard let string = String(data: data, encoding: .utf8) else {
            throw NSError(
                domain: "themUITests.restore",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Could not encode JSON string."]
            )
        }
        return string
    }

    private func firstNonEmptyString(_ values: Any?..., message: String) throws -> String {
        for value in values {
            let string = stringValue(value)
            if !string.isEmpty {
                return string
            }
        }
        throw NSError(
            domain: "themUITests.restore",
            code: 2,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }

    private func waitForRestoreSnapshot(
        in app: XCUIApplication,
        timeout: TimeInterval,
        predicate: ([String: Any]) -> Bool
    ) -> Bool {
        let snapshot = app.staticTexts["studio.restore.snapshot"]
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if snapshot.waitForExistence(timeout: 0.5),
               let decoded = decodeJSONObject(snapshot.label),
               predicate(decoded) {
                return true
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        if snapshot.exists,
           let decoded = decodeJSONObject(snapshot.label) {
            return predicate(decoded)
        }
        return false
    }

    private func decodeJSONObject(_ raw: String) -> [String: Any]? {
        guard let data = raw.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return object
    }

    private func stringValue(_ value: Any?) -> String {
        switch value {
        case let string as String:
            return string.trimmingCharacters(in: .whitespacesAndNewlines)
        case let number as NSNumber:
            return number.stringValue
        default:
            return ""
        }
    }

    private func intValue(_ value: Any?) -> Int {
        switch value {
        case let int as Int:
            return int
        case let number as NSNumber:
            return number.intValue
        case let string as String:
            return Int(string.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
        default:
            return 0
        }
    }

    private func boolValue(_ value: Any?) -> Bool {
        switch value {
        case let bool as Bool:
            return bool
        case let number as NSNumber:
            return number.boolValue
        case let string as String:
            return ["1", "true", "yes", "on"].contains(string.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
        default:
            return false
        }
    }

    private func arrayValue(_ value: Any?) -> [String] {
        guard let values = value as? [Any] else { return [] }
        return values.map { stringValue($0) }.filter { !$0.isEmpty }
    }

    private func normalizedScreenplayText(_ value: String) -> String {
        value
            .replacingOccurrences(of: "\\n", with: " ")
            .replacingOccurrences(of: "\\r", with: " ")
            .replacingOccurrences(of: "\n", with: " ")
            .replacingOccurrences(of: "\r", with: " ")
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private func draftFingerprint(_ value: String) -> String {
        var hash: UInt64 = 14_695_981_039_346_656_037
        for byte in value.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 1_099_511_628_211
        }
        return String(hash, radix: 16)
    }
}

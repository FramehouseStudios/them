import Foundation
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

    func test_canon_clarification_is_visible_in_companion_and_studio() {
        let companion = launchApp(showCanonClarification: true)
        XCTAssertTrue(companion.otherElements["canon.clarification.card"].waitForExistence(timeout: 8))
        XCTAssertTrue(staticText(containing: "Mara goes back for both", in: companion).exists)
        XCTAssertEqual(companion.buttons.matching(identifier: "canon.clarification.fact").count, 2)
        companion.buttons["canon.clarification.later"].tap()
        XCTAssertFalse(companion.otherElements["canon.clarification.card"].waitForExistence(timeout: 1))
        companion.terminate()

        let studio = launchApp(openStudio: true, showCanonClarification: true)
        XCTAssertTrue(studio.otherElements["canon.clarification.card"].waitForExistence(timeout: 8))
        XCTAssertTrue(staticText(containing: "Which existing story fact", in: studio).exists)
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
    func test_cross_platform_backend_project_restore_loads_preseeded_screenplay_session() async throws {
        guard let fixture = try restoreContractFixtureFromEnvironment() else {
            throw XCTSkip("No cross-platform restore fixture was provided.")
        }
        try await assertBackendProjectRestoreLoads(fixture)
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

        XCTAssertTrue(app.otherElements["studio.surface"].waitForExistence(timeout: 12))
        XCTAssertTrue(waitForDraft(in: app, containing: "INT. ROOM - NIGHT", timeout: 45))
        XCTAssertTrue(waitForDraft(in: app, containing: "He waits, still.", timeout: 10))

        var finalSnapshot: [String: Any] = [:]
        let restored = waitForRestoreSnapshot(in: app, timeout: 60) { snapshot in
            finalSnapshot = snapshot
            let draftText = normalizedScreenplayText(
                "\(stringValue(snapshot["draft_preview"])) \(stringValue(snapshot["draft_tail_preview"]))"
            )
            let reopenedLineageKeys = arrayValue(snapshot["restored_reopened_lineage_keys"])
                .map { $0.lowercased() }
            let approvedEmails = arrayValue(snapshot["approved_emails"])
                .map { $0.lowercased() }
            return stringValue(snapshot["selected_project_id"]).lowercased() == fixture.projectID.lowercased()
                && stringValue(snapshot["latest_version_id"]).lowercased() == fixture.versionID.lowercased()
                && boolValue(snapshot["selected_project_present"])
                && boolValue(snapshot["load_project_ready"])
                && stringValue(snapshot["load_project_stage"]).lowercased() == "editor_ready"
                && intValue(snapshot["load_project_token"]) == fixture.loadToken
                && stringValue(snapshot["load_project_error"]).isEmpty
                && stringValue(snapshot["restored_focused_diff_key"]).lowercased() == fixture.expectedFocusedDiffKey.lowercased()
                && reopenedLineageKeys.contains(fixture.expectedReopenedLineageKey.lowercased())
                && stringValue(snapshot["restored_latest_reopened_write_id"]).lowercased() == fixture.expectedReopenedWriteID.lowercased()
                && intValue(snapshot["reopened_diff_count"]) > 0
                && intValue(snapshot["ask_note_history_count"]) >= 3
                && intValue(snapshot["backend_ask_note_history_count"]) >= 3
                && normalizedScreenplayText(stringValue(snapshot["latest_ask_note_inserted_text"]))
                    .contains(normalizedScreenplayText(fixture.expectedDraft))
                && draftText.contains(normalizedScreenplayText(fixture.expectedDraft))
                && intValue(snapshot["collaborator_count"]) >= 1
                && approvedEmails.contains(fixture.expectedCollaboratorEmail.lowercased())
                && intValue(snapshot["comment_count"]) >= 1
                && normalizedScreenplayText(stringValue(snapshot["latest_comment_text"])) == normalizedScreenplayText(fixture.expectedCommentText)
                && stringValue(snapshot["latest_comment_author"]).lowercased() == fixture.expectedCollaboratorEmail.lowercased()
                && boolValue(snapshot["latest_comment_resolved"])
                && !boolValue(snapshot["latest_comment_deleted"])
                && stringValue(snapshot["error_text"]).isEmpty
        }
        XCTAssertTrue(restored, "Restore snapshot never reached expected state: \(finalSnapshot)")
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
        showCanonClarification: Bool = false,
        autoSubmitPagePrompt: String? = nil,
        autoSubmitVoicePinPrompt: String? = nil,
        restoreProjectID: String? = nil,
        restoreVersionID: String? = nil,
        restoreLoadToken: Int? = nil,
        launchEnvironment: [String: String] = [:]
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
        if showCanonClarification {
            arguments.append("--ui-show-canon-clarification")
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

    private struct RestoreContractFixture {
        let projectID: String
        let versionID: String
        let loadToken: Int
        let expectedDraft: String
        let expectedFocusedDiffKey: String
        let expectedReopenedWriteID: String
        let expectedReopenedLineageKey: String
        let expectedCollaboratorEmail: String
        let expectedCommentText: String
        let appLaunchEnvironment: [String: String]
    }

    private func restoreContractFixtureFromEnvironment(
        _ environment: [String: String] = ProcessInfo.processInfo.environment
    ) throws -> RestoreContractFixture? {
        let environmentRaw = (environment["THEM_UITEST_RESTORE_FIXTURE_JSON"] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let fixturePath = (environment["THEM_UITEST_RESTORE_FIXTURE_PATH"] ?? "/tmp/them_studio_cross_platform_restore_fixture.json")
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

        return RestoreContractFixture(
            projectID: try firstNonEmptyString(payload["projectID"], payload["project_id"], message: "Restore fixture missing projectID."),
            versionID: try firstNonEmptyString(payload["versionID"], payload["version_id"], message: "Restore fixture missing versionID."),
            loadToken: max(1, intValue(payload["loadToken"] ?? payload["load_token"])),
            expectedDraft: try firstNonEmptyString(payload["expectedDraft"], payload["expected_draft"], message: "Restore fixture missing expectedDraft."),
            expectedFocusedDiffKey: try firstNonEmptyString(payload["expectedFocusedDiffKey"], payload["expected_focused_diff_key"], message: "Restore fixture missing expectedFocusedDiffKey."),
            expectedReopenedWriteID: try firstNonEmptyString(payload["expectedReopenedWriteID"], payload["expected_reopened_write_id"], message: "Restore fixture missing expectedReopenedWriteID."),
            expectedReopenedLineageKey: try firstNonEmptyString(payload["expectedReopenedLineageKey"], payload["expected_reopened_lineage_key"], message: "Restore fixture missing expectedReopenedLineageKey."),
            expectedCollaboratorEmail: try firstNonEmptyString(payload["expectedCollaboratorEmail"], payload["expected_collaborator_email"], message: "Restore fixture missing expectedCollaboratorEmail."),
            expectedCommentText: try firstNonEmptyString(payload["expectedCommentText"], payload["expected_comment_text"], message: "Restore fixture missing expectedCommentText."),
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
            expectedFocusedDiffKey: focusedDiffKey,
            expectedReopenedWriteID: thirdWriteID,
            expectedReopenedLineageKey: lineageKey,
            expectedCollaboratorEmail: collaboratorEmail,
            expectedCommentText: commentText,
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
        body: [String: Any]?
    ) async throws -> JSONResponse {
        var components = try XCTUnwrap(URLComponents(url: baseURL, resolvingAgainstBaseURL: false))
        components.path = "/" + path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
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
}

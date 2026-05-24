import XCTest
@testable import them

@MainActor
final class StudioThreadViewStateSupportTests: XCTestCase {
    func testLegacyDecodeDefaultsMissingReopenedFields() throws {
        let payload = """
        {
          \"searchText\": \"legacy search\",
          \"selectedFilterRaw\": \"pageWrites\",
          \"selectedSceneKey\": \"scene:legacy\",
          \"scrollTargetKey\": \"thread:legacy\",
          \"collapsedSectionKeys\": [\"scene:legacy\"],
          \"focusedDiffKey\": \"thread:legacy\"
        }
        """

        let decoded = try XCTUnwrap(
            try? JSONDecoder().decode(
                StudioFullThreadBrowseState.self,
                from: Data(payload.utf8)
            )
        )

        XCTAssertEqual(decoded.searchText, "legacy search")
        XCTAssertEqual(decoded.selectedFilterRaw, "pageWrites")
        XCTAssertEqual(decoded.selectedSceneKey, "scene:legacy")
        XCTAssertEqual(decoded.scrollTargetKey, "thread:legacy")
        XCTAssertEqual(decoded.collapsedSectionKeys, ["scene:legacy"])
        XCTAssertEqual(decoded.focusedDiffKey, "thread:legacy")
        XCTAssertEqual(decoded.reopenedLineageKeys, [])
        XCTAssertEqual(decoded.latestReopenedWriteID, "")
    }

    func testResolvePrefersLocalMeaningfulValuesAndFallsBackToBackend() throws {
        let backend = StudioFullThreadBrowseState(
            searchText: "backend search",
            selectedFilterRaw: "voicePin",
            selectedSceneKey: "scene:backend",
            scrollTargetKey: "thread:backend",
            collapsedSectionKeys: ["scene:backend"],
            focusedDiffKey: "thread:backend",
            reopenedLineageKeys: ["lineage:backend"],
            latestReopenedWriteID: "write-backend"
        )
        let local = StudioFullThreadBrowseState(
            searchText: "",
            selectedFilterRaw: "pageWrites",
            selectedSceneKey: "",
            scrollTargetKey: "thread:local",
            collapsedSectionKeys: [],
            focusedDiffKey: "thread:local",
            reopenedLineageKeys: ["lineage:local"],
            latestReopenedWriteID: "write-local"
        )

        let result = StudioFullThreadBrowseStateRestoreResult.resolve(local: local, backend: backend)
        let record = try XCTUnwrap(result.record)

        XCTAssertEqual(record.searchText, "backend search")
        XCTAssertEqual(record.selectedFilterRaw, "pageWrites")
        XCTAssertEqual(record.selectedSceneKey, "scene:backend")
        XCTAssertEqual(record.scrollTargetKey, "thread:local")
        XCTAssertEqual(record.collapsedSectionKeys, ["scene:backend"])
        XCTAssertEqual(record.focusedDiffKey, "thread:local")
        XCTAssertEqual(record.reopenedLineageKeys, ["lineage:local"])
        XCTAssertEqual(record.latestReopenedWriteID, "write-local")
        XCTAssertEqual(result.source, .merged)
        XCTAssertEqual(result.focusedDiffSource, .local)
        XCTAssertEqual(result.reopenedSource, .local)
    }

    func testResolveReportsMergedReopenedSourceWhenLocalAndBackendSplitIt() throws {
        let backend = StudioFullThreadBrowseState(
            searchText: "",
            selectedFilterRaw: "",
            selectedSceneKey: "",
            scrollTargetKey: "",
            collapsedSectionKeys: [],
            focusedDiffKey: "thread:backend",
            reopenedLineageKeys: ["lineage:backend"],
            latestReopenedWriteID: "write-backend"
        )
        let local = StudioFullThreadBrowseState(
            searchText: "",
            selectedFilterRaw: "",
            selectedSceneKey: "",
            scrollTargetKey: "",
            collapsedSectionKeys: [],
            focusedDiffKey: "thread:local",
            reopenedLineageKeys: ["lineage:local"],
            latestReopenedWriteID: ""
        )

        let result = StudioFullThreadBrowseStateRestoreResult.resolve(local: local, backend: backend)
        let record = try XCTUnwrap(result.record)

        XCTAssertEqual(record.focusedDiffKey, "thread:local")
        XCTAssertEqual(record.reopenedLineageKeys, ["lineage:local"])
        XCTAssertEqual(record.latestReopenedWriteID, "write-backend")
        XCTAssertEqual(result.source, .merged)
        XCTAssertEqual(result.focusedDiffSource, .local)
        XCTAssertEqual(result.reopenedSource, .merged)
    }

    func testResolveAttributesMirroredReopenedStateToBackend() throws {
        let backend = StudioFullThreadBrowseState(
            searchText: "",
            selectedFilterRaw: "",
            selectedSceneKey: "",
            scrollTargetKey: "",
            collapsedSectionKeys: [],
            focusedDiffKey: "thread:backend",
            reopenedLineageKeys: ["lineage:backend"],
            latestReopenedWriteID: "write-backend"
        )
        let local = StudioFullThreadBrowseState(
            searchText: "",
            selectedFilterRaw: "",
            selectedSceneKey: "",
            scrollTargetKey: "",
            collapsedSectionKeys: [],
            focusedDiffKey: "thread:local",
            reopenedLineageKeys: ["lineage:backend"],
            latestReopenedWriteID: "write-backend"
        )

        let result = StudioFullThreadBrowseStateRestoreResult.resolve(local: local, backend: backend)
        let record = try XCTUnwrap(result.record)

        XCTAssertEqual(record.focusedDiffKey, "thread:local")
        XCTAssertEqual(record.reopenedLineageKeys, ["lineage:backend"])
        XCTAssertEqual(record.latestReopenedWriteID, "write-backend")
        XCTAssertEqual(result.source, .merged)
        XCTAssertEqual(result.focusedDiffSource, .local)
        XCTAssertEqual(result.reopenedSource, .backend)
    }

    func testBackendPayloadNormalizesFocusedAndReopenedKeys() {
        let state = StudioFullThreadBrowseState(
            searchText: " note ",
            selectedFilterRaw: "voicePin",
            selectedSceneKey: " scene:key ",
            scrollTargetKey: " thread:key ",
            collapsedSectionKeys: ["scene:a"],
            focusedDiffKey: " Write:ABC ",
            reopenedLineageKeys: [" Lineage:A ", "", "lineage:b"],
            latestReopenedWriteID: " Write:XYZ "
        )

        let payload = state.backendPayload

        XCTAssertEqual(payload.searchText, " note ")
        XCTAssertEqual(payload.selectedSceneKey, "scene:key")
        XCTAssertEqual(payload.scrollTargetKey, "thread:key")
        XCTAssertEqual(payload.focusedDiffKey, "write:abc")
        XCTAssertEqual(payload.reopenedLineageKeys ?? [], ["lineage:a", "lineage:b"])
        XCTAssertEqual(payload.latestReopenedWriteID, "write:xyz")
    }

    func testFocusRestorePolicyPreservesPersistentKeyDuringProjectRestore() {
        let restoring = StudioThreadViewPersistDeferralContext(
            hasProjectKey: true,
            isRestoringFullThreadBrowseState: true,
            isAwaitingInitialFullThreadRestore: false,
            isAwaitingInitialAcknowledgedDiffHydration: false,
            isRestoringReopenedDiffState: false
        )
        let awaitingAcknowledgementHydration = StudioThreadViewPersistDeferralContext(
            hasProjectKey: true,
            isRestoringFullThreadBrowseState: false,
            isAwaitingInitialFullThreadRestore: false,
            isAwaitingInitialAcknowledgedDiffHydration: true,
            isRestoringReopenedDiffState: false
        )

        XCTAssertFalse(StudioThreadFocusRestorePolicy.shouldClearPersistentFocusKey(restoring))
        XCTAssertFalse(StudioThreadFocusRestorePolicy.shouldClearPersistentFocusKey(awaitingAcknowledgementHydration))
    }

    func testFocusRestorePolicyClearsPersistentKeyAfterRestoreSettles() {
        let settledProject = StudioThreadViewPersistDeferralContext(
            hasProjectKey: true,
            isRestoringFullThreadBrowseState: false,
            isAwaitingInitialFullThreadRestore: false,
            isAwaitingInitialAcknowledgedDiffHydration: false,
            isRestoringReopenedDiffState: false
        )
        let liveDraft = StudioThreadViewPersistDeferralContext(
            hasProjectKey: false,
            isRestoringFullThreadBrowseState: true,
            isAwaitingInitialFullThreadRestore: true,
            isAwaitingInitialAcknowledgedDiffHydration: true,
            isRestoringReopenedDiffState: true
        )

        XCTAssertTrue(StudioThreadFocusRestorePolicy.shouldClearPersistentFocusKey(settledProject))
        XCTAssertTrue(StudioThreadFocusRestorePolicy.shouldClearPersistentFocusKey(liveDraft))
    }

    func testRenderedCharacterMentionExtractorFindsDialogueCues() {
        let screenplay = """
        INT. MOTEL - NIGHT

        JUNE
        I found the letter.

        CAL (V.O.)
        Do not open it.

        CUT TO:

        EXT. ROAD - DAWN
        """

        let mentions = ScreenplayRenderedCharacterMentionExtractor.extractMentions(from: screenplay)

        XCTAssertEqual(mentions.map(\.characterName), ["JUNE", "CAL"])
        XCTAssertEqual(mentions.map(\.line), [3, 6])
        XCTAssertEqual(mentions.first?.tags, ["screenplay_reply", "ios_rendered_page"])
    }

    func testReplySideMentionFlagDefaultsOnAndAllowsExplicitOptOut() {
        let suiteName = "io.them.tests.replyMentionFlag.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }

        XCTAssertTrue(ScreenplayLiveDraftBridge.replySideCharacterMentionsFeatureEnabled(defaults: defaults))

        defaults.set(false, forKey: ScreenplayLiveDraftBridge.replySideCharacterMentionsEnabledKey)
        XCTAssertFalse(ScreenplayLiveDraftBridge.replySideCharacterMentionsFeatureEnabled(defaults: defaults))

        defaults.set(true, forKey: ScreenplayLiveDraftBridge.replySideCharacterMentionsEnabledKey)
        XCTAssertTrue(ScreenplayLiveDraftBridge.replySideCharacterMentionsFeatureEnabled(defaults: defaults))
    }

    func testReplySideMentionFeatureFlagGuardsCommittedWrites() {
        let write = ScreenplayCommittedWrite(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000029")!,
            writeID: "write-1",
            previousDraft: "",
            committedDraft: "",
            insertedText: """
            JUNE
            Hello.
            """,
            replacementApplied: false,
            replacedWriteID: nil,
            startLine: 1,
            endLine: 2,
            committedAt: Date(timeIntervalSince1970: 29)
        )

        XCTAssertEqual(
            ScreenplayLiveDraftBridge.replySideCharacterMentions(for: write, featureEnabled: false),
            []
        )
        XCTAssertEqual(
            ScreenplayLiveDraftBridge.replySideCharacterMentions(for: write, featureEnabled: true).map(\.characterName),
            ["JUNE"]
        )

        let placeholder = ScreenplayCommittedWrite(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000030")!,
            writeID: "stub-1",
            previousDraft: "",
            committedDraft: "",
            insertedText: write.insertedText,
            replacementApplied: false,
            replacedWriteID: nil,
            startLine: 1,
            endLine: 2,
            committedAt: Date(timeIntervalSince1970: 30)
        )

        XCTAssertEqual(
            ScreenplayLiveDraftBridge.replySideCharacterMentions(for: placeholder, featureEnabled: true),
            []
        )
    }

    func testCharacterMentionPayloadUsesRecordEndpointContract() throws {
        let mention = ScreenplayRenderedCharacterMention(
            characterName: "JUNE",
            line: 3,
            tags: ["screenplay_reply"]
        )

        let payload = BackendMemoryAPI.characterMentionPayload(
            mention: mention,
            writeID: "write-1",
            projectID: "project-1",
            versionID: "version-1"
        )

        XCTAssertEqual(payload["character_name"] as? String, "JUNE")
        XCTAssertEqual(payload["characterName"] as? String, "JUNE")
        XCTAssertEqual(payload["write_id"] as? String, "write-1")
        XCTAssertEqual(payload["line"] as? Int, 3)
        XCTAssertEqual(payload["source"] as? String, "ios_screenplay_render")
        XCTAssertEqual(payload["tags"] as? [String], ["screenplay_reply"])

        let metadata = try XCTUnwrap(payload["metadata"] as? [String: Any])
        XCTAssertEqual(metadata["screenplay_write_id"] as? String, "write-1")
        XCTAssertEqual(metadata["screenplay_project_id"] as? String, "project-1")
        XCTAssertEqual(metadata["screenplay_version_id"] as? String, "version-1")
        XCTAssertEqual(metadata["line"] as? Int, 3)
        XCTAssertEqual(metadata["source"] as? String, "ios_screenplay_render")
    }

    func testPerceivedSpeedStateStartsInsideResponseBudget() {
        let start = Date(timeIntervalSince1970: 100)
        let state = StudioPerceivedSpeedState.start(
            requestID: " request-1 ",
            prompt: "  write the opener  ",
            target: .page,
            sourceRaw: " typed ",
            now: start
        )

        XCTAssertEqual(state.id, "request-1")
        XCTAssertEqual(state.prompt, "write the opener")
        XCTAssertTrue(state.isActive)
        XCTAssertEqual(state.firstFeedbackMilliseconds, 0)
        XCTAssertTrue(state.meetsResponseBudget)
        XCTAssertEqual(state.statusText, "Writing to the page...")
        XCTAssertEqual(state.skeletonLines.first, "INT. LOCATION - MOMENTS LATER")
    }

    func testPerceivedSpeedStateCompletesWithoutLosingFirstFeedbackMeasurement() {
        let state = StudioPerceivedSpeedState.start(
            requestID: "voice-pin-1",
            prompt: "what is weak here?",
            target: .voicePin,
            sourceRaw: "voice",
            now: Date(timeIntervalSince1970: 10)
        )
        let completed = state.completing()

        XCTAssertFalse(completed.isActive)
        XCTAssertTrue(completed.isComplete)
        XCTAssertEqual(completed.firstFeedbackMilliseconds, 0)
        XCTAssertEqual(completed.statusText, "Preparing a fast reply...")
        XCTAssertEqual(completed.skeletonLines.count, 3)
    }

}

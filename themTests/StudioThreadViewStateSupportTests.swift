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

    func testScreenplayQualityStatusShowsRepairDirectivesForBlockedPageBatch() throws {
        let quality = BackendTalkScreenplayQuality(
            ok: false,
            reason: "summary_like_page_batch",
            source: "guard_low_page_quality",
            confidence: "needs_repair",
            counts: ["summary_like_action": 3],
            minimumSpecificActions: 3,
            repairDirectives: [
                "Replace synopsis/overview language with playable Fountain pages.",
                "Replace synopsis/overview language with playable Fountain pages."
            ]
        )
        let output = BackendTalkScreenplayOutput(
            target: "voice_pin",
            format: "note",
            source: "guard_low_page_quality",
            quality: quality,
            text: "",
            lines: []
        )

        let status = try XCTUnwrap(ScreenplayQualityStatus(quality: quality, output: output))

        XCTAssertEqual(status.resolution, .blocked)
        XCTAssertEqual(status.minimumSpecificActions, 3)
        XCTAssertEqual(status.repairDirectives, ["Replace synopsis/overview language with playable Fountain pages."])
        XCTAssertTrue(status.detail.contains("summary instead of playable pages"))
        XCTAssertTrue(status.detail.contains("Repair focus: Replace synopsis/overview language"))
    }

    func testScreenplayQualityStatusShowsRepairDirectivesForRepairedPageBatch() throws {
        let quality = BackendTalkScreenplayQuality(
            ok: true,
            reason: "ok",
            source: "repair_pass",
            confidence: "repaired",
            repairDirectives: [
                "Break the run into escalating turns: launch pressure, complication, reversal/cost, and exit image."
            ]
        )
        let output = BackendTalkScreenplayOutput(
            target: "page",
            format: "hollywood",
            source: "repair_pass",
            quality: quality,
            text: "INT. MOTEL ROOM - NIGHT\n\nJune folds the receipt.",
            lines: [
                BackendTalkScreenplayOutputLine(index: 0, text: "INT. MOTEL ROOM - NIGHT", element: "sceneHeading"),
                BackendTalkScreenplayOutputLine(index: 1, text: "June folds the receipt.", element: "action")
            ]
        )

        let status = try XCTUnwrap(ScreenplayQualityStatus(quality: quality, output: output))

        XCTAssertEqual(status.resolution, .repaired)
        XCTAssertEqual(status.repairDirectives.count, 1)
        XCTAssertTrue(status.detail.contains("Clementine repaired the page"))
        XCTAssertTrue(status.detail.contains("Break the run into escalating turns"))
    }

    func testScreenplayTraceCarriesRepairTimingTelemetry() {
        XCTAssertFalse(BackendTalkScreenplayTrace.empty.repairAttempted)
        XCTAssertEqual(BackendTalkScreenplayTrace.empty.repairOutcome, "none")
        XCTAssertNil(BackendTalkScreenplayTrace.empty.repairMs)
        XCTAssertNil(BackendTalkScreenplayTrace.empty.repairReason)

        let trace = BackendTalkScreenplayTrace(
            modeEnabled: true,
            phase: " scene_draft ",
            pack: " Act II ",
            packLock: false,
            projectId: " project-7 ",
            versionId: " version-3 ",
            repairAttempted: true,
            repairOutcome: " Repaired ",
            repairMs: 1240,
            repairReason: " summary_like_page_batch "
        )

        XCTAssertTrue(trace.repairAttempted)
        XCTAssertEqual(trace.repairOutcome, "repaired")
        XCTAssertEqual(trace.repairMs, 1240)
        XCTAssertEqual(trace.repairReason, "summary_like_page_batch")
        XCTAssertEqual(trace.phase, "scene_draft")
        XCTAssertEqual(trace.pack, "Act II")
        XCTAssertEqual(trace.projectId, "project-7")
        XCTAssertEqual(trace.versionId, "version-3")
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

    func testCommittedWriteSnapshotsProjectAndVersionContext() {
        let bridge = ScreenplayLiveDraftBridge.shared
        let originalProjectID = bridge.preferredProjectID
        let originalVersionID = bridge.preferredVersionID
        defer {
            bridge.preferredProjectID = originalProjectID
            bridge.preferredVersionID = originalVersionID
        }
        bridge.preferredProjectID = "project-alpha"
        bridge.preferredVersionID = "version-alpha"

        let write = bridge.makeCommittedWrite(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000031")!,
            writeID: "write-31",
            previousDraft: "",
            committedDraft: "INT. ROOFTOP - NIGHT",
            insertedText: "INT. ROOFTOP - NIGHT",
            replacementApplied: false,
            replacedWriteID: nil as String?,
            startLine: 1,
            endLine: 1,
            committedAt: Date(timeIntervalSince1970: 31)
        )

        bridge.preferredProjectID = "project-beta"
        bridge.preferredVersionID = "version-beta"

        XCTAssertEqual(write.normalizedProjectID, "project-alpha")
        XCTAssertEqual(write.normalizedVersionID, "version-alpha")
        XCTAssertEqual(
            ScreenplayLiveDraftBridge.resolvedCommittedWriteProjectID(
                write,
                preferredProjectID: bridge.preferredProjectID,
                bindingProjectID: "project-binding"
            ),
            "project-alpha"
        )
        XCTAssertEqual(
            ScreenplayLiveDraftBridge.resolvedCommittedWriteVersionID(
                write,
                preferredVersionID: bridge.preferredVersionID,
                bindingVersionID: "version-binding"
            ),
            "version-alpha"
        )
    }

    func testCommittedWriteContextFallsBackForLegacyWrites() {
        let legacy = ScreenplayCommittedWrite(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000032")!,
            writeID: "write-32",
            previousDraft: "",
            committedDraft: "INT. STAGE - DAY",
            insertedText: "INT. STAGE - DAY",
            replacementApplied: false,
            replacedWriteID: nil,
            startLine: 1,
            endLine: 1,
            committedAt: Date(timeIntervalSince1970: 32)
        )

        XCTAssertEqual(
            ScreenplayLiveDraftBridge.resolvedCommittedWriteProjectID(
                legacy,
                preferredProjectID: "project-preferred",
                bindingProjectID: "project-binding"
            ),
            "project-preferred"
        )
        XCTAssertEqual(
            ScreenplayLiveDraftBridge.resolvedCommittedWriteProjectID(
                legacy,
                preferredProjectID: "",
                bindingProjectID: "project-binding"
            ),
            "project-binding"
        )
        XCTAssertEqual(
            ScreenplayLiveDraftBridge.resolvedCommittedWriteVersionID(
                legacy,
                preferredVersionID: "version-preferred",
                bindingVersionID: "version-binding"
            ),
            "version-preferred"
        )
        XCTAssertEqual(
            ScreenplayLiveDraftBridge.resolvedCommittedWriteVersionID(
                legacy,
                preferredVersionID: "",
                bindingVersionID: "version-binding"
            ),
            "version-binding"
        )
    }

    func testPreferredContextPersistenceTrimsStoredValuesAndClearsEmptyValues() {
        XCTAssertEqual(
            ScreenplayLivePreferredContextPersistencePolicy.valueForStorage(" project-alpha "),
            "project-alpha"
        )
        XCTAssertEqual(
            ScreenplayLivePreferredContextPersistencePolicy.valueForStorage("\nversion-alpha\t"),
            "version-alpha"
        )
        XCTAssertNil(ScreenplayLivePreferredContextPersistencePolicy.valueForStorage("   "))
    }

    func testPreferredContextRestorePrefersStoredIDsOverBindingFallbacks() {
        XCTAssertEqual(
            ScreenplayLivePreferredContextPersistencePolicy.restoredProjectID(
                storedPreferredProjectID: " project-preferred ",
                bindingProjectID: "project-binding"
            ),
            "project-preferred"
        )
        XCTAssertEqual(
            ScreenplayLivePreferredContextPersistencePolicy.restoredVersionID(
                storedPreferredVersionID: " version-preferred ",
                bindingVersionID: "version-binding"
            ),
            "version-preferred"
        )
    }

    func testPreferredContextRestoreFallsBackToBindingIDs() {
        XCTAssertEqual(
            ScreenplayLivePreferredContextPersistencePolicy.restoredProjectID(
                storedPreferredProjectID: nil,
                bindingProjectID: " project-binding "
            ),
            "project-binding"
        )
        XCTAssertEqual(
            ScreenplayLivePreferredContextPersistencePolicy.restoredVersionID(
                storedPreferredVersionID: " ",
                bindingVersionID: " version-binding "
            ),
            "version-binding"
        )
        XCTAssertEqual(
            ScreenplayLivePreferredContextPersistencePolicy.restoredProjectID(
                storedPreferredProjectID: nil,
                bindingProjectID: " "
            ),
            ""
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

    func testCreativeMemoryTraceNormalizesCorrectionsForDebugState() {
        XCTAssertFalse(BackendTalkCreativeMemoryTrace.empty.applied)
        XCTAssertEqual(BackendTalkCreativeMemoryTrace.empty.characterCount, 0)
        XCTAssertEqual(BackendTalkCreativeMemoryTrace.empty.episodicCount, 0)
        XCTAssertEqual(BackendTalkCreativeMemoryTrace.empty.correctionCount, 0)

        let trace = BackendTalkCreativeMemoryTrace(
            applied: true,
            projectId: " rain-docket ",
            projectTitle: " Rain Docket ",
            queryChars: 420,
            characterCount: 0,
            characters: [
                BackendTalkCreativeMemoryCharacterTrace(
                    name: " Mara ",
                    hasBible: true,
                    hasCorrections: true,
                    correctedTerms: [" mother ", ""],
                    correctionReplacements: [" mother -> Eli's sister "]
                )
            ],
            episodicCount: 0,
            episodic: [
                BackendTalkCreativeMemoryEpisodeTrace(
                    summary: " Correction for Mara ",
                    excerpt: " VHS tape, not cassette ",
                    projectId: " rain-docket ",
                    projectTitle: " Rain Docket ",
                    characters: [" Mara "],
                    tags: [" correction "],
                    correction: true
                )
            ],
            correctionCount: 2,
            correctedTerms: [" mother "],
            correctionReplacements: [" mother -> Eli's sister "],
            styleApplied: true
        )

        XCTAssertEqual(trace.projectId, "rain-docket")
        XCTAssertEqual(trace.projectTitle, "Rain Docket")
        XCTAssertEqual(trace.characterCount, 1)
        XCTAssertEqual(trace.episodicCount, 1)
        XCTAssertEqual(trace.correctionCount, 2)
        XCTAssertEqual(trace.characters.map(\.name), ["Mara"])
        XCTAssertEqual(trace.characters.first?.correctedTerms, ["mother"])
        XCTAssertEqual(trace.correctionReplacements, ["mother -> Eli's sister"])
        XCTAssertEqual(trace.episodic.first?.summary, "Correction for Mara")
        XCTAssertEqual(trace.episodic.first?.characters, ["Mara"])
        XCTAssertTrue(trace.styleApplied)
    }

    func testTalkCreativeMemoryTraceBecomesAppliedStudioMemory() {
        let trace = BackendTalkCreativeMemoryTrace(
            applied: true,
            characterCount: 1,
            characters: [
                BackendTalkCreativeMemoryCharacterTrace(
                    name: " Mara ",
                    hasBible: true,
                    hasCorrections: true,
                    correctedTerms: [" mother "],
                    correctionReplacements: [" mother -> Eli's sister "]
                )
            ],
            episodic: [
                BackendTalkCreativeMemoryEpisodeTrace(
                    summary: "Mara correction",
                    excerpt: "Mara is Eli's sister, not his mother.",
                    characters: [" Eli ", "Mara"],
                    tags: ["correction"],
                    correction: true
                )
            ],
            correctionCount: 1,
            correctedTerms: ["mother"],
            correctionReplacements: ["mother -> Eli's sister"]
        )

        let state = ScreenplayStudioAppliedMemoryState.from(
            trace,
            source: " talk_result ",
            previousSavedCorrection: " old correction "
        )

        XCTAssertTrue(state.hasContent)
        XCTAssertEqual(state.source, "talk_result")
        XCTAssertEqual(state.characters, ["Mara", "Eli"])
        XCTAssertEqual(state.primaryCharacter, "Mara")
        XCTAssertTrue(state.characterBibleApplied)
        XCTAssertTrue(state.correctionAppliedToPrompt)
        XCTAssertEqual(state.correctedTerms, ["mother"])
        XCTAssertEqual(state.correctionReplacements, ["mother -> Eli's sister"])
        XCTAssertEqual(state.lastSavedCorrection, "old correction")
        XCTAssertEqual(state.summary, "Mara, Eli: mother -> Eli's sister")
    }

}

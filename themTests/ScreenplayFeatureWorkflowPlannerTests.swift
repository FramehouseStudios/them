import XCTest
@testable import them

@MainActor
final class ScreenplayFeatureWorkflowPlannerTests: XCTestCase {
    func testPlannerBuildsActAwareNextSceneCompassAndPagePrompt() {
        let now = Date().timeIntervalSince1970 * 1000
        let outline = BackendScreenplayOutline(
            updatedAt: now,
            actCount: 1,
            sceneCount: 2,
            beatCount: 2,
            acts: [
                BackendScreenplayAct(
                    id: "act-1",
                    title: "Act I",
                    summary: "A city story begins to corner the protagonist.",
                    order: 0,
                    sceneIds: ["scene-opening", "scene-kitchen"],
                    createdAt: now,
                    updatedAt: now
                )
            ],
            scenes: [
                BackendScreenplayScene(
                    id: "scene-opening",
                    slugline: "EXT. OVERPASS - DAWN",
                    title: "Opening",
                    objective: "Mara decides to take the impossible call.",
                    summary: "Mara hears the message that starts the story.",
                    actId: "act-1",
                    order: 0,
                    status: "drafted",
                    beatIds: ["beat-call"],
                    createdAt: now,
                    updatedAt: now
                ),
                BackendScreenplayScene(
                    id: "scene-kitchen",
                    slugline: "INT. KITCHEN - DAY",
                    title: "Kitchen",
                    objective: "Mara hides the call from her brother while choosing whether to leave.",
                    summary: "The ordinary room becomes a pressure cooker.",
                    actId: "act-1",
                    order: 1,
                    status: "open",
                    beatIds: ["beat-kitchen-choice"],
                    createdAt: now,
                    updatedAt: now
                )
            ],
            beats: [
                BackendScreenplayBeat(
                    id: "beat-call",
                    label: "The future calls",
                    summary: "Mara receives a call from tomorrow.",
                    sceneId: "scene-opening",
                    actId: "act-1",
                    order: 0,
                    status: "drafted",
                    createdAt: now,
                    updatedAt: now
                ),
                BackendScreenplayBeat(
                    id: "beat-kitchen-choice",
                    label: "Mara lies to stay free",
                    summary: "Mara chooses the mystery over family safety.",
                    sceneId: "scene-kitchen",
                    actId: "act-1",
                    order: 1,
                    status: "open",
                    createdAt: now,
                    updatedAt: now
                )
            ]
        )
        let structuredDraft = ScreenplayStructuredDraft(
            updatedAt: Date(),
            lineCount: 80,
            sceneCount: 1,
            paragraphs: [],
            scenes: [
                ScreenplayDraftSceneSnapshot(
                    id: "draft-opening",
                    line: 1,
                    endLine: 44,
                    slugline: "EXT. OVERPASS - DAWN",
                    shortLabel: "Overpass",
                    characterCues: ["MARA"],
                    dialogueLineCount: 4
                )
            ],
            characters: ["MARA"]
        )
        let binding = ScreenplayProjectBindingSnapshot(
            updatedAt: Date(),
            projectID: "project-1",
            projectTitle: "Tomorrow Call",
            versionID: "version-1",
            phase: "scene_draft",
            draftSceneCount: 1,
            outlineSceneCount: 2,
            boundSceneCount: 1,
            draftCharacterCount: 1,
            projectCharacterCount: 1,
            boundCharacterCount: 1,
            sceneBindings: [
                ScreenplayProjectSceneBindingSnapshot(
                    id: "binding-opening",
                    draftSceneID: "draft-opening",
                    draftLine: 1,
                    draftEndLine: 44,
                    draftSlugline: "EXT. OVERPASS - DAWN",
                    draftShortLabel: "Overpass",
                    outlineSceneID: "scene-opening",
                    outlineSceneTitle: "Opening",
                    outlineSceneSlugline: "EXT. OVERPASS - DAWN",
                    outlineSceneObjective: "Mara decides to take the impossible call.",
                    outlineSceneSummary: "Mara hears the message that starts the story.",
                    outlineBeatIDs: ["beat-call"],
                    outlineBeatLabels: ["The future calls"],
                    actTitle: "Act I",
                    matchedBy: "slugline"
                )
            ]
        )
        let committedWrite = ScreenplayCommittedWrite(
            id: UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!,
            writeID: "write-kitchen-001",
            projectID: "project-1",
            versionID: "version-1",
            previousDraft: "",
            committedDraft: "",
            insertedText: "INT. KITCHEN - DAY\n\nMARA waits.\n\nHer phone buzzes.",
            replacementApplied: false,
            replacedWriteID: nil,
            startLine: 45,
            endLine: 49,
            committedAt: Date()
        )

        let snapshot = ScreenplayFeatureWorkflowPlanner.buildSnapshot(
            project: project(),
            outline: outline,
            structuredDraft: structuredDraft,
            projectBinding: binding,
            featureSpine: ScreenplayFeatureSpine(
                logline: "A woman receives emergency calls from tomorrow.",
                themeArgument: "Control fails when love becomes avoidance.",
                centralQuestion: "Can Mara save tomorrow without abandoning today?",
                protagonistWant: "Mara wants to outrun the warning.",
                protagonistNeed: "Mara needs to trust someone else.",
                antagonisticForce: "A future disaster closing in.",
                actPosition: "Act I",
                endingImage: "Mara answers the phone in daylight.",
                unresolvedSetups: ["The first call has no caller ID."]
            ),
            lastCommittedWrite: committedWrite,
            acceptedPageBatchCount: 2,
            currentCursorLine: 30,
            draftText: "EXT. OVERPASS - DAWN\n\nMARA listens."
        )

        XCTAssertEqual(snapshot.currentActTitle, "Act I")
        XCTAssertEqual(snapshot.actProgressLabel, "Scene 1/2")
        XCTAssertEqual(snapshot.nextSceneTitle, "INT. KITCHEN - DAY")
        XCTAssertEqual(snapshot.nextMoves.count, 4)
        XCTAssertEqual(snapshot.nextMoves[2].id, "sequence-turn")
        XCTAssertTrue(snapshot.nextMoves[2].title.contains("Advance Opening Image"))
        XCTAssertTrue(snapshot.nextMoves[0].prompt.contains("Write 3-5 pages in Fountain format only"))
        XCTAssertTrue(snapshot.nextMoves[0].prompt.contains("Feature sequence guide:"))
        XCTAssertTrue(snapshot.nextMoves[0].prompt.contains("Coming next: Act I - Catalyst To Commitment"))
        XCTAssertTrue(snapshot.pageWritePrompt.contains("Clementine standard"))
        XCTAssertTrue(snapshot.pageWritePrompt.contains("Feature Compass:"))
        XCTAssertTrue(snapshot.pageWritePrompt.contains("Silent preflight: lock act, sequence, scene job"))
        XCTAssertTrue(snapshot.pageWritePrompt.contains("Sequence engine: write this scene as a step in Act I - Opening Image"))
        XCTAssertTrue(snapshot.pageWritePrompt.contains("Act-to-act causality"))
        XCTAssertTrue(snapshot.pageWritePrompt.contains("Page quality gate: no placeholder scenes"))
        XCTAssertTrue(snapshot.featureSequenceTitle.contains("Act I - Opening Image"))
        XCTAssertTrue(snapshot.featureSequenceDetail.contains("Plant the emotional question"))
        XCTAssertTrue(snapshot.featureSequenceMoves.contains("Echo the ending image in a smaller, incomplete form."))
        XCTAssertTrue(snapshot.comingNextSequence.contains("Act I - Catalyst To Commitment"))
        XCTAssertTrue(snapshot.acceptedBatchDetail.contains("L45-L49"))
        XCTAssertTrue(snapshot.hasAcceptedBatch)
    }

    func testPlannerFallsBackToFeatureSpineWhenOutlineIsEmpty() {
        let snapshot = ScreenplayFeatureWorkflowPlanner.buildSnapshot(
            project: nil,
            outline: BackendScreenplayOutline(
                updatedAt: nil,
                actCount: 0,
                sceneCount: 0,
                beatCount: 0,
                acts: [],
                scenes: [],
                beats: []
            ),
            structuredDraft: ScreenplayStructuredDraft(
                updatedAt: Date(),
                lineCount: 120,
                sceneCount: 0,
                paragraphs: [],
                scenes: [],
                characters: []
            ),
            projectBinding: .empty,
            featureSpine: ScreenplayFeatureSpine(
                centralQuestion: "Can Nora forgive the machine that learned her grief?",
                actPosition: "Act II",
                endingImage: "Nora walks into sunrise without the earpiece."
            ),
            lastCommittedWrite: nil,
            acceptedPageBatchCount: 0,
            currentCursorLine: 72,
            draftText: "INT. APARTMENT - NIGHT\n\nNORA listens."
        )

        XCTAssertEqual(snapshot.currentActTitle, "Act II")
        XCTAssertTrue(snapshot.featureSequenceTitle.contains("Act II - Promise Of The Premise"))
        XCTAssertEqual(snapshot.nextSceneTitle, "the next scene")
        XCTAssertTrue(snapshot.planningPrompt.contains("Give exactly three turns"))
        XCTAssertTrue(snapshot.planningPrompt.contains("Feature sequence guide:"))
        XCTAssertTrue(snapshot.planningPrompt.contains("Coming next: Act II - Midpoint Pressure"))
        XCTAssertTrue(snapshot.sceneDoctorPrompt.contains("Scene doctor"))
        XCTAssertTrue(snapshot.sceneDoctorPrompt.contains("Sequence page moves:"))
        XCTAssertFalse(snapshot.hasAcceptedBatch)
    }

    func testContinuationPromptElevationOnlyTargetsGenericPageContinuation() {
        XCTAssertTrue(ScreenplayFeatureWorkflowPlanner.shouldElevateContinuationPrompt("continue"))
        XCTAssertTrue(ScreenplayFeatureWorkflowPlanner.shouldElevateContinuationPrompt("write the next scene"))
        XCTAssertTrue(ScreenplayFeatureWorkflowPlanner.shouldElevateContinuationPrompt("continue from here, please"))
        XCTAssertTrue(ScreenplayFeatureWorkflowPlanner.shouldElevateContinuationPrompt("more"))

        XCTAssertFalse(ScreenplayFeatureWorkflowPlanner.shouldElevateContinuationPrompt("Rewrite the diner scene with sharper subtext."))
        XCTAssertFalse(ScreenplayFeatureWorkflowPlanner.shouldElevateContinuationPrompt("Plan the next three turns before writing."))
        XCTAssertFalse(ScreenplayFeatureWorkflowPlanner.shouldElevateContinuationPrompt("Scene doctor this confrontation."))
        XCTAssertFalse(ScreenplayFeatureWorkflowPlanner.shouldElevateContinuationPrompt("Continue the feature.\n\nClementine standard: elite feature screenwriting."))
    }

    func testContinuationPromptElevationBuildsFeatureAwareWritingBrief() {
        let snapshot = ScreenplayFeatureWorkflowSnapshot(
            currentActTitle: "Act II",
            currentActDetail: "Pressure closes in.",
            actProgressLabel: "Scene 7/14",
            draftProgressLabel: "42 pages drafted",
            acceptedBatchTitle: "3 accepted batches",
            acceptedBatchDetail: "Latest: L210-L248, 39 lines",
            acceptedBatchLineRange: 210...248,
            structuralObligation: "Escalate the central pressure and turn the midpoint into irreversible fallout.",
            nextSceneTitle: "INT. COURTHOUSE HALLWAY - NIGHT",
            nextSceneDetail: "Mara must lie in public to protect the person she is starting to trust.",
            nextMoves: [
                ScreenplayFeatureWorkflowMove(
                    id: "next-scene",
                    title: "Write INT. COURTHOUSE HALLWAY - NIGHT",
                    detail: "Mara risks a public lie.",
                    prompt: "Write the hallway scene."
                ),
                ScreenplayFeatureWorkflowMove(
                    id: "next-beat",
                    title: "Pay off the false alibi",
                    detail: "The lie saves one person and wounds another.",
                    prompt: "Write the false alibi beat."
                )
            ],
            pageWritePrompt: """
            Continue the feature as feature-film screenplay pages.

            Write 3-5 pages in Fountain format only.
            Current act: Act II
            Scene target: INT. COURTHOUSE HALLWAY - NIGHT
            Structural obligation: Escalate the midpoint fallout.
            """,
            planningPrompt: "",
            sceneDoctorPrompt: "",
            featureSequenceTitle: "Act II - Midpoint Pressure (p41-p55)",
            featureSequenceDetail: "p42 / 110. The midpoint must turn victory into a trap.",
            featureSequenceMoves: [
                "Build to a reversal that redefines what the protagonist thought they wanted.",
                "Let the emotional truth arrive before the exposition."
            ],
            comingNextSequence: "Act II - Reversal Fallout"
        )

        let prompt = ScreenplayFeatureWorkflowPlanner.enrichedContinuationPrompt(
            for: "continue from here",
            snapshot: snapshot,
            recentStudioContext: [
                "Prior page direction: Make Mara's public lie cost her the brother scene.",
                "Prior Clementine note: Keep the midpoint victory emotionally contaminated."
            ]
        )

        XCTAssertNotNil(prompt)
        XCTAssertTrue(prompt?.contains("Writer's immediate direction: continue from here") == true)
        XCTAssertTrue(prompt?.contains("Act II (Scene 7/14); 42 pages drafted") == true)
        XCTAssertTrue(prompt?.contains("Latest: L210-L248") == true)
        XCTAssertTrue(prompt?.contains("INT. COURTHOUSE HALLWAY - NIGHT") == true)
        XCTAssertTrue(prompt?.contains("Feature sequence guide:") == true)
        XCTAssertTrue(prompt?.contains("Act II - Midpoint Pressure (p41-p55)") == true)
        XCTAssertTrue(prompt?.contains("The midpoint must turn victory into a trap.") == true)
        XCTAssertTrue(prompt?.contains("Coming next: Act II - Reversal Fallout") == true)
        XCTAssertTrue(prompt?.contains("Sequence page moves: Build to a reversal") == true)
        XCTAssertTrue(prompt?.contains("Next story turns:") == true)
        XCTAssertTrue(prompt?.contains("Restored Studio memory:") == true)
        XCTAssertTrue(prompt?.contains("Make Mara's public lie cost her the brother scene.") == true)
        XCTAssertTrue(prompt?.contains("Keep the midpoint victory emotionally contaminated.") == true)
        XCTAssertTrue(prompt?.contains("finished Fountain screenplay pages") == true)

        XCTAssertNil(ScreenplayFeatureWorkflowPlanner.enrichedContinuationPrompt(
            for: "Rewrite this as a colder confrontation.",
            snapshot: snapshot
        ))
    }

    func testContinuationPromptMemoryContextIsDedupedAndCapped() {
        let snapshot = ScreenplayFeatureWorkflowSnapshot(
            currentActTitle: "Act II",
            currentActDetail: "Midpoint pressure.",
            actProgressLabel: "Scene 7/14",
            draftProgressLabel: "42 pages drafted",
            acceptedBatchTitle: "3 accepted batches",
            acceptedBatchDetail: "Latest: L210-L248, 39 lines",
            acceptedBatchLineRange: 210...248,
            structuralObligation: "Turn the midpoint victory into irreversible fallout.",
            nextSceneTitle: "INT. COURTHOUSE HALLWAY - NIGHT",
            nextSceneDetail: "Mara must lie in public to protect the person she is starting to trust.",
            nextMoves: [],
            pageWritePrompt: "Continue the feature as feature-film screenplay pages.",
            planningPrompt: "",
            sceneDoctorPrompt: ""
        )

        let prompt = ScreenplayFeatureWorkflowPlanner.enrichedContinuationPrompt(
            for: "continue",
            snapshot: snapshot,
            recentStudioContext: [
                "  A remembered pressure.  ",
                "A remembered pressure.",
                "Second memory.",
                "Third memory.",
                "Fourth memory.",
                "Fifth memory.",
                "Sixth memory should not appear."
            ]
        )

        XCTAssertEqual(prompt?.components(separatedBy: "- A remembered pressure.").count, 2)
        XCTAssertTrue(prompt?.contains("- Fifth memory.") == true)
        XCTAssertFalse(prompt?.contains("Sixth memory should not appear.") == true)
    }

    func testFeatureWorkflowSnapshotBuildsSessionContextForBackendMetadata() {
        let snapshot = ScreenplayFeatureWorkflowSnapshot(
            currentActTitle: "Act II",
            currentActDetail: "Midpoint pressure.",
            actProgressLabel: "Scene 7/14",
            draftProgressLabel: "42 pages drafted",
            acceptedBatchTitle: "3 accepted batches",
            acceptedBatchDetail: "Latest: L210-L248, 39 lines",
            acceptedBatchLineRange: 210...248,
            structuralObligation: "Turn the midpoint victory into irreversible fallout.",
            nextSceneTitle: "INT. COURTHOUSE HALLWAY - NIGHT",
            nextSceneDetail: "Mara must lie in public to protect the person she is starting to trust.",
            nextMoves: [
                ScreenplayFeatureWorkflowMove(
                    id: "next-scene",
                    title: "Write the hallway confession",
                    detail: "Mara risks a public lie.",
                    prompt: "Write the hallway confession."
                ),
                ScreenplayFeatureWorkflowMove(
                    id: "next-beat",
                    title: "Pay off the false alibi",
                    detail: "The lie saves one person and wounds another.",
                    prompt: "Write the false alibi beat."
                )
            ],
            pageWritePrompt: "Write the next pages.",
            planningPrompt: "",
            sceneDoctorPrompt: ""
        )

        let context = ScreenplayFeatureWorkflowSessionContext(
            requestID: " studio-123 ",
            submittedPrompt: " continue ",
            snapshot: snapshot,
            featureSpine: ScreenplayFeatureSpine(
                logline: "A woman receives emergency calls from tomorrow.",
                themeArgument: "Control fails when love becomes avoidance.",
                centralQuestion: "Can Mara save tomorrow without abandoning today?",
                protagonistWant: "Mara wants to outrun the warning.",
                protagonistNeed: "Mara needs to trust someone else.",
                antagonisticForce: "A future disaster closing in.",
                endingImage: "Mara answers the phone in daylight.",
                unresolvedSetups: [
                    "The first call has no caller ID.",
                    "The missing tape has not paid off."
                ]
            ),
            createdAt: Date(timeIntervalSince1970: 100),
            pageCount: 42,
            targetPages: 110
        )

        XCTAssertEqual(context.requestID, "studio-123")
        XCTAssertEqual(context.submittedPrompt, "continue")
        XCTAssertEqual(context.act, "Act II")
        XCTAssertEqual(context.sceneObjective, "Mara must lie in public to protect the person she is starting to trust.")
        XCTAssertTrue(context.sceneSummary.contains("INT. COURTHOUSE HALLWAY - NIGHT"))
        XCTAssertEqual(context.currentBeat, "Turn the midpoint victory into irreversible fallout.")
        XCTAssertEqual(context.featureSequence, "Act II - Scene 7/14; 42 pages drafted")
        XCTAssertEqual(context.featureObligation, "Turn the midpoint victory into irreversible fallout.")
        XCTAssertTrue(context.nextScenePlan.contains("Next scene: INT. COURTHOUSE HALLWAY - NIGHT"))
        XCTAssertEqual(context.nextSceneMoves.count, 2)
        XCTAssertEqual(context.logline, "A woman receives emergency calls from tomorrow.")
        XCTAssertEqual(context.themeArgument, "Control fails when love becomes avoidance.")
        XCTAssertEqual(context.centralQuestion, "Can Mara save tomorrow without abandoning today?")
        XCTAssertEqual(context.protagonistWant, "Mara wants to outrun the warning.")
        XCTAssertEqual(context.protagonistNeed, "Mara needs to trust someone else.")
        XCTAssertEqual(context.antagonisticForce, "A future disaster closing in.")
        XCTAssertEqual(context.endingImage, "Mara answers the phone in daylight.")
        XCTAssertEqual(context.unresolvedSetups, [
            "The first call has no caller ID.",
            "The missing tape has not paid off."
        ])
        XCTAssertTrue(context.continuityNotes.contains("Feature Compass accepted batch: Latest: L210-L248, 39 lines"))
        XCTAssertEqual(context.emotionalContinuity, "Mara must lie in public to protect the person she is starting to trust.")
        XCTAssertEqual(context.pageCount, 42)
        XCTAssertEqual(context.targetPages, 110)
        XCTAssertFalse(context.isEmpty)
    }

    func testFeatureWorkflowContextPersistenceRestoresProjectScopedContinuity() throws {
        let snapshot = ScreenplayFeatureWorkflowSnapshot(
            currentActTitle: "Act II",
            currentActDetail: "The midpoint has teeth.",
            actProgressLabel: "Scene 8/14",
            draftProgressLabel: "48 pages drafted",
            acceptedBatchTitle: "4 accepted batches",
            acceptedBatchDetail: "Latest: L248-L302, 55 lines",
            acceptedBatchLineRange: 248...302,
            structuralObligation: "Make the victory cost Mara the relationship she needs most.",
            nextSceneTitle: "EXT. FLOOD CHANNEL - NIGHT",
            nextSceneDetail: "Mara follows the signal and realizes the future call came from inside her family.",
            nextMoves: [
                ScreenplayFeatureWorkflowMove(
                    id: "next-scene",
                    title: "Write the flood-channel discovery",
                    detail: "Mara turns the clue into a wound.",
                    prompt: "Write the discovery."
                )
            ],
            pageWritePrompt: "Write the next feature pages.",
            planningPrompt: "",
            sceneDoctorPrompt: ""
        )
        let createdAt = Date(timeIntervalSince1970: 1_000)
        let context = ScreenplayFeatureWorkflowSessionContext(
            requestID: " studio-restore ",
            projectID: " project-feature ",
            versionID: " version-7 ",
            submittedPrompt: " continue ",
            snapshot: snapshot,
            featureSpine: ScreenplayFeatureSpine(
                logline: "A woman receives emergency calls from tomorrow.",
                themeArgument: "Control fails when love becomes avoidance.",
                centralQuestion: "Can Mara save tomorrow without abandoning today?",
                protagonistWant: "Mara wants to outrun the warning.",
                protagonistNeed: "Mara needs to trust someone else.",
                antagonisticForce: "A future disaster closing in.",
                endingImage: "Mara answers the phone in daylight.",
                unresolvedSetups: ["The first call has no caller ID."]
            ),
            createdAt: createdAt,
            pageCount: 48,
            targetPages: 110
        )

        let payload = try XCTUnwrap(ScreenplayFeatureWorkflowContextPersistencePolicy.payloadForStorage(context))
        let restored = try XCTUnwrap(ScreenplayFeatureWorkflowContextPersistencePolicy.restoredContext(
            from: payload,
            now: createdAt.addingTimeInterval(60)
        ))

        XCTAssertEqual(restored.projectID, "project-feature")
        XCTAssertEqual(restored.versionID, "version-7")
        XCTAssertEqual(restored.act, "Act II")
        XCTAssertEqual(restored.featureSequence, "Act II - Scene 8/14; 48 pages drafted")
        XCTAssertEqual(restored.nextSceneMoves, ["Write the flood-channel discovery: Mara turns the clue into a wound."])
        XCTAssertEqual(restored.logline, "A woman receives emergency calls from tomorrow.")
        XCTAssertEqual(restored.themeArgument, "Control fails when love becomes avoidance.")
        XCTAssertEqual(restored.centralQuestion, "Can Mara save tomorrow without abandoning today?")
        XCTAssertEqual(restored.protagonistWant, "Mara wants to outrun the warning.")
        XCTAssertEqual(restored.protagonistNeed, "Mara needs to trust someone else.")
        XCTAssertEqual(restored.antagonisticForce, "A future disaster closing in.")
        XCTAssertEqual(restored.endingImage, "Mara answers the phone in daylight.")
        XCTAssertEqual(restored.unresolvedSetups, ["The first call has no caller ID."])
        XCTAssertTrue(ScreenplayFeatureWorkflowContextPersistencePolicy.isFreshForLiveRequest(
            restored,
            now: createdAt.addingTimeInterval(120)
        ))
        XCTAssertFalse(ScreenplayFeatureWorkflowContextPersistencePolicy.isFreshForLiveRequest(
            restored,
            now: createdAt.addingTimeInterval(181)
        ))
        XCTAssertTrue(ScreenplayFeatureWorkflowContextPersistencePolicy.projectScopedContext(
            restored,
            matchesProjectID: "project-feature"
        ))
        XCTAssertFalse(ScreenplayFeatureWorkflowContextPersistencePolicy.projectScopedContext(
            restored,
            matchesProjectID: "project-other"
        ))
    }

    func testFeatureWorkflowContextPersistenceRejectsExpiredSessionRestore() {
        let snapshot = ScreenplayFeatureWorkflowSnapshot(
            currentActTitle: "Act III",
            currentActDetail: "",
            actProgressLabel: "Final plan",
            draftProgressLabel: "90 pages drafted",
            acceptedBatchTitle: "",
            acceptedBatchDetail: "",
            acceptedBatchLineRange: nil,
            structuralObligation: "Drive the final choice.",
            nextSceneTitle: "INT. TERMINAL - DAWN",
            nextSceneDetail: "Mara makes the truth public.",
            nextMoves: [],
            pageWritePrompt: "Write the final movement.",
            planningPrompt: "",
            sceneDoctorPrompt: ""
        )
        let createdAt = Date(timeIntervalSince1970: 2_000)
        let context = ScreenplayFeatureWorkflowSessionContext(
            requestID: "studio-expired",
            projectID: "project-feature",
            submittedPrompt: "continue",
            snapshot: snapshot,
            createdAt: createdAt
        )
        let payload = ScreenplayFeatureWorkflowContextPersistencePolicy.payloadForStorage(context)

        XCTAssertNil(ScreenplayFeatureWorkflowContextPersistencePolicy.restoredContext(
            from: payload,
            now: createdAt.addingTimeInterval(ScreenplayFeatureWorkflowContextPersistencePolicy.restoredProjectMaxAge + 1)
        ))
    }

    func testFeatureWorkflowRestorePolicyKeepsFreshMatchingProjectContext() {
        let createdAt = Date(timeIntervalSince1970: 3_000)
        let current = workflowContext(
            projectID: "project-feature",
            versionID: "version-7",
            createdAt: createdAt
        )

        XCTAssertFalse(ScreenplayFeatureWorkflowContextPersistencePolicy.shouldRefreshProjectRestoreContext(
            current: current,
            projectID: " project-feature ",
            versionID: "version-7",
            now: createdAt.addingTimeInterval(600)
        ))
    }

    func testFeatureWorkflowRestorePolicyProtectsLiveRequestContext() {
        let createdAt = Date(timeIntervalSince1970: 3_500)
        let current = workflowContext(
            projectID: "project-feature",
            versionID: "version-6",
            createdAt: createdAt
        )

        XCTAssertFalse(ScreenplayFeatureWorkflowContextPersistencePolicy.shouldRefreshProjectRestoreContext(
            current: current,
            projectID: "project-feature",
            versionID: "version-7",
            now: createdAt.addingTimeInterval(60)
        ))
    }

    func testFeatureWorkflowRestorePolicyRefreshesMissingMismatchedExpiredOrChangedVersionContext() {
        let createdAt = Date(timeIntervalSince1970: 4_000)
        let matching = workflowContext(
            projectID: "project-feature",
            versionID: "version-6",
            createdAt: createdAt
        )
        let otherProject = workflowContext(
            projectID: "project-other",
            versionID: "version-7",
            createdAt: createdAt
        )
        let expired = workflowContext(
            projectID: "project-feature",
            versionID: "version-7",
            createdAt: createdAt
        )

        XCTAssertTrue(ScreenplayFeatureWorkflowContextPersistencePolicy.shouldRefreshProjectRestoreContext(
            current: nil,
            projectID: "project-feature",
            versionID: "version-7",
            now: createdAt
        ))
        XCTAssertTrue(ScreenplayFeatureWorkflowContextPersistencePolicy.shouldRefreshProjectRestoreContext(
            current: otherProject,
            projectID: "project-feature",
            versionID: "version-7",
            now: createdAt.addingTimeInterval(600)
        ))
        XCTAssertTrue(ScreenplayFeatureWorkflowContextPersistencePolicy.shouldRefreshProjectRestoreContext(
            current: matching,
            projectID: "project-feature",
            versionID: "version-7",
            now: createdAt.addingTimeInterval(600)
        ))
        XCTAssertTrue(ScreenplayFeatureWorkflowContextPersistencePolicy.shouldRefreshProjectRestoreContext(
            current: expired,
            projectID: "project-feature",
            versionID: "version-7",
            now: createdAt.addingTimeInterval(ScreenplayFeatureWorkflowContextPersistencePolicy.restoredProjectMaxAge + 1)
        ))
        XCTAssertFalse(ScreenplayFeatureWorkflowContextPersistencePolicy.shouldRefreshProjectRestoreContext(
            current: nil,
            projectID: " ",
            versionID: "version-7",
            now: createdAt
        ))
    }

    private func workflowContext(
        projectID: String,
        versionID: String,
        createdAt: Date
    ) -> ScreenplayFeatureWorkflowSessionContext {
        ScreenplayFeatureWorkflowSessionContext(
            requestID: "studio-restore-\(projectID)",
            projectID: projectID,
            versionID: versionID,
            submittedPrompt: "Restored project continuity",
            snapshot: ScreenplayFeatureWorkflowSnapshot(
                currentActTitle: "Act II",
                currentActDetail: "The middle closes in.",
                actProgressLabel: "Scene 8/14",
                draftProgressLabel: "48 pages drafted",
                acceptedBatchTitle: "3 accepted batches",
                acceptedBatchDetail: "Latest: L200-L248, 49 lines",
                acceptedBatchLineRange: 200...248,
                structuralObligation: "Make the victory cost the protagonist.",
                nextSceneTitle: "EXT. FLOOD CHANNEL - NIGHT",
                nextSceneDetail: "Mara follows the signal into a family wound.",
                nextMoves: [],
                pageWritePrompt: "Write the next feature pages.",
                planningPrompt: "",
                sceneDoctorPrompt: ""
            ),
            createdAt: createdAt,
            pageCount: 48,
            targetPages: 110
        )
    }

    private func project() -> BackendScreenplayProjectSummary {
        BackendScreenplayProjectSummary(
            id: "project-1",
            title: "Tomorrow Call",
            archived: false,
            tags: ["feature"],
            characters: ["MARA"],
            setting: "Los Angeles",
            tone: "Tender thriller",
            promptSeed: nil,
            logline: "A woman receives emergency calls from tomorrow.",
            themeArgument: "Control fails when love becomes avoidance.",
            centralQuestion: "Can Mara save tomorrow without abandoning today?",
            protagonistWant: "Mara wants to outrun the warning.",
            protagonistNeed: "Mara needs to trust someone else.",
            antagonisticForce: "A future disaster closing in.",
            actPosition: "Act I",
            endingImage: "Mara answers the phone in daylight.",
            unresolvedSetups: ["The first call has no caller ID."],
            createdAt: nil,
            updatedAt: nil,
            versionCount: 1,
            lastPhase: "scene_draft",
            activeVersionId: "version-1",
            lastVersionId: "version-1",
            lastVersionAt: nil,
            formatScore: nil,
            storyScore: nil,
            confidenceClass: nil,
            latestExcerpt: nil,
            actCount: 1,
            sceneCount: 2,
            beatCount: 2,
            outlineUpdatedAt: nil,
            collaboratorCount: nil,
            approvedEmails: nil,
            commentCount: nil,
            lastCommentAt: nil,
            studioThreadViewState: nil,
            studioDiffAcknowledged: nil,
            studioAskNoteHistory: nil,
            collaborators: nil,
            comments: nil,
            versions: nil,
            outline: nil
        )
    }
}

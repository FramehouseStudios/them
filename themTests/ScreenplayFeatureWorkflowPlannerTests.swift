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
        XCTAssertEqual(snapshot.nextMoves.count, 3)
        XCTAssertTrue(snapshot.nextMoves[0].prompt.contains("Write 3-5 pages in Fountain format only"))
        XCTAssertTrue(snapshot.pageWritePrompt.contains("Clementine standard"))
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
        XCTAssertEqual(snapshot.nextSceneTitle, "the next scene")
        XCTAssertTrue(snapshot.planningPrompt.contains("Give exactly three turns"))
        XCTAssertTrue(snapshot.sceneDoctorPrompt.contains("Scene doctor"))
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
            sceneDoctorPrompt: ""
        )

        let prompt = ScreenplayFeatureWorkflowPlanner.enrichedContinuationPrompt(
            for: "continue from here",
            snapshot: snapshot
        )

        XCTAssertNotNil(prompt)
        XCTAssertTrue(prompt?.contains("Writer's immediate direction: continue from here") == true)
        XCTAssertTrue(prompt?.contains("Act II (Scene 7/14); 42 pages drafted") == true)
        XCTAssertTrue(prompt?.contains("Latest: L210-L248") == true)
        XCTAssertTrue(prompt?.contains("INT. COURTHOUSE HALLWAY - NIGHT") == true)
        XCTAssertTrue(prompt?.contains("Next story turns:") == true)
        XCTAssertTrue(prompt?.contains("finished Fountain screenplay pages") == true)

        XCTAssertNil(ScreenplayFeatureWorkflowPlanner.enrichedContinuationPrompt(
            for: "Rewrite this as a colder confrontation.",
            snapshot: snapshot
        ))
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

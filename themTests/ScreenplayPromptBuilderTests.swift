import XCTest
@testable import them

final class ScreenplayPromptBuilderTests: XCTestCase {
    func testBuildModelPromptRoutesThroughBackendWithSessionAndCraftContext() async {
        let backend = PromptBackendSpy(response: BackendScreenplayPromptBuildResponse(
            ok: true,
            action: "screenplay_prompt_build",
            schemaVersion: 1,
            source: "buildModelPrompt",
            prompt: "BACKEND PROMPT",
            memoryApplied: true,
            sessionContextApplied: true,
            craftContextApplied: true,
            craftFrameworkId: "story-circle"
        ))
        let builder = ScreenplayPromptBuilder()

        let result = await builder.buildModelPrompt(
            backend: backend,
            request: ScreenplayPromptBuilder.Request(
                persona: "LOCAL PERSONA",
                userInput: "Write the midpoint reversal.",
                projectId: "proj-7",
                versionId: "v2",
                scene: "INT. MOTEL - NIGHT",
                phase: "scene_draft",
                pack: "Feature Sprint",
                draftExcerpt: "INT. MOTEL - NIGHT\n\nJUNE closes the blinds.",
                act: "Act II",
                sceneObjective: "June must decide whether to burn the evidence.",
                currentBeat: "The receipt exposes the lie.",
                logline: "A runaway editor finds a vanished film that can expose a family crime.",
                themeArgument: "Memory only heals when it becomes action.",
                centralQuestion: "Can June expose the truth without becoming what she hates?",
                protagonistWant: "June wants the missing reel.",
                protagonistNeed: "June needs to trust someone with the truth.",
                antagonisticForce: "Marcus and the studio archive burying the evidence.",
                endingImage: "June screens the recovered reel to a silent street.",
                featureSequence: "Act II - Midpoint Pressure (p41-p55)",
                featureObligation: "The midpoint must raise stakes, reveal a truth, or turn victory into a trap.",
                featureMemoryBrief: "Characters: June, Marcus | Authoritative corrections: mother -> Eli's sister",
                actPressureState: "The midpoint victory turns into a trap.",
                characterArcState: "June must trust someone with the truth.",
                lastSceneOutcome: "June closed the blinds on Marcus.",
                nextScenePlan: "Act II - Midpoint Pressure: June wins the reel and realizes the win is a trap.",
                nextSceneMoves: ["Make the midpoint public.", "Let the emotional truth arrive before exposition."],
                nextThreeTurns: [
                    "The receipt becomes bait.",
                    "Marcus tries to bury the reel.",
                    "June chooses public exposure."
                ],
                actThreePayoffPath: [
                    "The missing cassette pays off in public.",
                    "The recovered reel becomes testimony."
                ],
                beatSequence: ["Receipt reveal", "Marcus lies badly"],
                unresolvedSetups: ["The missing cassette has not paid off."],
                unresolvedStoryThreads: ["Who erased the archive ledger?"],
                characterArcTurns: ["June chooses trust over isolation."],
                imageMotifs: ["recovered reel", "silent street"],
                continuityNotes: ["Trust is turning into suspicion."],
                pageCount: 47,
                targetPages: 110,
                isScreenplayMode: true,
                shouldWriteToPage: true,
                craftFrameworkId: "story-circle"
            )
        )

        XCTAssertEqual(result.prompt, "BACKEND PROMPT")
        XCTAssertTrue(result.usedBackendAssembly)
        XCTAssertEqual(result.fallbackReason, "")
        XCTAssertEqual(result.screenplayTaskIntent, "")
        XCTAssertEqual(result.screenplayTaskLabel, "")
        XCTAssertEqual(backend.capturedRequest?.persona, "LOCAL PERSONA")
        XCTAssertEqual(backend.capturedRequest?.userInput, "Write the midpoint reversal.")
        XCTAssertEqual(backend.capturedRequest?.screenplayTaskHint, "Write the midpoint reversal.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.projectId, "proj-7")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.versionId, "v2")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.scene, "INT. MOTEL - NIGHT")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.phase, "scene_draft")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.pack, "Feature Sprint")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.draftExcerpt, "INT. MOTEL - NIGHT\n\nJUNE closes the blinds.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.act, "Act II")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.sceneObjective, "June must decide whether to burn the evidence.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.currentBeat, "The receipt exposes the lie.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.logline, "A runaway editor finds a vanished film that can expose a family crime.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.themeArgument, "Memory only heals when it becomes action.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.centralQuestion, "Can June expose the truth without becoming what she hates?")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.protagonistWant, "June wants the missing reel.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.protagonistNeed, "June needs to trust someone with the truth.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.antagonisticForce, "Marcus and the studio archive burying the evidence.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.endingImage, "June screens the recovered reel to a silent street.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.featureSequence, "Act II - Midpoint Pressure (p41-p55)")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.featureObligation, "The midpoint must raise stakes, reveal a truth, or turn victory into a trap.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.featureMemoryBrief, "Characters: June, Marcus | Authoritative corrections: mother -> Eli's sister")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.actPressureState, "The midpoint victory turns into a trap.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.characterArcState, "June must trust someone with the truth.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.lastSceneOutcome, "June closed the blinds on Marcus.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.nextScenePlan, "Act II - Midpoint Pressure: June wins the reel and realizes the win is a trap.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.nextSceneMoves, ["Make the midpoint public.", "Let the emotional truth arrive before exposition."])
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.nextThreeTurns, [
            "The receipt becomes bait.",
            "Marcus tries to bury the reel.",
            "June chooses public exposure."
        ])
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.actThreePayoffPath, [
            "The missing cassette pays off in public.",
            "The recovered reel becomes testimony."
        ])
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.beatSequence, ["Receipt reveal", "Marcus lies badly"])
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.unresolvedSetups, ["The missing cassette has not paid off."])
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.unresolvedStoryThreads, ["Who erased the archive ledger?"])
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.characterArcTurns, ["June chooses trust over isolation."])
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.imageMotifs, ["recovered reel", "silent street"])
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.continuityNotes, ["Trust is turning into suspicion."])
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.pageCount, 47)
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.targetPages, 110)
        XCTAssertEqual(backend.capturedRequest?.includeCraftContext, true)
        XCTAssertEqual(backend.capturedRequest?.craftFrameworkId, "story-circle")
    }

    func testBuildModelPromptCanSendTaskHintWithoutEmbeddingUserInput() async {
        let backend = PromptBackendSpy(response: BackendScreenplayPromptBuildResponse(
            ok: true,
            action: "screenplay_prompt_build",
            schemaVersion: 1,
            source: "buildModelPrompt",
            prompt: "TASK ROUTED PROMPT",
            memoryApplied: false,
            sessionContextApplied: false,
            craftContextApplied: false,
            craftFrameworkId: "",
            screenplayTaskIntent: "continue_script",
            screenplayTaskLabel: "Continue Script"
        ))
        let builder = ScreenplayPromptBuilder()

        let result = await builder.buildModelPrompt(
            backend: backend,
            request: ScreenplayPromptBuilder.Request(
                persona: "LOCAL PERSONA",
                userInput: "",
                screenplayTaskHint: "Continue the diner scene.",
                isScreenplayMode: true,
                shouldWriteToPage: true
            )
        )

        XCTAssertEqual(result.screenplayTaskIntent, "continue_script")
        XCTAssertEqual(result.screenplayTaskLabel, "Continue Script")
        XCTAssertEqual(backend.capturedRequest?.userInput, "")
        XCTAssertEqual(backend.capturedRequest?.screenplayTaskHint, "Continue the diner scene.")
    }

    func testBuildModelPromptDisablesCraftContextWhenNotWritingToPage() async {
        let backend = PromptBackendSpy(response: BackendScreenplayPromptBuildResponse(
            ok: true,
            action: "screenplay_prompt_build",
            schemaVersion: 1,
            source: "buildModelPrompt",
            prompt: "COLLABORATION PROMPT",
            memoryApplied: false,
            sessionContextApplied: false,
            craftContextApplied: false,
            craftFrameworkId: ""
        ))
        let builder = ScreenplayPromptBuilder()

        _ = await builder.buildModelPrompt(
            backend: backend,
            request: ScreenplayPromptBuilder.Request(
                persona: "LOCAL PERSONA",
                isScreenplayMode: true,
                shouldWriteToPage: false,
                craftFrameworkId: "hero-journey"
            )
        )

        XCTAssertEqual(backend.capturedRequest?.includeCraftContext, false)
        XCTAssertEqual(backend.capturedRequest?.sessionContext, nil)
    }

    func testBuildModelPromptFallsBackToLocalPersonaWhenBackendFails() async {
        let backend = PromptBackendSpy(error: PromptBackendSpy.Error.offline)
        let builder = ScreenplayPromptBuilder()

        let result = await builder.buildModelPrompt(
            backend: backend,
            request: ScreenplayPromptBuilder.Request(
                persona: "LOCAL PERSONA",
                userInput: "Keep going.",
                act: "Act II",
                currentBeat: "Mara realizes the witness has been lying.",
                logline: "A court artist discovers every verdict has been staged.",
                themeArgument: "Justice begins when performance fails.",
                centralQuestion: "Can Mara draw the truth faster than the court can erase it?",
                protagonistWant: "Mara wants the original witness sketch.",
                protagonistNeed: "Mara needs to stop hiding behind observation.",
                antagonisticForce: "A judge who edits the public record.",
                endingImage: "Mara hangs the true sketch outside the courthouse.",
                featureSequence: "Act II - Reversal Fallout (p56-p70)",
                featureObligation: "The old tactic should stop working under public pressure.",
                featureMemoryBrief: "Characters: Mara | Authoritative corrections: mother -> Eli's sister",
                actPressureState: "Public pressure turns Mara's observation habit into a liability.",
                characterArcState: "Mara must act instead of hiding behind observation.",
                lastSceneOutcome: "Mara watched the witness collapse and did nothing.",
                nextScenePlan: "Act II - Reversal Fallout: Mara's observation habit fails in front of the court.",
                nextSceneMoves: ["Show the old tactic failing.", "Let the relationship cost sharpen the theme argument."],
                nextThreeTurns: [
                    "The judge corners Mara into silence.",
                    "The courthouse key becomes a moral test.",
                    "Mara chooses public risk over private proof."
                ],
                actThreePayoffPath: [
                    "The courthouse key opens the sealed evidence room.",
                    "The public sketch wall pays off in the final image."
                ],
                characterFocus: ["MARA", "JUDGE VALE"],
                unresolvedSetups: ["The courthouse key has not paid off."],
                unresolvedStoryThreads: ["Who has been editing the witness transcripts?"],
                characterArcTurns: ["Mara stops observing and intervenes."],
                imageMotifs: ["charcoal dust", "courthouse wall"],
                emotionalContinuity: "Mara is angry because observation finally cost someone else.",
                pageCount: 62,
                targetPages: 110,
                screenplayTaskHint: "Write the next ten pages of act two.",
                isScreenplayMode: true,
                shouldWriteToPage: true
            )
        )

        XCTAssertTrue(result.prompt.contains("LOCAL PERSONA"))
        XCTAssertTrue(result.prompt.contains("LOCAL FEATURE-FILM CONTINUITY FALLBACK"))
        XCTAssertTrue(result.prompt.contains("Act II: tests, reversals, midpoint truth"))
        XCTAssertTrue(result.prompt.contains("Act bridge ladder: Act I choice -> Act II pressure"))
        XCTAssertTrue(result.prompt.contains("Feature compass: before pages, silently lock act"))
        XCTAssertTrue(result.prompt.contains("Persistent character memory: Characters: Mara | Authoritative corrections: mother -> Eli's sister"))
        XCTAssertTrue(result.prompt.contains("Feature completion method: track current sequence, next three turns"))
        XCTAssertTrue(result.prompt.contains("Scene-to-feature loop: each scene must satisfy its local objective"))
        XCTAssertTrue(result.prompt.contains("Page batch discipline: for 5-15 page asks"))
        XCTAssertTrue(result.prompt.contains("Page-first delivery: if the request targets screenplay pages"))
        XCTAssertTrue(result.prompt.contains("Feature page sprint: for multi-page asks"))
        XCTAssertTrue(result.prompt.contains("Expert page engine: every scene needs objective, obstacle, pressure clock"))
        XCTAssertTrue(result.prompt.contains("Scene intelligence: silently know the scene job"))
        XCTAssertTrue(result.prompt.contains("Subtext engine: dialogue carries tactic"))
        XCTAssertTrue(result.prompt.contains("Image system: plant, echo, and transform visual motifs"))
        XCTAssertTrue(result.prompt.contains("Feature-scale output contract: launch pressure, complication, reversal, exit image"))
        XCTAssertTrue(result.prompt.contains("Page quality gate: no placeholder scenes"))
        XCTAssertTrue(result.prompt.contains("Carry one unresolved setup forward"))
        XCTAssertTrue(result.prompt.contains("write playable Fountain immediately"))
        XCTAssertTrue(result.prompt.contains("with no strategy preface"))
        XCTAssertFalse(result.prompt.contains("give one concise strategy note"))
        XCTAssertTrue(result.prompt.contains("Production format: present-tense action"))
        XCTAssertTrue(result.prompt.contains("For Act I -> Act II -> Act III requests"))
        XCTAssertTrue(result.prompt.contains("Active act: Act II"))
        XCTAssertTrue(result.prompt.contains("Requested page batch: 10 pages"))
        XCTAssertTrue(result.prompt.contains("Target act from request: Act II"))
        XCTAssertTrue(result.prompt.contains("Page-batch execution plan: write the next continuous run as playable Fountain"))
        XCTAssertTrue(result.prompt.contains("write toward the next structural obligation"))
        XCTAssertTrue(result.prompt.contains("Batch end condition: leave a decision, reveal, cost, or image"))
        XCTAssertTrue(result.prompt.contains("Estimated position: p62 / 110"))
        XCTAssertTrue(result.prompt.contains("Page target sizing: turn page count into a dramaturgical runway"))
        XCTAssertTrue(result.prompt.contains("Page target window: p63-p72 / 110"))
        XCTAssertTrue(result.prompt.contains("Start sequence: Act II - Reversal Fallout"))
        XCTAssertTrue(result.prompt.contains("End sequence: Act II - Collapse / All Is Lost"))
        XCTAssertTrue(result.prompt.contains("Sequence boundary rule: if the batch crosses into Act II - Collapse / All Is Lost"))
        XCTAssertTrue(result.prompt.contains("Scene-turn budget: 4 escalating turns"))
        XCTAssertTrue(result.prompt.contains("Story-state change floor: at least 5 visible leverage/reveal/cost/tactic shifts"))
        XCTAssertTrue(result.prompt.contains("Sizing rule: if model space is tight"))
        XCTAssertTrue(result.prompt.contains("Continuation quality floor: open from inherited emotional residue"))
        XCTAssertTrue(result.prompt.contains("Current beat: Mara realizes the witness has been lying."))
        XCTAssertTrue(result.prompt.contains("Feature logline: A court artist discovers every verdict has been staged."))
        XCTAssertTrue(result.prompt.contains("Theme argument: Justice begins when performance fails."))
        XCTAssertTrue(result.prompt.contains("Central dramatic question: Can Mara draw the truth faster than the court can erase it?"))
        XCTAssertTrue(result.prompt.contains("Protagonist engine: want=Mara wants the original witness sketch.; need=Mara needs to stop hiding behind observation."))
        XCTAssertTrue(result.prompt.contains("Antagonistic force: A judge who edits the public record."))
        XCTAssertTrue(result.prompt.contains("Ending image: Mara hangs the true sketch outside the courthouse."))
        XCTAssertTrue(result.prompt.contains("Active feature sequence: Act II - Reversal Fallout"))
        XCTAssertTrue(result.prompt.contains("Structural obligation due now: The old tactic should stop working"))
        XCTAssertTrue(result.prompt.contains("Act pressure state: Public pressure turns Mara's observation habit into a liability."))
        XCTAssertTrue(result.prompt.contains("Character arc pressure: Mara must act instead of hiding behind observation."))
        XCTAssertTrue(result.prompt.contains("Last scene outcome: Mara watched the witness collapse and did nothing."))
        XCTAssertTrue(result.prompt.contains("Next scene planner: Act II - Reversal Fallout"))
        XCTAssertTrue(result.prompt.contains("Emotional continuity: Mara is angry because observation finally cost someone else."))
        XCTAssertTrue(result.prompt.contains("Next scene moves: Show the old tactic failing. -> Let the relationship cost sharpen the theme argument."))
        XCTAssertTrue(result.prompt.contains("Next three turns: The judge corners Mara into silence. -> The courthouse key becomes a moral test. -> Mara chooses public risk over private proof."))
        XCTAssertTrue(result.prompt.contains("Beat-to-page continuation: spend the first next turn before inventing a new plot lane."))
        XCTAssertTrue(result.prompt.contains("Act III payoff path: The courthouse key opens the sealed evidence room.; The public sketch wall pays off in the final image."))
        XCTAssertTrue(result.prompt.contains("Next page moves: name the active structural obligation"))
        XCTAssertTrue(result.prompt.contains("Unresolved setups: The courthouse key has not paid off."))
        XCTAssertTrue(result.prompt.contains("Unresolved story threads: Who has been editing the witness transcripts?"))
        XCTAssertTrue(result.prompt.contains("Character arc turns: Mara stops observing and intervenes."))
        XCTAssertTrue(result.prompt.contains("Image motifs: charcoal dust; courthouse wall"))
        XCTAssertTrue(result.prompt.contains("Character focus: MARA; JUDGE VALE"))
        XCTAssertFalse(result.usedBackendAssembly)
        XCTAssertFalse(result.fallbackReason.isEmpty)
    }

    @MainActor
    func testSessionContinuitySnapshotDecodesRicherFeatureMemoryRestore() throws {
        let data = Data("""
        {
          "has_continuity": true,
          "source": "screenplay_project_memory",
          "opening_line": "Welcome back. Next move: Father names the lie.",
          "project_id": "rain-docket",
          "project_title": "Rain Docket",
          "act": "Act II",
          "feature_sequence": "Act II - Midpoint Pressure",
          "feature_obligation": "Turn victory into a trap that forces public action.",
          "scene_objective": "Mara must decide whether to make the affidavit public.",
          "scene_summary": "The father reveal corners Mara in the courthouse hallway.",
          "current_beat": "Mara realizes the forged testimony points at the judge.",
          "logline": "A court artist discovers every verdict has been staged.",
          "theme_argument": "Justice begins when performance fails.",
          "central_question": "Can Mara draw the truth faster than the court can erase it?",
          "protagonist_want": "Mara wants the sealed affidavit.",
          "protagonist_need": "Mara needs to stop hiding behind observation.",
          "antagonistic_force": "A judge who edits the public record.",
          "ending_image": "Mara hangs the true sketch outside the courthouse.",
          "act_pressure_state": "The midpoint trap must make private proof useless.",
          "character_arc_state": "Mara's control must fracture into public courage.",
          "last_scene_outcome": "The father reveal collapses Mara's private strategy.",
          "next_scene_plan": "Move into a private corridor confrontation.",
          "next_scene_moves": [
            "Force the affidavit into public view.",
            "Let the judge turn silence into a weapon."
          ],
          "next_three_turns": [
            "Father names the lie.",
            "Mara chooses public exposure.",
            "The sealed affidavit becomes dangerous."
          ],
          "act_three_payoff_path": [
            "The affidavit becomes courtroom testimony.",
            "The courthouse wall pays off as final image."
          ],
          "character_focus": ["Mara", "Father"],
          "unresolved_setups": ["The missing sketchbook", "The sealed affidavit"],
          "unresolved_story_threads": ["Who forged the testimony?", "Why did the father vanish?"],
          "character_arc_turns": ["Mara chooses public exposure over perfect proof."],
          "image_motifs": ["charcoal dust", "courthouse fluorescents"],
          "continuity_notes": ["Do not soften Mara's public humiliation."],
          "emotional_continuity": "Humiliation hardens into public courage.",
          "page_count": 47,
          "target_pages": 105,
          "memory_excerpt": "The sealed affidavit becomes dangerous.",
          "accepted_causal_facts": [
            {
              "kind": "irreversible_consequence",
              "fact": "Mara burns the only copy of the affidavit.",
              "source_scene_heading": "INT. ARCHIVE - NIGHT",
              "source_act": "Act II",
              "age_in_scenes": 8
            },
            {
              "kind": "relationship_change",
              "fact": "ELI: I choose the case over us.",
              "source_scene_heading": "INT. COURTHOUSE STEPS - DAY",
              "source_act": "Act II",
              "age_in_scenes": 3
            }
          ],
          "due_story_thread": {
            "kind": "payoff",
            "setup": "The red locket hidden in the courthouse clock.",
            "promised_payoff": "Mara uses the locket to expose who altered the verdict.",
            "source_scene_heading": "INT. COURTHOUSE CLOCK TOWER - NIGHT",
            "source_scene_summary": "Mara hides the locket before the bailiff enters.",
            "source_scene_outcome": "The locket survives the search.",
            "source_act": "Act II",
            "age_in_scenes": 17,
            "accepted_scene_count": 42
          },
          "is_correction": false,
          "updated_at": 950
        }
        """.utf8)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        let snapshot = try decoder.decode(BackendSessionContinuitySnapshot.self, from: data)

        XCTAssertTrue(snapshot.isMeaningful)
        XCTAssertEqual(snapshot.projectId, "rain-docket")
        XCTAssertEqual(snapshot.featureObligation, "Turn victory into a trap that forces public action.")
        XCTAssertEqual(snapshot.actPressureState, "The midpoint trap must make private proof useless.")
        XCTAssertEqual(snapshot.characterArcState, "Mara's control must fracture into public courage.")
        XCTAssertEqual(snapshot.nextSceneMoves, [
            "Force the affidavit into public view.",
            "Let the judge turn silence into a weapon."
        ])
        XCTAssertEqual(snapshot.nextThreeTurns, [
            "Father names the lie.",
            "Mara chooses public exposure.",
            "The sealed affidavit becomes dangerous."
        ])
        XCTAssertEqual(snapshot.actThreePayoffPath, [
            "The affidavit becomes courtroom testimony.",
            "The courthouse wall pays off as final image."
        ])
        XCTAssertEqual(snapshot.unresolvedStoryThreads, ["Who forged the testimony?", "Why did the father vanish?"])
        XCTAssertEqual(snapshot.characterArcTurns, ["Mara chooses public exposure over perfect proof."])
        XCTAssertEqual(snapshot.imageMotifs, ["charcoal dust", "courthouse fluorescents"])
        XCTAssertEqual(snapshot.pageCount, 47)
        XCTAssertEqual(snapshot.targetPages, 105)
        XCTAssertEqual(snapshot.acceptedCausalFacts.count, 2)
        XCTAssertEqual(snapshot.acceptedCausalFacts[0].kind, "irreversible_consequence")
        XCTAssertEqual(snapshot.acceptedCausalFacts[0].fact, "Mara burns the only copy of the affidavit.")
        XCTAssertEqual(snapshot.acceptedCausalFacts[0].sourceSceneHeading, "INT. ARCHIVE - NIGHT")
        XCTAssertEqual(snapshot.acceptedCausalFacts[0].ageInScenes, 8)
        XCTAssertEqual(snapshot.dueStoryThread?.kind, "payoff")
        XCTAssertEqual(snapshot.dueStoryThread?.setup, "The red locket hidden in the courthouse clock.")
        XCTAssertEqual(snapshot.dueStoryThread?.promisedPayoff, "Mara uses the locket to expose who altered the verdict.")
        XCTAssertEqual(snapshot.dueStoryThread?.sourceSceneHeading, "INT. COURTHOUSE CLOCK TOWER - NIGHT")
        XCTAssertEqual(snapshot.dueStoryThread?.ageInScenes, 17)
        XCTAssertEqual(snapshot.dueStoryThread?.acceptedSceneCount, 42)
        XCTAssertEqual(
            ScreenplayLiveDraftBridge.restoredContinuityNextMove(snapshot),
            "Move into a private corridor confrontation, while turning the red locket hidden in the courthouse clock into its promised payoff: Mara uses the locket to expose who altered the verdict; carry forward the accepted irreversible consequence: Mara burns the only copy of the affidavit, without resetting it"
        )
    }
}

private final class PromptBackendSpy: ScreenplayPromptBackendBuilding {
    enum Error: Swift.Error {
        case offline
    }

    private let response: BackendScreenplayPromptBuildResponse?
    private let error: Swift.Error?
    private(set) var capturedRequest: BackendScreenplayPromptBuildRequest?

    init(response: BackendScreenplayPromptBuildResponse? = nil, error: Swift.Error? = nil) {
        self.response = response
        self.error = error
    }

    func buildScreenplayModelPrompt(
        _ request: BackendScreenplayPromptBuildRequest
    ) async throws -> BackendScreenplayPromptBuildResponse {
        capturedRequest = request
        if let error {
            throw error
        }
        return response ?? BackendScreenplayPromptBuildResponse(
            ok: true,
            action: "screenplay_prompt_build",
            schemaVersion: 1,
            source: "buildModelPrompt",
            prompt: request.persona,
            memoryApplied: false,
            sessionContextApplied: false,
            craftContextApplied: false,
            craftFrameworkId: ""
        )
    }
}

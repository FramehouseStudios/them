import XCTest
import ScreenplayStudio
@testable import them

final class BackendClientCraftAPITests: XCTestCase {
    func testCharacterBibleMemoryDecodesAndBuildsCorrectionPayload() throws {
        let data = Data(#"""
        {
          "id": "character-mara",
          "key": "character:Mara",
          "title": "Mara Character Memory",
          "summary": "Want: expose the forged testimony",
          "reason": "Captured from screenplay character memory and corrections.",
          "emotional_tone": "guarded",
          "salience": 0.86,
          "confidence": 0.88,
          "remembered_at": 1800000000000,
          "last_used_at": 1800000000000,
          "quality_score": 0.84,
          "quality_hit_count": 0,
          "quality_correction_count": 1,
          "quality_last_feedback_at": 1800000000000,
          "staleness_days": 0,
          "staleness_band": "fresh",
          "editable": true,
          "snippets": ["Authoritative correction for Mara: sister, not mother."],
          "reference_hint": "public courage",
          "source": "character_bible",
          "character_bible": {
            "character": "Mara",
            "canon": ["Mara is Eli's sister."],
            "corrections": ["Authoritative correction for Mara: sister, not mother."],
            "corrected_terms": ["mother"],
            "correction_replacements": ["mother -> Eli's sister"],
            "arc": {
              "act": "Act II",
              "want": "expose the forged testimony",
              "need": "stop hiding behind observation",
              "false_belief": "truth will get Eli killed",
              "relationship_pressure": "with Eli: protecting him by lying",
              "current_tactic": "collecting evidence in silence",
              "next_emotional_turn": "public courage"
            },
            "voice": "guarded",
            "tags": ["protagonist"]
          }
        }
        """#.utf8)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        let card = try decoder.decode(BackendMemoryCard.self, from: data)
        let bible = try XCTUnwrap(card.characterBible)

        XCTAssertEqual(card.source, "character_bible")
        XCTAssertTrue(bible.isMeaningful)
        XCTAssertEqual(bible.character, "Mara")
        XCTAssertEqual(bible.arc?.falseBelief, "truth will get Eli killed")
        XCTAssertEqual(bible.arc?.nextEmotionalTurn, "public courage")

        let payload = bible.payload
        XCTAssertEqual(payload["character"] as? String, "Mara")
        XCTAssertEqual(payload["canon"] as? [String], ["Mara is Eli's sister."])
        XCTAssertEqual(payload["corrected_terms"] as? [String], ["mother"])
        let arcPayload = try XCTUnwrap(payload["arc"] as? [String: String])
        XCTAssertEqual(arcPayload["false_belief"], "truth will get Eli killed")
        XCTAssertEqual(arcPayload["next_emotional_turn"], "public courage")
    }

    func testScreenplayCharacterArcMemoryPayloadUsesBackendContractKeys() throws {
        let arc = BackendScreenplayCharacterArcMemory(
            character: "Mara",
            act: "Act II",
            want: "expose the forged testimony",
            need: "stop hiding behind observation",
            falseBelief: "truth destroys anyone who says it aloud",
            relationshipPressure: "Eli will be blamed if she stays silent",
            currentTactic: "collecting evidence in silence",
            nextEmotionalTurn: "public courage"
        )

        XCTAssertTrue(arc.isMeaningful)
        XCTAssertEqual(arc.payload["character"], "Mara")
        XCTAssertEqual(arc.payload["act"], "Act II")
        XCTAssertEqual(arc.payload["want"], "expose the forged testimony")
        XCTAssertEqual(arc.payload["need"], "stop hiding behind observation")
        XCTAssertEqual(arc.payload["false_belief"], "truth destroys anyone who says it aloud")
        XCTAssertEqual(arc.payload["relationship_pressure"], "Eli will be blamed if she stays silent")
        XCTAssertEqual(arc.payload["current_tactic"], "collecting evidence in silence")
        XCTAssertEqual(arc.payload["next_emotional_turn"], "public courage")

        let metadata = BackendStudioThreadCommitMetadata(
            screenplayProjectId: "",
            screenplayDocumentRevisionId: "",
            screenplayTarget: "",
            screenplayPromptSource: "",
            screenplayWriteId: "",
            screenplayAnchorLine: nil,
            screenplayAnchorEndLine: nil,
            screenplayInsertionMode: "",
            screenplayAnchorSceneLabel: "",
            screenplayAnchorDraftSceneId: "",
            screenplayAnchorOutlineSceneId: "",
            screenplayAnchorOutlineBeatIds: [],
            screenplayAnchorScriptNodeId: "",
            screenplayNoteTitle: "",
            screenplayNoteBody: "",
            screenplayInsertedText: "",
            screenplayReplacementApplied: false,
            screenplayReplacedWriteId: "",
            screenplayRevisedBlockText: "",
            screenplayResolvedAnchorExcerpt: "",
            screenplayCharacterArcMemory: arc
        )

        XCTAssertTrue(metadata.isMeaningful)
    }

    func testScreenplayCharacterVoiceMemoryPayloadUsesBackendContractKeys() throws {
        let voiceMemory = BackendScreenplayCharacterVoiceMemory(
            character: "Mara",
            voiceFingerprint: BackendScreenplayCharacterVoiceFingerprint(
                tactics: ["refuses first", "weaponizes facts"],
                silence: "cuts lines short and lets silence carry threat",
                emotionalTells: ["family pressure slips out"]
            )
        )

        XCTAssertTrue(voiceMemory.isMeaningful)
        XCTAssertEqual(voiceMemory.payload["character"] as? String, "Mara")
        let fingerprint = try XCTUnwrap(voiceMemory.payload["voice_fingerprint"] as? [String: Any])
        XCTAssertEqual(fingerprint["tactics"] as? [String], ["refuses first", "weaponizes facts"])
        XCTAssertEqual(fingerprint["silence"] as? String, "cuts lines short and lets silence carry threat")
        XCTAssertEqual(fingerprint["emotional_tells"] as? [String], ["family pressure slips out"])

        let metadata = BackendStudioThreadCommitMetadata(
            screenplayProjectId: "",
            screenplayDocumentRevisionId: "",
            screenplayTarget: "",
            screenplayPromptSource: "",
            screenplayWriteId: "",
            screenplayAnchorLine: nil,
            screenplayAnchorEndLine: nil,
            screenplayInsertionMode: "",
            screenplayAnchorSceneLabel: "",
            screenplayAnchorDraftSceneId: "",
            screenplayAnchorOutlineSceneId: "",
            screenplayAnchorOutlineBeatIds: [],
            screenplayAnchorScriptNodeId: "",
            screenplayNoteTitle: "",
            screenplayNoteBody: "",
            screenplayInsertedText: "",
            screenplayReplacementApplied: false,
            screenplayReplacedWriteId: "",
            screenplayRevisedBlockText: "",
            screenplayResolvedAnchorExcerpt: "",
            screenplayCharacterVoiceMemories: [voiceMemory]
        )

        XCTAssertTrue(metadata.isMeaningful)
    }

    func testStudioRenderSendsScreenplayCharacterArcMemory() async throws {
        let recorder = CraftRequestRecorder()
        let client = makeClient(recorder: recorder) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("GET", "/health"):
                return .json(#"{ "ok": true }"#)
            case ("POST", "/session"):
                return .json(#"{ "client_token": "client-test-token", "expires_in": 3600 }"#)
            case ("POST", "/realtime/studio_render"):
                return .json(#"""
                {
                  "ok": true,
                  "action": "studio_render",
                  "reply": "INT. ARCHIVE - NIGHT",
                  "screenplay_quality": {
                    "ok": true,
                    "reason": "ok",
                    "source": "initial",
                    "requested_pages": 1,
                    "attempted_repair": false,
                    "repair_outcome": "not_needed",
                    "initial_reason": null,
                    "repair_ms": 0,
                    "counts": { "scene_headings": 1, "action_lines": 1 }
                  }
                }
                """#)
            default:
                return .json(#"{ "error": "not_found" }"#, status: 404)
            }
        }
        let arc = BackendScreenplayCharacterArcMemory(
            character: "Mara",
            act: "Act II",
            want: "expose the forged testimony",
            need: "stop hiding behind observation",
            currentTactic: "collecting evidence in silence",
            nextEmotionalTurn: "public courage"
        )
        let voiceMemory = BackendScreenplayCharacterVoiceMemory(
            character: "Mara",
            voiceFingerprint: BackendScreenplayCharacterVoiceFingerprint(
                tactics: ["refuses first", "weaponizes facts"],
                silence: "cuts lines short and lets silence carry threat",
                emotionalTells: ["family pressure slips out"]
            )
        )
        var metadata = BackendStudioThreadCommitMetadata(
            screenplayProjectId: "project-1",
            screenplayDocumentRevisionId: "version-1",
            screenplayTarget: "page",
            screenplayPromptSource: "typed",
            screenplayWriteId: "",
            screenplayAnchorLine: nil,
            screenplayAnchorEndLine: nil,
            screenplayInsertionMode: "",
            screenplayAnchorSceneLabel: "",
            screenplayAnchorDraftSceneId: "",
            screenplayAnchorOutlineSceneId: "",
            screenplayAnchorOutlineBeatIds: [],
            screenplayAnchorScriptNodeId: "",
            screenplayNoteTitle: "",
            screenplayNoteBody: "",
            screenplayInsertedText: "",
            screenplayReplacementApplied: false,
            screenplayReplacedWriteId: "",
            screenplayRevisedBlockText: "",
            screenplayResolvedAnchorExcerpt: "",
            screenplayCharacterArcMemory: arc,
            screenplayCharacterVoiceMemories: [voiceMemory]
        )
        metadata.screenplayDraftExcerpt = "INT. ARCHIVE - NIGHT\n\nMara reaches the sealed locker."
        metadata.screenplayAct = "Act II"
        metadata.screenplaySceneObjective = "steal the sealed subpoena before the guard arrives"
        metadata.screenplayCurrentBeat = "Mara chooses public courage over control"
        metadata.screenplayFeatureSequence = "Courthouse trap"
        metadata.screenplayFeatureObligation = "turn the midpoint discovery into an irreversible commitment"
        metadata.screenplayLastSceneOutcome = "Eli learned Mara hid the original testimony"
        metadata.screenplayNextThreeTurns = [
            "Mara steals the subpoena",
            "Eli catches her",
            "the guard locks the archive"
        ]
        metadata.screenplayUnresolvedSetups = ["the red seal on the subpoena"]
        metadata.screenplayActThreePayoffPath = ["Mara reads the testimony in open court"]
        metadata.screenplayImageMotifs = ["red seal reflected in steel"]
        metadata.screenplayEmotionalContinuity = "Mara is ashamed, cornered, and done hiding"
        metadata.screenplayPageCount = 54
        metadata.screenplayTargetPages = 110

        let result = try await client.renderRealtimeStudioResult(
            transcript: "Continue the next page.",
            systemPrompt: "Return screenplay only.",
            screenplayTarget: "page",
            studioMetadata: metadata
        )

        XCTAssertEqual(result.reply, "INT. ARCHIVE - NIGHT")
        XCTAssertEqual(result.screenplayQuality?.ok, true)
        XCTAssertEqual(result.screenplayQuality?.repairOutcome, "not_needed")
        XCTAssertEqual(result.screenplayQuality?.counts["scene_headings"], 1)
        let renderRequest = try XCTUnwrap(recorder.requests.first { $0.path == "/realtime/studio_render" })
        XCTAssertEqual(renderRequest.bodyObject?["screenplay_target"] as? String, "page")
        XCTAssertEqual(renderRequest.bodyObject?["screenplay_project_id"] as? String, "project-1")
        XCTAssertEqual(renderRequest.bodyObject?["screenplay_document_revision_id"] as? String, "version-1")
        XCTAssertEqual(renderRequest.bodyObject?["screenplay_act"] as? String, "Act II")
        XCTAssertEqual(renderRequest.bodyObject?["screenplay_feature_sequence"] as? String, "Courthouse trap")
        XCTAssertEqual(
            renderRequest.bodyObject?["screenplay_feature_obligation"] as? String,
            "turn the midpoint discovery into an irreversible commitment"
        )
        XCTAssertEqual(
            renderRequest.bodyObject?["screenplay_next_three_turns"] as? [String],
            ["Mara steals the subpoena", "Eli catches her", "the guard locks the archive"]
        )
        XCTAssertEqual(
            renderRequest.bodyObject?["screenplay_unresolved_setups"] as? [String],
            ["the red seal on the subpoena"]
        )
        XCTAssertEqual(
            renderRequest.bodyObject?["screenplay_act_three_payoff_path"] as? [String],
            ["Mara reads the testimony in open court"]
        )
        XCTAssertEqual(renderRequest.bodyObject?["screenplay_page_count"] as? Int, 54)
        XCTAssertEqual(renderRequest.bodyObject?["screenplay_target_pages"] as? Int, 110)
        let arcBody = try XCTUnwrap(renderRequest.bodyObject?["screenplay_character_arc_memory"] as? [String: Any])
        XCTAssertEqual(arcBody["character"] as? String, "Mara")
        XCTAssertEqual(arcBody["want"] as? String, "expose the forged testimony")
        XCTAssertEqual(arcBody["need"] as? String, "stop hiding behind observation")
        XCTAssertEqual(arcBody["current_tactic"] as? String, "collecting evidence in silence")
        XCTAssertEqual(arcBody["next_emotional_turn"] as? String, "public courage")
        let voiceBodies = try XCTUnwrap(
            renderRequest.bodyObject?["screenplay_character_voice_memories"] as? [[String: Any]]
        )
        XCTAssertEqual(voiceBodies.count, 1)
        XCTAssertEqual(voiceBodies.first?["character"] as? String, "Mara")
        let voiceBody = try XCTUnwrap(voiceBodies.first?["voice_fingerprint"] as? [String: Any])
        XCTAssertEqual(voiceBody["tactics"] as? [String], ["refuses first", "weaponizes facts"])
        XCTAssertEqual(voiceBody["emotional_tells"] as? [String], ["family pressure slips out"])
    }

    func testStudioRenderQualityRejectionUsesTypedError() async throws {
        let client = makeClient(recorder: CraftRequestRecorder()) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("GET", "/health"):
                return .json(#"{ "ok": true }"#)
            case ("POST", "/session"):
                return .json(#"{ "client_token": "client-test-token", "expires_in": 3600 }"#)
            case ("POST", "/realtime/studio_render"):
                return .json(#"""
                {
                  "stage": "studio_render_quality",
                  "error": "Studio screenplay output did not pass the live quality gate (insufficient_action).",
                  "screenplay_quality": {
                    "ok": false,
                    "reason": "insufficient_action",
                    "source": "repair",
                    "requested_pages": 1,
                    "attempted_repair": true,
                    "repair_outcome": "rejected",
                    "initial_reason": "insufficient_action",
                    "repair_ms": 184,
                    "counts": { "scene_headings": 1, "action_lines": 0 }
                  }
                }
                """#, status: 502)
            default:
                return .json(#"{ "error": "not_found" }"#, status: 404)
            }
        }

        do {
            _ = try await client.renderRealtimeStudioResult(
                transcript: "Write the next page.",
                systemPrompt: "Return screenplay only.",
                screenplayTarget: "page"
            )
            XCTFail("Expected Studio quality rejection")
        } catch BackendError.studioRenderQuality(let quality, let message) {
            XCTAssertFalse(quality.ok)
            XCTAssertEqual(quality.reason, "insufficient_action")
            XCTAssertEqual(quality.repairOutcome, "rejected")
            XCTAssertEqual(quality.repairMs, 184)
            XCTAssertTrue(message.contains("live quality gate"))
            XCTAssertEqual(
                BackendError.studioRenderQuality(quality, message).localizedDescription,
                "Clementine held this page back because it did not pass the screenplay quality check. Your draft is unchanged."
            )
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testStudioRenderStreamReturnsOnlyAuthoritativeDoneReply() async throws {
        let client = makeClient(recorder: CraftRequestRecorder()) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("GET", "/health"):
                return .json(#"{ "ok": true }"#)
            case ("POST", "/session"):
                return .json(#"{ "client_token": "client-test-token", "expires_in": 3600 }"#)
            case ("POST", "/realtime/studio_render_stream"):
                return .sse(#"""
                event: delta
                data: {"delta":"INT. ARCHIVE - NIGHT"}

                event: done
                data: {"ok":true,"action":"studio_render_stream","kind":"done","reply":"INT. ARCHIVE - NIGHT\n\nMara opens the locker.","screenplay_quality":{"ok":true,"reason":"ok","source":"repair","requested_pages":1,"attempted_repair":true,"repair_outcome":"repaired","initial_reason":"insufficient_action","repair_ms":92,"counts":{"scene_headings":1,"action_lines":1}}}

                """#)
            default:
                return .json(#"{ "error": "not_found" }"#, status: 404)
            }
        }

        let result = try await client.streamRealtimeStudioResult(
            transcript: "Write the next page.",
            systemPrompt: "Return screenplay only.",
            screenplayTarget: "page"
        )

        XCTAssertEqual(result.reply, "INT. ARCHIVE - NIGHT\n\nMara opens the locker.")
        XCTAssertEqual(result.screenplayQuality?.repairOutcome, "repaired")
        XCTAssertEqual(result.screenplayQuality?.talkQuality.confidence, "repaired")
    }

    func testStudioRenderStreamRejectsProvisionalDeltaWhenQualityFails() async throws {
        let client = makeClient(recorder: CraftRequestRecorder()) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("GET", "/health"):
                return .json(#"{ "ok": true }"#)
            case ("POST", "/session"):
                return .json(#"{ "client_token": "client-test-token", "expires_in": 3600 }"#)
            case ("POST", "/realtime/studio_render_stream"):
                return .sse(#"""
                event: delta
                data: {"delta":"INT. ARCHIVE - NIGHT"}

                event: error
                data: {"stage":"studio_render_quality","error":"Studio screenplay output did not pass the live quality gate (insufficient_action).","screenplay_quality":{"ok":false,"reason":"insufficient_action","source":"repair","requested_pages":1,"attempted_repair":true,"repair_outcome":"rejected","initial_reason":"insufficient_action","repair_ms":101,"counts":{"scene_headings":1,"action_lines":0}}}

                """#)
            default:
                return .json(#"{ "error": "not_found" }"#, status: 404)
            }
        }

        do {
            _ = try await client.streamRealtimeStudioResult(
                transcript: "Write the next page.",
                systemPrompt: "Return screenplay only.",
                screenplayTarget: "page"
            )
            XCTFail("Expected provisional stream rejection")
        } catch BackendError.studioRenderQuality(let quality, _) {
            XCTAssertEqual(quality.repairOutcome, "rejected")
            XCTAssertFalse(quality.permitsSingleFallbackRender)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testStudioRenderStreamRejectsPageEOFWithoutDone() async throws {
        let client = makeClient(recorder: CraftRequestRecorder()) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("GET", "/health"):
                return .json(#"{ "ok": true }"#)
            case ("POST", "/session"):
                return .json(#"{ "client_token": "client-test-token", "expires_in": 3600 }"#)
            case ("POST", "/realtime/studio_render_stream"):
                return .sse(#"""
                event: delta
                data: {"delta":"INT. ARCHIVE - NIGHT\n\nMara reaches for the locker."}

                """#)
            default:
                return .json(#"{ "error": "not_found" }"#, status: 404)
            }
        }

        do {
            _ = try await client.streamRealtimeStudioResult(
                transcript: "Write the next page.",
                systemPrompt: "Return screenplay only.",
                screenplayTarget: "page"
            )
            XCTFail("Expected authoritative completion error")
        } catch BackendError.stage(let stage, let message) {
            XCTAssertEqual(stage, "studio_render")
            XCTAssertTrue(message.contains("authoritative quality confirmation"))
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testTalkTurnRateLimitNoticeParsesRetryAfterMsAndBannerCopy() throws {
        let notice = try XCTUnwrap(
            BackendTalkTurnMetaRateLimitNotice(
                turnId: "turn-7",
                statusCode: 429,
                data: Data(#"{ "error": "rate_limited", "retry_after_ms": 1250 }"#.utf8),
                retryAfterHeader: nil
            )
        )

        XCTAssertEqual(notice.turnId, "turn-7")
        XCTAssertEqual(notice.retryAfterMs, 1250)
        XCTAssertEqual(notice.retryDelayLabel, "2 seconds")
        XCTAssertEqual(
            notice.bannerText,
            "Saved the response. Extra turn details are cooling down; retry in 2 seconds."
        )
    }

    func testTalkTurnRateLimitNoticeFallsBackToRetryAfterHeader() throws {
        let notice = try XCTUnwrap(
            BackendTalkTurnMetaRateLimitNotice(
                turnId: " turn-8 ",
                statusCode: 429,
                data: Data(#"{ "error": "rate_limited" }"#.utf8),
                retryAfterHeader: "3"
            )
        )

        XCTAssertEqual(notice.turnId, "turn-8")
        XCTAssertEqual(notice.retryAfterMs, 3000)
        XCTAssertEqual(notice.retryDelayLabel, "3 seconds")
    }

    func testTalkTurnRateLimitNoticeIgnoresOtherErrors() {
        let notice = BackendTalkTurnMetaRateLimitNotice(
            turnId: "turn-9",
            statusCode: 500,
            data: Data(#"{ "error": "rate_limited", "retry_after_ms": 1000 }"#.utf8),
            retryAfterHeader: "1"
        )

        XCTAssertNil(notice)
    }

    func testFetchesCraftFrameworksAndSchemasWithVersionHeader() async throws {
        let recorder = CraftRequestRecorder()
        let client = makeClient(recorder: recorder) { request in
            switch request.url?.path {
            case "/craft/frameworks":
                return .json(#"""
                {
                  "schemaVersion": 1,
                  "frameworks": [
                    { "id": "save-the-cat", "title": "Save the Cat!", "version": "1.0" }
                  ]
                }
                """#)
            case "/craft/frameworks/save-the-cat":
                return .json(Self.frameworkJSON)
            case "/craft/schemas/report":
                return .json(#"{ "$schema": "http://json-schema.org/draft-07/schema#", "title": "Report" }"#)
            default:
                return .json(#"{ "error": "not_found" }"#, status: 404)
            }
        }

        let frameworks = try await client.fetchCraftFrameworks()
        let framework = try await client.fetchCraftFramework(id: "save-the-cat")
        let schema = try await client.fetchCraftReportSchema()

        XCTAssertEqual(frameworks.schemaVersion, 1)
        XCTAssertEqual(frameworks.frameworks.first?.id, "save-the-cat")
        XCTAssertEqual(framework.beats.count, 1)
        XCTAssertEqual(schema["title"]?.stringValue, "Report")
        XCTAssertEqual(recorder.paths, [
            "/craft/frameworks",
            "/craft/frameworks/save-the-cat",
            "/craft/schemas/report"
        ])
        XCTAssertTrue(recorder.allHeaders(named: "X-Craft-Schema-Version").allSatisfy { $0 == "1" })
    }

    func testAnalyzeReportAndSnapshotUseCamelCaseContract() async throws {
        let recorder = CraftRequestRecorder()
        let client = makeClient(recorder: recorder) { request in
            switch request.url?.path {
            case "/craft/analyze":
                return .json(Self.reportJSON)
            case "/craft/reports/proj-17/v1":
                return .json(Self.reportJSON)
            default:
                return .json(#"{ "error": "not_found" }"#, status: 404)
            }
        }

        let screenplay = ScreenplayCraftAnalysisScreenplay(
            title: "Vapor Trail",
            pageCount: 102,
            text: "INT. CAR - DUSK\n\nA radio sputters.",
            scenes: []
        )
        let analyzed = try await client.analyzeCraft(
            projectId: "proj-17",
            versionId: "v1",
            frameworkId: "save-the-cat",
            screenplay: screenplay
        )
        let fetched = try await client.fetchCraftReport(projectId: "proj-17", versionId: "v1")
        let snapshot = try await client.fetchCraftSnapshot(projectId: "proj-17", versionId: "v1")

        XCTAssertEqual(analyzed.framework.id, "save-the-cat")
        XCTAssertEqual(fetched.missingRequiredMajorTurns.map(\.turnId), ["all-is-lost"])
        XCTAssertEqual(snapshot?.id, "snap_proj17_v1")

        let analyzeBody = try XCTUnwrap(recorder.requests.first?.bodyObject)
        XCTAssertEqual(analyzeBody["projectId"] as? String, "proj-17")
        XCTAssertEqual(analyzeBody["versionId"] as? String, "v1")
        XCTAssertEqual(analyzeBody["frameworkId"] as? String, "save-the-cat")
        let screenplayBody = try XCTUnwrap(analyzeBody["screenplay"] as? [String: Any])
        XCTAssertEqual(screenplayBody["pageCount"] as? Int, 102)
    }

    func testOverrideMutationAndDeleteBuildExpectedRequests() async throws {
        let recorder = CraftRequestRecorder()
        let client = makeClient(recorder: recorder) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("POST", "/craft/overrides"):
                return .json(#"""
                {
                  "id": "override-1",
                  "turnId": "all-is-lost",
                  "action": "mark_false_positive",
                  "reason": "This is a dream beat, not the actual low point.",
                  "sceneId": "s040",
                  "page": 76,
                  "userId": "usr_test",
                  "createdAt": "2026-05-09T22:10:00Z"
                }
                """#)
            case ("DELETE", "/craft/overrides/override-1"):
                return .json(#"{ "ok": true }"#)
            default:
                return .json(#"{ "error": "not_found" }"#, status: 404)
            }
        }

        let override = try await client.recordCraftTurnOverride(ScreenplayCraftTurnOverrideMutation(
            turnId: "all-is-lost",
            action: "mark_false_positive",
            reason: "This is a dream beat, not the actual low point.",
            sceneId: "s040",
            page: 76,
            userId: "usr_test",
            expiresAt: nil
        ))
        let deleted = try await client.deleteCraftTurnOverride(id: "override-1")

        XCTAssertEqual(override.id, "override-1")
        XCTAssertTrue(deleted)
        XCTAssertEqual(recorder.methodsAndPaths, [
            "POST /craft/overrides",
            "DELETE /craft/overrides/override-1"
        ])
        XCTAssertEqual(recorder.requests.first?.bodyObject?["turnId"] as? String, "all-is-lost")
        XCTAssertEqual(recorder.requests.first?.bodyObject?["action"] as? String, "mark_false_positive")
    }

    func testFormatLintPostsTextAndFramework() async throws {
        let recorder = CraftRequestRecorder()
        let client = makeClient(recorder: recorder) { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/craft/format/lint")
            return .json(#"""
            {
              "schemaVersion": 1,
              "ruleSetVersion": "v1",
              "frameworkId": "save-the-cat",
              "totalSuggestions": 1,
              "bySeverity": { "hard": 1 },
              "suggestions": [
                {
                  "rule": "scene_heading_shape",
                  "severity": "hard",
                  "line": 1,
                  "range": [0, 17],
                  "excerpt": "INT KITCHEN NIGHT",
                  "message": "Scene heading does not start with a well-formed INT./EXT. prefix.",
                  "suggestion": "Use INT. <LOCATION> - <TIME>."
                }
              ]
            }
            """#)
        }
        let report = try await client.lintCraftFormat(
            text: "INT KITCHEN NIGHT\n\nJune waits.",
            frameworkId: "save-the-cat"
        )
        XCTAssertEqual(report.totalSuggestions, 1)
        XCTAssertEqual(report.suggestions.first?.severity, "hard")
        XCTAssertEqual(recorder.methodsAndPaths, ["POST /craft/format/lint"])
        XCTAssertEqual(recorder.allHeaders(named: "X-Craft-Schema-Version"), ["1"])
        let body = try XCTUnwrap(recorder.requests.first?.bodyObject)
        XCTAssertEqual(body["text"] as? String, "INT KITCHEN NIGHT\n\nJune waits.")
        XCTAssertEqual(body["frameworkId"] as? String, "save-the-cat")
    }

    func testLoglineEndpointsBuildExpectedRequests() async throws {
        let recorder = CraftRequestRecorder()
        let client = makeClient(recorder: recorder) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("POST", "/craft/logline/distill"):
                return .json(#"""
                {
                  "schemaVersion": 1,
                  "logline": "A pilot chases a vanished signal through a haunted airport.",
                  "source": "stub",
                  "distilledAt": "2026-05-10T21:00:00.000Z",
                  "stored": true
                }
                """#)
            case ("GET", "/craft/logline/drift"):
                XCTAssertEqual(request.url?.query?.contains("projectId=proj-17"), true)
                XCTAssertEqual(request.url?.query?.contains("currentLogline=A%20pilot"), true)
                return .json(#"""
                {
                  "schemaVersion": 1,
                  "score": 0.42,
                  "current": "A pilot chases a vanished signal through a haunted airport.",
                  "earliest": "A pilot searches for a missing tower voice.",
                  "historyCount": 2,
                  "summary": "Logline has drifted meaningfully from the original pitch."
                }
                """#)
            case ("GET", "/craft/logline/history"):
                XCTAssertEqual(request.url?.query, "projectId=proj-17")
                return .json(#"""
                {
                  "schemaVersion": 1,
                  "projectId": "proj-17",
                  "entries": [
                    {
                      "schemaVersion": 1,
                      "projectId": "proj-17",
                      "versionId": "v1",
                      "logline": "A pilot searches for a missing tower voice.",
                      "frameworkId": "save-the-cat",
                      "source": "stub",
                      "distilledAt": "2026-05-10T20:00:00.000Z",
                      "distilledAtMs": 1770000000000
                    }
                  ]
                }
                """#)
            default:
                return .json(#"{ "error": "not_found" }"#, status: 404)
            }
        }

        let distilled = try await client.distillCraftLogline(
            text: "INT. AIRPORT - NIGHT",
            projectId: "proj-17",
            versionId: "v1",
            frameworkId: "save-the-cat"
        )
        let drift = try await client.fetchCraftLoglineDrift(
            projectId: "proj-17",
            currentLogline: distilled.logline
        )
        let history = try await client.fetchCraftLoglineHistory(projectId: "proj-17")

        XCTAssertEqual(distilled.stored, true)
        XCTAssertEqual(drift.score, 0.42)
        XCTAssertEqual(history.entries.first?.logline, "A pilot searches for a missing tower voice.")
        XCTAssertEqual(recorder.methodsAndPaths, [
            "POST /craft/logline/distill",
            "GET /craft/logline/drift",
            "GET /craft/logline/history"
        ])
        XCTAssertEqual(recorder.allHeaders(named: "X-Craft-Schema-Version"), ["1", "1", "1"])
        let body = try XCTUnwrap(recorder.requests.first?.bodyObject)
        XCTAssertEqual(body["projectId"] as? String, "proj-17")
        XCTAssertEqual(body["versionId"] as? String, "v1")
        XCTAssertEqual(body["frameworkId"] as? String, "save-the-cat")
    }

    func testBlockSignalEndpointBuildsExpectedRequest() async throws {
        let recorder = CraftRequestRecorder()
        let client = makeClient(recorder: recorder) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("GET", "/memory/block-signal"):
                return .json(#"""
                {
                  "schemaVersion": 1,
                  "score": 0.625,
                  "level": "high",
                  "signals": [
                    { "key": "scene_completion_gap", "value": 1.0, "weight": 0.4 },
                    { "key": "attempt_completion_dropoff", "value": 1.0, "weight": 0.3 }
                  ],
                  "summary": "It's been a while since you finished a scene. Try a low-stakes warm-up.",
                  "habitsObserved": {
                    "last_scene_attempt_at": 1714752000000,
                    "last_scene_completion_at": null,
                    "last_talk_turn_at": 1714838400000,
                    "scenes_attempted": 8,
                    "scenes_completed": 1,
                    "recent_short_turns": 5
                  }
                }
                """#)
            default:
                return .json(#"{ "error": "not_found" }"#, status: 404)
            }
        }

        let signal = try await client.fetchMemoryBlockSignal()

        XCTAssertEqual(signal.level, .high)
        XCTAssertEqual(signal.score, 0.625)
        XCTAssertEqual(signal.signals.first?.key, "scene_completion_gap")
        XCTAssertEqual(signal.habitsObserved.scenesAttempted, 8)
        XCTAssertEqual(recorder.methodsAndPaths, ["GET /memory/block-signal"])
    }

    func testBlockSignalHistoryEndpointBuildsExpectedRequest() async throws {
        let recorder = CraftRequestRecorder()
        let client = makeClient(recorder: recorder) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("GET", "/memory/block-signal/history"):
                return .json(#"""
                {
                  "schemaVersion": 1,
                  "entries": [
                    { "at": 1000, "score": 0.1, "level": "low" },
                    { "at": 300000, "score": 0.5, "level": "medium" },
                    { "at": 600000, "score": 0.9, "level": "high" }
                  ],
                  "counts": {
                    "total": 3,
                    "byLevel": { "low": 1, "medium": 1, "high": 1 }
                  },
                  "newestAt": 600000,
                  "oldestAt": 1000
                }
                """#)
            default:
                return .json(#"{ "error": "not_found" }"#, status: 404)
            }
        }

        let history = try await client.fetchMemoryBlockSignalHistory()

        XCTAssertEqual(history.entries.count, 3)
        XCTAssertEqual(history.entries.last?.level, .high)
        XCTAssertEqual(history.counts.byLevel.medium, 1)
        XCTAssertEqual(history.newestAt, 600000)
        XCTAssertEqual(recorder.methodsAndPaths, ["GET /memory/block-signal/history"])
    }



    func testTwistSuggestPostsExpectedRequest() async throws {
        let recorder = CraftRequestRecorder()
        let client = makeClient(recorder: recorder) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("POST", "/craft/twist/suggest"):
                return .json(#"""
                {
                  "schemaVersion": 1,
                  "frameworkId": "save-the-cat",
                  "currentBeatId": "midpoint",
                  "source": "stub",
                  "twists": [
                    {
                      "id": "stc-midpoint-1",
                      "label": "False Victory",
                      "hook": "The win is real, but the cost was paid by the wrong person.",
                      "severity": "high",
                      "rationale": "Converts triumph into a trap."
                    }
                  ]
                }
                """#)
            default:
                return .json(#"{ "error": "not_found" }"#, status: 404)
            }
        }

        let response = try await client.suggestCraftTwists(
            frameworkId: "save-the-cat",
            currentBeatId: "midpoint",
            sceneSummary: "A false victory lands badly.",
            count: 2
        )

        XCTAssertEqual(response.twists.first?.id, "stc-midpoint-1")
        XCTAssertEqual(recorder.methodsAndPaths, ["POST /craft/twist/suggest"])
        let body = try XCTUnwrap(recorder.requests.first?.bodyObject)
        XCTAssertEqual(body["frameworkId"] as? String, "save-the-cat")
        XCTAssertEqual(body["currentBeatId"] as? String, "midpoint")
        XCTAssertEqual(body["sceneSummary"] as? String, "A false victory lands badly.")
        XCTAssertEqual(body["count"] as? Int, 2)
    }

    func testAcceptedTwistEndpointsBuildExpectedRequests() async throws {
        let recorder = CraftRequestRecorder()
        let client = makeClient(recorder: recorder) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("POST", "/craft/twist/accepted"):
                return .json(#"""
                {
                  "schemaVersion": 1,
                  "ok": true,
                  "action": "recorded",
                  "entry": {
                    "schemaVersion": 1,
                    "projectId": "proj-17",
                    "versionId": "v1",
                    "frameworkId": "save-the-cat",
                    "beatId": "midpoint",
                    "twist": {
                      "id": "stc-midpoint-1",
                      "label": "False Victory",
                      "hook": "The win is real, but the cost was paid by the wrong person.",
                      "severity": "high",
                      "rationale": "Converts triumph into a trap."
                    },
                    "acceptedAt": "2026-05-10T22:00:00.000Z",
                    "acceptedAtMs": 1770000000000,
                    "lastUpdatedAt": "2026-05-10T22:00:00.000Z",
                    "lastUpdatedAtMs": 1770000000000,
                    "userId": "usr_test",
                    "sceneId": "scene-1",
                    "note": "Keep this reversal."
                  }
                }
                """#)
            case ("GET", "/craft/twist/accepted"):
                XCTAssertEqual(request.url?.query, "projectId=proj-17")
                return .json(#"""
                {
                  "schemaVersion": 1,
                  "projectId": "proj-17",
                  "entries": []
                }
                """#)
            case ("DELETE", "/craft/twist/accepted/stc-midpoint-1"):
                XCTAssertEqual(request.url?.query?.contains("projectId=proj-17"), true)
                XCTAssertEqual(request.url?.query?.contains("versionId=v1"), true)
                return .json(#"""
                { "schemaVersion": 1, "ok": true, "action": "removed" }
                """#)
            default:
                return .json(#"{ "error": "not_found" }"#, status: 404)
            }
        }

        let twist = ScreenplayCraftTwistSuggestion(
            id: "stc-midpoint-1",
            label: "False Victory",
            hook: "The win is real, but the cost was paid by the wrong person.",
            severity: "high",
            rationale: "Converts triumph into a trap."
        )

        let recorded = try await client.recordAcceptedCraftTwist(
            projectId: "proj-17",
            versionId: "v1",
            frameworkId: "save-the-cat",
            beatId: "midpoint",
            twist: twist,
            sceneId: "scene-1",
            note: "Keep this reversal."
        )
        let fetched = try await client.fetchAcceptedCraftTwists(projectId: "proj-17")
        let deleted = try await client.deleteAcceptedCraftTwist(
            twistId: "stc-midpoint-1",
            projectId: "proj-17",
            versionId: "v1"
        )

        XCTAssertEqual(recorded.action, "recorded")
        XCTAssertEqual(recorded.entry.twist.id, "stc-midpoint-1")
        XCTAssertEqual(fetched.projectId, "proj-17")
        XCTAssertEqual(deleted.action, "removed")
        XCTAssertEqual(recorder.methodsAndPaths, [
            "POST /craft/twist/accepted",
            "GET /craft/twist/accepted",
            "DELETE /craft/twist/accepted/stc-midpoint-1"
        ])
        let body = try XCTUnwrap(recorder.requests.first?.bodyObject)
        XCTAssertEqual(body["projectId"] as? String, "proj-17")
        XCTAssertEqual(body["versionId"] as? String, "v1")
        XCTAssertEqual(body["frameworkId"] as? String, "save-the-cat")
        XCTAssertEqual(body["beatId"] as? String, "midpoint")
        XCTAssertEqual(body["sceneId"] as? String, "scene-1")
        XCTAssertEqual(body["note"] as? String, "Keep this reversal.")
        let bodyTwist = try XCTUnwrap(body["twist"] as? [String: Any])
        XCTAssertEqual(bodyTwist["id"] as? String, "stc-midpoint-1")
    }

    func testCharacterTraitsEndpointBuildsExpectedRequest() async throws {
        let recorder = CraftRequestRecorder()
        let client = makeClient(recorder: recorder) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("GET", "/memory/character-traits"):
                XCTAssertEqual(
                    request.url?.query,
                    "characterName=JUNE&projectId=rain-docket&projectTitle=Rain%20Docket"
                )
                return .json(#"""
                {
                  "schemaVersion": 1,
                  "userId": "usr_test",
                  "characters": [
                    {
                      "name": "JUNE",
                      "traits": {
                        "vocabulary": ["quiet room"],
                        "keywords": ["guarded", "wry"],
                        "speech_style": { "pace": "terse", "syntax": "fragmented" },
                        "emotional_default": "guarded",
                        "goals": ["Protect Leo"],
                        "relationships": { "LEO": "estranged brother" }
                      }
                    }
                  ]
                }
                """#)
            default:
                return .json(#"{ "error": "not_found" }"#, status: 404)
            }
        }

        let response = try await client.fetchMemoryCharacterTraits(
            characterName: " JUNE ",
            projectID: " rain-docket ",
            projectTitle: " Rain Docket "
        )

        XCTAssertEqual(response.schemaVersion, 1)
        XCTAssertEqual(response.characters.first?.name, "JUNE")
        XCTAssertEqual(response.characters.first?.traits?.speechStyle.pace, "terse")
        XCTAssertEqual(response.characters.first?.traits?.relationships["LEO"], "estranged brother")
        XCTAssertEqual(recorder.methodsAndPaths, ["GET /memory/character-traits"])
    }

    func testCharacterArchetypesEndpointBuildsExpectedRequest() async throws {
        let recorder = CraftRequestRecorder()
        let client = makeClient(recorder: recorder) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("GET", "/memory/character-archetypes"):
                return .json(#"""
                {
                  "schemaVersion": 1,
                  "userId": "usr_test",
                  "entries": [
                    {
                      "name": "JUNE",
                      "primary": { "archetype": "hero", "score": 0.81, "signals": ["traits:2"] },
                      "candidates": [],
                      "summary": "JUNE reads as hero."
                    }
                  ]
                }
                """#)
            default:
                return .json(#"{ "error": "not_found" }"#, status: 404)
            }
        }

        let response = try await client.fetchMemoryCharacterArchetypes()

        XCTAssertEqual(response.schemaVersion, 1)
        XCTAssertEqual(response.entries.first?.name, "JUNE")
        XCTAssertEqual(response.entries.first?.primary?.archetype, "hero")
        XCTAssertEqual(response.entries.first?.primary?.score, 0.81)
        XCTAssertEqual(recorder.methodsAndPaths, ["GET /memory/character-archetypes"])
    }

    func testRealtimeSupplierBodyOmitsServerDefaultAndIncludesExplicitProviders() throws {
        let serverDefault = BackendClient.realtimeClientSecretBody(
            systemPrompt: "  write in screenplay mode  ",
            userName: "  June  ",
            isScreenplayMode: true,
            voice: "  marin  ",
            model: "  gpt-realtime-1.5  ",
            realtimeProvider: ""
        )
        XCTAssertNil(serverDefault["realtime_provider"])
        XCTAssertEqual(serverDefault["system_prompt"] as? String, "write in screenplay mode")
        XCTAssertEqual(serverDefault["user_name"] as? String, "June")
        XCTAssertEqual(serverDefault["voice"] as? String, "marin")
        XCTAssertEqual(serverDefault["model"] as? String, "gpt-realtime-1.5")
        XCTAssertEqual(serverDefault["is_screenplay_mode"] as? Bool, true)

        let openAI = BackendClient.realtimeClientSecretBody(realtimeProvider: " openai ")
        let stub = BackendClient.realtimeClientSecretBody(realtimeProvider: " stub ")
        XCTAssertEqual(openAI["realtime_provider"] as? String, ClementineRealtimeSupplierMode.openAI.providerParameter)
        XCTAssertEqual(stub["realtime_provider"] as? String, ClementineRealtimeSupplierMode.stub.providerParameter)
    }

    func testRealtimeSupplierModeNormalizesStorageValues() throws {
        XCTAssertEqual(ClementineRealtimeSupplierMode.normalized(rawValue: "openai"), .openAI)
        XCTAssertEqual(ClementineRealtimeSupplierMode.normalized(rawValue: "stub"), .stub)
        XCTAssertEqual(ClementineRealtimeSupplierMode.normalized(rawValue: "unknown"), .serverDefault)
        XCTAssertEqual(ClementineRealtimeSupplierMode.serverDefault.providerParameter, "")
        XCTAssertEqual(ClementineRealtimeSupplierMode.openAI.providerParameter, "openai")
        XCTAssertEqual(ClementineRealtimeSupplierMode.stub.providerParameter, "stub")
    }

    func testRealtimeBootstrapPayloadDecodesProvider() throws {
        let data = Data(#"""
        {
          "transport": "webrtc_ephemeral",
          "realtime_provider": "stub",
          "fallback": true,
          "fallback_reason": "realtime_supplier_request_failed",
          "primary_supplier": "openai",
          "assistant_name": "io.them",
          "model": "stub-realtime-1",
          "voice": "stub-voice",
          "session": {
            "type": "realtime",
            "model": "stub-realtime-1",
            "voice": "stub-voice",
            "instructions": "Stay in screenplay mode.",
            "output_modalities": ["audio"]
          },
          "client_secret": {
            "value": "stub_secret_abc",
            "expires_at": 1800000000,
            "session_expires_at": 1800000000
          },
          "issued_at": 1700000000
        }
        """#.utf8)

        let payload = try JSONDecoder().decode(BackendRealtimeBootstrapPayload.self, from: data)
        XCTAssertEqual(payload.realtimeProvider, "stub")
        XCTAssertEqual(payload.fallback, true)
        XCTAssertEqual(payload.fallbackReason, "realtime_supplier_request_failed")
        XCTAssertEqual(payload.primarySupplier, "openai")
        XCTAssertEqual(payload.clientSecret.value, "stub_secret_abc")
        XCTAssertEqual(payload.session.outputModalities, ["audio"])
    }

    func testRealtimeBootstrapFallbackSummarySurfacesProviderSwitch() throws {
        let bootstrap = BackendRealtimeBootstrap(
            transport: "webrtc_ephemeral",
            realtimeProvider: "stub",
            fallback: true,
            fallbackReason: "realtime_supplier_request_failed",
            primarySupplier: "openai",
            assistantName: "io.them",
            model: "stub-realtime-1",
            voice: "stub-voice",
            session: BackendRealtimeSessionDescriptor(
                model: "stub-realtime-1",
                voice: "stub-voice",
                instructions: "Stay in screenplay mode.",
                type: "realtime",
                outputModalities: ["audio"]
            ),
            clientSecret: BackendRealtimeClientSecret(
                value: "stub_secret_abc",
                expiresAt: 1_800_000_000,
                sessionExpiresAt: 1_800_000_000
            ),
            issuedAt: 1_700_000_000
        )

        XCTAssertEqual(
            bootstrap.fallbackSummary,
            "Fallback from openai · to stub · realtime_supplier_request_failed"
        )
    }

    func testRealtimeDegradedErrorUsesTypedUnavailableEnvelope() async throws {
        let recorder = CraftRequestRecorder()
        let client = makeClient(recorder: recorder) { request in
            switch (request.httpMethod, request.url?.path) {
            case ("POST", "/session"):
                return .json(#"{ "client_token": "client-test-token", "expires_in": 3600 }"#)
            case ("POST", "/realtime/client_secret"):
                return .json(#"""
                {
                  "stage": "realtime_auth",
                  "code": "realtime_supplier_request_failed",
                  "realtime_provider": "openai",
                  "fallback": false,
                  "degraded": true,
                  "error": "OpenAI mint failed"
                }
                """#, status: 503)
            default:
                return .json(#"{ "error": "not_found" }"#, status: 404)
            }
        }

        do {
            _ = try await client.fetchRealtimeClientSecret(
                systemPrompt: "Stay cinematic.",
                userName: "June",
                isScreenplayMode: true,
                realtimeProvider: ClementineRealtimeSupplierMode.openAI.providerParameter
            )
            XCTFail("Expected realtime unavailable error")
        } catch BackendError.realtimeUnavailable(let unavailable) {
            XCTAssertEqual(unavailable.statusCode, 503)
            XCTAssertEqual(unavailable.stage, "realtime_auth")
            XCTAssertEqual(unavailable.code, "realtime_supplier_request_failed")
            XCTAssertEqual(unavailable.realtimeProvider, "openai")
            XCTAssertEqual(unavailable.fallback, false)
            XCTAssertEqual(unavailable.degraded, true)
            XCTAssertEqual(unavailable.message, "OpenAI mint failed")
            XCTAssertEqual(unavailable.userMessage, "Realtime preview is temporarily unavailable. Standard voice still works.")
        } catch {
            XCTFail("Unexpected error: \(error)")
        }

        XCTAssertTrue(recorder.methodsAndPaths.contains("POST /realtime/client_secret"))
        let realtimeBody = try XCTUnwrap(
            recorder.requests.first(where: { $0.path == "/realtime/client_secret" })?.bodyObject
        )
        XCTAssertEqual(realtimeBody["realtime_provider"] as? String, "openai")
        XCTAssertEqual(realtimeBody["system_prompt"] as? String, "Stay cinematic.")
        XCTAssertEqual(realtimeBody["is_screenplay_mode"] as? Bool, true)
    }

    func testCraftUnavailableErrorUsesTypedEnvelope() async throws {
        let client = makeClient(recorder: CraftRequestRecorder()) { _ in
            .json(#"{ "error": "craft_runtime_unavailable" }"#, status: 503)
        }

        do {
            _ = try await client.fetchCraftFramework(id: "missing")
            XCTFail("Expected craft error")
        } catch BackendError.stage(let stage, let message) {
            XCTAssertEqual(stage, "craft")
            XCTAssertEqual(message, "craft_runtime_unavailable")
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    private func makeClient(
        recorder: CraftRequestRecorder,
        handler: @escaping (URLRequest) throws -> CraftHTTPStub
    ) -> BackendClient {
        URLProtocol.registerClass(CraftURLProtocolStub.self)
        CraftURLProtocolStub.handler = { request in
            recorder.record(request)
            return try handler(request)
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [CraftURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let baseURL = URL(string: "https://craft.test")!
        return BackendClient(baseURL: baseURL, fallbackURL: baseURL, urlSession: session, persistBackendBaseURL: false, attachUserIDHeader: false)
    }

    private static let frameworkJSON = #"""
    {
      "id": "save-the-cat",
      "title": "Save the Cat!",
      "summary": "Feature beat sheet.",
      "version": "1.0",
      "requiredMajorTurnIds": ["catalyst"],
      "beats": [
        {
          "id": "catalyst",
          "label": "Catalyst",
          "summary": "Inciting incident.",
          "expectedPageRange": { "start": 12, "end": 12 },
          "required": true,
          "majorTurnId": "catalyst"
        }
      ]
    }
    """#

    private static let reportJSON = #"""
    {
      "id": "report_proj17_v1_drifting",
      "schemaVersion": 1,
      "projectId": "proj-17",
      "versionId": "v1",
      "screenplayTitle": "Vapor Trail",
      "generatedAt": "2026-05-09T18:15:00Z",
      "generatedBy": "craft-analysis-stub@1.0",
      "framework": { "id": "save-the-cat", "title": "Save the Cat!", "version": "1.0" },
      "pageCount": 102,
      "summary": "All Is Lost is missing.",
      "coverage": {
        "requiredMajorTurnCount": 1,
        "detectedMajorTurnCount": 0,
        "overriddenMajorTurnCount": 0,
        "missingMajorTurnCount": 1,
        "complete": false,
        "confidence": 0.74
      },
      "beatSheet": {
        "id": "beats_proj17_v1",
        "frameworkId": "save-the-cat",
        "title": "Save the Cat! - Vapor Trail",
        "beats": [
          {
            "id": "b_all_lost",
            "frameworkBeatId": "all-is-lost",
            "label": "All Is Lost",
            "expectedPageRange": { "start": 75, "end": 75 },
            "status": "missing",
            "confidence": 0.12,
            "classificationSource": "stub",
            "evidence": [],
            "majorTurnId": "all-is-lost"
          }
        ]
      },
      "majorTurns": [
        {
          "id": "mt_all_lost",
          "turnId": "all-is-lost",
          "label": "All Is Lost",
          "required": true,
          "expectedPage": 75,
          "expectedPageRange": { "start": 75, "end": 75 },
          "status": "missing",
          "detected": false,
          "confidence": 0.12,
          "evidence": []
        }
      ],
      "drift": {
        "status": "drifting",
        "summary": "All Is Lost is absent.",
        "timeline": [
          {
            "id": "td_all_lost",
            "turnId": "all-is-lost",
            "label": "All Is Lost",
            "expectedPage": 75,
            "status": "missing"
          }
        ]
      },
      "overrides": [],
      "snapshot": {
        "id": "snap_proj17_v1",
        "projectId": "proj-17",
        "versionId": "v1",
        "reportId": "report_proj17_v1_drifting",
        "frameworkId": "save-the-cat",
        "createdAt": "2026-05-09T18:16:00Z"
      }
    }
    """#
}

private struct CraftHTTPStub {
    let status: Int
    let body: Data
    let contentType: String

    static func json(_ raw: String, status: Int = 200) -> CraftHTTPStub {
        CraftHTTPStub(status: status, body: Data(raw.utf8), contentType: "application/json")
    }

    static func sse(_ raw: String, status: Int = 200) -> CraftHTTPStub {
        CraftHTTPStub(status: status, body: Data(raw.utf8), contentType: "text/event-stream")
    }
}

private final class CraftURLProtocolStub: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> CraftHTTPStub)?

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == "craft.test"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        do {
            let stub = try handler(request)
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: stub.status,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": stub.contentType]
            )!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: stub.body)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

private struct RecordedCraftRequest {
    let method: String
    let path: String
    let headers: [String: String]
    let bodyObject: [String: Any]?
}

private final class CraftRequestRecorder {
    private let lock = NSLock()
    private(set) var requests: [RecordedCraftRequest] = []

    var paths: [String] {
        lock.withLock { requests.map(\.path) }
    }

    var methodsAndPaths: [String] {
        lock.withLock { requests.map { "\($0.method) \($0.path)" } }
    }

    func allHeaders(named name: String) -> [String] {
        lock.withLock { requests.compactMap { $0.headers[name] } }
    }

    func record(_ request: URLRequest) {
        let bodyObject: [String: Any]? = {
            let data = request.httpBody ?? request.httpBodyStream?.readAllData()
            guard let data else { return nil }
            return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        }()
        let recorded = RecordedCraftRequest(
            method: request.httpMethod ?? "",
            path: request.url?.path ?? "",
            headers: request.allHTTPHeaderFields ?? [:],
            bodyObject: bodyObject
        )
        lock.withLock {
            requests.append(recorded)
        }
    }
}

private extension InputStream {
    func readAllData() -> Data {
        open()
        defer { close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while hasBytesAvailable {
            let count = read(&buffer, maxLength: buffer.count)
            if count > 0 {
                data.append(buffer, count: count)
            } else {
                break
            }
        }
        return data
    }
}

private extension NSLock {
    func withLock<T>(_ body: () -> T) -> T {
        lock()
        defer { unlock() }
        return body()
    }
}

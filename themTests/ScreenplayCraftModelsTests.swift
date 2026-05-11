import XCTest
import ScreenplayStudio
@testable import them

final class ScreenplayCraftModelsTests: XCTestCase {
    func testCraftReportDecodesBackendShapedPayload() throws {
        let report = try decodeReportFixture()

        XCTAssertEqual(report.schemaVersion, 1)
        XCTAssertEqual(report.id, "craft-report-1")
        XCTAssertEqual(report.framework.id, "save-the-cat")
        XCTAssertEqual(report.beatSheet.beats.count, 2)
        XCTAssertEqual(report.beatSheet.beats.first?.expectedPageRange?.start, 1)
        XCTAssertEqual(report.majorTurns.count, 2)
        XCTAssertEqual(report.missingRequiredMajorTurns.map(\.turnId), ["break-into-two"])
        XCTAssertTrue(report.hasReleaseBlockingMajorTurnGaps)
        XCTAssertEqual(report.drift.timeline.last?.status, "missing")
        XCTAssertEqual(report.overrides.first?.action, "mark_false_positive")
        XCTAssertEqual(report.snapshot?.versionId, "version-7")
    }

    func testCraftReportRoundTripsWithSnakeCaseKeys() throws {
        let report = try decodeReportFixture()
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.outputFormatting = [.sortedKeys]

        let encoded = try encoder.encode(report)
        let encodedString = try XCTUnwrap(String(data: encoded, encoding: .utf8))
        XCTAssertTrue(encodedString.contains("schema_version"))
        XCTAssertTrue(encodedString.contains("major_turns"))
        XCTAssertTrue(encodedString.contains("classification_source"))

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let decoded = try decoder.decode(ScreenplayCraftReport.self, from: encoded)
        XCTAssertEqual(decoded, report)
    }

    func testCraftFrameworkDefinitionDecodesRequiredTurns() throws {
        let data = Data(#"""
        {
          "id": "hero-journey",
          "title": "Hero Journey",
          "summary": "A mythic transformation framework.",
          "version": "2026.05",
          "required_major_turn_ids": ["call-to-adventure", "ordeal"],
          "beats": [
            {
              "id": "call",
              "label": "Call to Adventure",
              "summary": "The ordinary world is disrupted.",
              "expected_page_range": { "start": 8, "end": 15 },
              "required": true,
              "major_turn_id": "call-to-adventure"
            }
          ]
        }
        """#.utf8)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        let framework = try decoder.decode(ScreenplayCraftFramework.self, from: data)
        XCTAssertEqual(framework.requiredMajorTurnIds, ["call-to-adventure", "ordeal"])
        XCTAssertEqual(framework.beats.first?.majorTurnId, "call-to-adventure")
        XCTAssertTrue(framework.beats.first?.required == true)
    }

    func testFormatLintReportDecodesBackendEnvelope() throws {
        let data = Data(#"""
        {
          "schemaVersion": 1,
          "ruleSetVersion": "v1",
          "frameworkId": "save-the-cat",
          "totalSuggestions": 1,
          "bySeverity": { "hard": 1, "medium": 0, "soft": 0 },
          "suggestions": [
            {
              "rule": "scene_heading_shape",
              "severity": "hard",
              "line": 56,
              "range": [0, 17],
              "excerpt": "INT KITCHEN NIGHT",
              "message": "Scene heading does not start with a well-formed INT./EXT. prefix.",
              "suggestion": "Use INT. <LOCATION> - <TIME>."
            }
          ]
        }
        """#.utf8)

        let report = try JSONDecoder().decode(ScreenplayFormatLintReport.self, from: data)

        XCTAssertEqual(report.schemaVersion, 1)
        XCTAssertEqual(report.ruleSetVersion, "v1")
        XCTAssertEqual(report.frameworkId, "save-the-cat")
        XCTAssertEqual(report.bySeverity["hard"], 1)
        XCTAssertEqual(report.suggestions.first?.rule, "scene_heading_shape")
        XCTAssertEqual(report.suggestions.first?.range, [0, 17])
    }

    func testFormatLintCardsMapLineToPageAndSeverityOrder() throws {
        let report = ScreenplayFormatLintReport(
            schemaVersion: 1,
            ruleSetVersion: "v1",
            frameworkId: nil,
            totalSuggestions: 2,
            bySeverity: ["hard": 1, "soft": 1],
            suggestions: [
                ScreenplayFormatLintSuggestion(
                    rule: "action_adverb_density",
                    severity: "soft",
                    line: 56,
                    range: [50, 62],
                    excerpt: "She quickly, loudly runs.",
                    message: "Action line has dense adverbs.",
                    suggestion: "Cut the adverbs."
                ),
                ScreenplayFormatLintSuggestion(
                    rule: "character_cue_caps",
                    severity: "hard",
                    line: 56,
                    range: [70, 74],
                    excerpt: "June",
                    message: "Character cue should be uppercase.",
                    suggestion: "Use JUNE."
                )
            ]
        )

        let cards = ScreenplayFormatLintCard.cards(from: report, linesPerPage: 55)

        XCTAssertEqual(cards.map(\.rule), ["character_cue_caps", "action_adverb_density"])
        XCTAssertEqual(cards.first?.page, 2)
        XCTAssertEqual(cards.first?.anchorText, "p2 / l56")
        XCTAssertEqual(cards.first?.severityLabel, "HARD")
        XCTAssertEqual(cards.first?.ruleLabel, "Character Cue Caps")
    }

    func testLoglineResponsesDecodeBackendEnvelopes() throws {
        let distilled = try JSONDecoder().decode(ScreenplayCraftLoglineDistillResponse.self, from: Data(#"""
        {
          "schemaVersion": 1,
          "logline": "A pilot chases a vanished signal through a haunted airport.",
          "source": "stub",
          "distilledAt": "2026-05-10T21:00:00.000Z",
          "stored": true
        }
        """#.utf8))
        let drift = try JSONDecoder().decode(ScreenplayCraftLoglineDriftResponse.self, from: Data(#"""
        {
          "schemaVersion": 1,
          "score": 0.42,
          "current": "A pilot chases a vanished signal through a haunted airport.",
          "earliest": "A pilot searches for a missing tower voice.",
          "historyCount": 2,
          "summary": "Logline has drifted meaningfully from the original pitch."
        }
        """#.utf8))
        let history = try JSONDecoder().decode(ScreenplayCraftLoglineHistoryResponse.self, from: Data(#"""
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
        """#.utf8))

        XCTAssertEqual(distilled.logline, "A pilot chases a vanished signal through a haunted airport.")
        XCTAssertEqual(drift.historyCount, 2)
        XCTAssertEqual(history.entries.first?.frameworkId, "save-the-cat")
        XCTAssertEqual(history.entries.first?.id.contains("proj-17"), true)
    }

    func testLoglineRailStateMapsCurrentDriftAndHistory() throws {
        let state = ScreenplayCraftLoglineRailState.make(
            logline: ScreenplayCraftLoglineDistillResponse(
                schemaVersion: 1,
                logline: "  A pilot chases a vanished signal.  ",
                source: "stub",
                distilledAt: "2026-05-10T21:00:00.000Z",
                stored: true
            ),
            drift: ScreenplayCraftLoglineDriftResponse(
                schemaVersion: 1,
                score: 1.4,
                current: "A pilot chases a vanished signal.",
                earliest: "A pilot searches for a missing tower voice.",
                historyCount: 4,
                summary: "Logline has diverged sharply from the original pitch."
            ),
            history: [
                ScreenplayCraftLoglineEntry(
                    schemaVersion: 1,
                    projectId: "proj-17",
                    versionId: "v1",
                    logline: "First",
                    frameworkId: nil,
                    source: "stub",
                    distilledAt: "2026-05-10T20:00:00.000Z",
                    distilledAtMs: nil
                ),
                ScreenplayCraftLoglineEntry(
                    schemaVersion: 1,
                    projectId: "proj-17",
                    versionId: "v2",
                    logline: "Second",
                    frameworkId: nil,
                    source: "stub",
                    distilledAt: "2026-05-10T21:00:00.000Z",
                    distilledAtMs: nil
                )
            ]
        )

        XCTAssertEqual(state.currentLogline, "A pilot chases a vanished signal.")
        XCTAssertEqual(state.sourceLabel, "Stored · Stub")
        XCTAssertEqual(state.driftLabel, "Drift 100%")
        XCTAssertEqual(state.historyCountLabel, "4 saved")
        XCTAssertEqual(state.recentHistory, ["Second", "First"])
        XCTAssertTrue(state.hasCurrentLogline)
    }

    func testBlockSignalResponseDecodesBackendEnvelope() throws {
        let signal = try JSONDecoder().decode(BackendBlockSignalResponse.self, from: Data(#"""
        {
          "schemaVersion": 1,
          "score": 0.625,
          "level": "high",
          "signals": [
            { "key": "scene_completion_gap", "value": 1.0, "weight": 0.4 }
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
        """#.utf8))

        XCTAssertEqual(signal.schemaVersion, 1)
        XCTAssertEqual(signal.level, .high)
        XCTAssertEqual(signal.signals.first?.weight, 0.4)
        XCTAssertEqual(signal.habitsObserved.lastSceneCompletionAtMs, nil)
        XCTAssertEqual(signal.habitsObserved.recentShortTurns, 5)
    }

    func testBlockSignalNudgeStateMapsAndClampsSignal() throws {
        let state = BackendBlockSignalNudgeState.make(signal: BackendBlockSignalResponse(
            schemaVersion: 1,
            score: 1.4,
            level: .high,
            signals: [BackendBlockSignalComponent(key: "attempt_completion_dropoff", value: 1, weight: 0.3)],
            summary: "  Recent scenes are stalling before the finish.  ",
            habitsObserved: BackendBlockSignalHabitsObserved(
                lastSceneAttemptAtMs: 1714752000000,
                lastSceneCompletionAtMs: nil,
                lastTalkTurnAtMs: 1714838400000,
                scenesAttempted: 8,
                scenesCompleted: 1,
                recentShortTurns: 5
            ),
            error: nil
        ))

        XCTAssertTrue(state.shouldRender)
        XCTAssertEqual(state.title, "Momentum needs care")
        XCTAssertEqual(state.summary, "Recent scenes are stalling before the finish.")
        XCTAssertEqual(state.scoreLabel, "100%")
        XCTAssertEqual(state.topSignalLabel, "Started vs. finished")
        XCTAssertEqual(state.progress, 1)
    }



    func testTwistSuggestResponseDecodesBackendEnvelope() throws {
        let response = try JSONDecoder().decode(ScreenplayCraftTwistSuggestResponse.self, from: Data(#"""
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
        """#.utf8))

        XCTAssertEqual(response.frameworkId, "save-the-cat")
        XCTAssertEqual(response.currentBeatId, "midpoint")
        XCTAssertEqual(response.twists.first?.severity, "high")
    }

    func testAcceptedTwistResponsesDecodeBackendEnvelopes() throws {
        let recorded = try JSONDecoder().decode(ScreenplayCraftAcceptedTwistResponse.self, from: Data(#"""
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
              "hook": "The win becomes a trap.",
              "severity": "high",
              "rationale": "Turns success into pressure."
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
        """#.utf8))

        let list = try JSONDecoder().decode(ScreenplayCraftAcceptedTwistListResponse.self, from: Data(#"""
        {
          "schemaVersion": 1,
          "projectId": "proj-17",
          "entries": []
        }
        """#.utf8))

        let deleted = try JSONDecoder().decode(ScreenplayCraftAcceptedTwistDeleteResponse.self, from: Data(#"""
        { "schemaVersion": 1, "ok": true, "action": "removed" }
        """#.utf8))

        XCTAssertTrue(recorded.ok)
        XCTAssertEqual(recorded.action, "recorded")
        XCTAssertEqual(recorded.entry.id, "proj-17:v1:stc-midpoint-1")
        XCTAssertEqual(recorded.entry.twist.label, "False Victory")
        XCTAssertEqual(list.projectId, "proj-17")
        XCTAssertTrue(list.entries.isEmpty)
        XCTAssertEqual(deleted.action, "removed")
    }

    func testTwistCardStateMapsSeverityAndCopy() throws {
        let response = ScreenplayCraftTwistSuggestResponse(
            schemaVersion: 1,
            frameworkId: "save-the-cat",
            currentBeatId: "midpoint",
            source: "stub",
            twists: [
                ScreenplayCraftTwistSuggestion(
                    id: "stc-midpoint-1",
                    label: " False Victory ",
                    hook: " The win turns into a trap. ",
                    severity: "HIGH",
                    rationale: " Re-aims the third act. "
                )
            ]
        )

        let cards = ScreenplayCraftTwistCardState.cards(from: response)

        XCTAssertEqual(cards.count, 1)
        XCTAssertEqual(cards.first?.label, "False Victory")
        XCTAssertEqual(cards.first?.hook, "The win turns into a trap.")
        XCTAssertEqual(cards.first?.severity, "high")
        XCTAssertEqual(cards.first?.severityLabel, "High")
        XCTAssertEqual(cards.first?.rationale, "Re-aims the third act.")
        XCTAssertEqual(cards.first?.suggestion.id, "stc-midpoint-1")
        XCTAssertEqual(cards.first?.isAccepted, false)
    }

    func testCharacterTraitsResponseDecodesBackendEnvelope() throws {
        let response = try JSONDecoder().decode(BackendCharacterTraitsResponse.self, from: Data(#"""
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
            },
            { "name": "LEO", "traits": null }
          ]
        }
        """#.utf8))

        XCTAssertEqual(response.schemaVersion, 1)
        XCTAssertEqual(response.characters.count, 2)
        XCTAssertEqual(response.characters.first?.traits?.keywords, ["guarded", "wry"])
        XCTAssertEqual(response.characters.first?.traits?.speechStyle.syntax, "fragmented")
        XCTAssertEqual(response.characters.last?.traits, nil)
    }

    func testCharacterArchetypesResponseDecodesBackendEnvelope() throws {
        let response = try JSONDecoder().decode(BackendCharacterArchetypesResponse.self, from: Data(#"""
        {
          "schemaVersion": 1,
          "userId": "usr_test",
          "entries": [
            {
              "name": "JUNE",
              "primary": { "archetype": "hero", "score": 0.72, "signals": ["traits:2"] },
              "candidates": [
                { "archetype": "hero", "score": 0.72, "signals": ["traits:2"] },
                { "archetype": "ally", "score": 0.18, "signals": ["emotion:earnest"] }
              ],
              "summary": "JUNE reads as hero."
            }
          ]
        }
        """#.utf8))

        XCTAssertEqual(response.schemaVersion, 1)
        XCTAssertEqual(response.entries.count, 1)
        XCTAssertEqual(response.entries.first?.name, "JUNE")
        XCTAssertEqual(response.entries.first?.primary?.archetype, "hero")
        XCTAssertEqual(response.entries.first?.primary?.score, 0.72)
        XCTAssertEqual(response.entries.first?.candidates.last?.archetype, "ally")
    }

    func testCharacterTraitCardStateMapsVoiceInventory() throws {
        let response = BackendCharacterTraitsResponse(
            schemaVersion: 1,
            userId: "usr_test",
            characters: [
                BackendCharacterTraitRecord(
                    name: " JUNE ",
                    traits: BackendCharacterTraits(
                        vocabulary: ["quiet room", "tell me again"],
                        keywords: ["guarded", "wry"],
                        speechStyle: BackendCharacterSpeechStyle(pace: "terse", syntax: "fragmented"),
                        emotionalDefault: "guarded",
                        goals: ["Protect Leo"],
                        relationships: ["LEO": "estranged brother"]
                    )
                ),
                BackendCharacterTraitRecord(name: "LEO", traits: nil)
            ],
            error: nil
        )

        let cards = BackendCharacterTraitCardState.make(response: response)

        XCTAssertEqual(cards.count, 2)
        XCTAssertEqual(cards.first?.name, "JUNE")
        XCTAssertEqual(cards.first?.summary, "Default: guarded")
        XCTAssertEqual(cards.first?.chips, ["guarded", "wry", "terse", "fragmented"])
        XCTAssertEqual(cards.first?.detail, "2 phrases | 1 goal | 1 tie")
        XCTAssertTrue(cards.first?.hasTraits == true)
        XCTAssertEqual(cards.last?.summary, "Known character; voice inventory is still learning.")
    }

    func testCharacterTraitCardStateMapsArchetypeInsight() throws {
        let traits = BackendCharacterTraitsResponse(
            schemaVersion: 1,
            userId: "usr_test",
            characters: [
                BackendCharacterTraitRecord(
                    name: "JUNE",
                    traits: BackendCharacterTraits(keywords: ["earnest"], emotionalDefault: "earnest")
                )
            ],
            error: nil
        )
        let archetypes = BackendCharacterArchetypesResponse(
            schemaVersion: 1,
            userId: "usr_test",
            entries: [
                BackendCharacterArchetypeEntry(
                    name: " june ",
                    primary: BackendCharacterArchetypeCandidate(archetype: "threshold_guardian", score: 0.44),
                    summary: "JUNE reads as threshold_guardian with mixed secondary signals."
                )
            ],
            error: nil
        )

        let cards = BackendCharacterTraitCardState.make(response: traits, archetypes: archetypes)

        XCTAssertEqual(cards.first?.archetypeLabel, "Threshold Guardian")
        XCTAssertEqual(cards.first?.archetypeScoreLabel, "44%")
        XCTAssertEqual(cards.first?.archetypeSummary, "JUNE reads as threshold_guardian with mixed secondary signals.")
        XCTAssertEqual(cards.first?.hasArchetype, true)
    }

    private func decodeReportFixture() throws -> ScreenplayCraftReport {
        let data = Data(#"""
        {
          "id": "craft-report-1",
          "schema_version": 1,
          "project_id": "project-1",
          "version_id": "version-7",
          "screenplay_title": "The Orchard Signal",
          "generated_at": "2026-05-09T22:00:00Z",
          "generated_by": "backend-craft-v1",
          "framework": {
            "id": "save-the-cat",
            "title": "Save the Cat",
            "version": "2026.05"
          },
          "page_count": 92,
          "summary": "Major turn coverage is close, but Break Into Two is missing.",
          "coverage": {
            "required_major_turn_count": 2,
            "detected_major_turn_count": 1,
            "overridden_major_turn_count": 0,
            "missing_major_turn_count": 1,
            "complete": false,
            "confidence": 0.82
          },
          "beat_sheet": {
            "id": "beat-sheet-1",
            "framework_id": "save-the-cat",
            "title": "Save the Cat beat sheet",
            "beats": [
              {
                "id": "beat-opening-image",
                "framework_beat_id": "opening-image",
                "label": "Opening Image",
                "summary": "Mira records the orchard antenna in fog.",
                "expected_page_range": { "start": 1, "end": 3 },
                "actual_page_range": { "start": 1, "end": 2 },
                "scene_id": "scene-1",
                "scene_title": "Orchard dawn",
                "status": "on_target",
                "confidence": 0.94,
                "classification_source": "llm_schema",
                "major_turn_id": "opening-image",
                "evidence": [
                  {
                    "id": "evidence-1",
                    "scene_id": "scene-1",
                    "scene_title": "Orchard dawn",
                    "page": 1,
                    "line_start": 4,
                    "line_end": 9,
                    "excerpt": "Mira raises the receiver toward the static.",
                    "confidence": 0.91
                  }
                ]
              },
              {
                "id": "beat-break-two",
                "framework_beat_id": "break-into-two",
                "label": "Break Into Two",
                "summary": null,
                "expected_page_range": { "start": 23, "end": 28 },
                "actual_page_range": null,
                "scene_id": null,
                "scene_title": null,
                "status": "missing",
                "confidence": 0.31,
                "classification_source": "rule_and_llm",
                "major_turn_id": "break-into-two",
                "evidence": []
              }
            ]
          },
          "major_turns": [
            {
              "id": "turn-opening-image",
              "turn_id": "opening-image",
              "label": "Opening Image",
              "required": true,
              "expected_page": 1,
              "expected_page_range": { "start": 1, "end": 3 },
              "actual_page": 1,
              "actual_page_range": { "start": 1, "end": 2 },
              "scene_id": "scene-1",
              "scene_title": "Orchard dawn",
              "status": "on_target",
              "detected": true,
              "drift_pages": 0,
              "confidence": 0.94,
              "evidence": [
                {
                  "id": "turn-evidence-1",
                  "scene_id": "scene-1",
                  "scene_title": "Orchard dawn",
                  "page": 1,
                  "line_start": 4,
                  "line_end": 9,
                  "excerpt": "Mira raises the receiver toward the static.",
                  "confidence": 0.91
                }
              ],
              "override": null
            },
            {
              "id": "turn-break-two",
              "turn_id": "break-into-two",
              "label": "Break Into Two",
              "required": true,
              "expected_page": 25,
              "expected_page_range": { "start": 23, "end": 28 },
              "actual_page": null,
              "actual_page_range": null,
              "scene_id": null,
              "scene_title": null,
              "status": "missing",
              "detected": false,
              "drift_pages": null,
              "confidence": 0.31,
              "evidence": [],
              "override": null
            }
          ],
          "drift": {
            "status": "missing_required_turns",
            "summary": "One required major turn is absent.",
            "timeline": [
              {
                "id": "drift-opening-image",
                "turn_id": "opening-image",
                "label": "Opening Image",
                "expected_page": 1,
                "actual_page": 1,
                "drift_pages": 0,
                "status": "on_target"
              },
              {
                "id": "drift-break-two",
                "turn_id": "break-into-two",
                "label": "Break Into Two",
                "expected_page": 25,
                "actual_page": null,
                "drift_pages": null,
                "status": "missing"
              }
            ]
          },
          "overrides": [
            {
              "id": "override-1",
              "turn_id": "debate",
              "action": "mark_false_positive",
              "reason": "This scene is actually a B-story setup.",
              "scene_id": "scene-4",
              "page": 17,
              "user_id": "user-1",
              "created_at": "2026-05-09T22:10:00Z",
              "expires_at": null
            }
          ],
          "snapshot": {
            "id": "snapshot-1",
            "project_id": "project-1",
            "version_id": "version-7",
            "report_id": "craft-report-1",
            "framework_id": "save-the-cat",
            "created_at": "2026-05-09T22:11:00Z"
          }
        }
        """#.utf8)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(ScreenplayCraftReport.self, from: data)
    }
}

import XCTest
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

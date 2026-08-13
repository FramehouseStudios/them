import XCTest
@testable import them

final class BackendMemoryScreenplayExportTests: XCTestCase {
    override func tearDown() {
        ScreenplayExportURLProtocolStub.handler = nil
        UserDefaults.standard.removeObject(forKey: "client_token")
        UserDefaults.standard.removeObject(forKey: "user_id")
        super.tearDown()
    }

    func testMarkdownExportPostsMDFormatAndFallsBackToMDFilename() async throws {
        let recorder = ScreenplayExportRequestRecorder()
        ScreenplayExportURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
            case "/session":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "client_token": "client-test", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            case "/screenplay/export":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "text/markdown; charset=utf-8"],
                    body: Data("## INT. KITCHEN - NIGHT\n".utf8)
                )
            default:
                return ScreenplayExportHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ScreenplayExportURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://screenplay-export.test")!
        )

        let artifact = try await api.exportScreenplayDraft(
            draft: "INT. KITCHEN - NIGHT\n",
            title: "Kitchen Scene",
            format: "md",
            projectId: "proj-1",
            versionId: "version-1"
        )

        XCTAssertEqual(artifact.format, "md")
        XCTAssertEqual(artifact.filename, "screenplay.md")
        XCTAssertEqual(artifact.contentType, "text/markdown; charset=utf-8")
        XCTAssertEqual(String(data: artifact.data, encoding: .utf8), "## INT. KITCHEN - NIGHT\n")

        let exportRequest = try XCTUnwrap(recorder.requests.first { $0.path == "/screenplay/export" })
        XCTAssertEqual(exportRequest.method, "POST")
        XCTAssertEqual(exportRequest.bodyObject?["format"] as? String, "md")
        XCTAssertEqual(exportRequest.bodyObject?["project_id"] as? String, "proj-1")
        XCTAssertEqual(exportRequest.bodyObject?["version_id"] as? String, "version-1")
    }

    func testFDXExportUsesDedicatedBackendRouteAndReturnsFinalDraftArtifact() async throws {
        let recorder = ScreenplayExportRequestRecorder()
        ScreenplayExportURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
            case "/session":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "client_token": "client-test", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            case "/screenplay/export/fdx":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: [
                        "Content-Type": "application/xml; charset=utf-8",
                        "Content-Disposition": #"attachment; filename="Kitchen Scene.fdx""#,
                    ],
                    body: Data(#"<?xml version="1.0"?><FinalDraft><Content /></FinalDraft>"#.utf8)
                )
            default:
                return ScreenplayExportHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ScreenplayExportURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://screenplay-export.test")!
        )

        let artifact = try await api.exportScreenplayDraft(
            draft: """
            INT. KITCHEN - NIGHT

            Rain bruises the window.

            JUNE
            (quiet)
            We are still here.

            CUT TO:
            """,
            title: "Kitchen Scene",
            format: "fdx",
            projectId: "proj-1",
            versionId: "version-1"
        )

        XCTAssertEqual(artifact.format, "fdx")
        XCTAssertEqual(artifact.filename, "Kitchen Scene.fdx")
        XCTAssertEqual(artifact.contentType, "application/xml; charset=utf-8")
        XCTAssertTrue(String(data: artifact.data, encoding: .utf8)?.contains("<FinalDraft") == true)

        let exportRequest = try XCTUnwrap(recorder.requests.first { $0.path == "/screenplay/export/fdx" })
        XCTAssertEqual(exportRequest.method, "POST")
        XCTAssertEqual(exportRequest.acceptHeader, "application/xml")
        XCTAssertNil(exportRequest.bodyObject?["draft"])
        XCTAssertNil(exportRequest.bodyObject?["project_id"])
        XCTAssertNil(exportRequest.bodyObject?["version_id"])
        let title = try XCTUnwrap(exportRequest.bodyObject?["title"] as? [String: Any])
        XCTAssertEqual(title["title"] as? String, "Kitchen Scene")
        let scenes = try XCTUnwrap(exportRequest.bodyObject?["scenes"] as? [[String: Any]])
        XCTAssertEqual(scenes.first?["heading"] as? String, "INT. KITCHEN - NIGHT")
        let lines = try XCTUnwrap(scenes.first?["lines"] as? [[String: Any]])
        XCTAssertEqual(lines.first?["kind"] as? String, "action")
        XCTAssertEqual(lines.first?["text"] as? String, "Rain bruises the window.")
        let character = try XCTUnwrap(lines.first { ($0["kind"] as? String) == "character" })
        XCTAssertEqual(character["name"] as? String, "JUNE")
        XCTAssertEqual(character["parenthetical"] as? String, "(quiet)")
        XCTAssertEqual(character["dialogue"] as? [String], ["We are still here."])
        XCTAssertTrue(recorder.requests.allSatisfy { $0.path != "/screenplay/export" })
    }

    func testPDFExportRejectionSurfacesMessageAndAlternatives() async throws {
        ScreenplayExportURLProtocolStub.handler = { request in
            switch request.url?.path {
            case "/session":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "client_token": "client-test", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            case "/screenplay/export":
                return ScreenplayExportHTTPStub(
                    status: 400,
                    headers: ["Content-Type": "application/json"],
                    body: Data(
                        #"""
                        {
                          "stage": "screenplay_export",
                          "error": "pdf_export_not_supported_locally",
                          "message": "PDF export is not implemented on this backend.",
                          "alternative_formats": ["fountain", "fdx", "md"],
                          "docs_path": "/screenplay/export/formats"
                        }
                        """#.utf8
                    )
                )
            default:
                return ScreenplayExportHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ScreenplayExportURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://screenplay-export.test")!
        )

        do {
            _ = try await api.exportScreenplayDraft(
                draft: "INT. KITCHEN - NIGHT\n",
                title: "Kitchen Scene",
                format: "pdf"
            )
            XCTFail("Expected PDF export to surface backend rejection alternatives.")
        } catch BackendScreenplayExportError.rejected(let status, let payload) {
            XCTAssertEqual(status, 400)
            XCTAssertEqual(payload.error, "pdf_export_not_supported_locally")
            XCTAssertEqual(payload.alternativeFormats, ["fountain", "fdx", "md"])
            XCTAssertEqual(payload.docsPath, "/screenplay/export/formats")
            XCTAssertTrue(payload.alternativesSummary.contains("Fountain"))
            XCTAssertTrue(payload.alternativesSummary.contains("FDX"))
            XCTAssertTrue(payload.alternativesSummary.contains("Markdown"))
        }
    }

    func testFetchScreenplayExportFormatsDecodesExtensionField() async throws {
        let recorder = ScreenplayExportRequestRecorder()
        ScreenplayExportURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
            case "/session":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "client_token": "client-test", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            case "/screenplay/export/formats":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: [
                        "Content-Type": "application/json",
                        "Cache-Control": "no-store",
                    ],
                    body: Data(
                        #"""
                        {
                          "schemaVersion": 1,
                          "defaultFormat": "fountain",
                          "formats": [
                            {
                              "format": "md",
                              "extension": "md",
                              "mediaType": "text/markdown; charset=utf-8",
                              "description": "Markdown projection",
                              "supported": true
                            },
                            {
                              "format": "pdf",
                              "extension": "pdf",
                              "mediaType": "application/pdf",
                              "description": "Not supported locally",
                              "supported": false
                            }
                          ]
                        }
                        """#.utf8
                    )
                )
            default:
                return ScreenplayExportHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ScreenplayExportURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://screenplay-export.test")!
        )

        let response = try await api.fetchScreenplayExportFormats()

        XCTAssertEqual(response.schemaVersion, 1)
        XCTAssertEqual(response.defaultFormat, "fountain")
        XCTAssertEqual(response.formats.count, 2)
        XCTAssertEqual(response.formats.first?.format, "md")
        XCTAssertEqual(response.formats.first?.fileExtension, "md")
        XCTAssertEqual(response.formats.first?.mediaType, "text/markdown; charset=utf-8")
        XCTAssertEqual(response.formats.last?.supported, false)

        let formatsRequest = try XCTUnwrap(recorder.requests.first { $0.path == "/screenplay/export/formats" })
        XCTAssertEqual(formatsRequest.method, "GET")
        XCTAssertNil(formatsRequest.bodyObject)
    }

    func testPDFExportErrorDecodesMessageAndAlternativeFormats() async throws {
        ScreenplayExportURLProtocolStub.handler = { request in
            switch request.url?.path {
            case "/session":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "client_token": "client-test", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            case "/screenplay/export":
                return ScreenplayExportHTTPStub(
                    status: 400,
                    headers: ["Content-Type": "application/json"],
                    body: Data(
                        #"""
                        {
                          "stage": "screenplay_export",
                          "error": "pdf_export_not_supported_locally",
                          "message": "PDF export is not implemented on this backend.",
                          "alternative_formats": ["fountain", "fdx", "md"]
                        }
                        """#.utf8
                    )
                )
            default:
                return ScreenplayExportHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ScreenplayExportURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://screenplay-export.test")!
        )

        do {
            _ = try await api.exportScreenplayDraft(
                draft: "INT. KITCHEN - NIGHT\n",
                title: "Kitchen Scene",
                format: "pdf"
            )
            XCTFail("Expected PDF export to throw")
        } catch {
            let message = error.localizedDescription
            XCTAssertTrue(message.contains("PDF export is not implemented on this backend."))
            XCTAssertTrue(message.contains("Try Fountain, FDX, Markdown."))
        }
    }

    func testFountainImportPostsTextAndProjectsBackToEditableDraft() async throws {
        let recorder = ScreenplayExportRequestRecorder()
        ScreenplayExportURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
            case "/session":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "client_token": "client-test", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            case "/screenplay/import/fountain":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: [
                        "Content-Type": "application/json",
                        "Cache-Control": "no-store",
                    ],
                    body: Data(
                        #"""
                        {
                          "schemaVersion": 1,
                          "screenplay": {
                            "title": { "title": "io.them", "author": "Half Mutant Films" },
                            "scenes": [
                              {
                                "heading": "INT. KITCHEN - NIGHT",
                                "lines": [
                                  { "kind": "action", "text": "Rain bruises the window." },
                                  {
                                    "kind": "character",
                                    "name": "JUNE",
                                    "parenthetical": "quiet",
                                    "dialogue": ["We are still here."]
                                  },
                                  { "kind": "transition", "text": "CUT TO:" }
                                ]
                              }
                            ]
                          }
                        }
                        """#.utf8
                    )
                )
            default:
                return ScreenplayExportHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ScreenplayExportURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://screenplay-export.test")!
        )

        let response = try await api.importFountainDraft(
            text: "Title: io.them\n\nINT. KITCHEN - NIGHT\n\nJUNE\nWe are still here."
        )

        XCTAssertEqual(response.schemaVersion, 1)
        XCTAssertEqual(
            response.screenplay.fountainDraft,
            """
            Title: io.them
            Author: Half Mutant Films

            INT. KITCHEN - NIGHT

            Rain bruises the window.

            JUNE
            (quiet)
            We are still here.

            CUT TO:
            """
        )

        let importRequest = try XCTUnwrap(recorder.requests.first { $0.path == "/screenplay/import/fountain" })
        XCTAssertEqual(importRequest.method, "POST")
        XCTAssertEqual(importRequest.bodyObject?["text"] as? String, "Title: io.them\n\nINT. KITCHEN - NIGHT\n\nJUNE\nWe are still here.")
    }

    func testFetchOpsRoutesManifestDecodesDiagnosticGroups() async throws {
        let recorder = ScreenplayExportRequestRecorder()
        ScreenplayExportURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
            case "/ops/routes":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: [
                        "Content-Type": "application/json",
                        "Cache-Control": "no-store",
                    ],
                    body: Data(
                        #"""
                        {
                          "schemaVersion": 1,
                          "scope": "Curated subset of app-facing optional surfaces.",
                          "total": 3,
                          "routes": [
                            { "method": "GET", "path": "/memory/block-signal", "group": "creative-memory" },
                            { "method": "POST", "path": "/talk", "group": "talk-pipeline" },
                            { "method": "GET", "path": "/memory/block-signal/history", "group": "creative-memory" }
                          ]
                        }
                        """#.utf8
                    )
                )
            default:
                return ScreenplayExportHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ScreenplayExportURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://screenplay-export.test")!
        )

        let response = try await api.fetchOpsRoutesManifest()

        XCTAssertEqual(response.schemaVersion, 1)
        XCTAssertEqual(response.routeCountForDiagnostics, 3)
        XCTAssertEqual(response.routes.first?.id, "GET /memory/block-signal")
        XCTAssertEqual(response.groupNamesForDiagnostics, ["creative-memory", "talk-pipeline"])
        XCTAssertEqual(
            response.diagnosticsSummary,
            "3 routes across 2 groups: creative-memory 2, talk-pipeline 1"
        )

        let routesRequest = try XCTUnwrap(recorder.requests.first { $0.path == "/ops/routes" })
        XCTAssertEqual(routesRequest.method, "GET")
        XCTAssertNil(routesRequest.bodyObject)
        XCTAssertFalse(recorder.requests.contains { $0.path == "/session" })
    }

    func testStorySpineCorrectionPostsObservedStateVersion() async throws {
        let recorder = ScreenplayExportRequestRecorder()
        ScreenplayExportURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
            case "/session":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "client_token": "client-spine", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            case "/memories":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: [
                        "Content-Type": "application/json",
                        "X-State-Version": "state-spine-before",
                    ],
                    body: Data(
                        #"{ "source": "auth_user", "source_ip": "", "state_version": "state-spine-before", "memories": [], "conversation_samples": [] }"#.utf8
                    )
                )
            case "/memories/update":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: [
                        "Content-Type": "application/json",
                        "X-State-Version": "state-spine-after",
                    ],
                    body: Data(
                        #"{ "ok": true, "action": "update", "status": "updated", "state_version": "state-spine-after" }"#.utf8
                    )
                )
            default:
                return ScreenplayExportHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ScreenplayExportURLProtocolStub.self]
        let api = BackendMemoryAPI(
            session: URLSession(configuration: configuration),
            baseURL: URL(string: "https://screenplay-export.test")!
        )
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let storySpine = try decoder.decode(
            BackendStorySpineMemory.self,
            from: Data(
                #"{ "project_id": "split-ferries", "project_title": "Split Ferries", "next_scene_plan": "Mara returns for Eli before the last ferry leaves." }"#.utf8
            )
        )

        let result = try await api.updateMemoryCard(
            id: "screenplay-project-split-ferries",
            key: "split-ferries",
            title: "Split Ferries",
            summary: "Mara chooses to return.",
            reason: "Protect the writer's corrected Act II turn.",
            storySpine: storySpine
        )

        XCTAssertTrue(result.payload.ok)
        XCTAssertEqual(result.sync.stateVersion, "state-spine-after")
        let request = try XCTUnwrap(
            recorder.requests.first { $0.path == "/memories/update" }
        )
        XCTAssertEqual(
            request.bodyObject?["expected_state_version"] as? String,
            "state-spine-before"
        )
        let sentSpine = try XCTUnwrap(request.bodyObject?["story_spine"] as? [String: Any])
        XCTAssertEqual(
            sentSpine["next_scene_plan"] as? String,
            "Mara returns for Eli before the last ferry leaves."
        )
    }

    func testStoryMovePreferenceCorrectionPostsProjectScopeAndDecodesRefreshedProfile() async throws {
        let recorder = ScreenplayExportRequestRecorder()
        ScreenplayExportURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
            case "/session":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "client_token": "client-test", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            case "/memories/story-preferences/update":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: [
                        "Content-Type": "application/json",
                        "X-State-Version": "state-preference-2",
                    ],
                    body: Data(
                        #"""
                        {
                          "ok": true,
                          "action": "story_move_preference",
                          "status": "prefer",
                          "creative_memory_revision": "cm_after_preference",
                          "story_move_preferences": [
                            {
                              "project_id": "split-ferries",
                              "project_title": "Split Ferries",
                              "family": "relationship_pressure",
                              "display_name": "Relationship pressure",
                              "summary": "make plot movement damage, redefine, or test a bond",
                              "learned_score": -1,
                              "effective_score": 10,
                              "evidence_count": 3,
                              "selected_count": 1,
                              "passed_over_count": 2,
                              "accepted_page_count": 1,
                              "block_resolution_count": 1,
                              "successful_rescue_count": 1,
                              "failed_rescue_count": 0,
                              "explicit_stance": "prefer",
                              "corrected_at": 5000,
                              "updated_at": 5000
                            }
                          ],
                          "state_version": "state-preference-2",
                          "memory_updated_at": 5000
                        }
                        """#.utf8
                    )
                )
            case "/memories":
                return ScreenplayExportHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(
                        #"""
                        {
                          "source": "auth_user",
                          "source_ip": "",
                          "creative_memory_revision": "cm_before_preference",
                          "story_move_preferences": [
                            {
                              "project_id": "split-ferries",
                              "project_title": "Split Ferries",
                              "family": "relationship_pressure",
                              "display_name": "Relationship pressure",
                              "summary": "make plot movement damage, redefine, or test a bond",
                              "learned_score": -1,
                              "effective_score": 10,
                              "evidence_count": 3,
                              "selected_count": 1,
                              "passed_over_count": 2,
                              "accepted_page_count": 1,
                              "block_resolution_count": 1,
                              "explicit_stance": "prefer",
                              "corrected_at": 5000,
                              "updated_at": 5000
                            }
                          ],
                          "memories": [],
                          "conversation_samples": []
                        }
                        """#.utf8
                    )
                )
            default:
                return ScreenplayExportHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ScreenplayExportURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://screenplay-export.test")!
        )

        let result = try await api.updateStoryMovePreference(
            projectID: "split-ferries",
            projectTitle: "Split Ferries",
            family: "relationship_pressure",
            action: "prefer"
        )

        let preference = try XCTUnwrap(result.payload.storyMovePreferences?.first)
        XCTAssertEqual(preference.family, "relationship_pressure")
        XCTAssertEqual(preference.explicitStance, "prefer")
        XCTAssertEqual(preference.effectiveScore, 10)
        XCTAssertEqual(preference.successfulRescueCount, 1)
        XCTAssertEqual(preference.failedRescueCount, 0)
        XCTAssertTrue(preference.isExplicitlyCorrected)
        let request = try XCTUnwrap(
            recorder.requests.first { $0.path == "/memories/story-preferences/update" }
        )
        XCTAssertEqual(request.method, "POST")
        XCTAssertEqual(request.bodyObject?["project_id"] as? String, "split-ferries")
        XCTAssertEqual(request.bodyObject?["family"] as? String, "relationship_pressure")
        XCTAssertEqual(request.bodyObject?["action"] as? String, "prefer")
        XCTAssertEqual(
            request.bodyObject?["expected_creative_memory_revision"] as? String,
            "cm_before_preference"
        )

        let scoped = try await api.fetchMemories(
            limit: 1,
            storyPreferenceProjectID: "split-ferries",
            storyPreferenceProjectTitle: "Ignored because the ID is authoritative"
        )
        XCTAssertEqual(scoped.payload.storyMovePreferences?.map(\.projectId), ["split-ferries"])
        let scopedRequest = try XCTUnwrap(
            recorder.requests.last { $0.path == "/memories" }
        )
        XCTAssertEqual(
            scopedRequest.queryItems["story_preference_project_id"],
            "split-ferries"
        )
        XCTAssertNil(scopedRequest.queryItems["story_preference_project_title"])
    }
}

private struct ScreenplayExportHTTPStub {
    let status: Int
    let headers: [String: String]
    let body: Data
}

private final class ScreenplayExportURLProtocolStub: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> ScreenplayExportHTTPStub)?

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == "screenplay-export.test"
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
                headerFields: stub.headers
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

private struct RecordedScreenplayExportRequest {
    let method: String
    let path: String
    let queryItems: [String: String]
    let acceptHeader: String?
    let bodyObject: [String: Any]?
}

private final class ScreenplayExportRequestRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private(set) var requests: [RecordedScreenplayExportRequest] = []

    func record(_ request: URLRequest) {
        let bodyObject: [String: Any]?
        if let body = Self.bodyData(from: request),
           let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any] {
            bodyObject = object
        } else {
            bodyObject = nil
        }

        let record = RecordedScreenplayExportRequest(
            method: request.httpMethod ?? "",
            path: request.url?.path ?? "",
            queryItems: Dictionary(
                uniqueKeysWithValues: (URLComponents(
                    url: request.url ?? URL(fileURLWithPath: "/"),
                    resolvingAgainstBaseURL: false
                )?.queryItems ?? []).compactMap { item in
                    guard let value = item.value else { return nil }
                    return (item.name, value)
                }
            ),
            acceptHeader: request.value(forHTTPHeaderField: "Accept"),
            bodyObject: bodyObject
        )
        lock.lock()
        requests.append(record)
        lock.unlock()
    }

    private static func bodyData(from request: URLRequest) -> Data? {
        if let body = request.httpBody {
            return body
        }
        guard let stream = request.httpBodyStream else {
            return nil
        }
        stream.open()
        defer { stream.close() }

        var data = Data()
        let bufferSize = 1024
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
        defer { buffer.deallocate() }

        while true {
            let read = stream.read(buffer, maxLength: bufferSize)
            if read > 0 {
                data.append(buffer, count: read)
            } else if read == 0 {
                break
            } else {
                return nil
            }
        }
        return data.isEmpty ? nil : data
    }
}

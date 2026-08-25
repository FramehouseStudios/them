import XCTest
@testable import them

final class BackendAccountDataControlsTests: XCTestCase {
    override func setUp() {
        super.setUp()
        BackendAuthClient.clearSharedClientToken()
        BackendAuthClient.clearSharedUserID()
        UserDefaults.standard.removeObject(forKey: "client_token")
        UserDefaults.standard.removeObject(forKey: "client_token_expiry")
        UserDefaults.standard.removeObject(forKey: "client_token_cached_at")
        UserDefaults.standard.removeObject(forKey: "client_token_base_url")
        UserDefaults.standard.removeObject(forKey: "user_id")
        UserDefaults.standard.removeObject(forKey: "auth_debug_access_token_enabled")
        UserDefaults.standard.removeObject(forKey: "auth_debug_access_token")
        UserDefaults.standard.removeObject(forKey: "auth_debug_refresh_token")
    }

    override func tearDown() {
        AccountDataControlsURLProtocolStub.handler = nil
        BackendAuthClient.clearSharedClientToken()
        BackendAuthClient.clearSharedUserID()
        UserDefaults.standard.removeObject(forKey: "client_token")
        UserDefaults.standard.removeObject(forKey: "client_token_expiry")
        UserDefaults.standard.removeObject(forKey: "client_token_cached_at")
        UserDefaults.standard.removeObject(forKey: "client_token_base_url")
        UserDefaults.standard.removeObject(forKey: "user_id")
        UserDefaults.standard.removeObject(forKey: "auth_debug_access_token_enabled")
        UserDefaults.standard.removeObject(forKey: "auth_debug_access_token")
        UserDefaults.standard.removeObject(forKey: "auth_debug_refresh_token")
        super.tearDown()
    }

    func testExportAccountDataDownloadsBackendAccountArchive() async throws {
        let recorder = AccountDataControlsRequestRecorder()
        AccountDataControlsURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
            case "/session":
                return AccountDataControlsHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "client_token": "client-test", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            case "/account/export":
                return AccountDataControlsHTTPStub(
                    status: 200,
                    headers: [
                        "Content-Type": "application/json; charset=utf-8",
                        "Content-Disposition": #"attachment; filename="io-them-export-user-1.json""#,
                    ],
                    body: Data(#"{ "schema": "io.them.account_export.v1", "domains": { "screenplay": [] } }"#.utf8)
                )
            default:
                return AccountDataControlsHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AccountDataControlsURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://account-data-controls.test")!
        )

        let artifact = try await api.exportAccountData()

        XCTAssertEqual(artifact.filename, "io-them-export-user-1.json")
        XCTAssertEqual(artifact.contentType, "application/json; charset=utf-8")
        XCTAssertTrue(String(data: artifact.data, encoding: .utf8)?.contains("account_export") == true)
        let exportRequest = try XCTUnwrap(recorder.requests.first { $0.path == "/account/export" })
        XCTAssertEqual(exportRequest.method, "GET")
        XCTAssertEqual(exportRequest.acceptHeader, "application/json")
    }

    func testRequestAccountDeletionSendsDeleteToAccountRoute() async throws {
        let recorder = AccountDataControlsRequestRecorder()
        AccountDataControlsURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
            case "/session":
                return AccountDataControlsHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "client_token": "client-test", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            case "/account":
                return AccountDataControlsHTTPStub(
                    status: 202,
                    headers: ["Content-Type": "application/json"],
                    body: Data(
                        #"""
                        {
                          "status": "pending_deletion",
                          "pending_deletion_at": "2026-05-23T12:00:00.000Z",
                          "hard_delete_at": "2026-05-30T12:00:00.000Z",
                          "recovery_window_days": 7
                        }
                        """#.utf8
                    )
                )
            default:
                return AccountDataControlsHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AccountDataControlsURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://account-data-controls.test")!
        )

        let response = try await api.requestAccountDeletion(reason: "Leaving")

        XCTAssertEqual(response.status, "pending_deletion")
        XCTAssertEqual(response.hardDeleteAt, "2026-05-30T12:00:00.000Z")
        XCTAssertEqual(response.recoveryWindowDays, 7)

        let accountRequest = try XCTUnwrap(recorder.requests.first { $0.path == "/account" })
        XCTAssertEqual(accountRequest.method, "DELETE")
        XCTAssertEqual(accountRequest.bodyObject?["reason"] as? String, "Leaving")
    }

    func testBootstrapSessionCoalescesConcurrentInFlightRequests() async throws {
        BackendAuthClient.clearSharedClientToken()
        let recorder = AccountDataControlsRequestRecorder()
        AccountDataControlsURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
            case "/session":
                Thread.sleep(forTimeInterval: 0.05)
                return AccountDataControlsHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "client_token": "client-coalesced", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            default:
                return AccountDataControlsHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AccountDataControlsURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://account-data-controls.test")!
        )

        let tokens = try await withThrowingTaskGroup(of: String.self) { group in
            for _ in 0..<6 {
                group.addTask {
                    try await api.bootstrapSession().clientToken
                }
            }
            var values: [String] = []
            for try await value in group {
                values.append(value)
            }
            return values
        }

        XCTAssertEqual(Set(tokens), ["client-coalesced"])
        XCTAssertEqual(recorder.requests.filter { $0.path == "/session" }.count, 1)
        XCTAssertNotNil(BackendAuthClient.sharedClientTokenExpiry())
        XCTAssertNotNil(BackendAuthClient.sharedClientTokenCachedAt())
    }

    func testBootstrapSessionReusesRecentlyPersistedSharedTokenAcrossAPIInstances() async throws {
        BackendAuthClient.clearSharedClientToken()
        let recorder = AccountDataControlsRequestRecorder()
        AccountDataControlsURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
            case "/session":
                return AccountDataControlsHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "client_token": "client-shared", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            default:
                return AccountDataControlsHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AccountDataControlsURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let firstAPI = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://account-data-controls.test")!
        )
        let secondAPI = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://account-data-controls.test")!
        )

        let first = try await firstAPI.bootstrapSession()
        let second = try await secondAPI.bootstrapSession()

        XCTAssertEqual(first.clientToken, "client-shared")
        XCTAssertEqual(second.clientToken, "client-shared")
        XCTAssertEqual(recorder.requests.filter { $0.path == "/session" }.count, 1)
    }

    func testProjectCollaborationRequestsCanUseClientTokenOwnerWithoutAccountIdentityAfterTokenRotation() async throws {
        BackendAuthClient.clearSharedClientToken()
        BackendAuthClient.clearSharedUserID()
        let baseURL = "https://account-data-controls.test"
        let expiry = ISO8601DateFormatter().string(from: Date().addingTimeInterval(3600))
        _ = BackendAuthClient.persistSharedClientToken(
            "client-rotated",
            expiryRaw: expiry,
            baseURLRaw: baseURL
        )
        _ = BackendAuthClient.persistSharedUserID("usr-auth")
        UserDefaults.standard.set("client-rotated", forKey: "client_token")
        UserDefaults.standard.set(expiry, forKey: "client_token_expiry")
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "client_token_cached_at")
        UserDefaults.standard.set(baseURL, forKey: "client_token_base_url")
        UserDefaults.standard.set("usr-auth", forKey: "user_id")
        UserDefaults.standard.set(true, forKey: "auth_debug_access_token_enabled")
        UserDefaults.standard.set("access-test", forKey: "auth_debug_access_token")
        let projectOwnerClientToken = "client-owner"

        let recorder = AccountDataControlsRequestRecorder()
        AccountDataControlsURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
            case "/screenplay/projects/project-1/collaborators":
                return AccountDataControlsHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(
                        #"""
                        {
                          "stage": "screenplay_collaborators",
                          "status": "ok",
                          "project_id": "project-1",
                          "collaborator_count": 0,
                          "approved_emails": [],
                          "collaborators": []
                        }
                        """#.utf8
                    )
                )
            case "/screenplay/projects/project-1/comments":
                return AccountDataControlsHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(
                        #"""
                        {
                          "stage": "screenplay_comments",
                          "status": "ok",
                          "project_id": "project-1",
                          "comment_count": 0,
                          "comments": []
                        }
                        """#.utf8
                    )
                )
            default:
                return AccountDataControlsHTTPStub(
                    status: 500,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "unexpected_route" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AccountDataControlsURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: baseURL)!
        )

        _ = try await api.fetchScreenplayCollaborators(
            projectId: "project-1",
            includeUserIdentity: false,
            includeAuthToken: false,
            clientTokenOverride: projectOwnerClientToken
        )
        _ = try await api.fetchScreenplayComments(
            projectId: "project-1",
            limit: 160,
            includeUserIdentity: false,
            includeAuthToken: false,
            clientTokenOverride: projectOwnerClientToken
        )
        _ = try await api.upsertScreenplayCollaborator(
            projectId: "project-1",
            email: "writer@example.com",
            includeUserIdentity: false,
            includeAuthToken: false,
            clientTokenOverride: projectOwnerClientToken
        )
        _ = try await api.upsertScreenplayComment(
            projectId: "project-1",
            text: "Tighten the reveal.",
            includeUserIdentity: false,
            includeAuthToken: false,
            clientTokenOverride: projectOwnerClientToken
        )

        let projectRequests = recorder.requests.filter {
            $0.path.hasPrefix("/screenplay/projects/project-1/")
        }
        XCTAssertEqual(projectRequests.count, 4)
        XCTAssertEqual(recorder.requests.filter { $0.path == "/session" }.count, 0)
        for request in projectRequests {
            XCTAssertEqual(request.clientTokenHeader, "client-owner")
            XCTAssertNil(request.userIDHeader)
            XCTAssertNil(request.authorizationHeader)
        }
        let collaboratorWrite = try XCTUnwrap(projectRequests.first {
            $0.method == "POST" && $0.path.hasSuffix("/collaborators")
        })
        XCTAssertEqual(collaboratorWrite.bodyObject?["email"] as? String, "writer@example.com")
        let commentWrite = try XCTUnwrap(projectRequests.first {
            $0.method == "POST" && $0.path.hasSuffix("/comments")
        })
        XCTAssertEqual(commentWrite.bodyObject?["text"] as? String, "Tighten the reveal.")
    }

    func testResolveCanonCorrectionSendsAllSelectedFactsAtomically() async throws {
        let recorder = AccountDataControlsRequestRecorder()
        AccountDataControlsURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
            case "/session":
                return AccountDataControlsHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "client_token": "client-canon", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            case "/memories":
                return AccountDataControlsHTTPStub(
                    status: 200,
                    headers: [
                        "Content-Type": "application/json",
                        "X-State-Version": "state-canon-1",
                        "X-Creative-Memory-Revision": "cm_canon_before",
                    ],
                    body: Data(
                        #"{ "source": "auth_user", "source_ip": "", "state_version": "state-canon-1", "creative_memory_revision": "cm_canon_before", "memories": [], "conversation_samples": [] }"#.utf8
                    )
                )
            case "/memories/corrections/resolve":
                return AccountDataControlsHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(
                        #"""
                        {
                          "ok": true,
                          "action": "resolve_correction",
                          "status": "resolved",
                          "message": null,
                          "creative_memory_revision": "cm_canon_after",
                          "correction_ambiguity": {
                            "id": "ambiguity-1",
                            "status": "resolved",
                            "project_id": "split-ferries",
                            "project_title": "Split Ferries",
                            "correction_text": "Mara goes back for both of them.",
                            "candidate_facts": [
                              "Mara hid the letter beneath the floorboards.",
                              "Jonah believes Mara burned the letter."
                            ],
                            "correction_memory_id": "episode-ambiguity-1",
                            "selected_fact": "Mara hid the letter beneath the floorboards.",
                            "selected_facts": [
                              "Mara hid the letter beneath the floorboards.",
                              "Jonah believes Mara burned the letter."
                            ],
                            "receipt_id": "canon-correction-1",
                            "created_at": 1800000000000,
                            "resolved_at": 1800000001000
                          },
                          "correction_receipt": {
                            "id": "canon-correction-1",
                            "status": "active",
                            "project_id": "split-ferries",
                            "project_title": "Split Ferries",
                            "correction_text": "Mara goes back for both of them.",
                            "matched_facts": [
                              "Mara hid the letter beneath the floorboards.",
                              "Jonah believes Mara burned the letter."
                            ],
                            "replacement_facts": ["Mara returns for both of them."],
                            "replacement_fact_ids": ["writer-canon-1"],
                            "structured_updates": ["Mara.want: save Eli and Jonah"],
                            "correction_memory_id": "episode-correction-1",
                            "created_at": 1800000001000,
                            "undone_at": null
                          },
                          "session_id": "session-canon-1",
                          "state_version": "state-canon-2",
                          "last_turn_id": "turn-canon-1",
                          "last_updated_at": 1800000001000,
                          "history_updated_at": 1800000001000,
                          "memory_updated_at": 1800000001000,
                          "backend_boot_id": "boot-canon-1",
                          "schema_version": 1,
                          "backend_build": "test-build"
                        }
                        """#.utf8
                    )
                )
            default:
                return AccountDataControlsHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AccountDataControlsURLProtocolStub.self]
        let session = URLSession(configuration: configuration)
        let api = BackendMemoryAPI(
            session: session,
            baseURL: URL(string: "https://account-data-controls.test")!
        )
        let selectedFacts = [
            "Mara hid the letter beneath the floorboards.",
            "Jonah believes Mara burned the letter.",
        ]

        let result = try await api.resolveCanonCorrection(
            ambiguityID: "ambiguity-1",
            selectedFacts: selectedFacts
        )

        XCTAssertTrue(result.payload.ok)
        XCTAssertEqual(result.payload.status, "resolved")
        XCTAssertEqual(result.payload.correctionAmbiguity?.resolvedFacts, selectedFacts)
        XCTAssertEqual(result.payload.correctionReceipt?.matchedFacts, selectedFacts)
        XCTAssertEqual(result.payload.correctionReceipt?.replacementFacts, ["Mara returns for both of them."])
        XCTAssertEqual(result.payload.schemaVersion, 1)
        XCTAssertEqual(result.payload.stateVersion, "state-canon-2")
        let request = try XCTUnwrap(
            recorder.requests.first { $0.path == "/memories/corrections/resolve" }
        )
        XCTAssertEqual(request.method, "POST")
        XCTAssertEqual(request.bodyObject?["ambiguity_id"] as? String, "ambiguity-1")
        XCTAssertEqual(request.bodyObject?["selected_facts"] as? [String], selectedFacts)
        XCTAssertEqual(
            request.bodyObject?["expected_creative_memory_revision"] as? String,
            "cm_canon_before"
        )
        XCTAssertNil(request.bodyObject?["selected_fact"])
    }

    func testResolveCanonCorrectionRejectsHTMLSuccessAsBackendUnavailable() async throws {
        AccountDataControlsURLProtocolStub.handler = { request in
            switch request.url?.path {
            case "/session":
                return AccountDataControlsHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "client_token": "client-canon", "expires_in": 3600, "remembered_names": [] }"#.utf8)
                )
            case "/memories":
                return AccountDataControlsHTTPStub(
                    status: 200,
                    headers: [
                        "Content-Type": "application/json",
                        "X-State-Version": "state-canon-html",
                        "X-Creative-Memory-Revision": "cm_canon_html",
                    ],
                    body: Data(
                        #"{ "source": "auth_user", "source_ip": "", "state_version": "state-canon-html", "creative_memory_revision": "cm_canon_html", "memories": [], "conversation_samples": [] }"#.utf8
                    )
                )
            case "/memories/corrections/resolve":
                return AccountDataControlsHTTPStub(
                    status: 200,
                    headers: ["Content-Type": "text/html"],
                    body: Data("<!doctype html><html><body>parked domain</body></html>".utf8)
                )
            default:
                return AccountDataControlsHTTPStub(
                    status: 404,
                    headers: ["Content-Type": "application/json"],
                    body: Data(#"{ "error": "not_found" }"#.utf8)
                )
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AccountDataControlsURLProtocolStub.self]
        let api = BackendMemoryAPI(
            session: URLSession(configuration: configuration),
            baseURL: URL(string: "https://account-data-controls.test")!
        )

        do {
            _ = try await api.resolveCanonCorrection(
                ambiguityID: "ambiguity-1",
                selectedFacts: ["Mara abandons Eli at the east ferry dock."]
            )
            XCTFail("Expected a non-JSON API response to be rejected")
        } catch let error as BackendMemoryAPIError {
            XCTAssertEqual(
                error.errorDescription,
                "Backend error 502: Backend service unavailable. Please try again."
            )
        }
    }

    @MainActor
    func testBackendHealthRejectsHTMLSuccessPage() async throws {
        AccountDataControlsURLProtocolStub.handler = { request in
            XCTAssertEqual(request.url?.path, "/health")
            return AccountDataControlsHTTPStub(
                status: 200,
                headers: ["Content-Type": "text/html"],
                body: Data("<!doctype html><html><body>parked domain</body></html>".utf8)
            )
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AccountDataControlsURLProtocolStub.self]
        let baseURL = URL(string: "https://account-data-controls.test")!
        let client = BackendClient(
            baseURL: baseURL,
            fallbackURL: baseURL,
            urlSession: URLSession(configuration: configuration),
            persistBackendBaseURL: false,
            attachUserIDHeader: false
        )

        do {
            _ = try await client.health()
            XCTFail("Expected an HTML page to fail the backend health check")
        } catch let error as BackendError {
            XCTAssertEqual(error.errorDescription, "HTTP -1: Server offline")
        }
    }

    func testMemoryHealthRejectsForeignJSONService() async throws {
        AccountDataControlsURLProtocolStub.handler = { request in
            XCTAssertTrue(request.url?.path == "/bridge" || request.url?.path == "/health")
            return AccountDataControlsHTTPStub(
                status: 200,
                headers: ["Content-Type": "application/json"],
                body: Data(#"{ "success": true, "service": "Another API" }"#.utf8)
            )
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AccountDataControlsURLProtocolStub.self]
        let api = BackendMemoryAPI(
            session: URLSession(configuration: configuration),
            baseURL: URL(string: "https://account-data-controls.test")!
        )

        do {
            _ = try await api.fetchHealth()
            XCTFail("Expected a foreign JSON service to fail them backend health validation")
        } catch let error as BackendMemoryAPIError {
            XCTAssertEqual(
                error.errorDescription,
                "Backend error 502: Backend service unavailable. Please try again."
            )
        }
    }
}

final class BackendCredentialMigrationTests: XCTestCase {
    private var suiteName: String!
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        suiteName = "io.them.BackendCredentialMigrationTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        super.tearDown()
    }

    func testReadMigratesLegacyDefaultsValueToKeychainAndClearsDefaults() {
        defaults.set(" legacy-token ", forKey: "client_token")
        var keychain: [String: String] = [:]

        let value = BackendCredentialMigration.readString(
            account: "session_client_token",
            defaultsKey: "client_token",
            defaults: defaults,
            readKeychain: { keychain[$0] },
            writeKeychain: { value, account in
                keychain[account] = value
                return true
            }
        )

        XCTAssertEqual(value, "legacy-token")
        XCTAssertNil(defaults.string(forKey: "client_token"))
        XCTAssertEqual(keychain["session_client_token"], "legacy-token")
    }

    func testReadLeavesLegacyDefaultsWhenKeychainWriteFails() {
        defaults.set("legacy-token", forKey: "client_token")

        let value = BackendCredentialMigration.readString(
            account: "session_client_token",
            defaultsKey: "client_token",
            defaults: defaults,
            readKeychain: { _ in nil },
            writeKeychain: { _, _ in false }
        )

        XCTAssertEqual(value, "legacy-token")
        XCTAssertEqual(defaults.string(forKey: "client_token"), "legacy-token")
    }

    func testBackendClientCredentialPolicySkipsKeychainForMacDebugShell() {
        XCTAssertFalse(
            BackendClientCredentialStorePolicy.shouldUseKeychainForClientTokens(
                isMacOS: true,
                isDebug: true
            )
        )
        XCTAssertTrue(
            BackendClientCredentialStorePolicy.shouldUseKeychainForClientTokens(
                isMacOS: true,
                isDebug: false
            )
        )
        XCTAssertTrue(
            BackendClientCredentialStorePolicy.shouldUseKeychainForClientTokens(
                isMacOS: false,
                isDebug: true
            )
        )
    }

    func testBackendDefaultBaseURLPolicyKeepsLocalBackendForMacDebug() {
        XCTAssertEqual(
            BackendDefaultBaseURLPolicy.primaryBaseURL(isMacOS: true, isDebug: true).absoluteString,
            BackendDefaultBaseURLPolicy.localPrimaryDebugBaseURLRawValue
        )
        XCTAssertEqual(
            BackendDefaultBaseURLPolicy.fallbackBaseURL(isMacOS: true, isDebug: true).absoluteString,
            BackendDefaultBaseURLPolicy.localFallbackDebugBaseURLRawValue
        )
    }

    func testBackendDefaultBaseURLPolicyKeepsLocalBackendForiOSDebug() {
        XCTAssertEqual(
            BackendDefaultBaseURLPolicy.primaryBaseURL(isMacOS: false, isDebug: true).absoluteString,
            BackendDefaultBaseURLPolicy.localPrimaryDebugBaseURLRawValue
        )
        XCTAssertEqual(
            BackendDefaultBaseURLPolicy.fallbackBaseURL(isMacOS: false, isDebug: true).absoluteString,
            BackendDefaultBaseURLPolicy.localFallbackDebugBaseURLRawValue
        )
    }

    func testBackendDefaultBaseURLPolicyPinsExplicitUITestBackendAcrossInitializationOrder() {
        XCTAssertEqual(
            BackendDefaultBaseURLPolicy.uiTestOverrideBaseURL(
                isDebug: true,
                launchArguments: ["them", "--ui-testing"],
                environment: ["THEM_UITEST_BACKEND_BASE_URL": " http://localhost:31338 "]
            )?.absoluteString,
            "http://127.0.0.1:31338"
        )
        XCTAssertNil(
            BackendDefaultBaseURLPolicy.uiTestOverrideBaseURL(
                isDebug: true,
                launchArguments: ["them"],
                environment: ["THEM_UITEST_BACKEND_BASE_URL": "http://127.0.0.1:31338"]
            )
        )
        XCTAssertNil(
            BackendDefaultBaseURLPolicy.uiTestOverrideBaseURL(
                isDebug: false,
                launchArguments: ["them", "--ui-testing"],
                environment: ["THEM_UITEST_BACKEND_BASE_URL": "http://127.0.0.1:31338"]
            )
        )
    }

    func testBackendDefaultBaseURLPolicyAllowsNetworkFaultSmokeToSwitchStoredBackend() {
        XCTAssertEqual(
            BackendDefaultBaseURLPolicy.uiTestOverrideBaseURL(
                isDebug: true,
                launchArguments: ["them", "--ui-testing", "--ui-screenplay-save-network-fault"],
                environment: ["THEM_UITEST_BACKEND_BASE_URL": "http://127.0.0.1:31337"],
                storedBaseURL: "http://localhost:3999"
            )?.absoluteString,
            "http://127.0.0.1:3999"
        )
    }

    func testBackendDefaultBaseURLPolicyUsesHostedAPIForReleaseBuilds() {
        XCTAssertEqual(
            BackendDefaultBaseURLPolicy.primaryBaseURL(isMacOS: true, isDebug: false).absoluteString,
            BackendDefaultBaseURLPolicy.productionBaseURLRawValue
        )
        XCTAssertEqual(
            BackendDefaultBaseURLPolicy.primaryBaseURL(isMacOS: false, isDebug: false).absoluteString,
            BackendDefaultBaseURLPolicy.productionBaseURLRawValue
        )
        XCTAssertEqual(
            BackendDefaultBaseURLPolicy.fallbackBaseURL(isMacOS: true, isDebug: false).absoluteString,
            BackendDefaultBaseURLPolicy.productionBaseURLRawValue
        )
    }

    func testBackendDefaultBaseURLPolicyAcceptsLoopbackDefaultsForMacDebug() {
        let staleLoopback = URL(string: BackendDefaultBaseURLPolicy.localPrimaryDebugBaseURLRawValue)!
        let now = Date(timeIntervalSince1970: 1_780_000_000)

        XCTAssertTrue(
            BackendDefaultBaseURLPolicy.shouldUseStoredBaseURL(
                staleLoopback,
                isMacOS: true,
                isDebug: true,
                launchArguments: [],
                environment: [:],
                debugTokenValues: [],
                now: now
            )
        )
        XCTAssertTrue(
            BackendDefaultBaseURLPolicy.shouldUseStoredBaseURL(
                URL(string: BackendDefaultBaseURLPolicy.productionBaseURLRawValue)!,
                isMacOS: true,
                isDebug: true,
                launchArguments: [],
                environment: [:],
                debugTokenValues: [],
                now: now
            )
        )
        XCTAssertTrue(
            BackendDefaultBaseURLPolicy.shouldUseStoredBaseURL(
                staleLoopback,
                isMacOS: false,
                isDebug: true,
                launchArguments: [],
                environment: [:],
                debugTokenValues: [],
                now: now
            )
        )
    }

    func testBackendDefaultBaseURLPolicyAllowsFreshAutomationLoopbackDefaults() {
        let loopback = URL(string: BackendDefaultBaseURLPolicy.localPrimaryDebugBaseURLRawValue)!
        let now = Date(timeIntervalSince1970: 1_780_000_000)
        let freshToken = String(Int(now.timeIntervalSince1970 * 1000))

        XCTAssertTrue(
            BackendDefaultBaseURLPolicy.shouldUseStoredBaseURL(
                loopback,
                isMacOS: true,
                isDebug: true,
                launchArguments: [],
                environment: [:],
                debugTokenValues: [freshToken],
                now: now
            )
        )
        XCTAssertTrue(
            BackendDefaultBaseURLPolicy.shouldUseStoredBaseURL(
                loopback,
                isMacOS: true,
                isDebug: true,
                launchArguments: ["--ui-testing"],
                environment: [:],
                debugTokenValues: [],
                now: now
            )
        )
        XCTAssertTrue(
            BackendDefaultBaseURLPolicy.shouldUseStoredBaseURL(
                loopback,
                isMacOS: true,
                isDebug: true,
                launchArguments: [],
                environment: ["THEM_ALLOW_LOOPBACK_BACKEND_DEFAULTS": "1"],
                debugTokenValues: [],
                now: now
            )
        )
    }

    func testBackendErrorMessageSanitizerCollapsesHTMLGatewayErrors() {
        let html = """
        <!DOCTYPE html>
        <html>
        <head><title>502 Bad Gateway</title></head>
        <body>proxy failure</body>
        </html>
        """

        XCTAssertEqual(
            BackendErrorMessageSanitizer.displayMessage(html, status: 502),
            "Backend service unavailable. Please try again."
        )
        XCTAssertEqual(
            BackendError.http(502, html).errorDescription,
            "HTTP 502: Backend service unavailable. Please try again."
        )
    }

    func testBackendErrorMessageSanitizerKeepsPlainErrorsReadable() {
        let longMessage = String(repeating: "x", count: 520)

        XCTAssertEqual(
            BackendErrorMessageSanitizer.displayMessage(" user_auth_required "),
            "user_auth_required"
        )
        XCTAssertEqual(
            BackendErrorMessageSanitizer.displayMessage(longMessage).count,
            503
        )
    }

    func testProviderQuotaPolicyRecognizesStructuredFailuresWithoutRetrying() {
        let quotaBody = Data(#"{"stage":"talk_chat","error_class":"provider_quota","error":"Talk failed during response generation."}"#.utf8)
        let rateLimitBody = Data(#"{"stage":"rate_limit","error":"rate_limited","retry_after_ms":1200}"#.utf8)

        XCTAssertTrue(
            BackendProviderFailurePolicy.isQuotaExhausted(
                statusCode: 429,
                data: quotaBody
            )
        )
        XCTAssertFalse(
            BackendProviderFailurePolicy.shouldRetryHTTP(
                statusCode: 429,
                data: quotaBody,
                retryableStatusCodes: [429, 503]
            )
        )
        XCTAssertTrue(
            BackendProviderFailurePolicy.shouldRetryHTTP(
                statusCode: 429,
                data: rateLimitBody,
                retryableStatusCodes: [429, 503]
            )
        )
    }

    func testProviderQuotaErrorsProtectDraftAndHideProviderDetails() {
        let error = BackendError.stage(
            "talk_chat",
            "Talk failed during response generation (provider_quota). Reference req-private."
        )

        XCTAssertTrue(error.isProviderQuotaExhausted)
        XCTAssertEqual(
            error.localizedDescription,
            "Clementine's writing service is temporarily unavailable. Your draft is safe. Please try again later."
        )
        XCTAssertFalse(error.localizedDescription.contains("provider_quota"))
        XCTAssertFalse(error.localizedDescription.contains("req-private"))
    }

    func testBackendAPIResponseValidatorRejectsCrossOriginRedirects() {
        let requestURL = URL(string: "https://api.them.io/health")!
        let redirectedURL = URL(string: "https://introvert.com/?domain=them.io")!

        XCTAssertFalse(
            BackendAPIResponseValidator.hasMatchingOrigin(
                requestURL: requestURL,
                responseURL: redirectedURL
            )
        )
        XCTAssertTrue(
            BackendAPIResponseValidator.hasMatchingOrigin(
                requestURL: requestURL,
                responseURL: URL(string: "https://api.them.io/health?probe=1")!
            )
        )
    }

    func testStudioDebugProjectLoadUsesDefaultsClientTokenOverride() {
        defaults.set(" studio-smoke-project ", forKey: "client_token")
        defaults.set("project-123", forKey: "studio_debug_load_project_id")
        defaults.set(101, forKey: "studio_debug_load_project_token")
        defaults.set(100, forKey: "studio_debug_load_project_ack_token")

        XCTAssertTrue(BackendAuthClient.isStudioDebugClientTokenOverrideActive(defaults: defaults))
        XCTAssertEqual(
            BackendAuthClient.studioDebugClientTokenOverride(defaults: defaults),
            "studio-smoke-project"
        )
    }

    func testStudioDebugProjectLoadOverrideClearsAfterAck() {
        defaults.set("studio-smoke-project", forKey: "client_token")
        defaults.set("project-123", forKey: "studio_debug_load_project_id")
        defaults.set(101, forKey: "studio_debug_load_project_token")
        defaults.set(101, forKey: "studio_debug_load_project_ack_token")

        XCTAssertFalse(BackendAuthClient.isStudioDebugClientTokenOverrideActive(defaults: defaults))
        XCTAssertNil(BackendAuthClient.studioDebugClientTokenOverride(defaults: defaults))
    }

    func testStudioDebugProjectLoadUsesStandardMirroredClientTokenOverride() {
        let standard = UserDefaults.standard
        standard.set(" standard-studio-smoke-project ", forKey: "client_token")
        standard.set("project-456", forKey: "studio_debug_load_project_id")
        standard.set(202, forKey: "studio_debug_load_project_token")
        standard.set(201, forKey: "studio_debug_load_project_ack_token")
        defer {
            standard.removeObject(forKey: "client_token")
            standard.removeObject(forKey: "studio_debug_load_project_id")
            standard.removeObject(forKey: "studio_debug_load_project_token")
            standard.removeObject(forKey: "studio_debug_load_project_ack_token")
        }

        XCTAssertTrue(BackendAuthClient.isStudioDebugClientTokenOverrideActive())
        XCTAssertEqual(
            BackendAuthClient.studioDebugClientTokenOverride(),
            "standard-studio-smoke-project"
        )
    }

    func testUITestStudioFixtureHydrationBypassIsExplicit() {
        XCTAssertTrue(
            UITestLaunchConfiguration.shouldBypassStudioHydration(
                arguments: ["them", "--ui-testing", "--ui-show-draft-conflict"]
            )
        )
        XCTAssertTrue(
            UITestLaunchConfiguration.shouldBypassStudioHydration(
                arguments: ["them", "--ui-testing", "--ui-show-pending-screenplay-question"]
            )
        )
        XCTAssertTrue(
            UITestLaunchConfiguration.shouldBypassStudioHydration(
                arguments: ["them", "--ui-testing", "-studio_debug_seed_structural_token", "42"]
            )
        )
        XCTAssertTrue(
            UITestLaunchConfiguration.hasStructuralStudioFixture(
                arguments: ["them", "--ui-testing", "-studio_debug_seed_structural_token", "42"]
            )
        )
        XCTAssertFalse(
            UITestLaunchConfiguration.shouldBypassStudioHydration(
                arguments: ["them", "--ui-testing", "--ui-open-studio"]
            )
        )
        XCTAssertFalse(
            UITestLaunchConfiguration.shouldBypassStudioHydration(
                arguments: ["them", "--ui-show-draft-conflict"]
            )
        )
        XCTAssertFalse(
            UITestLaunchConfiguration.hasStructuralStudioFixture(
                arguments: ["them", "-studio_debug_seed_structural_token", "42"]
            )
        )
        XCTAssertFalse(
            UITestLaunchConfiguration.hasStructuralStudioFixture(
                arguments: ["them", "--ui-testing", "-studio_debug_seed_structural_token"]
            )
        )
        XCTAssertFalse(
            UITestLaunchConfiguration.hasStructuralStudioFixture(
                arguments: ["them", "--ui-testing", "-studio_debug_seed_structural_token", "invalid"]
            )
        )
        XCTAssertFalse(
            UITestLaunchConfiguration.hasStructuralStudioFixture(
                arguments: ["them", "--ui-testing", "-studio_debug_seed_structural_token", "0"]
            )
        )
    }

    func testUITestLaunchConfigurationSeedsBackendRestoreDefaultsFromEnvironment() throws {
        let suiteName = "io.them.tests.ui-launch-\(UUID().uuidString)"
        let suiteDefaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer {
            suiteDefaults.removePersistentDomain(forName: suiteName)
        }

        UITestLaunchConfiguration.applyIfNeeded(
            arguments: [
                "them",
                "--ui-testing",
                "-studio_debug_load_project_id",
                "project-ios-restore",
                "-studio_debug_load_project_version_id",
                "version-ios-restore",
                "-studio_debug_load_project_token",
                "77",
                "-studio_debug_load_project_ack_token",
                "0",
            ],
            environment: [
                "THEM_UITEST_BACKEND_BASE_URL": " http://127.0.0.1:31337 ",
                "THEM_UITEST_APP_TOKEN": " them-dev ",
                "THEM_UITEST_USER_ID": " user-ios ",
                "THEM_UITEST_CLIENT_TOKEN": " client-ios ",
                "THEM_UITEST_CLIENT_TOKEN_BASE_URL": " http://127.0.0.1:31337 ",
                "THEM_UITEST_CLIENT_TOKEN_EXPIRY": "2026-06-05T20:00:00.000Z",
                "THEM_UITEST_CLIENT_TOKEN_CACHED_AT": "1780689600",
                "THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN": " access-ios ",
                "THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN_ENABLED": "true",
                "THEM_UITEST_AUTH_DEBUG_REFRESH_TOKEN": " refresh-ios ",
                "THEM_UITEST_AUTH_SIGNED_IN": "1",
                "THEM_UITEST_STUDIO_FULL_THREAD_STATE_JSON": #"{"project:project-ios-restore":{"focusedDiffKey":"write:one"}}"#,
                "THEM_UITEST_STUDIO_ASK_NOTE_HISTORY_JSON": #"{"project:project-ios-restore":[]}"#,
                "THEM_UITEST_STUDIO_DIFF_ACKNOWLEDGED_JSON": #"{"project:project-ios-restore":{"lineage:one":"fingerprint"}}"#,
                "THEM_UITEST_STUDIO_DIFF_ACKNOWLEDGED_WRITEIDS_JSON": #"{"project:project-ios-restore":{"lineage:one":"write-one"}}"#,
            ],
            defaults: suiteDefaults
        )

        XCTAssertEqual(suiteDefaults.string(forKey: "backend_base_url"), "http://127.0.0.1:31337")
        XCTAssertEqual(suiteDefaults.string(forKey: "app_token"), "them-dev")
        XCTAssertEqual(suiteDefaults.string(forKey: "user_id"), "user-ios")
        XCTAssertEqual(suiteDefaults.string(forKey: "client_token"), "client-ios")
        XCTAssertEqual(suiteDefaults.double(forKey: "client_token_cached_at"), 1_780_689_600)
        XCTAssertEqual(suiteDefaults.string(forKey: "client_token_base_url"), "http://127.0.0.1:31337")
        XCTAssertEqual(suiteDefaults.string(forKey: "client_token_expiry"), "2026-06-05T20:00:00.000Z")
        XCTAssertEqual(suiteDefaults.string(forKey: "auth_debug_access_token"), "access-ios")
        XCTAssertTrue(suiteDefaults.bool(forKey: "auth_debug_access_token_enabled"))
        XCTAssertEqual(suiteDefaults.string(forKey: "auth_debug_refresh_token"), "refresh-ios")
        XCTAssertTrue(suiteDefaults.bool(forKey: "auth_signed_in"))
        XCTAssertEqual(suiteDefaults.string(forKey: "studio_debug_load_project_id"), "project-ios-restore")
        XCTAssertEqual(suiteDefaults.string(forKey: "studio_debug_load_project_version_id"), "version-ios-restore")
        XCTAssertEqual(suiteDefaults.integer(forKey: "studio_debug_load_project_token"), 77)
        XCTAssertEqual(suiteDefaults.integer(forKey: "studio_debug_load_project_ack_token"), 0)
        XCTAssertEqual(
            suiteDefaults.string(forKey: "studio.full.thread.state.v1"),
            #"{"project:project-ios-restore":{"focusedDiffKey":"write:one"}}"#
        )
        XCTAssertEqual(
            suiteDefaults.string(forKey: "studio.ask.note.history.v2"),
            #"{"project:project-ios-restore":[]}"#
        )
        XCTAssertEqual(
            suiteDefaults.string(forKey: "studio.diff.keep-current.v1"),
            #"{"project:project-ios-restore":{"lineage:one":"fingerprint"}}"#
        )
        XCTAssertEqual(
            suiteDefaults.string(forKey: "studio.diff.keep-current.writeids.v1"),
            #"{"project:project-ios-restore":{"lineage:one":"write-one"}}"#
        )
    }

    func testNewWritesUseKeychainAndRemoveDefaults() {
        defaults.set("stale-user", forKey: "user_id")
        var keychain: [String: String] = [:]

        let wrote = BackendCredentialMigration.writeString(
            " usr_new_value ",
            account: "stable_user_id",
            defaultsKey: "user_id",
            defaults: defaults,
            writeKeychain: { value, account in
                keychain[account] = value
                return true
            },
            deleteKeychain: { keychain.removeValue(forKey: $0) }
        )

        XCTAssertTrue(wrote)
        XCTAssertNil(defaults.string(forKey: "user_id"))
        XCTAssertEqual(keychain["stable_user_id"], "usr_new_value")
    }

    func testEmptyWritesClearKeychainAndDefaults() {
        defaults.set("stale-expiry", forKey: "client_token_expiry")
        var keychain = ["session_client_token_expiry": "stale-expiry"]

        let wrote = BackendCredentialMigration.writeString(
            "   ",
            account: "session_client_token_expiry",
            defaultsKey: "client_token_expiry",
            defaults: defaults,
            writeKeychain: { value, account in
                keychain[account] = value
                return true
            },
            deleteKeychain: { account in
                keychain.removeValue(forKey: account)
            }
        )

        XCTAssertFalse(wrote)
        XCTAssertNil(defaults.string(forKey: "client_token_expiry"))
        XCTAssertNil(keychain["session_client_token_expiry"])
    }
}

private struct AccountDataControlsHTTPStub {
    let status: Int
    let headers: [String: String]
    let body: Data
}

private final class AccountDataControlsURLProtocolStub: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> AccountDataControlsHTTPStub)?

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == "account-data-controls.test"
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

private struct RecordedAccountDataControlsRequest {
    let method: String
    let path: String
    let acceptHeader: String?
    let userIDHeader: String?
    let clientTokenHeader: String?
    let authorizationHeader: String?
    let bodyObject: [String: Any]?
}

private final class AccountDataControlsRequestRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private(set) var requests: [RecordedAccountDataControlsRequest] = []

    func record(_ request: URLRequest) {
        let bodyObject: [String: Any]?
        if let body = Self.bodyData(from: request),
           let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any] {
            bodyObject = object
        } else {
            bodyObject = nil
        }

        let record = RecordedAccountDataControlsRequest(
            method: request.httpMethod ?? "",
            path: request.url?.path ?? "",
            acceptHeader: request.value(forHTTPHeaderField: "Accept"),
            userIDHeader: request.value(forHTTPHeaderField: "X-User-Id"),
            clientTokenHeader: request.value(forHTTPHeaderField: "X-Client-Token"),
            authorizationHeader: request.value(forHTTPHeaderField: "Authorization"),
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
        while stream.hasBytesAvailable {
            let read = stream.read(buffer, maxLength: bufferSize)
            if read <= 0 { break }
            data.append(buffer, count: read)
        }
        return data
    }
}

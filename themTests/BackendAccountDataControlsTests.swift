import XCTest
import Security
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

    func testRequestAccountDeletionSendsReauthenticationWithoutBootstrapping() async throws {
        let recorder = AccountDataControlsRequestRecorder()
        AccountDataControlsURLProtocolStub.handler = { request in
            recorder.record(request)
            switch request.url?.path {
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
            baseURL: URL(string: "https://account-data-controls.test")!,
            accountDeletionSessionHooks: BackendAccountDeletionSessionHooks(
                clearLocalSession: { nil },
                clearAfterSuccessfulDeletion: { _ in false }
            )
        )

        let response = try await api.requestAccountDeletion(
            reason: "Leaving",
            proof: .password("current-password")
        )

        XCTAssertEqual(response.status, "pending_deletion")
        XCTAssertEqual(response.hardDeleteAt, "2026-05-30T12:00:00.000Z")
        XCTAssertEqual(response.recoveryWindowDays, 7)

        let accountRequest = try XCTUnwrap(recorder.requests.first { $0.path == "/account" })
        XCTAssertEqual(accountRequest.method, "DELETE")
        XCTAssertEqual(accountRequest.bodyObject?["reason"] as? String, "Leaving")
        XCTAssertEqual(accountRequest.bodyObject?["current_password"] as? String, "current-password")
        XCTAssertFalse(recorder.requests.contains { $0.path == "/session" })
    }

    func testAccountDeletionAppleProofCarriesIdentityTokenAndNonce() throws {
        let fields = try BackendAccountDeletionProof.apple(
            identityToken: " apple-token ",
            rawNonce: " raw-nonce "
        ).requestFields()

        XCTAssertEqual(fields["identity_token"], "apple-token")
        XCTAssertEqual(fields["raw_nonce"], "raw-nonce")
        XCTAssertNil(fields["current_password"])
    }

    func testAccountDeletionRejectsEmptyReauthenticationProof() {
        XCTAssertThrowsError(try BackendAccountDeletionProof.password("").requestFields())
        XCTAssertThrowsError(
            try BackendAccountDeletionProof.apple(identityToken: "  ", rawNonce: nil).requestFields()
        )
    }

    func testCapturedLogoutRequestUsesOnlyCapturedCredentials() throws {
        let request = try BackendAuthClient.capturedLogoutRequest(
            accessToken: " access-account-a ",
            refreshToken: " refresh-account-a "
        )
        let body = try XCTUnwrap(request.httpBody)
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: body) as? [String: String]
        )

        XCTAssertEqual(request.url?.path, "/auth/logout")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-account-a")
        XCTAssertEqual(object["refresh_token"], "refresh-account-a")
    }

    func testRefreshOnlyLogoutRequestCannotInheritAmbientAuthorization() throws {
        let request = try BackendAuthClient.capturedLogoutRequest(
            accessToken: "",
            refreshToken: "refresh-account-a"
        )

        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
    }

    func testSuccessfulAccountDeletionClearsOnlyAReloginOfTheDeletedAccount() {
        let deleted = BackendAuthUser(
            userId: "user-a",
            email: "a@example.invalid",
            authProvider: "email",
            emailVerified: true,
            emailVerifiedAt: nil,
            createdAt: nil,
            updatedAt: nil
        )
        let sameAccount = BackendAuthUser(
            userId: "user-a",
            email: "new-address@example.invalid",
            authProvider: "email",
            emailVerified: true,
            emailVerifiedAt: nil,
            createdAt: nil,
            updatedAt: nil
        )
        let differentAccount = BackendAuthUser(
            userId: "user-b",
            email: "b@example.invalid",
            authProvider: "email",
            emailVerified: true,
            emailVerifiedAt: nil,
            createdAt: nil,
            updatedAt: nil
        )

        XCTAssertTrue(BackendAuthClient.accountDeletionShouldClearCurrentSession(
            deletedUser: deleted,
            currentUser: sameAccount
        ))
        XCTAssertFalse(BackendAuthClient.accountDeletionShouldClearCurrentSession(
            deletedUser: deleted,
            currentUser: differentAccount
        ))
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

    func testStaleBootstrapCannotPublishIdentityAfterSessionEpochChanges() {
        let suiteName = "BackendAccountDataControlsTests.bootstrap.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let expectedEpoch = BackendAuthClient.authSessionEpoch(defaults: defaults)

        XCTAssertTrue(BackendAuthClient.sessionBootstrapIdentityCommitIsAllowed(
            expectedSessionEpoch: expectedEpoch,
            defaults: defaults
        ))

        _ = BackendAuthClient.advanceAuthSessionEpoch(defaults: defaults)

        XCTAssertFalse(BackendAuthClient.sessionBootstrapIdentityCommitIsAllowed(
            expectedSessionEpoch: expectedEpoch,
            defaults: defaults
        ))
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

    func testBackendLiveAuthDefaultsNotificationArrivesOnMain() throws {
#if os(macOS)
        throw XCTSkip("The silent standard-defaults bridge is iOS-only")
#else
        let key = "auth_user_email"
        let original = UserDefaults.standard.object(forKey: key)
        let expected = "thread-check-\(UUID().uuidString)@io.them.invalid"
        let notified = expectation(description: "live auth defaults notification")
        // UserDefaults notifications are not one-per-write: pending changes
        // can also arrive while this value is current. This test asserts
        // delivery and thread affinity, not an exactly-once event contract.
        notified.assertForOverFulfill = false
        let observer = NotificationCenter.default.addObserver(
            forName: UserDefaults.didChangeNotification,
            object: UserDefaults.standard,
            queue: nil
        ) { _ in
            guard UserDefaults.standard.string(forKey: key) == expected else { return }
            XCTAssertTrue(Thread.isMainThread)
            notified.fulfill()
        }
        defer {
            NotificationCenter.default.removeObserver(observer)
            if let original {
                BackendUserDefaultsStore.set(original, forKey: key)
            } else {
                BackendUserDefaultsStore.removeObject(forKey: key)
            }
        }

        DispatchQueue.global(qos: .userInitiated).async {
            BackendUserDefaultsStore.set(expected, forKey: key)
        }
        wait(for: [notified], timeout: 2)

        XCTAssertEqual(UserDefaults.standard.string(forKey: key), expected)
#endif
    }

    func testBackendLiveAuthDefaultsNotificationWaitsForMutationQueue() {
        let mutationQueue = DispatchQueue(label: "io.them.tests.auth-mutation")
        let deliveryQueue = DispatchQueue(label: "io.them.tests.auth-notification")
        let mutationStarted = expectation(description: "auth mutation started")
        let notificationDelivered = expectation(description: "auth notification delivered")
        let releaseMutation = DispatchSemaphore(value: 0)
        let deliverySignal = DispatchSemaphore(value: 0)

        mutationQueue.async {
            mutationStarted.fulfill()
            releaseMutation.wait()
        }
        wait(for: [mutationStarted], timeout: 2)

        BackendLiveDefaultsNotificationScheduler.enqueue(
            after: mutationQueue,
            deliveryQueue: deliveryQueue
        ) {
            deliverySignal.signal()
            notificationDelivered.fulfill()
        }

        XCTAssertEqual(deliverySignal.wait(timeout: .now() + 0.05), .timedOut)

        releaseMutation.signal()
        wait(for: [notificationDelivered], timeout: 2)
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

private actor AuthRefreshCallCounter {
    private var value = 0

    func increment() {
        value += 1
    }

    func count() -> Int {
        value
    }
}

private actor AuthRefreshAsyncGate {
    private var started = false
    private var released = false
    private var startedWaiter: CheckedContinuation<Void, Never>?
    private var releaseWaiter: CheckedContinuation<Void, Never>?

    func markStartedAndWait() async {
        started = true
        startedWaiter?.resume()
        startedWaiter = nil
        if released { return }
        await withCheckedContinuation { continuation in
            releaseWaiter = continuation
        }
    }

    func waitUntilStarted() async {
        if started { return }
        await withCheckedContinuation { continuation in
            startedWaiter = continuation
        }
    }

    func release() {
        released = true
        releaseWaiter?.resume()
        releaseWaiter = nil
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

    private func waitForDefaultsCleanup(_ defaultsKey: String) {
        let committed = expectation(description: "defaults cleanup committed for \(defaultsKey)")
        DispatchQueue.main.async { [defaults] in
            XCTAssertNil(defaults?.string(forKey: defaultsKey))
            XCTAssertNil(defaults?.object(
                forKey: BackendCredentialMigration.migrationMarkerKey(defaultsKey: defaultsKey)
            ))
            committed.fulfill()
        }
        wait(for: [committed], timeout: 2)
    }

    func testReadMigratesLegacyDefaultsValueToKeychainAndClearsDefaults() {
        defaults.set(" legacy-token ", forKey: "client_token")
        var keychain: [String: String] = [:]

        let value = BackendCredentialMigration.readString(
            account: "session_client_token",
            defaultsKey: "client_token",
            defaults: defaults,
            readKeychain: { account in
                keychain[account].map(BackendKeychainStringReadResult.value) ?? .notFound
            },
            writeKeychain: { value, account in
                keychain[account] = value
                return true
            }
        )

        XCTAssertEqual(value, "legacy-token")
        XCTAssertNotEqual(keychain["session_client_token"], "legacy-token")
        XCTAssertEqual(
            BackendCredentialMigration.readString(
                account: "session_client_token",
                defaultsKey: "client_token",
                defaults: defaults,
                readKeychain: { account in
                    keychain[account].map(BackendKeychainStringReadResult.value) ?? .notFound
                },
                writeKeychain: { _, _ in
                    XCTFail("An atomically migrated credential must not be rewritten")
                    return false
                }
            ),
            "legacy-token"
        )
        waitForDefaultsCleanup("client_token")
    }

    func testReadLeavesLegacyDefaultsWhenKeychainWriteFails() {
        defaults.set("legacy-token", forKey: "client_token")
        var failedAccounts: [String] = []

        let value = BackendCredentialMigration.readString(
            account: "session_client_token",
            defaultsKey: "client_token",
            defaults: defaults,
            readKeychain: { _ in .notFound },
            writeKeychain: { _, _ in false },
            onSecureStoreFailure: { failedAccounts.append($0) }
        )

        XCTAssertEqual(value, "legacy-token")
        XCTAssertEqual(defaults.string(forKey: "client_token"), "legacy-token")
        XCTAssertEqual(failedAccounts, ["session_client_token"])
    }

    func testBackgroundMigrationPublishesDefaultsCleanupOnMainAndSkipsRedundantCleanup() throws {
#if os(macOS)
        throw XCTSkip("The V1 migration contract is iOS-only")
#else
        let defaultsKey = "background_client_token"
        let testDefaults = try XCTUnwrap(defaults)
        let store = BackendKeychainTokenStore(
            service: "io.them.tests.background-migration.\(UUID().uuidString)"
        )
        defer { _ = store.delete(account: "session_client_token") }
        testDefaults.set("legacy-token", forKey: defaultsKey)

        let returned = expectation(description: "background migration returned")
        let committed = expectation(description: "defaults cleanup committed")
        committed.assertForOverFulfill = true
        let observer = NotificationCenter.default.addObserver(
            forName: UserDefaults.didChangeNotification,
            object: testDefaults,
            queue: nil
        ) { _ in
            guard testDefaults.string(forKey: defaultsKey) == nil else { return }
            XCTAssertTrue(Thread.isMainThread)
            committed.fulfill()
        }
        defer { NotificationCenter.default.removeObserver(observer) }

        DispatchQueue.global(qos: .userInitiated).async {
            let value = BackendCredentialMigration.readString(
                account: "session_client_token",
                defaultsKey: defaultsKey,
                defaults: testDefaults,
                readKeychain: store.readResult,
                writeKeychain: store.write
            )
            XCTAssertEqual(value, "legacy-token")
            returned.fulfill()
        }

        wait(for: [returned, committed], timeout: 2)
        XCTAssertNil(testDefaults.string(forKey: defaultsKey))
        XCTAssertNil(testDefaults.object(
            forKey: BackendCredentialMigration.migrationMarkerKey(defaultsKey: defaultsKey)
        ))

        let redundantMutation = expectation(description: "no redundant defaults mutation")
        redundantMutation.isInverted = true
        let redundantObserver = NotificationCenter.default.addObserver(
            forName: UserDefaults.didChangeNotification,
            object: testDefaults,
            queue: nil
        ) { _ in
            redundantMutation.fulfill()
        }
        defer { NotificationCenter.default.removeObserver(redundantObserver) }

        let repeatedRead = expectation(description: "completed migration read returned")
        DispatchQueue.global(qos: .userInitiated).async {
            let value = BackendCredentialMigration.readString(
                account: "session_client_token",
                defaultsKey: defaultsKey,
                defaults: testDefaults,
                readKeychain: store.readResult,
                writeKeychain: { _, _ in
                    XCTFail("An enveloped credential must not rewrite Keychain")
                    return false
                }
            )
            XCTAssertEqual(value, "legacy-token")
            repeatedRead.fulfill()
        }

        wait(for: [repeatedRead, redundantMutation], timeout: 0.25)
#endif
    }

    func testCompletedMigrationUsesExistingKeychainAndClearsReintroducedDefaults() throws {
#if os(macOS)
        throw XCTSkip("The V1 migration contract is iOS-only")
#else
        defaults.set("stale-defaults-token", forKey: "app_token")
        defaults.set(
            true,
            forKey: BackendCredentialMigration.migrationMarkerKey(defaultsKey: "app_token")
        )
        var keychainValue = "current-keychain-token"
        var writeCalls = 0

        let value = BackendCredentialMigration.readString(
            account: "app_token",
            defaultsKey: "app_token",
            defaults: defaults,
            readKeychain: { _ in .value(keychainValue) },
            writeKeychain: { value, _ in
                writeCalls += 1
                keychainValue = value
                return true
            }
        )

        XCTAssertEqual(value, "current-keychain-token")
        XCTAssertEqual(writeCalls, 1)
        XCTAssertEqual(
            BackendCredentialMigration.readString(
                account: "app_token",
                defaultsKey: "app_token",
                defaults: defaults,
                readKeychain: { _ in .value(keychainValue) },
                writeKeychain: { _, _ in
                    XCTFail("A secured credential must not be rewritten")
                    return false
                }
            ),
            "current-keychain-token"
        )
        XCTAssertEqual(writeCalls, 1)
        waitForDefaultsCleanup("app_token")
#endif
    }

    func testFirstUpgradePromotesNewerLegacyFallbackOverOlderKeychainValue() throws {
#if os(macOS)
        throw XCTSkip("The V1 migration contract is iOS-only")
#else
        defaults.set("newer-defaults-token", forKey: "user_id")
        var keychainValue = "older-keychain-token"

        let value = BackendCredentialMigration.readString(
            account: "stable_user_id",
            defaultsKey: "user_id",
            defaults: defaults,
            readKeychain: { _ in .value(keychainValue) },
            writeKeychain: { value, _ in
                keychainValue = value
                return true
            }
        )

        XCTAssertEqual(value, "newer-defaults-token")
        XCTAssertNotEqual(keychainValue, "newer-defaults-token")
        XCTAssertEqual(
            BackendCredentialMigration.readString(
                account: "stable_user_id",
                defaultsKey: "user_id",
                defaults: defaults,
                readKeychain: { _ in .value(keychainValue) },
                writeKeychain: { _, _ in
                    XCTFail("The promoted credential must not be rewritten")
                    return false
                }
            ),
            "newer-defaults-token"
        )
        waitForDefaultsCleanup("user_id")
#endif
    }

    func testUnavailableKeychainReadNeverOverwritesExistingItem() throws {
#if os(macOS)
        throw XCTSkip("The V1 migration contract is iOS-only")
#else
        defaults.set("legacy-token", forKey: "client_token")
        var writeCalls = 0
        var failedAccounts: [String] = []

        let value = BackendCredentialMigration.readString(
            account: "session_client_token",
            defaultsKey: "client_token",
            defaults: defaults,
            readKeychain: { _ in .unavailable(errSecInteractionNotAllowed) },
            writeKeychain: { _, _ in
                writeCalls += 1
                return true
            },
            onSecureStoreFailure: { failedAccounts.append($0) }
        )

        XCTAssertEqual(value, "legacy-token")
        XCTAssertEqual(defaults.string(forKey: "client_token"), "legacy-token")
        XCTAssertEqual(writeCalls, 0)
        XCTAssertEqual(failedAccounts, ["session_client_token"])
#endif
    }

    func testFailedNewWriteNeverPersistsCredentialInDefaults() throws {
#if os(macOS)
        throw XCTSkip("The V1 migration contract is iOS-only")
#else
        var failedAccounts: [String] = []

        let wrote = BackendCredentialMigration.writeString(
            "new-sensitive-token",
            account: "stable_user_id",
            defaultsKey: "user_id",
            defaults: defaults,
            writeKeychain: { _, _ in false },
            onSecureStoreFailure: { failedAccounts.append($0) }
        )

        XCTAssertFalse(wrote)
        XCTAssertNil(defaults.string(forKey: "user_id"))
        XCTAssertEqual(failedAccounts, ["stable_user_id"])
#endif
    }

    func testBackgroundPersistThenImmediateReadCannotRestoreStaleLegacyCredential() throws {
#if os(macOS)
        throw XCTSkip("The V1 migration contract is iOS-only")
#else
        let defaultsKey = "atomic_client_token"
        let account = "atomic_session_client_token"
        let testDefaults = try XCTUnwrap(defaults)
        let store = BackendKeychainTokenStore(
            service: "io.them.tests.atomic-migration.\(UUID().uuidString)"
        )
        defer { _ = store.delete(account: account) }
        testDefaults.set("legacy-token-a", forKey: defaultsKey)

        let completed = expectation(description: "background persist and reread completed")
        DispatchQueue.global(qos: .userInitiated).async {
            XCTAssertEqual(
                BackendCredentialMigration.readString(
                    account: account,
                    defaultsKey: defaultsKey,
                    defaults: testDefaults,
                    readKeychain: store.readResult,
                    writeKeychain: store.write
                ),
                "legacy-token-a"
            )
            XCTAssertTrue(BackendCredentialMigration.writeString(
                "new-token-b",
                account: account,
                defaultsKey: defaultsKey,
                defaults: testDefaults,
                writeKeychain: store.write
            ))
            XCTAssertEqual(
                BackendCredentialMigration.readString(
                    account: account,
                    defaultsKey: defaultsKey,
                    defaults: testDefaults,
                    readKeychain: store.readResult,
                    writeKeychain: { _, _ in
                        XCTFail("An immediate reread must trust the atomic Keychain envelope")
                        return false
                    }
                ),
                "new-token-b"
            )
            completed.fulfill()
        }

        wait(for: [completed], timeout: 2)
        waitForDefaultsCleanup(defaultsKey)
        XCTAssertEqual(
            BackendCredentialMigration.readString(
                account: account,
                defaultsKey: defaultsKey,
                defaults: testDefaults,
                readKeychain: store.readResult,
                writeKeychain: { _, _ in false }
            ),
            "new-token-b"
        )
#endif
    }

    func testKeychainTokenStoreRoundTripsAndUpdatesAValue() throws {
        let service = "io.them.tests.credentials.\(UUID().uuidString)"
        let account = "app_token"
        let store = BackendKeychainTokenStore(service: service)
        defer { _ = store.delete(account: account) }

        XCTAssertTrue(store.delete(account: account))
        XCTAssertEqual(store.readResult(account: account), .notFound)
        XCTAssertTrue(store.write("first-value", account: account))
        XCTAssertEqual(store.read(account: account), "first-value")
        XCTAssertTrue(store.write("replacement-value", account: account))
        XCTAssertEqual(store.read(account: account), "replacement-value")
        XCTAssertTrue(store.delete(account: account))
        XCTAssertEqual(store.readResult(account: account), .notFound)
    }

    func testAppTokenUpgradeMigratesThroughTheRealKeychain() throws {
#if os(macOS)
        throw XCTSkip("The V1 migration contract is iOS-only")
#else
        let account = "app_token"
        let store = BackendKeychainTokenStore(
            service: "io.them.tests.app-token-upgrade.\(UUID().uuidString)"
        )
        defer { _ = store.delete(account: account) }
        defaults.set("upgrade-app-token", forKey: "app_token")

        XCTAssertEqual(
            BackendAuthClient.sharedAppToken(defaults: defaults, keychainStore: store),
            "upgrade-app-token"
        )
        let cleanupCommitted = expectation(description: "app-token defaults cleanup committed")
        DispatchQueue.main.async { [defaults] in
            XCTAssertNil(defaults?.string(forKey: "app_token"))
            XCTAssertNil(defaults?.object(
                forKey: BackendCredentialMigration.migrationMarkerKey(defaultsKey: "app_token")
            ))
            cleanupCommitted.fulfill()
        }
        wait(for: [cleanupCommitted], timeout: 2)
        XCTAssertNotEqual(store.read(account: account), "upgrade-app-token")
        XCTAssertEqual(
            BackendAuthClient.sharedAppToken(defaults: defaults, keychainStore: store),
            "upgrade-app-token"
        )
#endif
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

    func testStudioDebugProjectLoadRejectsStandardMirroredClientTokenWithoutAutomationMarker() {
        XCTAssertTrue(BackendUserDefaultsStore.set(
            " standard-studio-smoke-project ",
            forKey: "client_token"
        ))
        XCTAssertTrue(BackendUserDefaultsStore.set(
            "project-456",
            forKey: "studio_debug_load_project_id"
        ))
        XCTAssertTrue(BackendUserDefaultsStore.set(
            202,
            forKey: "studio_debug_load_project_token"
        ))
        XCTAssertTrue(BackendUserDefaultsStore.set(
            201,
            forKey: "studio_debug_load_project_ack_token"
        ))
        defer {
            BackendUserDefaultsStore.removeObject(forKey: "client_token")
            BackendUserDefaultsStore.removeObject(forKey: "studio_debug_load_project_id")
            BackendUserDefaultsStore.removeObject(forKey: "studio_debug_load_project_token")
            BackendUserDefaultsStore.removeObject(forKey: "studio_debug_load_project_ack_token")
        }

        XCTAssertFalse(BackendAuthClient.isStudioDebugClientTokenOverrideActive())
        XCTAssertNil(BackendAuthClient.studioDebugClientTokenOverride())
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
                arguments: ["them", "--ui-testing", "--ui-seed-companion-signal"]
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

    func testUITestAuthRefreshSmokeRequiresExactAutomationPair() {
        XCTAssertTrue(UITestLaunchConfiguration.shouldRunAuthRefreshSmoke(
            arguments: ["them", "--ui-testing", "--ui-auth-refresh-smoke"]
        ))
        XCTAssertFalse(UITestLaunchConfiguration.shouldRunAuthRefreshSmoke(
            arguments: ["them", "--ui-auth-refresh-smoke"]
        ))
        XCTAssertFalse(UITestLaunchConfiguration.shouldRunAuthRefreshSmoke(
            arguments: ["them", "--studio-eval", "--ui-auth-refresh-smoke"]
        ))
        XCTAssertFalse(UITestLaunchConfiguration.shouldRunAuthRefreshSmoke(
            arguments: ["them", "--ui-testing-extra", "--ui-auth-refresh-smoke"]
        ))
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
            }
        )

        XCTAssertTrue(wrote)
        XCTAssertNotEqual(keychain["stable_user_id"], "usr_new_value")
        XCTAssertEqual(
            BackendCredentialMigration.readString(
                account: "stable_user_id",
                defaultsKey: "user_id",
                defaults: defaults,
                readKeychain: { account in
                    keychain[account].map(BackendKeychainStringReadResult.value) ?? .notFound
                },
                writeKeychain: { _, _ in false }
            ),
            "usr_new_value"
        )
        waitForDefaultsCleanup("user_id")
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
            }
        )

        XCTAssertFalse(wrote)
        XCTAssertNotNil(keychain["session_client_token_expiry"])
        XCTAssertNil(BackendCredentialMigration.readString(
            account: "session_client_token_expiry",
            defaultsKey: "client_token_expiry",
            defaults: defaults,
            readKeychain: { account in
                keychain[account].map(BackendKeychainStringReadResult.value) ?? .notFound
            },
            writeKeychain: { _, _ in false }
        ))
        waitForDefaultsCleanup("client_token_expiry")
    }

    func testLatestAuthSessionGenerationRejectsStaleCommit() {
        let sessionEpoch = BackendAuthClient.authSessionEpoch(defaults: defaults)
        let older = BackendAuthClient.reserveAuthSessionIntent(defaults: defaults)
        let newer = BackendAuthClient.reserveAuthSessionIntent(defaults: defaults)
        var committedGeneration: Int?

        XCTAssertFalse(BackendAuthClient.authSessionCommitIfCurrent(
            expectedGeneration: older,
            defaults: defaults
        ) {
            committedGeneration = older
            return true
        })
        XCTAssertTrue(BackendAuthClient.authSessionCommitIfCurrent(
            expectedGeneration: newer,
            defaults: defaults
        ) {
            committedGeneration = newer
            return true
        })
        XCTAssertEqual(committedGeneration, newer)
        XCTAssertEqual(BackendAuthClient.authSessionEpoch(defaults: defaults), sessionEpoch)
    }

    func testOnlyCanonicalInvalidRefreshTokenIsTerminal() {
        XCTAssertTrue(BackendAuthClient.isTerminalRefreshRejection(
            BackendMemoryAPIError.server(
                status: 401,
                message: "auth_refresh: invalid_refresh_token"
            )
        ))
        XCTAssertTrue(BackendAuthClient.isTerminalRefreshRejection(
            BackendMemoryAPIError.server(status: 401, message: "invalid_refresh_token")
        ))
        XCTAssertFalse(BackendAuthClient.isTerminalRefreshRejection(
            BackendMemoryAPIError.server(status: 401, message: "Unauthorized")
        ))
        XCTAssertFalse(BackendAuthClient.isTerminalRefreshRejection(
            BackendMemoryAPIError.server(status: 400, message: "invalid_refresh_token")
        ))
        XCTAssertFalse(BackendAuthClient.isTerminalRefreshRejection(
            BackendMemoryAPIError.server(status: 403, message: "policy_denied")
        ))
    }

    func testAuthSessionLeaseFallsBackToKeychainBackedSharedUserID() throws {
        defaults.set(true, forKey: "auth_signed_in")
        let generation = BackendAuthClient.advanceAuthSessionEpoch(defaults: defaults)

        let lease = try XCTUnwrap(BackendAuthClient.capturedAuthSessionLease(
            defaults: defaults,
            currentAccessToken: { " expired-access " },
            currentRefreshToken: { " current-refresh " },
            currentSharedUserID: { " keychain-user " }
        ))

        XCTAssertEqual(lease.sessionGeneration, generation)
        XCTAssertEqual(lease.userID, "keychain-user")
        XCTAssertEqual(lease.accessToken, "expired-access")
        XCTAssertEqual(lease.refreshToken, "current-refresh")
        XCTAssertNil(defaults.object(forKey: "auth_user_payload"))
        XCTAssertNil(defaults.object(forKey: "user_id"))
    }

    func testAuthSessionLeaseRequiresSameGenerationAndExactTokens() {
        defaults.set(true, forKey: "auth_signed_in")
        let generation = BackendAuthClient.advanceAuthSessionEpoch(defaults: defaults)
        let lease = BackendAuthSessionLease(
            sessionGeneration: generation,
            userID: "user-a",
            accessToken: "access-a",
            refreshToken: "refresh-a"
        )

        XCTAssertTrue(BackendAuthClient.authSessionLeaseIsCurrent(
            lease,
            defaults: defaults,
            currentAccessToken: { "access-a" },
            currentRefreshToken: { "refresh-a" }
        ))
        XCTAssertFalse(BackendAuthClient.authSessionLeaseIsCurrent(
            lease,
            defaults: defaults,
            currentAccessToken: { "access-b" },
            currentRefreshToken: { "refresh-a" }
        ))
        _ = BackendAuthClient.advanceAuthSessionEpoch(defaults: defaults)
        XCTAssertFalse(BackendAuthClient.authSessionLeaseIsCurrent(
            lease,
            defaults: defaults,
            currentAccessToken: { "access-a" },
            currentRefreshToken: { "refresh-a" }
        ))
    }

    func testVerificationMetadataRejectsStaleAndCrossAccountResponses() {
        defaults.set(true, forKey: "auth_signed_in")
        let generation = BackendAuthClient.advanceAuthSessionEpoch(defaults: defaults)
        let lease = BackendAuthSessionLease(
            sessionGeneration: generation,
            userID: "user-a",
            accessToken: "access-a",
            refreshToken: "refresh-a"
        )

        XCTAssertTrue(BackendAuthClient.emailVerificationMetadataCommitIsAllowed(
            lease: lease,
            responseUserID: "user-a",
            defaults: defaults,
            currentAccessToken: { "access-a" },
            currentRefreshToken: { "refresh-a" },
            currentUserID: { "user-a" }
        ))
        XCTAssertFalse(BackendAuthClient.emailVerificationMetadataCommitIsAllowed(
            lease: lease,
            responseUserID: "user-b",
            defaults: defaults,
            currentAccessToken: { "access-a" },
            currentRefreshToken: { "refresh-a" },
            currentUserID: { "user-a" }
        ))
        defaults.set(true, forKey: "auth_session_token_deletion_pending")
        XCTAssertFalse(BackendAuthClient.emailVerificationMetadataCommitIsAllowed(
            lease: lease,
            responseUserID: "user-a",
            defaults: defaults,
            currentAccessToken: { "access-a" },
            currentRefreshToken: { "refresh-a" },
            currentUserID: { "user-a" }
        ))
    }

    func testPendingAuthSessionDeletionCoversEveryIdentitySecretAndRetries() {
        defaults.set("stale-access", forKey: "auth_access_token")
        defaults.set("stale-refresh", forKey: "auth_refresh_token")
        defaults.set("stale-user", forKey: "user_id")
        defaults.set("stale-client", forKey: "client_token")
        defaults.set("stale-expiry", forKey: "client_token_expiry")
        defaults.set(true, forKey: "auth_signed_in")
        defaults.set(true, forKey: "auth_session_token_deletion_pending")
        var deletionSucceeds = false
        var attemptedAccounts: [String] = []

        XCTAssertFalse(BackendAuthClient.retryPendingAuthSessionTokenDeletion(
            defaults: defaults,
            deleteKeychain: { account in
                attemptedAccounts.append(account)
                return deletionSucceeds
            }
        ))
        XCTAssertFalse(BackendAuthClient.authSessionTokenReadsAreAllowed(defaults: defaults))
        XCTAssertTrue(defaults.bool(forKey: "auth_session_token_deletion_pending"))
        XCTAssertFalse(defaults.bool(forKey: "auth_signed_in"))
        XCTAssertNil(defaults.string(forKey: "auth_access_token"))
        XCTAssertNil(defaults.string(forKey: "auth_refresh_token"))
        XCTAssertNil(defaults.string(forKey: "user_id"))
        XCTAssertNil(defaults.string(forKey: "client_token"))
        XCTAssertNil(defaults.string(forKey: "client_token_expiry"))
        XCTAssertEqual(
            Set(attemptedAccounts),
            Set([
                "auth_access_token",
                "auth_refresh_token",
                "session_client_token",
                "session_client_token_expiry",
                "stable_user_id",
            ])
        )

        deletionSucceeds = true
        attemptedAccounts.removeAll()
        XCTAssertTrue(BackendAuthClient.retryPendingAuthSessionTokenDeletion(
            defaults: defaults,
            deleteKeychain: { account in
                attemptedAccounts.append(account)
                return deletionSucceeds
            }
        ))
        XCTAssertFalse(BackendAuthClient.authSessionTokenReadsAreAllowed(defaults: defaults))
        XCTAssertFalse(defaults.bool(forKey: "auth_session_token_deletion_pending"))
        XCTAssertEqual(attemptedAccounts.count, 5)
    }

    func testAuthTokenPairPublishesOnlyAfterCrashSafeWrites() {
        defaults.set(true, forKey: "auth_signed_in")
        defaults.set("old-user", forKey: "auth_user_email")
        var keychain: [String: String] = [
            "auth_access_token": "old-access",
            "auth_refresh_token": "old-refresh",
            "stable_user_id": "old-user",
            "session_client_token": "old-client",
            "session_client_token_expiry": "old-expiry",
        ]
        var writeObservations = 0

        let stored = BackendAuthClient.persistAuthTokenPair(
            accessToken: "new-access",
            refreshToken: "new-refresh",
            defaults: defaults,
            writeKeychain: { value, account in
                XCTAssertTrue(defaults.bool(forKey: "auth_session_token_deletion_pending"))
                XCTAssertFalse(defaults.bool(forKey: "auth_signed_in"))
                XCTAssertNil(defaults.string(forKey: "auth_user_email"))
                keychain[account] = value
                writeObservations += 1
                return true
            },
            deleteKeychain: { account in
                keychain.removeValue(forKey: account)
                return true
            },
            persistMetadata: {
                XCTAssertTrue(defaults.bool(forKey: "auth_session_token_deletion_pending"))
                XCTAssertFalse(defaults.bool(forKey: "auth_signed_in"))
                defaults.set("new-user", forKey: "auth_user_email")
                return true
            }
        )

        XCTAssertTrue(stored)
        XCTAssertEqual(writeObservations, 2)
        XCTAssertEqual(keychain["auth_access_token"], "new-access")
        XCTAssertEqual(keychain["auth_refresh_token"], "new-refresh")
        XCTAssertNil(keychain["session_client_token"])
        XCTAssertNil(keychain["stable_user_id"])
        XCTAssertTrue(defaults.bool(forKey: "auth_signed_in"))
        XCTAssertFalse(defaults.bool(forKey: "auth_session_token_deletion_pending"))
        XCTAssertEqual(defaults.string(forKey: "auth_user_email"), "new-user")
    }

    func testPartialAuthTokenWriteFailsClosedUntilCleanupCanFinish() {
        defaults.set(true, forKey: "auth_signed_in")
        defaults.set("old-user", forKey: "auth_user_email")
        var replacementWriteStarted = false

        let stored = BackendAuthClient.persistAuthTokenPair(
            accessToken: "new-access",
            refreshToken: "new-refresh",
            defaults: defaults,
            writeKeychain: { _, account in
                replacementWriteStarted = true
                return account == "auth_access_token"
            },
            deleteKeychain: { account in
                if replacementWriteStarted, account == "auth_access_token" {
                    return false
                }
                return true
            },
            persistMetadata: {
                XCTFail("Metadata must not publish after a partial token write")
                return false
            }
        )

        XCTAssertFalse(stored)
        XCTAssertTrue(defaults.bool(forKey: "auth_session_token_deletion_pending"))
        XCTAssertFalse(defaults.bool(forKey: "auth_signed_in"))
        XCTAssertNil(defaults.string(forKey: "auth_user_email"))
        XCTAssertFalse(BackendAuthClient.authSessionTokenReadsAreAllowed(defaults: defaults))
    }

    func testAuthIdentityMetadataFailureRollsBackWrittenTokenPair() {
        var keychain: [String: String] = [:]
        var metadataAttempted = false

        let stored = BackendAuthClient.persistAuthTokenPair(
            accessToken: "new-access",
            refreshToken: "new-refresh",
            defaults: defaults,
            writeKeychain: { value, account in
                keychain[account] = value
                return true
            },
            deleteKeychain: { account in
                keychain.removeValue(forKey: account)
                return true
            },
            persistMetadata: {
                metadataAttempted = true
                defaults.set("partially-persisted-user", forKey: "auth_user_email")
                return false
            }
        )

        XCTAssertFalse(stored)
        XCTAssertTrue(metadataAttempted)
        XCTAssertNil(keychain["auth_access_token"])
        XCTAssertNil(keychain["auth_refresh_token"])
        XCTAssertNil(defaults.string(forKey: "auth_user_email"))
        XCTAssertFalse(defaults.bool(forKey: "auth_signed_in"))
        XCTAssertFalse(defaults.bool(forKey: "auth_session_token_deletion_pending"))
    }

    func testRefreshCoordinatorCoalescesConcurrentCallers() async throws {
        let coordinator = BackendAuthRefreshCoordinator()
        let counter = AuthRefreshCallCounter()
        let key = BackendAuthRefreshCoordinator.Key(
            lease: BackendAuthSessionLease(
                sessionGeneration: 7,
                userID: "user-a",
                accessToken: "access-a",
                refreshToken: "refresh-a"
            )
        )

        let first = Task {
            try await coordinator.run(key: key) {
                await counter.increment()
                try await Task.sleep(nanoseconds: 80_000_000)
                return .signedOut
            }
        }
        let second = Task {
            try await coordinator.run(key: key) {
                await counter.increment()
                try await Task.sleep(nanoseconds: 80_000_000)
                return .signedOut
            }
        }

        let firstResult = try await first.value
        let secondResult = try await second.value
        let callCount = await counter.count()
        XCTAssertEqual(firstResult, .signedOut)
        XCTAssertEqual(secondResult, .signedOut)
        XCTAssertEqual(callCount, 1)
    }

    func testRefreshCoordinatorDoesNotJoinADifferentSessionFlight() async throws {
        let coordinator = BackendAuthRefreshCoordinator()
        let gate = AuthRefreshAsyncGate()
        let firstKey = BackendAuthRefreshCoordinator.Key(
            lease: BackendAuthSessionLease(
                sessionGeneration: 7,
                userID: "user-a",
                accessToken: "access-a",
                refreshToken: "refresh-a"
            )
        )
        let secondKey = BackendAuthRefreshCoordinator.Key(
            lease: BackendAuthSessionLease(
                sessionGeneration: 8,
                userID: "user-b",
                accessToken: "access-b",
                refreshToken: "refresh-b"
            )
        )

        let first = Task {
            try await coordinator.run(key: firstKey) {
                await gate.markStartedAndWait()
                return .signedOut
            }
        }
        await gate.waitUntilStarted()
        let second = Task {
            try await coordinator.run(key: secondKey) {
                return .signedOut
            }
        }

        let secondResult = try await second.value
        XCTAssertEqual(secondResult, .signedOut)
        await gate.release()
        _ = try await first.value
    }
}

final class BackendRememberedLoginCredentialPolicyTests: XCTestCase {
    func testRememberedLoginRoundTripsNormalizedEmailAndPassword() {
        var keychain: [String: String] = [:]

        let saved = BackendRememberedLoginCredentialPolicy.update(
            email: "  Studio-Demo@IO.Them.Invalid  ",
            password: "ThemDemo!2026",
            rememberEmail: true,
            savePassword: true,
            writeKeychain: { value, account in
                keychain[account] = value
                return true
            },
            deleteKeychain: {
                keychain.removeValue(forKey: $0)
                return true
            }
        )
        let loaded = BackendRememberedLoginCredentialPolicy.load(
            enabled: true,
            readKeychain: { keychain[$0] }
        )

        XCTAssertTrue(saved)
        XCTAssertEqual(loaded?.email, "studio-demo@io.them.invalid")
        XCTAssertEqual(loaded?.password, "ThemDemo!2026")
        XCTAssertTrue(loaded?.hasSavedPassword == true)
    }

    func testRememberedLoginCanStoreEmailWithoutPassword() {
        var keychain: [String: String] = [:]

        XCTAssertTrue(
            BackendRememberedLoginCredentialPolicy.update(
                email: "writer@example.invalid",
                password: "must-not-be-stored",
                rememberEmail: true,
                savePassword: false,
                writeKeychain: { value, account in
                    keychain[account] = value
                    return true
                },
                deleteKeychain: {
                    keychain.removeValue(forKey: $0)
                    return true
                }
            )
        )
        let loaded = BackendRememberedLoginCredentialPolicy.load(
            enabled: true,
            readKeychain: { keychain[$0] }
        )

        XCTAssertEqual(loaded?.email, "writer@example.invalid")
        XCTAssertNil(loaded?.password)
        XCTAssertFalse(loaded?.hasSavedPassword == true)
        XCTAssertFalse(keychain.values.contains { $0.contains("must-not-be-stored") })
    }

    func testDisablingRememberedLoginDeletesKeychainPayload() {
        var keychain = [BackendRememberedLoginCredentialPolicy.keychainAccount: "stale"]
        var attemptedWrite = false

        let cleared = BackendRememberedLoginCredentialPolicy.update(
            email: "writer@example.invalid",
            password: "secret",
            rememberEmail: false,
            savePassword: true,
            writeKeychain: { _, _ in
                attemptedWrite = true
                return true
            },
            deleteKeychain: {
                keychain.removeValue(forKey: $0)
                return true
            }
        )

        XCTAssertTrue(cleared)
        XCTAssertFalse(attemptedWrite)
        XCTAssertNil(keychain[BackendRememberedLoginCredentialPolicy.keychainAccount])
    }

    func testRememberedLoginRejectsCorruptPayloadAndSurfacesWriteFailure() {
        XCTAssertNil(
            BackendRememberedLoginCredentialPolicy.load(
                enabled: true,
                readKeychain: { _ in "not-json" }
            )
        )
        XCTAssertFalse(
            BackendRememberedLoginCredentialPolicy.update(
                email: "writer@example.invalid",
                password: "valid-password",
                rememberEmail: true,
                savePassword: true,
                writeKeychain: { _, _ in false },
                deleteKeychain: { _ in true }
            )
        )
    }

    func testDisablingRememberedLoginReportsDeletionFailure() {
        var attemptedWrite = false

        let cleared = BackendRememberedLoginCredentialPolicy.update(
            email: "writer@example.invalid",
            password: "secret",
            rememberEmail: false,
            savePassword: true,
            writeKeychain: { _, _ in
                attemptedWrite = true
                return true
            },
            deleteKeychain: { _ in false }
        )

        XCTAssertFalse(cleared)
        XCTAssertFalse(attemptedWrite)
    }

    func testPendingRememberedLoginDeletionRetriesUntilKeychainSucceeds() {
        let suiteName = "BackendRememberedLoginDeletionTests.\(UUID().uuidString)"
        guard let suiteDefaults = UserDefaults(suiteName: suiteName) else {
            XCTFail("Could not create isolated defaults suite")
            return
        }
        defer { suiteDefaults.removePersistentDomain(forName: suiteName) }
        suiteDefaults.set(true, forKey: "auth_remembered_login_enabled")
        suiteDefaults.set(true, forKey: "auth_remembered_login_deletion_pending")
        var deletionAttempts = 0

        XCTAssertFalse(
            BackendAuthClient.retryPendingRememberedLoginDeletion(
                defaults: suiteDefaults,
                deleteKeychain: { account in
                    deletionAttempts += 1
                    XCTAssertEqual(account, BackendRememberedLoginCredentialPolicy.keychainAccount)
                    return false
                }
            )
        )
        XCTAssertEqual(deletionAttempts, 1)
        XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_enabled"))
        XCTAssertTrue(suiteDefaults.bool(forKey: "auth_remembered_login_deletion_pending"))

        XCTAssertTrue(
            BackendAuthClient.retryPendingRememberedLoginDeletion(
                defaults: suiteDefaults,
                deleteKeychain: { _ in
                    deletionAttempts += 1
                    return true
                }
            )
        )
        XCTAssertEqual(deletionAttempts, 2)
        XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_deletion_pending"))
    }

    func testRememberedLoginBootstrapDoesNotDeleteWhenNoCleanupIsPending() {
        let suiteName = "BackendRememberedLoginNoPendingDeletionTests.\(UUID().uuidString)"
        guard let suiteDefaults = UserDefaults(suiteName: suiteName) else {
            XCTFail("Could not create isolated defaults suite")
            return
        }
        defer { suiteDefaults.removePersistentDomain(forName: suiteName) }
        suiteDefaults.set(true, forKey: "auth_remembered_login_enabled")
        var attemptedDeletion = false

        XCTAssertTrue(
            BackendAuthClient.retryPendingRememberedLoginDeletion(
                defaults: suiteDefaults,
                deleteKeychain: { _ in
                    attemptedDeletion = true
                    return true
                }
            )
        )
        XCTAssertFalse(attemptedDeletion)
        XCTAssertTrue(suiteDefaults.bool(forKey: "auth_remembered_login_enabled"))
    }

    func testTransientKeychainReadFailurePreservesRememberedLoginStateAndItem() {
        let suiteName = "BackendRememberedLoginTransientReadTests.\(UUID().uuidString)"
        guard let suiteDefaults = UserDefaults(suiteName: suiteName) else {
            XCTFail("Could not create isolated defaults suite")
            return
        }
        defer { suiteDefaults.removePersistentDomain(forName: suiteName) }
        suiteDefaults.set(true, forKey: "auth_remembered_login_enabled")
        suiteDefaults.set(true, forKey: "auth_remembered_login_password_enabled")
        var attemptedDeletion = false

        let result = BackendAuthClient.rememberedLoginCredentialLoadResult(
            defaults: suiteDefaults,
            readKeychain: { _ in .unavailable(errSecInteractionNotAllowed) },
            deleteKeychain: { _ in
                attemptedDeletion = true
                return true
            }
        )

        XCTAssertEqual(result, .unavailable(savePassword: true))
        XCTAssertFalse(attemptedDeletion)
        XCTAssertTrue(suiteDefaults.bool(forKey: "auth_remembered_login_enabled"))
        XCTAssertTrue(suiteDefaults.bool(forKey: "auth_remembered_login_password_enabled"))
        XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_deletion_pending"))
    }

    func testLegacySavedPasswordBackfillsExplicitRetentionIntentAfterSuccessfulRead() throws {
        let suiteName = "BackendRememberedLoginLegacyIntentTests.\(UUID().uuidString)"
        guard let suiteDefaults = UserDefaults(suiteName: suiteName) else {
            XCTFail("Could not create isolated defaults suite")
            return
        }
        defer { suiteDefaults.removePersistentDomain(forName: suiteName) }
        suiteDefaults.set(true, forKey: "auth_remembered_login_enabled")
        let legacy = BackendRememberedLoginCredentials(
            email: "writer@example.invalid",
            password: "legacy-password"
        )
        let payload = String(data: try JSONEncoder().encode(legacy), encoding: .utf8)!

        let result = BackendAuthClient.rememberedLoginCredentialLoadResult(
            defaults: suiteDefaults,
            readKeychain: { _ in .value(payload) },
            deleteKeychain: { _ in
                XCTFail("A valid legacy credential should not be deleted")
                return false
            }
        )

        XCTAssertEqual(result, .loaded(legacy))
        XCTAssertNotNil(suiteDefaults.object(forKey: "auth_remembered_login_password_enabled"))
        XCTAssertTrue(suiteDefaults.bool(forKey: "auth_remembered_login_password_enabled"))
    }

    func testUnavailableLegacyCredentialWithUnknownRetentionIntentFailsClosed() {
        let suiteName = "BackendRememberedLoginUnknownIntentTests.\(UUID().uuidString)"
        guard let suiteDefaults = UserDefaults(suiteName: suiteName) else {
            XCTFail("Could not create isolated defaults suite")
            return
        }
        defer { suiteDefaults.removePersistentDomain(forName: suiteName) }
        suiteDefaults.set(true, forKey: "auth_remembered_login_enabled")
        let generation = BackendAuthClient.rememberedLoginIntentGeneration(defaults: suiteDefaults)
        var attemptedDeletion = false

        let result = BackendAuthClient.rememberedLoginCredentialLoadResult(
            defaults: suiteDefaults,
            readKeychain: { _ in .unavailable(errSecInteractionNotAllowed) },
            deleteKeychain: { _ in
                attemptedDeletion = true
                return false
            }
        )

        XCTAssertEqual(result, .notRemembered)
        XCTAssertTrue(attemptedDeletion)
        XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_enabled"))
        XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_password_enabled"))
        XCTAssertTrue(suiteDefaults.bool(forKey: "auth_remembered_login_deletion_pending"))
        XCTAssertGreaterThan(
            BackendAuthClient.rememberedLoginIntentGeneration(defaults: suiteDefaults),
            generation
        )
    }

    func testCorruptRememberedLoginPayloadIsDisabledAndDeleted() {
        let suiteName = "BackendRememberedLoginCorruptReadTests.\(UUID().uuidString)"
        guard let suiteDefaults = UserDefaults(suiteName: suiteName) else {
            XCTFail("Could not create isolated defaults suite")
            return
        }
        defer { suiteDefaults.removePersistentDomain(forName: suiteName) }
        suiteDefaults.set(true, forKey: "auth_remembered_login_enabled")
        var attemptedDeletion = false

        let loaded = BackendAuthClient.rememberedLoginCredentials(
            defaults: suiteDefaults,
            readKeychain: { _ in .value("not-json") },
            deleteKeychain: { _ in
                attemptedDeletion = true
                return true
            }
        )

        XCTAssertNil(loaded)
        XCTAssertTrue(attemptedDeletion)
        XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_enabled"))
        XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_deletion_pending"))
    }

    func testRememberedLoginStateTransitionsAreFailClosedAroundKeychainWork() {
        let suiteName = "BackendRememberedLoginTransitionTests.\(UUID().uuidString)"
        guard let suiteDefaults = UserDefaults(suiteName: suiteName) else {
            XCTFail("Could not create isolated defaults suite")
            return
        }
        defer { suiteDefaults.removePersistentDomain(forName: suiteName) }
        suiteDefaults.set(true, forKey: "auth_remembered_login_enabled")

        XCTAssertTrue(
            BackendAuthClient.persistRememberedLoginCredentials(
                email: "writer@example.invalid",
                password: "secret",
                rememberEmail: true,
                savePassword: true,
                defaults: suiteDefaults,
                writeKeychain: { _, account in
                    XCTAssertEqual(account, BackendRememberedLoginCredentialPolicy.keychainAccount)
                    XCTAssertTrue(suiteDefaults.bool(forKey: "auth_remembered_login_deletion_pending"))
                    XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_enabled"))
                    return true
                },
                deleteKeychain: { _ in
                    XCTFail("Successful write should not delete the new credential")
                    return false
                }
            )
        )
        XCTAssertTrue(suiteDefaults.bool(forKey: "auth_remembered_login_enabled"))
        XCTAssertTrue(suiteDefaults.bool(forKey: "auth_remembered_login_password_enabled"))
        XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_deletion_pending"))

        XCTAssertFalse(
            BackendAuthClient.clearRememberedLoginCredentials(
                defaults: suiteDefaults,
                deleteKeychain: { account in
                    XCTAssertEqual(account, BackendRememberedLoginCredentialPolicy.keychainAccount)
                    XCTAssertTrue(suiteDefaults.bool(forKey: "auth_remembered_login_deletion_pending"))
                    XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_enabled"))
                    return false
                }
            )
        )
        XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_enabled"))
        XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_password_enabled"))
        XCTAssertTrue(suiteDefaults.bool(forKey: "auth_remembered_login_deletion_pending"))
    }

    func testClearedIntentGenerationPreventsStaleAuthenticationFromReenablingCredential() {
        let suiteName = "BackendRememberedLoginStaleIntentTests.\(UUID().uuidString)"
        guard let suiteDefaults = UserDefaults(suiteName: suiteName) else {
            XCTFail("Could not create isolated defaults suite")
            return
        }
        defer { suiteDefaults.removePersistentDomain(forName: suiteName) }
        let staleGeneration = BackendAuthClient.rememberedLoginIntentGeneration(defaults: suiteDefaults)
        BackendAuthClient.advanceRememberedLoginIntentGeneration(defaults: suiteDefaults)
        _ = BackendAuthClient.clearRememberedLoginCredentials(
            defaults: suiteDefaults,
            deleteKeychain: { _ in true }
        )
        var attemptedWrite = false

        let result = BackendAuthClient.persistRememberedLoginCredentialsIfCurrent(
            email: "writer@example.invalid",
            password: "stale-password",
            rememberEmail: true,
            savePassword: true,
            expectedGeneration: staleGeneration,
            defaults: suiteDefaults,
            writeKeychain: { _, _ in
                attemptedWrite = true
                return true
            },
            deleteKeychain: { _ in true }
        )

        XCTAssertEqual(result, .superseded)
        XCTAssertFalse(attemptedWrite)
        XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_enabled"))
    }

    func testLatestReservedAuthenticationIntentWinsOutOfOrderResponses() throws {
        let suiteName = "BackendRememberedLoginReservedIntentTests.\(UUID().uuidString)"
        guard let suiteDefaults = UserDefaults(suiteName: suiteName) else {
            XCTFail("Could not create isolated defaults suite")
            return
        }
        defer { suiteDefaults.removePersistentDomain(forName: suiteName) }
        let olderIntent = BackendAuthClient.reserveRememberedLoginIntent(defaults: suiteDefaults)
        let newerIntent = BackendAuthClient.reserveRememberedLoginIntent(defaults: suiteDefaults)
        var writtenCredential: BackendRememberedLoginCredentials?

        let olderResponse = BackendAuthClient.persistRememberedLoginCredentialsIfCurrent(
            email: "older-account@example.invalid",
            password: "older-password",
            rememberEmail: true,
            savePassword: true,
            expectedGeneration: olderIntent,
            defaults: suiteDefaults,
            writeKeychain: { _, _ in
                XCTFail("The older response must not write after a newer intent is reserved")
                return true
            },
            deleteKeychain: { _ in true }
        )
        let newerResponse = BackendAuthClient.persistRememberedLoginCredentialsIfCurrent(
            email: "newer-account@example.invalid",
            password: "newer-password",
            rememberEmail: true,
            savePassword: true,
            expectedGeneration: newerIntent,
            defaults: suiteDefaults,
            writeKeychain: { payload, _ in
                writtenCredential = try? JSONDecoder().decode(
                    BackendRememberedLoginCredentials.self,
                    from: Data(payload.utf8)
                )
                return true
            },
            deleteKeychain: { _ in true }
        )

        XCTAssertEqual(olderResponse, .superseded)
        XCTAssertEqual(newerResponse, .saved)
        XCTAssertEqual(writtenCredential?.email, "newer-account@example.invalid")
        XCTAssertEqual(writtenCredential?.password, "newer-password")
    }

    func testCurrentIntentRevokesReadsBeforeAdvancingGenerationAndWritingKeychain() {
        let suiteName = "BackendRememberedLoginIntentOrderingTests.\(UUID().uuidString)"
        guard let suiteDefaults = UserDefaults(suiteName: suiteName) else {
            XCTFail("Could not create isolated defaults suite")
            return
        }
        defer { suiteDefaults.removePersistentDomain(forName: suiteName) }
        suiteDefaults.set(true, forKey: "auth_remembered_login_enabled")
        suiteDefaults.set(true, forKey: "auth_remembered_login_password_enabled")
        let generation = BackendAuthClient.rememberedLoginIntentGeneration(defaults: suiteDefaults)

        let result = BackendAuthClient.persistRememberedLoginCredentialsIfCurrent(
            email: "writer@example.invalid",
            password: "new-password",
            rememberEmail: true,
            savePassword: true,
            expectedGeneration: generation,
            defaults: suiteDefaults,
            writeKeychain: { _, _ in
                XCTAssertTrue(suiteDefaults.bool(forKey: "auth_remembered_login_deletion_pending"))
                XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_enabled"))
                XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_password_enabled"))
                XCTAssertGreaterThan(
                    BackendAuthClient.rememberedLoginIntentGeneration(defaults: suiteDefaults),
                    generation
                )
                return true
            },
            deleteKeychain: { _ in
                XCTFail("Successful current-intent write should not delete the replacement credential")
                return false
            }
        )

        XCTAssertEqual(result, .saved)
        XCTAssertTrue(suiteDefaults.bool(forKey: "auth_remembered_login_enabled"))
        XCTAssertTrue(suiteDefaults.bool(forKey: "auth_remembered_login_password_enabled"))
        XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_deletion_pending"))
    }

    func testDisableSavedPasswordAtomicallyRewritesEmailOnly() throws {
        let suiteName = "BackendRememberedLoginDisablePasswordTests.\(UUID().uuidString)"
        guard let suiteDefaults = UserDefaults(suiteName: suiteName) else {
            XCTFail("Could not create isolated defaults suite")
            return
        }
        defer { suiteDefaults.removePersistentDomain(forName: suiteName) }
        suiteDefaults.set(true, forKey: "auth_remembered_login_enabled")
        suiteDefaults.set(true, forKey: "auth_remembered_login_password_enabled")
        let original = BackendRememberedLoginCredentials(
            email: "writer@example.invalid",
            password: "old-password"
        )
        let raw = String(data: try JSONEncoder().encode(original), encoding: .utf8)!
        var rewritten: BackendRememberedLoginCredentials?

        let result = BackendAuthClient.disableRememberedLoginPassword(
            defaults: suiteDefaults,
            readKeychain: { _ in .value(raw) },
            writeKeychain: { value, _ in
                rewritten = try? JSONDecoder().decode(
                    BackendRememberedLoginCredentials.self,
                    from: Data(value.utf8)
                )
                return true
            },
            deleteKeychain: { _ in true }
        )

        XCTAssertEqual(result, .saved)
        XCTAssertEqual(rewritten?.email, "writer@example.invalid")
        XCTAssertNil(rewritten?.password)
        XCTAssertTrue(suiteDefaults.bool(forKey: "auth_remembered_login_enabled"))
        XCTAssertNotNil(suiteDefaults.object(forKey: "auth_remembered_login_password_enabled"))
        XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_password_enabled"))
    }

    func testPasswordResetDisablesUnavailableSavedPasswordAtomically() {
        let suiteName = "BackendRememberedLoginResetUnavailableTests.\(UUID().uuidString)"
        guard let suiteDefaults = UserDefaults(suiteName: suiteName) else {
            XCTFail("Could not create isolated defaults suite")
            return
        }
        defer { suiteDefaults.removePersistentDomain(forName: suiteName) }
        suiteDefaults.set(true, forKey: "auth_remembered_login_enabled")
        suiteDefaults.set(true, forKey: "auth_remembered_login_password_enabled")
        let generation = BackendAuthClient.rememberedLoginIntentGeneration(defaults: suiteDefaults)
        var attemptedWrite = false

        let result = BackendAuthClient.updateRememberedLoginAfterPasswordReset(
            email: "writer@example.invalid",
            newPassword: "new-password",
            expectedGeneration: generation,
            defaults: suiteDefaults,
            readKeychain: { _ in .unavailable(errSecInteractionNotAllowed) },
            writeKeychain: { _, _ in
                attemptedWrite = true
                return true
            },
            deleteKeychain: { _ in false }
        )

        XCTAssertEqual(result, .disabled)
        XCTAssertFalse(attemptedWrite)
        XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_enabled"))
        XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_password_enabled"))
        XCTAssertTrue(suiteDefaults.bool(forKey: "auth_remembered_login_deletion_pending"))
    }

    func testConfirmedPasswordResetReconcilesMatchingSavedPasswordDespiteNewerWindowIntent() throws {
        let suiteName = "BackendRememberedLoginAuthoritativeResetTests.\(UUID().uuidString)"
        guard let suiteDefaults = UserDefaults(suiteName: suiteName) else {
            XCTFail("Could not create isolated defaults suite")
            return
        }
        defer { suiteDefaults.removePersistentDomain(forName: suiteName) }
        suiteDefaults.set(true, forKey: "auth_remembered_login_enabled")
        suiteDefaults.set(true, forKey: "auth_remembered_login_password_enabled")
        _ = BackendAuthClient.reserveRememberedLoginIntent(defaults: suiteDefaults)
        let remembered = BackendRememberedLoginCredentials(
            email: "writer@example.invalid",
            password: "revoked-password"
        )
        let raw = String(data: try JSONEncoder().encode(remembered), encoding: .utf8)!
        var rewritten: BackendRememberedLoginCredentials?

        let result = BackendAuthClient.reconcileRememberedLoginAfterPasswordReset(
            email: "WRITER@example.invalid",
            newPassword: "new-password",
            defaults: suiteDefaults,
            readKeychain: { _ in .value(raw) },
            writeKeychain: { value, _ in
                rewritten = try? JSONDecoder().decode(
                    BackendRememberedLoginCredentials.self,
                    from: Data(value.utf8)
                )
                return true
            },
            deleteKeychain: { _ in true }
        )

        XCTAssertEqual(result, .saved)
        XCTAssertEqual(rewritten?.email, "writer@example.invalid")
        XCTAssertEqual(rewritten?.password, "new-password")
        XCTAssertTrue(suiteDefaults.bool(forKey: "auth_remembered_login_enabled"))
        XCTAssertTrue(suiteDefaults.bool(forKey: "auth_remembered_login_password_enabled"))
    }

    func testPasswordResetDoesNotRewriteADifferentRememberedAccount() throws {
        let suiteName = "BackendRememberedLoginResetAccountBindingTests.\(UUID().uuidString)"
        guard let suiteDefaults = UserDefaults(suiteName: suiteName) else {
            XCTFail("Could not create isolated defaults suite")
            return
        }
        defer { suiteDefaults.removePersistentDomain(forName: suiteName) }
        suiteDefaults.set(true, forKey: "auth_remembered_login_enabled")
        suiteDefaults.set(true, forKey: "auth_remembered_login_password_enabled")
        let generation = BackendAuthClient.rememberedLoginIntentGeneration(defaults: suiteDefaults)
        let remembered = BackendRememberedLoginCredentials(
            email: "remembered@example.invalid",
            password: "still-valid-for-remembered-account"
        )
        let raw = String(data: try JSONEncoder().encode(remembered), encoding: .utf8)!
        var touchedKeychain = false

        let result = BackendAuthClient.updateRememberedLoginAfterPasswordReset(
            email: "reset-token-owner@example.invalid",
            newPassword: "new-password-for-token-owner",
            expectedGeneration: generation,
            defaults: suiteDefaults,
            readKeychain: { _ in .value(raw) },
            writeKeychain: { _, _ in
                touchedKeychain = true
                return true
            },
            deleteKeychain: { _ in
                touchedKeychain = true
                return true
            }
        )

        XCTAssertEqual(result, .unchanged)
        XCTAssertFalse(touchedKeychain)
        XCTAssertTrue(suiteDefaults.bool(forKey: "auth_remembered_login_enabled"))
        XCTAssertEqual(
            BackendAuthClient.rememberedLoginIntentGeneration(defaults: suiteDefaults),
            generation
        )
    }

    func testPasswordResetWithoutCanonicalEmailDeletesPasswordBearingCredential() throws {
        let suiteName = "BackendRememberedLoginResetMissingIdentityTests.\(UUID().uuidString)"
        guard let suiteDefaults = UserDefaults(suiteName: suiteName) else {
            XCTFail("Could not create isolated defaults suite")
            return
        }
        defer { suiteDefaults.removePersistentDomain(forName: suiteName) }
        suiteDefaults.set(true, forKey: "auth_remembered_login_enabled")
        suiteDefaults.set(true, forKey: "auth_remembered_login_password_enabled")
        let generation = BackendAuthClient.rememberedLoginIntentGeneration(defaults: suiteDefaults)
        let remembered = BackendRememberedLoginCredentials(
            email: "remembered@example.invalid",
            password: "obsolete-password"
        )
        let raw = String(data: try JSONEncoder().encode(remembered), encoding: .utf8)!
        var attemptedWrite = false
        var attemptedDeletion = false

        let result = BackendAuthClient.updateRememberedLoginAfterPasswordReset(
            email: "",
            newPassword: "new-password",
            expectedGeneration: generation,
            defaults: suiteDefaults,
            readKeychain: { _ in .value(raw) },
            writeKeychain: { _, _ in
                attemptedWrite = true
                return true
            },
            deleteKeychain: { _ in
                attemptedDeletion = true
                return true
            }
        )

        XCTAssertEqual(result, .disabled)
        XCTAssertFalse(attemptedWrite)
        XCTAssertTrue(attemptedDeletion)
        XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_enabled"))
        XCTAssertFalse(suiteDefaults.bool(forKey: "auth_remembered_login_deletion_pending"))
        XCTAssertGreaterThan(
            BackendAuthClient.rememberedLoginIntentGeneration(defaults: suiteDefaults),
            generation
        )
    }

    func testPasswordResetResultPreservesCanonicalEmailAfterSessionIsCleared() {
        let canonicalUser = BackendAuthUser(
            userId: "user-reset-owner",
            email: " Reset.Owner@Example.Invalid ",
            authProvider: "email",
            emailVerified: true,
            emailVerifiedAt: nil,
            createdAt: nil,
            updatedAt: nil
        )

        let result = BackendAuthClient.passwordResetResult(
            canonicalUser: canonicalUser,
            sessionState: .signedOut
        )

        XCTAssertEqual(result.sessionState, .signedOut)
        XCTAssertEqual(result.canonicalEmail, "reset.owner@example.invalid")
        XCTAssertEqual(result.rememberedLoginResult, .unchanged)
    }

    func testLatePasswordResetPreservesANewerCommittedSameAccountLogin() {
        let user = BackendAuthUser(
            userId: "user-reset-owner",
            email: "writer@example.invalid",
            authProvider: "email",
            emailVerified: true,
            emailVerifiedAt: nil,
            createdAt: nil,
            updatedAt: nil
        )
        let intent = BackendPasswordResetIntent(authIntentGeneration: 4, sessionEpoch: 9)

        XCTAssertTrue(BackendAuthClient.passwordResetShouldPreserveCurrentSession(
            intent: intent,
            currentAuthIntentGeneration: 6,
            currentSessionEpoch: 10,
            sessionStorageIsReadable: true,
            canonicalUser: user,
            currentUser: user
        ))
        XCTAssertFalse(BackendAuthClient.passwordResetShouldPreserveCurrentSession(
            intent: intent,
            currentAuthIntentGeneration: 6,
            currentSessionEpoch: 9,
            sessionStorageIsReadable: true,
            canonicalUser: user,
            currentUser: user
        ), "A newer intent that never committed must not preserve the revoked old session")
    }

    func testPasswordResetPreservesADifferentCurrentAccount() {
        let resetOwner = BackendAuthUser(
            userId: "user-a",
            email: "a@example.invalid",
            authProvider: "email",
            emailVerified: true,
            emailVerifiedAt: nil,
            createdAt: nil,
            updatedAt: nil
        )
        let currentUser = BackendAuthUser(
            userId: "user-b",
            email: "b@example.invalid",
            authProvider: "email",
            emailVerified: true,
            emailVerifiedAt: nil,
            createdAt: nil,
            updatedAt: nil
        )

        XCTAssertTrue(BackendAuthClient.passwordResetShouldPreserveCurrentSession(
            intent: BackendPasswordResetIntent(authIntentGeneration: 4, sessionEpoch: 9),
            currentAuthIntentGeneration: 4,
            currentSessionEpoch: 9,
            sessionStorageIsReadable: true,
            canonicalUser: resetOwner,
            currentUser: currentUser
        ))
    }

    func testPasswordResetAccountBindingUsesStableIDThenCanonicalEmailFallback() {
        let stableA = BackendAuthUser(
            userId: "user-a",
            email: "writer@example.invalid",
            authProvider: "email",
            emailVerified: true,
            emailVerifiedAt: nil,
            createdAt: nil,
            updatedAt: nil
        )
        let stableB = BackendAuthUser(
            userId: "user-b",
            email: "writer@example.invalid",
            authProvider: "email",
            emailVerified: true,
            emailVerifiedAt: nil,
            createdAt: nil,
            updatedAt: nil
        )
        let emailFallbackA = BackendAuthUser(
            userId: "",
            email: " Writer@Example.Invalid ",
            authProvider: "email",
            emailVerified: true,
            emailVerifiedAt: nil,
            createdAt: nil,
            updatedAt: nil
        )
        let emailFallbackB = BackendAuthUser(
            userId: "",
            email: "writer@example.invalid",
            authProvider: "email",
            emailVerified: true,
            emailVerifiedAt: nil,
            createdAt: nil,
            updatedAt: nil
        )

        XCTAssertFalse(BackendAuthClient.authUsersReferToSameAccount(stableA, stableB))
        XCTAssertTrue(BackendAuthClient.authUsersReferToSameAccount(emailFallbackA, emailFallbackB))
    }

    func testEpochDateNormalizationAcceptsBackendSecondsAndMilliseconds() {
        let timestampSeconds = 1_775_000_000.0

        XCTAssertEqual(
            themDateFromEpoch(timestampSeconds).timeIntervalSince1970,
            timestampSeconds,
            accuracy: 0.001
        )
        XCTAssertEqual(
            themDateFromEpoch(timestampSeconds * 1_000).timeIntervalSince1970,
            timestampSeconds,
            accuracy: 0.001
        )
    }

#if DEBUG
    func testLocalDemoAccountIsDebugLoopbackOnly() {
        XCTAssertEqual(BackendLocalDemoAccount.standard.email, "studio-demo@io.them.invalid")
        XCTAssertEqual(BackendLocalDemoAccount.standard.password, "ThemDemo!2026")
        XCTAssertTrue(BackendLocalDemoAccount.standard.email.hasSuffix(".invalid"))
        XCTAssertTrue(
            BackendLocalDemoAccount.isAvailable(
                baseURL: URL(string: "http://127.0.0.1:3000")!
            )
        )
        XCTAssertTrue(
            BackendLocalDemoAccount.isAvailable(
                baseURL: URL(string: "http://localhost:3137")!
            )
        )
        XCTAssertFalse(
            BackendLocalDemoAccount.isAvailable(
                baseURL: URL(string: "https://api.them.io")!
            )
        )
        XCTAssertFalse(
            BackendLocalDemoAccount.isAvailable(
                baseURL: URL(string: "https://localhost")!
            )
        )
        XCTAssertFalse(
            BackendLocalDemoAccount.isAvailable(
                baseURL: URL(string: "http://127.0.0.1:3000")!,
                isDebugBuild: false
            )
        )
    }
#endif
}

final class BackendAppleSignInNonceTests: XCTestCase {
    func testNonceHashMatchesBackendRawNonceContract() {
        XCTAssertEqual(
            BackendAppleSignInNonce.sha256Base64URL("raw-client-nonce"),
            "WCKZukLInCWUmtG7Z0RR8XrNAm1ZN2uewjntGSuXxIg"
        )
    }

    func testGeneratedNonceUsesSecureBase64URLShapeAndIsUnique() throws {
        let first = try BackendAppleSignInNonce.generateRawNonce()
        let second = try BackendAppleSignInNonce.generateRawNonce()

        XCTAssertEqual(first.count, 43)
        XCTAssertNotEqual(first, second)
        XCTAssertNotNil(first.range(of: #"^[A-Za-z0-9_-]{43}$"#, options: .regularExpression))
    }

    func testAppleRequestBodyCarriesOneShotRawNonceAndNormalizedClaims() {
        let body = BackendAuthClient.appleSignInRequestBody(
            identityToken: " token-value ",
            authorizationCode: " auth-code ",
            userIdentifier: " apple-user ",
            rawNonce: " raw-client-nonce ",
            email: " apple@example.com ",
            givenName: " Ada ",
            familyName: " Lovelace "
        )

        XCTAssertEqual(body["identity_token"], "token-value")
        XCTAssertEqual(body["authorization_code"], "auth-code")
        XCTAssertEqual(body["user_id"], "apple-user")
        XCTAssertEqual(body["raw_nonce"], "raw-client-nonce")
        XCTAssertEqual(body["email"], "apple@example.com")
        XCTAssertEqual(body["given_name"], "Ada")
        XCTAssertEqual(body["family_name"], "Lovelace")
    }

    func testAppleBackendErrorsMapToActionableMessages() {
        XCTAssertEqual(
            ProfileAppleSignInErrorPolicy.userMessage(for: "auth_apple: invalid_apple_nonce"),
            "Apple sign in could not complete its security check. Please try again."
        )
        XCTAssertEqual(
            ProfileAppleSignInErrorPolicy.userMessage(for: "auth_apple: apple_jwks_unavailable"),
            "Apple sign in is temporarily unavailable while Apple’s verification service reconnects. Please try again."
        )
        XCTAssertEqual(
            ProfileAppleSignInErrorPolicy.userMessage(for: "auth_apple: apple_subject_taken"),
            "This email is already linked to a different Apple identity. Use the original Apple account or sign in with email."
        )
        XCTAssertNil(ProfileAppleSignInErrorPolicy.userMessage(for: "unrelated_error"))
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

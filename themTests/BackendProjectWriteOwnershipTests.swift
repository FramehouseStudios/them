import Foundation
import XCTest
@testable import them

final class BackendProjectWriteOwnershipTests: XCTestCase {
    func testInitialProjectUsesAtomicEndpointAndOriginalBytesWithoutLeakingLocalScope() async throws {
        let state = ProjectWriteOwnershipState(), entry = initialEntry()
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            if request.url?.path == "/session" { state.rotateToken(); return .json(#"{"error":"unavailable"}"#, status: 503) }
            var body = request.httpBody ?? Data()
            if body.isEmpty, let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var buffer = [UInt8](repeating: 0, count: 1024)
                while true { let count = stream.read(&buffer, maxLength: buffer.count); if count <= 0 { break }; body.append(contentsOf: buffer.prefix(count)) }
            }
            let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            let initial = try XCTUnwrap(json["initial_draft"] as? [String: Any])
            XCTAssertEqual(Data(try XCTUnwrap(initial["draft"] as? String).utf8), Data(entry.draft.utf8))
            XCTAssertEqual(initial["client_request_id"] as? String, entry.id)
            XCTAssertNil(json["initialization"])
            XCTAssertNil(json["ownerUserId"])
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-Idempotency-Key"), entry.id)
            return .json(Self.mutation, status: 201)
        }
        let result = try await makeAPI(state).upsertScreenplayProject(projectId: entry.projectId, title: entry.title,
            phase: entry.phase, initialDraft: entry, initiatingIdentity: state.identity())
        XCTAssertEqual(result.payload.versionId, "version-a")
        let writes = state.requests().filter { $0.url?.path != "/session" }
        XCTAssertEqual(writes.map { $0.url!.path }, ["/screenplay/projects/initialize"])
        XCTAssertEqual(writes.first?.value(forHTTPHeaderField: "Authorization"), "Bearer fixture-rotated")
    }

    func testMissingAtomicEndpointNeverFallsBackToUnsafeMetadataThenVersion() async {
        let state = ProjectWriteOwnershipState(), entry = initialEntry()
        ProjectWriteOwnershipProtocol.handler = { request in state.record(request); return .json(#"{"error":"not_found"}"#, status: 404) }
        do {
            _ = try await makeAPI(state).upsertScreenplayProject(projectId: entry.projectId, title: entry.title,
                phase: entry.phase, initialDraft: entry, initiatingIdentity: state.identity())
            XCTFail("An unavailable atomic endpoint was acknowledged.")
        } catch BackendMemoryAPIError.server(let status, _) { XCTAssertEqual(status, 404) }
        catch { XCTFail("Unexpected error: \(error)") }
        XCTAssertEqual(state.requests().filter { $0.url?.path != "/session" }.map { $0.url!.path }, ["/screenplay/projects/initialize"])
    }

    func testInitialProjectCannotBeSentToADifferentBackend() async {
        let state = ProjectWriteOwnershipState()
        var entry = initialEntry()
        entry.initialization = .init(documentID: "document-a", backendURL: URL(string: "https://other.example.test")!, sourceProjectID: "")
        ProjectWriteOwnershipProtocol.handler = { request in state.record(request); return .json(#"{"error":"unavailable"}"#, status: 503) }
        await assertSuperseded {
            _ = try await makeAPI(state).upsertScreenplayProject(projectId: entry.projectId, title: entry.title,
                phase: entry.phase, initialDraft: entry, initiatingIdentity: state.identity())
        }
        XCTAssertTrue(state.requests().isEmpty, "Wrong-origin work must not send /session credentials")
    }

    private func initialEntry() -> ScreenplayDraftSaveOutboxEntry {
        var entry = ScreenplayDraftSaveOutboxEntry(id: "request-initial", projectId: "project-a", ownerUserId: "writer-a",
            draft: "\r\nCafe\u{0301}. \t ", title: "A", phase: "scene_draft", notes: "Initial draft", source: "studio_initial_seed",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "", createdAt: 1, updatedAt: 1,
            status: .pending, retries: 0, nextAttemptAt: 0, lastError: "")
        entry.initialization = .init(documentID: "document-a", backendURL: URL(string: "https://project-write-ownership.test")!, sourceProjectID: "")
        return entry
    }

    func testDataControlsCannotSendToABackendOtherThanTheConfirmedOrigin() async {
        for kind in 0..<3 {
            let state = ProjectWriteOwnershipState()
            ProjectWriteOwnershipProtocol.handler = { request in
                state.record(request)
                return .json(#"{"error":"unavailable"}"#, status: 503)
            }
            let api = makeAPI(state), owner = state.identity(), confirmed = URL(string: "https://original-backend.test")!
            await assertSuperseded {
                switch kind {
                case 0: _ = try await api.clearHistory(initiatingIdentity: owner, backendURL: confirmed)
                case 1: _ = try await api.clearMemories(initiatingIdentity: owner, backendURL: confirmed)
                default: _ = try await api.exportAccountData(initiatingIdentity: owner, backendURL: confirmed)
                }
            }
            XCTAssertTrue(state.requests().isEmpty, "Wrong-origin work must not send /session credentials")
        }
    }

    func testDataControlsCannotAdoptAccountChangedDuringBootstrapOrResponse() async {
        for kind in 0..<3 {
            for duringBootstrap in [true, false] {
                let state = ProjectWriteOwnershipState()
                ProjectWriteOwnershipProtocol.handler = { request in
                    state.record(request)
                    if request.url?.path == "/session" {
                        if duringBootstrap { state.changeOwner() }
                        return .json(#"{"error":"unavailable"}"#, status: 503)
                    }
                    state.changeOwner()
                    return .json(#"{"ok":true,"state_version":"stale-owner-state"}"#)
                }
                let api = makeAPI(state), owner = state.identity()
                await assertSuperseded {
                    switch kind {
                    case 0: _ = try await api.clearHistory(initiatingIdentity: owner)
                    case 1: _ = try await api.clearMemories(initiatingIdentity: owner)
                    default: _ = try await api.exportAccountData(initiatingIdentity: owner)
                    }
                }
                let requests = state.requests().filter { $0.url?.path != "/session" }
                XCTAssertEqual(requests.count, duringBootstrap ? 0 : 1)
                XCTAssertTrue(requests.allSatisfy { $0.value(forHTTPHeaderField: "X-User-Id") == "writer-a" })
            }
        }
    }

    override func tearDown() {
        ProjectWriteOwnershipProtocol.handler = nil
        ProjectWriteOwnershipProtocol.interceptAllRequests = false
        super.tearDown()
    }

    func testStudioHistoryCannotSendOriginalTextToAnotherBackend() async {
        for annotation in [false, true] {
            let state = ProjectWriteOwnershipState()
            ProjectWriteOwnershipProtocol.handler = { request in
                state.record(request)
                return .json(#"{"error":"unavailable"}"#, status: 503)
            }
            do {
                let api = makeAPI(state), origin = URL(string: "https://original-studio.test")!
                if annotation {
                    _ = try await api.annotateTurnHistory(turnId: "turn-a", studioMetadata: Self.studioMetadata,
                        expectedBackendURL: origin, initiatingIdentity: state.identity())
                } else {
                    _ = try await api.commitRealtimeTurn(userMessage: "Original story", assistantMessage: "Original scene",
                        expectedBackendURL: origin, initiatingIdentity: state.identity())
                }
                XCTFail("An original Studio request followed another backend.")
            } catch BackendMemoryAPIError.server(let status, let message) {
                XCTAssertEqual(status, 409); XCTAssertEqual(message, "backend_request_superseded")
            } catch { XCTFail("Unexpected error: \(error)") }
            XCTAssertTrue(state.requests().isEmpty, "Even /session credentials must stay off the changed backend")
        }
    }

    func testStudioHistoryAcceptsTheCapturedBackendAndRefreshedSameOwner() async throws {
        for annotation in [false, true] {
            let state = ProjectWriteOwnershipState()
            ProjectWriteOwnershipProtocol.handler = { request in
                state.record(request)
                if request.url?.path == "/session" { state.rotateToken(); return .json(#"{"error":"unavailable"}"#, status: 503) }
                return .json(#"{"ok":true,"action":"saved","status":"saved","turn_id":"turn-a","state_version":"owned-state"}"#)
            }
            let api = makeAPI(state), owner = state.identity(), origin = URL(string: "https://project-write-ownership.test")!
            if annotation {
                _ = try await api.annotateTurnHistory(turnId: "turn-a", studioMetadata: Self.studioMetadata,
                    expectedBackendURL: origin, initiatingIdentity: owner)
            } else {
                _ = try await api.commitRealtimeTurn(userMessage: "Original story", assistantMessage: "Original scene",
                    expectedBackendURL: origin, initiatingIdentity: owner)
            }
            let writes = state.requests().filter { $0.url?.path != "/session" }
            XCTAssertEqual(writes.count, 1)
            XCTAssertEqual(writes.first?.value(forHTTPHeaderField: "Authorization"), "Bearer fixture-rotated")
            let sync = await api.currentSyncState()
            XCTAssertEqual(sync.stateVersion, "owned-state")
        }
    }

    func testCapturedOriginIdentityCannotBootstrapToAnotherHostSchemeOrPort() async {
        for expected in ["https://original-studio.test", "http://project-write-ownership.test", "https://project-write-ownership.test:8443"] {
            let state = ProjectWriteOwnershipState()
            ProjectWriteOwnershipProtocol.handler = { request in
                state.record(request)
                return .json(#"{"error":"unavailable"}"#, status: 503)
            }
            do {
                _ = try await makeAPI(state).screenplayRequestIdentity(state.identity(), expectedBackendURL: URL(string: expected)!)
                XCTFail("An operation with a foreign captured origin reached bootstrap")
            } catch BackendMemoryAPIError.server(let status, let message) {
                XCTAssertEqual(status, 409); XCTAssertEqual(message, "backend_request_superseded")
            } catch { XCTFail("Unexpected error: \(error)") }
            XCTAssertTrue(state.requests().isEmpty, "Rejected origin sent a credential-bearing request")
        }
    }

    func testCapturedOriginIdentityStillBootstrapsAndAcceptsSameOwnerTokenRefresh() async throws {
        let state = ProjectWriteOwnershipState()
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request); state.rotateToken()
            return .json(#"{"error":"unavailable"}"#, status: 503)
        }
        let owner = state.identity(), origin = URL(string: "https://PROJECT-WRITE-OWNERSHIP.test:443")!
        let refreshed = try await makeAPI(state).screenplayRequestIdentity(owner, expectedBackendURL: origin)
        XCTAssertEqual(refreshed.ownerContext, owner.ownerContext)
        XCTAssertEqual(refreshed.accessToken, "fixture-rotated")
        XCTAssertEqual(state.requests().map { $0.url!.path }, ["/session"])
        XCTAssertTrue(state.requests().allSatisfy { OfflineTalkRecoveryScope.sameBackend($0.url!, origin) })
        XCTAssertEqual(state.requests().first?.value(forHTTPHeaderField: "Authorization"), "Bearer fixture-access")
        XCTAssertEqual(state.requests().first?.value(forHTTPHeaderField: "X-Client-Token"), "fixture-client")
    }

    func testCancelledSuccessfulBootstrapCannotPublishAfterBackendAdoption() async throws {
        // Health adoption cancels the old flight; this proves cancellation
        // and the metadata caller's post-await fence, not completion parsing.
        // All HTTP remains inside this API's injected URLProtocol.
        let key = "backend_base_url", previous = UserDefaults.standard.object(forKey: "backend_base_url")
        defer {
            if let previous { BackendUserDefaultsStore.set(previous, forKey: key) }
            else { BackendUserDefaultsStore.removeObject(forKey: key) }
        }
        let originA = URL(string: "https://project-write-ownership.test:4443")!
        let originB = URL(string: "https://project-write-ownership.test:4444")!
        let storage = ProjectBootstrapIdentitySnapshot()
        defer { storage.restore() }
        let state = ProjectWriteOwnershipState()
        let api = try await makeOriginDriftAPI(state, origin: originA)
        let initialOrigin = await api.baseURL()
        XCTAssertTrue(OfflineTalkRecoveryScope.sameBackend(initialOrigin, originA))
        let tokenA = "fixture-held-origin-a"
        let started = expectation(description: "original successful session bootstrap awaits its response")
        let gate = ProjectWriteOwnershipReplyGate(started: started)
        defer { gate.release() }
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            if request.url?.path == "/session" {
                return .init(status: 200, data: Data(Self.sessionResponse(token: tokenA).utf8), gate: gate)
            }
            return .json(OfflineTalkRecoveryScope.sameBackend(request.url!, originB) ? #"{"ok":true}"# : #"{"error":"unavailable"}"#,
                status: OfflineTalkRecoveryScope.sameBackend(request.url!, originB) ? 200 : 503)
        }
        let owner = state.identity()
        let pending = Task { try await api.screenplayRequestIdentity(owner, expectedBackendURL: originA) }
        await fulfillment(of: [started], timeout: 3)
        BackendUserDefaultsStore.set(originB.absoluteString, forKey: key)
        _ = try await api.fetchHealth()
        let changedOrigin = await api.baseURL()
        XCTAssertTrue(OfflineTalkRecoveryScope.sameBackend(changedOrigin, originB))
        gate.release()
        do {
            _ = try await pending.value
            XCTFail("The original operation adopted the backend changed during bootstrap")
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409); XCTAssertEqual(message, "backend_request_superseded")
        } catch { XCTFail("Unexpected error: \(error)") }
        let sessions = state.requests().filter { $0.url?.path == "/session" }
        XCTAssertEqual(sessions.count, 1)
        XCTAssertTrue(sessions.allSatisfy { OfflineTalkRecoveryScope.sameBackend($0.url!, originA) })
        XCTAssertTrue(state.requests().allSatisfy { ["/bridge", "/health", "/session"].contains($0.url!.path) })
        XCTAssertTrue(BackendAuthClient.sharedClientToken() != tokenA, "Stale successful A token was persisted")
        let sync = await api.currentSyncState()
        XCTAssertNotEqual(sync.stateVersion, "origin-a-state")
        // A generic B bootstrap must not inherit an A result cached before
        // the original metadata caller noticed the changed origin.
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request); return .json(#"{"error":"unavailable"}"#, status: 503)
        }
        do { _ = try await api.bootstrapSession(); XCTFail("B reused A's stale cached session") }
        catch BackendMemoryAPIError.server(let status, _) { XCTAssertEqual(status, 503) }
        catch { XCTFail("Unexpected error: \(error)") }
        let finalSessions = state.requests().filter { $0.url?.path == "/session" }
        XCTAssertEqual(finalSessions.count, 2)
        XCTAssertTrue(finalSessions.last.map { OfflineTalkRecoveryScope.sameBackend($0.url!, originB) } ?? false)
    }

    func testSuccessfulBootstrapRejectsAnActualForeignResponseOriginBeforePublication() async throws {
        let storage = ProjectBootstrapIdentitySnapshot()
        defer { storage.restore() }
        let state = ProjectWriteOwnershipState(), token = "fixture-wrong-response-origin"
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            return .init(status: 200, data: Data(Self.sessionResponse(token: token).utf8),
                responseURL: URL(string: "https://foreign-origin.test/session"))
        }
        let api = makeAPI(state)
        do { _ = try await api.bootstrapSession(force: true); XCTFail("A foreign bootstrap response was published") }
        catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409); XCTAssertEqual(message, "session_bootstrap_superseded")
        } catch { XCTFail("Unexpected error: \(error)") }
        XCTAssertTrue(BackendAuthClient.sharedClientToken() != token, "Foreign response token reached the canonical store")
        let sync = await api.currentSyncState()
        XCTAssertNotEqual(sync.stateVersion, "origin-a-state")
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request); return .json(#"{"error":"unavailable"}"#, status: 503)
        }
        do { _ = try await api.bootstrapSession(); XCTFail("The foreign result was cached") }
        catch BackendMemoryAPIError.server(let status, _) { XCTAssertEqual(status, 503) }
        catch { XCTFail("Unexpected error: \(error)") }
        XCTAssertEqual(state.requests().map { $0.url!.path }, ["/session", "/session"])
    }

    func testSuccessfulCachedSessionCannotFollowHealthyBackendAdoption() async throws {
        let key = "backend_base_url", previous = UserDefaults.standard.object(forKey: "backend_base_url")
        let storage = ProjectBootstrapIdentitySnapshot()
        defer {
            storage.restore()
            if let previous { BackendUserDefaultsStore.set(previous, forKey: key) }
            else { BackendUserDefaultsStore.removeObject(forKey: key) }
        }
        let originA = URL(string: "https://project-write-ownership.test:4453")!
        let originB = URL(string: "https://project-write-ownership.test:4454")!
        let state = ProjectWriteOwnershipState(), tokenA = "fixture-cached-origin-a"
        let api = try await makeOriginDriftAPI(state, origin: originA)
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request); return .json(Self.sessionResponse(token: tokenA))
        }
        let cached = try await api.bootstrapSession(force: true)
        XCTAssertEqual(cached.clientToken, tokenA)
        XCTAssertEqual(BackendAuthClient.sharedClientTokenBaseURL(), originA.absoluteString)
        BackendUserDefaultsStore.set(originB.absoluteString, forKey: key)
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            let healthy = request.url?.path != "/session" && OfflineTalkRecoveryScope.sameBackend(request.url!, originB)
            return .json(healthy ? #"{"ok":true}"# : #"{"error":"unavailable"}"#, status: healthy ? 200 : 503)
        }
        _ = try await api.fetchHealth()
        do { _ = try await api.bootstrapSession(); XCTFail("Backend B received a cached A session") }
        catch BackendMemoryAPIError.server(let status, _) { XCTAssertEqual(status, 503) }
        catch { XCTFail("Unexpected error: \(error)") }
        let sessions = state.requests().filter { $0.url?.path == "/session" }
        XCTAssertEqual(sessions.count, 2)
        XCTAssertTrue(sessions.first.map { OfflineTalkRecoveryScope.sameBackend($0.url!, originA) } ?? false)
        XCTAssertTrue(sessions.last.map { OfflineTalkRecoveryScope.sameBackend($0.url!, originB) } ?? false)
        XCTAssertEqual(BackendAuthClient.sharedClientTokenBaseURL(), originA.absoluteString, "A token was rebound to B")
    }

    private func makeOriginDriftAPI(_ state: ProjectWriteOwnershipState, origin: URL) async throws -> BackendMemoryAPI {
        ProjectWriteOwnershipProtocol.interceptAllRequests = true
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            let healthy = OfflineTalkRecoveryScope.sameBackend(request.url!, origin)
            return .json(healthy ? #"{"ok":true}"# : #"{"error":"unavailable"}"#, status: healthy ? 200 : 503)
        }
        BackendUserDefaultsStore.set(origin.absoluteString, forKey: "backend_base_url")
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ProjectWriteOwnershipProtocol.self]
        let api = BackendMemoryAPI(session: URLSession(configuration: configuration), requestIdentityProvider: { _ in state.identity() })
        _ = try await api.fetchHealth()
        return api
    }

    private static func sessionResponse(token: String) -> String {
        #"{"client_token":""# + token + #"","expires_in":3600,"remembered_names":[],"state_version":"origin-a-state"}"#
    }

    private static let studioMetadata = BackendStudioThreadCommitMetadata(screenplayProjectId: "project-a",
        screenplayDocumentRevisionId: "", screenplayTarget: "page", screenplayPromptSource: "typed",
        screenplayWriteId: "", screenplayAnchorLine: nil, screenplayAnchorEndLine: nil, screenplayInsertionMode: "",
        screenplayAnchorSceneLabel: "", screenplayAnchorDraftSceneId: "", screenplayAnchorOutlineSceneId: "",
        screenplayAnchorOutlineBeatIds: [], screenplayAnchorScriptNodeId: "", screenplayNoteTitle: "", screenplayNoteBody: "",
        screenplayInsertedText: "Exact scene", screenplayReplacementApplied: false, screenplayReplacedWriteId: "",
        screenplayRevisedBlockText: "", screenplayResolvedAnchorExcerpt: "")

    func testMetadataWriteCannotAdoptAccountChangedDuringBootstrap() async throws {
        try await assertBootstrapSwitchIsRejected(version: false)
    }

    func testVersionWriteCannotAdoptAccountChangedDuringBootstrap() async throws {
        try await assertBootstrapSwitchIsRejected(version: true)
    }

    func testQuestionResolutionCannotFollowAccountChangedDuringBootstrap() async {
        await assertConversationBootstrapSwitch(question: true)
    }

    func testRealtimeCommitCannotFollowAccountChangedDuringBootstrap() async {
        await assertConversationBootstrapSwitch(question: false)
    }

    private func assertConversationBootstrapSwitch(question: Bool) async {
        let state = ProjectWriteOwnershipState()
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            if request.url?.path == "/session" {
                state.changeOwner()
                return .json(#"{"error":"unavailable"}"#, status: 503)
            }
            return .json(#"{"ok":true,"action":"saved","status":"saved","question_id":"question-a","response_status":"answered","state_version":"stale-owner-state"}"#)
        }
        let api = makeAPI(state)
        await assertSuperseded {
            if question {
                _ = try await api.resolvePendingScreenplayQuestion(Self.pendingQuestion, responseStatus: "answered", answer: "Exact answer", initiatingIdentity: state.identity())
            } else {
                _ = try await api.commitRealtimeTurn(userMessage: "My story", assistantMessage: "A scene", requestId: "request-a", initiatingIdentity: state.identity())
            }
        }
        XCTAssertEqual(state.requests().filter { $0.url?.path == "/session" }.count, 1)
        XCTAssertEqual(state.requests().filter { $0.url?.path != "/session" }.count, 0)
    }

    func testCharacterMemoryBatchDoesNotMoveRemainingMentionsToNewAccount() async {
        let state = ProjectWriteOwnershipState()
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            if request.url?.path == "/session" { return .json(#"{"error":"unavailable"}"#, status: 503) }
            state.changeOwner()
            return .json(#"{"ok":true,"character_name":"JOHN"}"#)
        }
        let api = makeAPI(state)
        await assertSuperseded {
            try await api.recordCharacterMentionsFromScreenplayReply([
                .init(characterName: "JOHN", line: 1, tags: []), .init(characterName: "SAM", line: 3, tags: [])
            ], writeID: "write-a", projectID: "project-a", initiatingIdentity: state.identity())
        }
        XCTAssertEqual(state.requests().filter { $0.url?.path == "/memory/record-character-mention" }.count, 1)
    }

    private static let pendingQuestion = BackendPendingScreenplayQuestion(id: "question-a", projectId: "project-a",
        projectTitle: "A", targetField: "theme", targetLabel: "Theme", question: "What is it about?",
        provisionalOptions: nil, askedAt: nil)

    func testSupersededOfflineQuestionIsNotEnqueued() async {
        let state = ProjectWriteOwnershipState()
        let before = await OfflineTalkOutbox.shared.allEntries().map(\.id)
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            if request.url?.path == "/session" { return .json(#"{"error":"unavailable"}"#, status: 503) }
            state.changeOwner()
            throw URLError(.notConnectedToInternet)
        }
        await assertSuperseded {
            _ = try await makeAPI(state).resolvePendingScreenplayQuestion(Self.pendingQuestion,
                responseStatus: "answered", answer: "Keep my words", initiatingIdentity: state.identity())
        }
        let after = await OfflineTalkOutbox.shared.allEntries().map(\.id)
        XCTAssertEqual(after, before)
        XCTAssertEqual(state.requests().filter { $0.url?.path != "/session" }.count, 1)
    }

    func testReadSyncCacheClearsOnNewOwnerButNotTokenRotation() async throws {
        for changedOwner in [true, false] {
            let state = ProjectWriteOwnershipState()
            ProjectWriteOwnershipProtocol.handler = { request in
                state.record(request)
                if request.url?.path == "/session" { return .json(#"{"error":"unavailable"}"#, status: 503) }
                return .json(#"{"screenplay_projects":[],"state_version":"first-owner-state"}"#)
            }
            let api = makeAPI(state)
            _ = try await api.fetchScreenplayProjects(initiatingIdentity: state.identity())
            if changedOwner { state.changeOwner() } else { state.rotateToken() }
            ProjectWriteOwnershipProtocol.handler = { _ in .json(#"{"error":"unavailable"}"#, status: 503) }
            do {
                _ = try await api.fetchScreenplayProjects(initiatingIdentity: state.identity())
                XCTFail("Expected the controlled backend outage.")
            } catch BackendMemoryAPIError.server(let status, _) { XCTAssertEqual(status, 503) }
            let sync = await api.currentSyncState()
            XCTAssertEqual(sync.stateVersion, changedOwner ? "" : "first-owner-state")
        }
    }

    func testConversationWritesAcceptSameOwnerTokenRotation() async throws {
        for kind in 0..<3 {
            let state = ProjectWriteOwnershipState()
            let owner = state.identity()
            ProjectWriteOwnershipProtocol.handler = { request in
                state.record(request)
                if request.url?.path == "/session" {
                    state.rotateToken()
                    return .json(#"{"error":"unavailable"}"#, status: 503)
                }
                return .json(#"{"ok":true,"action":"saved","status":"saved","question_id":"question-a","response_status":"answered","state_version":"valid-owner-state"}"#)
            }
            let api = makeAPI(state)
            switch kind {
            case 0:
                _ = try await api.resolvePendingScreenplayQuestion(Self.pendingQuestion,
                    responseStatus: "answered", answer: "Exact answer", initiatingIdentity: owner)
            case 1:
                _ = try await api.commitRealtimeTurn(userMessage: "My story", assistantMessage: "A scene", initiatingIdentity: owner)
            default:
                try await api.recordCharacterMentionsFromScreenplayReply([
                    .init(characterName: "JOHN", line: 1, tags: []), .init(characterName: "SAM", line: 3, tags: [])
                ], writeID: "write-a", projectID: "project-a", initiatingIdentity: owner)
            }
            let writes = state.requests().filter { $0.url?.path != "/session" }
            XCTAssertEqual(writes.count, kind == 2 ? 2 : 1)
            XCTAssertTrue(writes.allSatisfy { $0.value(forHTTPHeaderField: "X-User-Id") == "writer-a" })
            XCTAssertTrue(writes.allSatisfy { $0.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-rotated" })
        }
    }

    func testDerivedScreenplayRequestsCannotAdoptAccountDuringBootstrap() async {
        await assertDerivedRequestBoundary(late: false)
    }

    func testDerivedScreenplayRequestsRejectLateResponsesFromPreviousLogin() async {
        await assertDerivedRequestBoundary(late: true)
    }

    private func assertDerivedRequestBoundary(late: Bool) async {
        for kind in 0..<10 {
            let state = ProjectWriteOwnershipState()
            let owner = state.identity()
            ProjectWriteOwnershipProtocol.handler = { request in
                state.record(request)
                if request.url?.path == "/session" {
                    if !late { state.changeOwner() }
                    return .json(#"{"error":"unavailable"}"#, status: 503)
                }
                state.changeOwner()
                return .json(#"{"ok":true,"action":"saved"}"#)
            }
            let api = makeAPI(state)
            await assertSuperseded {
                switch kind {
                case 0: _ = try await api.paginateScreenplayDraft(draft: "INT. ROOM - NIGHT\n\nExact words", initiatingIdentity: owner)
                case 1: _ = try await api.fetchScreenplayRevisionColors(baseDraft: "A", draft: "B", initiatingIdentity: owner)
                case 2: _ = try await api.fetchScreenplayCoverage(draft: "Exact draft", initiatingIdentity: owner)
                case 3: _ = try await api.exportScreenplayDraft(draft: "Exact draft", format: "fountain", initiatingIdentity: owner)
                case 4: _ = try await api.exportScreenplayDraft(draft: "Exact draft", format: "fdx", initiatingIdentity: owner)
                case 5: _ = try await api.fetchScreenplayExportFormats(initiatingIdentity: owner)
                case 6: _ = try await api.importFountainDraft(text: "Exact draft", initiatingIdentity: owner)
                case 7: _ = try await api.recordFirstPageWritten(occurredAt: Date(timeIntervalSince1970: 0), source: "fixture", projectId: "project-a", versionId: "version-a", initiatingIdentity: owner)
                case 8: _ = try await api.commitRealtimeTurn(userMessage: "Exact story", assistantMessage: "A scene", initiatingIdentity: owner)
                default: _ = try await api.resolvePendingScreenplayQuestion(Self.pendingQuestion, responseStatus: "answered", answer: "Exact answer", initiatingIdentity: owner)
                }
            }
            XCTAssertEqual(state.requests().filter { $0.url?.path == "/session" }.count, 1, "route \(kind)")
            let scoped = state.requests().filter { $0.url?.path != "/session" }
            XCTAssertEqual(scoped.count, late ? 1 : 0, "route \(kind)")
            XCTAssertTrue(scoped.allSatisfy { $0.value(forHTTPHeaderField: "X-User-Id") == "writer-a" })
            let sync = await api.currentSyncState()
            XCTAssertNotEqual(sync.stateVersion, "stale-owner-state")
        }
    }

    func testActivationCannotFollowAnAccountChangeDuringBootstrap() async {
        await assertRemainingMutationBootstrapSwitch(outline: false)
    }

    func testOutlineCannotFollowAnAccountChangeDuringBootstrap() async {
        await assertRemainingMutationBootstrapSwitch(outline: true)
    }

    private func assertRemainingMutationBootstrapSwitch(outline: Bool) async {
        let state = ProjectWriteOwnershipState()
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            if request.url?.path == "/session" {
                state.changeOwner()
                return .json(#"{"error":"user_auth_required"}"#, status: 401)
            }
            return .json(Self.mutation, status: 201)
        }
        let api = makeAPI(state)
        await assertSuperseded {
            if outline {
                _ = try await api.upsertScreenplayOutline(projectId: "project-a", acts: [], scenes: [], beats: [],
                    expectedOutlineRevision: 0, clientRequestId: "owned-outline", initiatingIdentity: state.identity())
            } else { _ = try await api.activateScreenplayProject(projectId: "project-a", initiatingIdentity: state.identity()) }
        }
        XCTAssertEqual(state.requests().filter { $0.url?.path == "/session" }.count, 1,
                       "The reproduction must reach the actual bootstrap await.")
        XCTAssertTrue(state.requests().filter { $0.url?.path.hasPrefix("/screenplay/projects") == true }.isEmpty)
    }

    func testRemainingScreenplayRoutesRejectChangedOwnerDuringBootstrap() async {
        await assertRemainingRoutes(mode: .bootstrapSwitch)
    }

    func testRemainingScreenplayRoutesRejectSameUserNewLoginDuringBootstrap() async {
        await assertRemainingRoutes(mode: .loginSwitch)
    }

    func testRemainingScreenplayRoutesRejectLateSuccessOrOutlineConflict() async {
        await assertRemainingRoutes(mode: .lateReply)
    }

    func testRemainingScreenplayRoutesPinCheckedHeadersInsteadOfAdoptingNextOwner() async {
        await assertRemainingRoutes(mode: .headerSwitch)
    }

    func testRemainingScreenplayRoutesAcceptSameOwnerTokenRotation() async {
        await assertRemainingRoutes(mode: .rotation)
    }

    func testRemainingScreenplayRoutesRejectOwnerChangedBeforeActorAdmission() async {
        await assertRemainingRoutes(mode: .admissionSwitch)
    }

    private enum RouteBoundary { case bootstrapSwitch, loginSwitch, lateReply, headerSwitch, rotation, admissionSwitch }

    private func assertRemainingRoutes(mode: RouteBoundary) async {
        for route in ScreenplayOwnedRoute.allCases {
            let state = ProjectWriteOwnershipState()
            let owner = state.identity()
            if mode == .admissionSwitch { state.changeOwner() }
            ProjectWriteOwnershipProtocol.handler = { request in
                state.record(request)
                if request.url?.path == "/session" {
                    switch mode {
                    case .bootstrapSwitch: state.changeOwner()
                    case .loginSwitch: state.changeOwner(sameUser: true)
                    case .headerSwitch: state.changeAfterNextSnapshot()
                    case .rotation: state.rotateToken()
                    default: break
                    }
                    return .json(#"{"error":"unavailable"}"#, status: 503)
                }
                if mode == .lateReply { state.changeOwner() }
                return .json(Self.routeEnvelope, status: mode == .lateReply && route == .outlineWrite ? 409 : 200)
            }
            let api = makeAPI(state)
            let operation = { try await route.perform(api, owner: owner) }
            if mode == .rotation {
                do { try await operation() } catch { XCTFail("\(route) rejected valid rotation: \(error)") }
                let sync = await api.currentSyncState()
                XCTAssertEqual(sync.stateVersion, "stale-owner-state", "\(route)")
            } else {
                await assertSuperseded(operation)
                let sync = await api.currentSyncState()
                XCTAssertNotEqual(sync.stateVersion, "stale-owner-state", "\(route)")
            }
            let requests = state.requests()
            XCTAssertEqual(requests.filter { $0.url?.path == "/session" }.count,
                           mode == .admissionSwitch ? 0 : 1, "\(route): exercise bootstrap, not an early fixture mismatch")
            let scoped = requests.filter { $0.url?.path != "/session" }
            let expectsRequest = mode == .lateReply || mode == .headerSwitch || mode == .rotation
            XCTAssertEqual(scoped.count, expectsRequest ? 1 : 0, "\(route)")
            XCTAssertTrue(scoped.allSatisfy { $0.value(forHTTPHeaderField: "X-User-Id") == "writer-a" }, "\(route)")
            if mode == .rotation {
                XCTAssertEqual(scoped.first?.value(forHTTPHeaderField: "Authorization"), "Bearer fixture-rotated", "\(route)")
            }
        }
    }

    private enum ScreenplayOwnedRoute: CaseIterable {
        case activation, outlineWrite, scene, beat, collaboratorWrite, commentWrite, companionWrite
        case projects, project, outline, collaborators, comments, companion

        func perform(_ api: BackendMemoryAPI, owner: BackendAuthRequestIdentity) async throws {
            switch self {
            case .activation:
                _ = try await api.activateScreenplayProject(projectId: "project-a", initiatingIdentity: owner)
            case .outlineWrite:
                _ = try await api.upsertScreenplayOutline(projectId: "project-a", acts: [], scenes: [], beats: [],
                    expectedOutlineRevision: 0, clientRequestId: "request-a", initiatingIdentity: owner)
            case .scene:
                _ = try await api.upsertScreenplayScene(projectId: "project-a", scene: .init(title: "A"), initiatingIdentity: owner)
            case .beat:
                _ = try await api.upsertScreenplayBeat(projectId: "project-a", beat: .init(label: "A"), initiatingIdentity: owner)
            case .collaboratorWrite:
                _ = try await api.upsertScreenplayCollaborator(projectId: "project-a", email: "writer@example.invalid", initiatingIdentity: owner)
            case .commentWrite:
                _ = try await api.upsertScreenplayComment(projectId: "project-a", text: "Exact comment", initiatingIdentity: owner)
            case .companionWrite:
                let analytics = try JSONDecoder().decode(ScreenplayCompanionAnalyticsSnapshot.self, from: Data("{}".utf8))
                let result = try await api.updateScreenplayCompanionState(mode: .coWriter, recentTurns: [],
                    analytics: analytics, signals: .empty, initiatingIdentity: owner)
                XCTAssertEqual(result.payload.analytics.updatedAt.timeIntervalSince1970, 1_700_000_000)
            case .projects:
                _ = try await api.fetchScreenplayProjects(initiatingIdentity: owner)
            case .project:
                _ = try await api.fetchScreenplayProject(projectId: "project-a", initiatingIdentity: owner)
            case .outline:
                _ = try await api.fetchScreenplayOutline(projectId: "project-a", initiatingIdentity: owner)
            case .collaborators:
                _ = try await api.fetchScreenplayCollaborators(projectId: "project-a", initiatingIdentity: owner)
            case .comments:
                _ = try await api.fetchScreenplayComments(projectId: "project-a", initiatingIdentity: owner)
            case .companion:
                let result = try await api.fetchScreenplayCompanionState(initiatingIdentity: owner)
                XCTAssertEqual(result.payload.analytics.updatedAt.timeIntervalSince1970, 1_700_000_000)
            }
        }
    }

    private static let routeEnvelope = #"{"state_version":"stale-owner-state","screenplay_projects":[],"collaborators":[],"comments":[],"analytics":{"updatedAt":"2023-11-14T22:13:20Z"}}"#

    func testSameAccountNewLoginIntentAlsoInvalidatesPendingWrites() async throws {
        for version in [false, true] { try await assertBootstrapSwitchIsRejected(version: version, sameUser: true) }
    }

    private func assertBootstrapSwitchIsRejected(version: Bool, sameUser: Bool = false) async throws {
        let state = ProjectWriteOwnershipState()
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            if request.url?.path == "/session" {
                // Change the actual header provider while production bootstrap
                // is awaiting transport. Its error must not resume as writer B.
                state.changeOwner(sameUser: sameUser)
                return .json(#"{"error":"user_auth_required"}"#, status: 401)
            }
            return .json(Self.mutation, status: 201)
        }
        let api = makeAPI(state)
        await assertSuperseded {
            if version { _ = try await api.upsertScreenplayProjectVersion(projectId: "project-a", draft: "Writer A's exact words", initiatingIdentity: state.identity()) }
            else { _ = try await api.upsertScreenplayProject(title: "Writer A's story", initiatingIdentity: state.identity()) }
        }
        XCTAssertTrue(state.requests().filter { $0.url?.path.hasPrefix("/screenplay/projects") == true }.isEmpty,
                      "Old work must not be sent using the new account's headers.")
    }

    func testLateMetadataReplyCannotPublishAnotherOwnersSyncState() async throws {
        try await assertLateReplyIsRejected(version: false)
    }

    func testLateVersionConflictCannotPublishAnotherOwnersSyncState() async throws {
        try await assertLateReplyIsRejected(version: true)
    }

    private func assertLateReplyIsRejected(version: Bool) async throws {
        let state = ProjectWriteOwnershipState()
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            if request.url?.path == "/session" { return .json(#"{"error":"unavailable"}"#, status: 503) }
            state.changeOwner()
            return .json(Self.mutation, status: version ? 409 : 201)
        }
        let api = makeAPI(state)
        await assertSuperseded {
            if version { _ = try await api.upsertScreenplayProjectVersion(projectId: "project-a", draft: "Writer A's words", initiatingIdentity: state.identity()) }
            else { _ = try await api.upsertScreenplayProject(title: "Writer A's story", initiatingIdentity: state.identity()) }
        }
        let current = await api.currentSyncState()
        XCTAssertNotEqual(current.stateVersion, "stale-owner-state", "Stale responses must not emit current-owner sync state.")
        let writes = state.requests().filter { $0.url?.path.hasPrefix("/screenplay/projects") == true }
        XCTAssertEqual(writes.count, 1)
        XCTAssertEqual(writes.first?.value(forHTTPHeaderField: "X-User-Id"), "writer-a")
    }

    func testSameOwnerTokenRotationDuringBootstrapKeepsWritesWorking() async throws {
        for version in [false, true] {
            let state = ProjectWriteOwnershipState()
            ProjectWriteOwnershipProtocol.handler = { request in
                state.record(request)
                if request.url?.path == "/session" {
                    state.rotateToken()
                    return .json(#"{"error":"unavailable"}"#, status: 503)
                }
                return .json(Self.mutation, status: 201)
            }
            let api = makeAPI(state)
            if version { _ = try await api.upsertScreenplayProjectVersion(projectId: "project-a", draft: "Exact draft\r\n \t ", initiatingIdentity: state.identity()) }
            else { _ = try await api.upsertScreenplayProject(title: "A", initiatingIdentity: state.identity()) }
            let writes = state.requests().filter { $0.url?.path.hasPrefix("/screenplay/projects") == true }
            XCTAssertEqual(writes.count, 1)
            XCTAssertEqual(writes.first?.value(forHTTPHeaderField: "Authorization"), "Bearer fixture-rotated")
            XCTAssertEqual(writes.first?.value(forHTTPHeaderField: "X-User-Id"), "writer-a")
        }
    }

    func testHeaderConstructionCannotRetargetAfterItsOwnerCheck() async throws {
        let state = ProjectWriteOwnershipState()
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            if request.url?.path == "/session" {
                state.changeAfterNextSnapshot()
                return .json(#"{"error":"unavailable"}"#, status: 503)
            }
            return .json(Self.mutation, status: 201)
        }
        let api = makeAPI(state)
        await assertSuperseded { _ = try await api.upsertScreenplayProject(title: "A", initiatingIdentity: state.identity()) }
        let writes = state.requests().filter { $0.url?.path == "/screenplay/projects" }
        XCTAssertEqual(writes.count, 1)
        XCTAssertEqual(writes.first?.value(forHTTPHeaderField: "X-User-Id"), "writer-a",
                       "Headers must use the checked snapshot, not consult current identity again.")
    }

    func testCanonicalIdentitySnapshotCarriesTheLoginIntent() {
        let generation = BackendAuthClient.currentAuthSessionIntentGeneration()
        let snapshot = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false)
        XCTAssertEqual(snapshot.sessionIntentGeneration, generation)
    }

    func testCapturedCallerCannotBeReplacedByOwnerAtActorAdmission() async {
        for version in [false, true] {
            let state = ProjectWriteOwnershipState()
            let initiating = state.identity()
            state.changeOwner()
            ProjectWriteOwnershipProtocol.handler = { request in
                state.record(request)
                return .json(Self.mutation, status: 201)
            }
            let api = makeAPI(state)
            await assertSuperseded {
                if version { _ = try await api.upsertScreenplayProjectVersion(projectId: "project-a", draft: "A", initiatingIdentity: initiating) }
                else { _ = try await api.upsertScreenplayProject(title: "A", initiatingIdentity: initiating) }
            }
            XCTAssertTrue(state.requests().isEmpty, "A queued old operation must not bootstrap or write as a new owner.")
        }
    }

    func testCancellationDuringRefreshCannotSubmitAnotherVersionRequest() async {
        let state = ProjectWriteOwnershipState()
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            return .json(#"{"error":"user_auth_required"}"#, status: 401)
        }
        let api = makeAPI(state, refresher: { _ in
            withUnsafeCurrentTask { $0?.cancel() }
            return Self.refreshedState
        })
        let save = Task {
            _ = try await api.upsertScreenplayProjectVersion(projectId: "project-a", draft: "A", initiatingIdentity: state.identity())
        }
        do { try await save.value; XCTFail("Cancelled save returned a receipt.") }
        catch is CancellationError { }
        catch { XCTFail("Unexpected error: \(error)") }
        XCTAssertEqual(state.requests().filter { $0.url?.path.hasSuffix("/version") == true }.count, 1)
    }

    func testAccountDeletionCannotClearANewLoginDuringItsMainActorHop() async {
        let state = ProjectWriteOwnershipState()
        let owner = state.identity()
        state.changeAfterNextSnapshot()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ProjectWriteOwnershipProtocol.self]
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            return .json(#"{"ok":true}"#)
        }
        let api = BackendMemoryAPI(session: URLSession(configuration: configuration),
            baseURL: URL(string: "https://project-write-ownership.test")!,
            accountDeletionSessionHooks: .init(clearLocalSession: {
                XCTFail("Superseded deletion cleared the new account's local session.")
                return nil
            }, clearAfterSuccessfulDeletion: { _ in false }),
            requestIdentityProvider: { _ in state.identity() })
        await assertSuperseded {
            _ = try await api.requestAccountDeletion(proof: .password("fixture-only"), initiatingIdentity: owner)
        }
        XCTAssertTrue(state.requests().isEmpty, "A stale deletion must not reach transport.")
    }

    func testVersionRetryUsesRefreshedTokenOnlyForTheSameLoginIntent() async throws {
        try await assertRefreshBoundary(changedOwner: false)
    }

    func testVersionRetryCannotFollowAChangedOwnerAfterRefresh() async throws {
        try await assertRefreshBoundary(changedOwner: true)
    }

    private func assertRefreshBoundary(changedOwner: Bool) async throws {
        let state = ProjectWriteOwnershipState()
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            if request.url?.path == "/session" { return .json(#"{"error":"unavailable"}"#, status: 503) }
            if request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-access" {
                return .json(#"{"error":"expired_user_token"}"#, status: 401)
            }
            return .json(Self.mutation, status: 201)
        }
        let api = makeAPI(state, refresher: { expected in
            XCTAssertEqual(expected.userID, "writer-a")
            XCTAssertEqual(expected.sessionIntentGeneration, 1)
            if changedOwner { state.changeOwner() } else { state.rotateToken() }
            return Self.refreshedState
        })
        let save = { _ = try await api.upsertScreenplayProjectVersion(projectId: "project-a", draft: "Exact draft\r\n \t ", initiatingIdentity: state.identity()) }
        if changedOwner { await assertSuperseded(save) } else { try await save() }
        let writes = state.requests().filter { $0.url?.path.hasSuffix("/version") == true }
        XCTAssertEqual(writes.count, changedOwner ? 1 : 2)
        XCTAssertTrue(writes.allSatisfy { $0.value(forHTTPHeaderField: "X-User-Id") == "writer-a" })
        if !changedOwner { XCTAssertEqual(writes.last?.value(forHTTPHeaderField: "Authorization"), "Bearer fixture-rotated") }
    }

    func testSameOwnerConflictEnvelopeStillReturnsItsServerVersion() async throws {
        let state = ProjectWriteOwnershipState()
        ProjectWriteOwnershipProtocol.handler = { request in
            if request.url?.path == "/session" { return .json(#"{"error":"unavailable"}"#, status: 503) }
            return .json(#"{"conflict":true,"server_version_id":"server-new","state_version":"same-owner-conflict"}"#, status: 409)
        }
        let result = try await makeAPI(state).upsertScreenplayProjectVersion(projectId: "project-a", draft: "Local words", initiatingIdentity: state.identity())
        XCTAssertEqual(result.payload.conflict, true)
        XCTAssertEqual(result.payload.serverVersionId, "server-new")
        XCTAssertEqual(result.sync.stateVersion, "same-owner-conflict")
    }

    private func makeAPI(_ state: ProjectWriteOwnershipState,
        refresher: @escaping @Sendable (ScreenplayStudioAuthContext) async throws -> BackendAuthSessionState = { _ in .signedOut }
    ) -> BackendMemoryAPI {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ProjectWriteOwnershipProtocol.self]
        return BackendMemoryAPI(session: URLSession(configuration: configuration),
            baseURL: URL(string: "https://project-write-ownership.test")!,
            requestIdentityProvider: { _ in state.identity() }, projectWriteAuthRefresher: refresher)
    }

    private func assertSuperseded(_ operation: () async throws -> Void) async {
        do {
            try await operation()
            XCTFail("A superseded owner must cancel the production write/result.")
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409)
            XCTAssertEqual(message, "auth_request_superseded")
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    private static let mutation = #"{"stage":"screenplay_project","status":"saved","project_id":"project-a","version_id":"version-a","state_version":"stale-owner-state","project":{"id":"project-a","title":"A"}}"#
    private static let refreshedState = BackendAuthSessionState(
        user: BackendAuthUser(userId: "writer-a", email: "writer@example.invalid", authProvider: nil,
            emailVerified: true, emailVerifiedAt: nil, createdAt: nil, updatedAt: nil), accessTokenPresent: true, refreshTokenPresent: true,
        accessExpiresAt: 0, refreshExpiresAt: 0, currentSessionId: "fixture", currentFamilyId: "fixture",
        tokenType: "Bearer", pendingEmailVerification: false, verificationRequired: false)
}

private final class ProjectWriteOwnershipState: @unchecked Sendable {
    private let lock = NSLock()
    private var owner = "writer-a"
    private var epoch = 1
    private var intent = 1
    private var token = "fixture-access"
    private var switchAfterSnapshot = false
    private var recorded: [URLRequest] = []

    func identity() -> BackendAuthRequestIdentity {
        lock.lock()
        defer { lock.unlock() }
        let snapshot = BackendAuthRequestIdentity(sessionEpoch: epoch, userID: owner,
            clientToken: "fixture-client", accessToken: token, sessionIntentGeneration: intent)
        if switchAfterSnapshot {
            switchAfterSnapshot = false
            owner = "writer-b"
            intent += 1
            epoch += 1
        }
        return snapshot
    }

    func changeOwner(sameUser: Bool = false) {
        lock.lock()
        defer { lock.unlock() }
        if !sameUser { owner = "writer-b" }
        epoch += 1
        intent += 1
    }

    func rotateToken() {
        lock.lock()
        defer { lock.unlock() }
        token = "fixture-rotated"
        epoch += 1
    }

    func changeAfterNextSnapshot() {
        lock.lock()
        defer { lock.unlock() }
        switchAfterSnapshot = true
    }

    func record(_ request: URLRequest) {
        lock.lock()
        defer { lock.unlock() }
        recorded.append(request)
    }

    func requests() -> [URLRequest] {
        lock.lock()
        defer { lock.unlock() }
        return recorded
    }
}

private struct ProjectWriteOwnershipResponse {
    let status: Int
    let data: Data
    var responseURL: URL? = nil
    var gate: ProjectWriteOwnershipReplyGate? = nil
    static func json(_ body: String, status: Int = 200) -> Self { .init(status: status, data: Data(body.utf8)) }
}

private final class ProjectWriteOwnershipProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> ProjectWriteOwnershipResponse)?
    nonisolated(unsafe) static var interceptAllRequests = false
    override class func canInit(with request: URLRequest) -> Bool { interceptAllRequests || request.url?.host == "project-write-ownership.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            guard let handler = Self.handler else { throw URLError(.badServerResponse) }
            let result = try handler(request)
            let deliver = { [self] in
                let response = HTTPURLResponse(url: result.responseURL ?? request.url!, statusCode: result.status,
                    httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
                client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
                client?.urlProtocol(self, didLoad: result.data)
                client?.urlProtocolDidFinishLoading(self)
            }
            if let gate = result.gate { gate.hold(deliver) } else { deliver() }
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

// Test-only response barrier; holds no production identity or request data.
private final class ProjectWriteOwnershipReplyGate: @unchecked Sendable {
    private let lock = NSLock()
    private let started: XCTestExpectation
    private var deliver: (() -> Void)?
    private var released = false
    init(started: XCTestExpectation) { self.started = started }
    func hold(_ reply: @escaping () -> Void) {
        lock.lock(); let alreadyReleased = released
        if !alreadyReleased { deliver = reply }
        lock.unlock(); started.fulfill()
        if alreadyReleased { reply() }
    }
    func release() {
        lock.lock(); released = true; let reply = deliver; deliver = nil; lock.unlock()
        reply?()
    }
}

// Roll back only the canonical client-session fields touched by successful
// bootstrap fixtures. Values stay in memory and are never printed by tests.
private struct ProjectBootstrapIdentitySnapshot {
    private let token = BackendAuthClient.sharedClientToken()
    private let expiry = BackendAuthClient.sharedClientTokenExpiry()
    private let baseURL = BackendAuthClient.sharedClientTokenBaseURL()
    private let cachedAt = UserDefaults.standard.object(forKey: "client_token_cached_at")
    func restore() {
        if let token { BackendAuthClient.persistSharedClientToken(token, expiryRaw: expiry, baseURLRaw: baseURL) }
        else { BackendAuthClient.clearSharedClientToken() }
        if let cachedAt { BackendUserDefaultsStore.set(cachedAt, forKey: "client_token_cached_at") }
        else { BackendUserDefaultsStore.removeObject(forKey: "client_token_cached_at") }
    }
}

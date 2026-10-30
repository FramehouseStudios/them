import Foundation
import XCTest
@testable import them

/// Deterministic VM -> durable outbox -> authenticated HTTP drain proof.
/// The private URLProtocol intercepts every request made by the injected API;
/// this test never contacts the resolved backend.
@MainActor
final class ScreenplayAuthenticatedFiveSaveDrainTests: XCTestCase {
    func testAccountSwitchPreservesRestoredBindingThroughFirstEdit() throws {
        let savedAuth = FiveSaveAuthSnapshot()
        let bridge = ScreenplayLiveDraftBridge.shared
        bridge.reconcileAccountStorage()
        let before = FiveSaveBridgeSnapshot(bridge: bridge)
        let ownerA = "binding-a-\(UUID().uuidString)"
        let ownerB = "binding-b-\(UUID().uuidString)"
        defer {
            savedAuth.restore()
            bridge.reconcileAccountStorage()
            FiveSaveAuthSnapshot.removeOwnerScopedValues(owner: ownerA)
            FiveSaveAuthSnapshot.removeOwnerScopedValues(owner: ownerB)
            XCTAssertEqual(bridge.draftOrigin.documentID, before.origin.documentID)
        }
        func binding(_ project: String) -> ScreenplayProjectBindingSnapshot {
            .init(updatedAt: Date(timeIntervalSince1970: 1), projectID: project, projectTitle: project,
                  versionID: "v1", phase: "", draftSceneCount: 0, outlineSceneCount: 0,
                  boundSceneCount: 0, draftCharacterCount: 0, projectCharacterCount: 0,
                  boundCharacterCount: 0, sceneBindings: [])
        }
        try savedAuth.install(owner: ownerA)
        bridge.reconcileAccountStorage()
        bridge.projectBinding = binding("writer-a-project")
        bridge.draftText = "Writer A words"
        try savedAuth.install(owner: ownerB)
        bridge.reconcileAccountStorage()
        bridge.projectBinding = binding("writer-b-project")
        bridge.draftText = "Writer B words"
        try savedAuth.install(owner: ownerA)
        bridge.reconcileAccountStorage()
        XCTAssertEqual(bridge.projectBinding.projectID, "writer-a-project")
        bridge.draftText = "Writer A adds a line"
        XCTAssertEqual(bridge.projectBinding.projectID, "writer-a-project")
        XCTAssertNotEqual(bridge.projectBinding.projectID, "writer-b-project")
    }

    func testEmptyBaseManualCheckpointWithIdenticalServerWordsRequiresDecision() async throws {
        let fixture = try AuthenticatedFiveSaveDrainFixture()
        do {
            try await fixture.enqueueFiveSaves(baseVersionID: "")
            fixture.peer.setCanonicalDraft(fixture.drafts[0])
            await fixture.model.resumeQueuedDraftSavesIfNeeded(force: true)
            let rows = try await fixture.queue.entriesForTesting()
            let first = try XCTUnwrap(rows.first { $0.id == fixture.requestIDs[0] })
            XCTAssertEqual(first.status, .parked)
            XCTAssertEqual(first.source, "studio_manual")
            XCTAssertEqual(first.draft, fixture.drafts[0])
            XCTAssertEqual(first.baseVersionId, "")
            XCTAssertEqual(rows.count, 5)
            XCTAssertEqual(fixture.model.conflictState?.projectId, fixture.projectID)
            XCTAssertTrue(fixture.peer.writes.isEmpty)
        } catch {
            await fixture.close()
            throw error
        }
        await fixture.close()
    }

    func testAccountChangeDuringEmptyBasePreflightReturnsClaimWithoutWrite() async throws {
        let fixture = try AuthenticatedFiveSaveDrainFixture()
        do {
            try await fixture.enqueueFiveSaves(baseVersionID: "")
            fixture.peer.holdPreflight()
            let drain = Task { @MainActor in await fixture.model.resumeQueuedDraftSavesIfNeeded(force: true) }
            let observed = await XCTWaiter.fulfillment(of: [fixture.peer.preflightReceived], timeout: 5)
            XCTAssertEqual(observed, .completed)
            fixture.contextBox.value = .init(userID: "different-owner", sessionIntentGeneration: 999)
            fixture.peer.releasePreflight()
            await drain.value
            let rows = try await fixture.queue.entriesForTesting()
            XCTAssertEqual(rows.count, 5)
            XCTAssertTrue(rows.allSatisfy { $0.status == .pending })
            XCTAssertTrue(fixture.peer.writes.isEmpty)
            XCTAssertFalse(fixture.model.debugIsDraftSaveInFlight)
        } catch {
            fixture.peer.releasePreflight()
            await fixture.close()
            throw error
        }
        await fixture.close()
    }

    func testAccountChangeAfterClaimReturnsSaveWithoutSending() async throws {
        let fixture = try AuthenticatedFiveSaveDrainFixture()
        do {
            try await fixture.enqueueFiveSaves()
            let contextBox = fixture.contextBox
            fixture.model.debugAfterDraftSaveClaim = {
                contextBox.value = .init(userID: "different-owner", sessionIntentGeneration: 999)
            }
            await fixture.model.resumeQueuedDraftSavesIfNeeded(force: true)
            let rows = try await fixture.queue.entriesForTesting()
            XCTAssertEqual(rows.count, 5)
            XCTAssertTrue(rows.allSatisfy { $0.status == .pending })
            XCTAssertEqual(rows.map(\.id), fixture.requestIDs)
            XCTAssertTrue(fixture.peer.writes.isEmpty)
            XCTAssertFalse(fixture.model.debugIsDraftSaveInFlight)
            fixture.model.debugAfterDraftSaveClaim = nil
        } catch {
            await fixture.close()
            throw error
        }
        await fixture.close()
    }

    func testAuthenticatedFiveSaveDrainAcknowledgesEveryExactWriteOnceInOrder() async throws {
        let fixture = try AuthenticatedFiveSaveDrainFixture()
        do {
            try await fixture.enqueueFiveSaves()
            let firstDrain = Task { @MainActor in
                await fixture.model.resumeQueuedDraftSavesIfNeeded(force: true)
            }

            let acknowledgementResult = await XCTWaiter.fulfillment(
                of: [fixture.peer.allAcknowledged],
                timeout: 5
            )
            XCTAssertEqual(acknowledgementResult, .completed)
            await firstDrain.value
            if acknowledgementResult != .completed {
                let rows = try await fixture.queue.entriesForTesting()
                XCTFail("Handoff did not finish: writes=\(fixture.peer.writes.count), rows=\(rows.count), pending=\(rows.filter { $0.status == .pending }.count), inflight=\(rows.filter { $0.status == .inflight }.count), parked=\(rows.filter { $0.status == .parked }.count), editorOwned=\(ScreenplayLiveDraftSyncService.shared.ownsEditor(fixture.model)), loaded=\(fixture.model.debugLoadedDraftProjectID == fixture.projectID), peerFailures=\(fixture.peer.failures.count), flight=\(fixture.model.debugIsDraftSaveInFlight)")
            }
            try await fixture.awaitSettledDrain()

            let writes = fixture.peer.writes
            XCTAssertEqual(writes.count, 5)
            XCTAssertEqual(Set(writes.map(\.requestID)).count, 5, "A queued save was written more than once")
            XCTAssertEqual(writes.map(\.requestID), fixture.requestIDs)
            XCTAssertEqual(writes.map(\.baseVersionID), ["base-0", "ack-1", "ack-2", "ack-3", "ack-4"])
            XCTAssertEqual(writes.map { Data($0.draft.utf8) }, fixture.drafts.map { Data($0.utf8) })
            XCTAssertEqual(writes.map(\.acknowledgedVersionID), ["ack-1", "ack-2", "ack-3", "ack-4", "ack-5"])
            XCTAssertTrue(writes.allSatisfy { $0.ownerHeader == fixture.owner })
            XCTAssertTrue(writes.allSatisfy { $0.authorizationHeader == "Bearer five-save-access" })
            XCTAssertTrue(fixture.peer.failures.isEmpty, fixture.peer.failures.joined(separator: " | "))

            let remaining = try await fixture.queue.entriesForTesting()
            XCTAssertTrue(remaining.isEmpty)
            XCTAssertEqual(fixture.model.latestVersionID, "ack-5")
            XCTAssertEqual(Data(fixture.model.fountainDraft.utf8), Data(try XCTUnwrap(fixture.drafts.last).utf8))
            XCTAssertFalse(fixture.model.hasUnsavedDraftChanges)
            XCTAssertEqual(fixture.model.queuedDraftSaveCount, 0)
            XCTAssertFalse(fixture.model.debugIsDraftSaveInFlight)
        } catch {
            await fixture.close()
            throw error
        }
        await fixture.close()
    }
}

@MainActor
private final class FiveSaveContextBox {
    var value: ScreenplayStudioAuthContext
    init(_ value: ScreenplayStudioAuthContext) { self.value = value }
}

@MainActor
private final class AuthenticatedFiveSaveDrainFixture {
    let model: ScreenplayStudioViewModel
    let queue: ScreenplayDraftSaveOutbox
    let peer: AuthenticatedFiveSavePeer
    let owner: String
    let projectID: String
    let documentID: String
    let drafts: [String]
    let requestIDs: [String]
    let contextBox: FiveSaveContextBox

    private let bridge: ScreenplayLiveDraftBridge
    private let authSnapshot: FiveSaveAuthSnapshot
    private let bridgeSnapshot: FiveSaveBridgeSnapshot
    private let defaults: UserDefaults
    private let defaultsSuite: String
    private let directory: URL
    private let session: URLSession
    private let liveReplyOutbox: OfflineTalkOutbox
    private var closed = false

    nonisolated deinit {}

    init() throws {
        let sharedBridge = ScreenplayLiveDraftBridge.shared
        let savedAuth = FiveSaveAuthSnapshot()
        sharedBridge.reconcileAccountStorage()
        let savedBridge = FiveSaveBridgeSnapshot(bridge: sharedBridge)
        let testOwner = "authenticated-five-save-\(UUID().uuidString.lowercased())"
        let testProjectID = "five-save-project-\(UUID().uuidString.lowercased())"
        let tempDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("AuthenticatedFiveSaveDrain-\(UUID().uuidString)", isDirectory: true)
        let suite = "them.authenticated-five-save-drain.\(UUID().uuidString)"
        var installedPeer: AuthenticatedFiveSavePeer?
        var createdSession: URLSession?
        var initialized = false
        defer {
            if !initialized {
                createdSession?.invalidateAndCancel()
                if let installedPeer { AuthenticatedFiveSaveProtocol.uninstall(installedPeer) }
                UserDefaults(suiteName: suite)?.removePersistentDomain(forName: suite)
                try? FileManager.default.removeItem(at: tempDirectory)
                savedAuth.restore()
                sharedBridge.reconcileAccountStorage()
                FiveSaveAuthSnapshot.removeOwnerScopedValues(owner: testOwner)
            }
        }

        try savedAuth.install(owner: testOwner)
        sharedBridge.reconcileAccountStorage()

        let context = ScreenplayStudioAuthContext.current()
        guard context.userID == testOwner else { throw FiveSaveFixtureError.ownerNotInstalled }
        let backend = BackendAuthClient.resolvedBackendBaseURL()
        let baseline = "INT. DRAIN - NIGHT\r\n\r\nThe baseline waits.\r\n"
        guard sharedBridge.adoptLoadedProjectDraft(
            baseline,
            projectID: testProjectID,
            versionID: "base-0",
            owner: context
        ), let document = sharedBridge.captureLiveTalkDocument(),
           document.owner == context,
           document.projectID == testProjectID,
           let origin = ScreenplayDraftSaveOrigin.capture(
            document: document,
            projectID: testProjectID,
            owner: context,
            isActiveEditor: true,
            backendURL: backend
           ) else {
            throw FiveSaveFixtureError.documentIdentityUnavailable
        }
        let testDefaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: testDefaults, key: "recovery")
        let testQueue = ScreenplayDraftSaveOutbox(
            storageDirectory: tempDirectory.appendingPathComponent("draft-outbox")
        )
        let overflow = ScreenplayRecoveryOverflowStore(
            rootDirectory: tempDirectory.appendingPathComponent("recovery-overflow")
        )
        let identity = BackendAuthRequestIdentity(
            sessionEpoch: 1,
            userID: testOwner,
            clientToken: "five-save-client",
            accessToken: "five-save-access",
            sessionIntentGeneration: context.sessionIntentGeneration
        )
        let testReplyOutbox = OfflineTalkOutbox(
            storageDirectory: tempDirectory.appendingPathComponent("reply-outbox"),
            requestIdentityProvider: { _ in identity }, backendURLProvider: { backend }
        )
        let projectData = try JSONSerialization.data(withJSONObject: [
            "id": testProjectID,
            "title": "Five Save Drain",
        ])
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: projectData)
        let testPeer = AuthenticatedFiveSavePeer(
            backend: backend,
            projectID: testProjectID,
            owner: testOwner
        )
        AuthenticatedFiveSaveProtocol.install(testPeer)
        installedPeer = testPeer
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AuthenticatedFiveSaveProtocol.self]
        let testSession = URLSession(configuration: configuration)
        createdSession = testSession
        let authenticatedState = BackendAuthSessionState(
            user: BackendAuthUser(
                userId: testOwner,
                email: "five-save@example.invalid",
                authProvider: nil,
                emailVerified: true,
                emailVerifiedAt: nil,
                createdAt: nil,
                updatedAt: nil
            ),
            accessTokenPresent: true,
            refreshTokenPresent: true,
            accessExpiresAt: 0,
            refreshExpiresAt: 0,
            currentSessionId: "five-save-session",
            currentFamilyId: "five-save-family",
            tokenType: "Bearer",
            pendingEmailVerification: false,
            verificationRequired: false
        )
        let api = BackendMemoryAPI(
            session: testSession,
            baseURL: backend,
            requestIdentityProvider: { _ in identity },
            projectWriteAuthRefresher: { _ in authenticatedState }
        )
        let contextBox = FiveSaveContextBox(context)
        let testModel = ScreenplayStudioViewModel(
            localDraftRecoveryStore: recovery,
            overflowRecoveryStore: overflow,
            recoveryOriginProvider: { candidateProjectID in
                candidateProjectID == testProjectID ? origin : nil
            },
            draftSaveOutbox: testQueue,
            draftSaveAPI: api,
            projectSelectionAPI: api,
            draftSaveIdentityProvider: { identity },
            liveReplyOutbox: testReplyOutbox,
            studioAuthContextProvider: { contextBox.value }
        )
        testModel.autosaveEnabled = false
        testModel.projects = [project]
        testModel.selectedProjectID = testProjectID
        testModel.selectedProject = project
        testModel.applyStructuralUITestDraft(baseline, versionID: "base-0")
        testModel.hasUnsavedDraftChanges = false
        recovery.save(
            ownerUserId: testOwner,
            projectId: testProjectID,
            draft: baseline,
            baseVersionId: "base-0",
            dirty: false
        )
        let testDrafts = [
            "INT. DRAIN - NIGHT\r\n\r\nSave one keeps cafe\u{301}.  \t",
            "INT. DRAIN - NIGHT\r\n\r\nSave two keeps café. \r\n",
            "INT. DRAIN - NIGHT\r\n\r\nSave three keeps two spaces.  ",
            "INT. DRAIN - NIGHT\r\n\r\nSave four crosses the loop boundary.\t",
            "INT. DRAIN - NIGHT\r\n\r\nSave five proves continuation.  \r\n",
        ]
        let testRequestIDs = (1...5).map { "five-save-\($0)-\(UUID().uuidString.lowercased())" }

        bridge = sharedBridge
        authSnapshot = savedAuth
        bridgeSnapshot = savedBridge
        owner = testOwner
        projectID = testProjectID
        documentID = document.documentID
        directory = tempDirectory
        defaultsSuite = suite
        defaults = testDefaults
        queue = testQueue
        liveReplyOutbox = testReplyOutbox
        peer = testPeer
        session = testSession
        model = testModel
        self.contextBox = contextBox
        drafts = testDrafts
        requestIDs = testRequestIDs
        initialized = true
    }

    func enqueueFiveSaves(baseVersionID: String = "base-0") async throws {
        let backend = BackendAuthClient.resolvedBackendBaseURL()
        guard let document = bridge.captureLiveTalkDocument(),
              document.documentID == documentID,
              let origin = ScreenplayDraftSaveOrigin.capture(
                document: document,
                projectID: projectID,
                owner: .current(),
                isActiveEditor: true,
                backendURL: backend
              ), origin.documentID == documentID else {
            throw FiveSaveFixtureError.documentIdentityChanged
        }
        for index in drafts.indices {
            var entry = ScreenplayDraftSaveOutboxEntry(
                id: requestIDs[index],
                projectId: projectID,
                ownerUserId: owner,
                draft: drafts[index],
                title: "Five Save Drain",
                phase: "scene_draft",
                notes: "",
                source: "studio_manual",
                studioWriteAnchors: [],
                screenplayBindings: [],
                baseVersionId: baseVersionID,
                createdAt: TimeInterval(index + 1),
                updatedAt: TimeInterval(index + 1),
                status: .pending,
                retries: 0,
                nextAttemptAt: 0,
                lastError: ""
            )
            entry.deliveryOrigin = origin
            try await queue.enqueue(entry)
        }
        let queued = try await queue.entriesForTesting()
        guard queued.count == 5,
              queued.allSatisfy({ $0.ownerUserId == owner &&
                  $0.projectId == projectID &&
                  $0.deliveryOrigin?.documentID == documentID &&
                  $0.deliveryOrigin?.permitsBackend(backend) == true }) else {
            throw FiveSaveFixtureError.documentIdentityChanged
        }
    }

    func awaitSettledDrain() async throws {
        for _ in 0..<500 {
            if !peer.failures.isEmpty { throw FiveSaveFixtureError.peerRejectedRequest }
            let rows = try await queue.entriesForTesting()
            if rows.isEmpty,
               peer.writes.count == 5,
               model.queuedDraftSaveCount == 0,
               !model.debugIsDraftSaveInFlight {
                return
            }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        throw FiveSaveFixtureError.drainDidNotSettle
    }

    func close() async {
        guard !closed else { return }
        closed = true
        await queue.stopNetworkMonitoring()
        await liveReplyOutbox.stopNetworkMonitoring()
        ScreenplayLiveDraftSyncService.shared.detach()
        session.invalidateAndCancel()
        AuthenticatedFiveSaveProtocol.uninstall(peer)
        defaults.removePersistentDomain(forName: defaultsSuite)
        try? FileManager.default.removeItem(at: directory)

        authSnapshot.restore()
        bridge.reconcileAccountStorage()
        FiveSaveAuthSnapshot.removeOwnerScopedValues(owner: owner)
        XCTAssertEqual(bridge.draftText, bridgeSnapshot.draftText)
        XCTAssertEqual(bridge.preferredProjectID, bridgeSnapshot.projectID)
        XCTAssertEqual(bridge.preferredVersionID, bridgeSnapshot.versionID)
        XCTAssertEqual(bridge.projectBinding, bridgeSnapshot.binding)
        XCTAssertEqual(bridge.draftOrigin.documentID, bridgeSnapshot.origin.documentID)
        XCTAssertEqual(bridge.draftOrigin.projectID, bridgeSnapshot.origin.projectID)
        XCTAssertEqual(bridge.draftOrigin.versionID, bridgeSnapshot.origin.versionID)
        XCTAssertGreaterThanOrEqual(bridge.draftOrigin.updatedAt, bridgeSnapshot.origin.updatedAt)
    }
}

private enum FiveSaveFixtureError: Error {
    case ownerNotInstalled
    case documentIdentityUnavailable
    case documentIdentityChanged
    case peerRejectedRequest
    case drainDidNotSettle
}

@MainActor
private struct FiveSaveBridgeSnapshot {
    let draftText: String
    let projectID: String
    let versionID: String
    let binding: ScreenplayProjectBindingSnapshot
    let origin: ScreenplayLiveDraftOriginSnapshot

    init(bridge: ScreenplayLiveDraftBridge) {
        draftText = bridge.draftText
        projectID = bridge.preferredProjectID
        versionID = bridge.preferredVersionID
        binding = bridge.projectBinding
        origin = bridge.draftOrigin
    }
}

@MainActor
private struct FiveSaveAuthSnapshot {
    private static let keys = [
        "auth_user_payload",
        "auth_signed_in",
        "auth_session_token_deletion_pending",
    ]
    private let values: [Any?]

    init() {
        values = Self.keys.map { UserDefaults.standard.object(forKey: $0) }
    }

    func install(owner: String) throws {
        let user = BackendAuthUser(
            userId: owner,
            email: "five-save@example.invalid",
            authProvider: nil,
            emailVerified: true,
            emailVerifiedAt: nil,
            createdAt: nil,
            updatedAt: nil
        )
        UserDefaults.standard.set(try JSONEncoder().encode(user), forKey: Self.keys[0])
        UserDefaults.standard.set(true, forKey: Self.keys[1])
        UserDefaults.standard.set(false, forKey: Self.keys[2])
    }

    func restore() {
        for (index, key) in Self.keys.enumerated() {
            if let value = values[index] { UserDefaults.standard.set(value, forKey: key) }
            else { UserDefaults.standard.removeObject(forKey: key) }
        }
    }

    static func removeOwnerScopedValues(owner: String) {
        let probe = "five-save-owner-probe"
        let marker = ScreenplayOwnerScopedStoragePolicy.storageKey(baseKey: probe, ownerUserID: owner)
        let suffix = String(marker.dropFirst(probe.count))
        for key in UserDefaults.standard.dictionaryRepresentation().keys where key.hasSuffix(suffix) {
            UserDefaults.standard.removeObject(forKey: key)
        }
    }
}

private nonisolated final class AuthenticatedFiveSavePeer: @unchecked Sendable {
    struct Write: Sendable {
        let requestID: String
        let baseVersionID: String
        let draft: String
        let acknowledgedVersionID: String
        let ownerHeader: String
        let authorizationHeader: String
    }

    let allAcknowledged: XCTestExpectation
    let preflightReceived = XCTestExpectation(description: "Preflight read began")
    private let preflightGate = DispatchSemaphore(value: 0)
    private var shouldHoldPreflight = false
    private var canonicalDraft: String?
    private let backend: URL
    private let projectID: String
    private let owner: String
    private let lock = NSLock()
    private var recorded: [Write] = []
    private var recordedFailures: [String] = []

    init(backend: URL, projectID: String, owner: String) {
        self.backend = backend
        self.projectID = projectID
        self.owner = owner
        allAcknowledged = XCTestExpectation(description: "Five exact authenticated saves acknowledged")
        allAcknowledged.expectedFulfillmentCount = 5
        allAcknowledged.assertForOverFulfill = true
    }

    var writes: [Write] {
        lock.lock()
        defer { lock.unlock() }
        return recorded
    }

    var failures: [String] {
        lock.lock()
        defer { lock.unlock() }
        return recordedFailures
    }

    func setCanonicalDraft(_ draft: String) { lock.lock(); canonicalDraft = draft; lock.unlock() }
    func holdPreflight() { lock.lock(); shouldHoldPreflight = true; lock.unlock() }
    func releasePreflight() { preflightGate.signal() }

    func accept(_ transport: AuthenticatedFiveSaveProtocol, request: URLRequest) {
        do {
            guard let url = request.url,
                  OfflineTalkRecoveryScope.sameBackend(url, backend) else {
                throw FiveSavePeerError.unexpectedOrigin
            }
            if url.path == "/session", request.httpMethod == "POST" {
                transport.respond(status: 200, payload: ["user_id": owner, "authenticated": true,
                    "client_token": "five-save-client", "expires_in": 3600, "remembered_names": []])
                return
            }
            if url.path == "/screenplay/projects/\(projectID)", request.httpMethod == "GET" {
                lock.lock(); let hold = shouldHoldPreflight; let draft = canonicalDraft; lock.unlock()
                if hold {
                    preflightReceived.fulfill()
                    guard preflightGate.wait(timeout: .now() + 8) == .success else { throw URLError(.timedOut) }
                }
                if let draft {
                    transport.respond(status: 200, payload: ["project": ["id": projectID, "title": "Five Save Drain",
                        "active_version_id": "existing-version", "versions": [["id": "existing-version",
                            "project_id": projectID, "draft": draft, "phase": "scene_draft"]]]])
                } else {
                    transport.respond(status: 200, payload: ["project": ["id": projectID, "title": "Five Save Drain", "versions": []]])
                }
                return
            }
            if url.path == "/screenplay/revision-colors" {
                transport.respond(status: 200, payload: ["ranges": []])
                return
            }
            guard url.path == "/screenplay/projects/\(projectID)/version" else {
                throw FiveSavePeerError.unexpectedPath
            }
            let body = try Self.bodyData(request)
            let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            let requestID = try XCTUnwrap(payload["client_request_id"] as? String)
            let base = try XCTUnwrap(payload["base_version_id"] as? String)
            let draft = try XCTUnwrap(payload["draft"] as? String)
            let ownerHeader = request.value(forHTTPHeaderField: "X-User-Id") ?? ""
            let authorization = request.value(forHTTPHeaderField: "Authorization") ?? ""
            guard ownerHeader == owner, authorization == "Bearer five-save-access" else {
                throw FiveSavePeerError.unauthenticatedRequest
            }

            lock.lock()
            let sequence = recorded.count + 1
            let acknowledgement = "ack-\(sequence)"
            recorded.append(Write(
                requestID: requestID,
                baseVersionID: base,
                draft: draft,
                acknowledgedVersionID: acknowledgement,
                ownerHeader: ownerHeader,
                authorizationHeader: authorization
            ))
            lock.unlock()

            transport.respond(status: 200, payload: [
                "status": "saved",
                "project_id": projectID,
                "version_id": acknowledgement,
                "project": ["id": projectID, "title": "Five Save Drain"],
                "version": [
                    "id": acknowledgement,
                    "project_id": projectID,
                    "client_request_id": requestID,
                    "draft": draft,
                    "phase": payload["phase"] ?? "scene_draft",
                    "source": payload["source"] ?? "studio_manual",
                    "notes": payload["notes"] ?? "",
                    "studio_write_anchors": payload["studio_write_anchors"] ?? [],
                    "screenplay_bindings": payload["screenplay_bindings"] ?? [],
                ],
            ])
            allAcknowledged.fulfill()
        } catch {
            lock.lock()
            recordedFailures.append(String(describing: error))
            lock.unlock()
            transport.fail(error)
        }
    }

    private static func bodyData(_ request: URLRequest) throws -> Data {
        if let body = request.httpBody, !body.isEmpty { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open()
        defer { stream.close() }
        var result = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while true {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count < 0 { throw stream.streamError ?? URLError(.cannotDecodeRawData) }
            if count == 0 { return result }
            result.append(contentsOf: buffer.prefix(count))
        }
    }
}

private enum FiveSavePeerError: Error {
    case unexpectedOrigin
    case unexpectedPath
    case unauthenticatedRequest
}

private nonisolated final class AuthenticatedFiveSaveProtocol: URLProtocol {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var installed: AuthenticatedFiveSavePeer?
    private let callbackLock = NSRecursiveLock()
    private var stopped = false

    static func install(_ peer: AuthenticatedFiveSavePeer) {
        lock.lock()
        installed = peer
        lock.unlock()
    }

    static func uninstall(_ peer: AuthenticatedFiveSavePeer) {
        lock.lock()
        defer { lock.unlock() }
        if installed === peer { installed = nil }
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lock.lock()
        let peer = Self.installed
        Self.lock.unlock()
        guard let peer else {
            fail(URLError(.resourceUnavailable))
            return
        }
        peer.accept(self, request: request)
    }

    override func stopLoading() {
        callbackLock.lock()
        stopped = true
        callbackLock.unlock()
    }

    func fail(_ error: Error) {
        callbackLock.lock()
        defer { callbackLock.unlock() }
        guard !stopped else { return }
        stopped = true
        client?.urlProtocol(self, didFailWithError: error)
    }

    func respond(status: Int, payload: [String: Any]) {
        callbackLock.lock()
        defer { callbackLock.unlock() }
        guard !stopped else { return }
        do {
            let data = try JSONSerialization.data(withJSONObject: payload)
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: status,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "application/json"]
            )!
            stopped = true
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            fail(error)
        }
    }
}

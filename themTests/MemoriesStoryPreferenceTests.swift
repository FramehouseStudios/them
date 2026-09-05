import XCTest
@testable import them

@MainActor
final class MemoriesStoryPreferenceTests: XCTestCase {
    override func tearDown() {
        MemoryMutationURLProtocol.handler = nil
        super.tearDown()
    }

    func testUpdatePinsDisplayedCreativeRevisionDespiteNewerGlobalAPIRead() async throws {
        let log = MemoryMutationRequestLog()
        let (api, session) = makeAPI(log: log)
        defer { session.invalidateAndCancel() }
        _ = try await api.fetchMemories(limit: 1, force: true)
        var reads = 0
        let vm = MemoriesViewModel(
            api: api, notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
                reads += 1
                return try Self.read()
            }, pendingQuestionLoader: { _ in nil }
        )
        _ = await vm.load()
        let original = try XCTUnwrap(vm.storyMovePreferences.first)
        _ = try await api.fetchMemories(limit: 1, force: true)

        await vm.updateStoryMovePreference(original, action: "prefer")

        let request = try XCTUnwrap(log.requests.first { $0.url?.path == Self.updatePath })
        let body = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as? [String: Any])
        XCTAssertEqual(body["expected_creative_memory_revision"] as? String, "cm1")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Creative-Memory-Revision"), "cm1")
        XCTAssertEqual(body["project_id"] as? String, "project-a")
        XCTAssertEqual(body["project_title"] as? String, "The Crossing")
        XCTAssertEqual(body["family"] as? String, "emotional_reveal")
        XCTAssertEqual(body["action"] as? String, "prefer")
        XCTAssertEqual(log.requests.filter { $0.url?.path == Self.updatePath }.count, 1)
        XCTAssertEqual(reads, 1, "The typed project receipt confirms this scoped change.")
        XCTAssertEqual(vm.storyMovePreferences.first?.explicitStance, "prefer")
        XCTAssertTrue(vm.preferenceActionError.isEmpty)
        XCTAssertNotNil(vm.actionNotice)
    }

    func testExplicitBlankAPIRevisionRejectsEveryPreferenceActionBeforeTransport() async throws {
        let log = MemoryMutationRequestLog()
        let (api, session) = makeAPI(log: log)
        defer { session.invalidateAndCancel() }
        for revision in ["", " \n"] {
            for action in ["prefer", "avoid", "reset", "reset_all"] {
                do {
                    _ = try await api.updateStoryMovePreference(
                        projectID: "project-a", projectTitle: "The Crossing",
                        family: action == "reset_all" ? "" : "emotional_reveal", action: action,
                        expectedCreativeMemoryRevision: revision
                    )
                    XCTFail("An explicit blank revision cannot bootstrap a \(action) write.")
                } catch BackendMemoryAPIError.invalidResponse {}
            }
        }
        XCTAssertTrue(log.requests.isEmpty)
    }

    func testInvalidActionsEmptyFamilyEmptyScopeAndMissingRevisionNeverWrite() async throws {
        let cases: [(action: String, row: [String: Any], revision: String?)] = [
            ("unknown", Self.row(), "cm1"),
            (" PREFER ", Self.row(), "cm1"),
            ("prefer", Self.row(family: " \n"), "cm1"),
            ("prefer", Self.row(project: " \n", title: " \n"), "cm1"),
            ("prefer", Self.row(), ""),
            ("prefer", Self.row(), " \n"),
            ("prefer", Self.row(), nil),
        ]
        for testCase in cases {
            var writes = 0
            let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
                try Self.read(rows: [testCase.row], revision: testCase.revision)
            }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { _, _, _, _ in
                writes += 1
                return try Self.response()
            })
            _ = await vm.load()
            let original = try XCTUnwrap(vm.storyMovePreferences.first)
            await vm.updateStoryMovePreference(original, action: testCase.action)
            XCTAssertEqual(writes, 0, "Invalid \(testCase.action) context must fail before transport.")
            XCTAssertEqual(vm.storyMovePreferences, [original])
            XCTAssertFalse(vm.preferenceActionError.isEmpty)
            XCTAssertNil(vm.actionNotice)
            XCTAssertTrue(vm.updatingStoryMoveFamily.isEmpty)
        }
    }

    func testEmptyAndMixedProjectResetBaselinesNeverWrite() async throws {
        var writes = 0
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
            try Self.read(rows: [Self.row(), Self.row(project: "project-b", title: "Another Story")])
        }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { _, _, _, _ in
            writes += 1
            return try Self.response(action: "reset_all")
        })
        _ = await vm.load()
        let originals = vm.storyMovePreferences
        await vm.resetAllStoryMovePreferences(reviewedPreferences: [])
        XCTAssertEqual(vm.preferenceActionError, StoryPreferenceActionError.unavailable.localizedDescription)
        await vm.resetAllStoryMovePreferences(reviewedPreferences: originals)
        XCTAssertEqual(vm.preferenceActionError, StoryPreferenceActionError.unavailable.localizedDescription)
        XCTAssertEqual(writes, 0)
        XCTAssertEqual(vm.storyMovePreferences, originals)
        XCTAssertNil(vm.actionNotice)
    }

    func testChangedAndRemovedSinglePreferenceCannotReuseReviewedRow() async throws {
        for latestRows in [[Self.row(stance: "avoid")], []] {
            var reads = 0
            var writes = 0
            let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
                reads += 1
                return try Self.read(rows: reads == 1 ? [Self.row()] : latestRows)
            }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { _, _, _, _ in
                writes += 1
                return try Self.response()
            })
            _ = await vm.load()
            let original = try XCTUnwrap(vm.storyMovePreferences.first)
            _ = await vm.retry()
            let latest = vm.storyMovePreferences
            await vm.updateStoryMovePreference(original, action: "prefer")
            XCTAssertEqual(writes, 0)
            XCTAssertEqual(vm.storyMovePreferences, latest)
            XCTAssertEqual(vm.preferenceActionError, StoryPreferenceActionError.changed.localizedDescription)
            XCTAssertNil(vm.actionNotice)
        }
    }

    func testResetAllRejectsChangedRemovedAndAddedRowsSinceConfirmation() async throws {
        let baseline = [Self.row(), Self.row(family: "reversal", displayName: "Reversals")]
        let changedBaselines = [
            [Self.row(stance: "avoid"), baseline[1]],
            [baseline[0]],
            [],
            baseline + [Self.row(family: "quiet_beat", displayName: "Quiet beats")],
        ]
        for latestRows in changedBaselines {
            var reads = 0
            var writes = 0
            let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
                reads += 1
                return try Self.read(rows: reads == 1 ? baseline : latestRows)
            }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { _, _, _, _ in
                writes += 1
                return try Self.response(action: "reset_all")
            })
            _ = await vm.load()
            let reviewed = vm.storyMovePreferences
            _ = await vm.retry()
            let latest = vm.storyMovePreferences
            await vm.resetAllStoryMovePreferences(reviewedPreferences: reviewed)
            XCTAssertEqual(writes, 0)
            XCTAssertEqual(vm.storyMovePreferences, latest)
            XCTAssertEqual(vm.preferenceActionError, StoryPreferenceActionError.changed.localizedDescription)
            XCTAssertNil(vm.actionNotice)
        }
    }

    func testResetAllAcceptsReorderedIdenticalReviewedRows() async throws {
        let rows = [Self.row(), Self.row(family: "reversal", displayName: "Reversals")]
        var reads = 0
        var writes = 0
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
            reads += 1
            return try Self.read(rows: reads == 1 ? rows : Array(rows.reversed()), revision: reads == 1 ? "cm1" : "cm3")
        }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { scope, family, action, revision in
            writes += 1
            XCTAssertEqual(scope.projectID, "project-a")
            XCTAssertEqual(family, "")
            XCTAssertEqual(action, "reset_all")
            XCTAssertEqual(revision, "cm3")
            return try Self.response(action: "reset_all")
        })
        _ = await vm.load()
        let reviewed = vm.storyMovePreferences
        _ = await vm.retry()
        XCTAssertEqual(vm.storyMovePreferences, Array(reviewed.reversed()))
        await vm.resetAllStoryMovePreferences(reviewedPreferences: reviewed)
        XCTAssertEqual(writes, 1)
        XCTAssertTrue(vm.storyMovePreferences.isEmpty)
        XCTAssertTrue(vm.preferenceActionError.isEmpty)
        XCTAssertNotNil(vm.actionNotice)
    }

    func testTypedScopedReceiptsConfirmPreferAvoidResetAndResetAll() async throws {
        for action in ["prefer", "avoid", "reset", "reset_all"] {
            let otherFamily = Self.row(family: "reversal", displayName: "Reversals")
            let unrelated = Self.row(project: "project-b", title: "Another Story", stance: "avoid")
            let savedRows: [[String: Any]]
            switch action {
            case "reset_all": savedRows = []
            case "reset": savedRows = [otherFamily]
            default: savedRows = [Self.row(stance: action), otherFamily]
            }
            var writes = 0
            let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
                try Self.read(rows: [Self.row(), otherFamily, unrelated])
            }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { scope, family, receivedAction, revision in
                writes += 1
                XCTAssertEqual(scope.projectID, "project-a")
                XCTAssertEqual(scope.projectTitle, "The Crossing")
                XCTAssertEqual(family, action == "reset_all" ? "" : "emotional_reveal")
                XCTAssertEqual(receivedAction, action)
                XCTAssertEqual(revision, "cm1")
                return try Self.response(action: action, rows: savedRows)
            })
            _ = await vm.load()
            let otherProject = try XCTUnwrap(vm.storyMovePreferences.first { $0.projectId == "project-b" })
            if action == "reset_all" {
                await vm.resetAllStoryMovePreferences(reviewedPreferences: vm.storyMovePreferences.filter { $0.projectId == "project-a" })
            } else {
                await vm.updateStoryMovePreference(try XCTUnwrap(vm.storyMovePreferences.first), action: action)
            }
            XCTAssertEqual(writes, 1)
            XCTAssertEqual(vm.storyMovePreferences.filter { $0.projectId == "project-a" }, try Self.preferences(savedRows))
            XCTAssertEqual(vm.storyMovePreferences.filter { $0.projectId == "project-b" }, [otherProject])
            XCTAssertTrue(vm.preferenceActionError.isEmpty)
            XCTAssertNotNil(vm.actionNotice)
            XCTAssertTrue(vm.updatingStoryMoveFamily.isEmpty)
        }
    }

    func testMalformedOrUnrelatedReceiptsCannotConfirmPreferenceChange() async throws {
        let valid = Self.row(stance: "prefer")
        let invalidReceipts: [[String: Any]] = [
            ["ok": false],
            ["action": "update_memory"],
            ["status": "avoid"],
            ["family": "reversal"],
            ["family": NSNull()],
            ["projectId": "project-b"],
            ["projectId": NSNull()],
            ["projectTitle": NSNull()],
            ["projectId": "", "projectTitle": ""],
            ["creativeMemoryRevision": NSNull()],
            ["creativeMemoryRevision": ""],
            ["creativeMemoryRevision": " \n"],
            ["storyMovePreferences": NSNull()],
            ["storyMovePreferences": []],
            ["storyMovePreferences": [valid, valid]],
            ["storyMovePreferences": [Self.row(stance: "avoid")]],
            ["storyMovePreferences": [Self.row()]],
            ["storyMovePreferences": [Self.row(family: "reversal", stance: "prefer")]],
            ["storyMovePreferences": [Self.row(project: "project-b", title: "The Crossing", stance: "prefer")]],
            ["storyMovePreferences": [valid, Self.row(project: "project-b", title: "Another Story", family: "reversal")]],
        ]
        for overrides in invalidReceipts {
            var writes = 0
            let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in try Self.read() }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { _, _, _, _ in
                writes += 1
                return try Self.response(overrides: overrides)
            })
            _ = await vm.load()
            let original = try XCTUnwrap(vm.storyMovePreferences.first)
            await vm.updateStoryMovePreference(original, action: "prefer")
            XCTAssertEqual(writes, 1)
            XCTAssertEqual(vm.storyMovePreferences, [original], "Invalid receipt: \(overrides.keys.sorted())")
            XCTAssertEqual(vm.preferenceActionError, StoryPreferenceActionError.unconfirmed.localizedDescription)
            XCTAssertNil(vm.actionNotice)
        }
    }

    func testResetRejectsUnchangedTargetAndResetAllRejectsAnyRemainingRows() async throws {
        for action in ["reset", "reset_all"] {
            let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in try Self.read() }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { _, _, _, _ in
                try Self.response(action: action, rows: [Self.row()])
            })
            _ = await vm.load()
            let original = try XCTUnwrap(vm.storyMovePreferences.first)
            if action == "reset_all" {
                await vm.resetAllStoryMovePreferences(reviewedPreferences: [original])
            } else {
                await vm.updateStoryMovePreference(original, action: action)
            }
            XCTAssertEqual(vm.storyMovePreferences, [original])
            XCTAssertEqual(vm.preferenceActionError, StoryPreferenceActionError.unconfirmed.localizedDescription)
            XCTAssertNil(vm.actionNotice)
        }
    }

    func testEmptyResetAllReceiptWithMissingOrWrongProjectScopeCannotClearRows() async throws {
        let invalidScopes: [[String: Any]] = [
            ["projectId": NSNull()],
            ["projectTitle": NSNull()],
            ["projectId": "", "projectTitle": ""],
            ["projectId": "project-b"],
            ["projectId": "", "projectTitle": "Another Story"],
        ]
        for project in ["project-a", ""] {
            for overrides in invalidScopes {
                var writes = 0
                let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
                    try Self.read(rows: [Self.row(project: project), Self.row(project: "project-b", title: "Another Story")])
                }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { _, _, _, _ in
                    writes += 1
                    return try Self.response(action: "reset_all", project: project, rows: [], overrides: overrides)
                })
                _ = await vm.load()
                let originals = vm.storyMovePreferences
                let target = try XCTUnwrap(originals.first)
                await vm.resetAllStoryMovePreferences(reviewedPreferences: [target])
                XCTAssertEqual(writes, 1)
                XCTAssertEqual(vm.storyMovePreferences, originals, "An empty receipt still needs the exact reviewed project scope.")
                XCTAssertEqual(vm.preferenceActionError, StoryPreferenceActionError.unconfirmed.localizedDescription)
                XCTAssertNil(vm.actionNotice)
            }
        }
    }

    func testSameTitleDifferentProjectIDsRemainIsolated() async throws {
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
            try Self.read(rows: [Self.row(), Self.row(project: "project-b", stance: "avoid")])
        }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { scope, _, _, _ in
            XCTAssertEqual(scope.projectID, "project-a")
            return try Self.response(action: "reset_all")
        })
        _ = await vm.load()
        let target = try XCTUnwrap(vm.storyMovePreferences.first { $0.projectId == "project-a" })
        let otherProject = try XCTUnwrap(vm.storyMovePreferences.first { $0.projectId == "project-b" })
        XCTAssertFalse(StoryPreferenceScope(target).contains(otherProject))
        await vm.resetAllStoryMovePreferences(reviewedPreferences: [target])
        XCTAssertEqual(vm.storyMovePreferences, [otherProject])
        XCTAssertTrue(vm.preferenceActionError.isEmpty)
        XCTAssertNotNil(vm.actionNotice)
    }

    func testTitleOnlyScopeExcludesIdentifiedSameTitleRowsAndRejectsAmbiguousWrites() async throws {
        var writes = 0
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
            try Self.read(rows: [Self.row(project: "", title: " The Crossing "), Self.row(project: "project-b", title: "the crossing")])
        }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { _, _, _, _ in
            writes += 1
            return try Self.response(project: "")
        })
        _ = await vm.load()
        let originals = vm.storyMovePreferences
        let legacy = try XCTUnwrap(originals.first { $0.projectId.isEmpty })
        let identified = try XCTUnwrap(originals.first { !$0.projectId.isEmpty })
        let scope = StoryPreferenceScope(legacy)
        XCTAssertTrue(scope.contains(legacy))
        XCTAssertFalse(scope.contains(identified), "A title fallback must never include an identified project.")
        await vm.updateStoryMovePreference(legacy, action: "prefer")
        XCTAssertEqual(vm.preferenceActionError, StoryPreferenceActionError.unavailable.localizedDescription)
        await vm.resetAllStoryMovePreferences(reviewedPreferences: [legacy])
        XCTAssertEqual(vm.preferenceActionError, StoryPreferenceActionError.unavailable.localizedDescription)
        XCTAssertEqual(writes, 0, "The title-only legacy row is ambiguous while an identified same-title project exists.")
        XCTAssertEqual(vm.storyMovePreferences, originals)
        XCTAssertNil(vm.actionNotice)
    }

    func testUniqueLegacyTitleOnlyScopeAcceptsTypedReceipts() async throws {
        for action in ["prefer", "avoid", "reset", "reset_all"] {
            var writes = 0
            let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
                try Self.read(rows: [Self.row(project: ""), Self.row(project: "project-b", title: "Another Story")])
            }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { scope, family, receivedAction, revision in
                writes += 1
                XCTAssertEqual(scope.projectID, "")
                XCTAssertEqual(scope.projectTitle, "The Crossing")
                XCTAssertEqual(scope.key, "title:the crossing")
                XCTAssertEqual(family, action == "reset_all" ? "" : "emotional_reveal")
                XCTAssertEqual(receivedAction, action)
                XCTAssertEqual(revision, "cm1")
                return try Self.response(action: action, project: "")
            })
            _ = await vm.load()
            let target = try XCTUnwrap(vm.storyMovePreferences.first { $0.projectId.isEmpty })
            let unrelated = try XCTUnwrap(vm.storyMovePreferences.first { $0.projectId == "project-b" })
            if action == "reset_all" {
                await vm.resetAllStoryMovePreferences(reviewedPreferences: [target])
            } else {
                await vm.updateStoryMovePreference(target, action: action)
            }
            XCTAssertEqual(writes, 1)
            XCTAssertEqual(vm.storyMovePreferences.filter { $0.projectId == "project-b" }, [unrelated])
            if action.hasPrefix("reset") {
                XCTAssertTrue(vm.storyMovePreferences.filter { $0.projectId.isEmpty }.isEmpty)
            } else {
                XCTAssertEqual(vm.storyMovePreferences.first { $0.projectId.isEmpty }?.explicitStance, action)
            }
            XCTAssertTrue(vm.preferenceActionError.isEmpty)
            XCTAssertNotNil(vm.actionNotice)
        }
    }

    func testNextSameProjectActionUsesReceiptRevisionButOtherProjectKeepsDisplayedRevision() async throws {
        var revisions: [String] = []
        var projects: [String] = []
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
            try Self.read(rows: [Self.row(), Self.row(project: "project-b", title: "Another Story")])
        }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { scope, _, action, revision in
            revisions.append(revision)
            projects.append(scope.projectID)
            return try Self.response(
                action: action, project: scope.projectID, title: scope.projectTitle,
                revision: "receipt-\(revisions.count)",
                rows: [Self.row(project: scope.projectID, title: scope.projectTitle, stance: action)]
            )
        })
        _ = await vm.load()
        let otherProject = try XCTUnwrap(vm.storyMovePreferences.first { $0.projectId == "project-b" })
        await vm.updateStoryMovePreference(try XCTUnwrap(vm.storyMovePreferences.first { $0.projectId == "project-a" }), action: "prefer")
        await vm.updateStoryMovePreference(try XCTUnwrap(vm.storyMovePreferences.first { $0.projectId == "project-a" }), action: "avoid")
        await vm.updateStoryMovePreference(otherProject, action: "prefer")
        XCTAssertEqual(projects, ["project-a", "project-a", "project-b"])
        XCTAssertEqual(revisions, ["cm1", "receipt-1", "cm1"])
        XCTAssertTrue(vm.preferenceActionError.isEmpty)
    }

    func testFullReadClearsProjectReceiptRevision() async throws {
        var reads = 0
        var revisions: [String] = []
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
            reads += 1
            return try Self.read(rows: [Self.row(stance: reads == 1 ? "" : "prefer")], revision: reads == 1 ? "cm1" : "full-read-cm3")
        }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { _, _, action, revision in
            revisions.append(revision)
            return try Self.response(action: action, revision: "receipt-cm2")
        })
        _ = await vm.load()
        await vm.updateStoryMovePreference(try XCTUnwrap(vm.storyMovePreferences.first), action: "prefer")
        _ = await vm.retry()
        await vm.updateStoryMovePreference(try XCTUnwrap(vm.storyMovePreferences.first), action: "avoid")
        XCTAssertEqual(revisions, ["cm1", "full-read-cm3"])
        XCTAssertTrue(vm.preferenceActionError.isEmpty)
    }

    func testFullReadWithMissingRevisionCannotReusePriorProjectReceiptRevision() async throws {
        var reads = 0
        var writes = 0
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
            reads += 1
            return try Self.read(rows: [Self.row(stance: reads == 1 ? "" : "prefer")], revision: reads == 1 ? "cm1" : "")
        }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { _, _, _, _ in
            writes += 1
            return try Self.response()
        })
        _ = await vm.load()
        await vm.updateStoryMovePreference(try XCTUnwrap(vm.storyMovePreferences.first), action: "prefer")
        _ = await vm.retry()
        await vm.updateStoryMovePreference(try XCTUnwrap(vm.storyMovePreferences.first), action: "avoid")
        XCTAssertEqual(writes, 1)
        XCTAssertEqual(vm.preferenceActionError, StoryPreferenceActionError.unconfirmed.localizedDescription)
        XCTAssertEqual(vm.storyMovePreferences.first?.explicitStance, "prefer")
        XCTAssertNil(vm.actionNotice)
    }

    func testDelayedReceiptCannotOverwriteNewerReadAndReconcilesLatestPreferences() async throws {
        try await assertDelayedReceipt(reconciliationFails: false)
    }

    func testDelayedReceiptWithFailedReconciliationPreservesNewerReadWithoutSuccessNotice() async throws {
        try await assertDelayedReceipt(reconciliationFails: true)
    }

    private func assertDelayedReceipt(reconciliationFails: Bool) async throws {
        let pending = PendingMemoryMutation()
        var reads = 0
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
            reads += 1
            if reconciliationFails && reads > 2 { throw URLError(.notConnectedToInternet) }
            return try Self.read(rows: [Self.row(stance: reads == 1 ? "" : "avoid")], revision: "read-\(reads)")
        }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { _, _, _, _ in try await pending.wait() })
        _ = await vm.load()
        let original = try XCTUnwrap(vm.storyMovePreferences.first)
        let changing = Task { await vm.updateStoryMovePreference(original, action: "prefer") }
        await waitForAction(pending)
        _ = await vm.retry()
        let newer = vm.storyMovePreferences
        pending.complete(.success(try Self.response()))
        await changing.value
        XCTAssertEqual(reads, 3)
        XCTAssertEqual(vm.storyMovePreferences, newer)
        XCTAssertEqual(vm.storyMovePreferences.first?.explicitStance, "avoid")
        XCTAssertTrue(vm.updatingStoryMoveFamily.isEmpty)
        if reconciliationFails {
            XCTAssertEqual(vm.preferenceActionError, StoryPreferenceActionError.unconfirmed.localizedDescription)
            XCTAssertNil(vm.actionNotice)
            XCTAssertNotNil(vm.refreshError)
        } else {
            XCTAssertTrue(vm.preferenceActionError.isEmpty)
            XCTAssertNotNil(vm.actionNotice)
        }
    }

    func testConflictRefreshesOnceWithoutRetryingWriteOrReusingOldChoice() async throws {
        var reads = 0
        var writes = 0
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
            reads += 1
            return try Self.read(rows: [Self.row(stance: reads == 1 ? "" : "avoid")], revision: "read-\(reads)")
        }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { _, _, _, _ in
            writes += 1
            throw BackendMemoryAPIError.server(status: 409, message: "stale_creative_memory_revision")
        })
        _ = await vm.load()
        let original = try XCTUnwrap(vm.storyMovePreferences.first)
        await vm.updateStoryMovePreference(original, action: "prefer")
        XCTAssertEqual(reads, 2)
        XCTAssertEqual(writes, 1)
        XCTAssertEqual(vm.storyMovePreferences.first?.explicitStance, "avoid")
        XCTAssertEqual(vm.preferenceActionError, StoryPreferenceActionError.changed.localizedDescription)
        XCTAssertNil(vm.actionNotice)
        await vm.updateStoryMovePreference(original, action: "prefer")
        XCTAssertEqual(writes, 1, "The original row is no longer the reviewed current preference.")
        XCTAssertEqual(reads, 2)
    }

    func testConflictRefreshToEmptyKeepsExplicitPreferenceError() async throws {
        for action in ["prefer", "reset_all"] {
            var reads = 0
            var writes = 0
            let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
                reads += 1
                return try Self.read(rows: reads == 1 ? [Self.row()] : [], revision: "read-\(reads)")
            }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { _, _, _, _ in
                writes += 1
                throw BackendMemoryAPIError.server(status: 409, message: "stale_creative_memory_revision")
            })
            _ = await vm.load()
            let original = try XCTUnwrap(vm.storyMovePreferences.first)
            if action == "reset_all" {
                await vm.resetAllStoryMovePreferences(reviewedPreferences: [original])
            } else {
                await vm.updateStoryMovePreference(original, action: action)
            }
            XCTAssertEqual(reads, 2)
            XCTAssertEqual(writes, 1)
            XCTAssertTrue(vm.storyMovePreferences.isEmpty)
            XCTAssertEqual(vm.state, .empty)
            XCTAssertEqual(vm.preferenceActionError, StoryPreferenceActionError.changed.localizedDescription,
                           "The failure must remain available when no preference card remains to display it.")
            XCTAssertNil(vm.actionNotice)
            XCTAssertTrue(vm.updatingStoryMoveFamily.isEmpty)
        }
    }

    func testPendingPreferenceActionBlocksDuplicateResetAndOtherMemoryMutations() async throws {
        let pending = PendingMemoryMutation()
        var writes = 0
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in try Self.read() }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { _, _, _, _ in
            writes += 1
            return try await pending.wait()
        })
        _ = await vm.load()
        let original = try XCTUnwrap(vm.storyMovePreferences.first)
        let changing = Task { await vm.updateStoryMovePreference(original, action: "prefer") }
        await waitForAction(pending)
        XCTAssertEqual(vm.updatingStoryMoveFamily, original.family)
        await vm.updateStoryMovePreference(original, action: "avoid")
        XCTAssertEqual(vm.preferenceActionError, MemoryCardActionError.inProgress.localizedDescription)
        await vm.resetAllStoryMovePreferences(reviewedPreferences: [original])
        XCTAssertEqual(vm.preferenceActionError, MemoryCardActionError.inProgress.localizedDescription)
        XCTAssertEqual(vm.updatingStoryMoveFamily, original.family, "Rejected duplicate actions must not release the first action's lock.")
        do {
            try await vm.forgetMemory(itemID: "unrelated-memory", key: "unrelated-key")
            XCTFail("Forget must wait for the preference mutation.")
        } catch MemoryForgetError.inProgress {}
        do {
            _ = try await vm.updateMemory(itemID: "unrelated-memory", key: "unrelated-key", title: "A", summary: "B", reason: "C")
            XCTFail("Correction must wait for the preference mutation.")
        } catch MemoriesViewModel.MemoryEditConflict.inProgress {}
        pending.complete(.failure(URLError(.notConnectedToInternet)))
        await changing.value
        XCTAssertEqual(writes, 1)
        XCTAssertEqual(vm.storyMovePreferences, [original])
        XCTAssertTrue(vm.updatingStoryMoveFamily.isEmpty)
        XCTAssertFalse(vm.preferenceActionError.isEmpty)
        XCTAssertNil(vm.actionNotice)
    }

    func testSuccessfulPendingActionClearsErrorFromRejectedDuplicate() async throws {
        let pending = PendingMemoryMutation()
        var writes = 0
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in try Self.read() }, pendingQuestionLoader: { _ in nil }, storyPreferenceLoader: { _, _, _, _ in
            writes += 1
            return try await pending.wait()
        })
        _ = await vm.load()
        let original = try XCTUnwrap(vm.storyMovePreferences.first)
        let changing = Task { await vm.updateStoryMovePreference(original, action: "prefer") }
        await waitForAction(pending)
        await vm.updateStoryMovePreference(original, action: "avoid")
        XCTAssertEqual(vm.preferenceActionError, MemoryCardActionError.inProgress.localizedDescription)
        XCTAssertEqual(vm.updatingStoryMoveFamily, original.family)
        pending.complete(.success(try Self.response()))
        await changing.value
        XCTAssertEqual(writes, 1)
        XCTAssertEqual(vm.storyMovePreferences.first?.explicitStance, "prefer")
        XCTAssertTrue(vm.preferenceActionError.isEmpty, "Successful completion must clear the stale duplicate-action error.")
        XCTAssertTrue(vm.updatingStoryMoveFamily.isEmpty)
        XCTAssertNotNil(vm.actionNotice)
    }

    func testResetConfirmationKeepsCapturedProjectAndPatternTitlesAfterRefresh() async throws {
        var reads = 0
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), memoriesLoader: { _, _ in
            reads += 1
            return try Self.read(rows: [Self.row(title: reads == 1 ? "The Crossing" : "Renamed Project", displayName: reads == 1 ? "Emotional reveals" : "Renamed pattern")])
        }, pendingQuestionLoader: { _ in nil })
        _ = await vm.load()
        let captured = vm.storyMovePreferences
        let all = StoryPreferenceResetConfirmation(preferences: captured, resetsAll: true)
        let one = StoryPreferenceResetConfirmation(preferences: captured, resetsAll: false)
        _ = await vm.retry()
        XCTAssertEqual(vm.storyMovePreferences.first?.projectTitle, "Renamed Project")
        XCTAssertEqual(all.preferences, captured)
        XCTAssertEqual(one.preferences, captured)
        XCTAssertEqual(all.title, "Reset preferences for The Crossing?")
        XCTAssertEqual(one.title, "Reset Emotional reveals?")
        XCTAssertTrue(all.message.contains("There is no undo."))
        XCTAssertTrue(one.message.contains("Story facts and screenplay canon stay intact."))
    }

    func testPreferencesFixtureSealsInjectedMutationTransportAndRetriesLocally() async throws {
        var writes = 0
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), storyPreferenceLoader: { _, _, _, _ in
            writes += 1
            return try Self.response()
        })
        XCTAssertTrue(vm.installMemoriesUITestFixtureIfNeeded(arguments: ["--ui-testing", "--ui-memories-fixture", "--ui-memories-preferences-fixture"]))
        let original = try XCTUnwrap(vm.storyMovePreferences.first)
        await vm.updateStoryMovePreference(original, action: "prefer")
        XCTAssertEqual(writes, 0)
        XCTAssertEqual(vm.storyMovePreferences, [original])
        XCTAssertFalse(vm.preferenceActionError.isEmpty)
        XCTAssertNil(vm.actionNotice)
        await vm.updateStoryMovePreference(original, action: "prefer")
        XCTAssertEqual(writes, 0)
        XCTAssertEqual(vm.storyMovePreferences.first?.explicitStance, "prefer")
        XCTAssertTrue(vm.preferenceActionError.isEmpty)
        XCTAssertNotNil(vm.actionNotice)
        let reviewed = vm.storyMovePreferences
        await vm.resetAllStoryMovePreferences(reviewedPreferences: reviewed)
        XCTAssertFalse(vm.preferenceActionError.isEmpty)
        XCTAssertEqual(vm.storyMovePreferences, reviewed)
        await vm.resetAllStoryMovePreferences(reviewedPreferences: reviewed)
        XCTAssertEqual(writes, 0)
        XCTAssertTrue(vm.storyMovePreferences.isEmpty)
        XCTAssertTrue(vm.preferenceActionError.isEmpty)
        XCTAssertNotNil(vm.actionNotice)
    }

    func testCanonFixtureAlsoSealsInjectedPreferenceMutationTransport() async throws {
        var writes = 0
        let vm = MemoriesViewModel(notificationCenter: NotificationCenter(), storyPreferenceLoader: { _, _, _, _ in
            writes += 1
            return try Self.response()
        })
        XCTAssertTrue(vm.installMemoriesUITestFixtureIfNeeded(arguments: ["--ui-testing", "--ui-memories-fixture", "--ui-memories-canon-fixture"]))
        // This fixture has a displayed creative revision. Supplying a current row
        // reaches its sealed mutation transport instead of a missing-row guard.
        let original = try XCTUnwrap(Self.preferences([Self.row()]).first)
        vm.storyMovePreferences = [original]
        await vm.updateStoryMovePreference(original, action: "prefer")
        XCTAssertEqual(writes, 0)
        XCTAssertEqual(vm.storyMovePreferences, [original])
        XCTAssertFalse(vm.preferenceActionError.isEmpty)
        XCTAssertNil(vm.actionNotice)
    }

    private func waitForAction(_ pending: PendingMemoryMutation) async {
        for _ in 0..<100 where !pending.isWaiting { await Task.yield() }
        XCTAssertTrue(pending.isWaiting)
    }

    private func makeAPI(log: MemoryMutationRequestLog) -> (BackendMemoryAPI, URLSession) {
        MemoryMutationURLProtocol.handler = { request in
            log.append(request)
            switch request.url?.path {
            case "/session": return try Self.data(["client_token": "story-preference-fixture", "expires_in": 3600, "remembered_names": []])
            case "/memories": return try Self.data(["source": "test", "sourceIp": "", "stateVersion": "v9", "creativeMemoryRevision": "cm9", "memories": [], "conversationSamples": []])
            case Self.updatePath: return try Self.responseData()
            default: throw URLError(.unsupportedURL)
            }
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MemoryMutationURLProtocol.self]
        let session = URLSession(configuration: configuration)
        return (BackendMemoryAPI(session: session, baseURL: URL(string: "https://memory-mutation.test")!), session)
    }

    nonisolated private static var updatePath: String { "/memories/story-preferences/update" }

    nonisolated private static func row(
        project: String = "project-a", title: String = "The Crossing", family: String = "emotional_reveal",
        displayName: String = "Emotional reveals", stance: String = ""
    ) -> [String: Any] {
        [
            "projectId": project, "projectTitle": title, "family": family, "displayName": displayName,
            "summary": "let emotional revelations change the next choice", "learnedScore": 2,
            "effectiveScore": stance == "avoid" ? -4 : 4, "evidenceCount": 2, "selectedCount": 2,
            "passedOverCount": 0, "acceptedPageCount": 0, "blockResolutionCount": 0, "explicitStance": stance,
        ]
    }

    nonisolated private static func preferences(_ rows: [[String: Any]]) throws -> [BackendStoryMovePreference] {
        try JSONDecoder().decode([BackendStoryMovePreference].self, from: JSONSerialization.data(withJSONObject: rows))
    }

    nonisolated private static func read(rows: [[String: Any]]? = nil, revision: String? = "cm1") throws -> BackendReadResult<BackendMemoriesResponse> {
        var body: [String: Any] = [
            "source": "test", "sourceIp": "", "stateVersion": "v1",
            "memories": [], "storyMovePreferences": rows ?? [row()], "conversationSamples": [],
        ]
        if let revision { body["creativeMemoryRevision"] = revision }
        return BackendReadResult(payload: try JSONDecoder().decode(BackendMemoriesResponse.self, from: data(body)), sync: .empty, notModified: false)
    }

    nonisolated private static func responseData(
        action: String = "prefer", project: String = "project-a", title: String = "The Crossing", revision: String = "cm2",
        rows: [[String: Any]]? = nil, overrides: [String: Any] = [:]
    ) throws -> Data {
        var body: [String: Any] = [
            "ok": true, "action": "story_move_preference", "status": action,
            "projectId": project, "projectTitle": title, "family": action == "reset_all" ? "" : "emotional_reveal",
            "creativeMemoryRevision": revision,
            "storyMovePreferences": rows ?? (action.hasPrefix("reset") ? [] : [row(project: project, title: title, stance: action)]),
        ]
        body.merge(overrides) { _, new in new }
        return try data(body)
    }

    nonisolated private static func response(
        action: String = "prefer", project: String = "project-a", title: String = "The Crossing", revision: String = "cm2",
        rows: [[String: Any]]? = nil, overrides: [String: Any] = [:]
    ) throws -> BackendReadResult<BackendMemoryMutationResponse> {
        BackendReadResult(payload: try JSONDecoder().decode(BackendMemoryMutationResponse.self, from: responseData(action: action, project: project, title: title, revision: revision, rows: rows, overrides: overrides)), sync: .empty, notModified: false)
    }

    nonisolated private static func data(_ body: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: body) }
}

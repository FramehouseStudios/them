import Foundation
import Combine
import XCTest
@testable import them

@MainActor
final class OnboardingInputRecoveryModelTests: XCTestCase {
    private let signedOut = OnboardingInputAccess(active: true, credentialFree: true, authIntent: 10)
    private func fixture() -> (URL, OnboardingInputCustody, OnboardingInputRecoveryModel) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("onboarding-model-\(UUID().uuidString)")
        let custody = UnassignedLegacyRecoveryVault.onboardingInputs(rootDirectory: root, fileProtectionEnforcer: { _ in
            guard !Thread.isMainThread else { throw CocoaError(.fileWriteUnknown) }
        })
        return (root, custody, .init(custody: custody))
    }
    private func waitForSave(_ model: OnboardingInputRecoveryModel) async throws {
        for _ in 0..<500 {
            if model.status == .saved { return }
            try await Task.sleep(for: .milliseconds(2))
        }
        XCTFail("Expected verified capture, got \(model.status)")
    }

    func testOnlyUserEditedFieldsAreCapturedAndLatestRawBytesAreVerified() async throws {
        let (root, custody, model) = fixture(); defer { try? FileManager.default.removeItem(at: root) }
        await model.inspect(signedOut)
        XCTAssertEqual(model.status, .notSaved)
        model.editPremise("first", access: signedOut)
        model.editName("  E\u{301}va \t", access: signedOut)
        let premise = "\r\nCafe\u{301}.  👩🏽‍🚀\t\r\n"
        model.editPremise(premise, access: signedOut)
        try await waitForSave(model)
        let inventory = await Task.detached { custody.inventory() }.value
        guard case .present(let descriptor) = inventory else { return XCTFail("Missing protected capture") }
        let record = await Task.detached { custody.reveal(expected: descriptor) }.value
        XCTAssertEqual(record?.fields.nameUTF8, Data("  E\u{301}va \t".utf8))
        XCTAssertEqual(record?.fields.premiseUTF8, Data(premise.utf8))
    }

    func testExistingCaptureBlocksNewTypingAndStaleRestoreCannotApply() async throws {
        let (root, custody, first) = fixture(); defer { try? FileManager.default.removeItem(at: root) }
        await first.inspect(signedOut); first.editPremise("saved input", access: signedOut)
        try await waitForSave(first)
        let second = OnboardingInputRecoveryModel(custody: custody)
        await second.inspect(signedOut)
        XCTAssertEqual(second.status, .existing)
        XCTAssertFalse(second.fields.hasEdits)
        let inventory = await Task.detached { custody.inventory() }.value
        guard case .present(let descriptor) = inventory,
              let record = await Task.detached(operation: { custody.reveal(expected: descriptor) }).value else {
            return XCTFail("Missing capture")
        }
        let edits = second.editGeneration
        second.editName("intervening edit", access: signedOut)
        XCTAssertFalse(second.resumed(record, expectedEdits: edits, expectedAccess: signedOut))
        XCTAssertEqual(second.status, .existing)
        let afterAttempt = await Task.detached { custody.inventory() }.value
        XCTAssertEqual(afterAttempt, .present(descriptor))
        let currentEdits = second.editGeneration
        let changed = OnboardingInputAccess(active: true, credentialFree: false, authIntent: 11)
        second.updateAccess(changed)
        XCTAssertFalse(second.resumed(record, expectedEdits: currentEdits, expectedAccess: signedOut))
        XCTAssertFalse(second.discarded(expectedEdits: currentEdits, expectedAccess: signedOut))
        XCTAssertEqual(second.status, .accountRestricted)
    }

    func testKnownAccountEditsNeverBecomeOwnerlessOnLaterSignOut() async throws {
        let (root, custody, model) = fixture(); defer { try? FileManager.default.removeItem(at: root) }
        let known = OnboardingInputAccess(active: true, credentialFree: false, authIntent: 11)
        await model.inspect(known)
        model.editName("known account input", access: known)
        XCTAssertEqual(model.status, .accountRestricted)
        await model.inspect(.init(active: true, credentialFree: true, authIntent: 12))
        XCTAssertFalse(model.fields.hasEdits)
        let afterSwitch = await Task.detached { custody.inventory() }.value
        XCTAssertEqual(afterSwitch, .missing)
        XCTAssertFalse(model.canRecover(editGeneration: model.editGeneration, access: signedOut))
    }

    func testResumeDoesNotConsumeAndDiscardDoesNotRecaptureVisibleFields() async throws {
        let (root, custody, first) = fixture(); defer { try? FileManager.default.removeItem(at: root) }
        await first.inspect(signedOut); first.editPremise("saved input", access: signedOut)
        try await waitForSave(first)
        let second = OnboardingInputRecoveryModel(custody: custody); await second.inspect(signedOut)
        let inventory = await Task.detached { custody.inventory() }.value
        guard case .present(let descriptor) = inventory,
              let record = await Task.detached(operation: { custody.reveal(expected: descriptor) }).value else { return XCTFail("Missing capture") }
        XCTAssertTrue(second.resumed(record, expectedEdits: second.editGeneration, expectedAccess: signedOut))
        let afterResume = await Task.detached { custody.inventory() }.value
        XCTAssertEqual(afterResume, .present(descriptor))
        let discarded = await Task.detached { custody.discard(expected: descriptor) }.value
        XCTAssertTrue(discarded)
        XCTAssertTrue(second.discarded(expectedEdits: second.editGeneration, expectedAccess: signedOut))
        await second.inspect(signedOut)
        XCTAssertEqual(second.status, .notSaved)
        let afterDiscard = await Task.detached { custody.inventory() }.value
        XCTAssertEqual(afterDiscard, .missing)
    }

    func testResumeKeepsCurrentEditedNameAbsentFromSavedPremiseAndVerifiesMergedBytes() async throws {
        let (root, custody, first) = fixture(); defer { try? FileManager.default.removeItem(at: root) }
        let savedPremise = "\r\nCafe\u{301}.  Keep 👩🏽‍🚀. \t\r\n"
        await first.inspect(signedOut)
        first.editPremise(savedPremise, access: signedOut)
        try await waitForSave(first)
        let savedInventory = await Task.detached { custody.inventory() }.value
        guard case .present(let savedDescriptor) = savedInventory,
              let saved = await Task.detached(operation: { custody.reveal(expected: savedDescriptor) }).value else {
            return XCTFail("Missing premise-only capture")
        }
        XCTAssertFalse(saved.fields.nameWasEdited)
        XCTAssertTrue(saved.fields.nameUTF8.isEmpty)

        let current = OnboardingInputRecoveryModel(custody: custody)
        await current.inspect(signedOut)
        let currentName = "  E\u{301}va \t"
        current.editName(currentName, access: signedOut)
        let edits = current.editGeneration
        XCTAssertTrue(current.resumed(saved, expectedEdits: edits, expectedAccess: signedOut))
        XCTAssertEqual(current.fields.nameUTF8, Data(currentName.utf8))
        XCTAssertTrue(current.fields.nameWasEdited)
        XCTAssertEqual(current.fields.premiseUTF8, Data(savedPremise.utf8))
        XCTAssertTrue(current.fields.premiseWasEdited)
        XCTAssertEqual(current.status, .saving, "The retained current name is not yet part of the verified saved checkpoint")
        try await waitForSave(current)

        let recreated = UnassignedLegacyRecoveryVault.onboardingInputs(rootDirectory: root)
        let mergedInventory = await Task.detached { recreated.inventory() }.value
        guard case .present(let mergedDescriptor) = mergedInventory,
              let merged = await Task.detached(operation: { recreated.reveal(expected: mergedDescriptor) }).value else {
            return XCTFail("Missing merged capture after recreation")
        }
        XCTAssertNotEqual(mergedDescriptor, savedDescriptor)
        XCTAssertEqual(merged.fields.nameUTF8, Data(currentName.utf8))
        XCTAssertEqual(merged.fields.premiseUTF8, Data(savedPremise.utf8))
        XCTAssertTrue(merged.fields.nameWasEdited)
        XCTAssertTrue(merged.fields.premiseWasEdited)
    }

    func testDiscardKeepsLiveEditedFieldsWithoutRecaptureUntilAnotherUserEdit() async throws {
        let (root, custody, model) = fixture(); defer { try? FileManager.default.removeItem(at: root) }
        let name = "  E\u{301}va \t", premise = "\r\nOriginal 👩🏽‍🚀 idea.  \t\r\n"
        await model.inspect(signedOut)
        model.editName(name, access: signedOut)
        model.editPremise(premise, access: signedOut)
        try await waitForSave(model)
        let inventory = await Task.detached { custody.inventory() }.value
        guard case .present(let descriptor) = inventory else { return XCTFail("Missing selected capture") }
        let discarded = await Task.detached { custody.discard(expected: descriptor) }.value
        XCTAssertTrue(discarded)
        XCTAssertTrue(model.discarded(expectedEdits: model.editGeneration, expectedAccess: signedOut))
        XCTAssertEqual(model.fields.nameUTF8, Data(name.utf8))
        XCTAssertEqual(model.fields.premiseUTF8, Data(premise.utf8))
        XCTAssertTrue(model.fields.nameWasEdited)
        XCTAssertTrue(model.fields.premiseWasEdited)
        XCTAssertEqual(model.status, .notSaved)

        // Inspection/reappearance alone is not a new user edit or recapture permission.
        model.updateAccess(.init(active: false, credentialFree: true, authIntent: signedOut.authIntent))
        await model.inspect(signedOut)
        for _ in 0..<40 { await Task.yield() }
        XCTAssertEqual(model.status, .notSaved)
        XCTAssertFalse(model.hasCapture)
        let afterReappearance = await Task.detached { custody.inventory() }.value
        XCTAssertEqual(afterReappearance, .missing)

        let newPremise = "\r\nChanged cafe\u{301} idea.  \t\r\n"
        model.editPremise(newPremise, access: signedOut)
        try await waitForSave(model)
        let recreated = UnassignedLegacyRecoveryVault.onboardingInputs(rootDirectory: root)
        let nextInventory = await Task.detached { recreated.inventory() }.value
        guard case .present(let nextDescriptor) = nextInventory,
              let next = await Task.detached(operation: { recreated.reveal(expected: nextDescriptor) }).value else {
            return XCTFail("Missing capture after the next explicit edit")
        }
        XCTAssertEqual(next.fields.nameUTF8, Data(name.utf8), "Editing the premise cannot drop the still-visible user-entered name")
        XCTAssertEqual(next.fields.premiseUTF8, Data(newPremise.utf8))
        XCTAssertTrue(next.fields.nameWasEdited)
        XCTAssertTrue(next.fields.premiseWasEdited)
    }


    func testEarlierFieldsStayReadOnlyAcrossEditsInspectionAndRetry() async throws {
        let (root, custody, model) = fixture(); defer { try? FileManager.default.removeItem(at: root) }
        let original = "\r\nEarlier cafe\u{301} words. 👩🏽‍🚀 \t\r\n"
        await model.inspect(signedOut); model.editPremise(original, access: signedOut)
        try await waitForSave(model)
        let current = root.appendingPathComponent("current.json"), pending = root.appendingPathComponent("pending.json")
        let currentBytes = try Data(contentsOf: current), malformed = Data("{\"fields\":".utf8)
        try malformed.write(to: pending)
        let next = OnboardingInputRecoveryModel(custody: custody); await next.inspect(signedOut)
        XCTAssertEqual(next.status, .unconfirmed)
        let descriptor = await Task.detached { custody.earlierCopyDescriptor() }.value
        guard let descriptor,
              let copy = await Task.detached(operation: { custody.revealEarlierCopy(expected: descriptor) }).value else {
            return XCTFail("Missing independently verified earlier copy")
        }
        let stale = next.editGeneration
        next.editName("  E\u{301}va \t", access: signedOut)
        XCTAssertFalse(next.copiedEarlierFields(copy, expectedEdits: stale, expectedAccess: signedOut))
        XCTAssertTrue(next.copiedEarlierFields(copy, expectedEdits: next.editGeneration, expectedAccess: signedOut))
        XCTAssertEqual(next.status, .readOnly)
        XCTAssertEqual(next.fields.nameUTF8, Data("  E\u{301}va \t".utf8))
        XCTAssertEqual(next.fields.premiseUTF8, Data(original.utf8))
        next.editPremise("new unsaved words", access: signedOut)
        await next.inspect(signedOut); await next.retry(signedOut)
        for _ in 0..<40 { await Task.yield() }
        XCTAssertEqual(next.status, .readOnly)
        XCTAssertEqual(next.fields.premiseUTF8, Data("new unsaved words".utf8))
        XCTAssertEqual(try Data(contentsOf: current), currentBytes)
        XCTAssertEqual(try Data(contentsOf: pending), malformed)
        let edits = next.editGeneration
        next.updateAccess(.init(active: true, credentialFree: false, authIntent: 11))
        XCTAssertFalse(next.fields.hasEdits)
        XCTAssertFalse(next.copiedEarlierFields(copy, expectedEdits: edits, expectedAccess: signedOut))
        XCTAssertEqual(next.status, .accountRestricted)
    }

    func testHealthyRepairDoesNotExitReadOnlyWithoutExplicitNormalRecovery() async throws {
        let (root, custody, model) = fixture(); defer { try? FileManager.default.removeItem(at: root) }
        await model.inspect(signedOut); model.editPremise("original fields", access: signedOut)
        try await waitForSave(model)
        let current = root.appendingPathComponent("current.json"), pending = root.appendingPathComponent("pending.json")
        let before = try Data(contentsOf: current)
        try Data("truncated".utf8).write(to: pending)
        let next = OnboardingInputRecoveryModel(custody: custody); await next.inspect(signedOut)
        let descriptor = await Task.detached { custody.earlierCopyDescriptor() }.value
        guard let descriptor,
              let earlier = await Task.detached(operation: { custody.revealEarlierCopy(expected: descriptor) }).value else { return XCTFail("Missing earlier fields") }
        XCTAssertTrue(next.copiedEarlierFields(earlier, expectedEdits: next.editGeneration, expectedAccess: signedOut))

        // Fixture repair is not permission to silently start writing again.
        try FileManager.default.removeItem(at: pending)
        await next.inspect(signedOut); await next.retry(signedOut)
        XCTAssertEqual(next.status, .readOnly)
        XCTAssertEqual(try Data(contentsOf: current), before)
        guard let healthy = await Task.detached(operation: { custody.reveal(expected: descriptor) }).value else { return XCTFail("Missing healthy normal selection") }
        XCTAssertTrue(next.resumed(healthy, expectedEdits: next.editGeneration, expectedAccess: signedOut))
        XCTAssertEqual(next.status, .saved)
        XCTAssertEqual(try Data(contentsOf: current), before)

        // A separate protected normal Discard can also end read-only recovery after repair.
        try Data("truncated again".utf8).write(to: pending)
        guard let secondEarlier = await Task.detached(operation: { custody.revealEarlierCopy(expected: descriptor) }).value else { return XCTFail("Missing second earlier selection") }
        XCTAssertTrue(next.copiedEarlierFields(secondEarlier, expectedEdits: next.editGeneration, expectedAccess: signedOut))
        try FileManager.default.removeItem(at: pending)
        let discarded = await Task.detached { custody.discard(expected: descriptor) }.value
        XCTAssertTrue(discarded)
        XCTAssertTrue(next.discarded(expectedEdits: next.editGeneration, expectedAccess: signedOut))
        await next.inspect(signedOut)
        XCTAssertEqual(next.status, .notSaved)
        let afterDiscard = await Task.detached { custody.inventory() }.value
        XCTAssertEqual(afterDiscard, .missing)
        next.editPremise("explicit new edit", access: signedOut)
        try await waitForSave(next)
    }

    private func waitForIdle(_ model: OnboardingInputRecoveryModel) async throws {
        for _ in 0..<500 {
            if !model.isCapturing { return }
            try await Task.sleep(for: .milliseconds(2))
        }
        XCTFail("Capture did not finish")
    }

    private func heldFixture() -> (URL, OnboardingInputCustody, OnboardingPendingFileHold) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("onboarding-handoff-\(UUID().uuidString)")
        let hold = OnboardingPendingFileHold()
        let custody = UnassignedLegacyRecoveryVault.onboardingInputs(rootDirectory: root, fileProtectionEnforcer: { url in
            guard !Thread.isMainThread else { throw CocoaError(.fileWriteUnknown) }
            try hold.protect(url)
        })
        return (root, custody, hold)
    }

    private func waitForHold(_ hold: OnboardingPendingFileHold) async throws {
        for _ in 0..<500 {
            if hold.isWaiting { return }
            try await Task.sleep(for: .milliseconds(2))
        }
        XCTFail("Production checkpoint never reached its pending-file protection boundary")
        throw CocoaError(.fileWriteUnknown)
    }

    private func checkpoint(_ custody: OnboardingInputCustody) async -> OnboardingInputCheckpoint? {
        await Task.detached { () -> OnboardingInputCheckpoint? in
            guard case .present(let descriptor) = custody.inventory() else { return nil }
            return custody.reveal(expected: descriptor)
        }.value
    }

    func testLoginReservationKeepsAnonymousCaptureButInvalidatesOldRecoveryChallenge() async throws {
        let (root, custody, model) = fixture(); defer { try? FileManager.default.removeItem(at: root) }
        let before = OnboardingInputAccess(active: true, credentialFree: true, authIntent: 10, sessionEpoch: 20)
        let reserved = OnboardingInputAccess(active: true, credentialFree: true, authIntent: 11, sessionEpoch: 20)
        await model.inspect(before); model.editName("A", access: before); model.editPremise("A premise", access: before)
        try await waitForSave(model)
        let oldChallenge = model.editGeneration
        model.updateAccess(reserved)
        XCTAssertFalse(model.canRecover(editGeneration: oldChallenge, access: before))
        let name = "  B cafe\u{301} \t", premise = "\r\nB keeps 👩🏽‍🚀 and these spaces. \t\r\n"
        model.editName(name, access: reserved); model.editPremise(premise, access: reserved)
        try await waitForIdle(model)
        let saved = await checkpoint(custody)
        XCTAssertEqual(saved?.fields.nameUTF8, Data(name.utf8))
        XCTAssertEqual(saved?.fields.premiseUTF8, Data(premise.utf8))
        XCTAssertEqual(model.status, .saved)
    }

    func testCredentialBoundaryDrainsFrozenBBehindHeldAWithoutSavingKnownAccountC() async throws {
        let (root, custody, hold) = heldFixture()
        defer { hold.release(); try? FileManager.default.removeItem(at: root) }
        let model = OnboardingInputRecoveryModel(custody: custody)
        let before = OnboardingInputAccess(active: true, credentialFree: true, authIntent: 10, sessionEpoch: 20)
        let known = OnboardingInputAccess(active: true, credentialFree: false, authIntent: 12, sessionEpoch: 21)
        await model.inspect(before); hold.arm()
        model.editName("A", access: before); model.editPremise("A is in flight", access: before)
        try await waitForHold(hold)
        let name = "  B E\u{301}va \t", premise = "\r\nB frozen words. 👩🏽‍🚀 \t\r\n"
        model.editName(name, access: before); model.editPremise(premise, access: before)
        let staleEdits = model.editGeneration
        model.updateAccess(known)
        model.editName("known-account C must remain local", access: known)
        hold.release(); try await waitForIdle(model)
        let saved = await checkpoint(custody)
        XCTAssertEqual(saved?.fields.nameUTF8, Data(name.utf8))
        XCTAssertEqual(saved?.fields.premiseUTF8, Data(premise.utf8))
        XCTAssertEqual(saved?.provenance, "unassigned_onboarding_input")
        XCTAssertEqual(model.fields.nameUTF8, Data("known-account C must remain local".utf8))
        XCTAssertFalse(model.fields.premiseWasEdited)
        XCTAssertEqual(model.status, .accountRestricted)
        XCTAssertFalse(model.canRecover(editGeneration: staleEdits, access: before))
        let relaunched = OnboardingInputRecoveryModel(custody: custody)
        await relaunched.inspect(known)
        XCTAssertFalse(relaunched.fields.hasEdits)
        XCTAssertFalse(relaunched.canRecover(editGeneration: relaunched.editGeneration, access: known))
    }

    func testSessionEpochABARevokesCaptureEvenWithSameCredentialFreeFlagAndIntent() async throws {
        let (root, custody, model) = fixture(); defer { try? FileManager.default.removeItem(at: root) }
        let before = OnboardingInputAccess(active: true, credentialFree: true, authIntent: 10, sessionEpoch: 20)
        let afterABA = OnboardingInputAccess(active: true, credentialFree: true, authIntent: 10, sessionEpoch: 22)
        await model.inspect(before); model.editPremise("A protected", access: before)
        try await waitForSave(model)
        let bytes = try Data(contentsOf: root.appendingPathComponent("current.json"))
        model.updateAccess(afterABA)
        XCTAssertFalse(model.fields.hasEdits)
        model.editName("new visitor cannot adopt A's lease", access: afterABA)
        try await waitForIdle(model)
        XCTAssertEqual(try Data(contentsOf: root.appendingPathComponent("current.json")), bytes)
        XCTAssertEqual(model.status, .existing)
    }

    func testUnconfirmedHeldWriteStopsSealedDrainAndPreservesPendingEvidence() async throws {
        let (root, custody, hold) = heldFixture()
        defer { hold.release(); try? FileManager.default.removeItem(at: root) }
        let model = OnboardingInputRecoveryModel(custody: custody)
        await model.inspect(signedOut); hold.arm(fail: true)
        model.editPremise("A valid pending evidence", access: signedOut)
        try await waitForHold(hold)
        let pending = root.appendingPathComponent("pending.json")
        let bytes = try Data(contentsOf: pending)
        model.editPremise("B cannot be confirmed", access: signedOut)
        let known = OnboardingInputAccess(active: true, credentialFree: false, authIntent: 11, sessionEpoch: 1)
        model.updateAccess(known)
        hold.release(); try await waitForIdle(model)
        XCTAssertEqual(try Data(contentsOf: pending), bytes)
        XCTAssertEqual(model.status, .accountRestricted)
        let saved = await checkpoint(custody)
        XCTAssertEqual(saved?.fields.premiseUTF8, Data("A valid pending evidence".utf8))
        XCTAssertFalse(model.canRecover(editGeneration: model.editGeneration, access: known))
    }

    func testTooLargeAContinuesSmallerQueuedBOnOriginalLineageWithoutSavingKnownC() async throws {
        let (root, custody, hold) = heldFixture()
        defer { hold.release(); try? FileManager.default.removeItem(at: root) }
        let model = OnboardingInputRecoveryModel(custody: custody)
        await model.inspect(signedOut)
        model.editName("Prior", access: signedOut); model.editPremise("P verified", access: signedOut)
        try await waitForSave(model)
        guard let prior = await checkpoint(custody) else { return XCTFail("Missing original CAS lineage") }
        let name = "  B E\u{301}va \t", premise = "\r\nSmaller B keeps 👩🏽‍🚀. \t\r\n"
        var capacityResults = 0
        // Observe the real production store result, then enqueue the user edit
        // before run() decides whether the still-active drain may continue.
        let observation = model.$status.sink { state in
            MainActor.assumeIsolated {
                guard state == .tooLarge else { return }
                capacityResults += 1
                guard capacityResults == 1 else { return }
                model.editName(name, access: self.signedOut)
                model.editPremise(premise, access: self.signedOut)
            }
        }
        defer { observation.cancel() }
        hold.arm()
        model.editPremise(String(repeating: "A", count: OnboardingInputCustody.maximumCheckpointBytes + 1), access: signedOut)
        var reachedB = false
        for _ in 0..<500 {
            if hold.isWaiting { reachedB = true; break }
            if !model.isCapturing { break }
            try await Task.sleep(for: .milliseconds(2))
        }
        XCTAssertEqual(capacityResults, 1, "A must really fail before I/O; neither coalescing A away nor retrying it proves this edge.")
        XCTAssertTrue(reachedB, "A distinct smaller queued B must reach the real checkpoint after A's pre-I/O rejection.")
        guard reachedB else {
            let retained = await checkpoint(custody)
            XCTAssertEqual(retained?.fields.nameUTF8, Data(name.utf8))
            XCTAssertEqual(retained?.fields.premiseUTF8, Data(premise.utf8))
            return
        }
        let pending = try Data(contentsOf: root.appendingPathComponent("pending.json"))
        let known = OnboardingInputAccess(active: true, credentialFree: false, authIntent: 11, sessionEpoch: 1)
        model.updateAccess(known); model.editName("known-account C", access: known)
        hold.release(); try await waitForIdle(model)
        let saved = await checkpoint(custody)
        XCTAssertEqual(saved?.fields.nameUTF8, Data(name.utf8))
        XCTAssertEqual(saved?.fields.premiseUTF8, Data(premise.utf8))
        XCTAssertEqual(saved?.previousRevisionID, prior.descriptor.revisionID)
        XCTAssertEqual(saved?.previousContentDigest, prior.descriptor.contentDigest)
        XCTAssertEqual(try Data(contentsOf: root.appendingPathComponent("current.json")), pending)
        XCTAssertEqual(model.fields.nameUTF8, Data("known-account C".utf8))
        XCTAssertFalse(model.fields.premiseWasEdited)
        XCTAssertEqual(model.status, .accountRestricted)
        XCTAssertFalse(model.canRecover(editGeneration: model.editGeneration, access: known))
    }

    func testTooLargeADoesNotRetryIdenticalOrLargerQueuedInput() async throws {
        let oversized = String(repeating: "A", count: OnboardingInputCustody.maximumCheckpointBytes + 1)
        for queued in [oversized, oversized + "B"] {
            let (root, _, model) = fixture(); defer { try? FileManager.default.removeItem(at: root) }
            await model.inspect(signedOut); model.editPremise("P stays intact", access: signedOut)
            try await waitForSave(model)
            let original = try Data(contentsOf: root.appendingPathComponent("current.json"))
            var capacityResults = 0
            let observation = model.$status.sink { state in
                MainActor.assumeIsolated {
                    guard state == .tooLarge else { return }
                    capacityResults += 1
                    if capacityResults == 1 { model.editPremise(queued, access: self.signedOut) }
                }
            }
            defer { observation.cancel() }
            model.editPremise(oversized, access: signedOut)
            try await waitForIdle(model)
            XCTAssertEqual(capacityResults, 1)
            XCTAssertEqual(try Data(contentsOf: root.appendingPathComponent("current.json")), original)
            XCTAssertFalse(FileManager.default.fileExists(atPath: root.appendingPathComponent("pending.json").path))
            XCTAssertEqual(model.status, .tooLarge)
        }
    }

    func testTooLargeSealedCandidatePreservesVerifiedAWithoutSavingKnownC() async throws {
        let (root, custody, hold) = heldFixture()
        defer { hold.release(); try? FileManager.default.removeItem(at: root) }
        let model = OnboardingInputRecoveryModel(custody: custody)
        await model.inspect(signedOut); hold.arm()
        model.editPremise("A stays protected", access: signedOut)
        try await waitForHold(hold)
        let original = try Data(contentsOf: root.appendingPathComponent("pending.json"))
        model.editPremise(String(repeating: "B", count: OnboardingInputCustody.maximumCheckpointBytes + 1), access: signedOut)
        let known = OnboardingInputAccess(active: true, credentialFree: false, authIntent: 11, sessionEpoch: 1)
        model.updateAccess(known); model.editPremise("known C is only local", access: known)
        hold.release(); try await waitForIdle(model)
        XCTAssertEqual(try Data(contentsOf: root.appendingPathComponent("current.json")), original)
        XCTAssertFalse(FileManager.default.fileExists(atPath: root.appendingPathComponent("pending.json").path))
        XCTAssertEqual(model.fields.premiseUTF8, Data("known C is only local".utf8))
        XCTAssertEqual(model.status, .accountRestricted)
        XCTAssertFalse(model.canRecover(editGeneration: model.editGeneration, access: known))
    }

    func testSealedCaptureNeverAdoptsAnotherWindowsOccupiedDescriptor() async throws {
        let (root, custody, model) = fixture(); defer { try? FileManager.default.removeItem(at: root) }
        await model.inspect(signedOut)
        var foreign = OnboardingInputFields(); foreign.premiseWasEdited = true; foreign.premiseUTF8 = Data("another window".utf8)
        let foreignFields = foreign
        let foreignResult = await Task.detached { custody.checkpoint(foreignFields, expected: nil, revisionID: UUID().uuidString) }.value
        guard case .verified = foreignResult else { return XCTFail("Missing other window checkpoint") }
        let bytes = try Data(contentsOf: root.appendingPathComponent("current.json"))
        model.editPremise("B cannot replace occupied input", access: signedOut)
        model.updateAccess(.init(active: true, credentialFree: false, authIntent: 11, sessionEpoch: 1))
        try await waitForIdle(model)
        XCTAssertEqual(try Data(contentsOf: root.appendingPathComponent("current.json")), bytes)
        XCTAssertEqual(model.status, .accountRestricted)
    }

    func testSealedAnonymousDrainOutlivesFormWithoutImportingLaterEpochFields() async throws {
        let (root, custody, hold) = heldFixture()
        defer { hold.release(); try? FileManager.default.removeItem(at: root) }
        var model: OnboardingInputRecoveryModel? = .init(custody: custody)
        weak var retained = model
        await model!.inspect(signedOut); hold.arm()
        model!.editPremise("A in flight", access: signedOut)
        try await waitForHold(hold)
        model!.editPremise("B survives the form", access: signedOut)
        model!.updateAccess(.init(active: true, credentialFree: false, authIntent: 11, sessionEpoch: 1))
        model!.editPremise("known C", access: .init(active: true, credentialFree: false, authIntent: 11, sessionEpoch: 1))
        model!.updateAccess(.init(active: true, credentialFree: true, authIntent: 12, sessionEpoch: 2))
        model!.editName("later anonymous epoch", access: .init(active: true, credentialFree: true, authIntent: 12, sessionEpoch: 2))
        model = nil
        XCTAssertNotNil(retained, "The in-flight owner must retain its immutable handoff")
        hold.release()
        for _ in 0..<500 {
            if retained == nil { break }
            try await Task.sleep(for: .milliseconds(2))
        }
        XCTAssertNil(retained)
        let saved = await checkpoint(custody)
        XCTAssertEqual(saved?.fields.premiseUTF8, Data("B survives the form".utf8))
        XCTAssertFalse(saved?.fields.nameWasEdited ?? true)
    }

}


/// Holds the real pending-file protection boundary; no store behavior is replaced.
nonisolated private final class OnboardingPendingFileHold: @unchecked Sendable {
    private let condition = NSCondition()
    private var armed = false
    private var waiting = false
    private var released = false
    private var fail = false

    var isWaiting: Bool {
        condition.lock(); defer { condition.unlock() }
        return waiting
    }
    func arm(fail: Bool = false) {
        condition.lock(); defer { condition.unlock() }
        armed = true; waiting = false; released = false; self.fail = fail
    }
    func release() {
        condition.lock(); released = true; condition.broadcast(); condition.unlock()
    }
    func protect(_ url: URL) throws {
        guard url.lastPathComponent == "pending.json" else { return }
        condition.lock(); defer { condition.unlock() }
        guard armed else { return }
        armed = false; waiting = true
        let deadline = Date().addingTimeInterval(10)
        while !released {
            guard condition.wait(until: deadline) else { throw CocoaError(.fileWriteUnknown) }
        }
        if fail { throw CocoaError(.fileWriteUnknown) }
    }
}

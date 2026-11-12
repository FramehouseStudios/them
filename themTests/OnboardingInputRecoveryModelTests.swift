import Foundation
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

}

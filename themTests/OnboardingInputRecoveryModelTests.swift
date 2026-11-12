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
}

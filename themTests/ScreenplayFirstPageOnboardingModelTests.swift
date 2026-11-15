import XCTest
@testable import them

@MainActor
final class ScreenplayFirstPageOnboardingModelTests: XCTestCase {
    func testBlankNameDoesNotQueueEitherKind() async {
        for kind in [ScreenplayFirstPageOnboardingModel.Kind.page, .voice] {
            let model = ScreenplayFirstPageOnboardingModel(name: " \n\t\u{2003}", sceneSeed: "Keep this scene")

            XCTAssertNil(model.queue(kind: kind))
            XCTAssertNil(model.beginPendingRequest(workspaceReady: true))
            XCTAssertFalse(model.isSubmitting)
            XCTAssertFalse(model.isWaitingForWorkspace)
            XCTAssertFalse(model.hasExplicitVoicePageIntent)
            XCTAssertFalse(model.error.isEmpty)
            XCTAssertEqual(model.sceneSeed, "Keep this scene")
        }
    }

    func testAuthDeferralKeepsOneImmutableRawUnicodeRequest() async throws {
        let name = " \tA\u{0301}va 👩🏽‍🚀\n"
        let scene = "\nINT. CAFE\u{0301} — NIGHT\r\n\t\"Stay.\"\u{200B} 🎬  "
        let model = ScreenplayFirstPageOnboardingModel(name: name, sceneSeed: scene)
        let queued = try XCTUnwrap(model.queue(kind: .page))

        XCTAssertTrue(model.isSubmitting)
        XCTAssertTrue(model.isWaitingForWorkspace)
        XCTAssertEqual(Array(queued.name.utf8), Array(name.utf8))
        XCTAssertEqual(Array(queued.sceneSeed.utf8), Array(scene.utf8))
        XCTAssertNil(model.beginPendingRequest(workspaceReady: false))
        XCTAssertNil(model.beginPendingRequest(workspaceReady: false))
        model.name = "Edited name"
        model.sceneSeed = "Edited scene"
        XCTAssertNil(model.queue(kind: .voice))

        let launched = try XCTUnwrap(model.beginPendingRequest(workspaceReady: true))
        XCTAssertFalse(model.isWaitingForWorkspace)
        XCTAssertEqual(launched.id, queued.id)
        XCTAssertEqual(launched.startedAt, queued.startedAt)
        XCTAssertEqual(launched.kind, .page)
        XCTAssertEqual(Array(launched.name.utf8), Array(name.utf8))
        XCTAssertEqual(Array(launched.sceneSeed.utf8), Array(scene.utf8))
        XCTAssertEqual(model.name, "Edited name")
        XCTAssertEqual(model.sceneSeed, "Edited scene")
    }

    func testWorkspaceReadinessConsumesRequestExactlyOnce() async throws {
        let model = ScreenplayFirstPageOnboardingModel(name: "Ava", sceneSeed: "A scene")
        let queued = try XCTUnwrap(model.queue(kind: .page))

        XCTAssertEqual(model.beginPendingRequest(workspaceReady: true)?.id, queued.id)
        XCTAssertNil(model.beginPendingRequest(workspaceReady: true))
        XCTAssertNil(model.beginPendingRequest(workspaceReady: false))
        XCTAssertNil(model.queue(kind: .page))
        XCTAssertTrue(model.isSubmitting)
        XCTAssertTrue(model.finishPage(requestID: queued.id, error: nil))
        XCTAssertNil(model.beginPendingRequest(workspaceReady: true))
    }

    func testPageCompletionCannotConsumeAuthDeferredRequest() async throws {
        let model = ScreenplayFirstPageOnboardingModel(name: "Ava", sceneSeed: "A scene")
        let queued = try XCTUnwrap(model.queue(kind: .page))

        XCTAssertFalse(model.finishPage(requestID: queued.id, error: nil))
        XCTAssertTrue(model.isSubmitting)
        XCTAssertEqual(model.sceneSeed, "A scene")
        XCTAssertEqual(model.beginPendingRequest(workspaceReady: true)?.id, queued.id)
        XCTAssertTrue(model.finishPage(requestID: queued.id, error: nil))
    }

    func testPageFailurePreservesInputAndRequiresExplicitRetry() async throws {
        let name = " Ava\n"
        let scene = "  A\u{0301} scene 🎬\r\n"
        let model = ScreenplayFirstPageOnboardingModel(name: name, sceneSeed: scene)
        let request = try XCTUnwrap(model.queue(kind: .page))
        _ = model.beginPendingRequest(workspaceReady: true)

        XCTAssertFalse(model.finishPage(requestID: request.id, error: "Provider unavailable"))
        XCTAssertFalse(model.isSubmitting)
        XCTAssertEqual(model.error, "Provider unavailable")
        XCTAssertEqual(Array(model.name.utf8), Array(name.utf8))
        XCTAssertEqual(Array(model.sceneSeed.utf8), Array(scene.utf8))
        XCTAssertNil(model.beginPendingRequest(workspaceReady: true))
        XCTAssertNil(model.beginPendingRequest(workspaceReady: true))
        XCTAssertFalse(model.finishPage(requestID: request.id, error: nil))

        let retry = try XCTUnwrap(model.queue(kind: .page))
        XCTAssertNotEqual(retry.id, request.id)
        XCTAssertEqual(Array(retry.sceneSeed.utf8), Array(scene.utf8))
        XCTAssertTrue(model.error.isEmpty)
        XCTAssertNil(model.beginPendingRequest(workspaceReady: false))
    }

    func testSuccessfulPageClearsOnlySubmittedSceneOnce() async throws {
        let name = " Ava\n"
        let model = ScreenplayFirstPageOnboardingModel(name: name, sceneSeed: "A scene")
        let request = try XCTUnwrap(model.queue(kind: .page))
        _ = model.beginPendingRequest(workspaceReady: true)

        XCTAssertTrue(model.finishPage(requestID: request.id, error: nil))
        XCTAssertFalse(model.isSubmitting)
        XCTAssertTrue(model.error.isEmpty)
        XCTAssertEqual(model.name, name)
        XCTAssertEqual(model.sceneSeed, "")
        XCTAssertFalse(model.finishPage(requestID: request.id, error: "Late failure"))
        XCTAssertTrue(model.error.isEmpty)
        XCTAssertNil(model.beginPendingRequest(workspaceReady: true))
    }

    func testSuccessfulOlderSnapshotDoesNotEraseUnicodeInputEdits() async throws {
        let model = ScreenplayFirstPageOnboardingModel(name: "Ava", sceneSeed: "Café")
        let request = try XCTUnwrap(model.queue(kind: .page))
        _ = model.beginPendingRequest(workspaceReady: true)
        let editedScene = "Cafe\u{0301}"
        model.sceneSeed = editedScene

        XCTAssertTrue(model.finishPage(requestID: request.id, error: nil))
        XCTAssertEqual(Array(model.sceneSeed.utf8), Array(editedScene.utf8))
    }

    func testCancelAuthDeferralRetainsEditsAndDoesNotLaunchLater() async throws {
        let model = ScreenplayFirstPageOnboardingModel(name: "Ava", sceneSeed: "First scene")
        let cancelled = try XCTUnwrap(model.queue(kind: .page))
        let editedName = " A\u{0301}va\n"
        let editedScene = " \tSecond scene 🎬\r\n"
        model.name = editedName
        model.sceneSeed = editedScene

        model.cancelPendingRequest()

        XCTAssertFalse(model.isSubmitting)
        XCTAssertNil(model.beginPendingRequest(workspaceReady: true))
        XCTAssertFalse(model.isWaitingForWorkspace)
        XCTAssertFalse(model.finishPage(requestID: cancelled.id, error: nil))
        XCTAssertEqual(Array(model.name.utf8), Array(editedName.utf8))
        XCTAssertEqual(Array(model.sceneSeed.utf8), Array(editedScene.utf8))
        let next = try XCTUnwrap(model.queue(kind: .voice))
        XCTAssertNotEqual(next.id, cancelled.id)
        XCTAssertEqual(Array(next.sceneSeed.utf8), Array(editedScene.utf8))
    }

    func testPendingCancellationDoesNotPretendToCancelAnActivePage() async throws {
        let model = ScreenplayFirstPageOnboardingModel(name: "Ava", sceneSeed: "A scene")
        let request = try XCTUnwrap(model.queue(kind: .page))
        _ = model.beginPendingRequest(workspaceReady: true)

        model.cancelPendingRequest()

        XCTAssertTrue(model.isSubmitting)
        XCTAssertNil(model.queue(kind: .page))
        XCTAssertTrue(model.finishPage(requestID: request.id, error: nil))
    }

    func testPagePromptUsesImmutableSnapshotAndOriginalFallbacks() async throws {
        let model = ScreenplayFirstPageOnboardingModel(
            name: " \tA\u{0301}va\n",
            sceneSeed: "\nA woman finds a blue key under a motel door.  "
        )
        let request = try XCTUnwrap(model.queue(kind: .page))
        model.name = "Changed name"
        model.sceneSeed = "Changed scene"

        XCTAssertEqual(request.pagePrompt, """
        Write the first page of a screenplay scene for A\u{0301}va.

        Scene impulse: A woman finds a blue key under a motel door.

        Write only the page content in clean Fountain/Hollywood screenplay format: one slugline, visual action, character cues, and dialogue. Keep it to roughly one page. Do not explain the formatting.
        """)

        let fallback = ScreenplayFirstPageOnboardingModel.Request(
            id: "fallback",
            kind: .page,
            name: " \n",
            sceneSeed: "\t\n ",
            startedAt: Date(timeIntervalSince1970: 0)
        )
        XCTAssertEqual(fallback.pagePrompt, """
        Write the first page of a screenplay scene for the writer.

        Scene impulse: someone walks into a room carrying a secret they cannot say out loud yet

        Write only the page content in clean Fountain/Hollywood screenplay format: one slugline, visual action, character cues, and dialogue. Keep it to roughly one page. Do not explain the formatting.
        """)
    }

    func testStalePageCompletionCannotFinishNewRequestOrOverwriteError() async throws {
        let model = ScreenplayFirstPageOnboardingModel(name: "Ava", sceneSeed: "A scene")
        let first = try XCTUnwrap(model.queue(kind: .page))
        _ = model.beginPendingRequest(workspaceReady: true)
        XCTAssertFalse(model.finishPage(requestID: first.id, error: "First failure"))
        let second = try XCTUnwrap(model.queue(kind: .page))
        _ = model.beginPendingRequest(workspaceReady: true)

        XCTAssertFalse(model.finishPage(requestID: first.id, error: nil))
        XCTAssertFalse(model.finishPage(requestID: first.id, error: "Late failure"))
        XCTAssertTrue(model.isSubmitting)
        XCTAssertTrue(model.error.isEmpty)
        XCTAssertEqual(model.sceneSeed, "A scene")
        XCTAssertTrue(model.finishPage(requestID: second.id, error: nil))
    }

    func testWrongCompletionKindLeavesCurrentRequestActive() async throws {
        let model = ScreenplayFirstPageOnboardingModel(name: "Ava", sceneSeed: "A scene")
        let page = try XCTUnwrap(model.queue(kind: .page))
        _ = model.beginPendingRequest(workspaceReady: true)
        XCTAssertFalse(model.finishVoiceLaunch(requestID: page.id))
        XCTAssertFalse(model.hasExplicitVoicePageIntent)
        XCTAssertTrue(model.isSubmitting)
        XCTAssertTrue(model.finishPage(requestID: page.id, error: " \n"))

        let voice = try XCTUnwrap(model.queue(kind: .voice))
        _ = model.beginPendingRequest(workspaceReady: true)
        XCTAssertFalse(model.finishPage(requestID: voice.id, error: "Wrong kind"))
        XCTAssertTrue(model.error.isEmpty)
        XCTAssertTrue(model.isSubmitting)
        XCTAssertTrue(model.finishVoiceLaunch(requestID: voice.id))
    }

    func testVoiceLaunchRequiresReadyWorkspaceAndArmsIntentOnlyOnce() async throws {
        let scene = "  Spoken scene 🎬\n"
        let model = ScreenplayFirstPageOnboardingModel(name: "Ava", sceneSeed: scene)
        let request = try XCTUnwrap(model.queue(kind: .voice))

        XCTAssertFalse(model.hasExplicitVoicePageIntent)
        XCTAssertNil(model.beginPendingRequest(workspaceReady: false))
        XCTAssertFalse(model.finishVoiceLaunch(requestID: request.id))
        XCTAssertTrue(model.isSubmitting)
        XCTAssertEqual(model.beginPendingRequest(workspaceReady: true)?.id, request.id)
        XCTAssertFalse(model.hasExplicitVoicePageIntent)
        XCTAssertTrue(model.finishVoiceLaunch(requestID: request.id))
        XCTAssertTrue(model.hasExplicitVoicePageIntent)
        XCTAssertFalse(model.isSubmitting)
        XCTAssertEqual(Array(model.sceneSeed.utf8), Array(scene.utf8))
        XCTAssertFalse(model.finishVoiceLaunch(requestID: request.id))
        XCTAssertNil(model.beginPendingRequest(workspaceReady: true))
    }

    func testVoiceIntentSurvivesFailureAndPendingCancellationUntilPageWritten() async throws {
        let scene = "Keep this scene"
        let model = ScreenplayFirstPageOnboardingModel(name: "Ava", sceneSeed: scene)
        let voice = try XCTUnwrap(model.queue(kind: .voice))
        _ = model.beginPendingRequest(workspaceReady: true)
        XCTAssertTrue(model.finishVoiceLaunch(requestID: voice.id))
        let page = try XCTUnwrap(model.queue(kind: .page))
        _ = model.beginPendingRequest(workspaceReady: true)

        XCTAssertFalse(model.finishPage(requestID: page.id, error: "Voice turn failed"))
        XCTAssertTrue(model.hasExplicitVoicePageIntent)
        _ = model.queue(kind: .voice)
        model.cancelPendingRequest()
        XCTAssertTrue(model.hasExplicitVoicePageIntent)
        XCTAssertEqual(model.sceneSeed, scene)

        let committedAt = Date()
        model.acknowledgeCommittedPage(isAuthoritative: true, insertedText: "INT. KITCHEN - DAY", committedAt: committedAt)
        model.acknowledgeCommittedPage(isAuthoritative: true, insertedText: "INT. KITCHEN - DAY", committedAt: committedAt)
        XCTAssertFalse(model.hasExplicitVoicePageIntent)
        XCTAssertEqual(model.sceneSeed, scene)
    }

    func testVoiceIntentRequiresAuthoritativeNonblankCommitAfterActivation() async throws {
        let model = ScreenplayFirstPageOnboardingModel(name: "Ava", sceneSeed: "Keep this scene")
        let request = try XCTUnwrap(model.queue(kind: .voice))
        _ = model.beginPendingRequest(workspaceReady: true)
        XCTAssertTrue(model.finishVoiceLaunch(requestID: request.id))

        model.acknowledgeCommittedPage(isAuthoritative: false, insertedText: "INT. KITCHEN - DAY", committedAt: .distantFuture)
        XCTAssertTrue(model.hasExplicitVoicePageIntent)
        model.acknowledgeCommittedPage(isAuthoritative: true, insertedText: " \t\n", committedAt: .distantFuture)
        XCTAssertTrue(model.hasExplicitVoicePageIntent)
        model.acknowledgeCommittedPage(isAuthoritative: true, insertedText: "INT. KITCHEN - DAY", committedAt: .distantPast)
        XCTAssertTrue(model.hasExplicitVoicePageIntent)

        model.acknowledgeCommittedPage(isAuthoritative: true, insertedText: "INT. KITCHEN - DAY", committedAt: Date())
        XCTAssertFalse(model.hasExplicitVoicePageIntent)
        XCTAssertEqual(model.name, "Ava")
        XCTAssertEqual(model.sceneSeed, "Keep this scene")
    }

    func testExplicitVoiceCancellationPreservesInputAndRejectsStaleLaunch() async throws {
        let name = " Ava\n"
        let scene = " \tA scene 🎬\r\n"
        let model = ScreenplayFirstPageOnboardingModel(name: name, sceneSeed: scene)
        let first = try XCTUnwrap(model.queue(kind: .voice))
        _ = model.beginPendingRequest(workspaceReady: true)
        XCTAssertTrue(model.finishVoiceLaunch(requestID: first.id))
        model.cancelVoicePageIntent()
        XCTAssertFalse(model.hasExplicitVoicePageIntent)
        let second = try XCTUnwrap(model.queue(kind: .voice))
        _ = model.beginPendingRequest(workspaceReady: true)

        XCTAssertFalse(model.finishVoiceLaunch(requestID: first.id))
        XCTAssertFalse(model.hasExplicitVoicePageIntent)
        XCTAssertTrue(model.isSubmitting)
        XCTAssertEqual(Array(model.name.utf8), Array(name.utf8))
        XCTAssertEqual(Array(model.sceneSeed.utf8), Array(scene.utf8))
        XCTAssertTrue(model.finishVoiceLaunch(requestID: second.id))
        XCTAssertTrue(model.hasExplicitVoicePageIntent)
        model.cancelVoicePageIntent()
        XCTAssertFalse(model.hasExplicitVoicePageIntent)
    }
}

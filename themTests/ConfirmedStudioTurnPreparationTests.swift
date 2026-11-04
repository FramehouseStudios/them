import XCTest
@testable import them

final class ConfirmedStudioTurnPreparationTests: XCTestCase {
    func test_refused_commands_never_open_studio_but_a_separate_positive_request_can() {
        for text in ["Don't write a story. Just listen.", "Do not open Studio.", "I don't want you to write a screenplay.", "Never launch Studio.", "Stop writing the scene."] {
            let active = ConfirmedStudioTurnPreparation.prepare(
                transcript: text, isStudioActive: { false },
                openStudio: { XCTFail("Refused command opened Studio: \(text)") },
                build: { _, active in active }
            )
            XCTAssertFalse(active, text)
        }
        XCTAssertTrue(ScreenplayIntentClassifier.hasExplicitScriptIntent("Don't write a story; open Studio instead."))
        XCTAssertTrue(ScreenplayIntentClassifier.hasExplicitScriptIntent("Don't open Studio; write a scene about an astronaut."))
    }

    func test_write_a_story_is_explicit_but_personal_story_distress_is_not() {
        XCTAssertTrue(ScreenplayIntentClassifier.hasExplicitScriptIntent("Write a story about two astronauts."))
        XCTAssertFalse(ScreenplayIntentClassifier.hasExplicitScriptIntent("I feel so lost, I don't know what my story is anymore"))
    }

    func test_page_command_cues_survive_punctuation_and_spacing() {
        XCTAssertEqual(ScreenplayIntentClassifier.normalize("  Write a scene.  "), " write a scene ")
        XCTAssertEqual(ScreenplayIntentClassifier.normalize("Write a story!"), " write a story ")
        XCTAssertEqual(ScreenplayIntentClassifier.normalize("Rewrite—this scene."), " rewrite this scene ")
    }

    func test_confirmed_home_script_request_opens_before_page_preparation() {
        var active = false
        var events: [String] = []
        let page = ConfirmedStudioTurnPreparation.prepare(
            transcript: "Write a scene about two astronauts.",
            isStudioActive: { active },
            openStudio: { events.append("open"); active = true },
            build: { text, isActive in
                events.append("prepare")
                XCTAssertEqual(text, "Write a scene about two astronauts.")
                return ScreenplayIntentClassifier.canWriteToPage(isStudioActive: isActive, useScreenplayMode: isActive)
            }
        )
        XCTAssertEqual(events, ["open", "prepare"])
        XCTAssertTrue(page)
    }

    func test_auth_refusal_does_not_enable_page_writing() {
        let page = ConfirmedStudioTurnPreparation.prepare(
            transcript: "Write a scene about two astronauts.",
            isStudioActive: { false }, openStudio: {},
            build: { _, active in ScreenplayIntentClassifier.canWriteToPage(isStudioActive: active, useScreenplayMode: active) }
        )
        XCTAssertFalse(page)
    }

    func test_everyday_home_words_never_open_or_prepare_a_page() {
        for text in ["I feel so lost, I don't know what my story is anymore", "I'm stuck in line at the DMV, help me stay calm", "Help me finish this draft of my email", "she wants to break up with me", "I love that ending", ""] {
            let mode = ConfirmedStudioTurnPreparation.prepare(
                transcript: text, isStudioActive: { false },
                openStudio: { XCTFail("Unexpected opening for \(text)") },
                build: { _, active in active }
            )
            XCTAssertFalse(mode, text)
        }
    }

    func test_current_server_words_win_over_earlier_client_words() {
        XCTAssertEqual(ConfirmedStudioTurnPreparation.currentTranscript(clientOverride: "Write a scene.", serverTranscript: " Help me stay calm. "), "Help me stay calm.")
        XCTAssertEqual(ConfirmedStudioTurnPreparation.currentTranscript(clientOverride: nil), "", "No previous transcript or partial is an input to this policy")
        XCTAssertEqual(ConfirmedStudioTurnPreparation.currentTranscript(clientOverride: "  Write a scene.  "), "Write a scene.")
    }

    func test_existing_studio_turn_does_not_reopen_the_workspace() {
        let active = ConfirmedStudioTurnPreparation.prepare(
            transcript: "Rewrite this scene.", isStudioActive: { true },
            openStudio: { XCTFail("Studio already open") }, build: { _, active in active }
        )
        XCTAssertTrue(active)
    }
}

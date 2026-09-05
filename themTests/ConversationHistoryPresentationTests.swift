import XCTest
@testable import them

@MainActor
final class ConversationHistoryPresentationTests: XCTestCase {
    func testPresentationPreservesCompleteWriterAndClementineTranscript() {
        let thread = ConversationThread(
            id: "thread-18",
            turn: 18,
            title: "  The lighthouse door  ",
            lastUpdated: Date(timeIntervalSince1970: 1_788_543_000),
            preview: "A choice in the storm.",
            userMessage: "  Make the choice physical.  ",
            assistantMessage: "  Mara braces both hands against the door.  "
        )

        let presentation = ConversationThreadPresentation(thread: thread)

        XCTAssertEqual(presentation.title, "The lighthouse door")
        XCTAssertEqual(presentation.writerMessage, "Make the choice physical.")
        XCTAssertEqual(presentation.clementineMessage, "Mara braces both hands against the door.")
        XCTAssertEqual(presentation.turnLabel, "Turn 18")
        XCTAssertFalse(presentation.updatedLabel.isEmpty)
    }

    func testPresentationExplainsMissingTranscriptDataWithoutInventingContent() {
        let thread = ConversationThread(
            id: "thread-empty",
            turn: 0,
            title: " \n ",
            lastUpdated: Date(timeIntervalSince1970: 0),
            preview: "",
            userMessage: "",
            assistantMessage: "  "
        )

        let presentation = ConversationThreadPresentation(thread: thread)

        XCTAssertEqual(presentation.title, "Untitled conversation")
        XCTAssertEqual(presentation.writerMessage, "The writer's message was not saved for this turn.")
        XCTAssertEqual(presentation.clementineMessage, "Clementine's reply was not saved for this turn.")
        XCTAssertEqual(presentation.turnLabel, "Saved conversation")
    }

    func testUITestFixtureRequiresBothExplicitLaunchFlags() {
        let vm = ConversationHistoryViewModel()
        let now = Date(timeIntervalSince1970: 1_788_543_000)

        XCTAssertFalse(vm.installUITestFixtureIfNeeded(arguments: ["--ui-testing"], now: now))
        XCTAssertTrue(vm.installUITestFixtureIfNeeded(
            arguments: ["--ui-testing", "--ui-history-fixture"],
            now: now
        ))

        guard case .loaded(let threads) = vm.state else {
            return XCTFail("The explicit fixture should install local history rows.")
        }
        XCTAssertEqual(threads.count, 2)
        XCTAssertEqual(threads.first?.title, "The lighthouse door")
        XCTAssertEqual(threads.first?.assistantMessage.contains("salt-swollen door"), true)
        XCTAssertEqual(vm.subtitle, "A clear record of the pages you shaped with Clementine.")
    }
}

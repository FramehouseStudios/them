import XCTest
@testable import them

final class NotesDeleteConfirmationTests: XCTestCase {
    func testSingleNoteNamesTheNote() {
        let action = NotesDeleteConfirmation.note(id: "n1", title: "Motel door")
        XCTAssertEqual(action.title, "Delete \u{201C}Motel door\u{201D}?")
        XCTAssertEqual(action.confirmLabel, "Delete Note")
        XCTAssertTrue(action.message.contains("cannot be undone"))
        XCTAssertTrue(action.message.contains("not touched"), "the writer hears that pages survive")
    }

    func testUntitledNoteStillAsksAQuestion() {
        XCTAssertEqual(NotesDeleteConfirmation.note(id: "n2", title: "   ").title, "Delete this note?")
    }

    func testClearAllCountsTheNotes() {
        XCTAssertEqual(NotesDeleteConfirmation.all(count: 1).title, "Delete your only note?")
        XCTAssertEqual(NotesDeleteConfirmation.all(count: 4).title, "Delete all 4 notes?")
        XCTAssertEqual(NotesDeleteConfirmation.all(count: 4).confirmLabel, "Delete All Notes")
    }

    func testIdentitiesAreDistinct() {
        XCTAssertNotEqual(NotesDeleteConfirmation.note(id: "a", title: "x").id, NotesDeleteConfirmation.note(id: "b", title: "x").id)
        XCTAssertNotEqual(NotesDeleteConfirmation.note(id: "a", title: "x").id, NotesDeleteConfirmation.all(count: 2).id)
    }
}

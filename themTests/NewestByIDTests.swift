import XCTest
@testable import them

/// Memories crashed on refresh when two cards shared an id (2026-09-30).
final class NewestByIDTests: XCTestCase {
    private struct Card: Equatable {
        let id: String
        let date: Date
        let note: String
    }

    private let old = Date(timeIntervalSince1970: 100)
    private let new = Date(timeIntervalSince1970: 200)

    func testADuplicatedIdKeepsTheNewestCopyInsteadOfTrapping() {
        let cards = [
            Card(id: "character-nora", date: old, note: "Sine Die"),
            Card(id: "character-danny", date: old, note: "Sine Die"),
            Card(id: "character-nora", date: new, note: "Senate Staffer"),
        ]
        let map = NewestByID.map(cards, id: \.id, date: \.date)
        XCTAssertEqual(map.count, 2)
        XCTAssertEqual(map["character-nora"]?.note, "Senate Staffer")
    }

    func testTheListKeepsItsOrderWithOneRowPerId() {
        let cards = [
            Card(id: "a", date: new, note: "first"),
            Card(id: "b", date: old, note: "b"),
            Card(id: "a", date: old, note: "older copy"),
        ]
        XCTAssertEqual(NewestByID.uniqued(cards, id: \.id, date: \.date).map(\.note), ["first", "b"])
    }
}

import XCTest
@testable import them

final class ScreenplayFDXRequestPayloadTests: XCTestCase {
    func testTitlePageMetadataIsExportedSeparatelyFromScreenplayBody() throws {
        let body = "INT. ROOM - NIGHT\n\nA clock stops."
        let draft = "Title: Orbit\nCredit: Written by\nAuthor: A Writer\nDraft date: 2026-10-16\nContact: writer@example.invalid\n\n" + body
        let payload = ScreenplayFDXRequestPayload.document(draft: draft, title: "Older project label")
        XCTAssertEqual(payload["title"] as? [String: String], [
            "title": "Orbit", "credit": "Written by", "author": "A Writer",
            "draftDate": "2026-10-16", "contact": "writer@example.invalid",
        ])
        let expected = ScreenplayFDXRequestPayload.document(draft: body, title: "Orbit")
        XCTAssertEqual(try JSONSerialization.data(withJSONObject: payload["scenes"]!, options: .sortedKeys),
                       try JSONSerialization.data(withJSONObject: expected["scenes"]!, options: .sortedKeys))
    }

    func testTitleOnlyExportDoesNotInventStoryOrAuthorship() throws {
        let payload = ScreenplayFDXRequestPayload.document(draft: "Title: Orbit\n", title: "Older label")
        XCTAssertEqual(try XCTUnwrap(payload["scenes"] as? [[String: Any]]).count, 0)
        XCTAssertEqual((payload["title"] as? [String: String])?["author"], "")
    }

    func testEmptyDocumentOmitsBlankTitleAndHasNoScenes() throws {
        let payload = ScreenplayFDXRequestPayload.document(draft: " \r\n\t", title: " \t ")
        XCTAssertNil(payload["title"])
        XCTAssertEqual(try XCTUnwrap(payload["scenes"] as? [[String: Any]]).count, 0)
    }

    func testActionBeforeFirstHeadingIsNotDiscarded() throws {
        let payload = ScreenplayFDXRequestPayload.document(
            draft: "A hallway without a heading.\n\nINT. ROOM - NIGHT\n\nA clock stops.", title: "Test")
        let scenes = try XCTUnwrap(payload["scenes"] as? [[String: Any]])
        XCTAssertEqual(scenes.count, 2)
        XCTAssertNil(scenes[0]["heading"])
        let prologue = try XCTUnwrap(scenes[0]["lines"] as? [[String: String]])
        XCTAssertEqual(prologue, [["kind": "action", "text": "A hallway without a heading."]])
        XCTAssertEqual(scenes[1]["heading"] as? String, "INT. ROOM - NIGHT")
    }

    func testCRAndCRLFNormalizeWithoutChangingDialogueUnicodeBytes() throws {
        let dialogue = "A cafe\u{0301} sign says <OPEN> & waits."
        let payload = ScreenplayFDXRequestPayload.document(
            draft: "INT. ROOM - NIGHT\r\n\r\nMAYA\r(quietly)\r\(dialogue)", title: "Room")
        let scenes = try XCTUnwrap(payload["scenes"] as? [[String: Any]])
        let lines = try XCTUnwrap(scenes.first?["lines"] as? [[String: Any]])
        let spoken = try XCTUnwrap(lines.first?["dialogue"] as? [String])
        XCTAssertEqual(Array(spoken.joined().utf8), Array(dialogue.utf8))
        XCTAssertEqual(lines.first?["parenthetical"] as? String, "(quietly)")
    }

    func testHeadingEndsDialogueEvenWithoutBlankSeparator() throws {
        let payload = ScreenplayFDXRequestPayload.document(
            draft: "INT. ROOM - NIGHT\nMAYA\nStay here.\nEXT. STREET - DAWN\nA car leaves.", title: "Room")
        let scenes = try XCTUnwrap(payload["scenes"] as? [[String: Any]])
        XCTAssertEqual(scenes.count, 2)
        let first = try XCTUnwrap(scenes[0]["lines"] as? [[String: Any]])
        XCTAssertEqual(first.first?["dialogue"] as? [String], ["Stay here."])
        let second = try XCTUnwrap(scenes[1]["lines"] as? [[String: String]])
        XCTAssertEqual(second, [["kind": "action", "text": "A car leaves."]])
    }
}

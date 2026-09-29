import XCTest
@testable import them

final class ScreenplayCharacterArcMemoryPolicyTests: XCTestCase {
    func testNoWriterFactsMeansNoArcMemoryForTheGate() {
        XCTAssertNil(ScreenplayCharacterArcMemoryPolicy.memory(character: "JOE", act: "Act I", want: "", need: " ", opposition: ""))
    }

    func testArcMemoryHoldsOnlyTheWritersSpine() {
        let memory = ScreenplayCharacterArcMemoryPolicy.memory(
            character: "MAE", act: "Act I",
            want: "to finally stay somewhere", need: "to let someone take care of her", opposition: "her own habit of leaving"
        )
        XCTAssertEqual(memory?.want, "to finally stay somewhere")
        XCTAssertEqual(memory?.need, "to let someone take care of her")
        XCTAssertEqual(memory?.relationshipPressure, "her own habit of leaving")
        XCTAssertEqual(memory?.currentTactic, "", "planner guidance is not a character tactic")
        XCTAssertEqual(memory?.nextEmotionalTurn, "")
    }
}

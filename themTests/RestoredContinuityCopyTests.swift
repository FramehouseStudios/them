import XCTest
@testable import them

final class RestoredContinuityCopyTests: XCTestCase {
    func testTheActReadsOnce() {
        XCTAssertEqual(RestoredContinuityCopy.position(act: "Act I", featureSequence: "Act I - Opening Image / Ordinary World (p1-p12)"),
                       "Act I - Opening Image / Ordinary World (p1-p12)")
        XCTAssertEqual(RestoredContinuityCopy.position(act: "Act II", featureSequence: "Midpoint Pressure"), "Act II / Midpoint Pressure")
        XCTAssertEqual(RestoredContinuityCopy.position(act: "", featureSequence: "Midpoint Pressure"), "Midpoint Pressure")
    }

    func testPlannerWordingIsNotTheWritersNextMove() {
        XCTAssertEqual(RestoredContinuityCopy.writerMove("Act I - Opening Image / Ordinary World: Plant the emotional question the ending must answer."), "")
        XCTAssertEqual(RestoredContinuityCopy.writerMove("Write the next scene: BUS DEPOT"), "")
        XCTAssertEqual(RestoredContinuityCopy.writerMove("Sequence move: Open on behavior that shows the wound."), "")
        XCTAssertEqual(RestoredContinuityCopy.writerMove("Mara lies to the harbor master about the reel"),
                       "Mara lies to the harbor master about the reel", "a story move stays")
    }

    func testThePageItselfIsNotARememberedThread() {
        let page = "INT. BUS DEPOT - NIGHT Rain on the roof. A single bus idles with its doors open. MAE Last one tonight?"
        XCTAssertEqual(RestoredContinuityCopy.threads([page, "Mae chose the last bus over going home."]),
                       ["Mae chose the last bus over going home."])
        XCTAssertEqual(RestoredContinuityCopy.threads([String(repeating: "word ", count: 60)]), [])
        XCTAssertEqual(RestoredContinuityCopy.threads(["Rain on the roof. A single bus idles with its doors open. MAE Last one tonight? DRIVER"]), [],
                       "page text without its heading (seen live)")
        XCTAssertEqual(RestoredContinuityCopy.threads(["Nora trusts June for the first time."]), ["Nora trusts June for the first time."])
    }
}

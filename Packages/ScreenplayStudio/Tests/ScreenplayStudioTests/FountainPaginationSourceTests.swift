import Foundation
import Testing
@testable import ScreenplayStudio

@Test func titleOnlyDocumentHasNoScriptPages() {
    let source = FountainPaginationSource.make(
        from: "Title:\n    ASHES\nCredit:\n    Written by"
    )

    #expect(source.hasTitlePage)
    #expect(!source.shouldPaginate)
    #expect(source.scriptText.isEmpty)
}

@Test func titlePageIsExcludedAndScriptLinesMapBackToDocument() {
    let body = "INT. ROOM - NIGHT\n\nMARA\nStay."
    let document = "Title:\n    ASHES\nAuthor:\n    Zoë Chen\n\n" + body
    let bodyChecksum = fnv1a64ForPaginationTest(Data(body.utf8))

    let source = FountainPaginationSource.make(from: document)

    #expect(source.shouldPaginate)
    #expect(source.scriptText == body)
    #expect(fnv1a64ForPaginationTest(Data(source.scriptText.utf8)) == bodyChecksum)
    #expect(source.documentLineOffset == 5)
    #expect(source.documentLine(forScriptLine: 1) == 6)
    #expect(source.documentLine(forScriptLine: 4) == 9)
}

@Test func documentWithoutTitlePageKeepsBackwardCompatiblePaginationInput() {
    let script = "INT. KITCHEN - DAY\n\nA kettle screams."

    let source = FountainPaginationSource.make(from: script)

    #expect(!source.hasTitlePage)
    #expect(source.shouldPaginate)
    #expect(source.scriptText == script)
    #expect(source.documentLineOffset == 0)
    #expect(source.documentLine(forScriptLine: 3) == 3)
}

private func fnv1a64ForPaginationTest(_ data: Data) -> UInt64 {
    data.reduce(14_695_981_039_346_656_037) { partial, byte in
        (partial ^ UInt64(byte)) &* 1_099_511_628_211
    }
}

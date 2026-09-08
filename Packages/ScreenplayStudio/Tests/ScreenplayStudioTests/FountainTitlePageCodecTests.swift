import Foundation
import Testing
@testable import ScreenplayStudio

@Test func parsesStandardLeadingFountainTitleMetadata() {
    let document = """
    Title:
        THE LAST LIGHT
    Credit: Written by
    Authors:
        Anaïs Núñez
        李 明
    Draft date:
        September 8, 2026
    Contact:
        writer@example.com

    INT. OBSERVATORY - NIGHT

    The dome opens.
    """

    let parts = FountainTitlePageCodec.parse(document)

    #expect(parts.hasTitlePage)
    #expect(parts.titlePage?.title == "THE LAST LIGHT")
    #expect(parts.titlePage?.credit == "Written by")
    #expect(parts.titlePage?.authors == ["Anaïs Núñez", "李 明"])
    #expect(parts.titlePage?.draftDate == "September 8, 2026")
    #expect(parts.titlePage?.contact == "writer@example.com")
    #expect(parts.screenplayBodyStartLine == 12)
    #expect(parts.scriptPageText == "INT. OBSERVATORY - NIGHT\n\nThe dome opens.")
}

@Test func blankTitleMaterializesAsProvisionalUntitledScreenplay() {
    let result = FountainTitlePageCodec.materialize(.init(title: "   "))

    #expect(result.hasPrefix("Title:\n    UNTITLED SCREENPLAY"))
    #expect(FountainTitlePageCodec.parse(result).titlePage?.title == "UNTITLED SCREENPLAY")
}

@Test func renamingTitlePreservesUnicodeBodyChecksum() {
    let body = "INT. CAFÉ - NIGHT\n\nZoë studies the 16mm reel. 🎞️\n\n李\nIt remembers us."
    let original = "Title:\n    OLD NAME\nCredit:\n    Written by\nAuthor:\n    Anaïs Núñez\n\n" + body
    let checksumBefore = fnv1a64(Data(body.utf8))

    let renamed = FountainTitlePageCodec.renamingTitle(in: original, to: "ÉCHOES / 回声")
    let parsed = FountainTitlePageCodec.parse(renamed)

    #expect(parsed.titlePage?.title == "ÉCHOES / 回声")
    #expect(parsed.screenplayBody == body)
    #expect(fnv1a64(Data(parsed.screenplayBody.utf8)) == checksumBefore)
}

@Test func crlfDocumentRetainsLineEndingAndBodyBytes() {
    let body = "INT. TRAIN - DAWN\r\n\r\nMARA\r\nWe made it.\r\n"
    let original = "Title:\r\n    NORTHBOUND\r\nCredit:\r\n    Written by\r\n\r\n" + body
    var metadata = FountainTitlePageCodec.parse(original).titlePage!
    metadata.draftDate = "2026-09-08"

    let updated = FountainTitlePageCodec.updating(original, with: metadata)
    let parsed = FountainTitlePageCodec.parse(updated)

    #expect(parsed.lineEnding == "\r\n")
    #expect(parsed.screenplayBody == body)
    #expect(updated.contains("Draft date:\r\n    2026-09-08\r\n\r\nINT. TRAIN"))
}

@Test func updatingKnownFieldsRetainsUnknownMetadata() {
    let original = """
    Title:
        ASHES
    Source:
        An original story
    Revision Color: Blue

    EXT. SALT FLAT - DAY
    """
    let metadata = FountainTitlePage(title: "EMBER", credit: "A screenplay by")

    let updated = FountainTitlePageCodec.updating(original, with: metadata)
    let reparsed = FountainTitlePageCodec.parse(updated)

    #expect(reparsed.titlePage?.additionalFields == [
        .init(key: "Source", values: ["An original story"]),
        .init(key: "Revision Color", values: ["Blue"]),
    ])
    #expect(reparsed.titlePage?.title == "EMBER")
    #expect(reparsed.screenplayBody == "EXT. SALT FLAT - DAY")
}

@Test func colonInOrdinaryScriptDoesNotCreateTitlePage() {
    let script = "TIME: Midnight.\n\nA phone rings."
    let parts = FountainTitlePageCodec.parse(script)

    #expect(!parts.hasTitlePage)
    #expect(parts.screenplayBody == script)
}

@Test func blankLineEndsMetadataBeforeColonBearingAction() {
    let document = "Title:\n    ASHES\n\nTIME: Midnight.\n\nA phone rings."

    let parts = FountainTitlePageCodec.parse(document)

    #expect(parts.titlePage?.title == "ASHES")
    #expect(parts.titlePage?.additionalFields.isEmpty == true)
    #expect(parts.screenplayBody == "TIME: Midnight.\n\nA phone rings.")
}

@Test func titleOnlyTrailingNewlinesDoNotBecomeScreenplayBody() {
    let document = "Title:\n    ASHES\nCredit:\n    Written by\n\n\n"

    let parts = FountainTitlePageCodec.parse(document)
    let renamed = FountainTitlePageCodec.renamingTitle(in: document, to: "EMBER")

    #expect(parts.hasTitlePage)
    #expect(parts.screenplayBody.isEmpty)
    #expect(FountainTitlePageCodec.parse(renamed).screenplayBody.isEmpty)
    #expect(renamed == "Title:\n    EMBER\nCredit:\n    Written by")
}

@Test func firstSceneUsesExactlyOneBlankLineAfterTitlePage() throws {
    let titleOnly = FountainTitlePageCodec.materialize(.init(title: "ASHES", authors: ["Mara Voss"]))
    let scene = "\r\n\nINT. MOTEL ROOM - NIGHT\n\nRain needles the glass.\n"

    let document = try FountainTitlePageCodec.appendingFirstScene(scene, to: titleOnly)

    #expect(document.contains("Author:\n    Mara Voss\n\nINT. MOTEL ROOM - NIGHT"))
    #expect(!document.contains("Mara Voss\n\n\nINT."))
    #expect(FountainTitlePageCodec.parse(document).screenplayBody == "INT. MOTEL ROOM - NIGHT\n\nRain needles the glass.\n")
}

@Test func firstSceneRejectsAnExistingScreenplayBody() {
    let document = "Title:\n    ASHES\n\nINT. ROOM - NIGHT"

    #expect(throws: FountainTitlePageCodecError.screenplayBodyAlreadyPresent) {
        try FountainTitlePageCodec.appendingFirstScene("EXT. ROAD - DAY", to: document)
    }
}

@Test func bodyWithoutTitlePageIsEntireScriptPageSource() {
    let body = "INT. KITCHEN - DAY\n\nA kettle screams."
    let parts = FountainTitlePageCodec.parse(body)

    #expect(parts.titlePage == nil)
    #expect(parts.screenplayBodyStartLine == 1)
    #expect(parts.scriptPageText == body)
}

@Test func screenplayElementInferenceExcludesTitleMetadata() {
    let document = "Title:\n    ASHES\nCredit:\n    Written by\n\nINT. ROOM - NIGHT\n\nMARA\nStay."

    let elements = ScreenplayEditorElement.inferredScreenplaySequence(for: document)

    #expect(elements.count == 4)
    #expect(elements[0] == .sceneHeading)
    #expect(elements[1] == nil)
    #expect(elements[2] == .character)
    #expect(elements[3] == .dialogue)
}

private func fnv1a64(_ data: Data) -> UInt64 {
    data.reduce(14_695_981_039_346_656_037) { partial, byte in
        (partial ^ UInt64(byte)) &* 1_099_511_628_211
    }
}

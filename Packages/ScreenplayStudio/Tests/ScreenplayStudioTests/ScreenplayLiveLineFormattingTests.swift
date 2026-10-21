import Testing
@testable import ScreenplayStudio

@Test func liveProsePreservesIncompleteWordsPunctuationAndWhitespace() {
    for element in [ScreenplayEditorElement.action, .dialogue] {
        for raw in ["She counts seven red lights ", "i still  have time\t", "— wait…  ", "  "] {
            #expect(FountainFormatter.normalizeLiveEditorLine(raw, as: element) == raw)
        }
    }
}

@Test func liveCueAndHeadingPreserveTheirTypedWordSeparators() {
    #expect(FountainFormatter.normalizeLiveEditorLine("JOHN ", as: .character) == "JOHN ")
    #expect(FountainFormatter.normalizeLiveEditorLine("JOHN DOE  \t", as: .character) == "JOHN DOE  \t")
    #expect(FountainFormatter.normalizeLiveEditorLine("EXT. PIER - NIGHT ", as: .sceneHeading) == "EXT. PIER - NIGHT ")
    #expect(FountainFormatter.normalizeLiveEditorLine("JOHN\u{00A0}", as: .character) == "JOHN\u{00A0}")
}

@Test func liveParentheticalAndTransitionKeepStructuralFormattingAndTheirSuffix() {
    #expect(FountainFormatter.normalizeLiveEditorLine("whispering ", as: .parenthetical) == "(whispering) ")
    #expect(FountainFormatter.normalizeLiveEditorLine("CUT TO: \t", as: .transition) == "CUT TO: \t")
    #expect(FountainFormatter.normalizeLiveEditorLine(" \t", as: .character) == " \t")
}

@Test func completedLineNormalizationRemainsAnExplicitSeparateContract() {
    #expect(FountainFormatter.normalizeEditorLine("JOHN DOE  \t", as: .character) == "JOHN DOE")
    #expect(FountainFormatter.normalizeEditorLine("EXT. PIER - NIGHT ", as: .sceneHeading) == "EXT. PIER - NIGHT")
}

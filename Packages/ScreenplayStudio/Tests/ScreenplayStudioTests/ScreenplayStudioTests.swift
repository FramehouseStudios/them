import Testing
import Foundation
@testable import ScreenplayStudio

@Test func duplicateLeadingSceneHeadingIsRemovedForMidSceneInsertion() async throws {
    let draft = """
    INT. KITCHEN - DAY

    MARA watches the rain bead against the glass.
    """

    let result = FountainFormatter.removingDuplicateLeadingSceneHeading(
        from: """
        INT. KITCHEN - DAY

        MARA
        We leave before he wakes up.
        """,
        existingDraft: draft,
        insertionUTF16Location: (draft as NSString).length
    )

    #expect(result == """
    MARA
    We leave before he wakes up.
    """)
}

@Test func duplicateLeadingSceneHeadingIsPreservedForWholeSceneReplacement() async throws {
    let draft = """
    INT. KITCHEN - DAY

    MARA watches the rain bead against the glass.
    """

    let replacement = """
    INT. KITCHEN - DAY

    MARA studies the window like it might answer her.
    """
    let result = FountainFormatter.removingDuplicateLeadingSceneHeading(
        from: replacement,
        existingDraft: draft,
        insertionUTF16Location: 0,
        replacementText: draft
    )

    #expect(result == replacement)
}

@Test func differentSceneHeadingIsPreservedForNewSceneInsertion() async throws {
    let draft = """
    INT. KITCHEN - DAY

    MARA watches the rain bead against the glass.
    """

    let nextScene = """
    INT. KITCHEN - NIGHT

    The room is empty now.
    """
    let result = FountainFormatter.removingDuplicateLeadingSceneHeading(
        from: nextScene,
        existingDraft: draft,
        insertionUTF16Location: (draft as NSString).length
    )

    #expect(result == nextScene)
}

@Test func duplicateLeadingSceneHeadingKeepsAttachedActionWhenRemoved() async throws {
    let draft = """
    INT. KITCHEN - DAY

    MARA watches the rain bead against the glass.
    """

    let result = FountainFormatter.removingDuplicateLeadingSceneHeading(
        from: """
        INT. KITCHEN - DAYA kettle screams.
        MARA
        Not now.
        """,
        existingDraft: draft,
        insertionUTF16Location: (draft as NSString).length
    )

    #expect(result == """
    A kettle screams.
    MARA
    Not now.
    """)
}

@Test func dualDialogueCaretStillReadsAsACharacterCue() async throws {
    #expect(ScreenplayEditorElement.looksLikeCharacterCue("MARCUS ^"))
    #expect(ScreenplayEditorElement.looksLikeCharacterCue("MARCUS^"))
    #expect(ScreenplayEditorElement.isDualDialogueCue("MARCUS ^"))
    #expect(!ScreenplayEditorElement.isDualDialogueCue("MARCUS"))
    #expect(ScreenplayEditorElement.characterCueName("MARCUS ^") == "MARCUS")
    #expect(ScreenplayEditorElement.characterCueName("MARCUS") == "MARCUS")
    // A caret anywhere else is not a cue.
    #expect(!ScreenplayEditorElement.looksLikeCharacterCue("^ MARCUS"))
    #expect(!ScreenplayEditorElement.looksLikeCharacterCue("MAR^CUS"))
}

@Test func dualDialogueBlockInfersCharacterThenDialogue() async throws {
    let draft = """
    JESS
    I'm not leaving.

    MARCUS ^
    (under his breath)
    Neither am I.
    """
    let sequence = ScreenplayEditorElement.inferredSequence(for: draft)
    #expect(sequence[0] == .character)
    #expect(sequence[1] == .dialogue)
    #expect(sequence[2] == nil)
    #expect(sequence[3] == .character)
    #expect(sequence[4] == .parenthetical)
    #expect(sequence[5] == .dialogue)
}

@Test func pastedCueAndLineStayACueAndDialogue() {
    // Typed on a phone 2026-09-28: the block arrived after the action line and
    // "MAE" became the action line "Mae." with the dialogue as action.
    let existing = "INT. DINER - NIGHT\n\nThe last customer counts coins onto the counter.\n\n"
    #expect(FountainFormatter.normalizePastedScreenplayBlock("MAE\nWe're closed, hon.\n", existingDraft: existing) == "MAE\nWe're closed, hon.")
    #expect(FountainFormatter.normalizePastedScreenplayBlock("NORA (V.O.)\nIs anyone out there?") == "NORA (V.O.)\nIs anyone out there?")
}

@Test func proseStartingWithAShortCapitalWordIsNotACue() {
    let out = FountainFormatter.normalizePastedScreenplayBlock("I\nwalk to the door and wait.")
    #expect(!out.hasPrefix("I\n"))
}

@Test func pastedActionKeepsTheWritersCase() {
    // Seen live 2026-09-28 pasting four pages: "Fog sits on the water." -> "FOG sits...".
    let block = "EXT. PIER - DAWN\n\nFog sits on the water. Gulls argue over a bait bucket. JOE stands at the rail.\n\nJOE\nYou followed me."
    let out = FountainFormatter.normalizePastedScreenplayBlock(block, fromWriter: true)
    #expect(out.contains("Fog sits on the water. Gulls argue over a bait bucket."))
}

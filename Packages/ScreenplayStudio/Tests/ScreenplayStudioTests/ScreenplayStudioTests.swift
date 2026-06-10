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

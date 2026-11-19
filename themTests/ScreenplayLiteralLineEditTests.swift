import XCTest
import ScreenplayStudio
@testable import them

final class ScreenplayLiteralLineEditTests: XCTestCase {
    func testLastLineReplacementKeepsEveryByteOutsideTheLine() throws {
        let draft = "INT. THEATER - NIGHT\r\n\r\nMAYA\r\n\tWe should go.  \r\n\r\n"
        let spoken = try XCTUnwrap(ScreenplayLiteralLineEdit.parse("Please replace the last line with The door stays open."))
        let edit = try XCTUnwrap(spoken.change(in: draft, selectedLine: nil))
        XCTAssertEqual(edit.line, 4)
        XCTAssertTrue(edit.revisedDraft.utf8.elementsEqual(
            "INT. THEATER - NIGHT\r\n\r\nMAYA\r\n\tThe door stays open.  \r\n\r\n".utf8
        ))
        XCTAssertFalse(edit.saveAfterEdit)
    }

    func testQuotedAndSelectedTargetsRequireOneLine() throws {
        let draft = "JOHN\nWait.\n\nMAYA\nWait.\n\nJOHN\nIs that your key?"
        let ambiguous = try XCTUnwrap(ScreenplayLiteralLineEdit.parse("Replace the line “Wait.” with Go outside."))
        XCTAssertNil(ambiguous.change(in: draft, selectedLine: nil))

        let selected = try XCTUnwrap(ScreenplayLiteralLineEdit.parse("Change the selected line to Stay here."))
        XCTAssertNil(selected.change(in: draft, selectedLine: nil))
        let selectedChange = try XCTUnwrap(selected.change(in: draft, selectedLine: 5))
        XCTAssertEqual(selectedChange.revisedDraft, "JOHN\nWait.\n\nMAYA\nStay here.\n\nJOHN\nIs that your key?")

        let quoted = try XCTUnwrap(ScreenplayLiteralLineEdit.parse(
            "Replace the line “Is that your key?” with “Keep it.” and save."
        ))
        let quotedChange = try XCTUnwrap(quoted.change(in: draft, selectedLine: nil))
        XCTAssertEqual(quotedChange.line, 8)
        XCTAssertTrue(quotedChange.saveAfterEdit)
        XCTAssertTrue(quotedChange.revisedDraft.hasSuffix("JOHN\nKeep it."))
    }

    func testCreativeOrMultilineInstructionsDoNotBecomeLiteralEdits() throws {
        XCTAssertNil(ScreenplayLiteralLineEdit.parse("Rewrite the last line with more tension."))
        let multipleLines = try XCTUnwrap(ScreenplayLiteralLineEdit.parse("Replace last line with Go.\nNo."))
        XCTAssertNil(multipleLines.change(in: "Stay.", selectedLine: nil))
        let missingWords = try XCTUnwrap(ScreenplayLiteralLineEdit.parse("Replace last line with"))
        XCTAssertNil(missingWords.change(in: "Stay.", selectedLine: nil))
    }

    func testPageAddressCountsOnlyThatCharactersDialogueOnStudioPage() throws {
        let (draft, paragraphs) = twoPageDialogueFixture()
        let edit = try XCTUnwrap(ScreenplayLiteralLineEdit.parse(
            "On page two, change the fourth line by John to say “Leave the door open.” and save."
        ))
        let expected = draft.replacingOccurrences(of: "John's fourth on page two.", with: "Leave the door open.")
        let owner = ScreenplayStudioAuthContext(userID: "writer", sessionIntentGeneration: 1)
        let prepared = try XCTUnwrap(edit.prepare(in: draft, selectedLine: 3, projectID: "project", authContext: owner))
        let change = try XCTUnwrap(prepared.resolve(in: draft, paragraphs: paragraphs, linesPerPage: 24))
        XCTAssertTrue(change.revisedDraft.utf8.elementsEqual(expected.utf8))
        XCTAssertEqual(change.line, paragraphs.first { $0.text == "John's fourth on page two." }?.line)
        XCTAssertTrue(change.saveAfterEdit)

        XCTAssertNil(prepared.resolve(in: draft + " ", paragraphs: paragraphs, linesPerPage: 24))
        XCTAssertNil(prepared.resolve(in: draft, paragraphs: paragraphs, linesPerPage: 25))
        XCTAssertNil(prepared.resolve(in: draft, paragraphs: Array(paragraphs.dropFirst()), linesPerPage: 24))
    }

    func testPossessiveAddressParsesSpokenNumbersAndAnExplicitSaveSentence() throws {
        let edit = try XCTUnwrap(ScreenplayLiteralLineEdit.parse(
            "Change John’s 4th line on page twenty-five to The door stays open. Then save."
        ))
        XCTAssertEqual(edit.target, .speakerLine(page: 25, ordinal: 4, name: "John"))
        XCTAssertEqual(edit.replacement, "The door stays open.")
        XCTAssertTrue(edit.saveAfterEdit)
        let other = try XCTUnwrap(ScreenplayLiteralLineEdit.parse(
            "Rewrite the second line by Jane Doe on page one hundred and twenty to say Leave."
        ))
        XCTAssertEqual(other.target, .speakerLine(page: 120, ordinal: 2, name: "Jane Doe"))
        XCTAssertFalse(other.saveAfterEdit)
        XCTAssertNil(ScreenplayLiteralLineEdit.parse("Rewrite John's 4th line on page 25 with more tension."))
    }

    @MainActor
    func testStudioUsesItsPageDensityAndCurrentEditorParagraphs() async throws {
        let suite = "them.addressed-line-edit.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"))
        model.autosaveEnabled = false
        model.selectedProjectID = "project"
        model.linesPerPage = 24
        let (draft, paragraphs) = twoPageDialogueFixture()
        model.applyStructuralUITestDraft(draft, versionID: "confirmed")
        let bridge = ScreenplayLiveDraftBridge.shared
        let previousDraft = bridge.draftText
        let previousElements = bridge.structuredDraft.paragraphs.map(\.element)
        defer { bridge.syncStructuredDraftSnapshot(text: previousDraft, elements: previousElements) }
        bridge.syncStructuredDraftSnapshot(text: draft, elements: paragraphs.map(\.element))
        let owner = ScreenplayStudioAuthContext(
            userID: BackendAuthClient.currentAuthSessionState().user?.userId ?? "",
            sessionIntentGeneration: BackendAuthClient.currentAuthSessionIntentGeneration()
        )
        let missing = try XCTUnwrap(ScreenplayLiteralLineEdit.parse("Change John's fifth line on page 2 to No."))
        await model.applyLiteralLineEdit(missing.prepare(in: draft, selectedLine: nil, projectID: "project", authContext: owner))
        XCTAssertTrue(model.fountainDraft.utf8.elementsEqual(draft.utf8))
        XCTAssertFalse(model.hasUnsavedDraftChanges)

        let edit = try XCTUnwrap(ScreenplayLiteralLineEdit.parse("Change John's fourth line on page 2 to Wait."))
        await model.applyLiteralLineEdit(edit.prepare(in: draft, selectedLine: nil, projectID: "project", authContext: owner))
        let expected = draft.replacingOccurrences(of: "John's fourth on page two.", with: "Wait.")
        XCTAssertTrue(model.fountainDraft.utf8.elementsEqual(expected.utf8))
        XCTAssertEqual(model.latestVersionID, "confirmed")
        XCTAssertTrue(model.hasUnsavedDraftChanges)
    }

    private func twoPageDialogueFixture() -> (String, [ScreenplayDraftParagraphSnapshot]) {
        // Leading and trailing blank rows are outside Studio Pages' range.
        var rows: [(String, ScreenplayEditorElement?)] = [("", nil), ("INT. THEATER - NIGHT", .sceneHeading)]
        rows += Array(repeating: ("A projector ticks.", .action), count: 20)
        rows += [
            ("JOHN (V.O.)", .character), ("A line before the break.", .dialogue),
            ("One more before the break.", .dialogue), ("The first on this page.", .dialogue),
            ("(quietly)", .parenthetical), ("The second.", .dialogue), ("", nil),
            ("JOHNNY", .character), ("Count me out.", .dialogue), ("", nil),
            ("@JOHN", .character), ("The third.", .dialogue),
            ("\tJohn's fourth on page two.  ", .dialogue), ("", nil),
        ]
        let draft = rows.map(\.0).joined(separator: "\r\n")
        let paragraphs = draft.components(separatedBy: .newlines).enumerated().map { index, text in
            ScreenplayDraftParagraphSnapshot(
                id: "line-\(index + 1)", line: index + 1, element: index.isMultiple(of: 2) ? rows[index / 2].1 : nil,
                text: text.trimmingCharacters(in: .whitespacesAndNewlines)
            )
        }
        return (draft, paragraphs)
    }

    @MainActor
    func testStudioAppliesOnlyToThePreparedProjectAndUnchangedDraft() async throws {
        let suite = "them.line-edit.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"))
        model.autosaveEnabled = false
        model.selectedProjectID = "project"
        let original = "INT. THEATER - NIGHT\n\nMAYA\nWait."
        let spoken = try XCTUnwrap(ScreenplayLiteralLineEdit.parse("Rewrite the last line to say I'm staying."))
        let change = try XCTUnwrap(spoken.change(in: original, selectedLine: nil))
        let owner = ScreenplayStudioAuthContext(
            userID: BackendAuthClient.currentAuthSessionState().user?.userId ?? "",
            sessionIntentGeneration: BackendAuthClient.currentAuthSessionIntentGeneration()
        )
        let prepared = ScreenplayLiteralLineEdit.Prepared(change: change, projectID: "project", authContext: owner)
        let newerDraft = original + "\n\nShe pockets the key."

        model.applyStructuralUITestDraft(newerDraft, versionID: "version")
        await model.applyLiteralLineEdit(prepared)
        XCTAssertEqual(model.fountainDraft, newerDraft)

        model.selectedProjectID = "other-project"
        model.applyStructuralUITestDraft(original, versionID: "other-version")
        await model.applyLiteralLineEdit(prepared)
        XCTAssertEqual(model.fountainDraft, original)

        model.selectedProjectID = "project"
        model.applyStructuralUITestDraft(original, versionID: "version")
        await model.applyLiteralLineEdit(prepared)
        XCTAssertEqual(model.fountainDraft, "INT. THEATER - NIGHT\n\nMAYA\nI'm staying.")
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual(model.latestVersionID, "version")

        let savedWords = model.fountainDraft
        model.applyStructuralUITestDraft(savedWords, versionID: "confirmed-save")
        let retry = try XCTUnwrap(ScreenplayLiteralLineEdit.parse("Replace last line with “I'm staying.” and save."))
        let retryChange = try XCTUnwrap(retry.change(in: savedWords, selectedLine: nil))
        XCTAssertFalse(retryChange.hasTextChange)
        await model.applyLiteralLineEdit(.init(change: retryChange, projectID: "project", authContext: owner))
        XCTAssertEqual(model.fountainDraft, savedWords)
        XCTAssertFalse(model.hasUnsavedDraftChanges)
        XCTAssertEqual(model.latestVersionID, "confirmed-save")
        XCTAssertTrue(model.errorText.isEmpty, "A retry of a saved edit must not request another save.")
    }
}

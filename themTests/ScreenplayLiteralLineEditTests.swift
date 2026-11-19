import XCTest
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

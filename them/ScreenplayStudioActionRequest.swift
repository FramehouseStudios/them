import Foundation

struct ScreenplayStudioActionRequest: Identifiable, Equatable {
    enum Action: String, Codable, Equatable {
        case replaceLiteralLine
        case saveDraft
        case saveRevisionSnapshot
        case undoLastPageWrite
        case moveCurrentSceneAfterScene
        case moveSelectionAfterScene
        case splitSelectionIntoNewScene
        case promoteSelectionToBeat
        case makeBeatFromSelection
        case updateSelectedBeatFromSelection
        case deleteCurrentBeat
        case duplicateCurrentScene
        case promoteParagraphToDialogue
        case demoteCurrentBeat
        case acceptFocusedRewrite
        case mergeCurrentSceneForward
    }

    let id: UUID
    let action: Action
    let intValue: Int?
    let secondaryIntValue: Int?
    let stringValue: String?
    let secondaryStringValue: String?
    let literalLineEdit: ScreenplayLiteralLineEdit.Prepared?

    init(
        id: UUID = UUID(),
        action: Action,
        intValue: Int? = nil,
        secondaryIntValue: Int? = nil,
        stringValue: String? = nil,
        secondaryStringValue: String? = nil,
        literalLineEdit: ScreenplayLiteralLineEdit.Prepared? = nil
    ) {
        self.id = id
        self.action = action
        self.intValue = intValue
        self.secondaryIntValue = secondaryIntValue
        self.stringValue = stringValue
        self.secondaryStringValue = secondaryStringValue
        self.literalLineEdit = literalLineEdit
    }
}

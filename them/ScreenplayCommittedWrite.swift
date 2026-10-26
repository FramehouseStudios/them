import Foundation

struct ScreenplayCommittedWrite: Identifiable, Equatable {
    let id: UUID
    let writeID: String
    let projectID: String
    let versionID: String
    let previousDraft: String
    let committedDraft: String
    let insertedText: String
    let replacementApplied: Bool
    let replacedWriteID: String?
    let startLine: Int
    let endLine: Int
    let committedAt: Date
    let authContext: ScreenplayStudioAuthContext

    init(
        id: UUID,
        writeID: String,
        projectID: String = "",
        versionID: String = "",
        previousDraft: String,
        committedDraft: String,
        insertedText: String,
        replacementApplied: Bool,
        replacedWriteID: String?,
        startLine: Int,
        endLine: Int,
        committedAt: Date,
        authContext: ScreenplayStudioAuthContext = .current()
    ) {
        self.id = id
        self.writeID = writeID
        self.projectID = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        self.versionID = versionID.trimmingCharacters(in: .whitespacesAndNewlines)
        self.previousDraft = previousDraft
        self.committedDraft = committedDraft
        self.insertedText = insertedText
        self.replacementApplied = replacementApplied
        self.replacedWriteID = replacedWriteID
        self.startLine = startLine
        self.endLine = endLine
        self.committedAt = committedAt
        self.authContext = authContext
    }

    var normalizedWriteID: String {
        writeID.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var normalizedProjectID: String {
        projectID.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var normalizedVersionID: String {
        versionID.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var isPlaceholderWrite: Bool {
        normalizedWriteID.hasPrefix("stub-")
    }

    var isAuthoritativeWrite: Bool {
        !normalizedWriteID.isEmpty && !isPlaceholderWrite
    }
}

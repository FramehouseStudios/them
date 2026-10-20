import Foundation
import ScreenplayStudio

/// Immutable local decision. The reply remains retained after application.
nonisolated struct RecoveredPageApplication: Codable, Equatable {
    let projectID: String
    let baseVersionID: String
    let originalDraftIdentity: ScreenplayDraftContentIdentity
    let proposedDraftIdentity: ScreenplayDraftContentIdentity
    var savedVersionID: String? = nil
}

/// A writer-confirmed new project, retained before the first creation request.
nonisolated struct RecoveredPageCreation: Codable, Equatable {
    let projectID: String
    let title: String
    let draft: String

    var application: RecoveredPageApplication {
        .init(projectID: projectID, baseVersionID: "",
            originalDraftIdentity: .init(draft: ""), proposedDraftIdentity: .init(draft: draft))
    }

    static func make(reply: RecoveredTalkReply, title: String) throws -> Self {
        let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, !title.contains(where: \.isNewline), title.count <= 200,
              reply.originalWriteContext?.projectID == "", reply.originalWriteContext?.target == "page",
              let output = reply.screenplay, output.writesToPage else {
            throw RecoveredPagePlan.failure("Enter a single-line project title first. Only complete recovered new-project pages can create a screenplay.")
        }
        return .init(projectID: UUID().uuidString.lowercased(), title: title,
            draft: FountainTitlePageCodec.renamingTitle(in: output.text, to: title))
    }
}

nonisolated struct RecoveredPagePlan: Equatable {
    let application: RecoveredPageApplication
    let draft: String

    static func make(reply: RecoveredTalkReply, draft: String, projectID: String,
        versionID: String) throws -> Self {
        if reply.originalWriteContext?.projectID.isEmpty == true {
            throw failure("This request began before a project was created. Automatic new-project recovery is not connected yet. Your complete page remains available to share; no existing script was changed.")
        }
        guard let context = reply.originalWriteContext, let identity = context.draftIdentity,
              context.target == "page", !projectID.isEmpty, context.projectID == projectID,
              reply.projectID.isEmpty || reply.projectID == context.projectID,
              context.documentRevisionID == versionID, identity.matches(draft),
              let output = reply.screenplay, output.writesToPage else {
            throw failure("The original project, revision or exact draft is no longer open. Your current words were kept; the recovered page can still be shared.")
        }
        let range: NSRange
        let replacement: String
        switch context.insertionMode {
        case "insert_after_anchor":
            guard let end = context.anchorEndLine ?? context.anchorLine,
                  let anchor = lineRange(draft, start: end, end: end) else {
                throw failure("The original insertion line is unavailable. No page was changed.")
            }
            range = NSRange(location: anchor.location + anchor.length, length: 0)
            replacement = ""
        case "replace_selection":
            guard let captured = context.replacementRange, let resolved = captured.range(in: draft) else {
                throw failure("This older rewrite has no exact original selection. Share the recovered text or select the line and request a new rewrite.")
            }
            range = resolved
            replacement = (draft as NSString).substring(with: range)
        default:
            throw failure("This request has no supported original page placement. No page was changed.")
        }
        let core = ScreenplayEditorInsertionText.preparedCore(output.text, existing: draft,
            insertionRange: range, replacementText: replacement)
        guard !core.isEmpty else { throw failure("The recovered result has no screenplay text to apply.") }
        let insert = replacement.isEmpty
            ? ScreenplayEditorInsertionText.text(core, existing: draft, selection: range) : core
        let proposed = (draft as NSString).replacingCharacters(in: range, with: insert)
        guard !ScreenplayDraftTextIdentity.matches(proposed, draft) else { throw failure("This result makes no change to the page.") }
        return Self(application: .init(projectID: projectID, baseVersionID: versionID,
            originalDraftIdentity: identity, proposedDraftIdentity: .init(draft: proposed)), draft: proposed)
    }

    // Strict LF/CRLF logical lines, preserving original UTF-16 offsets. Never clamp.
    static func lineRange(_ draft: String, start: Int, end: Int) -> NSRange? {
        let lines = draft.components(separatedBy: "\n")
        guard start > 0, end >= start, end <= lines.count else { return nil }
        let location = lines.prefix(start - 1).reduce(0) { $0 + $1.utf16.count + 1 }
        let length = lines[(start - 1)...(end - 1)].joined(separator: "\n").utf16.count
        return NSRange(location: location, length: length)
    }

    static func failure(_ message: String) -> BackendError { .stage("recovered_page", message) }
}

nonisolated struct RecoveredPageReplacementRange: Codable, Hashable {
    let location: Int
    let length: Int
    let textIdentity: ScreenplayDraftContentIdentity

    func range(in draft: String) -> NSRange? {
        let ns = draft as NSString
        guard location >= 0, length > 0, location <= ns.length, length <= ns.length - location else { return nil }
        let range = NSRange(location: location, length: length)
        guard textIdentity.matches(ns.substring(with: range)) else { return nil }
        return range
    }
}

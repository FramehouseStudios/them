import Foundation

struct ScreenplayPendingReplacementTarget: Identifiable, Equatable {
    let id: UUID
    let sourceWriteID: String
    let startLine: Int
    let endLine: Int
    let currentText: String
    let capturedDraft: String
    let projectID: String
    let authContext: ScreenplayStudioAuthContext

    func exactRange(in draft: String, lineRange: NSRange) -> NSRange? {
        let text = draft as NSString
        guard capturedDraft.utf8.elementsEqual(draft.utf8), !currentText.isEmpty,
              lineRange.location >= 0, lineRange.location <= text.length,
              lineRange.length > 0, lineRange.length <= text.length - lineRange.location else {
            return nil
        }
        let match = text.range(of: currentText, options: .literal, range: lineRange)
        guard match.location != NSNotFound else { return nil }
        let nextLocation = NSMaxRange(text.rangeOfComposedCharacterSequence(at: match.location))
        guard nextLocation < NSMaxRange(lineRange) else { return match }
        let rest = NSRange(location: nextLocation, length: NSMaxRange(lineRange) - nextLocation)
        return text.range(of: currentText, options: .literal, range: rest).location == NSNotFound ? match : nil
    }
}

extension ScreenplayInsertionRequest {
    var waitsForFinalRewrite: Bool {
        guard replacementTarget != nil else { return false }
        switch mode {
        case .streamPreview, .streamInsertProgress, .voiceRevealPrepare, .voiceRevealUpdate:
            return true
        default:
            return false
        }
    }

    var appliesFinalRewrite: Bool {
        guard replacementTarget != nil else { return false }
        switch mode {
        case .insert, .streamCommit, .streamInsertFinalize, .voiceRevealFinalize:
            return true
        default:
            return false
        }
    }
}

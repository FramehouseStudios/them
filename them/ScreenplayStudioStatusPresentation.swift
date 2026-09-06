import SwiftUI


enum ScreenplayStudioSaveStatus: Equatable {
    case notSaved
    case liveOnly
    case saving
    case unsaved
    case saved

    var text: String {
        switch self {
        case .notSaved: return "Not saved"
        case .liveOnly: return "Live only"
        case .saving: return "Saving…"
        case .unsaved: return "Unsaved"
        case .saved: return "Saved"
        }
    }
}
enum ScreenplayStudioSaveStatusTone: Equatable {
    case muted
    case accent
    case warning
    case success
}

struct ScreenplayStudioHeaderPresentation: Equatable {
    static let compactInteractiveControlSize: CGFloat = 44
    static let compactVisualControlSize: CGFloat = 28

    static func controlSize(compact: Bool) -> CGFloat {
        compact ? compactInteractiveControlSize : compactVisualControlSize
    }

    let saveStatus: ScreenplayStudioSaveStatus

    init(
        isSaving: Bool,
        hasSelectedProject: Bool,
        hasDraft: Bool,
        hasUnsavedDraftChanges: Bool,
        hasPersistedDocument: Bool
    ) {
        if !hasSelectedProject {
            saveStatus = hasDraft ? .liveOnly : .notSaved
        } else if isSaving {
            saveStatus = .saving
        } else if hasUnsavedDraftChanges {
            saveStatus = .unsaved
        } else if hasPersistedDocument {
            saveStatus = .saved
        } else {
            saveStatus = .notSaved
        }
    }

    var saveStatusTone: ScreenplayStudioSaveStatusTone {
        switch saveStatus {
        case .notSaved, .liveOnly:
            return .muted
        case .saving:
            return .accent
        case .unsaved:
            return .warning
        case .saved:
            return .success
        }
    }
}

enum ScreenplayStudioRecoveryRetry: Equatable {
    case saveDraft
    case draftSync
    case outlineSync
    case reloadStudio

    var accessibilityHint: String {
        switch self {
        case .saveDraft:
            return "Tries to save the current draft again."
        case .draftSync:
            return "Reconnects and retries the draft already waiting on this device."
        case .outlineSync:
            return "Reconnects and retries the outline change already waiting on this device."
        case .reloadStudio:
            return "Reloads the current Studio project and project list."
        }
    }
}

struct ScreenplayStudioTransientStatusPresentation: Equatable {
    static let maximumErrorCharacters = 420
    static let maximumInfoCharacters = 240

    let errorMessage: String?
    let infoMessage: String?
    let draftProtectionMessage: String?
    let retry: ScreenplayStudioRecoveryRetry?

    init(
        errorText: String,
        infoText: String,
        autosaveStatusText: String,
        hasSelectedProject: Bool,
        hasDraft: Bool,
        hasUnsavedDraftChanges: Bool,
        isManualDraftEditing: Bool,
        hasPersistedDocument: Bool,
        queuedDraftSaveCount: Int,
        queuedOutlineMutationCount: Int
    ) {
        let error = Self.bounded(errorText, maximumCharacters: Self.maximumErrorCharacters)
        let info = Self.bounded(infoText, maximumCharacters: Self.maximumInfoCharacters)
        errorMessage = error.isEmpty ? nil : error

        let lowerInfo = info.lowercased()
        let lowerAutosaveStatus = autosaveStatusText
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let hasExplicitLocalSafetySignal =
            lowerInfo.contains("preserved on this device") ||
            lowerInfo.contains("preserved locally") ||
            lowerInfo.contains("waiting safely") ||
            lowerAutosaveStatus.contains("saved locally") ||
            queuedDraftSaveCount > 0

        if hasDraft && hasExplicitLocalSafetySignal {
            draftProtectionMessage = "Your local draft is safe on this device."
        } else if hasDraft && hasSelectedProject && hasPersistedDocument && !hasUnsavedDraftChanges {
            draftProtectionMessage = "The last saved version remains available, and this draft remains open."
        } else if hasDraft {
            draftProtectionMessage = hasSelectedProject
                ? "Your draft remains open in Studio. Save it before leaving."
                : "Your draft remains open in Studio. Open Projects to save it before leaving."
        } else {
            draftProtectionMessage = nil
        }

        let infoOnlyRepeatsSafety =
            lowerInfo.contains("preserved on this device") ||
            lowerInfo == "your draft is preserved locally." ||
            lowerInfo == "your draft is safe on this device."
        let infoSupportsRecovery = [
            "connection",
            "preserved",
            "queued",
            "reconnect",
            "retry",
            "safe",
            "sync",
            "without overwriting",
            "remains open",
            "needs attention",
        ].contains { lowerInfo.contains($0) }
        if error.isEmpty {
            infoMessage = info.isEmpty ? nil : info
        } else {
            infoMessage = info.isEmpty || infoOnlyRepeatsSafety || !infoSupportsRecovery
                ? nil
                : info
        }

        guard !error.isEmpty else {
            retry = nil
            return
        }
        if queuedDraftSaveCount > 0 {
            retry = .draftSync
        } else if queuedOutlineMutationCount > 0 {
            retry = .outlineSync
        } else if hasSelectedProject,
                  hasDraft,
                  hasUnsavedDraftChanges,
                  Self.looksLikeDraftSaveFailure(error) {
            retry = .saveDraft
        } else if hasUnsavedDraftChanges || isManualDraftEditing {
            retry = nil
        } else if Self.isValidationOnlyError(error) {
            retry = nil
        } else {
            retry = .reloadStudio
        }
    }

    private static func looksLikeDraftSaveFailure(_ error: String) -> Bool {
        let lower = error.lowercased()
        return lower.contains("draft") &&
            (lower.contains("save") || lower.contains("sync") || lower.contains("queue"))
    }

    private static func isValidationOnlyError(_ error: String) -> Bool {
        let lower = error.lowercased()
        return [
            "select a project",
            "select a scene",
            "enter a ",
            "add at least",
            "draft is empty",
            "snapshot draft is empty",
            "that file did not contain",
            "could not normalize",
            "needs a label",
            "no longer available",
            "use an approved",
            "ask them",
            "ask io.them",
            "resolve the parked",
            "review it, then",
        ].contains { lower.contains($0) }
    }

    private static func bounded(_ raw: String, maximumCharacters: Int) -> String {
        let clean = raw
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
        guard clean.count > maximumCharacters else { return clean }
        let prefix = String(clean.prefix(maximumCharacters - 1))
        if let lastWhitespace = prefix.lastIndex(where: \.isWhitespace),
           prefix.distance(from: lastWhitespace, to: prefix.endIndex) < 48 {
            return String(prefix[..<lastWhitespace]) + "…"
        }
        return prefix + "…"
    }
}

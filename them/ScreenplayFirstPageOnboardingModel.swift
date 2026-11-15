import Combine
import Foundation

@MainActor
final class ScreenplayFirstPageOnboardingModel: ObservableObject {
    enum Kind: Equatable, Sendable {
        case page
        case voice
    }

    struct Request: Equatable, Sendable {
        let id: String
        let kind: Kind
        let name: String
        let sceneSeed: String
        let startedAt: Date

        var pagePrompt: String {
            let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
            let cleanSeed = sceneSeed.trimmingCharacters(in: .whitespacesAndNewlines)
            let displayName = cleanName.isEmpty ? "the writer" : cleanName
            let impulse = cleanSeed.isEmpty
                ? "someone walks into a room carrying a secret they cannot say out loud yet"
                : cleanSeed
            return """
            Write the first page of a screenplay scene for \(displayName).

            Scene impulse: \(impulse)

            Write only the page content in clean Fountain/Hollywood screenplay format: one slugline, visual action, character cues, and dialogue. Keep it to roughly one page. Do not explain the formatting.
            """
        }
    }

    @Published var name: String
    @Published var sceneSeed: String
    @Published private(set) var isSubmitting = false
    @Published private(set) var isWaitingForWorkspace = false
    @Published private(set) var error = ""
    @Published private(set) var hasExplicitVoicePageIntent = false

    private var pendingRequest: Request?
    private var activeRequest: Request?
    private var voiceIntentStartedAt: Date?

    init(name: String = "", sceneSeed: String = "") {
        self.name = name
        self.sceneSeed = sceneSeed
    }

    @discardableResult
    func queue(kind: Kind) -> Request? {
        guard !isSubmitting else { return nil }
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            error = "Enter your name first."
            return nil
        }
        let request = Request(
            id: "magic-moment-\(UUID().uuidString.lowercased())",
            kind: kind,
            name: name,
            sceneSeed: sceneSeed,
            startedAt: Date()
        )
        pendingRequest = request
        error = ""
        isSubmitting = true
        isWaitingForWorkspace = true
        return request
    }

    /// The caller owns authentication and navigation; this model never starts work.
    func beginPendingRequest(workspaceReady: Bool) -> Request? {
        guard workspaceReady, activeRequest == nil, let request = pendingRequest else { return nil }
        pendingRequest = nil
        activeRequest = request
        isWaitingForWorkspace = false
        return request
    }

    @discardableResult
    func finishPage(requestID: String, error: String?) -> Bool {
        guard let request = activeRequest, request.id == requestID, request.kind == .page else {
            return false
        }
        activeRequest = nil
        isSubmitting = false
        let message = error?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.error = message
        guard message.isEmpty else { return false }
        // A successful older snapshot must not erase text edited while it was waiting.
        if sceneSeed.utf8.elementsEqual(request.sceneSeed.utf8) {
            sceneSeed = ""
        }
        return true
    }

    @discardableResult
    func finishVoiceLaunch(requestID: String) -> Bool {
        guard let request = activeRequest, request.id == requestID, request.kind == .voice else {
            return false
        }
        activeRequest = nil
        isSubmitting = false
        voiceIntentStartedAt = Date()
        hasExplicitVoicePageIntent = true
        return true
    }

    func acknowledgeCommittedPage(isAuthoritative: Bool, insertedText: String, committedAt: Date) {
        guard hasExplicitVoicePageIntent,
              isAuthoritative,
              !insertedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let voiceIntentStartedAt,
              committedAt >= voiceIntentStartedAt else { return }
        cancelVoicePageIntent()
    }

    /// Cancels only auth-deferred work. Launched work remains owned by its caller.
    func cancelPendingRequest() {
        guard pendingRequest != nil else { return }
        pendingRequest = nil
        isSubmitting = false
        isWaitingForWorkspace = false
    }

    func cancelVoicePageIntent() {
        voiceIntentStartedAt = nil
        hasExplicitVoicePageIntent = false
    }
}

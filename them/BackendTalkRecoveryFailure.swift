import Foundation
import SwiftUI

/// `error_recovered` means the server returned fallback audio after failure.
/// It does not acknowledge a generated reply, screenplay insert, or save.
nonisolated struct BackendTalkRecoveryFailure: Equatable {
    let message: String

    init?(turnStatus: String, stage: String?) {
        guard turnStatus.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "error_recovered" else { return nil }
        message = Self.retryMessage(forStage: stage)
    }

    static func retryMessage(for error: Error) -> String {
        if let backendError = error as? BackendError, case let .stage(stage, _) = backendError {
            return retryMessage(forStage: stage)
        }
        return retryMessage(forStage: nil)
    }

    private static func retryMessage(forStage stage: String?) -> String {
        switch (stage ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "stt":
            return "Clementine couldn't transcribe that recording. Tap Talk to retry, or type your story."
        case "chat":
            return "Clementine couldn't finish her reply. Tap Talk to retry, or type your story."
        case "tts":
            return "Clementine couldn't generate her voice. Review the page, then tap Talk to retry."
        case "upload":
            return "Clementine couldn't use that recording. Tap Talk to retry, or type your story."
        default:
            return "Clementine couldn't complete that request. Review the page, then tap Talk to retry."
        }
    }
}

extension BackendTalkResult {
    var recoveredFailure: BackendTalkRecoveryFailure? {
        BackendTalkRecoveryFailure(turnStatus: turnStatus, stage: turnErrorStage)
    }
}

struct TurnNoticeBanner: View {
    let message: String?

    var body: some View {
        if let message, !message.isEmpty {
            Text(message)
                .font(.footnote)
                .foregroundStyle(.primary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
                .accessibilityIdentifier("voice.turn.notice")
                .transition(.opacity)
        }
    }
}

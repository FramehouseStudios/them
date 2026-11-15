import Foundation

/// `error_recovered` means the server returned fallback audio after failure.
/// It does not acknowledge a generated reply, screenplay insert, or save.
nonisolated struct BackendTalkRecoveryFailure: Equatable {
    let message: String

    init?(turnStatus: String, stage: String?) {
        guard turnStatus.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "error_recovered" else { return nil }
        switch (stage ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "stt":
            message = "Clementine couldn't transcribe that recording. Tap Talk to retry, or type your story."
        case "chat":
            message = "Clementine couldn't finish her reply. Tap Talk to retry, or type your story."
        case "tts":
            message = "Clementine couldn't generate her voice. Review the page, then tap Talk to retry."
        case "upload":
            message = "Clementine couldn't use that recording. Tap Talk to retry, or type your story."
        default:
            message = "Clementine couldn't complete that request. Review the page, then tap Talk to retry."
        }
    }
}

extension BackendTalkResult {
    var recoveredFailure: BackendTalkRecoveryFailure? {
        BackendTalkRecoveryFailure(turnStatus: turnStatus, stage: turnErrorStage)
    }
}

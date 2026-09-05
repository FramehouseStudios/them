import Foundation

struct FirstPageOnboardingAttempt: Equatable {
    let writerName: String
    let sceneSeed: String

    static func make(
        writerName: String,
        sceneSeed: String,
        fallbackSceneSeed: String
    ) -> FirstPageOnboardingAttempt? {
        let cleanName = writerName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty else { return nil }

        let cleanSceneSeed = sceneSeed.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanFallback = fallbackSceneSeed.trimmingCharacters(in: .whitespacesAndNewlines)
        return FirstPageOnboardingAttempt(
            writerName: cleanName,
            sceneSeed: cleanSceneSeed.isEmpty ? cleanFallback : cleanSceneSeed
        )
    }
}

enum FirstPageOnboardingOutcome: Equatable {
    case success
    case failure(String)

    static func resolve(errorMessage: String?) -> FirstPageOnboardingOutcome {
        let cleanError = (errorMessage ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return cleanError.isEmpty ? .success : .failure(cleanError)
    }

    var shouldCompleteOnboarding: Bool {
        self == .success
    }
}

struct FirstPageOnboardingPresentation: Equatable {
    enum State: Equatable {
        case ready
        case writing
        case failed(String)
    }

    let state: State

    init(isSubmitting: Bool, errorMessage: String) {
        let cleanError = errorMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        if isSubmitting {
            state = .writing
        } else if cleanError.isEmpty {
            state = .ready
        } else {
            state = .failed(cleanError)
        }
    }

    var primaryActionTitle: String {
        switch state {
        case .ready:
            return "Start Page"
        case .writing:
            return "Writing..."
        case .failed:
            return "Retry Page"
        }
    }

    var inputsAreDisabled: Bool {
        state == .writing
    }

    var showsProgress: Bool {
        state == .writing
    }

    var statusMessage: String? {
        switch state {
        case .ready:
            return nil
        case .writing:
            return "Clementine is writing your first page..."
        case .failed(let message):
            return "\(message) Your name and scene idea are still here. Try again when you're ready."
        }
    }

    var isFailure: Bool {
        if case .failed = state {
            return true
        }
        return false
    }
}

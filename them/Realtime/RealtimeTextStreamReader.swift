import Foundation
import Combine
import os

@MainActor
final class RealtimeTextStreamReader: ObservableObject {
    @Published private(set) var accumulatedText: String = ""
    @Published private(set) var isComplete: Bool = false

    var onDelta: ((String) -> Void)?
    var onComplete: ((String) -> Void)?

    private var task: Task<Void, Never>?

    func start(
        transcript: String,
        systemPrompt: String,
        backend: BackendClient
    ) {
        cancel()
        accumulatedText = ""
        isComplete = false

        task = Task { [weak self] in
            do {
                try await backend.streamStudioText(
                    transcript: transcript,
                    systemPrompt: systemPrompt,
                    onDelta: { [weak self] delta in
                        Task { @MainActor [weak self] in
                            guard let self else { return }
                            self.accumulatedText += delta
                            self.onDelta?(delta)
                        }
                    },
                    onComplete: { [weak self] fullText in
                        Task { @MainActor [weak self] in
                            guard let self else { return }
                            self.accumulatedText = fullText
                            self.isComplete = true
                            self.onComplete?(fullText)
                        }
                    }
                )
            } catch {
                HerLog.realtime.error("Stream reader error: \(error.localizedDescription)")
                Task { @MainActor [weak self] in
                    self?.isComplete = true
                    let text = self?.accumulatedText ?? ""
                    if !text.isEmpty {
                        self?.onComplete?(text)
                    }
                }
            }
        }
    }

    func cancel() {
        task?.cancel()
        task = nil
    }
}

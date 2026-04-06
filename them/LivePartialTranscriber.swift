import Foundation
import AVFoundation
import Speech

final class LivePartialTranscriber {
    private let queue = DispatchQueue(label: "io.them.them.partial-transcriber")
    private let cadenceSeconds: TimeInterval = 0.14
    private let minCharsToEmit = 3

    private var authStatus: SFSpeechRecognizerAuthorizationStatus = .notDetermined
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var lastEmitAt: Date = .distantPast
    private var lastEmittedText = ""

    var onPartial: ((String) -> Void)?

    func requestAuthorizationIfNeeded() {
        queue.async { [weak self] in
            guard let self else { return }
            guard self.authStatus == .notDetermined else { return }
            SFSpeechRecognizer.requestAuthorization { [weak self] status in
                self?.queue.async {
                    self?.authStatus = status
                }
            }
        }
    }

    func start(localeIdentifier: String? = nil) {
        queue.async { [weak self] in
            guard let self else { return }
            guard self.authStatus == .authorized else { return }
            guard self.task == nil else { return }

            self.lastEmitAt = .distantPast
            self.lastEmittedText = ""

            let locale = localeIdentifier.flatMap(Locale.init(identifier:))
                ?? Locale(identifier: Locale.preferredLanguages.first ?? "en-US")
            let recognizer = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer()
            guard let recognizer, recognizer.isAvailable else { return }

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            // Use on-device recognition (iOS 16+, macOS 13+):
            // - Eliminates a second network round-trip during recording
            // - Results arrive faster (~40-80ms vs server round-trip)
            // - Works offline and keeps audio private
            // Falls back to server-side automatically if the on-device model
            // isn't available (e.g. first boot, low storage, older OS).
            if #available(iOS 16.0, macOS 13.0, *) {
                request.requiresOnDeviceRecognition = true
            }

            self.recognizer = recognizer
            self.request = request
            self.task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                guard let self else { return }
                self.queue.async {
                    if let text = result?.bestTranscription.formattedString {
                        self.emitIfNeeded(text)
                    }
                    if result?.isFinal == true || error != nil {
                        self.request?.endAudio()
                        self.task?.cancel()
                        self.request = nil
                        self.task = nil
                    }
                }
            }
        }
    }

    func append(_ buffer: AVAudioPCMBuffer) {
        queue.async { [weak self] in
            guard let self else { return }
            self.request?.append(buffer)
        }
    }

    func stop(resetText: Bool) {
        queue.async { [weak self] in
            guard let self else { return }
            self.request?.endAudio()
            self.task?.cancel()
            self.request = nil
            self.task = nil
            if resetText {
                self.lastEmitAt = .distantPast
                self.lastEmittedText = ""
                DispatchQueue.main.async { [weak self] in
                    self?.onPartial?("")
                }
            }
        }
    }

    private func emitIfNeeded(_ rawText: String) {
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.count >= minCharsToEmit else { return }
        guard text != lastEmittedText else { return }
        let now = Date()
        if now.timeIntervalSince(lastEmitAt) < cadenceSeconds {
            return
        }
        lastEmitAt = now
        lastEmittedText = text
        DispatchQueue.main.async { [weak self] in
            self?.onPartial?(text)
        }
    }
}

import Foundation
import AVFoundation
import Speech

final class LivePartialTranscriber {
    private final class RecognitionSession {
        let id = UUID()
        let fallbackText: String
        var bestText = ""
        var deliveredFinal = false

        init(fallbackText: String = "") {
            self.fallbackText = fallbackText
        }
    }

    private let queue = DispatchQueue(label: "io.them.them.partial-transcriber")
    private let cadenceSeconds: TimeInterval = 0.14
    private let minCharsToEmit = 3

    private var authStatus: SFSpeechRecognizerAuthorizationStatus = .notDetermined
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var lastEmitAt: Date = .distantPast
    private var lastEmittedText = ""
    private var currentSession: RecognitionSession?

    var onPartial: ((String) -> Void)?
    var onFinal: ((String) -> Void)?

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

            self.startRecognition(localeIdentifier: localeIdentifier)
        }
    }

    func finishCurrentUtteranceAndRestart(fallbackText: String) {
        queue.async { [weak self] in
            guard let self else { return }
            guard let session = self.currentSession else {
                self.deliverFinalIfNeeded(session: RecognitionSession(fallbackText: fallbackText))
                self.startRecognition(localeIdentifier: nil)
                return
            }
            if session.bestText.isEmpty {
                session.bestText = fallbackText.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            self.request?.endAudio()
            self.task?.finish()
            self.request = nil
            self.task = nil
            self.currentSession = nil
            self.lastEmitAt = .distantPast
            self.lastEmittedText = ""
            DispatchQueue.main.async { [weak self] in self?.onPartial?("") }

            self.startRecognition(localeIdentifier: nil)
            self.queue.asyncAfter(deadline: .now() + 1.5) { [weak self, weak session] in
                guard let self, let session else { return }
                self.deliverFinalIfNeeded(session: session)
            }
        }
    }

    private func startRecognition(localeIdentifier: String?) {
        guard authStatus == .authorized else { return }
        guard task == nil else { return }

        lastEmitAt = .distantPast
        lastEmittedText = ""

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

        let session = RecognitionSession()
        currentSession = session
        self.recognizer = recognizer
        self.request = request
        self.task = recognizer.recognitionTask(with: request) { [weak self, weak session] result, error in
            guard let self, let session else { return }
            self.queue.async {
                if let text = result?.bestTranscription.formattedString {
                    session.bestText = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    if self.currentSession?.id == session.id {
                        self.emitIfNeeded(text)
                    }
                }
                if result?.isFinal == true || error != nil {
                    self.deliverFinalIfNeeded(session: session)
                    if self.currentSession?.id == session.id {
                        self.request?.endAudio()
                        self.task?.cancel()
                        self.request = nil
                        self.task = nil
                        self.currentSession = nil
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
            self.currentSession = nil
            if resetText {
                self.lastEmitAt = .distantPast
                self.lastEmittedText = ""
                DispatchQueue.main.async { [weak self] in
                    self?.onPartial?("")
                }
            }
        }
    }

    private func deliverFinalIfNeeded(session: RecognitionSession) {
        guard !session.deliveredFinal else { return }
        session.deliveredFinal = true
        let text = (session.bestText.isEmpty ? session.fallbackText : session.bestText)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        DispatchQueue.main.async { [weak self] in
            self?.onFinal?(text)
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

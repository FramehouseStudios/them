import Foundation
import AVFoundation
import Speech
import Combine
import os

@MainActor
final class VoiceCapture: ObservableObject {
    @Published private(set) var isRecording: Bool = false
    @Published private(set) var partialTranscript: String = ""
    @Published private(set) var isAuthorized: Bool = false

    var onUtteranceReady: ((String) -> Void)?
    var onPartialTranscript: ((String) -> Void)?

    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var speechRecognizer: SFSpeechRecognizer?

    // Silence detection
    private var lastSpeechTime: Date = .distantPast
    private var silenceTimer: Timer?
    private let silenceThresholdSeconds: TimeInterval = 1.8
    private let minTranscriptLength: Int = 3

    // Cadence throttle
    private var lastEmitTime: Date = .distantPast
    private let emitCadence: TimeInterval = 0.14

    func requestAuthorization() {
        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            Task { @MainActor [weak self] in
                self?.isAuthorized = (status == .authorized)
                if status != .authorized {
                    HerLog.mic.warning("Speech recognition not authorized: \(String(describing: status))")
                }
            }
        }

        #if os(iOS)
        AVAudioApplication.requestRecordPermission { [weak self] granted in
            Task { @MainActor [weak self] in
                if !granted {
                    self?.isAuthorized = false
                    HerLog.mic.warning("Microphone permission denied")
                }
            }
        }
        #endif
    }

    func startRecording() {
        guard isAuthorized else {
            HerLog.mic.error("Not authorized for speech recognition")
            return
        }

        stopRecording()

        let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
        guard let recognizer, recognizer.isAvailable else {
            HerLog.mic.error("Speech recognizer not available")
            return
        }

        if recognizer.supportsOnDeviceRecognition {
            HerLog.mic.info("Using on-device recognition")
        }

        speechRecognizer = recognizer

        let engine = AVAudioEngine()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true

        if recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }

        do {
            #if os(iOS)
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .voiceChat,
                                    options: [.defaultToSpeaker, .allowBluetoothHFP])
            try session.setActive(true)
            #endif

            let inputNode = engine.inputNode
            let format = inputNode.outputFormat(forBus: 0)

            inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                self?.recognitionRequest?.append(buffer)
            }

            engine.prepare()
            try engine.start()

            recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
                Task { @MainActor [weak self] in
                    guard let self else { return }

                    if let result {
                        let text = result.bestTranscription.formattedString
                        let now = Date()

                        if text.count >= self.minTranscriptLength &&
                            now.timeIntervalSince(self.lastEmitTime) >= self.emitCadence {
                            self.partialTranscript = text
                            self.onPartialTranscript?(text)
                            self.lastEmitTime = now
                        }

                        self.lastSpeechTime = now
                        self.resetSilenceTimer()

                        if result.isFinal {
                            self.handleFinalTranscript(text)
                        }
                    }

                    if let error {
                        HerLog.mic.error("Recognition error: \(error.localizedDescription)")
                        if self.isRecording {
                            self.handleFinalTranscript(self.partialTranscript)
                        }
                    }
                }
            }

            audioEngine = engine
            recognitionRequest = request
            isRecording = true
            lastSpeechTime = Date()
            resetSilenceTimer()

            HerLog.mic.info("Voice capture started")
        } catch {
            HerLog.mic.error("Failed to start recording: \(error.localizedDescription)")
            cleanup()
        }
    }

    func stopRecording() {
        guard isRecording else { return }
        let transcript = partialTranscript
        cleanup()
        if !transcript.isEmpty {
            handleFinalTranscript(transcript)
        }
    }

    private func handleFinalTranscript(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= minTranscriptLength else { return }

        HerLog.mic.info("Final transcript: \(trimmed)")
        partialTranscript = ""
        onUtteranceReady?(trimmed)
    }

    private func resetSilenceTimer() {
        silenceTimer?.invalidate()
        silenceTimer = Timer.scheduledTimer(withTimeInterval: silenceThresholdSeconds, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, self.isRecording else { return }
                let transcript = self.partialTranscript
                if !transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    self.handleFinalTranscript(transcript)
                    // Restart for next utterance
                    self.restartRecognition()
                }
            }
        }
    }

    private func restartRecognition() {
        cleanup()
        startRecording()
    }

    private func cleanup() {
        silenceTimer?.invalidate()
        silenceTimer = nil
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine = nil
        speechRecognizer = nil
        isRecording = false
    }
}

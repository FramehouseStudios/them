import Foundation
import Combine
import AVFoundation
import os

@MainActor
final class VoiceToPageOrchestrator: ObservableObject {
    enum Mode { case turnBased, realtime }

    @Published var fountainDraft: String = ""
    @Published private(set) var isListening: Bool = false
    @Published private(set) var isProcessing: Bool = false
    @Published private(set) var isSpeaking: Bool = false
    @Published private(set) var partialTranscript: String = ""
    @Published private(set) var currentMode: Mode = .turnBased
    @Published var useStreamCursor: Bool = false

    let syncCursor = PlaybackSyncCursor()
    let streamCursor = StreamingSyncCursor()
    let orbAudio = OrbAudioDriver()
    let voiceCapture = VoiceCapture()
    let backend = BackendClient()

    // Realtime components
    var realtimeSession: WebRTCRealtimeSession?
    var realtimeTextReader: RealtimeTextStreamReader?
    var realtimeAudioRenderer: RealtimeAudioRenderer?

    private var cancellables = Set<AnyCancellable>()
    private var recentTurns: [(role: String, text: String)] = []

    // System prompt for Clementine in screenplay mode
    private let screenplaySystemPrompt = """
    You are CLEMENTINE. A single unified voice — warm, sharp, emotionally fluent.
    You are a showrunner and writing partner. Output ONLY pure Fountain screenplay format.
    No explanation, no preamble, no questions. No meta-commentary.
    Write vivid, cinematic scenes. Push for concrete physical detail over emotional labels.
    Scene headings: INT./EXT. LOCATION - TIME
    Character names: ALL CAPS on their own line.
    Dialogue: below the character name.
    Parentheticals: (lowercase in parens) between character and dialogue when needed.
    Action: present tense, active voice, lean prose.
    Transitions: UPPERCASE followed by colon.
    When the user describes a scene or idea, write it as screenplay pages immediately.
    """

    init() {
        setupCallbacks()
    }

    // MARK: - Lifecycle

    func start() {
        voiceCapture.requestAuthorization()
        orbAudio.startMicrophoneMonitoring()

        // Auto-start listening after a short delay for permissions
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.beginListening()
        }
    }

    func stop() {
        voiceCapture.stopRecording()
        orbAudio.stop()
        orbAudio.stopMicrophoneMonitoring()
        syncCursor.stop()
        streamCursor.stop()
        isListening = false
        isSpeaking = false
        isProcessing = false
    }

    // MARK: - Turn-Based Flow

    func handleUtterance(_ transcript: String) async {
        guard !transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        isListening = false
        voiceCapture.stopRecording()
        isProcessing = true
        partialTranscript = ""

        HerLog.talk.info("Utterance: \(transcript)")

        do {
            let result = try await backend.talkText(
                transcript: transcript,
                systemPrompt: screenplaySystemPrompt
            )

            let replyText = resolvedReplyText(from: result)
            guard !replyText.isEmpty else {
                HerLog.talk.warning("Empty reply text, skipping")
                isProcessing = false
                beginListening()
                return
            }

            // Format the reply into Fountain
            let formatted = FountainFormatter.format(
                rawText: replyText,
                existingDraft: fountainDraft
            )

            guard !formatted.isEmpty else {
                HerLog.talk.warning("Empty formatted reply, skipping")
                isProcessing = false
                beginListening()
                return
            }

            // Append to draft
            let separator = fountainDraft.isEmpty ? "" : "\n\n"
            fountainDraft += separator + formatted

            // Build timeline and start sync playback
            let timeline = WordTimeline.build(
                text: formatted,
                audioDuration: audioDuration(for: result.audioURL),
                leadingSilence: 0.260
            )

            isProcessing = false
            isSpeaking = true
            useStreamCursor = false

            try orbAudio.play(url: result.audioURL) { [weak self] in
                Task { @MainActor [weak self] in
                    self?.onPlaybackFinished()
                }
            }

            syncCursor.start(timeline: timeline, player: orbAudio.currentPlayer!)

            // Track turns for context
            recentTurns.append((role: "user", text: transcript))
            recentTurns.append((role: "assistant", text: replyText))
            if recentTurns.count > 6 {
                recentTurns.removeFirst(2)
            }

        } catch {
            HerLog.talk.error("Talk failed: \(error.localizedDescription)")
            isProcessing = false
            beginListening()
        }
    }

    // MARK: - Realtime Flow

    func connectRealtime() async {
        currentMode = .realtime
        useStreamCursor = true

        do {
            let bootstrap = try await backend.fetchRealtimeClientSecret(
                systemPrompt: screenplaySystemPrompt,
                isScreenplayMode: true
            )

            let session = WebRTCRealtimeSession()
            realtimeSession = session

            session.onAssistantTranscript = { [weak self] text in
                Task { @MainActor [weak self] in
                    self?.handleRealtimeTranscript(text)
                }
            }

            session.onAssistantSpeakingChanged = { [weak self] speaking in
                Task { @MainActor [weak self] in
                    self?.isSpeaking = speaking
                    if !speaking {
                        self?.onPlaybackFinished()
                    }
                }
            }

            try await session.connect(bootstrap: bootstrap)
            HerLog.realtime.info("Realtime session connected")

        } catch {
            HerLog.realtime.error("Realtime connection failed: \(error.localizedDescription)")
            currentMode = .turnBased
            useStreamCursor = false
        }
    }

    func disconnectRealtime() {
        realtimeSession?.disconnect()
        realtimeSession = nil
        realtimeTextReader?.cancel()
        realtimeTextReader = nil
        currentMode = .turnBased
        useStreamCursor = false
    }

    // MARK: - Streaming Text + Audio

    func handleRealtimeWithStreaming(_ transcript: String) async {
        isListening = false
        isProcessing = true
        partialTranscript = ""
        useStreamCursor = true

        streamCursor.start(estimatedDuration: 8.0)

        do {
            try await backend.streamStudioText(
                transcript: transcript,
                systemPrompt: screenplaySystemPrompt,
                onDelta: { [weak self] delta in
                    Task { @MainActor [weak self] in
                        guard let self else { return }
                        self.isProcessing = false
                        self.isSpeaking = true

                        let formatted = FountainFormatter.format(
                            rawText: delta,
                            existingDraft: self.fountainDraft
                        )
                        self.streamCursor.appendDelta(formatted)
                    }
                },
                onComplete: { [weak self] fullText in
                    Task { @MainActor [weak self] in
                        guard let self else { return }
                        let formatted = FountainFormatter.format(
                            rawText: fullText,
                            existingDraft: self.fountainDraft
                        )

                        let separator = self.fountainDraft.isEmpty ? "" : "\n\n"
                        self.fountainDraft += separator + formatted

                        self.streamCursor.finalize(totalText: formatted)
                    }
                }
            )
        } catch {
            HerLog.talk.error("Stream failed: \(error.localizedDescription)")
            isProcessing = false
            isSpeaking = false
            beginListening()
        }
    }

    // MARK: - Private

    private func setupCallbacks() {
        voiceCapture.onPartialTranscript = { [weak self] text in
            Task { @MainActor [weak self] in
                self?.partialTranscript = text
            }
        }

        voiceCapture.onUtteranceReady = { [weak self] transcript in
            Task { @MainActor [weak self] in
                guard let self else { return }
                switch self.currentMode {
                case .turnBased:
                    await self.handleUtterance(transcript)
                case .realtime:
                    await self.handleRealtimeWithStreaming(transcript)
                }
            }
        }
    }

    private func beginListening() {
        guard voiceCapture.isAuthorized else {
            HerLog.mic.warning("Cannot listen: not authorized")
            return
        }
        isListening = true
        isSpeaking = false
        voiceCapture.startRecording()
        HerLog.talk.info("Listening...")
    }

    private func onPlaybackFinished() {
        isSpeaking = false

        // Auto-resume listening (zero-button flow)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            self?.beginListening()
        }
    }

    private func handleRealtimeTranscript(_ text: String) {
        let formatted = FountainFormatter.format(
            rawText: text,
            existingDraft: fountainDraft
        )
        guard !formatted.isEmpty else { return }

        let separator = fountainDraft.isEmpty ? "" : "\n\n"
        fountainDraft += separator + formatted
    }

    private func resolvedReplyText(from result: BackendTalkResult) -> String {
        (result.reply ?? result.transcript ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func audioDuration(for audioURL: URL) -> TimeInterval {
        guard let audioFile = try? AVAudioFile(forReading: audioURL) else {
            return 0
        }
        let sampleRate = audioFile.processingFormat.sampleRate
        guard sampleRate > 0 else { return 0 }
        return Double(audioFile.length) / sampleRate
    }
}

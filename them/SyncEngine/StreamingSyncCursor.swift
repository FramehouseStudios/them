import Foundation
import AVFoundation
import Combine

@MainActor
final class StreamingSyncCursor: ObservableObject {
    @Published private(set) var revealedWordCount: Int = 0
    @Published private(set) var totalKnownWords: Int = 0
    @Published private(set) var isComplete: Bool = false
    @Published private(set) var currentLineIndex: Int = 0

    private var accumulatedText: String = ""
    private var timeline: WordTimeline?
    private var timer: Timer?
    private var audioStartTime: Date?
    private var estimatedTotalDuration: TimeInterval = 0
    private var isFinalized: Bool = false

    // For realtime mode: tracks playback time from PCM chunks
    var currentPlaybackTime: TimeInterval = 0

    func start(estimatedDuration: TimeInterval = 10.0) {
        stop()
        accumulatedText = ""
        revealedWordCount = 0
        totalKnownWords = 0
        isComplete = false
        currentLineIndex = 0
        isFinalized = false
        estimatedTotalDuration = estimatedDuration
        audioStartTime = Date()

        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.tick()
            }
        }
    }

    func appendDelta(_ text: String) {
        accumulatedText += text
        rebuildTimeline()
    }

    func finalize(totalText: String, remainingAudioDuration: TimeInterval? = nil) {
        accumulatedText = totalText
        isFinalized = true

        if let remaining = remainingAudioDuration, remaining > 0 {
            // Rebuild with accurate remaining duration for unrevealed words
            let elapsed = elapsedTime
            estimatedTotalDuration = elapsed + remaining
        }

        rebuildTimeline()
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        audioStartTime = nil
        timeline = nil
    }

    private var elapsedTime: TimeInterval {
        if currentPlaybackTime > 0 {
            return currentPlaybackTime
        }
        guard let start = audioStartTime else { return 0 }
        return Date().timeIntervalSince(start)
    }

    private func tick() {
        guard let timeline, !timeline.entries.isEmpty else { return }

        let time = elapsedTime
        let count = timeline.revealedCountAt(time: time)

        // Monotonic: never go backward
        if count > revealedWordCount {
            revealedWordCount = count
            if count > 0, count <= timeline.entries.count {
                currentLineIndex = timeline.entries[count - 1].lineIndex
            }
        }

        if isFinalized && revealedWordCount >= timeline.entries.count {
            isComplete = true
            stop()
        }
    }

    private func rebuildTimeline() {
        let elapsed = elapsedTime
        let remainingDuration = max(0.5, estimatedTotalDuration - elapsed)

        // Build timeline for all known text, but offset times by elapsed
        let fullTimeline = WordTimeline.build(
            text: accumulatedText,
            audioDuration: elapsed + remainingDuration,
            leadingSilence: 0 // no silence for streaming — audio already started
        )

        totalKnownWords = fullTimeline.entries.count
        timeline = fullTimeline
    }
}

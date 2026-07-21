import AVFoundation
import Foundation

enum StudioResponseStreamingPolicy {
    static let partialCharacterDelta = 48
    static let partialMaximumInterval: TimeInterval = 0.12
    static let pagePreviewCharacterDelta = 56
    static let pagePreviewMaximumInterval: TimeInterval = 0.16

    static func shouldStream(isStudioSurfaceActive: Bool) -> Bool {
        isStudioSurfaceActive
    }

    static func appending(delta: String, to accumulated: String) -> String {
        accumulated + delta
    }
}

struct StreamingSpeechSegmenter {
    private static let targetChunkCharacters = 84
    private static let forcedChunkCharacters = 112

    private(set) var pendingText = ""
    private(set) var latestSnapshot = ""
    private(set) var emittedSource = ""

    mutating func reset() {
        pendingText = ""
        latestSnapshot = ""
        emittedSource = ""
    }

    mutating func ingest(cumulativeText: String, isFinal: Bool = false) -> [String] {
        let snapshot = Self.normalizedSnapshot(cumulativeText)
        updatePendingText(from: snapshot)
        latestSnapshot = snapshot

        var phrases: [String] = []
        while let boundary = nextBoundary(isFinal: isFinal) {
            let sourceChunk = String(pendingText[..<boundary])
            pendingText.removeSubrange(..<boundary)
            emittedSource += sourceChunk

            let phrase = Self.speakableText(sourceChunk)
            if !phrase.isEmpty {
                phrases.append(phrase)
            }
        }
        return phrases
    }

    private mutating func updatePendingText(from snapshot: String) {
        guard snapshot != latestSnapshot else { return }

        if snapshot.hasPrefix(latestSnapshot) {
            pendingText += String(snapshot.dropFirst(latestSnapshot.count))
            return
        }

        if snapshot.hasPrefix(emittedSource) {
            pendingText = String(snapshot.dropFirst(emittedSource.count))
            return
        }

        // An authoritative final can repair provisional tokens. Never repeat
        // words that have already been spoken; resume only when the emitted
        // source is still an exact prefix of the repaired response.
        pendingText = ""
    }

    private func nextBoundary(isFinal: Bool) -> String.Index? {
        guard !pendingText.isEmpty else { return nil }

        var wordCount = 0
        var characterCount = 0
        var isInsideWord = false
        var lastPreferredWhitespace: String.Index?
        var index = pendingText.startIndex

        while index < pendingText.endIndex {
            let character = pendingText[index]
            let next = pendingText.index(after: index)
            characterCount += 1

            if character.isWhitespace {
                isInsideWord = false
                if characterCount >= Self.targetChunkCharacters / 2 {
                    lastPreferredWhitespace = next
                }
            } else if !isInsideWord {
                wordCount += 1
                isInsideWord = true
            }

            let nextCharacter = next < pendingText.endIndex ? pendingText[next] : nil
            let followedByBreak = nextCharacter == nil || nextCharacter?.isWhitespace == true
            let isStrongBoundary = ".!?".contains(character) && followedByBreak
            let isSoftBoundary = ",;:".contains(character) && followedByBreak
            let isLineBoundary = character == "\n"

            if isStrongBoundary,
               (wordCount >= 2 || characterCount >= 10) {
                return next
            }
            if (isSoftBoundary || isLineBoundary),
               wordCount >= 5,
               characterCount >= 26 {
                return next
            }
            if characterCount >= Self.forcedChunkCharacters {
                return lastPreferredWhitespace ?? next
            }

            index = next
        }

        return isFinal ? pendingText.endIndex : nil
    }

    private static func normalizedSnapshot(_ text: String) -> String {
        text
            .replacingOccurrences(of: "\\r\\n", with: "\n")
            .replacingOccurrences(of: "\\n", with: "\n")
            .replacingOccurrences(of: "\\r", with: "\n")
    }

    static func speakableText(_ text: String) -> String {
        text
            .replacingOccurrences(of: "```fountain", with: "")
            .replacingOccurrences(of: "```screenplay", with: "")
            .replacingOccurrences(of: "```", with: "")
            .replacingOccurrences(of: "INT./EXT.", with: "Interior exterior.")
            .replacingOccurrences(of: "INT.", with: "Interior.")
            .replacingOccurrences(of: "EXT.", with: "Exterior.")
            .replacingOccurrences(of: "#", with: "")
            .split(whereSeparator: \Character.isWhitespace)
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

@MainActor
final class StreamingSpeechPlayer {
    private let synthesizer = AVSpeechSynthesizer()
    private var segmenter = StreamingSpeechSegmenter()
    private var style: ScreenplayAuditionVoiceStyle = .natural
    private(set) var isAcceptingText = false
    private(set) var hasQueuedSpeech = false

    func begin(style: ScreenplayAuditionVoiceStyle = .natural) {
        if synthesizer.isSpeaking || synthesizer.isPaused {
            synthesizer.stopSpeaking(at: .immediate)
        }
        segmenter.reset()
        self.style = style
        isAcceptingText = true
        hasQueuedSpeech = false
    }

    func consume(cumulativeText: String) {
        guard isAcceptingText else { return }
        enqueue(segmenter.ingest(cumulativeText: cumulativeText))
    }

    func finish(finalText: String) {
        guard isAcceptingText else { return }
        enqueue(segmenter.ingest(cumulativeText: finalText, isFinal: true))
        isAcceptingText = false
    }

    func cancel() {
        isAcceptingText = false
        hasQueuedSpeech = false
        segmenter.reset()
        if synthesizer.isSpeaking || synthesizer.isPaused {
            synthesizer.stopSpeaking(at: .immediate)
        }
    }

    private func enqueue(_ phrases: [String]) {
        for phrase in phrases where !phrase.isEmpty {
            let utterance = AVSpeechUtterance(string: phrase)
            let configuration = voiceConfiguration(for: style)
            utterance.rate = configuration.rate
            utterance.pitchMultiplier = configuration.pitch
            utterance.volume = configuration.volume
            utterance.preUtteranceDelay = 0
            utterance.postUtteranceDelay = 0.01
            utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
            synthesizer.speak(utterance)
            hasQueuedSpeech = true
        }
    }

    private func voiceConfiguration(
        for style: ScreenplayAuditionVoiceStyle
    ) -> (rate: Float, pitch: Float, volume: Float) {
        let voiceSpeed = ClementineVoiceSettings.voiceSpeed()
        let baseRate = Float(min(max(0.54 * voiceSpeed, 0.34), 0.78))
        switch style {
        case .natural:
            return (rate: baseRate, pitch: 1.08, volume: 0.95)
        case .faster:
            return (rate: min(baseRate * 1.16, 0.82), pitch: 1.04, volume: 0.94)
        case .colder:
            return (rate: min(baseRate * 1.02, 0.80), pitch: 0.96, volume: 0.90)
        case .vulnerable:
            return (rate: max(baseRate * 0.88, 0.32), pitch: 1.02, volume: 0.92)
        }
    }
}

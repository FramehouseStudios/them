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
    static let legacyProfile = StreamingSpeechChunkProfile(
        networkClass: .balanced,
        targetCharacters: 84,
        forcedCharacters: 112
    )

    private(set) var pendingText = ""
    private(set) var latestSnapshot = ""
    private(set) var emittedSource = ""

    mutating func reset() {
        pendingText = ""
        latestSnapshot = ""
        emittedSource = ""
    }

    mutating func ingest(cumulativeText: String, isFinal: Bool = false) -> [String] {
        ingest(cumulativeText: cumulativeText, isFinal: isFinal, profile: Self.legacyProfile)
    }

    mutating func ingest(
        cumulativeText: String,
        isFinal: Bool = false,
        profile: StreamingSpeechChunkProfile
    ) -> [String] {
        let snapshot = Self.normalizedSnapshot(cumulativeText)
        updatePendingText(from: snapshot)
        latestSnapshot = snapshot

        var phrases: [String] = []
        while let boundary = nextBoundary(isFinal: isFinal, profile: profile) {
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

    private func nextBoundary(
        isFinal: Bool,
        profile: StreamingSpeechChunkProfile
    ) -> String.Index? {
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
                if characterCount >= profile.targetCharacters / 2 {
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
            if characterCount >= profile.forcedCharacters {
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

struct StreamingSpeechChunkProfile: Equatable {
    let networkClass: ClementineSpeechNetworkClass
    let targetCharacters: Int
    let forcedCharacters: Int

    static let initial = StreamingSpeechChunkProfile(
        networkClass: .balanced,
        targetCharacters: 38,
        forcedCharacters: 56
    )
    static let fast = StreamingSpeechChunkProfile(
        networkClass: .fast,
        targetCharacters: 68,
        forcedCharacters: 96
    )
    static let balanced = StreamingSpeechChunkProfile(
        networkClass: .balanced,
        targetCharacters: 88,
        forcedCharacters: 120
    )
    static let constrained = StreamingSpeechChunkProfile(
        networkClass: .constrained,
        targetCharacters: 120,
        forcedCharacters: 168
    )
}

struct StreamingSpeechNetworkEstimator {
    private(set) var networkClass: ClementineSpeechNetworkClass = .balanced
    private(set) var playbackHasStarted = false
    private var lastObservedAt: Date?
    private var lastCharacterCount = 0
    private var smoothedGap: TimeInterval?
    private var smoothedCharactersPerSecond: Double?
    private var smoothedJitter: TimeInterval = 0

    var profile: StreamingSpeechChunkProfile {
        guard playbackHasStarted else { return .initial }
        switch networkClass {
        case .fast:
            return .fast
        case .balanced:
            return .balanced
        case .constrained:
            return .constrained
        }
    }

    mutating func reset() {
        self = StreamingSpeechNetworkEstimator()
    }

    mutating func markPlaybackStarted() {
        playbackHasStarted = true
    }

    mutating func observe(cumulativeText: String, at date: Date = Date()) {
        let characterCount = cumulativeText.count
        defer {
            lastObservedAt = date
            lastCharacterCount = characterCount
        }
        guard let lastObservedAt,
              characterCount > lastCharacterCount else { return }

        let gap = max(0.001, date.timeIntervalSince(lastObservedAt))
        let addedCharacters = characterCount - lastCharacterCount
        let charactersPerSecond = Double(addedCharacters) / gap
        let priorGap = smoothedGap ?? gap
        smoothedJitter = (smoothedJitter * 0.72) + (abs(gap - priorGap) * 0.28)
        smoothedGap = (priorGap * 0.68) + (gap * 0.32)
        let priorRate = smoothedCharactersPerSecond ?? charactersPerSecond
        smoothedCharactersPerSecond = (priorRate * 0.68) + (charactersPerSecond * 0.32)

        let effectiveGap = smoothedGap ?? gap
        let effectiveRate = smoothedCharactersPerSecond ?? charactersPerSecond
        if effectiveGap >= 0.34 || effectiveRate < 34 || smoothedJitter >= 0.18 {
            networkClass = .constrained
        } else if effectiveGap <= 0.15 && effectiveRate >= 75 && smoothedJitter <= 0.08 {
            networkClass = .fast
        } else {
            networkClass = .balanced
        }
    }
}

@MainActor
final class StreamingSpeechPlayer: NSObject, @preconcurrency AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()
    private var segmenter = StreamingSpeechSegmenter()
    private var networkEstimator = StreamingSpeechNetworkEstimator()
    private var style: ScreenplayAuditionVoiceStyle = .natural
    private var queuedUtteranceCount = 0
    private var firstAudioWasReported = false
    private var lastReportedProfile: StreamingSpeechChunkProfile?
    private var utteranceTurnIDs: [ObjectIdentifier: String] = [:]
    private(set) var isAcceptingText = false
    private(set) var hasQueuedSpeech = false
    private(set) var activeTurnID: String?

    var onFirstAudioStarted: ((String, Date, ClementineSpeechNetworkClass, Int) -> Void)?
    var onNetworkProfileChanged: ((String, ClementineSpeechNetworkClass, Int) -> Void)?
    var onPlaybackEnded: ((String) -> Void)?

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    var isSpeaking: Bool {
        synthesizer.isSpeaking || synthesizer.isPaused || queuedUtteranceCount > 0
    }

    func begin(
        turnID: String = UUID().uuidString,
        style: ScreenplayAuditionVoiceStyle = .natural
    ) {
        if synthesizer.isSpeaking || synthesizer.isPaused {
            synthesizer.stopSpeaking(at: .immediate)
        }
        segmenter.reset()
        networkEstimator.reset()
        self.style = style
        activeTurnID = turnID
        isAcceptingText = true
        hasQueuedSpeech = false
        queuedUtteranceCount = 0
        firstAudioWasReported = false
        lastReportedProfile = nil
        utteranceTurnIDs.removeAll(keepingCapacity: true)
    }

    func consume(cumulativeText: String, observedAt: Date = Date()) {
        guard isAcceptingText else { return }
        networkEstimator.observe(cumulativeText: cumulativeText, at: observedAt)
        let profile = networkEstimator.profile
        enqueue(
            segmenter.ingest(
                cumulativeText: cumulativeText,
                profile: profile
            )
        )
        if let activeTurnID, profile != lastReportedProfile {
            lastReportedProfile = profile
            onNetworkProfileChanged?(activeTurnID, profile.networkClass, profile.targetCharacters)
        }
    }

    func finish(finalText: String) {
        guard isAcceptingText else { return }
        let profile = networkEstimator.profile
        enqueue(
            segmenter.ingest(
                cumulativeText: finalText,
                isFinal: true,
                profile: profile
            )
        )
        isAcceptingText = false
        if queuedUtteranceCount == 0, let activeTurnID {
            onPlaybackEnded?(activeTurnID)
            self.activeTurnID = nil
        }
    }

    func cancel() {
        let cancelledTurnID = activeTurnID
        isAcceptingText = false
        hasQueuedSpeech = false
        queuedUtteranceCount = 0
        segmenter.reset()
        networkEstimator.reset()
        lastReportedProfile = nil
        activeTurnID = nil
        utteranceTurnIDs.removeAll(keepingCapacity: true)
        if synthesizer.isSpeaking || synthesizer.isPaused {
            synthesizer.stopSpeaking(at: .immediate)
        }
        if let cancelledTurnID {
            onPlaybackEnded?(cancelledTurnID)
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
            if let activeTurnID {
                utteranceTurnIDs[ObjectIdentifier(utterance)] = activeTurnID
            }
            queuedUtteranceCount += 1
            synthesizer.speak(utterance)
            hasQueuedSpeech = true
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        guard let turnID = utteranceTurnIDs[ObjectIdentifier(utterance)],
              turnID == activeTurnID else { return }
        networkEstimator.markPlaybackStarted()
        guard !firstAudioWasReported else { return }
        firstAudioWasReported = true
        let profile = networkEstimator.profile
        onFirstAudioStarted?(turnID, Date(), profile.networkClass, profile.targetCharacters)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        complete(utterance: utterance)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        complete(utterance: utterance)
    }

    private func complete(utterance: AVSpeechUtterance) {
        let identifier = ObjectIdentifier(utterance)
        guard let turnID = utteranceTurnIDs.removeValue(forKey: identifier),
              turnID == activeTurnID else { return }
        queuedUtteranceCount = max(0, queuedUtteranceCount - 1)
        hasQueuedSpeech = queuedUtteranceCount > 0
        if queuedUtteranceCount == 0, !isAcceptingText {
            activeTurnID = nil
            onPlaybackEnded?(turnID)
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

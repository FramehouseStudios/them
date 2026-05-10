import Foundation
import AVFoundation
import Combine
import CryptoKit
import os
#if os(macOS)
import AppKit
#endif
import SwiftUI

enum ClementineVoiceSettings {
    static let vadSensitivityKey = "clementine_vad_sensitivity"
    static let silenceThresholdMsKey = "clementine_vad_silence_threshold_ms"
    static let stageOverrideKey = "clementine_stage_override"
    static let speculativeTalkEnabledKey = "clementine_speculative_talk_enabled"
    static let endSilenceScaleKey = "vad_end_silence_scale"
    static let minSpeechSecondsKey = "vad_min_speech_seconds"
    static let voiceSpeedKey = "clementine_voice_speed"

    static func vadSensitivity(defaults: UserDefaults = .standard) -> Double {
        let raw = defaults.object(forKey: vadSensitivityKey) as? Double ?? 0.62
        return min(max(raw, 0), 1)
    }

    static func silenceThresholdMs(defaults: UserDefaults = .standard) -> Int {
        let raw = defaults.object(forKey: silenceThresholdMsKey) as? Int ?? 780
        return min(max(raw, 450), 1800)
    }

    static func endSilenceScale(defaults: UserDefaults = .standard) -> Double {
        let raw = defaults.object(forKey: endSilenceScaleKey) as? Double ?? 1.0
        return min(max(raw, 0.5), 2.0)
    }

    static func minSpeechSeconds(defaults: UserDefaults = .standard) -> Double {
        let raw = defaults.object(forKey: minSpeechSecondsKey) as? Double ?? 0.36
        return min(max(raw, 0.15), 1.2)
    }

    static func voiceSpeed(defaults: UserDefaults = .standard) -> Double {
        let raw = defaults.object(forKey: voiceSpeedKey) as? Double ?? 1.0
        return min(max(raw, 0.7), 1.5)
    }

    static func stageOverride(defaults: UserDefaults = .standard) -> Int? {
        let raw = defaults.object(forKey: stageOverrideKey) as? Int ?? 0
        return (1...5).contains(raw) ? raw : nil
    }

    static func speculativeTalkEnabled(defaults: UserDefaults = .standard) -> Bool {
        if defaults.object(forKey: speculativeTalkEnabledKey) == nil {
            return true
        }
        return defaults.bool(forKey: speculativeTalkEnabledKey)
    }
}

struct SpeculativeTalkReuseCandidate {
    let preparedPrompt: String
    let preparedPromptHash: String
    let speculativeKey: String
}

struct SpeculativeTalkPrepareRequest {
    let audioSnapshot: Data
    let partialText: String
    let preparedPrompt: String
    let preparedPromptHash: String
    let speculativeKey: String
    let isScreenplayMode: Bool
}

struct SpeculativeTalkPrepareReceipt {
    let speculativeKey: String
}

struct SpeculativeTalkTelemetry: Codable {
    var silenceWindowTriggerCount: Int = 0
    var backendPrepareAttemptCount: Int = 0
    var backendPrepareSuccessCount: Int = 0
    var compatiblePreparedPromptReuseCount: Int = 0
    var lastCompatiblePreparedPromptReused: Bool = false
    var lastBackendReuseHit: Bool = false
    var lastSpeculativeKey: String = ""
    var lastPreparedPromptHash: String = ""
    var lastTriggerAt: TimeInterval = 0
}

@MainActor
final class SpeculativeTalkEngine: ObservableObject {
    struct Snapshot {
        let seedText: String
        let isScreenplayMode: Bool
        let shouldWriteToPage: Bool
        let preparedPrompt: String
        let preparedPromptHash: String
        var speculativeKey: String
        let preparedAt: Date
    }

    @Published private(set) var snapshot: Snapshot?
    @Published private(set) var telemetry = SpeculativeTalkTelemetry()

    private var prepareTask: Task<Void, Never>?
    private var prewarmTask: Task<Void, Never>?
    private var generation = 0
    private var lastPrewarmSignature = ""
    private var lastPrewarmAt: Date = .distantPast

    func cancel() {
        generation += 1
        prepareTask?.cancel()
        prewarmTask?.cancel()
        prepareTask = nil
        prewarmTask = nil
        snapshot = nil
    }

    func prepareIfNeeded(
        seedText: String,
        isScreenplayMode: Bool,
        shouldWriteToPage: Bool,
        builder: @escaping @MainActor (String, Bool, Bool) async -> String?
    ) {
        guard ClementineVoiceSettings.speculativeTalkEnabled() else {
            cancel()
            return
        }

        let cleanSeed = seedText.trimmingCharacters(in: .whitespacesAndNewlines)
        let wordCount = cleanSeed.split(whereSeparator: \.isWhitespace).count
        guard cleanSeed.count >= 16, wordCount >= 4 else {
            if snapshot?.seedText != cleanSeed {
                cancel()
            }
            return
        }

        if let snapshot,
           snapshot.isScreenplayMode == isScreenplayMode,
           snapshot.shouldWriteToPage == shouldWriteToPage,
           Date().timeIntervalSince(snapshot.preparedAt) < 18 {
            let normalizedSnapshot = normalize(snapshot.seedText)
            let normalizedSeed = normalize(cleanSeed)
            let snapshotWords = normalizedSnapshot.split(separator: " ").count
            let seedWords = normalizedSeed.split(separator: " ").count
            let grewMeaningfully = normalizedSeed.count > (normalizedSnapshot.count + 14) ||
                seedWords > (snapshotWords + 2)
            if !grewMeaningfully && isCompatible(seed: snapshot.seedText, finalText: cleanSeed) {
                return
            }
        }

        generation += 1
        let currentGeneration = generation
        prepareTask?.cancel()
        prepareTask = Task { [weak self] in
            guard let self else { return }
            let prompt = await builder(cleanSeed, isScreenplayMode, shouldWriteToPage)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !Task.isCancelled else { return }
            guard let prompt, !prompt.isEmpty else { return }
            guard currentGeneration == self.generation else { return }
            self.snapshot = Snapshot(
                seedText: cleanSeed,
                isScreenplayMode: isScreenplayMode,
                shouldWriteToPage: shouldWriteToPage,
                preparedPrompt: prompt,
                preparedPromptHash: self.promptHash(prompt),
                speculativeKey: "",
                preparedAt: Date()
            )
        }
    }

    func preparedPromptIfCompatible(
        finalText: String,
        isScreenplayMode: Bool,
        shouldWriteToPage: Bool
    ) -> String? {
        guard let snapshot else { return nil }
        guard snapshot.isScreenplayMode == isScreenplayMode else { return nil }
        guard snapshot.shouldWriteToPage == shouldWriteToPage else { return nil }
        guard Date().timeIntervalSince(snapshot.preparedAt) < 18 else { return nil }
        return isCompatible(seed: snapshot.seedText, finalText: finalText)
            ? snapshot.preparedPrompt
            : nil
    }

    func reuseCandidateIfCompatible(
        finalText: String,
        isScreenplayMode: Bool,
        shouldWriteToPage: Bool
    ) -> SpeculativeTalkReuseCandidate? {
        guard let snapshot else {
            telemetry.lastCompatiblePreparedPromptReused = false
            return nil
        }
        guard snapshot.isScreenplayMode == isScreenplayMode else {
            telemetry.lastCompatiblePreparedPromptReused = false
            return nil
        }
        guard snapshot.shouldWriteToPage == shouldWriteToPage else {
            telemetry.lastCompatiblePreparedPromptReused = false
            return nil
        }
        guard Date().timeIntervalSince(snapshot.preparedAt) < 18 else {
            telemetry.lastCompatiblePreparedPromptReused = false
            return nil
        }
        guard isCompatible(seed: snapshot.seedText, finalText: finalText) else {
            telemetry.lastCompatiblePreparedPromptReused = false
            return nil
        }
        telemetry.compatiblePreparedPromptReuseCount += 1
        telemetry.lastCompatiblePreparedPromptReused = true
        telemetry.lastPreparedPromptHash = snapshot.preparedPromptHash
        if !snapshot.speculativeKey.isEmpty {
            telemetry.lastSpeculativeKey = snapshot.speculativeKey
        }
        return SpeculativeTalkReuseCandidate(
            preparedPrompt: snapshot.preparedPrompt,
            preparedPromptHash: snapshot.preparedPromptHash,
            speculativeKey: snapshot.speculativeKey
        )
    }

    func noteBackendReuse(hit: Bool, speculativeKey: String?) {
        telemetry.lastBackendReuseHit = hit
        let cleanKey = (speculativeKey ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanKey.isEmpty {
            telemetry.lastSpeculativeKey = cleanKey
        }
    }

    func consider(
        audioSnapshot: Data,
        partialText: String,
        speechAge: TimeInterval,
        isTurnSubmitting: Bool,
        prepareTalk: @escaping @MainActor (SpeculativeTalkPrepareRequest) async throws -> SpeculativeTalkPrepareReceipt?
    ) {
        guard ClementineVoiceSettings.speculativeTalkEnabled() else {
            cancel()
            return
        }
        guard !isTurnSubmitting else { return }
        guard speechAge >= 0.45 else { return }
        guard let snapshot else { return }

        let cleanPartial = partialText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanPartial.isEmpty else { return }
        guard hasStrongPartial(cleanPartial) else { return }
        guard Date().timeIntervalSince(snapshot.preparedAt) < 18 else { return }
        guard isCompatible(seed: snapshot.seedText, finalText: cleanPartial) else { return }
        guard isLikelySilenceWindow(audioSnapshot: audioSnapshot) else { return }

        let speculativeKey = buildSpeculativeKey(
            seedText: snapshot.seedText,
            preparedPromptHash: snapshot.preparedPromptHash,
            isScreenplayMode: snapshot.isScreenplayMode
        )
        let signature = [
            normalize(snapshot.seedText),
            snapshot.preparedPromptHash,
            snapshot.isScreenplayMode ? "studio" : "home",
            speculativeKey
        ].joined(separator: "|")

        if signature == lastPrewarmSignature,
           Date().timeIntervalSince(lastPrewarmAt) < 6 {
            return
        }

        lastPrewarmSignature = signature
        lastPrewarmAt = Date()
        telemetry.silenceWindowTriggerCount += 1
        telemetry.backendPrepareAttemptCount += 1
        telemetry.lastTriggerAt = Date().timeIntervalSince1970
        telemetry.lastPreparedPromptHash = snapshot.preparedPromptHash
        prewarmTask?.cancel()
        prewarmTask = Task { @MainActor [weak self] in
            defer { self?.prewarmTask = nil }
            do {
                let receipt = try await prepareTalk(
                    SpeculativeTalkPrepareRequest(
                        audioSnapshot: audioSnapshot,
                        partialText: cleanPartial,
                        preparedPrompt: snapshot.preparedPrompt,
                        preparedPromptHash: snapshot.preparedPromptHash,
                        speculativeKey: speculativeKey,
                        isScreenplayMode: snapshot.isScreenplayMode
                    )
                )
                guard let self else { return }
                guard !Task.isCancelled else { return }
                guard signature == self.lastPrewarmSignature else { return }
                let resolvedKey = (receipt?.speculativeKey ?? speculativeKey)
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                self.telemetry.backendPrepareSuccessCount += 1
                self.telemetry.lastSpeculativeKey = resolvedKey
                if var currentSnapshot = self.snapshot,
                   currentSnapshot.preparedPromptHash == snapshot.preparedPromptHash,
                   currentSnapshot.isScreenplayMode == snapshot.isScreenplayMode,
                   self.isCompatible(seed: currentSnapshot.seedText, finalText: cleanPartial) {
                    currentSnapshot.speculativeKey = resolvedKey
                    self.snapshot = currentSnapshot
                }
            } catch {
                return
            }
        }
    }

    private func hasStrongPartial(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 12 else { return false }
        return trimmed.split(whereSeparator: \.isWhitespace).count >= 3
    }

    private func isCompatible(seed: String, finalText: String) -> Bool {
        let normalizedSeed = normalize(seed)
        let normalizedFinal = normalize(finalText)
        guard !normalizedSeed.isEmpty, !normalizedFinal.isEmpty else { return false }
        if normalizedSeed == normalizedFinal { return true }
        if normalizedFinal.hasPrefix(normalizedSeed) || normalizedSeed.hasPrefix(normalizedFinal) {
            return true
        }

        let seedWords = Set(normalizedSeed.split(separator: " ").map(String.init))
        let finalWords = Set(normalizedFinal.split(separator: " ").map(String.init))
        guard !seedWords.isEmpty, !finalWords.isEmpty else { return false }
        let overlap = seedWords.intersection(finalWords).count
        let baseline = Double(min(seedWords.count, finalWords.count))
        guard baseline > 0 else { return false }
        return Double(overlap) / baseline >= 0.60
    }

    private func normalize(_ text: String) -> String {
        text.lowercased()
            .replacingOccurrences(of: "’", with: "'")
            .replacingOccurrences(
                of: #"[^\p{L}\p{N}\s']+"#,
                with: " ",
                options: .regularExpression
            )
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func buildSpeculativeKey(
        seedText: String,
        preparedPromptHash: String,
        isScreenplayMode: Bool
    ) -> String {
        let basis = [
            preparedPromptHash,
            normalize(seedText),
            isScreenplayMode ? "studio" : "home"
        ].joined(separator: "|")
        return "spec-\(shortHash(basis))"
    }

    private func promptHash(_ prompt: String) -> String {
        shortHash(prompt)
    }

    private func shortHash(_ value: String) -> String {
        let digest = SHA256.hash(data: Data(value.utf8))
        return digest.prefix(8).map { String(format: "%02x", $0) }.joined()
    }

    private func isLikelySilenceWindow(audioSnapshot: Data) -> Bool {
        let samples = wavSamples(from: audioSnapshot)
        guard samples.count > 2048 else { return false }

        let sampleRate = wavSampleRate(from: audioSnapshot)
        let tailCount = min(max(Int(Double(sampleRate) * 0.18), 2048), samples.count / 2)
        let compareCount = min(max(Int(Double(sampleRate) * 0.28), 3072), samples.count - tailCount)
        guard tailCount > 0, compareCount > 0 else { return false }

        let precedingStart = samples.count - tailCount - compareCount
        guard precedingStart >= 0 else { return false }

        let preceding = Array(samples[precedingStart..<(precedingStart + compareCount)])
        let tail = Array(samples[(samples.count - tailCount)..<samples.count])
        let precedingRMS = rms(preceding)
        let tailRMS = rms(tail)
        guard precedingRMS >= 0.0024 else { return false }

        let silenceThreshold = max(0.0012, precedingRMS * 0.46)
        return tailRMS <= silenceThreshold
    }

    private func wavSampleRate(from data: Data) -> Int {
        guard data.count >= 28 else { return 48_000 }
        let b0 = UInt32(data[24])
        let b1 = UInt32(data[25]) << 8
        let b2 = UInt32(data[26]) << 16
        let b3 = UInt32(data[27]) << 24
        let sampleRate = Int(b0 | b1 | b2 | b3)
        return sampleRate > 0 ? sampleRate : 48_000
    }

    private func wavSamples(from data: Data) -> [Float] {
        guard data.count > 44 else { return [] }
        let payload = data.dropFirst(44)
        let count = payload.count / MemoryLayout<Int16>.stride
        guard count > 0 else { return [] }

        return payload.withUnsafeBytes { rawBuffer in
            let int16Buffer = rawBuffer.bindMemory(to: Int16.self)
            return Array(int16Buffer.prefix(count)).map { sample in
                Float(Int16(littleEndian: sample)) / 32768.0
            }
        }
    }

    private func rms(_ samples: [Float]) -> Float {
        guard !samples.isEmpty else { return 0 }
        var sum: Float = 0
        for sample in samples {
            sum += sample * sample
        }
        return sqrt(sum / Float(samples.count))
    }
}

struct MicPermissionNotice: Identifiable {
    let id = UUID()
    let title: String
    let message: String
}

@MainActor
final class HerVoiceController: ObservableObject {

    enum Mode { case idle, armedListening, capturingSpeech, assistantSpeaking, muted }

    struct TurnEndHints {
        let tailSilenceMs: Int
        let vadThreshold: Float
        let speechMs: Int
        let noiseFloorRms: Float
        let speechRms: Float
        let voicedRatio: Double
        let speechAgeSeconds: Double
        let hasStrongPartial: Bool
        let partialStableSeconds: Double
    }

    @Published var mode: Mode = .idle
    @Published var showSpaceHint: Bool = true
    @Published var micLevel: Float = 0
    @Published var isSpeechDetected: Bool = false
    @Published var partialTranscript: String = ""
    @Published var micPermissionNotice: MicPermissionNotice?

    // MARK: - Audio
    private let engine = AVAudioEngine()
    private var isEngineRunning = false

    // Playback hook (use your existing player)
    // You MUST set these from outside if you already have a player.
    var stopAssistantPlayback: (() -> Void)?
    var isAssistantPlaying: (() -> Bool)?
    var onBargeInDetected: (() -> Void)?
    var onPartialTranscript: ((String) -> Void)?

    /// Fired every ~300ms during active speech capture.
    /// Carries: current WAV snapshot bytes, current partial transcript, seconds of speech so far.
    var onSpeechProgressSnapshot: ((_ audioSnapshot: Data, _ partialText: String, _ speechAge: TimeInterval) -> Void)?

    // MARK: - VAD tuning
    private let baseStartThreshold: Float = 0.0062
    private let baseEndSilenceSeconds: TimeInterval = 1.25
    private let longSpeechEndSilenceSeconds: TimeInterval = 2.0
    private let minSpeechSeconds: TimeInterval = 0.36
    private let minVoicedSeconds: TimeInterval = 0.20
    private let preRollSeconds: TimeInterval = 0.20
    private let retriggerCooldownSeconds: TimeInterval = 0.25
    private let pendingRequestTimeoutSeconds: TimeInterval = 20
    private let maxCaptureSeconds: TimeInterval = 28
    private let bargeInMinHoldSeconds: TimeInterval = 0.012
    private let bargeInGraceAfterPlaybackStartSeconds: TimeInterval = 0.012
    private let bargeInThresholdScale: Float = 0.92
    private let bargeInNoiseMultiplier: Float = 1.65
    private let bargeInMinAbsoluteRMS: Float = 0.0028
    private let bargeInImmediateAbsoluteRMS: Float = 0.0042
    private let bargeInDeltaFromPlaybackBaseline: Float = 0.0009
    private let bargeInImmediateDeltaFromPlaybackBaseline: Float = 0.0016
    private let bargeInMinConsecutiveLoudFrames: Int = 1
    private let bargeInBaselineCalibrationWindowSeconds: TimeInterval = 0.45

    private var speechStartedAt: Date?
    private var lastLoudAt: Date?
    private var cooldownUntil: Date = .distantPast
    private var hasPendingUtterance = false
    private var pendingRequestDeadline: Date?
    private var noiseFloorRMS: Float = 0.0018
    private var dynamicStartThreshold: Float = 0.006
    private var dynamicEndSilenceSeconds: TimeInterval = 1.55
    private var smoothedRMS: Float = 0
    private var assistantPlaybackStartedAt: Date?
    private var assistantPlaybackBaselineRMS: Float = 0
    private var assistantPlaybackBaselineSamples: Int = 0
    private var bargeInCandidateStartedAt: Date?
    private var consecutiveLoudFrames: Int = 0
    private var silenceQualifiedSince: Date?
    private var voicedFramesCount: Int = 0
    private var peakSpeechRMS: Float = 0
    private let snapshotIntervalSeconds: TimeInterval = 0.30
    private let partialStabilityWindowSeconds: TimeInterval = 0.40
    private var lastSnapshotAt: Date = .distantPast
    private var partialLastChangedAt: Date = .distantPast
    private var partialLastSeenForStability: String = ""
    private let partialTranscriber = LivePartialTranscriber()

    private var configuredEndSilenceScale: TimeInterval {
        TimeInterval(ClementineVoiceSettings.endSilenceScale())
    }

    private var configuredMinSpeechSeconds: TimeInterval {
        TimeInterval(ClementineVoiceSettings.minSpeechSeconds())
    }

    // MARK: - Buffering
    private var utteranceFrames: [Float] = []
    private var preRollFrames: [Float] = []
    private var sampleRate: Double = 48_000
    private var channels: AVAudioChannelCount = 1

    // Called when we detect a complete utterance (PCM16 WAV)
    var onUtteranceReady: ((Data) -> Void)?
    /// Set when Screenplay Studio is visible so clean short dictation turns can finalize faster.
    var isStudioMode: Bool = false
    var debugStartThreshold: Float { dynamicStartThreshold }
    var debugPartialStabilityWindowSeconds: TimeInterval { partialStabilityWindowSeconds }
    private(set) var debugPartialStableSeconds: TimeInterval = 0

    // Snapshot of VAD/STT quality at the exact moment an utterance finalized.
    private(set) var lastFinalTurnHints = TurnEndHints(
        tailSilenceMs: 1550,
        vadThreshold: 0.006,
        speechMs: 0,
        noiseFloorRms: 0.0018,
        speechRms: 0,
        voicedRatio: 1.0,
        speechAgeSeconds: 0,
        hasStrongPartial: false,
        partialStableSeconds: 0
    )

    var turnEndHints: TurnEndHints {
        TurnEndHints(
            tailSilenceMs: Int((dynamicEndSilenceSeconds * 1000).rounded()),
            vadThreshold: dynamicStartThreshold,
            speechMs: lastFinalTurnHints.speechMs,
            noiseFloorRms: lastFinalTurnHints.noiseFloorRms,
            speechRms: lastFinalTurnHints.speechRms,
            voicedRatio: lastFinalTurnHints.voicedRatio,
            speechAgeSeconds: lastFinalTurnHints.speechAgeSeconds,
            hasStrongPartial: lastFinalTurnHints.hasStrongPartial,
            partialStableSeconds: debugPartialStableSeconds
        )
    }

    init() {
        partialTranscriber.onPartial = { [weak self] text in
            guard let self else { return }
            self.partialTranscript = text
            self.onPartialTranscript?(text)
        }
    }

    // MARK: - Public API
    func armOnce() {
        HerLog.mic.info("MIC arm() called")
        guard mode == .idle else { return }
        partialTranscriber.requestAuthorizationIfNeeded()
        requestMicPermission { [weak self] granted in
            guard let self else { return }
            guard granted else {
                Task { @MainActor in
                    self.mode = .idle
                }
                return
            }
            Task { @MainActor in
                self.mode = .armedListening
                self.resetAdaptiveVAD()
                withAnimation(.easeInOut(duration: 0.35)) {
                    self.showSpaceHint = false
                }
                self.startContinuousListening()
            }
        }
    }

    func setMuted(_ muted: Bool) {
        mode = muted ? .muted : .armedListening
    }

    func markAssistantPlaybackStarted() {
        hasPendingUtterance = false
        pendingRequestDeadline = nil
        partialTranscript = ""
        partialLastChangedAt = .distantPast
        partialLastSeenForStability = ""
        debugPartialStableSeconds = 0
        assistantPlaybackStartedAt = Date()
        assistantPlaybackBaselineRMS = max(0.0016, noiseFloorRMS, smoothedRMS)
        assistantPlaybackBaselineSamples = 0
        bargeInCandidateStartedAt = nil
        consecutiveLoudFrames = 0
        silenceQualifiedSince = nil
        mode = .assistantSpeaking
    }

    func markAssistantPlaybackEnded() {
        hasPendingUtterance = false
        pendingRequestDeadline = nil
        assistantPlaybackStartedAt = nil
        assistantPlaybackBaselineRMS = 0
        assistantPlaybackBaselineSamples = 0
        bargeInCandidateStartedAt = nil
        consecutiveLoudFrames = 0
        silenceQualifiedSince = nil
        if mode != .muted && mode != .idle {
            mode = .armedListening
        }
    }

    func markRequestFailed() {
        hasPendingUtterance = false
        pendingRequestDeadline = nil
        assistantPlaybackStartedAt = nil
        assistantPlaybackBaselineRMS = 0
        assistantPlaybackBaselineSamples = 0
        bargeInCandidateStartedAt = nil
        consecutiveLoudFrames = 0
        silenceQualifiedSince = nil
        if mode != .muted && mode != .idle {
            mode = .armedListening
        }
    }

    func stopRecording() {
        HerLog.mic.info("stopRecording requested")
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        isEngineRunning = false
        partialTranscriber.stop(resetText: true)
        partialLastChangedAt = .distantPast
        partialLastSeenForStability = ""
        debugPartialStableSeconds = 0
        micLevel = 0
        isSpeechDetected = false
        let engineRunning = isEngineRunning
        HerLog.mic.info("stopRecording complete engineRunning=\(engineRunning)")
        dynamicEndSilenceSeconds = baseEndSilenceSeconds * configuredEndSilenceScale
        silenceQualifiedSince = nil
    }

    func resumeRecordingIfNeeded() {
        guard mode != .idle, mode != .muted else { return }
        HerLog.mic.info("resume requested mode=\(String(describing: self.mode), privacy: .public)")
        startContinuousListening()
    }

    func teardown() {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        isEngineRunning = false
        partialTranscriber.stop(resetText: true)
        partialLastChangedAt = .distantPast
        partialLastSeenForStability = ""
        debugPartialStableSeconds = 0
        mode = .idle
        showSpaceHint = true
        isSpeechDetected = false
        cooldownUntil = .distantPast
        hasPendingUtterance = false
        pendingRequestDeadline = nil
        assistantPlaybackStartedAt = nil
        assistantPlaybackBaselineRMS = 0
        assistantPlaybackBaselineSamples = 0
        bargeInCandidateStartedAt = nil
        consecutiveLoudFrames = 0
        silenceQualifiedSince = nil
        utteranceFrames.removeAll()
        preRollFrames.removeAll()
        resetAdaptiveVAD()
    }

    // MARK: - Mic permission
    private func requestMicPermission(_ done: @escaping (Bool) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            done(true)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .audio) { [weak self] granted in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    if !granted {
                        self.presentMicPermissionNotice(restricted: false)
                    }
                    done(granted)
                }
            }
        case .restricted:
            presentMicPermissionNotice(restricted: true)
            done(false)
        case .denied:
            presentMicPermissionNotice(restricted: false)
            done(false)
        @unknown default:
            presentMicPermissionNotice(restricted: false)
            done(false)
        }
    }

    private func presentMicPermissionNotice(restricted: Bool) {
        let title = restricted ? "Microphone Unavailable" : "Microphone Access Needed"
        let message = restricted
            ? "Microphone access is restricted on this device. Check system restrictions and privacy settings to enable voice conversations."
            : "Microphone access is off. Enable it in Settings > Privacy > Microphone to talk with io.them."
        micPermissionNotice = MicPermissionNotice(title: title, message: message)
        HerLog.mic.error("mic permission denied restricted=\(restricted)")
    }

    // MARK: - Engine
    private func startContinuousListening() {
        guard !isEngineRunning else { return }
        prepareListeningSessionIfSupported()

        let input = engine.inputNode
        let inputFormat = input.outputFormat(forBus: 0)

        sampleRate = inputFormat.sampleRate
        channels = inputFormat.channelCount

        HerLog.mic.info(
            "MIC input format sr=\(inputFormat.sampleRate) ch=\(inputFormat.channelCount) format=\(inputFormat.commonFormat.rawValue) interleaved=\(inputFormat.isInterleaved)"
        )

        partialTranscriber.start()
        let partialTranscriber = self.partialTranscriber
        input.removeTap(onBus: 0)
        HerLog.mic.info("MIC installing input tap")
        input.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, _ in
            guard let self else { return }
            HerLog.mic.info("MIC tap frames=\(buffer.frameLength)")
            partialTranscriber.append(buffer)

            if buffer.format.commonFormat == .pcmFormatInt16,
               let int16 = buffer.int16ChannelData {

                let ch0 = int16[0]
                let n = Int(buffer.frameLength)
                var minV: Int16 = 0
                var maxV: Int16 = 0

                if n > 0 {
                    minV = ch0[0]
                    maxV = ch0[0]
                    for i in 0..<n {
                        let v = ch0[i]
                        if v < minV { minV = v }
                        if v > maxV { maxV = v }
                    }
                }

                HerLog.mic.info("RAW int16 min=\(minV) max=\(maxV) n=\(n)")
            }

            let frames = Self.extractMonoFloats(buffer: buffer)
            if frames.isEmpty { return }
            let rms = Self.rmsFromInt16(buffer)

            Task { @MainActor [weak self] in
                self?.handle(frames: frames, rms: rms, now: Date())
            }
        }

        do {
            try engine.start()
            isEngineRunning = true
            HerLog.mic.info("MIC engine started")
        } catch {
            print("Audio engine failed to start: \(error)")
        }
    }

    private func prepareListeningSessionIfSupported() {
        #if os(iOS)
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.defaultToSpeaker, .allowBluetoothHFP]
            )
            try session.setActive(true)

            let inputs = session.currentRoute.inputs
                .map { "\($0.portType.rawValue):\($0.portName)" }
                .joined(separator: ",")
            let outputs = session.currentRoute.outputs
                .map { "\($0.portType.rawValue):\($0.portName)" }
                .joined(separator: ",")
            let volume = session.outputVolume
            HerLog.audio.info(
                "listening session inputs=\(inputs, privacy: .public) outputs=\(outputs, privacy: .public) volume=\(volume)"
            )
        } catch {
            HerLog.audio.error("listening session error=\(error.localizedDescription, privacy: .public)")
        }
        #endif
    }

    // MARK: - Core loop
    private func handle(frames: [Float], rms: Float, now: Date) {
        guard mode != .idle, mode != .muted else { return }
        smoothedRMS = smoothedRMS == 0 ? rms : ((smoothedRMS * 0.78) + (rms * 0.22))
        updateNoiseFloor(with: smoothedRMS)
        dynamicStartThreshold = computeDynamicStartThreshold()
        let loud = smoothedRMS > dynamicStartThreshold
        consecutiveLoudFrames = loud ? (consecutiveLoudFrames + 1) : 0
        micLevel = smoothedRMS
        isSpeechDetected = loud
        HerLog.mic.info(
            "RMS=\(self.smoothedRMS) vad=\(self.dynamicStartThreshold) noise=\(self.noiseFloorRMS)"
        )

        if hasPendingUtterance, let deadline = pendingRequestDeadline, now >= deadline {
            hasPendingUtterance = false
            pendingRequestDeadline = nil
            mode = .armedListening
        }

        if now < cooldownUntil {
            appendToPreRoll(frames)
            return
        }

        // Barge-in: if assistant is speaking and user starts talking, stop playback immediately.
        if mode == .assistantSpeaking {
            let assistantPlaying = isAssistantPlaying?() ?? false
            if !assistantPlaying && !hasPendingUtterance {
                // Failsafe: if playback state drifted, immediately recover to listening.
                mode = .armedListening
                assistantPlaybackStartedAt = nil
                assistantPlaybackBaselineRMS = 0
                assistantPlaybackBaselineSamples = 0
                bargeInCandidateStartedAt = nil
                consecutiveLoudFrames = 0
                // Continue this frame through normal capture path below.
            } else if assistantPlaying || hasPendingUtterance {
                if assistantPlaying {
                    let assistantSample = max(noiseFloorRMS, smoothedRMS)
                    let elapsedSincePlaybackStart = now.timeIntervalSince(assistantPlaybackStartedAt ?? now)
                    if elapsedSincePlaybackStart <= bargeInBaselineCalibrationWindowSeconds {
                        if assistantPlaybackBaselineSamples <= 0 {
                            assistantPlaybackBaselineRMS = assistantSample
                        } else {
                            assistantPlaybackBaselineRMS =
                                (assistantPlaybackBaselineRMS * 0.90) + (assistantSample * 0.10)
                        }
                        assistantPlaybackBaselineSamples += 1
                    }
                }
                let elapsedSincePlaybackStart = now.timeIntervalSince(assistantPlaybackStartedAt ?? now)
                let playbackBaselineThreshold = assistantPlaybackBaselineRMS + bargeInDeltaFromPlaybackBaseline
                let dynamicFloor = max(
                    dynamicStartThreshold * bargeInThresholdScale,
                    0.0024
                )
                let bargeInThreshold = max(
                    dynamicFloor,
                    noiseFloorRMS * bargeInNoiseMultiplier,
                    bargeInMinAbsoluteRMS,
                    playbackBaselineThreshold
                )
                let highEnough = smoothedRMS >= bargeInThreshold
                if elapsedSincePlaybackStart >= bargeInGraceAfterPlaybackStartSeconds, highEnough {
                    if bargeInCandidateStartedAt == nil {
                        bargeInCandidateStartedAt = now
                    }
                    let holdTime = now.timeIntervalSince(bargeInCandidateStartedAt ?? now)
                    let immediateCut = smoothedRMS >= max(
                        bargeInImmediateAbsoluteRMS,
                        assistantPlaybackBaselineRMS + bargeInImmediateDeltaFromPlaybackBaseline
                    ) && consecutiveLoudFrames >= 1
                    let heldCut = holdTime >= bargeInMinHoldSeconds && consecutiveLoudFrames >= bargeInMinConsecutiveLoudFrames
                    if immediateCut || heldCut {
                        let baselineAtCut = assistantPlaybackBaselineRMS
                        stopAssistantPlayback?()
                        onBargeInDetected?()
                        assistantPlaybackStartedAt = nil
                        assistantPlaybackBaselineRMS = 0
                        assistantPlaybackBaselineSamples = 0
                        hasPendingUtterance = false
                        pendingRequestDeadline = nil
                        mode = .capturingSpeech
                        speechStartedAt = now
                        lastLoudAt = now
                        voicedFramesCount = 0
                        peakSpeechRMS = smoothedRMS
                        lastSnapshotAt = .distantPast
                        partialLastChangedAt = now
                        partialLastSeenForStability = ""
                        debugPartialStableSeconds = 0
                        utteranceFrames.removeAll(keepingCapacity: true)
                        utteranceFrames.append(contentsOf: frames)
                        HerLog.mic.info(
                            "BARGE-IN while assistantSpeaking assistantPlaying=\(assistantPlaying) hold=\(holdTime) rms=\(self.smoothedRMS) threshold=\(bargeInThreshold) baseline=\(baselineAtCut) immediate=\(immediateCut)"
                        )
                        bargeInCandidateStartedAt = nil
                    }
                } else {
                    bargeInCandidateStartedAt = nil
                }
                return
            }
        }

        appendToPreRoll(frames)

        if loud {
            lastLoudAt = now
            silenceQualifiedSince = nil
            if mode == .armedListening {
                mode = .capturingSpeech
                speechStartedAt = now
                silenceQualifiedSince = nil
                voicedFramesCount = 0
                peakSpeechRMS = smoothedRMS
                lastSnapshotAt = .distantPast
                partialLastChangedAt = now
                partialLastSeenForStability = ""
                debugPartialStableSeconds = 0
                utteranceFrames.removeAll(keepingCapacity: true)
                utteranceFrames.append(contentsOf: preRollFrames)
            }
        }

        if mode == .capturingSpeech {
            utteranceFrames.append(contentsOf: frames)
            if loud {
                voicedFramesCount += frames.count
                peakSpeechRMS = max(peakSpeechRMS, smoothedRMS)
            }

            let speechAge = now.timeIntervalSince(speechStartedAt ?? now)
            let silenceAge = now.timeIntervalSince(lastLoudAt ?? now)
            let voicedSeconds = sampleRate > 0
                ? (Double(voicedFramesCount) / sampleRate)
                : 0
            let capturedPartial = partialTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
            if capturedPartial != partialLastSeenForStability {
                partialLastSeenForStability = capturedPartial
                partialLastChangedAt = now
            }
            debugPartialStableSeconds = currentPartialStableSeconds(
                partialLength: capturedPartial.count,
                now: now
            )
            dynamicEndSilenceSeconds = computeDynamicEndSilenceSeconds(speechAge: speechAge, now: now)
            let silenceHoldNeeded = requiredSilenceHoldSeconds(speechAge: speechAge)
            let shouldFinalizeByDuration = speechAge >= maxCaptureSeconds && voicedSeconds >= minVoicedSeconds
            let voicedRatio: Double = {
                guard speechAge > 0 else { return 0 }
                return min(max(voicedSeconds / speechAge, 0), 1)
            }()
            if onSpeechProgressSnapshot != nil,
               speechAge >= configuredMinSpeechSeconds,
               now.timeIntervalSince(lastSnapshotAt) >= snapshotIntervalSeconds {
                lastSnapshotAt = now
                let snapshotWav = makePCM16Wav(frames: utteranceFrames, sampleRate: Int(sampleRate))
                onSpeechProgressSnapshot?(snapshotWav, partialTranscript, speechAge)
            }
            let shouldFinalizeBySilence: Bool = {
                guard speechAge >= self.configuredMinSpeechSeconds, voicedSeconds >= self.minVoicedSeconds else {
                    self.silenceQualifiedSince = nil
                    return false
                }
                guard silenceAge >= self.dynamicEndSilenceSeconds else {
                    self.silenceQualifiedSince = nil
                    return false
                }
                if self.silenceQualifiedSince == nil {
                    self.silenceQualifiedSince = now
                    return false
                }
                let held = now.timeIntervalSince(self.silenceQualifiedSince ?? now)
                return held >= silenceHoldNeeded
            }()

            // Drop low-voice/noise captures instead of sending them to backend.
            if speechAge >= maxCaptureSeconds && voicedSeconds < minVoicedSeconds {
                HerLog.mic.info(
                    "VAD dropped low-voice capture speechAge=\(speechAge) voiced=\(voicedSeconds) minVoiced=\(self.minVoicedSeconds)"
                )
                utteranceFrames.removeAll(keepingCapacity: true)
                voicedFramesCount = 0
                peakSpeechRMS = 0
                speechStartedAt = nil
                lastLoudAt = nil
                silenceQualifiedSince = nil
                mode = .armedListening
                cooldownUntil = now.addingTimeInterval(0.18)
                return
            }

            if shouldFinalizeBySilence || shouldFinalizeByDuration {
                if hasPendingUtterance { return }
                hasPendingUtterance = true
                pendingRequestDeadline = now.addingTimeInterval(pendingRequestTimeoutSeconds)
                cooldownUntil = now.addingTimeInterval(retriggerCooldownSeconds)
                let partialLength = capturedPartial.count
                lastFinalTurnHints = TurnEndHints(
                    tailSilenceMs: Int((dynamicEndSilenceSeconds * 1000).rounded()),
                    vadThreshold: dynamicStartThreshold,
                    speechMs: Int((speechAge * 1000).rounded()),
                    noiseFloorRms: noiseFloorRMS,
                    speechRms: max(peakSpeechRMS, smoothedRMS),
                    voicedRatio: voicedRatio,
                    speechAgeSeconds: max(0, speechAge),
                    hasStrongPartial: partialLength >= 12 && voicedRatio >= 0.40,
                    partialStableSeconds: debugPartialStableSeconds
                )
                let wav = makePCM16Wav(frames: utteranceFrames, sampleRate: Int(sampleRate))
                mode = .assistantSpeaking
                partialTranscript = ""
                partialLastChangedAt = .distantPast
                partialLastSeenForStability = ""
                debugPartialStableSeconds = 0
                onPartialTranscript?("")
                utteranceFrames.removeAll(keepingCapacity: true)
                voicedFramesCount = 0
                peakSpeechRMS = 0
                silenceQualifiedSince = nil
                HerLog.mic.info(
                    "VAD utterance detected -> preparing file speechAge=\(speechAge) voiced=\(voicedSeconds) silenceAge=\(silenceAge) tail=\(self.dynamicEndSilenceSeconds) hold=\(silenceHoldNeeded) byDuration=\(shouldFinalizeByDuration)"
                )
                onUtteranceReady?(wav)
            }
        }
    }

    // MARK: - DSP helpers
    private static func computeRMS(buffer: AVAudioPCMBuffer) -> Float {
        guard let channelData = buffer.floatChannelData else { return 0 }
        let channel = channelData[0]
        let frameCount = Int(buffer.frameLength)
        if frameCount == 0 { return 0 }

        var sum: Float = 0
        for i in 0..<frameCount {
            let x = channel[i]
            sum += x * x
        }
        return sqrt(sum / Float(frameCount))
    }

    private static func rmsFromInt16(_ buffer: AVAudioPCMBuffer) -> Float {
        if let int16 = buffer.int16ChannelData {
            let ch0 = int16[0]
            let n = Int(buffer.frameLength)
            if n == 0 { return 0 }

            var sum: Float = 0
            for i in 0..<n {
                let x = Float(ch0[i]) / 32768.0
                sum += x * x
            }
            return sqrt(sum / Float(n))
        }

        return computeRMS(buffer: buffer)
    }

    private static func extractMonoFloats(buffer: AVAudioPCMBuffer) -> [Float] {
        let frameCount = Int(buffer.frameLength)
        guard frameCount > 0 else { return [] }

        if buffer.format.commonFormat == .pcmFormatInt16,
           let chData = buffer.int16ChannelData {

            if buffer.format.channelCount == 1 {
                let src = chData[0]
                var mono = Array(repeating: Float(0), count: frameCount)
                for i in 0..<frameCount {
                    mono[i] = Float(src[i]) / 32768.0
                }
                return mono
            }

            let channelCount = Int(buffer.format.channelCount)
            var mono = Array(repeating: Float(0), count: frameCount)
            for c in 0..<channelCount {
                let src = chData[c]
                for i in 0..<frameCount {
                    mono[i] += Float(src[i]) / 32768.0
                }
            }
            let inv = 1.0 / Float(channelCount)
            for i in 0..<frameCount { mono[i] *= inv }
            return mono
        }

        guard let chData = buffer.floatChannelData else { return [] }

        if buffer.format.channelCount == 1 {
            let src = chData[0]
            return Array(UnsafeBufferPointer(start: src, count: frameCount))
        }

        let channelCount = Int(buffer.format.channelCount)
        var mono = Array(repeating: Float(0), count: frameCount)
        for c in 0..<channelCount {
            let src = chData[c]
            for i in 0..<frameCount {
                mono[i] += src[i]
            }
        }
        let inv = 1.0 / Float(channelCount)
        for i in 0..<frameCount { mono[i] *= inv }
        return mono
    }

    private func appendToPreRoll(_ frames: [Float]) {
        let maxFrames = Int(sampleRate * preRollSeconds)
        preRollFrames.append(contentsOf: frames)
        if preRollFrames.count > maxFrames {
            preRollFrames.removeFirst(preRollFrames.count - maxFrames)
        }
    }

    private func resetAdaptiveVAD() {
        noiseFloorRMS = 0.0018
        dynamicStartThreshold = baseStartThreshold
        dynamicEndSilenceSeconds = baseEndSilenceSeconds * configuredEndSilenceScale
        smoothedRMS = 0
        lastSnapshotAt = .distantPast
        partialLastChangedAt = .distantPast
        partialLastSeenForStability = ""
        debugPartialStableSeconds = 0
        silenceQualifiedSince = nil
        voicedFramesCount = 0
        peakSpeechRMS = 0
    }

    private func updateNoiseFloor(with rms: Float) {
        guard mode != .capturingSpeech, mode != .assistantSpeaking else { return }
        let clamped = max(0.00005, min(0.05, rms))
        if clamped > (dynamicStartThreshold * 1.25) { return }
        noiseFloorRMS = (noiseFloorRMS * 0.92) + (clamped * 0.08)
    }

    private func computeDynamicStartThreshold() -> Float {
        let floorBased = max(noiseFloorRMS * 2.9, baseStartThreshold * 0.80)
        return min(max(floorBased, 0.0042), 0.022)
    }

    private func currentPartialStableSeconds(partialLength: Int, now: Date) -> TimeInterval {
        guard partialLength > 0, partialLastChangedAt != .distantPast else { return 0 }
        return max(now.timeIntervalSince(partialLastChangedAt), 0)
    }

    private func computeDynamicEndSilenceSeconds(speechAge: TimeInterval, now: Date) -> TimeInterval {
        let scale = configuredEndSilenceScale
        let noiseBoost: TimeInterval = noiseFloorRMS >= 0.0048 ? 0.22 : 0
        let voicedRatio: Double = {
            guard speechAge > 0, sampleRate > 0 else { return 0 }
            return min(
                max(Double(voicedFramesCount) / (speechAge * sampleRate), 0),
                1
            )
        }()
        let partialLength = partialTranscript
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .count
        let partialStableSeconds = currentPartialStableSeconds(partialLength: partialLength, now: now)

        if isStudioMode {
            let isCleanShortDictation =
                speechAge >= 1.2 &&
                speechAge <= 5.0 &&
                voicedRatio > 0.55 &&
                partialLength >= 8 &&
                partialStableSeconds >= partialStabilityWindowSeconds
            if isCleanShortDictation {
                return max((0.82 * scale) + noiseBoost, 0.72)
            }
        }

        if speechAge >= 16.0 {
            return max((2.70 * scale) + noiseBoost, 2.50 * scale)
        }
        if speechAge >= 10.0 {
            return max((2.35 * scale) + noiseBoost, 2.20 * scale)
        }
        if speechAge >= 5.0 {
            return max((longSpeechEndSilenceSeconds * scale) + noiseBoost, 2.35 * scale)
        }
        if speechAge >= 2.5 {
            return max(((baseEndSilenceSeconds + 0.22) * scale) + noiseBoost, 1.72 * scale)
        }
        return (baseEndSilenceSeconds * scale) + noiseBoost
    }

    private func requiredSilenceHoldSeconds(speechAge: TimeInterval) -> TimeInterval {
        if speechAge >= 10.0 { return 0.46 }
        if speechAge >= 5.0 { return 0.34 }
        return 0.26
    }

    // MARK: - WAV builder (PCM16)
    private func makePCM16Wav(frames: [Float], sampleRate: Int) -> Data {
        var pcm = [Int16](repeating: 0, count: frames.count)
        for i in 0..<frames.count {
            let clamped = max(-1.0, min(1.0, frames[i]))
            pcm[i] = Int16(clamped * Float(Int16.max))
        }

        let numChannels: Int16 = 1
        let bitsPerSample: Int16 = 16
        let byteRate = Int32(sampleRate) * Int32(numChannels) * Int32(bitsPerSample / 8)
        let blockAlign = Int16(numChannels * (bitsPerSample / 8))

        let dataSize = Int32(pcm.count * MemoryLayout<Int16>.size)
        let riffSize = Int32(36) + dataSize

        var data = Data()
        data.append(contentsOf: "RIFF".utf8)
        data.append(int32LE: riffSize)
        data.append(contentsOf: "WAVE".utf8)

        data.append(contentsOf: "fmt ".utf8)
        data.append(int32LE: 16)
        data.append(int16LE: 1)
        data.append(int16LE: numChannels)
        data.append(int32LE: Int32(sampleRate))
        data.append(int32LE: byteRate)
        data.append(int16LE: blockAlign)
        data.append(int16LE: bitsPerSample)

        data.append(contentsOf: "data".utf8)
        data.append(int32LE: dataSize)

        pcm.withUnsafeBytes { data.append(contentsOf: $0) }
        return data
    }
}

private extension Data {
    mutating func append(int16LE: Int16) {
        var v = int16LE.littleEndian
        Swift.withUnsafeBytes(of: &v) { append(contentsOf: $0) }
    }

    mutating func append(int32LE: Int32) {
        var v = int32LE.littleEndian
        Swift.withUnsafeBytes(of: &v) { append(contentsOf: $0) }
    }
}

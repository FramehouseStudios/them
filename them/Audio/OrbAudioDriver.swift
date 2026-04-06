import SwiftUI
import AVFoundation
import Combine
import os

enum OrbAudioDriverError: LocalizedError {
    case startPlaybackFailed

    var errorDescription: String? {
        switch self {
        case .startPlaybackFailed:
            return "Orb playback failed to start."
        }
    }
}

@MainActor
final class OrbAudioDriver: ObservableObject {
    @Published var isSpeaking: Bool = false
    @Published var level: CGFloat = 0.0
    @Published var isThinking: Bool = false
    @Published var thinkingLevel: CGFloat = 0.0
    @Published var isUserTalking: Bool = false
    @Published var userLevel: CGFloat = 0.0
    @Published var micSensitivity: CGFloat = 0.62
    @Published var bargeInEnabled: Bool = true
    @Published var waveform: [CGFloat] = Array(repeating: 0, count: 72)

    private var player: AVAudioPlayer?
    private var meterTimer: Timer?
    private var thinkingTimer: Timer?
    private var onFinish: (() -> Void)?
    var onBargeIn: (() -> Void)?
    private let micEngine = AVAudioEngine()
    private var isMicMonitoring = false
    private var lastBargeInAt: Date = .distantPast

    // Exposed for PlaybackSyncCursor to poll currentTime
    var currentPlayer: AVAudioPlayer? { player }

    private let meterHz: Double = 60
    private let smoothing: CGFloat = 0.18
    private let minDb: Float = -45
    private var micSmoothing: CGFloat = 0.20
    private var micNoiseFloor: Float = 0.003
    private var micPeak: Float = 0.18
    private var userTalkingThreshold: CGFloat = 0.035
    private let bargeInCooldownSec: TimeInterval = 0.40
    private let bargeInThresholdMultiplier: CGFloat = 1.18

    init() {
        setMicSensitivity(micSensitivity)
    }

    deinit {
        meterTimer?.invalidate()
        thinkingTimer?.invalidate()
        player?.stop()
        if isMicMonitoring {
            micEngine.inputNode.removeTap(onBus: 0)
            micEngine.stop()
        }
    }

    func play(url: URL, onFinish: (() -> Void)? = nil) throws {
        stopThinkingAnimation()
        stop(notifyFinish: false)

        let p = try AVAudioPlayer(contentsOf: url)
        p.isMeteringEnabled = true
        p.prepareToPlay()
        player = p
        self.onFinish = onFinish

        isSpeaking = true
        level = 0

        let ok = p.play()
        guard ok else {
            stop(notifyFinish: false)
            throw OrbAudioDriverError.startPlaybackFailed
        }
        startMetering()
    }

    func stop() {
        stop(notifyFinish: false)
    }

    func startThinkingAnimation(minDurationMs: Int = 500, maxDurationMs: Int = 900) {
        stopThinkingAnimation()
        let lower = max(0, minDurationMs)
        let upper = max(lower, maxDurationMs)
        let totalMs = Int.random(in: lower...upper)
        let start = Date()

        isThinking = true
        thinkingLevel = 0

        thinkingTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 40.0, repeats: true) { [weak self] timer in
            let elapsed = Date().timeIntervalSince(start)
            let shouldStop = elapsed * 1000.0 >= Double(totalMs)
            if shouldStop {
                timer.invalidate()
            }

            Task { @MainActor [weak self] in
                guard let self else { return }
                if shouldStop {
                    self.stopThinkingAnimation()
                    return
                }

                let phase = sin(elapsed * .pi * 2.0 / 1.15)
                let normalized = (phase + 1.0) * 0.5
                self.thinkingLevel = 0.22 + CGFloat(normalized) * 0.28
            }
        }
    }

    func stopThinkingAnimation() {
        thinkingTimer?.invalidate()
        thinkingTimer = nil
        isThinking = false
        thinkingLevel = 0
    }

    func startMicrophoneMonitoring() {
        guard !isMicMonitoring else { return }
        do {
            try configureAudioSessionForMonitoring()
            let input = micEngine.inputNode
            let format = input.outputFormat(forBus: 0)

            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                guard let self else { return }
                let raw = self.normalizedMicLevel(from: buffer)
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    if self.isSpeaking {
                        let smoothed = self.userLevel + (raw - self.userLevel) * self.micSmoothing
                        self.userLevel = smoothed
                        self.pushWaveform(max(smoothed, self.level * 0.55))

                        let speakingThreshold = max(0.012, self.userTalkingThreshold * self.bargeInThresholdMultiplier)
                        let bargeInDetected = smoothed > speakingThreshold
                        self.isUserTalking = bargeInDetected

                        if bargeInDetected && self.bargeInEnabled {
                            let now = Date()
                            let elapsed = now.timeIntervalSince(self.lastBargeInAt)
                            if elapsed >= self.bargeInCooldownSec {
                                self.lastBargeInAt = now
                                self.stop(notifyFinish: false)
                                self.onBargeIn?()
                            }
                        }
                        return
                    }
                    let smoothed = self.userLevel + (raw - self.userLevel) * self.micSmoothing
                    self.userLevel = smoothed
                    self.isUserTalking = smoothed > self.userTalkingThreshold
                    self.pushWaveform(smoothed)
                    if !self.isSpeaking && !self.isUserTalking && smoothed < 0.005 {
                        self.resetWaveformIfIdle()
                    }
                }
            }

            micEngine.prepare()
            try micEngine.start()
            isMicMonitoring = true
        } catch {
            HerLog.mic.error("Mic monitoring failed: \(error.localizedDescription)")
        }
    }

    func setMicSensitivity(_ value: CGFloat) {
        let clamped = min(max(value, 0), 1)
        micSensitivity = clamped
        micNoiseFloor = Float(lerp(0.009, 0.0015, clamped))
        micPeak = Float(lerp(0.30, 0.09, clamped))
        userTalkingThreshold = lerp(0.075, 0.018, clamped)
        micSmoothing = lerp(0.26, 0.14, clamped)
    }

    func configureBargeIn(enabled: Bool, threshold: CGFloat? = nil) {
        bargeInEnabled = enabled
        if let threshold {
            userTalkingThreshold = min(max(threshold, 0.008), 0.30)
        }
    }

    func stopMicrophoneMonitoring() {
        guard isMicMonitoring else { return }
        micEngine.inputNode.removeTap(onBus: 0)
        micEngine.stop()
        isMicMonitoring = false
        isUserTalking = false
        userLevel = 0
        resetWaveformIfIdle()
    }

    private func stop(notifyFinish: Bool) {
        meterTimer?.invalidate()
        meterTimer = nil

        player?.stop()
        player = nil

        let finish = onFinish
        onFinish = nil

        isSpeaking = false
        level = 0
        resetWaveformIfIdle()

        if notifyFinish {
            finish?()
        }
    }

    private func startMetering() {
        meterTimer?.invalidate()

        meterTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / meterHz, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                guard let p = self.player else { return }

                if !p.isPlaying {
                    self.stop(notifyFinish: true)
                    return
                }

                p.updateMeters()
                let db = p.averagePower(forChannel: 0)
                let raw = self.normalize(db: db)

                let smoothed = self.level + (raw - self.level) * self.smoothing
                self.level = smoothed

                self.pushWaveform(smoothed)
            }
        }
    }

    private func pushWaveform(_ sample: CGFloat) {
        guard !waveform.isEmpty else { return }
        waveform.removeFirst()
        waveform.append(sample)
    }

    private func resetWaveformIfIdle() {
        guard !isSpeaking, !isUserTalking else { return }
        waveform = Array(repeating: 0, count: waveform.count)
    }

    private func normalizedMicLevel(from buffer: AVAudioPCMBuffer) -> CGFloat {
        guard let channels = buffer.floatChannelData else { return 0 }
        let channelCount = max(1, Int(buffer.format.channelCount))
        let frameLength = Int(buffer.frameLength)
        guard frameLength > 0 else { return 0 }

        var channelRmsSum: Float = 0
        for channel in 0..<channelCount {
            let samples = channels[channel]
            var squareSum: Float = 0
            for i in 0..<frameLength {
                let sample = samples[i]
                squareSum += sample * sample
            }
            channelRmsSum += sqrt(squareSum / Float(frameLength))
        }

        let rms = channelRmsSum / Float(channelCount)
        let clamped = min(max(rms, micNoiseFloor), micPeak)
        let norm = (clamped - micNoiseFloor) / (micPeak - micNoiseFloor)
        return CGFloat(min(max(norm, 0), 1))
    }

    private func configureAudioSessionForMonitoring() throws {
#if os(iOS)
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.defaultToSpeaker, .allowBluetoothHFP, .allowBluetoothA2DP]
        )
        try session.setActive(true)
#endif
    }

    private func lerp(_ a: CGFloat, _ b: CGFloat, _ t: CGFloat) -> CGFloat {
        a + (b - a) * t
    }

    private func normalize(db: Float) -> CGFloat {
        let clamped = max(minDb, db)
        let norm = (clamped - minDb) / (0 - minDb)
        return CGFloat(min(max(norm, 0), 1))
    }
}

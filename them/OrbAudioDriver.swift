#if false
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
    // Public state your UI will bind to
    @Published var isSpeaking: Bool = false
    @Published var level: CGFloat = 0.0 // 0...1 (smoothed)
    @Published var waveform: [CGFloat] = Array(repeating: 0, count: 72) // ring buffer

    private var player: AVAudioPlayer?
    private var meterTimer: Timer?
    private var introFadeTimer: Timer?
    private var introStartWorkItem: DispatchWorkItem?
    private var onFinish: (() -> Void)?

    // Tuning
    private let meterHz: Double = 60
    private let smoothing: CGFloat = 0.18 // higher = snappier, lower = smoother
    private let minDb: Float = -45 // treat anything below as silence floor
    private var micSensitivity: CGFloat = 0.62
    private let preSpeechSilenceSeconds: TimeInterval = 0.180
    private let introFadeSeconds: TimeInterval = 0.080
    private let introStartGainDb: Float = -4.5 // in the requested 3-6dB window

    private var introStartVolume: Float {
        let linear = powf(10.0, introStartGainDb / 20.0)
        return max(0.0, min(1.0, linear))
    }

    deinit {
        meterTimer?.invalidate()
        introFadeTimer?.invalidate()
        introStartWorkItem?.cancel()
        player?.stop()
    }

    func play(url: URL, onFinish: (() -> Void)? = nil) throws {
        stop(notifyFinish: false) // stop any existing playback cleanly
        preparePlaybackSessionIfSupported()

        let exists = FileManager.default.fileExists(atPath: url.path)
        let bytes = (try? Data(contentsOf: url, options: .mappedIfSafe).count) ?? -1
        HerLog.audio.info("orb play input exists=\(exists) bytes=\(bytes) path=\(url.lastPathComponent, privacy: .public)")

        let p = try AVAudioPlayer(contentsOf: url)
        p.isMeteringEnabled = true
        p.enableRate = true
        p.rate = Float(ClementineVoiceSettings.voiceSpeed())
        p.prepareToPlay()
        player = p
        self.onFinish = onFinish

        isSpeaking = true
        level = 0
        p.volume = 0.0

        let ok = p.play()
        HerLog.audio.info("orb playReturned=\(ok) isPlaying=\(p.isPlaying) volume=\(p.volume)")
        guard ok else {
            stop(notifyFinish: false)
            throw OrbAudioDriverError.startPlaybackFailed
        }
        startMetering()
        startSpeechEntranceEnvelope()
    }

    func stop() {
        stop(notifyFinish: false)
    }

    // Compatibility shims for legacy callers still wired through AppShell.
    func setMicSensitivity(_ value: CGFloat) {
        micSensitivity = min(max(value, 0), 1)
    }

    func startMicrophoneMonitoring() {
        // No-op: live mic metering is owned by HerVoiceController in current flow.
    }

    func stopMicrophoneMonitoring() {
        // No-op: live mic metering is owned by HerVoiceController in current flow.
    }

    private func stop(notifyFinish: Bool) {
        meterTimer?.invalidate()
        meterTimer = nil
        introFadeTimer?.invalidate()
        introFadeTimer = nil
        introStartWorkItem?.cancel()
        introStartWorkItem = nil

        if let player, player.isPlaying {
            HerLog.audio.info("orb stop() stopped active playback")
        }
        player?.stop()
        player = nil

        let finish = onFinish
        onFinish = nil

        isSpeaking = false
        level = 0
        waveform = Array(repeating: 0, count: waveform.count)

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
                let db = p.averagePower(forChannel: 0) // -160...0
                let raw = self.normalize(db: db) // 0...1

                // Smooth (EMA)
                let smoothed = self.level + (raw - self.level) * self.smoothing
                self.level = smoothed

                // Push into waveform ring (scrolling history)
                if !self.waveform.isEmpty {
                    self.waveform.removeFirst()
                    self.waveform.append(smoothed)
                }
            }
        }
    }

    private func startSpeechEntranceEnvelope() {
        introFadeTimer?.invalidate()
        introFadeTimer = nil
        introStartWorkItem?.cancel()

        let startVolume = introStartVolume
        let workItem = DispatchWorkItem { [weak self] in
            Task { @MainActor [weak self] in
                guard let self, let player = self.player, player.isPlaying else { return }
                player.volume = startVolume
                self.startIntroFadeIn(duration: self.introFadeSeconds)
            }
        }
        introStartWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + preSpeechSilenceSeconds, execute: workItem)
    }

    private func startIntroFadeIn(duration: TimeInterval) {
        guard let player else { return }
        guard duration > 0 else {
            player.volume = 1.0
            return
        }

        introFadeTimer?.invalidate()

        let steps = 6
        let stepDuration = duration / Double(steps)
        let fromVolume = max(0.0, min(1.0, player.volume))
        var currentStep = 0

        let timer = Timer.scheduledTimer(withTimeInterval: stepDuration, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                guard let player = self.player, player.isPlaying else {
                    self.introFadeTimer?.invalidate()
                    self.introFadeTimer = nil
                    return
                }
                currentStep += 1
                let progress = min(Double(currentStep) / Double(steps), 1.0)
                let next = fromVolume + (Float(progress) * (1.0 - fromVolume))
                player.volume = max(0.0, min(1.0, next))
                if progress >= 1.0 {
                    self.introFadeTimer?.invalidate()
                    self.introFadeTimer = nil
                }
            }
        }
        timer.tolerance = stepDuration * 0.25
        RunLoop.main.add(timer, forMode: .common)
        introFadeTimer = timer
    }

    private func preparePlaybackSessionIfSupported() {
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
                "orb playback session inputs=\(inputs, privacy: .public) outputs=\(outputs, privacy: .public) volume=\(volume)"
            )
        } catch {
            HerLog.audio.error("orb playback session error=\(error.localizedDescription, privacy: .public)")
        }
        #endif
    }

    private func normalize(db: Float) -> CGFloat {
        // Clamp to a floor so low noise doesn't jitter
        let clamped = max(minDb, db)
        // Map [minDb..0] -> [0..1]
        let norm = (clamped - minDb) / (0 - minDb)
        return CGFloat(min(max(norm, 0), 1))
    }
}
#endif


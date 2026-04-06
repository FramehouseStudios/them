import Foundation
import Combine
import AVFoundation
import os
#if os(macOS)
import AppKit
#endif

enum AudioPlayerError: LocalizedError {
    case startPlaybackFailed

    var errorDescription: String? {
        switch self {
        case .startPlaybackFailed:
            return "Audio playback failed to start."
        }
    }
}

final class AudioPlayer: NSObject, ObservableObject, AVAudioPlayerDelegate {

    @Published private(set) var playbackLevel: Float = 0

    private var player: AVAudioPlayer?
    private var onFinish: (() -> Void)?
    private var fadeTimer: Timer?
    private var levelTimer: Timer?
    private var smoothedPlaybackLevel: Float = 0
    #if os(macOS)
    private var macSound: NSSound?
    #endif

    private let meterFloorDb: Float = -60
    private let meterInterval: TimeInterval = 1.0 / 30.0
    private let meterAttack: Float = 0.30
    private let meterRelease: Float = 0.10
    private let idleReleaseMultiplier: Float = 0.88

    deinit {
        fadeTimer?.invalidate()
        fadeTimer = nil
        invalidateLevelTimer()
    }

    func play(
        url: URL,
        fadeInDuration: TimeInterval = 0.0,
        startDelay: TimeInterval = 0.03,
        onStart: (() -> Void)? = nil,
        onFinish: (() -> Void)? = nil
    ) throws {
        #if os(macOS)
        try playOnMac(
            url: url,
            startDelay: startDelay,
            onStart: onStart,
            onFinish: onFinish
        )
        #else
        do {
            stop()
            self.onFinish = onFinish
            preparePlaybackSessionIfSupported()

            let exists = FileManager.default.fileExists(atPath: url.path)
            let bytes = (try? Data(contentsOf: url, options: .mappedIfSafe).count) ?? -1
            HerLog.audio.info("play input exists=\(exists) bytes=\(bytes) path=\(url.lastPathComponent, privacy: .public)")

            let nextPlayer = try AVAudioPlayer(contentsOf: url)
            nextPlayer.delegate = self
            nextPlayer.volume = fadeInDuration > 0 ? 0.0 : 1.0
            nextPlayer.isMeteringEnabled = true
            nextPlayer.prepareToPlay()
            HerLog.audio.info("decoded duration=\(nextPlayer.duration)")

            let ok = nextPlayer.play()
            HerLog.audio.info("playReturned=\(ok) isPlaying=\(nextPlayer.isPlaying) volume=\(nextPlayer.volume)")
            guard ok else {
                throw AudioPlayerError.startPlaybackFailed
            }

            player = nextPlayer
            smoothedPlaybackLevel = 0
            playbackLevel = 0
            startLevelMetering()
            startFadeIn(duration: fadeInDuration)

            let delay = max(0, startDelay)
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                onStart?()
            }
        } catch {
            HerLog.audio.error("error=\(error.localizedDescription, privacy: .public)")
            self.player = nil
            #if os(macOS)
            self.macSound = nil
            #endif
            self.onFinish = nil
            self.playbackLevel = 0
            self.smoothedPlaybackLevel = 0
            invalidateLevelTimer()
            throw error
        }
        #endif
    }

    func stop() {
        if let p = player, p.isPlaying {
            p.stop()
            HerLog.audio.info("stop() stopped active playback")
        }
        #if os(macOS)
        if let sound = macSound, sound.isPlaying {
            sound.stop()
            HerLog.audio.info("stop() stopped active mac playback")
        }
        macSound = nil
        #endif

        fadeTimer?.invalidate()
        fadeTimer = nil
        player = nil
        onFinish = nil

        beginLevelRelease()
    }

    func isPlaying() -> Bool {
        #if os(macOS)
        if let sound = macSound {
            return sound.isPlaying
        }
        #endif
        return player?.isPlaying ?? false
    }

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        DispatchQueue.main.async { [weak self] in
            HerLog.audio.info("audioPlayerDidFinishPlaying success=\(flag)")
            self?.onFinish?()
            self?.onFinish = nil
            self?.fadeTimer?.invalidate()
            self?.fadeTimer = nil
            self?.player = nil
            self?.beginLevelRelease()
        }
    }

    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        DispatchQueue.main.async { [weak self] in
            let message = error?.localizedDescription ?? "unknown"
            HerLog.audio.error("decodeError=\(message, privacy: .public)")
            self?.onFinish?()
            self?.onFinish = nil
            self?.fadeTimer?.invalidate()
            self?.fadeTimer = nil
            self?.player = nil
            self?.beginLevelRelease()
        }
    }

    private func preparePlaybackSessionIfSupported() {
        #if os(iOS)
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(
                .playback,
                mode: .spokenAudio,
                options: [.allowAirPlay, .allowBluetoothA2DP]
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
                "playback session inputs=\(inputs, privacy: .public) outputs=\(outputs, privacy: .public) volume=\(volume)"
            )
        } catch {
            HerLog.audio.error("session prepare error=\(error.localizedDescription, privacy: .public)")
        }
        #endif
    }

    private func startFadeIn(duration: TimeInterval) {
        guard duration > 0 else {
            player?.volume = 1.0
            return
        }

        fadeTimer?.invalidate()

        let steps = 20
        let stepDuration = duration / Double(steps)
        var currentStep = 0

        fadeTimer = Timer.scheduledTimer(withTimeInterval: stepDuration, repeats: true) { [weak self] timer in
            guard let self, let player = self.player else {
                timer.invalidate()
                return
            }

            currentStep += 1
            let progress = min(Double(currentStep) / Double(steps), 1.0)
            player.volume = Float(progress)

            if progress >= 1.0 {
                timer.invalidate()
            }
        }
    }

    private func startLevelMetering() {
        invalidateLevelTimer()

        let timer = Timer.scheduledTimer(withTimeInterval: meterInterval, repeats: true) { [weak self] _ in
            self?.samplePlaybackLevel()
        }
        timer.tolerance = meterInterval * 0.25
        RunLoop.main.add(timer, forMode: .common)
        levelTimer = timer
    }

    private func beginLevelRelease() {
        if levelTimer == nil {
            let timer = Timer.scheduledTimer(withTimeInterval: meterInterval, repeats: true) { [weak self] _ in
                self?.samplePlaybackLevel()
            }
            timer.tolerance = meterInterval * 0.25
            RunLoop.main.add(timer, forMode: .common)
            levelTimer = timer
        }
    }

    private func invalidateLevelTimer() {
        levelTimer?.invalidate()
        levelTimer = nil
    }

    private func samplePlaybackLevel() {
        #if os(macOS)
        if let sound = macSound, sound.isPlaying {
            let target: Float = 0.24
            let coeff = target > smoothedPlaybackLevel ? meterAttack : meterRelease
            smoothedPlaybackLevel += (target - smoothedPlaybackLevel) * coeff
            playbackLevel = smoothedPlaybackLevel
            return
        }
        #endif

        if let player, player.isPlaying {
            player.updateMeters()
            let power = max(meterFloorDb, player.averagePower(forChannel: 0))
            let linear = pow(10, power / 20)
            let target = max(0, min(1, linear))

            let coeff = target > smoothedPlaybackLevel ? meterAttack : meterRelease
            smoothedPlaybackLevel += (target - smoothedPlaybackLevel) * coeff
            playbackLevel = smoothedPlaybackLevel
            return
        }

        smoothedPlaybackLevel *= idleReleaseMultiplier
        if smoothedPlaybackLevel < 0.0008 {
            smoothedPlaybackLevel = 0
            playbackLevel = 0
            invalidateLevelTimer()
        } else {
            playbackLevel = smoothedPlaybackLevel
        }
    }

    #if os(macOS)
    private func playOnMac(
        url: URL,
        startDelay: TimeInterval,
        onStart: (() -> Void)?,
        onFinish: (() -> Void)?
    ) throws {
        stop()
        self.onFinish = onFinish

        let exists = FileManager.default.fileExists(atPath: url.path)
        let bytes = (try? Data(contentsOf: url, options: .mappedIfSafe).count) ?? -1
        HerLog.audio.info("mac play input exists=\(exists) bytes=\(bytes) path=\(url.lastPathComponent, privacy: .public)")

        guard let sound = NSSound(contentsOf: url, byReference: false) else {
            throw AudioPlayerError.startPlaybackFailed
        }
        sound.delegate = self
        sound.volume = 1.0
        let ok = sound.play()
        HerLog.audio.info("mac playReturned=\(ok) isPlaying=\(sound.isPlaying) volume=\(sound.volume)")
        guard ok else {
            throw AudioPlayerError.startPlaybackFailed
        }

        macSound = sound
        smoothedPlaybackLevel = 0
        playbackLevel = 0
        beginLevelRelease()

        let delay = max(0, startDelay)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            onStart?()
        }
    }
    #endif
}

#if os(macOS)
extension AudioPlayer: NSSoundDelegate {
    func sound(_ sound: NSSound, didFinishPlaying aBool: Bool) {
        DispatchQueue.main.async { [weak self] in
            HerLog.audio.info("nssoundDidFinish success=\(aBool)")
            self?.onFinish?()
            self?.onFinish = nil
            self?.fadeTimer?.invalidate()
            self?.fadeTimer = nil
            self?.macSound = nil
            self?.beginLevelRelease()
        }
    }
}
#endif

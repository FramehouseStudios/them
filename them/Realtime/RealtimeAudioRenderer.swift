import Foundation
import AVFoundation
import Combine
import os

@MainActor
final class RealtimeAudioRenderer: ObservableObject {
    @Published private(set) var isPlaying: Bool = false
    @Published private(set) var currentPlaybackTime: TimeInterval = 0
    @Published private(set) var level: CGFloat = 0

    private var audioEngine: AVAudioEngine?
    private var playerNode: AVAudioPlayerNode?
    private var totalSamplesScheduled: Int64 = 0
    private var sampleRate: Double = 24000 // OpenAI Realtime default
    private var levelTimer: Timer?

    var onPlaybackFinished: (() -> Void)?

    func start(sampleRate: Double = 24000) {
        stop()
        self.sampleRate = sampleRate

        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        engine.attach(player)

        let format = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: sampleRate,
            channels: 1,
            interleaved: true
        )!

        engine.connect(player, to: engine.mainMixerNode, format: format)

        do {
            #if os(iOS)
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .voiceChat,
                                    options: [.defaultToSpeaker])
            try session.setActive(true)
            #endif

            try engine.start()
            player.play()

            audioEngine = engine
            playerNode = player
            isPlaying = true
            totalSamplesScheduled = 0
            currentPlaybackTime = 0

            startLevelTimer()

            HerLog.audio.info("Realtime audio renderer started")
        } catch {
            HerLog.audio.error("Failed to start audio renderer: \(error.localizedDescription)")
        }
    }

    func enqueueChunk(_ pcmData: Data) {
        guard let playerNode, let audioEngine, audioEngine.isRunning else { return }

        let format = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: sampleRate,
            channels: 1,
            interleaved: true
        )!

        let frameCount = AVAudioFrameCount(pcmData.count / 2) // 16-bit = 2 bytes per sample
        guard frameCount > 0 else { return }

        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { return }
        buffer.frameLength = frameCount

        pcmData.withUnsafeBytes { rawBytes in
            if let baseAddress = rawBytes.baseAddress {
                memcpy(buffer.int16ChannelData![0], baseAddress, pcmData.count)
            }
        }

        // Compute RMS for level metering
        let rms = computeRMS(buffer)
        level = CGFloat(min(rms * 4.0, 1.0))

        totalSamplesScheduled += Int64(frameCount)
        playerNode.scheduleBuffer(buffer)
    }

    func stop() {
        levelTimer?.invalidate()
        levelTimer = nil
        playerNode?.stop()
        audioEngine?.stop()
        audioEngine = nil
        playerNode = nil
        isPlaying = false
        level = 0
        currentPlaybackTime = 0
        totalSamplesScheduled = 0
    }

    func markFinished() {
        // Wait for buffers to drain, then signal completion
        guard let playerNode else {
            stop()
            return
        }

        playerNode.scheduleBuffer(
            AVAudioPCMBuffer(
                pcmFormat: AVAudioFormat(
                    commonFormat: .pcmFormatInt16,
                    sampleRate: sampleRate,
                    channels: 1,
                    interleaved: true
                )!,
                frameCapacity: 1
            )!
        ) { [weak self] in
            Task { @MainActor [weak self] in
                self?.stop()
                self?.onPlaybackFinished?()
            }
        }
    }

    // MARK: - Private

    private func startLevelTimer() {
        levelTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, let playerNode = self.playerNode else { return }

                if let nodeTime = playerNode.lastRenderTime,
                   let playerTime = playerNode.playerTime(forNodeTime: nodeTime) {
                    self.currentPlaybackTime = Double(playerTime.sampleTime) / playerTime.sampleRate
                }
            }
        }
    }

    private func computeRMS(_ buffer: AVAudioPCMBuffer) -> Float {
        guard let channelData = buffer.int16ChannelData else { return 0 }
        let count = Int(buffer.frameLength)
        guard count > 0 else { return 0 }

        var squareSum: Float = 0
        for i in 0..<count {
            let sample = Float(channelData[0][i]) / 32768.0
            squareSum += sample * sample
        }
        return sqrt(squareSum / Float(count))
    }
}

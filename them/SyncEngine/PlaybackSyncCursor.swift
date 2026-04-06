import Foundation
import AVFoundation
import Combine

@MainActor
final class PlaybackSyncCursor: ObservableObject {
    @Published private(set) var revealedWordCount: Int = 0
    @Published private(set) var isComplete: Bool = false
    @Published private(set) var currentLineIndex: Int = 0

    private var timeline: WordTimeline?
    private var displayLink: Any?
    private var timer: Timer?
    private weak var player: AVAudioPlayer?

    func start(timeline: WordTimeline, player: AVAudioPlayer) {
        stop()
        self.timeline = timeline
        self.player = player
        revealedWordCount = 0
        isComplete = false
        currentLineIndex = 0

        #if os(iOS) || os(visionOS)
        startDisplayLink()
        #else
        startTimer()
        #endif
    }

    func stop() {
        #if os(iOS) || os(visionOS)
        stopDisplayLink()
        #else
        timer?.invalidate()
        timer = nil
        #endif
        timeline = nil
        player = nil
    }

    func revealAll() {
        guard let timeline else { return }
        revealedWordCount = timeline.entries.count
        isComplete = true
        if let last = timeline.entries.last {
            currentLineIndex = last.lineIndex
        }
        stop()
    }

    private func tick() {
        guard let timeline, let player else {
            revealAll()
            return
        }

        if !player.isPlaying && revealedWordCount > 0 {
            revealAll()
            return
        }

        let time = player.currentTime
        let count = timeline.revealedCountAt(time: time)

        if count != revealedWordCount {
            revealedWordCount = count
            if count > 0, count <= timeline.entries.count {
                currentLineIndex = timeline.entries[count - 1].lineIndex
            }
        }

        if count >= timeline.entries.count {
            isComplete = true
        }
    }

    // MARK: - iOS Display Link

    #if os(iOS) || os(visionOS)
    private func startDisplayLink() {
        let link = CADisplayLink(target: DisplayLinkTarget { [weak self] in
            Task { @MainActor [weak self] in
                self?.tick()
            }
        }, selector: #selector(DisplayLinkTarget.step))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    private func stopDisplayLink() {
        (displayLink as? CADisplayLink)?.invalidate()
        displayLink = nil
    }
    #endif

    // MARK: - macOS Timer fallback

    #if os(macOS)
    private func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.tick()
            }
        }
    }
    #endif
}

// CADisplayLink requires an ObjC-compatible target
#if os(iOS) || os(visionOS)
private final class DisplayLinkTarget: NSObject {
    let callback: () -> Void
    init(_ callback: @escaping () -> Void) { self.callback = callback }
    @objc func step() { callback() }
}
#endif

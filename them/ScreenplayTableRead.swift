import AVFoundation
import Combine
import Foundation
import os
import ScreenplayStudio
import SwiftUI
#if os(iOS)
import MediaPlayer
#endif

enum ScreenplayTableReadRole: Equatable {
    case narrator
    case character(String)

    var displayName: String {
        switch self {
        case .narrator:
            return "Narrator"
        case .character(let name):
            return name
        }
    }
}

struct ScreenplayTableReadLine: Identifiable, Equatable {
    let id: Int
    let sourceLine: Int
    let page: Int
    let element: ScreenplayEditorElement
    let role: ScreenplayTableReadRole
    let displayText: String
    let spokenText: String

    var wordCount: Int {
        spokenText.split(whereSeparator: { $0.isWhitespace }).count
    }
}

enum ScreenplayTableReadParser {
    static let standardLinesPerPage = 55

    static func lines(from draft: String) -> [ScreenplayTableReadLine] {
        let normalized = draft
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let rawLines = normalized.components(separatedBy: "\n")
        let elements = ScreenplayEditorElement.inferredSequence(for: normalized)
        var speaker = ""
        var result: [ScreenplayTableReadLine] = []

        for index in rawLines.indices {
            let text = rawLines[index].trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty, elements.indices.contains(index), let element = elements[index] else {
                continue
            }

            let characterName = normalizedCharacterName(text)
            if element == .character || isQualifiedCharacterCue(text, normalizedName: characterName) {
                speaker = characterName
                continue
            }
            if element == .parenthetical {
                continue
            }

            let role: ScreenplayTableReadRole
            if element == .dialogue, !speaker.isEmpty {
                role = .character(speaker)
            } else {
                role = .narrator
            }
            let spoken = spokenText(for: text, element: element)
            guard !spoken.isEmpty else { continue }
            result.append(
                ScreenplayTableReadLine(
                    id: result.count,
                    sourceLine: index + 1,
                    page: (index / standardLinesPerPage) + 1,
                    element: element,
                    role: role,
                    displayText: text,
                    spokenText: spoken
                )
            )
        }
        return result
    }

    static func normalizedCharacterName(_ cue: String) -> String {
        var name = cue.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.hasSuffix("^") {
            name.removeLast()
            name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        name = name.replacingOccurrences(
            of: #"\s*\((?:V\.O\.|O\.S\.|O\.C\.|CONT'D|CONTINUED)\)\s*$"#,
            with: "",
            options: [.regularExpression, .caseInsensitive]
        )
        return name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func isQualifiedCharacterCue(_ cue: String, normalizedName: String? = nil) -> Bool {
        let cleanName = normalizedName ?? normalizedCharacterName(cue)
        guard cleanName != cue.trimmingCharacters(in: .whitespacesAndNewlines),
              ScreenplayEditorElement.looksLikeCharacterCue(cleanName) else {
            return false
        }
        return true
    }

    static func spokenText(for text: String, element: ScreenplayEditorElement) -> String {
        switch element {
        case .sceneHeading:
            return text
                .replacingOccurrences(of: "INT./EXT.", with: "Interior exterior", options: .caseInsensitive)
                .replacingOccurrences(of: "EXT./INT.", with: "Exterior interior", options: .caseInsensitive)
                .replacingOccurrences(of: "INT/EXT.", with: "Interior exterior", options: .caseInsensitive)
                .replacingOccurrences(of: "EXT/INT.", with: "Exterior interior", options: .caseInsensitive)
                .replacingOccurrences(of: "INT.", with: "Interior", options: .caseInsensitive)
                .replacingOccurrences(of: "EXT.", with: "Exterior", options: .caseInsensitive)
                .replacingOccurrences(of: " - ", with: ", ")
        case .transition:
            return text
                .replacingOccurrences(of: ":", with: ".")
                .capitalized
        default:
            return text
        }
    }
}

struct ScreenplayTableReadCheckpoint: Codable, Equatable {
    let lineIndex: Int
    let speed: Double
}

enum ScreenplayTableReadResumeStore {
    static let storageKey = "them.table-read.checkpoints.v1"

    static func load(projectID: String, defaults: UserDefaults = .standard) -> ScreenplayTableReadCheckpoint? {
        guard !projectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let data = defaults.data(forKey: storageKey),
              let checkpoints = try? JSONDecoder().decode([String: ScreenplayTableReadCheckpoint].self, from: data) else {
            return nil
        }
        return checkpoints[projectID]
    }

    static func save(
        _ checkpoint: ScreenplayTableReadCheckpoint,
        projectID: String,
        defaults: UserDefaults = .standard
    ) {
        let cleanProjectID = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanProjectID.isEmpty else { return }
        var checkpoints: [String: ScreenplayTableReadCheckpoint] = [:]
        if let data = defaults.data(forKey: storageKey),
           let decoded = try? JSONDecoder().decode([String: ScreenplayTableReadCheckpoint].self, from: data) {
            checkpoints = decoded
        }
        checkpoints[cleanProjectID] = checkpoint
        guard let encoded = try? JSONEncoder().encode(checkpoints) else { return }
        defaults.set(encoded, forKey: storageKey)
    }
}

@MainActor
final class ScreenplayTableReadPlayer: NSObject, ObservableObject, @preconcurrency AVSpeechSynthesizerDelegate {
    enum PlaybackState: Equatable {
        case idle
        case playing
        case paused
        case finished
    }

    static let supportedSpeeds: [Double] = [0.8, 1.0, 1.25, 1.5]

    nonisolated static func speedLabel(_ speed: Double) -> String {
        switch speed {
        case 0.8: "0.8×"
        case 1.0: "1×"
        case 1.25: "1.25×"
        case 1.5: "1.5×"
        default: "\(speed.formatted(.number.precision(.fractionLength(0...2))))×"
        }
    }

    @Published private(set) var lines: [ScreenplayTableReadLine] = []
    @Published private(set) var currentIndex = 0
    @Published private(set) var state: PlaybackState = .idle
    @Published private(set) var activeWordRange: NSRange?
    @Published var speed = 1.0 {
        didSet {
            speed = Self.supportedSpeeds.min(by: { abs($0 - speed) < abs($1 - speed) }) ?? 1.0
            persistCheckpoint()
            publishNowPlaying()
        }
    }

    private let synthesizer = AVSpeechSynthesizer()
    private var currentUtterance: AVSpeechUtterance?
    private var projectID = ""
    private var title = "Untitled Screenplay"
    private var draftSignature = ""
    private var characterVoiceNames: [String: String] = [:]
    private var interruptionObserver: NSObjectProtocol?
    #if os(iOS)
    private var remoteCommandTargets: [(MPRemoteCommand, Any)] = []
    #endif

    override init() {
        super.init()
        synthesizer.delegate = self
        observeInterruptions()
    }

    deinit {
        if let interruptionObserver {
            NotificationCenter.default.removeObserver(interruptionObserver)
        }
        #if os(iOS)
        for (command, target) in remoteCommandTargets {
            command.removeTarget(target)
        }
        #endif
    }

    var currentLine: ScreenplayTableReadLine? {
        guard lines.indices.contains(currentIndex) else { return nil }
        return lines[currentIndex]
    }

    var progress: Double {
        guard !lines.isEmpty else { return 0 }
        if state == .finished { return 1 }
        return Double(currentIndex) / Double(lines.count)
    }

    var estimatedDuration: TimeInterval {
        let words = lines.reduce(0) { $0 + $1.wordCount }
        return (Double(words) / 150.0) * 60.0 / speed
    }

    func load(draft: String, title: String, projectID: String) {
        let signature = "\(projectID)|\(draft)"
        guard signature != draftSignature else { return }
        stop(clearNowPlaying: false)
        self.projectID = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        self.title = title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "Untitled Screenplay"
            : title.trimmingCharacters(in: .whitespacesAndNewlines)
        draftSignature = signature
        lines = ScreenplayTableReadParser.lines(from: draft)
        characterVoiceNames = buildCharacterVoiceMap(for: lines)
        if let checkpoint = ScreenplayTableReadResumeStore.load(projectID: self.projectID) {
            currentIndex = min(max(0, checkpoint.lineIndex), max(0, lines.count - 1))
            speed = checkpoint.speed
        } else {
            currentIndex = 0
        }
        state = lines.isEmpty ? .idle : .paused
        publishNowPlaying()
    }

    func togglePlayback() {
        switch state {
        case .playing:
            pause()
        case .paused:
            resume()
        case .finished:
            currentIndex = 0
            playCurrentLine()
        case .idle:
            guard !lines.isEmpty else { return }
            playCurrentLine()
        }
    }

    func pause() {
        guard state == .playing else { return }
        if synthesizer.pauseSpeaking(at: .word) {
            state = .paused
            persistCheckpoint()
            publishNowPlaying()
        }
    }

    func resume() {
        guard !lines.isEmpty else { return }
        if synthesizer.isPaused, synthesizer.continueSpeaking() {
            state = .playing
            publishNowPlaying()
            return
        }
        playCurrentLine()
    }

    func previousLine() {
        guard currentIndex > 0 else { return }
        jump(to: currentIndex - 1, continuePlaying: state == .playing)
    }

    func nextLine() {
        guard currentIndex + 1 < lines.count else { return }
        jump(to: currentIndex + 1, continuePlaying: state == .playing)
    }

    func jump(to index: Int, continuePlaying: Bool? = nil) {
        guard lines.indices.contains(index) else { return }
        let shouldPlay = continuePlaying ?? (state == .playing)
        cancelCurrentUtterance()
        currentIndex = index
        state = shouldPlay ? .playing : .paused
        activeWordRange = nil
        persistCheckpoint()
        publishNowPlaying()
        if shouldPlay {
            playCurrentLine()
        }
    }

    func stop(clearNowPlaying: Bool = true) {
        cancelCurrentUtterance()
        state = lines.isEmpty ? .idle : .paused
        activeWordRange = nil
        persistCheckpoint()
        if clearNowPlaying {
            clearPublishedPlayback()
        } else {
            publishNowPlaying()
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        guard utterance === currentUtterance else { return }
        state = .playing
        publishNowPlaying()
    }

    func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        willSpeakRangeOfSpeechString characterRange: NSRange,
        utterance: AVSpeechUtterance
    ) {
        guard utterance === currentUtterance else { return }
        activeWordRange = characterRange
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didPause utterance: AVSpeechUtterance) {
        guard utterance === currentUtterance else { return }
        state = .paused
        persistCheckpoint()
        publishNowPlaying()
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didContinue utterance: AVSpeechUtterance) {
        guard utterance === currentUtterance else { return }
        state = .playing
        publishNowPlaying()
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        guard utterance === currentUtterance else { return }
        currentUtterance = nil
        activeWordRange = nil
        if currentIndex + 1 < lines.count {
            currentIndex += 1
            persistCheckpoint()
            playCurrentLine()
        } else {
            state = .finished
            persistCheckpoint()
            publishNowPlaying()
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        guard utterance === currentUtterance else { return }
        currentUtterance = nil
        activeWordRange = nil
    }

    private func playCurrentLine() {
        guard let line = currentLine else { return }
        activatePlaybackSession()
        cancelCurrentUtterance()
        let utterance = AVSpeechUtterance(string: line.spokenText)
        utterance.rate = min(
            max(AVSpeechUtteranceDefaultSpeechRate * Float(speed), 0.35),
            0.72
        )
        utterance.voice = voice(for: line)
        if case .narrator = line.role {
            utterance.pitchMultiplier = 0.98
        }
        currentUtterance = utterance
        state = .playing
        persistCheckpoint()
        publishNowPlaying()
        synthesizer.speak(utterance)
    }

    private func cancelCurrentUtterance() {
        currentUtterance = nil
        if synthesizer.isSpeaking || synthesizer.isPaused {
            synthesizer.stopSpeaking(at: .immediate)
        }
    }

    private func voice(for line: ScreenplayTableReadLine) -> AVSpeechSynthesisVoice? {
        switch line.role {
        case .narrator:
            return AVSpeechSynthesisVoice(language: "en-US")
        case .character(let name):
            guard let identifier = characterVoiceNames[name] else {
                return AVSpeechSynthesisVoice(language: "en-US")
            }
            return AVSpeechSynthesisVoice(identifier: identifier)
        }
    }

    private func buildCharacterVoiceMap(for lines: [ScreenplayTableReadLine]) -> [String: String] {
        let voices = AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.lowercased().hasPrefix("en") }
            .sorted { $0.identifier < $1.identifier }
        guard !voices.isEmpty else { return [:] }
        var names: [String] = []
        for line in lines {
            guard case .character(let name) = line.role, !names.contains(name) else { continue }
            names.append(name)
        }
        return Dictionary(uniqueKeysWithValues: names.enumerated().map { index, name in
            (name, voices[index % voices.count].identifier)
        })
    }

    private func persistCheckpoint() {
        guard !projectID.isEmpty, !lines.isEmpty else { return }
        ScreenplayTableReadResumeStore.save(
            ScreenplayTableReadCheckpoint(lineIndex: currentIndex, speed: speed),
            projectID: projectID
        )
    }

    private func observeInterruptions() {
        #if os(iOS)
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] notification in
            guard let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt else {
                return
            }
            Task { @MainActor [weak self] in
                guard let self,
                      let type = AVAudioSession.InterruptionType(rawValue: rawType) else { return }
                if type == .began {
                    self.state = .paused
                    self.persistCheckpoint()
                    self.publishNowPlaying()
                }
            }
        }
        #endif
    }

    private func activatePlaybackSession() {
        #if os(iOS)
        configureRemoteCommands()
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio, options: [])
            try session.setActive(true)
        } catch {
            HerLog.audio.error("table read audio session error=\(error.localizedDescription, privacy: .public)")
        }
        #endif
    }

    private func configureRemoteCommands() {
        #if os(iOS)
        guard remoteCommandTargets.isEmpty else { return }
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.isEnabled = true
        center.pauseCommand.isEnabled = true
        center.togglePlayPauseCommand.isEnabled = true
        center.nextTrackCommand.isEnabled = true
        center.previousTrackCommand.isEnabled = true

        remoteCommandTargets.append((center.playCommand, center.playCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.resume() }
            return .success
        }))
        remoteCommandTargets.append((center.pauseCommand, center.pauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.pause() }
            return .success
        }))
        remoteCommandTargets.append((center.togglePlayPauseCommand, center.togglePlayPauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.togglePlayback() }
            return .success
        }))
        remoteCommandTargets.append((center.nextTrackCommand, center.nextTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.nextLine() }
            return .success
        }))
        remoteCommandTargets.append((center.previousTrackCommand, center.previousTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.previousLine() }
            return .success
        }))
        #endif
    }

    private func publishNowPlaying() {
        #if os(iOS)
        guard let line = currentLine else {
            clearPublishedPlayback()
            return
        }
        let elapsed = estimatedDuration * progress
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyAlbumTitle: "THEM Table Read",
            MPMediaItemPropertyArtist: "\(line.role.displayName) · Page \(line.page)",
            MPMediaItemPropertyPlaybackDuration: estimatedDuration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: elapsed,
            MPNowPlayingInfoPropertyPlaybackRate: state == .playing ? speed : 0,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: speed,
            MPNowPlayingInfoPropertyPlaybackQueueIndex: currentIndex,
            MPNowPlayingInfoPropertyPlaybackQueueCount: lines.count,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
        ]
        #endif
    }

    private func clearPublishedPlayback() {
        #if os(iOS)
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        #endif
    }
}

struct ScreenplayTableReadView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var player: ScreenplayTableReadPlayer
    let draft: String
    let title: String
    let projectID: String

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        introduction
                        transport
                        currentLineCard
                        transcript
                    }
                    .padding(18)
                }
                .onChange(of: player.currentIndex) { _, newIndex in
                    withAnimation(.easeOut(duration: 0.24)) {
                        proxy.scrollTo("table-read-line-\(newIndex)", anchor: .center)
                    }
                }
            }
            .background(Color.herPeachMid.ignoresSafeArea())
            .navigationTitle("Table Read")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .onAppear {
            player.load(draft: draft, title: title, projectID: projectID)
        }
        .onChange(of: draft) { _, newDraft in
            player.load(draft: newDraft, title: title, projectID: projectID)
        }
        .accessibilityIdentifier("studio.table-read.sheet")
    }

    private var introduction: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("Listen while you follow the page", systemImage: "headphones")
                .font(IOThemTypography.UI.sectionTitle)
                .foregroundStyle(Color.herText.opacity(0.94))
            Text("THEM reads action with a narrator and gives each character a consistent on-device voice. Your screenplay stays on this device for playback.")
                .font(IOThemTypography.UI.callout)
                .foregroundStyle(Color.herText.opacity(0.68))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var transport: some View {
        VStack(spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(progressTitle)
                        .font(IOThemTypography.UI.calloutStrong)
                        .foregroundStyle(Color.herText.opacity(0.90))
                    Text(durationTitle)
                        .font(IOThemTypography.UI.caption)
                        .foregroundStyle(Color.herText.opacity(0.58))
                }
                Spacer(minLength: 8)
                Picker("Speed", selection: $player.speed) {
                    ForEach(ScreenplayTableReadPlayer.supportedSpeeds, id: \.self) { speed in
                        Text(ScreenplayTableReadPlayer.speedLabel(speed))
                            .tag(speed)
                    }
                }
                .pickerStyle(.menu)
                .accessibilityIdentifier("studio.table-read.speed")
            }

            ProgressView(value: player.progress)
                .tint(Color.herStudioActiveStroke)
                .accessibilityLabel("Table read progress")

            HStack(spacing: 10) {
                transportButton("Previous", systemImage: "backward.end.fill", action: player.previousLine)
                    .disabled(player.currentIndex <= 0)
                    .accessibilityIdentifier("studio.table-read.previous")
                transportButton(
                    player.state == .playing ? "Pause" : "Play",
                    systemImage: player.state == .playing ? "pause.fill" : "play.fill",
                    action: player.togglePlayback
                )
                .buttonStyle(.borderedProminent)
                .disabled(player.lines.isEmpty)
                .accessibilityIdentifier("studio.table-read.play-pause")
                transportButton("Next", systemImage: "forward.end.fill", action: player.nextLine)
                    .disabled(player.currentIndex >= max(0, player.lines.count - 1))
                    .accessibilityIdentifier("studio.table-read.next")
            }

            Text("AirPods and system media controls can play, pause, and move one script line at a time.")
                .font(IOThemTypography.UI.labelRegular)
                .foregroundStyle(Color.herText.opacity(0.58))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.62))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.24), lineWidth: 1)
        )
    }

    @ViewBuilder
    private var currentLineCard: some View {
        if let line = player.currentLine {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("NOW READING")
                        .font(IOThemTypography.UI.microMedium)
                        .tracking(0.7)
                        .foregroundStyle(Color.herStudioActiveStroke)
                    Spacer()
                    Text("Page \(line.page) · Line \(line.sourceLine)")
                        .font(IOThemTypography.UI.monoMicroRegular)
                        .foregroundStyle(Color.herText.opacity(0.54))
                }
                Text(line.role.displayName)
                    .font(IOThemTypography.UI.captionStrong)
                    .foregroundStyle(Color.herText.opacity(0.78))
                Text(line.displayText)
                    .font(IOThemTypography.UI.monoPrompt)
                    .foregroundStyle(Color.herText.opacity(0.94))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.herStudioActiveFill.opacity(0.22))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.herStudioActiveStroke.opacity(0.42), lineWidth: 1.2)
            )
            .accessibilityIdentifier("studio.table-read.current-line")
        }
    }

    private var transcript: some View {
        LazyVStack(alignment: .leading, spacing: 10) {
            if player.lines.isEmpty {
                Text("Import or write a screenplay first, then return here to listen.")
                    .font(IOThemTypography.UI.callout)
                    .foregroundStyle(Color.herText.opacity(0.64))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 24)
            } else {
                ForEach(player.lines) { line in
                    Button {
                        player.jump(to: line.id)
                    } label: {
                        tableReadRow(line)
                    }
                    .buttonStyle(.plain)
                    .id("table-read-line-\(line.id)")
                    .accessibilityIdentifier("studio.table-read.line.\(line.id)")
                    .accessibilityLabel("\(line.role.displayName), page \(line.page), line \(line.sourceLine), \(line.displayText)")
                    .accessibilityValue(line.id == player.currentIndex ? "Current line" : "")
                    .accessibilityHint("Moves the table read to this line")
                }
            }
        }
    }

    private func tableReadRow(_ line: ScreenplayTableReadLine) -> some View {
        let isCurrent = line.id == player.currentIndex
        return HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(line.role.displayName)
                    .font(IOThemTypography.UI.captionStrong)
                    .foregroundStyle(isCurrent ? Color.herStudioActiveStroke : Color.herText.opacity(0.68))
                Text("P\(line.page) · L\(line.sourceLine)")
                    .font(IOThemTypography.UI.monoMicroRegular)
                    .foregroundStyle(Color.herText.opacity(0.46))
            }
            .frame(width: 76, alignment: .leading)

            Text(line.displayText)
                .font(IOThemTypography.UI.monoLabel)
                .foregroundStyle(Color.herText.opacity(isCurrent ? 0.94 : 0.76))
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(isCurrent ? Color.herStudioActiveFill.opacity(0.18) : Color.white.opacity(0.40))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(
                    isCurrent ? Color.herStudioActiveStroke.opacity(0.36) : Color.herShellStroke.opacity(0.16),
                    lineWidth: 1
                )
        )
    }

    private func transportButton(
        _ title: String,
        systemImage: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 5) {
                Image(systemName: systemImage)
                Text(title)
                    .font(IOThemTypography.UI.captionStrong)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
            .frame(minHeight: 44)
        }
        .buttonStyle(.bordered)
    }

    private var progressTitle: String {
        guard !player.lines.isEmpty else { return "No readable lines" }
        return "Line \(player.currentIndex + 1) of \(player.lines.count)"
    }

    private var durationTitle: String {
        let totalSeconds = Int(player.estimatedDuration.rounded())
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        if minutes == 0 { return "About \(max(1, seconds)) seconds" }
        return "About \(minutes)m \(seconds)s at this speed"
    }
}

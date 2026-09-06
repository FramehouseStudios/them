// D009 I4: the in-app notes cluster (panel, store, voice-command controller and their value types), moved verbatim out of RootExperienceView.swift; `private` dropped so the root view can still compose it. Raw fonts predate the design-system guard, see its allowlist.
import SwiftUI
import Combine
import Speech
import AVFoundation
import Foundation

struct InAppNoteItem: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let body: String
    let createdAt: TimeInterval
    let source: String
    let linkedPath: String?
    let turnID: String?
}

@MainActor
final class InAppNotesStore: ObservableObject {
    static let shared = InAppNotesStore()

    @Published private(set) var notes: [InAppNoteItem] = []

    private let storageKey = "them_in_app_notes_v1"
    private let maxNotes = 320

    private init() {
        load()
    }

    func addCapturedNote(
        title: String?,
        body: String?,
        source: String,
        linkedPath: String?,
        turnID: String?,
        createdAtMs: TimeInterval?
    ) {
        let cleanBody = (body ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanTitle = (title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let fallbackBody = cleanBody.isEmpty ? cleanTitle : cleanBody
        guard !fallbackBody.isEmpty else { return }
        guard !isDuplicate(turnID: turnID, title: cleanTitle, body: fallbackBody) else { return }

        let note = InAppNoteItem(
            id: UUID().uuidString,
            title: cleanTitle.isEmpty ? makeTitle(from: fallbackBody) : cleanTitle,
            body: fallbackBody,
            createdAt: normalizeCreatedAt(createdAtMs),
            source: source.isEmpty ? "voice" : source,
            linkedPath: linkedPath?.trimmingCharacters(in: .whitespacesAndNewlines),
            turnID: turnID?.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        notes.insert(note, at: 0)
        trimAndPersist()
    }

    @discardableResult
    func addManualNote(_ text: String) -> Bool {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return false }
        let note = InAppNoteItem(
            id: UUID().uuidString,
            title: makeTitle(from: clean),
            body: clean,
            createdAt: Date().timeIntervalSince1970,
            source: "in_app",
            linkedPath: nil,
            turnID: nil
        )
        notes.insert(note, at: 0)
        trimAndPersist()
        return true
    }

    @discardableResult
    func updateNote(id: String, text: String) -> Bool {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return false }
        guard let index = notes.firstIndex(where: { $0.id == id }) else { return false }
        let existing = notes[index]
        notes[index] = InAppNoteItem(
            id: existing.id,
            title: makeTitle(from: clean),
            body: clean,
            createdAt: Date().timeIntervalSince1970,
            source: existing.source,
            linkedPath: existing.linkedPath,
            turnID: existing.turnID
        )
        notes.sort { $0.createdAt > $1.createdAt }
        persist()
        return true
    }

    func deleteNote(id: String) {
        notes.removeAll { $0.id == id }
        persist()
    }

    func clearAll() {
        notes = []
        persist()
    }

    private func isDuplicate(turnID: String?, title: String, body: String) -> Bool {
        let cleanTurn = turnID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !cleanTurn.isEmpty, notes.contains(where: { ($0.turnID ?? "") == cleanTurn }) {
            return true
        }

        let normalizedBody = body.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if normalizedBody.isEmpty { return false }
        let normalizedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        return notes.prefix(6).contains { item in
            let itemBody = item.body.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if itemBody == normalizedBody { return true }
            let itemTitle = item.title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return !normalizedTitle.isEmpty && itemTitle == normalizedTitle && itemBody == normalizedBody
        }
    }

    private func normalizeCreatedAt(_ createdAtMs: TimeInterval?) -> TimeInterval {
        let raw = createdAtMs ?? 0
        guard raw > 0 else { return Date().timeIntervalSince1970 }
        if raw > 100_000_000_000 {
            return raw / 1000
        }
        return raw
    }

    private func makeTitle(from body: String) -> String {
        let firstLine = body
            .split(whereSeparator: \.isNewline)
            .first
            .map(String.init)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? body
        let sentence = firstLine.split(whereSeparator: { ".!?".contains($0) }).first.map(String.init) ?? firstLine
        let trimmed = sentence.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.count <= 64 { return trimmed }
        return String(trimmed.prefix(63)).trimmingCharacters(in: .whitespacesAndNewlines) + "…"
    }

    private func trimAndPersist() {
        if notes.count > maxNotes {
            notes = Array(notes.prefix(maxNotes))
        }
        persist()
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else {
            notes = []
            return
        }
        do {
            let decoded = try JSONDecoder().decode([InAppNoteItem].self, from: data)
            notes = decoded.sorted { $0.createdAt > $1.createdAt }
        } catch {
            notes = []
        }
    }

    private func persist() {
        do {
            let data = try JSONEncoder().encode(notes)
            UserDefaults.standard.set(data, forKey: storageKey)
        } catch {
            // Keep runtime notes alive even if persistence fails.
        }
    }
}

enum NoteEditStyle: String, CaseIterable, Identifiable {
    case polish
    case tighten
    case professional
    case warmer
    case summarize

    var id: String { rawValue }

    var title: String {
        switch self {
        case .polish: return "Polish"
        case .tighten: return "Tighten"
        case .professional: return "Professional"
        case .warmer: return "Warmer"
        case .summarize: return "Summarize"
        }
    }

    var actionTitle: String {
        switch self {
        case .polish: return "Polish With io.them"
        case .tighten: return "Tighten With io.them"
        case .professional: return "Make Professional"
        case .warmer: return "Make Warmer"
        case .summarize: return "Summarize"
        }
    }

    var progressTitle: String {
        switch self {
        case .polish: return "Polishing"
        case .tighten: return "Tightening"
        case .professional: return "Professionalizing"
        case .warmer: return "Warming"
        case .summarize: return "Summarizing"
        }
    }

    var successTitle: String {
        switch self {
        case .polish: return "polished"
        case .tighten: return "tightened"
        case .professional: return "made professional"
        case .warmer: return "made warmer"
        case .summarize: return "summarized"
        }
    }

    var directive: String {
        switch self {
        case .polish:
            return """
- Fix grammar, spelling, punctuation, capitalization, sentence boundaries, and awkward phrasing.
- Improve clarity, rhythm, concision, and organization without changing the writer's meaning.
- Preserve the writer's tone unless the writing is confusing or clearly needs cleanup.
"""
        case .tighten:
            return """
- Tighten the writing aggressively: remove repetition, filler, throat-clearing, and weak transitions.
- Keep the meaning, facts, and overall tone intact while making the note shorter and cleaner.
- Prefer crisp sentences and economical phrasing over elaboration.
"""
        case .professional:
            return """
- Rewrite the note to sound professional, clear, composed, and business-ready.
- Keep the original meaning and intent, but remove slang, vagueness, and casual phrasing where needed.
- Preserve important names, dates, commitments, and action items exactly.
"""
        case .warmer:
            return """
- Rewrite the note to feel warmer, more human, and more relational without becoming gushy or vague.
- Keep the original meaning and structure, but soften overly blunt phrasing and improve emotional readability.
- Preserve clarity and specifics; warmth should not reduce precision.
"""
        case .summarize:
            return """
- Turn the note into a concise summary of the essential information.
- Preserve key facts, names, dates, commitments, and action items.
- If bullets or checklist structure help clarity, keep or introduce them sparingly.
"""
        }
    }
}

struct SavedNoteRewritePreview: Identifiable {
    let noteID: String
    let noteTitle: String
    let originalText: String
    let revisedText: String
    let style: NoteEditStyle
    let matchContext: NoteMatchContext?

    var id: String { noteID }
}

struct AppliedNoteRewrite {
    let noteID: String
    let noteTitle: String
    let originalText: String
    let revisedText: String
    let style: NoteEditStyle
}

enum NoteVoicePermissionIssue {
    case microphone
    case speechRecognition
}

struct NoteMatchContext {
    let targetHint: String
    let matchedFieldLabel: String
    let matchedText: String
}

enum NoteVoiceCommand {
    case rewrite(NoteEditStyle, targetHint: String?)
    case undo
    case printScript(alternate: Bool)
    case cancelPending
}

@MainActor
final class NoteVoiceCommandController: ObservableObject {
    @Published private(set) var isListening = false
    @Published private(set) var heardText = ""
    @Published private(set) var feedbackText = ""
    @Published private(set) var permissionIssue: NoteVoicePermissionIssue?

    private let engine = AVAudioEngine()
    private let transcriber = LivePartialTranscriber()
    private var autoStopTask: Task<Void, Never>?

    var onCommand: ((NoteVoiceCommand, String) -> Void)?

    init() {
        transcriber.onPartial = { [weak self] text in
            Task { @MainActor in
                self?.handlePartial(text)
            }
        }
    }

    func toggleListening() {
        if isListening {
            stopListening(runCommand: true)
        } else {
            Task { await startListening() }
        }
    }

    func stopListening() {
        stopListening(runCommand: false)
    }

    private func startListening() async {
        guard !isListening else { return }

        let micAuthorized = await requestMicrophonePermission()
        guard micAuthorized else {
            permissionIssue = .microphone
            feedbackText = "Microphone access is off. Enable it in System Settings to use voice note commands."
            return
        }

        let speechAuthorized = await requestSpeechPermission()
        guard speechAuthorized else {
            permissionIssue = .speechRecognition
            feedbackText = "Speech recognition access is off. Enable it in System Settings to use voice note commands."
            return
        }

        permissionIssue = nil
        heardText = ""
        feedbackText = "Listening for a note command…"
        transcriber.requestAuthorizationIfNeeded()
        transcriber.start()

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in
            self?.transcriber.append(buffer)
        }

        do {
            engine.prepare()
            try engine.start()
            isListening = true
        } catch {
            input.removeTap(onBus: 0)
            transcriber.stop(resetText: true)
            feedbackText = "Could not start listening for note commands."
            return
        }

        autoStopTask?.cancel()
        autoStopTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 3_800_000_000)
            await MainActor.run {
                self?.stopListening(runCommand: true)
            }
        }
    }

    private func stopListening(runCommand: Bool) {
        autoStopTask?.cancel()
        autoStopTask = nil

        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        transcriber.stop(resetText: false)

        let spokenText = heardText.trimmingCharacters(in: .whitespacesAndNewlines)
        isListening = false

        guard runCommand else {
            if spokenText.isEmpty {
                feedbackText = ""
            }
            return
        }

        guard !spokenText.isEmpty else {
            feedbackText = "Say something like \"tighten this note\" or \"undo rewrite.\""
            return
        }

        guard let command = Self.parseCommand(from: spokenText) else {
            feedbackText = "I heard \"\(spokenText)\", but not a note command yet."
            return
        }

        feedbackText = "Heard: \"\(spokenText)\""
        onCommand?(command, spokenText)
    }

    private func handlePartial(_ text: String) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        heardText = clean
        feedbackText = "Heard: \"\(clean)\""

        guard let command = Self.parseCommand(from: clean) else { return }
        stopListening(runCommand: false)
        feedbackText = "Heard: \"\(clean)\""
        onCommand?(command, clean)
    }

    private func requestMicrophonePermission() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            return true
        case .notDetermined:
            return await withCheckedContinuation { continuation in
                AVCaptureDevice.requestAccess(for: .audio) { granted in
                    continuation.resume(returning: granted)
                }
            }
        case .denied, .restricted:
            return false
        @unknown default:
            return false
        }
    }

    private func requestSpeechPermission() async -> Bool {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized:
            return true
        case .notDetermined:
            return await withCheckedContinuation { continuation in
                SFSpeechRecognizer.requestAuthorization { status in
                    continuation.resume(returning: status == .authorized)
                }
            }
        case .denied, .restricted:
            return false
        @unknown default:
            return false
        }
    }

    private static func parseCommand(from text: String) -> NoteVoiceCommand? {
        let normalized = " \(text.lowercased()) "

        func containsAny(_ needles: [String]) -> Bool {
            needles.contains { normalized.contains($0) }
        }

        if containsAny([
            " undo rewrite ",
            " undo that rewrite ",
            " undo the rewrite ",
            " undo last rewrite ",
            " revert note ",
            " revert the note ",
            " restore the note ",
            " restore previous note ",
            " undo that "
        ]) {
            return .undo
        }

        if containsAny([" summarize ", " summary ", " sum this up ", " make this shorter summary "]) {
            return .rewrite(.summarize, targetHint: extractTargetHint(from: normalized))
        }

        if containsAny([
            " professional ",
            " more professional ",
            " formal ",
            " business ready ",
            " business-ready ",
            " polished email "
        ]) {
            return .rewrite(.professional, targetHint: extractTargetHint(from: normalized))
        }

        if containsAny([
            " warmer ",
            " warm this up ",
            " warm it up ",
            " softer ",
            " gentler ",
            " friendlier ",
            " more human "
        ]) {
            return .rewrite(.warmer, targetHint: extractTargetHint(from: normalized))
        }

        if containsAny([
            " tighten ",
            " tighten up ",
            " make this tighter ",
            " shorter ",
            " trim this ",
            " cut this down ",
            " make this concise ",
            " make this more concise "
        ]) {
            return .rewrite(.tighten, targetHint: extractTargetHint(from: normalized))
        }

        if containsAny([
            " cancel ",
            " cancel printing ",
            " stop printing ",
            " never mind "
        ]) {
            return .cancelPending
        }
        if containsAny([
            " polish ",
            " polish this ",
            " clean this up ",
            " clean up this note ",
            " fix grammar ",
            " proofread ",
            " edit this note "
        ]) {
            return .rewrite(.polish, targetHint: extractTargetHint(from: normalized))
        }

        if containsAny([
            " print somewhere else ",
            " print elsewhere ",
            " print to another printer ",
            " another printer ",
            " choose printer ",
            " pick printer "
        ]) {
            return .printScript(alternate: true)
        }
        if containsAny([
            " print the script ",
            " print script ",
            " print my script ",
            " print the draft ",
            " print draft ",
            " print screenplay ",
            " print the screenplay "
        ]) {
            return .printScript(alternate: false)
        }
        return nil
    }

    private static func extractTargetHint(from normalized: String) -> String? {
        let compact = normalized
            .replacingOccurrences(of: #"[^\w\s]"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if compact.contains(" this note ") || compact.hasSuffix(" this note") ||
            compact.contains(" current note ") || compact.contains(" draft note ") ||
            compact.contains(" my note ") || compact == "undo rewrite" {
            return nil
        }

        for marker in ["note called ", "note titled ", "note named ", "note about "] {
            if let range = compact.range(of: marker) {
                let raw = String(compact[range.upperBound...])
                return cleanedTargetCandidate(raw)
            }
        }

        if let range = compact.range(of: " note") {
            let before = String(compact[..<range.lowerBound])
            return cleanedTargetCandidate(before)
        }

        return nil
    }

    private static func cleanedTargetCandidate(_ raw: String) -> String? {
        let fillerPrefixes = [
            "summarize ", "summary ", "sum this up ", "make this shorter summary ",
            "make ", "make this ", "make it ", "make the ",
            "tighten ", "tighten up ", "polish ", "polish this ",
            "clean this up ", "clean up ", "fix grammar ", "proofread ",
            "edit ", "edit this ", "warm ", "warm up ", "make warmer ",
            "make more professional ", "make this more professional ",
            "more professional ", "professional ", "warmer ", "shorter ",
            "trim ", "cut down ", "make concise ", "make this concise ",
            "make this more concise "
        ]

        var candidate = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        for prefix in fillerPrefixes {
            if candidate.hasPrefix(prefix) {
                candidate.removeFirst(prefix.count)
            }
        }

        candidate = candidate
            .replacingOccurrences(of: #"\s+note$"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\s+(more\s+professional|professional|warmer|shorter|tighter|concise)$"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        let throwaway = Set(["the", "a", "an", "my", "this", "current", "draft", "note", "it"])
        let words = candidate.split(separator: " ").map(String.init).filter { !throwaway.contains($0) }
        guard !words.isEmpty else { return nil }
        let cleaned = words.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? nil : cleaned
    }
}

struct NotesPanel: View {
    private struct PendingVoiceNoteDisambiguation: Identifiable {
        let style: NoteEditStyle
        let spokenText: String
        let ambiguity: NoteMatchAmbiguity

        var id: String {
            "\(style.rawValue)|\(ambiguity.targetHint)|\(ambiguity.primary.note.id)|\(ambiguity.secondary.note.id)"
        }
    }

    let onDone: () -> Void

    @Environment(\.openURL) private var openURL
    @StateObject private var store = InAppNotesStore.shared
    @StateObject private var voiceCommands = NoteVoiceCommandController()
    @State private var backend = BackendClient()
    @State private var draftNote = ""
    @State private var editingNoteID = ""
    @State private var isPolishingDraft = false
    @State private var selectedEditStyle: NoteEditStyle = .polish
    @State private var rewritingSavedNoteID = ""
    @State private var rewritingSavedNoteStyle: NoteEditStyle?
    @State private var pendingVoiceDisambiguation: PendingVoiceNoteDisambiguation?
    @State private var rewritePreview: SavedNoteRewritePreview?
    @State private var lastAppliedRewrite: AppliedNoteRewrite?
    @State private var statusText = ""
    @State private var pendingPrintTask: Task<Void, Never>?
    @State private var isPrintPendingConfirmation = false

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [.herPeachTop, .herPeachMid, .herPeachBottom]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                VStack(spacing: 16) {
                    header
                    if isPrintPendingConfirmation {
                        HStack(spacing: 12) {
                            Image(systemName: "printer")
                            Text(statusText)
                                .font(.system(size: 13, weight: .medium))
                                .lineLimit(2)
                            Spacer()
                            Button("Cancel") { cancelPendingPrint() }
                            .buttonStyle(.borderedProminent)
                            .tint(.red.opacity(0.85))
                            .font(.system(size: 13, weight: .semibold))
                        }
                        .padding(12)
                        .background(.white.opacity(0.88))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .shadow(radius: 4)
                        .transition(.move(edge: .top).combined(with: .opacity))
                    }
                    composer
                    notesList
                    Spacer(minLength: 0)
                }
                .padding(24)
            }
        }
        .onAppear {
            voiceCommands.onCommand = { command, spokenText in
                Task { @MainActor in
                    await handleVoiceCommand(command, spokenText: spokenText)
                }
            }
        }
        .onDisappear {
            voiceCommands.stopListening()
            voiceCommands.onCommand = nil
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Notes")
                    .font(.system(size: 30, weight: .semibold, design: .default))
                    .foregroundColor(.herText.opacity(0.95))
                Spacer()
                if !store.notes.isEmpty {
                    Button("Clear All") {
                        store.clearAll()
                        statusText = "Cleared all in-app notes."
                    }
                    .buttonStyle(.bordered)
                    .tint(.white.opacity(0.24))
                }
                if canUndoLastRewrite {
                    Button("Undo Last Rewrite") {
                        undoLastRewrite()
                    }
                    .buttonStyle(.bordered)
                    .tint(.white.opacity(0.24))
                }
                Button("Return", action: onDone)
                    .buttonStyle(.borderedProminent)
                    .tint(.white.opacity(0.22))
                    .foregroundColor(.herText.opacity(0.92))
            }
            Text("Save notes directly in-app. Voice notes captured by io.them appear here too.")
                .font(.system(size: 14, weight: .regular, design: .default))
                .foregroundColor(.herText.opacity(0.80))
            Text("io.them can polish, tighten, professionalize, warm up, or summarize notes while keeping the core meaning intact.")
                .font(.system(size: 12, weight: .regular, design: .default))
                .foregroundColor(.herText.opacity(0.72))
            if !statusText.isEmpty {
                Text(statusText)
                    .font(.system(size: 12, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.84))
            }
        }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextEditor(text: $draftNote)
                .font(.system(size: 14, weight: .regular, design: .default))
                .foregroundColor(.herText.opacity(0.92))
                .scrollContentBackground(.hidden)
                .padding(10)
                .frame(minHeight: 120)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color.white.opacity(0.12))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.white.opacity(0.18), lineWidth: 1)
                )

            VStack(alignment: .leading, spacing: 6) {
                Text("io.them Edit Style")
                    .font(.system(size: 12, weight: .semibold, design: .default))
                    .foregroundColor(.herText.opacity(0.84))

                Picker("io.them Edit Style", selection: $selectedEditStyle) {
                    ForEach(NoteEditStyle.allCases) { style in
                        Text(style.title).tag(style)
                    }
                }
                .pickerStyle(.segmented)
            }

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 10) {
                    Button(voiceCommands.isListening ? "Listening…" : "Voice Command") {
                        voiceCommands.toggleListening()
                    }
                    .buttonStyle(.bordered)
                    .tint(.white.opacity(0.24))
                    .disabled(isPolishingDraft || isRewritingSavedNote)

                    Text("Say \"tighten this note,\" \"make this more professional,\" or \"undo rewrite.\"")
                        .font(.system(size: 12, weight: .regular, design: .default))
                        .foregroundColor(.herText.opacity(0.72))
                }

                if !voiceCommands.feedbackText.isEmpty {
                    Text(voiceCommands.feedbackText)
                        .font(.system(size: 12, weight: .regular, design: .default))
                        .foregroundColor(.herText.opacity(0.82))
                }

                if let issue = voiceCommands.permissionIssue {
                    Button(openSettingsLabel(for: issue)) {
                        openSettings(for: issue)
                    }
                    .buttonStyle(.bordered)
                    .tint(.white.opacity(0.24))
                }
            }

            HStack(spacing: 10) {
                Button(editingNoteID.isEmpty ? "Save In App" : "Update Note") {
                    saveOrUpdateDraftNote()
                }
                .buttonStyle(.borderedProminent)
                .tint(.white.opacity(0.24))

                Button(isPolishingDraft ? "\(selectedEditStyle.progressTitle)..." : selectedEditStyle.actionTitle) {
                    Task { await applySelectedEditStyleToDraft() }
                }
                .buttonStyle(.borderedProminent)
                .tint(.white.opacity(0.20))
                .disabled(isPolishingDraft || draftNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                Button(editingNoteID.isEmpty ? "Clear Draft" : "Cancel Edit") {
                    clearDraftComposer()
                }
                .buttonStyle(.bordered)
                .tint(.white.opacity(0.24))
            }
        }
    }

    private var notesList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                if let pending = pendingVoiceDisambiguation {
                    noteMatchDisambiguationCard(pending)
                }

                if let preview = rewritePreview {
                    rewritePreviewCard(preview)
                }

                if store.notes.isEmpty {
                    Text("No notes yet.")
                        .font(.system(size: 14, weight: .regular, design: .default))
                        .foregroundColor(.herText.opacity(0.72))
                        .padding(.top, 10)
                } else {
                    ForEach(store.notes) { note in
                        noteCard(note)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 4)
        }
    }

    private func noteCard(_ note: InAppNoteItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 8) {
                Text(note.title)
                    .font(.system(size: 15, weight: .semibold, design: .default))
                    .foregroundColor(.herText.opacity(0.93))
                    .lineLimit(1)
                Spacer(minLength: 0)
                Text(Date(timeIntervalSince1970: note.createdAt).formatted(date: .abbreviated, time: .shortened))
                    .font(.system(size: 11, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.72))
            }

            Text(note.body)
                .font(.system(size: 14, weight: .regular, design: .default))
                .foregroundColor(.herText.opacity(0.88))
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 8) {
                Text(note.source.replacingOccurrences(of: "_", with: " ").capitalized)
                    .font(.system(size: 11, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.72))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.white.opacity(0.18))
                    .clipShape(Capsule())

                if let linkedPath = note.linkedPath, !linkedPath.isEmpty {
                    Button("Open File") {
                        openURL(URL(fileURLWithPath: linkedPath))
                    }
                    .buttonStyle(.bordered)
                    .tint(.white.opacity(0.24))
                }

                Button("Edit") {
                    loadNoteIntoComposer(note)
                }
                .buttonStyle(.bordered)
                .tint(.white.opacity(0.24))

                Menu {
                    ForEach(NoteEditStyle.allCases) { style in
                        Button(style.title) {
                            Task { await rewriteSavedNoteInPlace(note, style: style) }
                        }
                    }
                } label: {
                    Text(rewriteLabel(for: note))
                }
                .buttonStyle(.bordered)
                .tint(.white.opacity(0.24))
                .disabled(isPolishingDraft || isRewritingSavedNote)

                if canUndoRewrite(for: note) {
                    Button("Undo Rewrite") {
                        undoLastRewrite()
                    }
                    .buttonStyle(.bordered)
                    .tint(.white.opacity(0.24))
                }

                Spacer(minLength: 0)

                Button("Delete") {
                    store.deleteNote(id: note.id)
                }
                .buttonStyle(.bordered)
                .tint(.white.opacity(0.20))
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.11))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.white.opacity(0.16), lineWidth: 1)
        )
    }

    private func noteMatchDisambiguationCard(_ pending: PendingVoiceNoteDisambiguation) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Which Note Did You Mean?")
                        .font(.system(size: 16, weight: .semibold, design: .default))
                        .foregroundColor(.herText.opacity(0.94))
                    Text("Voice command: \"\(pending.spokenText)\"")
                        .font(.system(size: 12, weight: .regular, design: .default))
                        .foregroundColor(.herText.opacity(0.74))
                }
                Spacer(minLength: 0)
                Button("Cancel") {
                    dismissVoiceDisambiguation()
                }
                .buttonStyle(.bordered)
                .tint(.white.opacity(0.24))
            }

            Text("io.them found two likely notes for \"\(pending.ambiguity.targetHint)\". Pick one to keep going.")
                .font(.system(size: 12, weight: .regular, design: .default))
                .foregroundColor(.herText.opacity(0.72))

            NumberedChoiceHintText(message: "Press 1 or 2 to choose without touching the mouse.")

            HStack(alignment: .top, spacing: 10) {
                disambiguationCandidateButton(
                    pending.ambiguity.primary,
                    pending: pending,
                    keyHint: "1"
                )
                disambiguationCandidateButton(
                    pending.ambiguity.secondary,
                    pending: pending,
                    keyHint: "2"
                )
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.white.opacity(0.13))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.white.opacity(0.18), lineWidth: 1)
        )
    }

    private func disambiguationCandidateButton(
        _ matchResult: NoteMatchResult,
        pending: PendingVoiceNoteDisambiguation,
        keyHint: String
    ) -> some View {
        let shortcut = KeyEquivalent(keyHint.first ?? "1")
        return Button {
            Task { @MainActor in
                await resolveVoiceDisambiguation(matchResult, pending: pending)
            }
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                Text(matchResult.note.title)
                    .font(.system(size: 14, weight: .semibold, design: .default))
                    .foregroundColor(.herText.opacity(0.93))
                    .frame(maxWidth: .infinity, alignment: .leading)

                HStack(spacing: 6) {
                    NumberedChoiceKeyBadge(number: keyHint)

                    Text(matchResult.matchedFieldLabel)
                        .font(.system(size: 11, weight: .regular, design: .default))
                        .foregroundColor(.herText.opacity(0.84))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.white.opacity(0.16))
                        .clipShape(Capsule())

                    Text(String(format: "%.0f", matchResult.score))
                        .font(.system(size: 11, weight: .regular, design: .monospaced))
                        .foregroundColor(.herText.opacity(0.74))
                }

                Text(matchResult.matchedText)
                    .font(.system(size: 12, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.76))
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.10))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(isPolishingDraft || isRewritingSavedNote)
        .keyboardShortcut(shortcut, modifiers: [])
    }

    private func rewritePreviewCard(_ preview: SavedNoteRewritePreview) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Rewrite Preview")
                        .font(.system(size: 16, weight: .semibold, design: .default))
                        .foregroundColor(.herText.opacity(0.94))
                    Text("\(preview.style.title) rewrite for \(preview.noteTitle)")
                        .font(.system(size: 12, weight: .regular, design: .default))
                        .foregroundColor(.herText.opacity(0.74))
                }
                Spacer(minLength: 0)
                NumberedChoiceActionButton(number: "1", title: "Keep Original") {
                    dismissRewritePreview()
                }
                NumberedChoiceActionButton(
                    number: "2",
                    title: "Replace Note",
                    prominence: .prominent
                ) {
                    applyRewritePreview()
                }
            }

            NumberedChoiceHintText(message: "Press 1 to keep the original note or 2 to replace it with io.them's rewrite.")

            if let matchContext = preview.matchContext {
                HStack(spacing: 8) {
                    Text("Matched Note")
                        .font(.system(size: 11, weight: .semibold, design: .default))
                        .foregroundColor(.herText.opacity(0.92))
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(Color.white.opacity(0.20))
                        .clipShape(Capsule())

                    Text(matchContext.matchedFieldLabel)
                        .font(.system(size: 11, weight: .regular, design: .default))
                        .foregroundColor(.herText.opacity(0.82))
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(Color.white.opacity(0.14))
                        .clipShape(Capsule())

                    Text("\"\(matchContext.targetHint)\"")
                        .font(.system(size: 11, weight: .regular, design: .default))
                        .foregroundColor(.herText.opacity(0.76))

                    Spacer(minLength: 0)
                }

                Text("Matched against: \(matchContext.matchedText)")
                    .font(.system(size: 11, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.68))
                    .lineLimit(2)
            }

            VStack(alignment: .leading, spacing: 10) {
                rewriteComparisonBlock(title: "Current", text: preview.originalText)
                rewriteComparisonBlock(title: "io.them", text: preview.revisedText)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.white.opacity(0.13))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.white.opacity(0.18), lineWidth: 1)
        )
    }

    private func rewriteComparisonBlock(title: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 12, weight: .semibold, design: .default))
                .foregroundColor(.herText.opacity(0.82))
            ScrollView {
                Text(text)
                    .font(.system(size: 13, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.88))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(10)
            }
            .frame(minHeight: 92, maxHeight: 150)
            .background(Color.white.opacity(0.10))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }

    private func saveOrUpdateDraftNote() {
        let clean = draftNote.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else {
            statusText = "Enter note text first."
            return
        }

        if editingNoteID.isEmpty {
            let saved = store.addManualNote(clean)
            if saved {
                clearDraftComposer()
                statusText = "Saved."
            } else {
                statusText = "Enter note text first."
            }
            return
        }

        let updated = store.updateNote(id: editingNoteID, text: clean)
        if updated {
            clearDraftComposer()
            statusText = "Note updated."
        } else {
            statusText = "Could not update that note."
        }
    }

    private func loadNoteIntoComposer(_ note: InAppNoteItem) {
        pendingVoiceDisambiguation = nil
        draftNote = note.body
        editingNoteID = note.id
        statusText = "Loaded note into editor."
    }

    private func clearDraftComposer() {
        pendingVoiceDisambiguation = nil
        draftNote = ""
        editingNoteID = ""
        statusText = ""
    }

    @MainActor
    private func applySelectedEditStyleToDraft() async {
        let clean = draftNote.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else {
            statusText = "Enter note text first."
            return
        }

        isPolishingDraft = true
        statusText = ""
        defer { isPolishingDraft = false }

        do {
            let revised = try await rewriteNoteText(clean, style: selectedEditStyle)
            draftNote = revised
            statusText = "io.them \(selectedEditStyle.successTitle) the draft note."
        } catch {
            statusText = error.localizedDescription
        }
    }

    @MainActor
    private func rewriteSavedNoteInPlace(
        _ note: InAppNoteItem,
        style: NoteEditStyle,
        matchContext: NoteMatchContext? = nil
    ) async {
        let clean = note.body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else {
            statusText = "That note is empty."
            return
        }

        rewritingSavedNoteID = note.id
        rewritingSavedNoteStyle = style
        pendingVoiceDisambiguation = nil
        statusText = ""
        defer {
            rewritingSavedNoteID = ""
            rewritingSavedNoteStyle = nil
        }

        do {
            let revised = try await rewriteNoteText(clean, style: style)
            rewritePreview = SavedNoteRewritePreview(
                noteID: note.id,
                noteTitle: note.title,
                originalText: clean,
                revisedText: revised,
                style: style,
                matchContext: matchContext
            )
            statusText = "Review io.them's rewrite before replacing the note."
        } catch {
            statusText = error.localizedDescription
        }
    }

    @MainActor
    private func rewriteNoteText(_ text: String, style: NoteEditStyle) async throws -> String {
        let result = try await backend.talkText(
            transcript: text,
            systemPrompt: noteEditingSystemPrompt(for: style),
            userName: HerEvolutionStore.shared.preferredName
        )
        let revised = (result.reply ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !revised.isEmpty else {
            throw NSError(
                domain: "NotesPanel",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "io.them did not return edited note text."]
            )
        }
        return revised
    }

    private func noteEditingSystemPrompt(for style: NoteEditStyle) -> String {
        """
You are CLEMENTINE acting as an elite editor for notes.

TASK:
\(style.directive)
- If the note uses bullets, headings, fragments, or checklist items, keep that structure unless the selected style clearly benefits from a cleaner equivalent structure.
- Do not add new facts, opinions, or commentary.
- Preserve the writer's intent.
- Output only the revised note text.
"""
    }

    private var isRewritingSavedNote: Bool {
        !rewritingSavedNoteID.isEmpty
    }

    private var canUndoLastRewrite: Bool {
        guard let lastAppliedRewrite else { return false }
        guard let note = store.notes.first(where: { $0.id == lastAppliedRewrite.noteID }) else { return false }
        return normalizedNoteBody(note.body) == normalizedNoteBody(lastAppliedRewrite.revisedText)
    }

    private func rewriteLabel(for note: InAppNoteItem) -> String {
        if rewritingSavedNoteID == note.id {
            return "\((rewritingSavedNoteStyle ?? .polish).progressTitle)..."
        }
        return "Rewrite"
    }

    private func canUndoRewrite(for note: InAppNoteItem) -> Bool {
        guard let lastAppliedRewrite, lastAppliedRewrite.noteID == note.id else { return false }
        return normalizedNoteBody(note.body) == normalizedNoteBody(lastAppliedRewrite.revisedText)
    }

    private func applyRewritePreview() {
        guard let preview = rewritePreview else { return }
        let updated = store.updateNote(id: preview.noteID, text: preview.revisedText)
        guard updated else {
            statusText = "Could not update that note."
            return
        }
        if editingNoteID == preview.noteID {
            draftNote = preview.revisedText
        }
        lastAppliedRewrite = AppliedNoteRewrite(
            noteID: preview.noteID,
            noteTitle: preview.noteTitle,
            originalText: preview.originalText,
            revisedText: preview.revisedText,
            style: preview.style
        )
        rewritePreview = nil
        statusText = "io.them \(preview.style.successTitle) the saved note."
    }

    private func dismissRewritePreview() {
        rewritePreview = nil
        statusText = "Kept the original note."
    }

    private func dismissVoiceDisambiguation() {
        pendingVoiceDisambiguation = nil
        statusText = "Okay. Say the full title when you're ready."
    }

    private func undoLastRewrite() {
        guard let lastAppliedRewrite else { return }
        let updated = store.updateNote(id: lastAppliedRewrite.noteID, text: lastAppliedRewrite.originalText)
        guard updated else {
            statusText = "Could not restore the previous note."
            return
        }
        if editingNoteID == lastAppliedRewrite.noteID {
            draftNote = lastAppliedRewrite.originalText
        }
        statusText = "Restored the version before io.them \(lastAppliedRewrite.style.successTitle) \"\(lastAppliedRewrite.noteTitle)\"."
        self.lastAppliedRewrite = nil
    }

    @MainActor
    private func handleVoiceCommand(_ command: NoteVoiceCommand, spokenText: String) async {
        switch command {
        case .rewrite(let style, let targetHint):
            selectedEditStyle = style
            rewritePreview = nil
            pendingVoiceDisambiguation = nil
            if let targetHint {
                switch matchingNote(for: targetHint) {
                case .matched(let matchResult):
                    statusText = "Applying \"\(spokenText)\" to \"\(matchResult.note.title)\"."
                    await rewriteSavedNoteInPlace(
                        matchResult.note,
                        style: style,
                        matchContext: NoteMatchContext(
                            targetHint: targetHint,
                            matchedFieldLabel: matchResult.matchedFieldLabel,
                            matchedText: matchResult.matchedText
                        )
                    )
                    return
                case .ambiguous(let ambiguity):
                    pendingVoiceDisambiguation = PendingVoiceNoteDisambiguation(
                        style: style,
                        spokenText: spokenText,
                        ambiguity: ambiguity
                    )
                    statusText = """
I'm choosing between "\(ambiguity.primary.note.title)" and "\(ambiguity.secondary.note.title)" for "\(ambiguity.targetHint)". Tap the note you want below.
"""
                    return
                case .none:
                    statusText = "I couldn't find a saved note matching \"\(targetHint)\"."
                    return
                }
            } else {
                guard !draftNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    statusText = "Load or write a note first, or say a note title like \"summarize the meeting note\"."
                    return
                }
                statusText = "Applying \"\(spokenText)\" to the current draft note."
                await applySelectedEditStyleToDraft()
                return
            }
        case .undo:
            if rewritePreview != nil {
                dismissRewritePreview()
            } else if canUndoLastRewrite {
                undoLastRewrite()
            } else {
                statusText = "There isn't a note rewrite to undo right now."
            }
        case .printScript(let alternate):
            await handlePrintVoiceCommand(alternate: alternate, spokenText: spokenText)
        case .cancelPending:
            if isPrintPendingConfirmation {
                cancelPendingPrint()
            } else {
                statusText = "Nothing to cancel right now."
            }
        }
    }

    @MainActor
    private func cancelPendingPrint() {
        pendingPrintTask?.cancel()
        pendingPrintTask = nil
        isPrintPendingConfirmation = false
        statusText = "Cancelled printing."
    }

    @MainActor
    private func handlePrintVoiceCommand(alternate: Bool, spokenText: String) async {
        guard ScreenplayPrintFeature.isEnabled else {
            statusText = "Printing is not enabled in this build."
            return
        }
        pendingPrintTask?.cancel()
        pendingPrintTask = nil
        isPrintPendingConfirmation = false

        guard let draft = ScreenplayDraftStore.sharedCurrentDraftText() else {
            statusText = "No screenplay draft to print. Open a draft in Studio first."
            return
        }
        let title = ScreenplayDraftStore.sharedCurrentTitle() ?? "Screenplay"
        // Whole-project guard: voice should not silently dump 50+ pages on the floor.
        let estimatedPages = ScreenplayPrintService.pageCountEstimate(for: draft)
        if estimatedPages > 50 && !alternate {
            statusText = "This draft is about \(estimatedPages) pages — say \"print somewhere else\" to pick a printer, or print from Settings to avoid a paper surprise."
            return
        }

        // The intent owns the spoken confirmation and the 3-second wait, for Siri and for
        // this panel alike. The panel only shows the Cancel pill while that wait runs;
        // cancelling pendingPrintTask cancels the intent's sleep and it throws .cancelled.
        let willConfirmSilently = !alternate && ScreenplayPrintMemory.rememberedPrinterURL != nil
        if willConfirmSilently {
            let printerName = ScreenplayPrintMemory.rememberedPrinterName ?? "your printer"
            statusText = "Printing \(title) to \(printerName). Say \"cancel\" or tap Cancel within 3 seconds."
            isPrintPendingConfirmation = true
        } else {
            statusText = "Opening printer picker — choose where to print."
        }
        pendingPrintTask = Task { @MainActor in
            defer {
                isPrintPendingConfirmation = false
                pendingPrintTask = nil
            }
            var intent = PrintScreenplayIntent()
            intent.draft = draft
            intent.jobTitle = title
            intent.pickAlternate = alternate
            intent.onOutcome = { message in statusText = message }
            do {
                _ = try await intent.perform()
            } catch {
                // The Cancel pill / "cancel" already wrote "Cancelled printing."
                if !Task.isCancelled { statusText = error.localizedDescription }
            }
        }
    }

    @MainActor
    private func resolveVoiceDisambiguation(
        _ matchResult: NoteMatchResult,
        pending: PendingVoiceNoteDisambiguation
    ) async {
        statusText = "Applying \"\(pending.spokenText)\" to \"\(matchResult.note.title)\"."
        await rewriteSavedNoteInPlace(
            matchResult.note,
            style: pending.style,
            matchContext: NoteMatchContext(
                targetHint: pending.ambiguity.targetHint,
                matchedFieldLabel: matchResult.matchedFieldLabel,
                matchedText: matchResult.matchedText
            )
        )
    }

    private func normalizedNoteBody(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private struct NoteMatchResult {
        let note: InAppNoteItem
        let matchedFieldLabel: String
        let matchedText: String
        let score: Double
    }

    private struct NoteMatchAmbiguity {
        let targetHint: String
        let primary: NoteMatchResult
        let secondary: NoteMatchResult
    }

    private enum NoteMatchDecision {
        case matched(NoteMatchResult)
        case ambiguous(NoteMatchAmbiguity)
        case none
    }

    private struct NoteSearchPhrase {
        let text: String
        let label: String
    }

    private func matchingNote(for targetHint: String) -> NoteMatchDecision {
        let normalizedTarget = normalizedNoteLookupKey(targetHint)
        let targetAlias = collapsedNoteAlias(from: targetHint)
        let targetWords = Set(wordsForNoteMatching(in: normalizedTarget))
        guard !normalizedTarget.isEmpty else { return .none }

        var bestByNoteID: [String: NoteMatchResult] = [:]

        for note in store.notes {
            for phrase in searchPhrases(for: note) {
                let rawScore = noteMatchScore(
                    target: normalizedTarget,
                    targetAlias: targetAlias,
                    targetWords: targetWords,
                    candidate: phrase.text
                )
                let adjustedScore = rawScore + noteMatchFieldAdjustment(for: phrase.label)
                guard adjustedScore >= 80 else { continue }

                let result = NoteMatchResult(
                    note: note,
                    matchedFieldLabel: phrase.label,
                    matchedText: phrase.text,
                    score: adjustedScore
                )
                if let existing = bestByNoteID[note.id] {
                    if adjustedScore > existing.score {
                        bestByNoteID[note.id] = result
                    }
                } else {
                    bestByNoteID[note.id] = result
                }
            }
        }

        let ranked = bestByNoteID.values.sorted { lhs, rhs in
            if lhs.score == rhs.score {
                return lhs.note.title.localizedCaseInsensitiveCompare(rhs.note.title) == .orderedAscending
            }
            return lhs.score > rhs.score
        }

        guard let best = ranked.first else { return .none }

        if let second = ranked.dropFirst().first,
           isAmbiguousNoteMatch(best, second) {
            return .ambiguous(
                NoteMatchAmbiguity(
                    targetHint: targetHint,
                    primary: best,
                    secondary: second
                )
            )
        }

        return .matched(best)
    }

    private func noteMatchFieldAdjustment(for label: String) -> Double {
        switch label {
        case "First Line":
            return -4
        case "First-Line Alias":
            return -6
        default:
            return 0
        }
    }

    private func isAmbiguousNoteMatch(_ primary: NoteMatchResult, _ secondary: NoteMatchResult) -> Bool {
        guard primary.note.id != secondary.note.id else { return false }
        let scoreGap = primary.score - secondary.score
        guard scoreGap <= 4 else { return false }
        return secondary.score >= 86
    }

    private func normalizedNoteLookupKey(_ text: String) -> String {
        text.lowercased()
            .replacingOccurrences(of: #"[^\w\s]"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func collapsedNoteAlias(from text: String) -> String {
        let stopwords = Set([
            "the", "a", "an", "my", "this", "that", "current", "draft",
            "note", "notes", "for", "about", "on", "to", "of", "and"
        ])
        let words = wordsForNoteMatching(in: normalizedNoteLookupKey(text)).filter { !stopwords.contains($0) }
        return words.joined(separator: " ")
    }

    private func wordsForNoteMatching(in text: String) -> [String] {
        normalizedNoteLookupKey(text).split(separator: " ").map(String.init)
    }

    private func firstLine(of body: String) -> String {
        body.split(whereSeparator: \.isNewline).first.map(String.init) ?? body
    }

    private func searchPhrases(for note: InAppNoteItem) -> [NoteSearchPhrase] {
        let normalizedTitle = normalizedNoteLookupKey(note.title)
        let titleAlias = collapsedNoteAlias(from: note.title)
        let firstLineText = firstLine(of: note.body)
        let normalizedFirstLine = normalizedNoteLookupKey(firstLineText)
        let firstLineAlias = collapsedNoteAlias(from: firstLineText)

        var phrases: [NoteSearchPhrase] = []

        func appendPhrase(_ text: String, label: String) {
            let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !clean.isEmpty else { return }
            guard !phrases.contains(where: { $0.text == clean }) else { return }
            phrases.append(NoteSearchPhrase(text: clean, label: label))
        }

        appendPhrase(normalizedTitle, label: "Title")
        if titleAlias != normalizedTitle {
            appendPhrase(titleAlias, label: "Title Alias")
        }
        if normalizedFirstLine != normalizedTitle {
            appendPhrase(normalizedFirstLine, label: "First Line")
        }
        if firstLineAlias != normalizedFirstLine && firstLineAlias != normalizedTitle {
            appendPhrase(firstLineAlias, label: "First-Line Alias")
        }

        return phrases
    }

    private func noteMatchScore(
        target: String,
        targetAlias: String,
        targetWords: Set<String>,
        candidate: String
    ) -> Double {
        let normalizedCandidate = normalizedNoteLookupKey(candidate)
        guard !normalizedCandidate.isEmpty else { return 0 }

        let candidateAlias = collapsedNoteAlias(from: normalizedCandidate)
        let candidateWords = Set(wordsForNoteMatching(in: normalizedCandidate))

        if normalizedCandidate == target { return 100 }
        if !targetAlias.isEmpty && normalizedCandidate == targetAlias { return 98 }
        if !candidateAlias.isEmpty && candidateAlias == target { return 97 }
        if !targetAlias.isEmpty && !candidateAlias.isEmpty && candidateAlias == targetAlias { return 95 }

        if normalizedCandidate.contains(target) || target.contains(normalizedCandidate) {
            return 88 + min(Double(normalizedCandidate.count) / 200.0, 4)
        }
        if !targetAlias.isEmpty && (normalizedCandidate.contains(targetAlias) || targetAlias.contains(normalizedCandidate)) {
            return 86
        }
        if !candidateAlias.isEmpty && (candidateAlias.contains(target) || target.contains(candidateAlias)) {
            return 84
        }
        if !targetAlias.isEmpty && !candidateAlias.isEmpty &&
            (candidateAlias.contains(targetAlias) || targetAlias.contains(candidateAlias)) {
            return 82
        }

        let overlap = targetWords.intersection(candidateWords)
        if !targetWords.isEmpty && !candidateWords.isEmpty && !overlap.isEmpty {
            let coverage = Double(overlap.count) / Double(max(targetWords.count, candidateWords.count))
            let targetCoverage = Double(overlap.count) / Double(targetWords.count)
            if targetCoverage >= 1.0 {
                return 80 + coverage * 8
            }
            if coverage >= 0.55 {
                return 72 + coverage * 10
            }
        }

        return 0
    }

    private func openSettingsLabel(for issue: NoteVoicePermissionIssue) -> String {
        switch issue {
        case .microphone:
            return "Open Mic Settings"
        case .speechRecognition:
            return "Open Speech Settings"
        }
    }

    private func openSettings(for issue: NoteVoicePermissionIssue) {
        #if os(iOS)
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        openURL(url)
        #elseif os(macOS)
        let rawURL: String
        switch issue {
        case .microphone:
            rawURL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
        case .speechRecognition:
            rawURL = "x-apple.systempreferences:com.apple.preference.security?Privacy_SpeechRecognition"
        }
        guard let url = URL(string: rawURL) else { return }
        openURL(url)
        #endif
    }
}

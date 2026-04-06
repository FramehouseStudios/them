import Foundation
import Combine

enum HerPersonaPreset: String, CaseIterable, Identifiable {
    case clementine = "clementine"

    var id: String { rawValue }

    var title: String {
        "CLEMENTINE"
    }

    var voicePromptName: String {
        "clementine"
    }

    static func detect(in text: String) -> HerPersonaPreset? {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.isEmpty ? nil : .clementine
    }
}

@MainActor
final class HerEvolutionStore: ObservableObject {
    static let shared = HerEvolutionStore()

    // Persisted keys
    private enum K {
        static let armedEver = "her.armedEver"
        static let sessionCount = "her.sessionCount"
        static let messageCount = "her.messageCount"
        static let depthScore = "her.depthScore"
        static let romanceTension = "her.romanceTension"
        static let lastSeen = "her.lastSeen"
        static let personaPreset = "her.personaPreset"
        static let hasExplicitPersonaPreset = "her.hasExplicitPersonaPreset"
        static let didPlayPersonalityPrompt = "her.didPlayPersonalityPrompt"
        static let reassuranceNeed = "her.reassuranceNeed"
        static let boundaryNeed = "her.boundaryNeed"
        static let playfulMomentum = "her.playfulMomentum"
        static let trustSignal = "her.trustSignal"
        static let lastThemeCue = "her.lastThemeCue"
        static let preferredName = "her.preferredName"
        static let stageOverride = "her.stageOverride"
        static let creativeIdentity = "her.creativeIdentity"
        static let creativeIdentityStrength = "her.creativeIdentityStrength"
        static let hasRestoredFromBackend = "her.hasRestoredFromBackend"
        static let isScreenwriter = "her.isScreenwriter"
    }

    private let d = UserDefaults.standard

    @Published private(set) var sessionCount: Int
    @Published private(set) var messageCount: Int
    @Published private(set) var depthScore: Double
    @Published private(set) var romanceTension: Double
    @Published private(set) var lastSeen: Date?
    @Published private(set) var personaPreset: HerPersonaPreset
    @Published private(set) var hasExplicitPersonaPreset: Bool
    @Published private(set) var didPlayPersonalityPrompt: Bool
    @Published private(set) var preferredName: String
    @Published private(set) var stageOverride: Int?

    // Subtle emotional memory traces (all 0...1)
    @Published private(set) var reassuranceNeed: Double
    @Published private(set) var boundaryNeed: Double
    @Published private(set) var playfulMomentum: Double
    @Published private(set) var trustSignal: Double
    @Published private(set) var lastThemeCue: String
    @Published private(set) var creativeIdentity: String
    @Published private(set) var creativeIdentityStrength: Double
    @Published private(set) var isScreenwriter: Bool

    private init() {
        self.sessionCount = d.integer(forKey: K.sessionCount)
        self.messageCount = d.integer(forKey: K.messageCount)
        self.depthScore = d.double(forKey: K.depthScore)
        self.romanceTension = d.double(forKey: K.romanceTension)
        self.lastSeen = d.object(forKey: K.lastSeen) as? Date
        self.personaPreset = HerPersonaPreset(rawValue: d.string(forKey: K.personaPreset) ?? "")
            ?? .clementine
        self.hasExplicitPersonaPreset = d.object(forKey: K.hasExplicitPersonaPreset) as? Bool ?? true
        self.didPlayPersonalityPrompt = d.object(forKey: K.didPlayPersonalityPrompt) as? Bool ?? false
        self.preferredName = d.string(forKey: K.preferredName)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let persistedStageOverride = d.object(forKey: K.stageOverride) as? Int ?? 0
        self.stageOverride = (1...5).contains(persistedStageOverride) ? persistedStageOverride : nil
        self.reassuranceNeed = d.object(forKey: K.reassuranceNeed) as? Double ?? 0.18
        self.boundaryNeed = d.object(forKey: K.boundaryNeed) as? Double ?? 0.18
        self.playfulMomentum = d.object(forKey: K.playfulMomentum) as? Double ?? 0.20
        self.trustSignal = d.object(forKey: K.trustSignal) as? Double ?? 0.18
        let persistedCreativeIdentity = d.string(forKey: K.creativeIdentity) ?? ""
        self.lastThemeCue = d.string(forKey: K.lastThemeCue) ?? ""
        self.creativeIdentity = persistedCreativeIdentity
        self.creativeIdentityStrength = d.object(forKey: K.creativeIdentityStrength) as? Double ?? 0
        self.isScreenwriter = d.object(forKey: K.isScreenwriter) as? Bool
            ?? (persistedCreativeIdentity == "screenwriter")
    }

    /// Call this when the user opens Screenplay Studio or completes a turn there.
    /// Idempotent and permanent once set.
    func markAsScreenwriter() {
        guard !isScreenwriter else { return }
        isScreenwriter = true
        creativeIdentity = "screenwriter"
        creativeIdentityStrength = max(creativeIdentityStrength, 0.94)
        if lastThemeCue.isEmpty {
            lastThemeCue = "screenwriting"
        }
        d.set(true, forKey: K.isScreenwriter)
        d.set(creativeIdentity, forKey: K.creativeIdentity)
        d.set(creativeIdentityStrength, forKey: K.creativeIdentityStrength)
        d.set(lastThemeCue, forKey: K.lastThemeCue)
    }

    func bumpSession() {
        sessionCount += 1
        d.set(sessionCount, forKey: K.sessionCount)
        lastSeen = Date()
        d.set(lastSeen, forKey: K.lastSeen)
        // Keep compatibility with previously persisted state.
        didPlayPersonalityPrompt = false
        d.set(false, forKey: K.didPlayPersonalityPrompt)
    }

    var shouldVerballyPromptForPersonality: Bool {
        false
    }

    var needsOnboardingName: Bool {
        preferredName.isEmpty
    }

    var needsBackendRestore: Bool {
        let hasMeaningfulLocalState =
            messageCount > 0 ||
            depthScore > 0.1 ||
            romanceTension > 0.1 ||
            reassuranceNeed > 0.19 ||
            boundaryNeed > 0.19 ||
            playfulMomentum > 0.21 ||
            trustSignal > 0.19 ||
            !preferredName.isEmpty ||
            !lastThemeCue.isEmpty ||
            creativeIdentityStrength > 0.08 ||
            isScreenwriter
        let alreadyRestored = d.bool(forKey: K.hasRestoredFromBackend)
        return !hasMeaningfulLocalState && !alreadyRestored
    }

    func seedFromBackend(_ payload: BackendEvolutionSyncSnapshot) {
        let shouldHydrateIdentity = needsBackendRestore

        if let v = payload.depthScore, shouldHydrateIdentity, v > 0 {
            depthScore = clamp(v, 0, 10)
            d.set(depthScore, forKey: K.depthScore)
        }
        if let v = payload.romanceTension, shouldHydrateIdentity, v > 0 {
            romanceTension = clamp(v, 0, 10)
            d.set(romanceTension, forKey: K.romanceTension)
        }
        if let v = payload.sessionCount, shouldHydrateIdentity, v > 0 {
            sessionCount = max(sessionCount, v)
            d.set(sessionCount, forKey: K.sessionCount)
        }
        if let v = payload.reassuranceNeed, shouldHydrateIdentity {
            reassuranceNeed = clamp(v, 0, 1)
            d.set(reassuranceNeed, forKey: K.reassuranceNeed)
        }
        if let v = payload.boundaryNeed, shouldHydrateIdentity {
            boundaryNeed = clamp(v, 0, 1)
            d.set(boundaryNeed, forKey: K.boundaryNeed)
        }
        if let v = payload.playfulMomentum, shouldHydrateIdentity {
            playfulMomentum = clamp(v, 0, 1)
            d.set(playfulMomentum, forKey: K.playfulMomentum)
        }
        if let v = payload.trustSignal, shouldHydrateIdentity {
            trustSignal = clamp(v, 0, 1)
            d.set(trustSignal, forKey: K.trustSignal)
        }
        if let v = payload.lastThemeCue,
           !v.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           (shouldHydrateIdentity || lastThemeCue.isEmpty) {
            lastThemeCue = v
            d.set(lastThemeCue, forKey: K.lastThemeCue)
        }
        if let v = payload.preferredName,
           !v.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           (shouldHydrateIdentity || preferredName.isEmpty) {
            setPreferredName(v)
        }
        if payload.isScreenwriter == true {
            markAsScreenwriter()
        }
        d.set(true, forKey: K.hasRestoredFromBackend)
    }

    func setPreferredName(_ name: String) {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        preferredName = clean
        d.set(clean, forKey: K.preferredName)
    }

    func setStageOverride(_ stage: Int?) {
        if let stage, (1...5).contains(stage) {
            stageOverride = stage
            d.set(stage, forKey: K.stageOverride)
            return
        }
        stageOverride = nil
        d.removeObject(forKey: K.stageOverride)
    }

    func noteCreativeContext(from text: String, isScreenplayMode: Bool = false) {
        let lowered = text.lowercased()
        let hasScreenwriterSignal = isScreenplayMode || containsAny(lowered, [
            "screenwriter", "screenplay", "script", "scene", "dialogue", "slugline",
            "character arc", "cold open", "fade in", "rewrite", "revision", "short film",
            "feature script", "feature film", "pilot", "act one", "third act", "beat sheet"
        ])
        let hasCreativeSignal = hasScreenwriterSignal || containsAny(lowered, [
            "writer", "writing", "creative", "story", "outline", "draft", "project", "film", "movie"
        ])

        guard hasCreativeSignal else { return }

        let target = hasScreenwriterSignal ? 0.94 : 0.68
        creativeIdentityStrength = smooth(creativeIdentityStrength, target: target, alpha: 0.22)
        if hasScreenwriterSignal || creativeIdentityStrength >= 0.60 {
            creativeIdentity = "screenwriter"
        } else if creativeIdentity.isEmpty {
            creativeIdentity = "creative"
        }

        if hasScreenwriterSignal {
            lastThemeCue = "screenwriting"
        } else if lastThemeCue.isEmpty {
            lastThemeCue = "creative work"
        }

        d.set(creativeIdentity, forKey: K.creativeIdentity)
        d.set(creativeIdentityStrength, forKey: K.creativeIdentityStrength)
        d.set(lastThemeCue, forKey: K.lastThemeCue)
    }

    @discardableResult
    func updatePreferredNameFromUserTextIfPresent(_ text: String) -> String? {
        guard let detected = extractPreferredName(from: text) else { return nil }
        if preferredName.compare(detected, options: [.caseInsensitive, .diacriticInsensitive]) == .orderedSame {
            return nil
        }
        setPreferredName(detected)
        return detected
    }

    func markPersonalityPromptPlayed() {
        didPlayPersonalityPrompt = true
        d.set(true, forKey: K.didPlayPersonalityPrompt)
    }

    func setPersonaPreset(_ preset: HerPersonaPreset, explicit: Bool = true) {
        personaPreset = preset
        d.set(preset.rawValue, forKey: K.personaPreset)
        if explicit {
            hasExplicitPersonaPreset = true
            d.set(true, forKey: K.hasExplicitPersonaPreset)
        }
    }

    func updatePersonaFromUserTextIfPresent(_ text: String) -> HerPersonaPreset? {
        guard HerPersonaPreset.detect(in: text) != nil else { return nil }
        guard personaPreset != .clementine else { return nil }
        setPersonaPreset(.clementine, explicit: true)
        return .clementine
    }

    func recordUserMessage(_ text: String) {
        let lowered = text.lowercased()
        messageCount += 1
        d.set(messageCount, forKey: K.messageCount)
        noteCreativeContext(from: text)

        // Light heuristics (keep it simple; no ML needed)
        let len = text.count
        let hasVuln = containsAny(lowered, [
            "i feel", "i'm scared", "i am scared", "lonely", "ashamed", "i miss",
            "i don't know", "i hate myself", "i'm tired", "heart", "hurt", "grief"
        ])
        let hasRelational = containsAny(lowered, [
            "you and me", "us", "with you", "i like you", "i'm falling",
            "i feel close", "do you think about me", "are you real to me"
        ])
        let hasAnxious = containsAny(lowered, [
            "anxious", "panic", "overthinking", "spiral", "afraid", "uncertain", "worry"
        ])
        let hasBoundaryStrain = containsAny(lowered, [
            "drained", "crossed", "disrespect", "too much", "people pleasing",
            "overgiving", "exhausted"
        ])
        let hasPlayful = containsAny(lowered, [
            "lol", "haha", "lmao", "jk", "funny", "wild"
        ])
        let hasDirect = containsAny(lowered, [
            "be honest", "tell me", "what should i do", "just tell me", "what's next"
        ])

        var delta = 0.0
        if len > 80 { delta += 0.12 }
        if len > 200 { delta += 0.18 }
        if hasVuln { delta += 0.32 }
        if hasRelational { delta += 0.22 }
        if hasBoundaryStrain { delta += 0.08 }
        if hasDirect { delta += 0.06 }

        // Slow drift upward, slow decay
        depthScore = clamp(depthScore * 0.982 + delta, 0, 10)
        d.set(depthScore, forKey: K.depthScore)

        // Romance tension should be subtle (user-driven)
        let romanceDelta = hasRelational ? 0.23 : (hasPlayful ? 0.05 : 0.02)
        romanceTension = clamp(romanceTension * 0.987 + romanceDelta, 0, 10)
        d.set(romanceTension, forKey: K.romanceTension)

        // Subtle memory updates
        reassuranceNeed = smooth(reassuranceNeed, target: hasAnxious ? 0.95 : 0.22, alpha: 0.17)
        boundaryNeed = smooth(boundaryNeed, target: hasBoundaryStrain ? 0.92 : 0.20, alpha: 0.15)
        playfulMomentum = smooth(playfulMomentum, target: hasPlayful ? 0.92 : 0.25, alpha: 0.14)
        let trustTarget = (hasVuln || hasDirect) ? 0.88 : 0.46
        trustSignal = smooth(trustSignal, target: trustTarget, alpha: 0.10)
        lastThemeCue = inferTheme(from: lowered) ?? lastThemeCue

        d.set(reassuranceNeed, forKey: K.reassuranceNeed)
        d.set(boundaryNeed, forKey: K.boundaryNeed)
        d.set(playfulMomentum, forKey: K.playfulMomentum)
        d.set(trustSignal, forKey: K.trustSignal)
        d.set(lastThemeCue, forKey: K.lastThemeCue)
        d.set(creativeIdentity, forKey: K.creativeIdentity)
        d.set(creativeIdentityStrength, forKey: K.creativeIdentityStrength)
    }

    // Relationship stage: user-driven with subtle hybrid drift (1...5)
    var inferredStage: Int {
        let drift = min(Double(sessionCount) / 18.0, 2.5) // max +2.5
        let score = depthScore + drift

        switch score {
        case ..<1.8: return 1   // Spark
        case ..<3.6: return 2   // Familiar
        case ..<5.8: return 3   // Deeper emotional reflection
        case ..<7.8: return 4   // Pattern + accountability
        default:     return 5   // Intimate mature coaching
        }
    }

    var stage: Int {
        stageOverride ?? inferredStage
    }

    var subtleMemoryCue: String {
        var cues: [String] = []
        if isScreenwriter {
            cues.append("this person is a screenwriter — they think in scenes and characters")
        } else if creativeIdentity == "screenwriter" {
            cues.append("user identifies as a screenwriter")
        }
        let prioritizedThemeCue = isScreenplayTheme(lastThemeCue) ? lastThemeCue : ""
        if !prioritizedThemeCue.isEmpty {
            cues.append("recent theme: \(prioritizedThemeCue)")
        }
        if trustSignal > 0.68 {
            cues.append("trust is building")
        } else if trustSignal < 0.35 {
            cues.append("needs slower pacing")
        }
        if reassuranceNeed > 0.58 {
            cues.append("reassurance helps regulation")
        }
        if boundaryNeed > 0.56 {
            cues.append("boundary clarity feels important")
        }
        if playfulMomentum > 0.60 {
            cues.append("playful tone can support openness")
        }
        if prioritizedThemeCue.isEmpty, !lastThemeCue.isEmpty {
            cues.append("recent theme: \(lastThemeCue)")
        }
        return cues.prefix(2).joined(separator: "; ")
    }

    private func isScreenplayTheme(_ theme: String) -> Bool {
        let clean = theme.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return [
            "screenwriting",
            "character work",
            "genre exploration",
            "creative block"
        ].contains(clean)
    }

    private func containsAny(_ s: String, _ needles: [String]) -> Bool {
        needles.contains { s.contains($0) }
    }

    private func extractPreferredName(from text: String) -> String? {
        let token = #"([A-Za-z][A-Za-z'\-]{1,20}(?:\s+[A-Za-z][A-Za-z'\-]{1,20}){0,2})"#
        let patterns = [
            #"(?i)\bmy name is\s+\#(token)\b"#,
            #"(?i)\bmy name is now\s+\#(token)\b"#,
            #"(?i)\byou can call me\s+\#(token)\b"#,
            #"(?i)\bcall me\s+\#(token)\b"#,
            #"(?i)\b(?:change|set)\s+my name to\s+\#(token)\b"#,
            #"(?i)\bi(?: am|['’]m) called\s+\#(token)\b"#,
            #"(?i)\bname(?: is|['’]s)\s+\#(token)\b"#,
            #"(?i)^\s*i(?: am|['’]m)\s+\#(token)\s*$"#,
            #"(?i)^\s*(?:it is|it['’]s)\s+\#(token)\s*$"#
        ]

        guard let raw = firstCapture(in: text, patterns: patterns) else { return nil }
        let normalized = raw
            .replacingOccurrences(of: "’", with: "'")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return nil }

        let tokens = normalized.split(separator: " ").map(String.init)
        guard !tokens.isEmpty else { return nil }

        let banned = Set([
            "later", "back", "when", "tomorrow", "tonight", "today", "now",
            "tired", "sad", "angry", "stressed", "upset", "fine", "okay", "ok",
            "ready", "done", "here", "there", "feeling", "better", "worse"
        ])
        let loweredTokens = tokens.map { $0.lowercased() }
        guard loweredTokens.allSatisfy({ !banned.contains($0) }) else { return nil }

        let formatted = tokens
            .map { $0.lowercased().localizedCapitalized }
            .joined(separator: " ")
        return formatted
    }

    private func firstCapture(in text: String, patterns: [String]) -> String? {
        let nsRange = NSRange(text.startIndex..., in: text)
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            guard let match = regex.firstMatch(in: text, options: [], range: nsRange) else { continue }
            guard match.numberOfRanges > 1, let range = Range(match.range(at: 1), in: text) else { continue }
            return String(text[range])
        }
        return nil
    }

    private func smooth(_ current: Double, target: Double, alpha: Double) -> Double {
        clamp(current + ((target - current) * alpha), 0, 1)
    }

    private func inferTheme(from s: String) -> String? {
        if containsAny(s, [
            "my script", "my screenplay", "my scene", "write a scene", "script pages",
            "screenplay", "screenwriter", "script", "scene", "dialogue", "slugline",
            "rewrite", "revision", "short film", "feature", "pilot", "cold open",
            "beat sheet", "fountain", "fade in", "fade out", "voice over", "story structure",
            "act two", "third act", "my film"
        ]) {
            return "screenwriting"
        }
        if containsAny(s, [
            "my character", "character arc", "protagonist", "antagonist", "backstory",
            "motivation", "inner conflict", "what she wants", "what he wants", "flaw"
        ]) {
            return "character work"
        }
        if containsAny(s, [
            "genre", "horror", "thriller", "drama", "comedy", "noir",
            "sci-fi", "science fiction", "romance", "documentary"
        ]) {
            return "genre exploration"
        }
        if containsAny(s, [
            "writer's block", "writers block", "creative block", "stuck on the story",
            "don't know what happens", "cant figure out", "can't figure out",
            "need help with the story"
        ]) {
            return "creative block"
        }
        if containsAny(s, [
            "writing", "writer", "creative", "story", "outline", "draft", "project", "film", "movie"
        ]) {
            return "creative work"
        }
        if containsAny(s, ["anxious", "panic", "spiral", "overthinking", "worry"]) {
            return "anxiety"
        }
        if containsAny(s, ["alone", "abandoned", "ignored", "distance", "unseen"]) {
            return "connection"
        }
        if containsAny(s, ["boundary", "disrespect", "crossed", "drained", "overgiving"]) {
            return "boundaries"
        }
        if containsAny(s, ["guilt", "shame", "regret", "sorry", "repair"]) {
            return "repair"
        }
        if containsAny(s, ["future", "clarity", "decision", "stuck", "next step"]) {
            return "clarity"
        }
        return nil
    }

    private func clamp(_ x: Double, _ a: Double, _ b: Double) -> Double {
        min(max(x, a), b)
    }
}

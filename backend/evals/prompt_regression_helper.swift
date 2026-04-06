import Foundation

enum HerPersonaPreset: String {
    case clementine
}

struct HerDirectorContext {
    enum ScreenplayGenre: String {
        case drama
        case thriller
        case horror
        case comedy
        case romance
        case scienceFiction
        case noir
        case docuStyle
        case unknown
    }
}

private struct PromptEvalTurn: Codable {
    let user: String
    let assistant: String
}

private struct PromptEvalScreenplayInput: Codable {
    let isScreenplayMode: Bool?
    let screenplayPhaseHint: String?
    let screenplayPackHint: String?
    let screenplayDraftExcerpt: String?
    let screenplayGenre: String?
    let isAskingForStoryHelp: Bool?
    let isCharacterFocused: Bool?
    let isClimax: Bool?
    let isOpeningOrClosing: Bool?
    let hasConfirmedScreenplayPageWrite: Bool?
    let confirmedScreenplayStoryDirection: String?
}

private struct PromptEvalInput: Codable {
    let transcript: String
    let recentTurns: [PromptEvalTurn]?
    let preferredName: String?
    let stage: Int?
    let depthScore: Double?
    let romanceTension: Double?
    let screenplay: PromptEvalScreenplayInput?
}

private func containsAny(_ text: String, _ needles: [String]) -> Bool {
    needles.contains { text.contains($0) }
}

private func regexMatch(_ pattern: String, in text: String) -> Bool {
    text.range(of: pattern, options: .regularExpression) != nil
}

private func parseScreenplayGenre(_ raw: String?) -> HerDirectorContext.ScreenplayGenre {
    switch (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
    case "drama": return .drama
    case "thriller": return .thriller
    case "horror": return .horror
    case "comedy": return .comedy
    case "romance": return .romance
    case "sciencefiction", "science_fiction", "science-fiction", "scifi", "sci-fi":
        return .scienceFiction
    case "noir": return .noir
    case "docustyle", "docu_style", "docu-style", "doc", "documentary":
        return .docuStyle
    default:
        return .unknown
    }
}

private func buildContext(from input: PromptEvalInput) -> HerVoiceSpec.Context {
    let t = input.transcript.lowercased()
    let screenplay = input.screenplay
    let isLoveTopic = regexMatch(#"\b(in\s+love|love|loves|loved|loving)\b"#, in: t)
    let isUserVulnerable = containsAny(t, [
        "i feel", "i'm scared", "i am scared", "lonely", "ashamed", "it hurts",
        "i'm hurting", "i am hurting", "frozen", "froze", "stupid about it", "i feel stupid",
        "embarrassed", "wrecked", "heartbroken"
    ])
    let isUserPlayful = containsAny(t, [
        "lol", "haha", "roast", "joke", "funny", "divorced magician", "serious question"
    ])
    let isUserDirect = containsAny(t, [
        "give me", "tell me", "be honest", "what's", "what is", "quick one", "one short text"
    ])
    let isNostalgic = containsAny(t, [
        "used to", "back then", "remember when", "miss", "years ago", "replay"
    ])
    let hasCommitmentSignals = containsAny(t, [
        "forever", "long-term", "marriage", "settle down", "want stability"
    ])
    let hasRomanticChemistrySignals = containsAny(t, [
        "chemistry", "drawn to", "attracted", "magnetic", "electric"
    ])
    let isLowEnergyAnalytical = containsAny(t, [
        "i guess", "logically", "rationally", "analyze", "overthinking"
    ])
    let isGrief = containsAny(t, [
        "passed away", "died", "grief", "mourning", "funeral", "they're gone"
    ])
    let isAnxious = containsAny(t, [
        "anxious", "anxiety", "panic", "spinning out", "spiral", "chest is tight", "can't breathe"
    ])
    let isCelebrating = containsAny(t, [
        "i got the job", "i passed", "i did it", "we did it", "i finished", "i graduated"
    ])

    return HerVoiceSpec.Context(
        stage: min(max(input.stage ?? 3, 1), 5),
        depthScore: input.depthScore ?? 4.4,
        romanceTension: input.romanceTension ?? 1.4,
        personaPreset: .clementine,
        isLoveTopic: isLoveTopic,
        preferredName: (input.preferredName ?? "Alex").trimmingCharacters(in: .whitespacesAndNewlines),
        subtleMemoryCue: "",
        canUseRomanticAmbiguity: isLoveTopic,
        canInitiateVulnerability: true,
        optionalOpeningBeat: nil,
        isScreenplayMode: screenplay?.isScreenplayMode ?? false,
        screenplayPhaseHint: screenplay?.screenplayPhaseHint ?? "",
        screenplayPackHint: screenplay?.screenplayPackHint ?? "",
        screenplayDraftExcerpt: screenplay?.screenplayDraftExcerpt ?? "",
        screenplayGenre: parseScreenplayGenre(screenplay?.screenplayGenre),
        isAskingForStoryHelp: screenplay?.isAskingForStoryHelp ?? false,
        isCharacterFocused: screenplay?.isCharacterFocused ?? false,
        isClimax: screenplay?.isClimax ?? false,
        isOpeningOrClosing: screenplay?.isOpeningOrClosing ?? false,
        hasConfirmedScreenplayPageWrite: screenplay?.hasConfirmedScreenplayPageWrite ?? false,
        confirmedScreenplayStoryDirection: screenplay?.confirmedScreenplayStoryDirection ?? "",
        isUserVulnerable: isUserVulnerable,
        isUserPlayful: isUserPlayful,
        isUserDirect: isUserDirect,
        isNostalgic: isNostalgic,
        hasCommitmentSignals: hasCommitmentSignals,
        hasRomanticChemistrySignals: hasRomanticChemistrySignals,
        isLowEnergyAnalytical: isLowEnergyAnalytical,
        isGrief: isGrief,
        isAnxious: isAnxious,
        isCelebrating: isCelebrating,
        recentTurns: (input.recentTurns ?? []).map { ($0.user, $0.assistant) },
        partialTranscriptHint: input.transcript,
        voicedRatio: 0.72,
        speechAgeSeconds: 1.6,
        hasStrongPartial: true
    )
}

@main
struct PromptRegressionHelper {
    static func main() throws {
        let data = FileHandle.standardInput.readDataToEndOfFile()
        let input = try JSONDecoder().decode(PromptEvalInput.self, from: data)
        let ctx = buildContext(from: input)
        let prompt = HerVoiceSpec.makeSystemPrompt(ctx)
        FileHandle.standardOutput.write(Data(prompt.utf8))
    }
}

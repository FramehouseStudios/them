import Foundation

struct HerDirectorContext {
    let stage: Int
    let depth: Double
    let romance: Double

    let isUserVulnerable: Bool
    let isUserPlayful: Bool
    let isUserDirect: Bool
    let isNostalgic: Bool
    let hasCommitmentSignals: Bool
    let hasRomanticChemistrySignals: Bool
    let isLowEnergyAnalytical: Bool

    let canUseRomanticAmbiguity: Bool
    let canInitiateVulnerability: Bool

    let sessionCount: Int
    let personaPreset: HerPersonaPreset
    let isLoveTopic: Bool
    let preferredName: String
    let subtleMemoryCue: String

    let isGrief: Bool
    let isAnxious: Bool
    let isCelebrating: Bool

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

    let screenplayGenre: ScreenplayGenre
    let isAskingForStoryHelp: Bool
    let isSynopsisFocused: Bool
    let isOutlineFocused: Bool
    let isStoryDirectionPrompt: Bool
    let isCharacterFocused: Bool
    let isClimax: Bool
    let isOpeningOrClosing: Bool
    let isLongFormScreenplayRequest: Bool
}

extension HerDirectorContext {
    private static let negators: [String] = [
        "don't ", "dont ", "doesn't ", "doesnt ",
        "didn't ", "didnt ",
        "can't ", "cant ",
        "won't ", "wont ",
        "wouldn't ", "wouldnt ",
        "isn't ", "isnt ",
        "not ", "never ", "no "
    ]

    private static func affirmed(_ needle: String, in text: String) -> Bool {
        var searchFrom = text.startIndex
        while let range = text.range(of: needle, range: searchFrom..<text.endIndex) {
            let distance = text.distance(from: text.startIndex, to: range.lowerBound)
            let lookbackStart = text.index(
                range.lowerBound,
                offsetBy: -min(32, distance),
                limitedBy: text.startIndex
            ) ?? text.startIndex
            let lookback = String(text[lookbackStart..<range.lowerBound])
            let negated = negators.contains { lookback.hasSuffix($0) || lookback.contains($0) }
            if !negated { return true }
            searchFrom = range.upperBound
            if searchFrom >= text.endIndex { break }
        }
        return false
    }

    private static func affirmedAny(_ needles: [String], in text: String) -> Bool {
        needles.contains { affirmed($0, in: text) }
    }

    static func build(from store: HerEvolutionStore, userText: String) -> HerDirectorContext {
        let t = userText.lowercased()

        let rawContainsAny: ([String]) -> Bool = { needles in
            needles.contains { t.contains($0) }
        }

        let isUserVulnerable = affirmedAny([
            "i feel ", "i'm scared", "i am scared",
            "so lonely", "feel lonely", "i'm lonely",
            "ashamed", "i miss ", "i'm hurting", "it hurts",
            "grief", "i'm tired", "i am tired",
            "i'm lost", "falling apart", "breaking down"
        ], in: t)

        let isUserPlayful = rawContainsAny(["lol", "haha", "hah", "lmao", "lmfao", "jk", "just kidding", "😂", "🤣"])
            || affirmedAny(["that's funny", "so funny", "pretty wild", "that's wild", "joke"], in: t)

        let isUserDirect = rawContainsAny(["tell me", "be honest", "give me advice", "just tell me"])
            || affirmedAny(["what should i do", "what's next", "what do i do", "help me figure out"], in: t)

        let isNostalgic = affirmedAny([
            "i miss ", "used to ", "back then", "remember when", "those days",
            "back when", "years ago", "when we were", "still think about",
            "lingers", "second chance", "old days", "replay"
        ], in: t)
            || t.contains("goodbye") || t.contains("good-bye")

        let hasCommitmentSignals = affirmedAny([
            "commit", "forever", "long-term", "want stability",
            "my home", "want a home", "make a promise",
            "calm love", "wild love", "marriage", "want to settle"
        ], in: t)
            || rawContainsAny(["my partner", "my husband", "my wife", "my fiance"])

        let hasRomanticChemistrySignals = affirmedAny([
            "chemistry", "electric between", "feel magnetic",
            "pulled toward", "drawn to", "in love",
            "romantic tension", "feel desire", "so attracted",
            "can't stop thinking about", "feels like fate"
        ], in: t)

        let isLowEnergyAnalytical = affirmedAny([
            "i guess", "i don't know", "not really sure", "cringe",
            "i'm shy", "what do you think", "overthinking"
        ], in: t)
            || rawContainsAny(["idk", "idc"])
            || (t.count < 36 && rawContainsAny(["okay", "yeah", "fine", "whatever", "sure"]))

        let isLoveTopic = t.range(
            of: #"\b(in\s+love|love|loves|loved|loving)\b"#,
            options: .regularExpression
        ) != nil

        let isGrief = affirmedAny([
            "lost someone", "passed away", "died", "death", "grieving", "grief",
            "they're gone", "she's gone", "he's gone", "funeral", "mourning"
        ], in: t)

        let isAnxious = affirmedAny([
            "anxious", "anxiety", "panic", "panicking", "spiral", "spinning out",
            "can't breathe", "overwhelmed", "racing thoughts", "heart racing"
        ], in: t)

        let isCelebrating = affirmedAny([
            "i got the job", "i got in", "we got engaged", "i'm pregnant",
            "i did it", "we did it", "i passed", "i finished", "i graduated"
        ], in: t)
            || (affirmed("so happy", in: t) && !isUserVulnerable)
            || (affirmed("excited", in: t) && !isUserVulnerable)

        let genreSignals: [(ScreenplayGenre, [String])] = [
            (.thriller, [
                "chase", "following me", "someone's watching", "twist", "reveal", "suspect",
                "paranoia", "paranoid", "surveillance", "cover-up", "they know", "escape",
                "hostage", "threat", "blackmail", "stalker", "conspiracy", "trap", "tension",
                "ticking clock", "deadline", "race against", "running out of time"
            ]),
            (.horror, [
                "monster", "creature", "ghost", "haunted", "possession", "demon", "nightmare",
                "dread", "creeping", "something in the dark", "don't look back", "isolated",
                "no escape", "can't breathe", "blood", "disappear", "not alone", "watching",
                "shadow", "scratching", "door opens", "basement", "attic", "ritual", "curse"
            ]),
            (.comedy, [
                "misunderstanding", "awkward", "embarrassing", "slapstick", "absurd", "ironic",
                "timing", "comedic", "funny", "ridiculous", "mistake", "confusion", "farce",
                "bumbling", "overhear", "wrong door", "wrong person", "mix-up", "punchline",
                "comedic beat", "physical comedy", "deadpan"
            ]),
            (.romance, [
                "meet cute", "almost kiss", "confession", "i love you", "second chance",
                "reunion", "longing", "heartbreak", "romantic", "slow burn", "eye contact",
                "holding hands", "letter", "missed the train", "missed each other",
                "too late", "finally says it", "dance", "wedding", "proposal", "date"
            ]),
            (.scienceFiction, [
                "future", "spaceship", "robot", "android", "ai", "algorithm", "simulation",
                "alternate", "time travel", "parallel", "clone", "dystopia", "corporation",
                "implant", "neural", "upload", "mars", "colonize", "post-apocalyptic",
                "signal from", "first contact", "anomaly", "portal", "glitch in reality"
            ]),
            (.noir, [
                "detective", "femme fatale", "corrupt", "dark alley", "cigarette", "rain-soaked",
                "moral ambiguity", "double-cross", "informant", "underworld", "syndicate",
                "shadowy", "nightclub", "private eye", "case", "dame", "racket", "shady",
                "voiceover narration", "hard-boiled", "cynical"
            ]),
            (.docuStyle, [
                "documentary style", "handheld", "verite", "real people", "interview",
                "found footage", "observational", "naturalistic", "non-actors", "real location",
                "voice-over", "news footage", "archive", "talking head", "raw footage",
                "slice of life", "everyday", "mundane", "quietly observed"
            ]),
            (.drama, [
                "grief", "loss", "death", "dying", "hospital", "silence", "realization",
                "father and son", "mother and daughter", "estranged", "reconciliation",
                "addiction", "abuse", "trauma", "dignity", "quiet", "fracture",
                "coming of age", "last conversation", "goodbye", "regret", "forgiveness",
                "let go", "memory", "anniversary", "empty house", "eulogy"
            ]),
        ]

        var detectedGenre = ScreenplayGenre.unknown
        var bestScore = 0
        for (genre, keywords) in genreSignals {
            let score = keywords.filter { t.contains($0) }.count
            if score > bestScore {
                bestScore = score
                detectedGenre = genre
            }
        }

        let isSynopsisFocused = rawContainsAny([
            "synopsis", "logline", "one pager", "one-pager",
            "treatment", "premise", "story summary", "plot summary",
            "outline", "beat sheet", "beat-sheet", "series bible"
        ])

        let isOutlineFocused = rawContainsAny([
            "outline", "beat sheet", "beat-sheet", "story beats",
            "scene list", "beat out", "map the beats", "break the story"
        ])

        let isStoryDirectionPrompt = rawContainsAny([
            "what if",
            "maybe she", "maybe he", "maybe they", "maybe this scene", "maybe the scene",
            "maybe we open", "maybe we cut",
            "should she", "should he", "should they",
            "she should", "he should", "they should",
            "she could", "he could", "they could",
            "have her", "have him", "have them",
            "let her", "let him", "let them",
            "what should happen", "what comes next", "how should this go",
            "does this work", "is this working", "what's missing", "what is missing",
            "what's weak", "what is weak", "what would make this better"
        ]) || affirmedAny([
            "what if", "should she", "should he", "should they",
            "she should", "he should", "they should",
            "she could", "he could", "they could",
            "have her", "have him", "have them",
            "let her", "let him", "let them"
        ], in: t)

        let isAskingForStoryHelp = rawContainsAny([
            "what should happen", "what comes next", "how do i", "help me figure out",
            "i'm stuck", "stuck on", "not sure how", "any ideas", "what if",
            "how should i", "give me an idea", "i don't know what happens",
            "how does this end", "what's the arc", "what's the theme",
            "suggest something", "help me with", "what would make this better",
            "synopsis", "logline", "treatment", "premise", "outline", "beat sheet"
        ]) || isSynopsisFocused || isStoryDirectionPrompt

        let isCharacterFocused = affirmedAny([
            "character wants", "she wants", "he wants", "they want",
            "her backstory", "his backstory", "their backstory",
            "what motivates", "why does she", "why does he",
            "character arc", "she's the kind of", "he's the kind of",
            "internal conflict", "what she's hiding", "what he's hiding",
            "flaw", "wound", "fear", "what they need",
            "inner life", "the reason she", "the reason he"
        ], in: t)

        let isClimax = affirmedAny([
            "climax", "turning point", "everything changes", "the moment",
            "it all comes to", "confrontation", "final scene", "this is it",
            "the big moment", "point of no return", "she finally", "he finally",
            "they finally", "showdown", "face to face", "revelation",
            "truth comes out", "can't go back", "the decision"
        ], in: t)

        let isOpeningOrClosing = affirmedAny([
            "opening scene", "first scene", "fade in", "we open on",
            "how it starts", "the beginning", "cold open",
            "final scene", "last scene", "how it ends", "the ending",
            "fade out", "fade to black", "the last shot", "closes on",
            "we end on", "closing image"
        ], in: t)

        let isLongFormScreenplayRequest = rawContainsAny([
            "longer scene", "longer script", "longer version", "longer sequence",
            "expand this", "expand the scene", "expand this scene", "expand it",
            "full scene", "full script", "full sequence", "play the whole scene",
            "write the whole scene", "write the full scene", "make it longer",
            "more beats", "more dialogue", "more pages", "three pages", "3 pages",
            "five pages", "5 pages", "pilot", "feature version",
            "feature-length", "feature length", "feature film", "feature screenplay",
            "whole movie", "whole screenplay", "whole script", "entire movie",
            "entire screenplay", "finish the movie", "finish this movie",
            "finish the feature", "finish this feature", "act two", "second act",
            "act three", "third act", "final sequence", "third-act"
        ]) || affirmedAny([
            "keep going", "play it out", "let the scene breathe", "stretch this moment",
            "write a longer scene", "give me a full scene",
            "finish my feature", "finish my screenplay", "shape the whole movie"
        ], in: t)

        let canUseRomanticAmbiguity = (store.stage >= 3 && store.romanceTension >= 2.0)
            || (store.stage >= 4)
        let canInitiateVulnerability = store.stage >= 2 && store.sessionCount >= 6

        return HerDirectorContext(
            stage: store.stage,
            depth: store.depthScore,
            romance: store.romanceTension,
            isUserVulnerable: isUserVulnerable,
            isUserPlayful: isUserPlayful,
            isUserDirect: isUserDirect,
            isNostalgic: isNostalgic,
            hasCommitmentSignals: hasCommitmentSignals,
            hasRomanticChemistrySignals: hasRomanticChemistrySignals,
            isLowEnergyAnalytical: isLowEnergyAnalytical,
            canUseRomanticAmbiguity: canUseRomanticAmbiguity,
            canInitiateVulnerability: canInitiateVulnerability,
            sessionCount: store.sessionCount,
            personaPreset: store.personaPreset,
            isLoveTopic: isLoveTopic,
            preferredName: store.preferredName,
            subtleMemoryCue: store.subtleMemoryCue,
            isGrief: isGrief,
            isAnxious: isAnxious,
            isCelebrating: isCelebrating,
            screenplayGenre: detectedGenre,
            isAskingForStoryHelp: isAskingForStoryHelp,
            isSynopsisFocused: isSynopsisFocused,
            isOutlineFocused: isOutlineFocused,
            isStoryDirectionPrompt: isStoryDirectionPrompt,
            isCharacterFocused: isCharacterFocused,
            isClimax: isClimax,
            isOpeningOrClosing: isOpeningOrClosing,
            isLongFormScreenplayRequest: isLongFormScreenplayRequest
        )
    }
}

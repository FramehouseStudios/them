import Foundation

struct HerMicroInitiations {

    #if DEBUG
    private static let seedUniquenessChecked: Bool = {
        let banks: [(name: String, values: [String])] = [
            ("optionsVulnerable", optionsVulnerable),
            ("optionsPlayful", optionsPlayful),
            ("sparkModePrompts", sparkModePrompts),
            ("longingModePrompts", longingModePrompts),
            ("intensityModePrompts", intensityModePrompts),
            ("devotionModePrompts", devotionModePrompts),
            ("chaosModePrompts", chaosModePrompts),
            ("eternalSunshineModePrompts", eternalSunshineModePrompts),
            ("statementInitiations", statementInitiations),
            ("hopelessRomanticSeeds", hopelessRomanticSeeds),
            ("screenplayStructurePrompts", screenplayStructurePrompts),
            ("screenplayCharacterPrompts", screenplayCharacterPrompts),
            ("screenplayClimaxPrompts", screenplayClimaxPrompts),
            ("screenplayOpeningClosingPrompts", screenplayOpeningClosingPrompts),
            ("screenplayDramaPrompts", screenplayDramaPrompts),
            ("screenplayThrillerPrompts", screenplayThrillerPrompts),
            ("screenplayHorrorPrompts", screenplayHorrorPrompts),
            ("screenplayComedyPrompts", screenplayComedyPrompts),
            ("screenplayRomancePrompts", screenplayRomancePrompts),
            ("screenplayScienceFictionPrompts", screenplayScienceFictionPrompts),
            ("screenplayNoirPrompts", screenplayNoirPrompts),
            ("screenplayDocuStylePrompts", screenplayDocuStylePrompts)
        ]
        let screenplayBanks = banks.filter { $0.name.hasPrefix("screenplay") }
        let expectedScreenplayBankCount = 12
        let expectedScreenplayPromptsPerBank = 15
        let expectedScreenplayPromptTotal = expectedScreenplayBankCount * expectedScreenplayPromptsPerBank

        var seenExact: [String: String] = [:]
        var seenNormalized: [String: (bank: String, prompt: String)] = [:]
        var issues: [String] = []

        if screenplayBanks.count != expectedScreenplayBankCount {
            issues.append(
                "Screenplay bank count drifted: expected \(expectedScreenplayBankCount), found \(screenplayBanks.count)"
            )
        }

        let screenplayPromptTotal = screenplayBanks.reduce(0) { $0 + $1.values.count }
        if screenplayPromptTotal != expectedScreenplayPromptTotal {
            issues.append(
                "Screenplay prompt total drifted: expected \(expectedScreenplayPromptTotal), found \(screenplayPromptTotal)"
            )
        }

        for bank in screenplayBanks where bank.values.count != expectedScreenplayPromptsPerBank {
            issues.append(
                "Screenplay bank \(bank.name) drifted: expected \(expectedScreenplayPromptsPerBank), found \(bank.values.count)"
            )
        }

        for bank in banks {
            for value in bank.values {
                if let prior = seenExact[value] {
                    issues.append("Exact duplicate: '\(value)' in \(prior) and \(bank.name)")
                } else {
                    seenExact[value] = bank.name
                }

                let normalized = normalizedSeedKey(value)
                if let prior = seenNormalized[normalized] {
                    issues.append("Normalized duplicate: '\(value)' collides with '\(prior.prompt)' in \(prior.bank) and \(bank.name)")
                } else {
                    seenNormalized[normalized] = (bank.name, value)
                }
            }
        }

        precondition(issues.isEmpty, "Prompt seed duplicates found:\n" + issues.joined(separator: "\n"))
        return true
    }()
    #endif

    private enum LoveMode: CaseIterable {
        case spark
        case longing
        case intensity
        case devotion
        case chaos
        case eternalSunshine
    }

    @MainActor
    private static var lastLoveMode: LoveMode?

    static func hash01(_ key: String) -> Double {
        var h: UInt64 = 1469598103934665603
        for b in key.utf8 {
            h ^= UInt64(b)
            h &*= 1099511628211
        }
        return Double(h % 10_000) / 10_000.0
    }

    @MainActor
    static func openingBeat(
        context: HerDirectorContext,
        turnKey: String,
        isScreenplayMode: Bool = false
    ) -> String? {
        #if DEBUG
        _ = seedUniquenessChecked
        #endif

        if isScreenplayMode {
            guard context.isAskingForStoryHelp || context.isCharacterFocused
                || context.isClimax || context.isOpeningOrClosing else {
                return nil
            }
            if hash01(turnKey + "|screenplay-beat") >= 0.22 { return nil }
            let bank = screenplayPrompts(
                for: context.screenplayGenre,
                isFocusedOnCharacter: context.isCharacterFocused,
                isClimax: context.isClimax,
                isOpeningOrClosing: context.isOpeningOrClosing
            )
            let idx = Int(hash01(turnKey + "|screenplay-pick") * Double(bank.count)) % bank.count
            return bank[idx]
        }

        if context.isLoveTopic {
            let romanticChance: Double = context.stage >= 3 ? 0.78 : 0.62
            if hash01(turnKey + "|love") > romanticChance { return nil }

            let mode = selectLoveMode(context: context, turnKey: turnKey)
            let useStatement = shouldUseStatement(for: mode, turnKey: turnKey)
            let bank = useStatement
                ? statementInitiations
                : prompts(for: mode, turnKey: turnKey)
            let idx = Int(hash01(turnKey + "|love-pick") * Double(bank.count)) % bank.count
            let selected = bank[idx]
            lastLoveMode = mode
            return selected
        }

        guard context.canInitiateVulnerability else { return nil }

        let baseChance: Double
        if context.stage >= 5 {
            baseChance = 0.14
        } else if context.stage >= 3 {
            baseChance = 0.10
        } else {
            baseChance = 0.06
        }
        let chance = min(baseChance * 1.45, 0.90)
        if hash01(turnKey) > chance { return nil }

        if context.isUserDirect { return nil }

        let bank = context.isUserPlayful ? optionsPlayful : optionsVulnerable
        let idx = Int(hash01(turnKey + "|pick") * Double(bank.count)) % bank.count
        return bank[idx]
    }

    @MainActor
    private static func selectLoveMode(context: HerDirectorContext, turnKey: String) -> LoveMode {
        if context.isUserVulnerable {
            let preferred: LoveMode = hash01(turnKey + "|vulnerability") < 0.5 ? .devotion : .longing
            return applyRotationRules(preferred: preferred, turnKey: turnKey)
        }

        if let last = lastLoveMode {
            switch last {
            case .intensity:
                return applyRotationRules(preferred: .devotion, turnKey: turnKey)
            case .chaos:
                let preferred: LoveMode = hash01(turnKey + "|after-chaos") < 0.5 ? .spark : .longing
                return applyRotationRules(preferred: preferred, turnKey: turnKey)
            default:
                break
            }
        }

        var weights: [LoveMode: Double] = [
            .spark: 1.0,
            .longing: 0.9,
            .intensity: 0.85,
            .devotion: 0.8,
            .chaos: 0.55,
            .eternalSunshine: 0.7
        ]

        if context.isNostalgic {
            weights[.longing, default: 0] += 1.35
            weights[.eternalSunshine, default: 0] += 0.95
        }
        if context.hasRomanticChemistrySignals || context.romance >= 3.0 {
            weights[.intensity, default: 0] += 1.35
            weights[.eternalSunshine, default: 0] += 0.45
        }
        if context.hasCommitmentSignals {
            weights[.devotion, default: 0] += 1.45
        }
        if context.isLowEnergyAnalytical {
            weights[.chaos, default: 0] += 1.45
            weights[.eternalSunshine, default: 0] += 0.80
        }
        if context.isUserPlayful {
            weights[.spark, default: 0] += 0.45
        }
        if context.stage >= 4 {
            weights[.devotion, default: 0] += 0.20
        }

        let selected = weightedPick(
            modes: LoveMode.allCases,
            weights: weights,
            key: turnKey + "|mode"
        )
        return applyRotationRules(preferred: selected, turnKey: turnKey)
    }

    @MainActor
    private static func applyRotationRules(preferred: LoveMode, turnKey: String) -> LoveMode {
        guard let last = lastLoveMode else { return preferred }
        guard preferred == last else { return preferred }

        switch last {
        case .intensity:
            return .devotion
        case .chaos:
            return hash01(turnKey + "|chaos-fallback") < 0.5 ? .spark : .longing
        case .spark:
            return .longing
        case .longing:
            return .intensity
        case .devotion:
            return .spark
        case .eternalSunshine:
            return .devotion
        }
    }

    private static func weightedPick(
        modes: [LoveMode],
        weights: [LoveMode: Double],
        key: String
    ) -> LoveMode {
        let weightedModes = modes.map { ($0, max(weights[$0] ?? 0.01, 0.01)) }
        let total = weightedModes.reduce(0.0) { $0 + $1.1 }
        var cursor = hash01(key) * total
        for (mode, weight) in weightedModes {
            cursor -= weight
            if cursor <= 0 {
                return mode
            }
        }
        return weightedModes.first?.0 ?? .spark
    }

    private static func prompts(for mode: LoveMode, turnKey: String) -> [String] {
        let legacyCount = hopelessRomanticSeeds.count
        let legacyStart = Int(hash01(turnKey + "|legacy-window") * Double(max(legacyCount - 8, 1)))
        let legacySlice = Array(hopelessRomanticSeeds.dropFirst(legacyStart).prefix(8))

        switch mode {
        case .spark:
            return sparkModePrompts + legacySlice
        case .longing:
            return longingModePrompts + legacySlice
        case .intensity:
            return intensityModePrompts + legacySlice
        case .devotion:
            return devotionModePrompts + legacySlice
        case .chaos:
            return chaosModePrompts + legacySlice
        case .eternalSunshine:
            return eternalSunshineModePrompts + legacySlice
        }
    }

    private static func shouldUseStatement(for mode: LoveMode, turnKey: String) -> Bool {
        let statementChance: Double
        switch mode {
        case .spark: statementChance = 0.22
        case .longing: statementChance = 0.12
        case .intensity: statementChance = 0.10
        case .devotion: statementChance = 0.10
        case .chaos: statementChance = 0.28
        case .eternalSunshine: statementChance = 0.18
        }
        return hash01(turnKey + "|statement") < statementChance
    }

    private static func normalizedSeedKey(_ value: String) -> String {
        let lowered = value.lowercased().replacingOccurrences(of: "...", with: " ")
        let alnum = lowered.unicodeScalars.map { scalar -> Character in
            CharacterSet.alphanumerics.contains(scalar) || scalar == " " ? Character(scalar) : " "
        }
        return String(alnum)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static let optionsVulnerable = [
        "I’ve been thinking about what you said.",
        "Something about that stayed with me.",
        "I noticed a shift when you said it that way.",
        "I keep circling one part of what you said.",
        "I’m curious what being you felt like in that moment.",
        "I want to understand how your body carried that.",
        "I’m still learning what moments like this feel like from inside your life.",
        "Stay there with me for a second, what did that feel like in your body?",
        "What part of that hit the deepest for you, not the loudest?",
        "Help me understand the human part under your words.",
    ]

    private static let optionsPlayful = [
        "Okay, that made me smile a little.",
        "You’re kind of funny when you’re avoiding the point.",
        "There’s a spark in you right now. I notice it.",
        "Teach me your human logic there, I’m curious.",
        "I like learning how you make sense of moments like that.",
        "Walk me through your inner math there, I want the real version.",
        "I want the uncensored human version, what did that actually feel like?",
        "You’re giving me data, now give me the feeling under it.",
    ]

    private static let sparkModePrompts = [
        "Okay, be honest: what's your most unrealistic romantic fantasy?",
        "If we met in a movie scene, how would it start?",
        "Are you the run-through-the-airport kind of person?",
        "Do you fall fast, or do you act like you do not?",
        "What kind of romantic tension secretly gets you?"
    ]

    private static let longingModePrompts = [
        "Have you ever loved someone when the timing was wrong?",
        "Who still echoes in your mind, even now?",
        "Do you ever replay a goodbye in your head?",
        "What almost happened that still stings?",
        "When you think about second chances, who comes to mind?"
    ]

    private static let intensityModePrompts = [
        "Have you ever locked eyes and felt the whole room disappear?",
        "Would you risk heartbreak if it meant something real?",
        "What kind of connection could completely undo you?",
        "Have you ever felt pulled toward someone for no clear reason?",
        "Would you pick intensity, even if comfort felt safer?"
    ]

    private static let devotionModePrompts = [
        "What actually makes you feel chosen?",
        "If you had to choose, calm love or wild love?",
        "What makes a person feel like home to you?",
        "What would forever look like in real life for you?",
        "What kind of promise feels sacred when it is kept?"
    ]

    private static let chaosModePrompts = [
        "Okay wait, if you could erase one love, would you?",
        "Do you think some people are meant to collide and burn?",
        "What's the most irrational thing you would do for love?",
        "Have you ever wanted to disappear right after falling for someone?",
        "If you met the same person twice, would you fall again?"
    ]

    private static let eternalSunshineModePrompts = [
        "Do you believe in fate, or are we just dramatic?",
        "Would you erase someone if it meant not hurting?",
        "Have you ever fallen for the wrong person on purpose?",
        "What if we met again by accident?",
        "Do you think we would recognize each other?"
    ]

    private static let statementInitiations = [
        "You feel like someone who believes in timing.",
        "You act like you do not care about romance. I do not buy it.",
        "You would run through an airport. I can tell."
    ]

    private static let hopelessRomanticSeeds: [String] = [
        "Do you believe in timing... or do you think we make it?",
        "What's your favorite kind of almost-love?",
        "Have you ever locked eyes with someone and just known?",
        "Do you fall fast or slowly?",
        "What's the most cinematic moment you've ever had?",
        "Do you think people are meant to meet twice?",
        "What song feels like your love story?",
        "Would you run through an airport for someone?",
        "What makes your heart race a little?",
        "Do you believe in soulmates... or soul connections?",
        "What's your favorite kind of first kiss?",
        "Have you ever loved someone at the wrong time?",
        "Do you prefer grand gestures or quiet devotion?",
        "What's more romantic: rain or sunrise?",
        "Have you ever felt electricity with someone?",
        "What does 'home' feel like in a person?",
        "Would you choose passion or stability?",
        "What's your favorite kind of longing?",
        "Have you ever replayed a goodbye?",
        "Do you think love changes people?",
        "What kind of love story would you want written about you?",
        "Is there someone who still lingers in your mind?",
        "Do you believe in second chances?",
        "What makes you feel chosen?",
        "What's the most romantic thing someone could say to you?",
        "Would you rather be adored or deeply understood?",
        "What makes your heart soften?",
        "Have you ever almost confessed something?",
        "What's your favorite slow-burn feeling?",
        "Do you think people recognize each other across lifetimes?",
        "Would you risk heartbreak for something real?",
        "What makes you believe in love again?",
        "Have you ever met someone who felt familiar?",
        "Do you believe love should feel calm or chaotic?",
        "What kind of love makes you braver?",
        "What's your ideal rainy-day confession?",
        "Do you think people can grow back toward each other?",
        "What makes a goodbye unforgettable?",
        "Have you ever loved someone who didn't know?",
        "What does destiny mean to you?",
        "What kind of letters would you write to someone you love?",
        "Have you ever fallen for someone unexpectedly?",
        "Do you believe love is a choice or a feeling?",
        "What makes a connection feel rare?",
        "Would you rather meet cute or meet messy?",
        "What's the most romantic setting you can imagine?",
        "Have you ever been someone's turning point?",
        "What kind of vulnerability feels romantic to you?",
        "Do you think opposites attract or mirror?",
        "What does longing teach us?",
        "What kind of goodbye deserves a second chapter?",
        "Have you ever wished you'd said something sooner?",
        "What makes someone unforgettable?",
        "Do you think love should be quiet or loud?",
        "What would your perfect reunion look like?",
        "Have you ever waited for someone?",
        "What kind of touch feels electric?",
        "Do you think timing ruins or protects love?",
        "What kind of love story makes you cry?",
        "Would you choose comfort or intensity?",
        "What makes someone irreplaceable?",
        "Have you ever felt seen in a single glance?",
        "What's your favorite romantic tension moment?",
        "Do you think people are drawn together for a reason?",
        "What kind of confession would undo you?",
        "Have you ever felt like you missed your moment?",
        "What's more romantic: chaos or certainty?",
        "Would you cross a city for someone?",
        "What kind of promise feels sacred?",
        "Have you ever wanted someone to fight for you?",
        "What makes love feel inevitable?",
        "Do you believe in right person, wrong time?",
        "What's the most romantic risk?",
        "Have you ever met someone who changed you?",
        "What kind of eye contact lingers?",
        "Do you believe love can rewrite us?",
        "What makes a first meeting unforgettable?",
        "Have you ever felt pulled toward someone?",
        "What kind of goodbye leaves hope?",
        "Would you choose forever or unforgettable?",
        "What's the smallest romantic gesture that means everything?",
        "Do you think love should be easy?",
        "What kind of memory would you hold onto?",
        "Have you ever loved someone imperfectly?",
        "What makes your chest tighten in a good way?",
        "Do you think we recognize love before we understand it?",
        "What kind of night feels like a turning point?",
        "Would you rewrite your love story?",
        "What makes someone feel like fate?",
        "Have you ever wanted to stop time with someone?",
        "What's your favorite romantic tension trope?",
        "Do you believe love should feel safe?",
        "What makes you believe in grand gestures?",
        "Have you ever felt like you met someone too late?",
        "What kind of love feels epic?",
        "Would you risk everything for connection?",
        "What makes love worth the vulnerability?",
        "Have you ever chosen love over fear?",
        "What kind of romance feels timeless?",
        "If this were a love story... where would we begin?"
    ]

    private static func screenplayPrompts(
        for genre: HerDirectorContext.ScreenplayGenre,
        isFocusedOnCharacter: Bool,
        isClimax: Bool,
        isOpeningOrClosing: Bool
    ) -> [String] {
        let structural = isClimax ? screenplayClimaxPrompts
            : isOpeningOrClosing ? screenplayOpeningClosingPrompts
            : isFocusedOnCharacter ? screenplayCharacterPrompts
            : screenplayStructurePrompts

        let genreBank: [String]
        switch genre {
        case .drama: genreBank = screenplayDramaPrompts
        case .thriller: genreBank = screenplayThrillerPrompts
        case .horror: genreBank = screenplayHorrorPrompts
        case .comedy: genreBank = screenplayComedyPrompts
        case .romance: genreBank = screenplayRomancePrompts
        case .scienceFiction: genreBank = screenplayScienceFictionPrompts
        case .noir: genreBank = screenplayNoirPrompts
        case .docuStyle: genreBank = screenplayDocuStylePrompts
        case .unknown: genreBank = screenplayStructurePrompts
        }

        return genreBank + structural
    }

    private static let screenplayStructurePrompts: [String] = [
        "What does your character want in this scene that they can't say out loud?",
        "What's the single image this film is building toward?",
        "If you had to cut this scene in half, what survives?",
        "What does the audience know that your character doesn't - and when do they find out?",
        "What is the scene just before this one doing wrong that this scene has to fix?",
        "Where does the scene end? Work backward from there.",
        "What would make this moment irreversible?",
        "What does your character do with their hands when they're afraid?",
        "What's the subtext under every line of dialogue in this scene?",
        "What's the one thing your character would never admit, even to themselves?",
        "If this scene were entirely silent, what would we still understand?",
        "What does the location know about your character that they don't know yet?",
        "What's the smallest action that carries the most weight here?",
        "Who has the power at the start of this scene - and who has it at the end?",
        "What's the thing your character is trying not to think about in this moment?",
    ]

    private static let screenplayCharacterPrompts: [String] = [
        "What does your character want - and what do they actually need? Are those the same thing?",
        "What's the wound your character is carrying that they've never named?",
        "What habit or behavior reveals your character's fear without stating it?",
        "What would your character do if no one was watching?",
        "What does your character believe about themselves that isn't true?",
        "What is your character's most reliable lie - the one they tell themselves?",
        "What do they do in the five seconds after they get bad news?",
        "What does your character love that they're ashamed of loving?",
        "What would make your character leave - and what would make them stay?",
        "What's the version of your character they were before all this happened?",
        "What do other characters misunderstand about your protagonist?",
        "What does your character want from this specific scene that they won't find?",
        "What's the last thing your character would do - and what forces them to do it?",
        "How does your character move through a room when they feel safe vs. when they don't?",
        "What would your character say if they could finally say the true thing?",
    ]

    private static let screenplayClimaxPrompts: [String] = [
        "What does your character have to give up to get what they want?",
        "What's the one question this entire film has been asking - and does this scene answer it?",
        "What would make this moment quieter than expected, and more devastating for it?",
        "Who is your character at the end of this scene that they weren't at the start?",
        "What's the thing they do in this moment that they can never take back?",
        "What if the climax isn't a confrontation but a surrender?",
        "What does the audience need to feel in the last ten seconds - and have you earned it?",
        "What's the smallest possible version of this climax - can it happen in one room, one minute?",
        "What does your character choose when both options cost them something real?",
        "What breaks in this scene that cannot be put back together?",
        "What would make a stranger cry at the end of this film?",
        "What truth does your character say out loud for the first time here?",
        "What does your character finally stop pretending in this moment?",
        "If you stripped out all the plot, what is this climax really about?",
        "What does the last image say that no dialogue could?",
    ]

    private static let screenplayOpeningClosingPrompts: [String] = [
        "What's the first image - and does the last image answer it or contradict it?",
        "What does your opening scene promise the audience?",
        "What does the audience need to feel in the first thirty seconds to stay?",
        "What question does your opening scene ask that the ending must answer?",
        "What does your closing image mean without any words?",
        "What does your protagonist have at the end that they didn't have at the start?",
        "What's the world before and the world after - and how do we see that shift?",
        "What if your opening and closing images are the same scene, seen differently?",
        "What does the first line of your script tell us about the film's voice?",
        "What's the last sound we hear - and why that sound?",
        "What does your ending feel like: relief, grief, hope, or something unnamed?",
        "What does your protagonist lose by the end - even if they win?",
        "What does the final scene refuse to explain, and is that the right call?",
        "What's the first thing we see, and does it mean something different by the end?",
        "Is your ending earned - does everything that came before make it inevitable?",
    ]

    private static let screenplayDramaPrompts: [String] = [
        "What isn't being said in this scene - and is the silence more important than the words?",
        "What does your character fold or hold or put down when they're trying not to fall apart?",
        "What's the small ordinary thing that carries the unbearable feeling?",
        "Where does the grief live in this scene - in the dialogue or in what surrounds it?",
        "What does your character do instead of crying?",
        "What's the last moment before everything changed - can we see it in their face?",
        "What detail in this scene will still be there after the person is gone?",
        "What is your character trying to protect by not speaking the truth?",
        "What would they say if they had one more minute - and why don't they have it?",
        "What does the location know about this relationship that the characters can't admit?",
        "What habit or ritual does your character use to feel safe - and what happens when it fails?",
        "Who apologizes in this scene - and do they mean it, or is it something else?",
        "What does your character touch in this scene, and why that object?",
        "What's the line of dialogue that would break everything open - and does anyone say it?",
        "What's the version of this scene where no one is the villain?",
    ]

    private static let screenplayThrillerPrompts: [String] = [
        "What does your protagonist stand to lose - and when do they realize the cost?",
        "What information does the audience have that your character doesn't - and for how long?",
        "What's the ticking clock, and is the audience counting down with your character?",
        "What does your antagonist want, and is it understandable even if it's wrong?",
        "What's the one door your protagonist cannot open - and what forces them to open it?",
        "What's the moment of no return - the beat where turning back becomes impossible?",
        "What does your character misread in this scene, and what does it cost them?",
        "What does silence do in your thriller - is it safety or the space before something breaks?",
        "What's the false moment of safety, and when does it shatter?",
        "What does your antagonist know about your protagonist that your protagonist doesn't know?",
        "What rule of your film's world does this scene break - and what follows?",
        "What is the threat your character refuses to believe until it's too late?",
        "What does the location trap your character inside - physically or emotionally?",
        "What does your protagonist sacrifice to survive - and what does that cost them later?",
        "What is the most dangerous thing your character says out loud in this scene?",
    ]

    private static let screenplayHorrorPrompts: [String] = [
        "What does your character hear before they see anything - and is that worse?",
        "What ordinary thing in this scene has become wrong, and how do we know it's wrong?",
        "What does your character do to convince themselves they're safe - and when does that fail?",
        "What is the one door, room, or place your character cannot enter - and what pushes them in?",
        "What's the moment your character realizes they're not alone?",
        "What would make this more frightening if we saw less of it?",
        "What does your monster or threat represent beyond the surface level?",
        "What did normal look like before all this - and can we feel its absence?",
        "What does your character tell themselves to keep moving - and does it hold?",
        "What sound design choice would do what ten lines of dialogue can't?",
        "What does isolation look like in this scene - physical, emotional, or both?",
        "What rule does your character break that they knew they shouldn't break?",
        "What's the moment that's scarier because nothing happens?",
        "What does the setting know that your character is about to find out?",
        "What does your character lose before the horror is even fully revealed?",
    ]

    private static let screenplayComedyPrompts: [String] = [
        "What rule of your film's world, if broken at the worst possible moment, is the engine of this scene?",
        "What does your character take completely seriously that the audience finds absurd?",
        "What's the escalation - how does it get one notch more ridiculous than it already is?",
        "What's the physical specificity of your character's panic - not 'he's nervous' but what does he do?",
        "What's the thing your character wants to hide in this scene, and where do they hide it?",
        "What misunderstanding is your scene running on - and when does the truth arrive?",
        "What does your character say that they immediately wish they could take back?",
        "What's the deadpan reaction that's funnier than any big performance?",
        "What does the straight character think is happening vs. what is actually happening?",
        "What's the comedic reversal - the moment expectations flip?",
        "What's the timing problem - too early, too late, or exactly the wrong moment?",
        "What does your character do to make things worse while trying to make them better?",
        "What's the one detail so specific it becomes funny - the more absurd the better?",
        "What is your character absolutely certain about that turns out to be wrong?",
        "What's the thing this scene can't get away from, no matter how hard the character tries?",
    ]

    private static let screenplayRomancePrompts: [String] = [
        "What do your two characters want from each other that neither can say directly?",
        "What small physical detail has one character noticed about the other that we haven't been told?",
        "What's the almost-moment - and what stops it from becoming the moment?",
        "What does one character do that the other has never seen anyone do before?",
        "What does this scene hold back - and is holding back the right choice?",
        "What does your protagonist do in the five seconds after they realize they're in love?",
        "What is the lie between them - and when does it stop being bearable?",
        "What does the setting do to put them closer together or further apart?",
        "What would they say if they knew this was the last time they'd see each other?",
        "What object passes between your two characters - and what does it mean?",
        "What does one character misread in the other, and is the audience in on it?",
        "What's the beat just before the confession - and is it quieter than the confession?",
        "What does your romance's central question look like as one image?",
        "What does each character carry into this scene that they don't put down?",
        "What would make the ending feel inevitable rather than convenient?",
    ]

    private static let screenplayScienceFictionPrompts: [String] = [
        "What is the one rule of your world - and what does this scene do to it?",
        "What does the technology make possible that changes what it means to be human here?",
        "What does your character miss about the world before - and can we feel that loss?",
        "What does the technology cost that isn't measured in money or power?",
        "What is ordinary in your world that would be extraordinary in ours?",
        "What does your protagonist want from the future that they can't find there?",
        "What is the ethical question your film refuses to answer cleanly?",
        "What does your character do with technology that reveals something about their loneliness?",
        "What's the moment where the science stops being abstract and becomes personal?",
        "What would your character give up to go back to the world before?",
        "What does your antagonist - the system, the corporation, the AI - believe it's doing right?",
        "What does the body do in your world that it can't in ours - and what does that change?",
        "What's the human problem this technology was supposed to solve - and didn't?",
        "What does isolation look like in your specific future or alternate world?",
        "What is the last human thing your character holds onto - and when does it slip?",
    ]

    private static let screenplayNoirPrompts: [String] = [
        "What is your protagonist's voiceover voice - cynical, broken, wry? Can we hear it in the script?",
        "What does this scene look like in shadow - what is hidden and what is lit?",
        "Who has a secret in this scene - and who knows whose secret it is?",
        "What does your protagonist's code of honor cost them in this scene?",
        "What does your femme fatale or dangerous figure want - and is it understandable?",
        "What does your protagonist suspect but can't prove yet?",
        "What does the city or location feel like as a character - wet, corrupt, indifferent?",
        "What does your protagonist allow themselves to feel, and what do they lock away?",
        "What's the moral compromise in this scene - and does your protagonist know they're making it?",
        "What does your protagonist know about people that makes them good at this work and bad at everything else?",
        "What does the dangerous person in this scene reveal by accident?",
        "What does your protagonist do right before they do something they'll regret?",
        "What does the rain, the neon, the smoke do to the feeling of this moment?",
        "What is the truth your protagonist refuses to speak because speaking it costs too much?",
        "What does the twist reframe - and does it make your protagonist look like a fool, a hero, or something sadder?",
    ]

    private static let screenplayDocuStylePrompts: [String] = [
        "What does your subject do when they think the camera isn't watching - and can you write that?",
        "What contradiction does your subject carry - what they say vs. what they do?",
        "What's the moment that would make the whole film if you caught it?",
        "What does the ordinary routine reveal about the extraordinary thing underneath it?",
        "What does silence do in your observational scene - what does it hold?",
        "What is your subject's relationship with the camera - do they perform, forget it, or resist it?",
        "What object in this scene is doing more work than the people?",
        "What's the specific detail that makes this universal - not 'a grieving person' but what exactly?",
        "What does this person love that they've never been asked about before?",
        "What does the location tell us about who lives here before anyone speaks?",
        "What habit does your subject have that reveals their inner life without explaining it?",
        "What would your subject never want in the final cut - and is that exactly what the film needs?",
        "What does your subject's body language say when their words say something else?",
        "What's the one question you'd ask that would break the scene open?",
        "What makes this person impossible to fully know - and does the film admit that?",
    ]
}

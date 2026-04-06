import Foundation

struct WordTimingEntry {
    let wordIndex: Int
    let word: String
    let startTime: TimeInterval
    let endTime: TimeInterval
    let lineIndex: Int
}

struct WordTimeline {
    let entries: [WordTimingEntry]
    let totalDuration: TimeInterval

    static func build(
        text: String,
        audioDuration: TimeInterval,
        leadingSilence: TimeInterval = 0.260,
        playbackRate: Double = 1.0
    ) -> WordTimeline {
        let effectiveDuration = audioDuration / max(playbackRate, 0.1)
        let speakableDuration = max(0, effectiveDuration - leadingSilence)

        let lines = text.components(separatedBy: "\n")
        var allWords: [(word: String, lineIndex: Int)] = []

        for (lineIdx, line) in lines.enumerated() {
            let words = line.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
            for word in words {
                allWords.append((word, lineIdx))
            }
        }

        guard !allWords.isEmpty else {
            return WordTimeline(entries: [], totalDuration: effectiveDuration)
        }

        if allWords.count == 1 {
            let entry = WordTimingEntry(
                wordIndex: 0,
                word: allWords[0].word,
                startTime: leadingSilence,
                endTime: effectiveDuration,
                lineIndex: allWords[0].lineIndex
            )
            return WordTimeline(entries: [entry], totalDuration: effectiveDuration)
        }

        // Weight each word by character count (min 3) with sentence-boundary bonus
        var weights: [Double] = []
        for (idx, item) in allWords.enumerated() {
            var weight = Double(max(item.word.count, 3))

            // Sentence-boundary pause: word AFTER punctuation gets 1.4x weight
            if idx > 0 {
                let prevWord = allWords[idx - 1].word
                if let lastChar = prevWord.last, ".!?".contains(lastChar) {
                    weight *= 1.4
                }
            }

            weights.append(weight)
        }

        let totalWeight = weights.reduce(0, +)
        guard totalWeight > 0 else {
            return WordTimeline(entries: [], totalDuration: effectiveDuration)
        }

        var entries: [WordTimingEntry] = []
        entries.reserveCapacity(allWords.count)
        var currentTime = leadingSilence

        for (idx, item) in allWords.enumerated() {
            let fraction = weights[idx] / totalWeight
            let wordDuration = speakableDuration * fraction
            let entry = WordTimingEntry(
                wordIndex: idx,
                word: item.word,
                startTime: currentTime,
                endTime: currentTime + wordDuration,
                lineIndex: item.lineIndex
            )
            entries.append(entry)
            currentTime += wordDuration
        }

        return WordTimeline(entries: entries, totalDuration: effectiveDuration)
    }

    /// Binary search: returns the number of words that should be visible at the given time.
    func revealedCountAt(time: TimeInterval) -> Int {
        guard !entries.isEmpty else { return 0 }

        if time >= entries.last!.endTime {
            return entries.count
        }
        if time < entries.first!.startTime {
            return 0
        }

        // Binary search for the last entry whose startTime <= time
        var lo = 0
        var hi = entries.count - 1
        var result = 0

        while lo <= hi {
            let mid = (lo + hi) / 2
            if entries[mid].startTime <= time {
                result = mid + 1
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }

        return result
    }
}

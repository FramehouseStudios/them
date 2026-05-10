import SwiftUI

public struct FountainRevealView: View {
    public let formattedText: String
    public let revealedWordCount: Int
    public let isStreaming: Bool

    public init(formattedText: String, revealedWordCount: Int, isStreaming: Bool) {
        self.formattedText = formattedText
        self.revealedWordCount = revealedWordCount
        self.isStreaming = isStreaming
    }

    public var body: some View {
        let lines = parsedLines
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                let previousKind: FountainElement.Kind? = index > 0 ? lines[index - 1].kind : nil

                FountainLineView(
                    line: line,
                    globalWordOffset: line.globalWordOffset,
                    revealedWordCount: revealedWordCount,
                    isLastLine: index == lines.count - 1 && isStreaming
                )
                .padding(.top, IOThemTypography.Screenplay.topSpacing(for: line.kind, afterKind: previousKind))
                .id(index)
            }
        }
    }

    private var parsedLines: [FountainLine] {
        let lines = formattedText.components(separatedBy: "\n")
        var result: [FountainLine] = []
        var globalWordOffset = 0

        for (_, line) in lines.enumerated() {
            let kind = IOThemTypography.Screenplay.classifyLine(line)
            let words = line.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
            result.append(FountainLine(
                text: line,
                kind: kind,
                words: words,
                globalWordOffset: globalWordOffset
            ))
            globalWordOffset += words.count
        }

        return result
    }
}

struct FountainLine {
    let text: String
    let kind: FountainElement.Kind
    let words: [String]
    let globalWordOffset: Int
}

private struct FountainLineView: View {
    let line: FountainLine
    let globalWordOffset: Int
    let revealedWordCount: Int
    let isLastLine: Bool

    var body: some View {
        if line.kind == .blank {
            Spacer().frame(height: 8)
        } else {
            HStack(spacing: 0) {
                if IOThemTypography.Screenplay.alignment(for: line.kind) == .trailing {
                    Spacer()
                }

                revealedText
                    .font(IOThemTypography.Screenplay.font(for: line.kind))
                    .multilineTextAlignment(IOThemTypography.Screenplay.alignment(for: line.kind))

                if isLastLine && !allRevealed {
                    cursor
                }

                if IOThemTypography.Screenplay.alignment(for: line.kind) != .trailing {
                    Spacer()
                }
            }
            .padding(.leading, IOThemSpacing.ScreenplayIndent.indent(for: line.kind))
        }
    }

    private var allRevealed: Bool {
        revealedWordCount >= globalWordOffset + line.words.count
    }

    private var revealedText: some View {
        Text(buildAttributedText())
            .animation(.easeOut(duration: 0.08), value: revealedWordCount)
    }

    private func buildAttributedText() -> AttributedString {
        let wordsInLine = line.words.count
        guard wordsInLine > 0 else { return AttributedString("") }

        let revealedInLine = max(0, min(wordsInLine, revealedWordCount - globalWordOffset))

        var attributed = AttributedString("")
        for (idx, word) in line.words.enumerated() {
            if idx > 0 {
                var space = AttributedString(" ")
                space.foregroundColor = idx < revealedInLine
                    ? IOThemColors.Screenplay.text
                    : IOThemColors.Screenplay.hidden
                attributed += space
            }

            var wordAttr = AttributedString(word)
            wordAttr.foregroundColor = idx < revealedInLine
                ? IOThemColors.Screenplay.text
                : IOThemColors.Screenplay.hidden
            attributed += wordAttr
        }

        return attributed
    }

    private var cursor: some View {
        IOThemColors.Screenplay.cursor
            .frame(width: 2, height: IOThemTypography.Screenplay.baseFontSize + 2)
            .opacity(cursorOpacity)
    }

    @State private var cursorOpacity: Double = 1.0
}

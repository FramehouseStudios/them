import Foundation

/// The screenplay-only input for a paginator plus the offset needed to map its
/// one-based line numbers back into the complete Fountain document.
public struct FountainPaginationSource: Equatable, Sendable {
    public let scriptText: String
    public let documentLineOffset: Int
    public let hasTitlePage: Bool

    /// Derived layout text only. Preserve the original body/terminators above.
    public var normalizedScriptText: String {
        scriptText.replacingOccurrences(of: "\r\n|[\r\u{0085}\u{2028}\u{2029}]", with: "\n", options: .regularExpression)
    }

    public var shouldPaginate: Bool {
        !scriptText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    public func documentLine(forScriptLine line: Int) -> Int {
        max(1, line) + documentLineOffset
    }

    public static func make(from document: String) -> FountainPaginationSource {
        let parts = FountainTitlePageCodec.parse(document)
        return FountainPaginationSource(
            scriptText: parts.scriptPageText,
            documentLineOffset: max(0, (parts.screenplayBodyStartLine ?? 1) - 1),
            hasTitlePage: parts.hasTitlePage
        )
    }
}

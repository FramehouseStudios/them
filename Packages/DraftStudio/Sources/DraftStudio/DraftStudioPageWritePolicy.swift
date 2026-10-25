import Foundation

/// Routing permission, never a replacement for the writer's original message.
/// Mirrors screenplay_write_instruction.js under shared behavioral fixtures.
public enum DraftStudioPageWritePolicy {
    public struct Analysis: Equatable, Sendable {
        public let hadRefusal: Bool
        public let refusesPageWrite: Bool
        public let routingText: String
    }

    private static let actions = "keep writing|carry on|take it from here|punch up|open on|write|writing|rewrite|rewriting|revise|revising|draft|drafting|generate|generating|compose|composing|continue|continuing|finish|complete|change|changing|edit|editing|polish|polishing|replace|replacing|tighten|shorten|add|adding|insert|inserting|format|formatting|script"
    private static let prefix = "(?:(?:hey|okay|ok)[, ]+)?(?:clementine[, ]+)?(?:(?:please|just|now|actually|and)[, ]+)*"

    public static func analyze(_ text: String) -> Analysis {
        var masked = replace(text, #"^Intent:[^\n]+\n\s*Writer request:\s*"#, with: "")
        masked = replace(masked, #"(?:^|\n)\s*(?:INT\.|EXT\.|INT/EXT\.|I/E\.)[\s\S]*$"#, with: "\n\u{E000}screenplay\u{E001}")
        masked = replace(masked, #""[^"\n]*"|“[^”\n]*”|‘(?:[^’\n]|(?<=\w)’(?=\w))*?’(?!\w)|(?<!\w)'(?:[^'\n]|(?<=\w)'(?=\w))*?'(?!\w)"#, with: "\u{E000}quoted\u{E001}")
        masked = masked.replacingOccurrences(of: "\u{2019}", with: "'")
        masked = replace(masked, #"\b(?:don'?t|do not|never)\s+stop\s+(?:writing|drafting|rewriting)\b"#, with: "keep writing")
        masked = replace(masked, #"\b(?:but|instead|then)\b"#, with: ";")
        let clauses = masked.components(separatedBy: CharacterSet(charactersIn: ".!?;\n"))
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        let refusal = "^\(prefix)(?:(?:i|we)\\s+)?(?:don'?t(?:\\s+want(?:\\s+you)?(?:\\s+to)?)?|do not(?:\\s+want(?:\\s+you)?(?:\\s+to)?)?|never|stop|avoid|no need to|let'?s not)\\s+(?:(?:please|just|a|any)\\s+)*(?:\(actions))\\b"
        guard clauses.contains(where: { matches($0, refusal) }) else {
            return Analysis(hadRefusal: false, refusesPageWrite: false, routingText: text)
        }
        let remaining = clauses.filter { !matches($0, refusal) }
        let affirmative = "^\(prefix)(?:(?:can|could|would|will) you (?:please )?|(?:i|we)(?: would|'d)? (?:want|need|like)(?: you)? to |let'?s |help me )?(?:\(actions)|next page|next scene|more pages|give me (?:the |a |another |next )?(?:scene|page|script|screenplay))\\b"
        let permitsSeparateWrite = remaining.contains { clause in
            let unprefixed = replace(clause, "^\(prefix)", with: "")
            let conceptual = matches(unprefixed, #"^(?:write|draft|generate|compose)\s+(?:(?:a|an|the|my|this)\s+)?(?:outline|synopsis|premise|logline|notes|feedback)\b"#)
            return !conceptual && matches(clause, affirmative)
        }
        return Analysis(hadRefusal: true, refusesPageWrite: !permitsSeparateWrite, routingText: remaining.joined(separator: ". "))
    }

    private static func matches(_ text: String, _ pattern: String) -> Bool {
        text.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
    }

    private static func replace(_ text: String, _ pattern: String, with replacement: String) -> String {
        text.replacingOccurrences(of: pattern, with: replacement, options: [.regularExpression, .caseInsensitive])
    }
}

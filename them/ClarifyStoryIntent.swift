import AppIntents
import Foundation

// Siri follow-up for vague story → yellow pill.
// When draft has `TODO: clarify [X]`, Siri asks “What's Jess's want?” and this intent captures the answer.
struct ClarifyStoryIntent: AppIntent {
    static var title: LocalizedStringResource = "Clarify Story"
    static var description = IntentDescription("Answers the yellow question pill when your story was vague — e.g., Jess's want.")

    @Parameter(title: "Answer", description: "Your clarification, e.g., 'find her mother'")
    var answer: String

    @Parameter(title: "Question", description: "Which TODO to answer. Defaults to the pill.")
    var question: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Clarify \(\.$question) with \(\.$answer)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let pill = ScreenplayLiveDraftBridge.shared.storyVagueQuestion ?? question ?? "the story"
        let clean = answer.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { throw ClarifyError.empty }
        var draft = ScreenplayLiveDraftBridge.shared.draftText
        if draft.contains("TODO: clarify") {
            let lines = draft.components(separatedBy: .newlines)
            var replaced = false
            var out: [String] = []
            for line in lines {
                if !replaced && line.contains("TODO: clarify") {
                    out.append(clean)
                    replaced = true
                } else {
                    out.append(line)
                }
            }
            draft = out.joined(separator: "\n")
            ScreenplayLiveDraftBridge.shared.draftText = draft
            UserDefaults.standard.set(clean, forKey: "io.them.story.lastClarification")
            // Upgrade vague beat via model when online: tighten the TODO into a real beat (draft-aware)
            Task.detached {
                do {
                    let result = try await BackendClient().talkText(
                        transcript: "Clarify: \(clean)",
                        fountainDraft: draft
                    )
                    if let output = result.screenplayOutput, output.writesToPage {
                        let text = output.text.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !text.isEmpty {
                            await MainActor.run {
                                ScreenplayLiveDraftBridge.shared.draftText = text
                            }
                        }
                    }
                } catch { /* offline — local replace already shown */ }
            }
        } else {
            // No TODO — still pin clarification for next page continuity
            UserDefaults.standard.set(clean, forKey: "io.them.story.lastClarification")
        }
        return .result(dialog: IntentDialog("Got it — updated \(pill) with “\(clean)”. Say “print the script” when ready."))
    }

    enum ClarifyError: Swift.Error, CustomLocalizedStringResourceConvertible {
        case empty
        var localizedStringResource: LocalizedStringResource {
            switch self {
            case .empty: return "Please say what to clarify."
            }
        }
    }
}

// App Shortcut for ClarifyStoryIntent lives in ScreenplayShortcuts (PrintScreenplayIntent.swift):
// iOS allows exactly one AppShortcutsProvider per app.

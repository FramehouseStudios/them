import AppIntents
import ScreenplayStudio
import Foundation
import AVFoundation
#if canImport(UIKit)
import UIKit
#endif

struct ScreenplayDraftEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Screenplay Draft"
    static var defaultQuery = ScreenplayDraftQuery()
    var id: String
    var title: String
    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(title)")
    }
}

struct ScreenplayDraftQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [ScreenplayDraftEntity] {
        identifiers.map { ScreenplayDraftEntity(id: $0, title: $0) }
    }
    func suggestedEntities() async throws -> [ScreenplayDraftEntity] {
        if let t = ScreenplayDraftStore.sharedCurrentTitle(), !t.isEmpty {
            return [ScreenplayDraftEntity(id: t, title: t)]
        }
        return [ScreenplayDraftEntity(id: "Screenplay", title: "Screenplay")]
    }
}

// Exposes "print the script" to Siri, Shortcuts, Action Button, Apple Intelligence.
// No model coupling — intent is the one entry point; Clementine voice controller becomes a caller.
struct PrintScreenplayIntent: AppIntent, ForegroundContinuableIntent {
    static var title: LocalizedStringResource = "Print the Script"
    static var description = IntentDescription("Prints the current draft to your AirPrint printer. Picks a printer on first use, then reprints silently.")
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = true
    // Printing spools paper; require the device to be unlocked.
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

    @Parameter(title: "Draft", description: "Screenplay text to print. Defaults to current draft if empty.")
    var draft: String?

    @Parameter(title: "Title", description: "Job name for the print queue.")
    var jobTitle: String?

    @Parameter(title: "Use Alternate Printer", description: "Show printer picker instead of remembered printer.")
    var pickAlternate: Bool?

    @Parameter(title: "Clarification", description: "Answer to yellow pill if draft has TODO, e.g., 'find her mother'")
    var clarification: String?

    @Parameter(title: "Draft Entity", description: "Pick a draft by name for Apple Intelligence suggestions")
    var draftEntity: ScreenplayDraftEntity?

    static var parameterSummary: some ParameterSummary {
        Summary("Print \(\.$draft) to \(\.$jobTitle)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard ScreenplayPrintFeature.isEnabled else { throw PrintErrorIntent.disabled }

        var text = draft?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if text.isEmpty { text = ScreenplayDraftStore.sharedCurrentDraftText() ?? "" }
        guard !text.isEmpty else { throw PrintErrorIntent.noDraft }

        // Final-draft gate: a draft with an open "TODO: clarify" pill doesn't print until it is answered.
        if text.contains(Self.clarifyMarker) {
            let answer = clarification?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !answer.isEmpty else {
                throw PrintErrorIntent.blockedByGate("Draft needs a quick clarify — \(Self.pendingClarifyTopic(in: text)). Answer with clarification, e.g., “find her mother”, then print again.")
            }
            text = Self.applyingClarification(answer, to: text)
            ScreenplayLiveDraftBridge.shared.draftText = text
            if text.contains(Self.clarifyMarker) {
                throw PrintErrorIntent.blockedByGate("Still needs clarify — \(Self.pendingClarifyTopic(in: text)).")
            }
        }
        if ScreenplayDraftGate.hasFormatErrors(draft: text) {
            throw PrintErrorIntent.blockedByGate("Draft has format issues — fix character cues and scene headings before final print.")
        }

        let requestedTitle = jobTitle?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let title = requestedTitle.isEmpty ? (ScreenplayDraftStore.sharedCurrentTitle() ?? "Screenplay") : requestedTitle
        let pdf: Data
        do {
            pdf = try ScreenplayPrintService.makePDF(draft: text, title: title)
        } catch {
            throw PrintErrorIntent.pdfFailed(error.localizedDescription)
        }
        let pages = ScreenplayPrintService.pageCount(of: pdf) ?? ScreenplayPrintService.pageCountEstimate(for: text)

        #if canImport(UIKit)
        if pickAlternate != true, let url = ScreenplayPrintMemory.rememberedPrinterURL {
            let printerName = ScreenplayPrintMemory.rememberedPrinterName ?? "your printer"
            // Spoken cancel window before spooling, so a silent reprint is never a surprise.
            ScreenplayPrintSpeech.say("Printing \(pages) pages to \(printerName) — say cancel to stop, or say print somewhere else to pick another printer.")
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            guard !Task.isCancelled else { throw PrintErrorIntent.cancelled }
            if await ScreenplayPrintUI.printSilently(pdfData: pdf, jobName: title, printerURL: url) {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                return .result(dialog: IntentDialog("Printing \(pages) pages to \(printerName)."))
            }
            // Remembered printer unreachable — fall through to the picker.
        }
        // The printer picker needs a window. From Siri or Shortcuts the app may be in the
        // background; ask to continue in the foreground instead of failing silently.
        if UIApplication.shared.applicationState != .active {
            try await requestToContinueInForeground(IntentDialog("Choose a printer in io.them."))
        }
        guard let picked = await ScreenplayPrintUI.pickPrinter() else { throw PrintErrorIntent.cancelled }
        guard await ScreenplayPrintUI.printSilently(pdfData: pdf, jobName: title, printerURL: picked.0) else {
            throw PrintErrorIntent.printFailed
        }
        return .result(dialog: IntentDialog("Printing \(pages) pages to \(picked.1)."))
        #elseif os(macOS)
        guard ScreenplayPrintServiceMac.print(pdfData: pdf, jobName: title) else { throw PrintErrorIntent.printFailed }
        ScreenplayPrintSpeech.say("Printing \(pages) pages.")
        return .result(dialog: IntentDialog("Printing \(pages) pages."))
        #else
        throw PrintErrorIntent.printFailed
        #endif
    }

    private static let clarifyMarker = "TODO: clarify"

    private static func pendingClarifyTopic(in text: String) -> String {
        let topic = text.components(separatedBy: clarifyMarker).dropFirst().first?
            .trimmingCharacters(in: .whitespacesAndNewlines).prefix(48) ?? ""
        return topic.isEmpty ? "the story" : String(topic)
    }

    private static func applyingClarification(_ answer: String, to text: String) -> String {
        var lines = text.components(separatedBy: .newlines)
        if let index = lines.firstIndex(where: { $0.contains(clarifyMarker) }) {
            lines[index] = answer
        }
        return lines.joined(separator: "\n")
    }

    enum PrintErrorIntent: Swift.Error, CustomLocalizedStringResourceConvertible {
        case disabled
        case noDraft
        case cancelled
        case pdfFailed(String)
        case printFailed
        case blockedByGate(String)
        var localizedStringResource: LocalizedStringResource {
            switch self {
            case .disabled: return "Printing is not enabled."
            case .noDraft: return "No current draft to print."
            case .cancelled: return "Printing cancelled."
            case .pdfFailed(let s): return "Could not prepare PDF: \(s)"
            case .printFailed: return "Printing failed. Please check the printer."
            case .blockedByGate(let s): return "\(LocalizedStringResource(stringLiteral: s))"
            }
        }
    }
}

#if os(macOS)
import AppKit
enum ScreenplayPrintServiceMac {
    static func print(pdfData: Data, jobName: String) -> Bool {
        guard let pdf = PDFDocument(data: pdfData) else { return false }
        let printInfo = NSPrintInfo.shared
        let paper = ScreenplayPrintMemory.effectivePaper
        printInfo.paperSize = paper == .a4 ? NSSize(width: 595, height: 842) : NSSize(width: 612, height: 792)
        printInfo.jobDisposition = .spool
        let view = PDFViewPrintAdapter(pdf: pdf)
        let op = NSPrintOperation(view: view, printInfo: printInfo)
        op.jobTitle = jobName
        op.showsPrintPanel = false
        op.showsProgressPanel = false
        return op.run()
    }
    private class PDFViewPrintAdapter: NSView {
        let pdf: PDFDocument
        init(pdf: PDFDocument) { self.pdf = pdf; super.init(frame: .zero) }
        required init?(coder: NSCoder) { fatalError() }
        override func knowsPageRange(_ range: NSRangePointer) -> Bool {
            range.pointee = NSRange(location: 1, length: pdf.pageCount)
            return true
        }
        override func rectForPage(_ page: Int) -> NSRect {
            pdf.page(at: page-1)?.bounds(for: .mediaBox) ?? NSRect(x: 0, y: 0, width: 612, height: 792)
        }
        override func draw(_ dirtyRect: NSRect) {}
    }
}
import PDFKit
#endif

// MARK: - App Shortcuts
struct ScreenplayShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: PrintScreenplayIntent(),
            phrases: [
                "Print the script in \(.applicationName)",
                "Print my screenplay in \(.applicationName)",
                "Print draft in \(.applicationName)",
                "Print my draft in \(.applicationName)",
                "Print screenplay in \(.applicationName)",
                "Print current draft in \(.applicationName)"
            ]
        )
    }
}

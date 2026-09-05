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
struct PrintScreenplayIntent: AppIntent {
    static var title: LocalizedStringResource = "Print the Script"
    static var description = IntentDescription("Prints the current draft to your AirPrint printer. Picks a printer on first use, then reprints silently.")
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = true
    static var authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed

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
        guard ScreenplayPrintFeature.isEnabled else {
            throw PrintErrorIntent.disabled
        }
        let text = (draft?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? draft! :
                    ScreenplayDraftStore.sharedCurrentDraftText() ?? "")
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw PrintErrorIntent.noDraft
        }
        // FinalDraftGate: block TODO drafts — if clarification provided, apply it inline (Siri needsValue path)
        if text.contains("TODO: clarify") {
            if let ans = clarification?.trimmingCharacters(in: .whitespacesAndNewlines), !ans.isEmpty {
                // Apply clarification directly and continue to print (Siri follow-up)
                var lines = text.components(separatedBy: .newlines)
                for i in 0..<lines.count where lines[i].contains("TODO: clarify") {
                    lines[i] = ans
                    break
                }
                let fixed = lines.joined(separator: "\n")
                ScreenplayLiveDraftBridge.shared.draftText = fixed
                // Use fixed for this print run
                // Re-check gate after fix
                if fixed.contains("TODO: clarify") {
                    let todo = fixed.components(separatedBy: "TODO: clarify").dropFirst().first?.trimmingCharacters(in: .whitespacesAndNewlines).prefix(48) ?? "the story"
                    throw PrintErrorIntent.blockedByGate("Still needs clarify — \(todo).")
                }
                // Proceed with fixed text
                // Fall through to title/pdf below with fixed text
                // To avoid double, set text to fixed for rest of method
                // (shadow)
                let text = fixed
                // Re-enter gate for format after fix
                if ScreenplayDraftGate.hasFormatErrors(draft: text) {
                    throw PrintErrorIntent.blockedByGate("Draft has format issues — fix character cues and scene headings before final print.")
                }
                let title = (jobTitle?.isEmpty == false ? jobTitle! : (ScreenplayDraftStore.sharedCurrentTitle() ?? "Screenplay"))
                let pdf: Data
                do {
                    pdf = try ScreenplayPrintService.makePDF(draft: text, title: title)
                } catch {
                    throw PrintErrorIntent.pdfFailed(error.localizedDescription)
                }
                let pages = ScreenplayPrintService.pageCountEstimate(for: text)
                let printerName = ScreenplayPrintMemory.rememberedPrinterName ?? "your printer"
                #if canImport(UIKit)
                if pickAlternate == true {
                    guard let (url, name) = await ScreenplayPrintUI.pickPrinter() else { throw PrintErrorIntent.cancelled }
                    let ok = await ScreenplayPrintUI.printSilently(pdfData: pdf, jobName: title, printerURL: url)
                    if !ok { throw PrintErrorIntent.printFailed }
                    return .result(dialog: IntentDialog("Printing \(pages) pages to \(name) — clarified."))
                }
                if let url = ScreenplayPrintMemory.rememberedPrinterURL {
                    let ok = await ScreenplayPrintUI.printSilently(pdfData: pdf, jobName: title, printerURL: url)
                    if ok {
                        #if canImport(AVFoundation)
                        ScreenplayPrintSpeech.say("Printing \(pages) pages to \(printerName).")
                        #endif
                        #if canImport(UIKit)
                        UINotificationFeedbackGenerator().notificationOccurred(.success)
                        #endif
                        return .result(dialog: IntentDialog("Printing \(pages) pages to \(printerName) — clarified."))
                    }
                }
                guard let (url, name) = await ScreenplayPrintUI.pickPrinter() else { throw PrintErrorIntent.cancelled }
                let ok = await ScreenplayPrintUI.printSilently(pdfData: pdf, jobName: title, printerURL: url)
                if !ok { throw PrintErrorIntent.printFailed }
                return .result(dialog: IntentDialog("Printing \(pages) pages to \(name) — clarified."))
                #else
                #if os(macOS)
                let ok = ScreenplayPrintServiceMac.print(pdfData: pdf, jobName: title)
                if ok {
                    ScreenplayPrintSpeech.say("Printing \(pages) pages.")
                    return .result(dialog: IntentDialog("Printing \(pages) pages — clarified."))
                }
                throw PrintErrorIntent.printFailed
                #else
                throw PrintErrorIntent.printFailed
                #endif
                #endif
            }
            let todo = text.components(separatedBy: "TODO: clarify").dropFirst().first?.trimmingCharacters(in: .whitespacesAndNewlines).prefix(48) ?? "the story"
            throw PrintErrorIntent.blockedByGate("Draft needs a quick clarify — \(todo). Answer with clarification, e.g., “find her mother”, then print again.")
        }
        // Format gate: basic linter (no empty character cues, no orphan)
        if ScreenplayDraftGate.hasFormatErrors(draft: text) {
            throw PrintErrorIntent.blockedByGate("Draft has format issues — fix character cues and scene headings before final print.")
        }
        let title = (jobTitle?.isEmpty == false ? jobTitle! : (ScreenplayDraftStore.sharedCurrentTitle() ?? "Screenplay"))
        let pdf: Data
        do {
            pdf = try ScreenplayPrintService.makePDF(draft: text, title: title)
        } catch {
            throw PrintErrorIntent.pdfFailed(error.localizedDescription)
        }

        let pages = ScreenplayPrintService.pageCountEstimate(for: text)
        let printerName = ScreenplayPrintMemory.rememberedPrinterName ?? "your printer"

        #if canImport(UIKit)
        if pickAlternate == true {
            guard let (url, name) = await ScreenplayPrintUI.pickPrinter() else {
                throw PrintErrorIntent.cancelled
            }
            let ok = await ScreenplayPrintUI.printSilently(pdfData: pdf, jobName: title, printerURL: url)
            if !ok { throw PrintErrorIntent.printFailed }
            return .result(dialog: IntentDialog("Printing \(pages) pages to \(name)."))
        }

        if let url = ScreenplayPrintMemory.rememberedPrinterURL {
            // 3-sec spoken cancel guard: “Printing X pages to Y — say cancel” before spooling, so first silent print isn’t a surprise.
            #if canImport(AVFoundation)
            ScreenplayPrintSpeech.say("Printing \(pages) pages to \(printerName) — say cancel to stop, or say print somewhere else to pick another printer.")
            #endif
            // Give user 3s to say “cancel” / “somewhere else” (Siri can re-invoke with pickAlternate), then spool
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            // A caller cancelling this Task during the guard window must not spool.
            guard !Task.isCancelled else { throw PrintErrorIntent.cancelled }
            let ok = await ScreenplayPrintUI.printSilently(pdfData: pdf, jobName: title, printerURL: url)
            if ok {
                #if canImport(UIKit)
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                #endif
                return .result(dialog: IntentDialog("Printing \(pages) pages to \(printerName)."))
            }
            // fell through to picker if printer offline
        }
        guard let (url, name) = await ScreenplayPrintUI.pickPrinter() else {
            throw PrintErrorIntent.cancelled
        }
        let ok = await ScreenplayPrintUI.printSilently(pdfData: pdf, jobName: title, printerURL: url)
        if !ok { throw PrintErrorIntent.printFailed }
        return .result(dialog: IntentDialog("Printing \(pages) pages to \(name)."))
        #else
        // macOS path
        #if os(macOS)
        let ok = ScreenplayPrintServiceMac.print(pdfData: pdf, jobName: title)
        if ok { return .result(dialog: IntentDialog("Printing \(pages) pages.")) }
        throw PrintErrorIntent.printFailed
        #else
        throw PrintErrorIntent.printFailed
        #endif
        #endif
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
                "Print current draft in \(.applicationName)",
                "Print Jess's Search in \(.applicationName)"
            ]
        )
    }
}

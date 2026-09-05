import Foundation
import Combine
import ScreenplayStudio

/// Spoken print commands recognized inside Studio, matched against the bridge's
/// normalized (lower-cased, punctuation-stripped) transcript.
enum ScreenplayPrintVoiceCommand: Equatable {
    case print(alternate: Bool)
    case cancel

    private static let wakePrefixes = ["hey clementine ", "ok clementine ", "okay clementine ", "clementine "]

    private static let alternatePhrases: Set<String> = [
        "print somewhere else", "print it somewhere else", "print this somewhere else",
        "print elsewhere", "print it elsewhere",
        "print to another printer", "print on another printer", "print to a different printer",
        "use another printer", "use a different printer", "another printer",
        "choose a printer", "choose printer", "pick a printer", "pick printer",
        "change printer", "change the printer", "print somewhere else please",
    ]

    private static let printPhrases: Set<String> = [
        "print", "print it", "print this", "print that", "print the page", "print the pages",
        "print the script", "print script", "print my script", "print this script",
        "print the screenplay", "print screenplay", "print my screenplay",
        "print the draft", "print draft", "print my draft", "print this draft", "print current draft",
        "print the script please", "print the draft please", "please print the script",
        "print out the script", "print out the draft", "print a copy", "print me a copy",
    ]

    private static let cancelPhrases: Set<String> = [
        "cancel", "cancel print", "cancel printing", "cancel the print", "cancel that print",
        "cancel the printing", "stop print", "stop printing", "stop the print", "stop the printer",
        "don't print", "do not print", "don't print it", "do not print it", "don't print that",
    ]

    static func match(normalized rawNormalized: String) -> ScreenplayPrintVoiceCommand? {
        var text = rawNormalized
            .lowercased()
            .trimmingCharacters(in: CharacterSet(charactersIn: " .-,!?"))
        for prefix in wakePrefixes where text.hasPrefix(prefix) {
            text = String(text.dropFirst(prefix.count)).trimmingCharacters(in: .whitespaces)
            break
        }
        text = text.trimmingCharacters(in: CharacterSet(charactersIn: " .-,!?"))
        guard !text.isEmpty else { return nil }
        if alternatePhrases.contains(text) { return .print(alternate: true) }
        if printPhrases.contains(text) { return .print(alternate: false) }
        if cancelPhrases.contains(text) { return .cancel }
        return nil
    }
}

/// Everything the coordinator needs from the printing stack, as closures so tests can
/// drive the confirm/cancel window without AirPrint, UIKit, or a real draft.
struct ScreenplayPrintPipeline {
    var isEnabled: () -> Bool
    var currentTitle: () -> String
    var rememberedPrinterName: () -> String?
    var formatIssue: (String) -> String?
    var pageCount: (String) -> Int
    /// Spools to the remembered printer. Returns false when the printer can't be reached.
    var printToRememberedPrinter: (_ draft: String, _ title: String) async -> Bool
    /// Shows the system picker, remembers the choice, spools. Returns the printer's
    /// display name, or nil when the writer dismissed the picker.
    var pickPrinterAndPrint: (_ draft: String, _ title: String) async -> String?

    static var live: ScreenplayPrintPipeline {
        ScreenplayPrintPipeline(
            isEnabled: { ScreenplayPrintFeature.isEnabled },
            currentTitle: { ScreenplayDraftStore.sharedCurrentTitle() ?? "Screenplay" },
            rememberedPrinterName: {
                #if canImport(UIKit)
                guard ScreenplayPrintMemory.rememberedPrinterURL != nil else { return nil }
                return ScreenplayPrintMemory.rememberedPrinterName ?? "your printer"
                #else
                return "the default printer"
                #endif
            },
            formatIssue: { ScreenplayDraftGate.firstErrorReason(draft: $0) },
            pageCount: { draft in
                // Real page count from the rendered PDF; the line-based estimate is the fallback.
                if let pdf = try? ScreenplayPrintService.makePDF(draft: draft, title: ScreenplayDraftStore.sharedCurrentTitle() ?? "Screenplay"),
                   let pages = ScreenplayPrintService.pageCount(of: pdf) {
                    return pages
                }
                return ScreenplayPrintService.pageCountEstimate(for: draft)
            },
            printToRememberedPrinter: { draft, title in
                guard let pdf = try? ScreenplayPrintService.makePDF(draft: draft, title: title) else { return false }
                #if canImport(UIKit)
                guard let url = ScreenplayPrintMemory.rememberedPrinterURL else { return false }
                return await ScreenplayPrintUI.printSilently(pdfData: pdf, jobName: title, printerURL: url)
                #else
                // The macOS scaffold has no print path yet; the Siri intent branch adds one.
                _ = pdf
                return false
                #endif
            },
            pickPrinterAndPrint: { draft, title in
                guard let pdf = try? ScreenplayPrintService.makePDF(draft: draft, title: title) else { return nil }
                #if canImport(UIKit)
                guard let picked = await ScreenplayPrintUI.pickPrinter() else { return nil }
                let (url, name) = picked
                let ok = await ScreenplayPrintUI.printSilently(pdfData: pdf, jobName: title, printerURL: url)
                return ok ? name : nil
                #else
                _ = pdf
                return nil
                #endif
            }
        )
    }
}

/// Owns the "print the script" → "say cancel" → spool sequence for Studio voice.
///
/// The remembered-printer path never prints immediately: it announces what is about to
/// happen, holds for `confirmationWindow`, and only then spools, so a misheard phrase can
/// be cancelled before paper moves. The first-time path opens the system picker instead.
@MainActor
final class ScreenplayPrintVoiceCoordinator: ObservableObject {
    struct PendingPrint: Equatable {
        let pages: Int
        let printerName: String
        let title: String
    }

    @Published private(set) var pending: PendingPrint?
    @Published private(set) var notice: String?
    @Published private(set) var isSpooling = false

    var confirmationWindow: TimeInterval = 3.5
    var noticeLifetime: TimeInterval = 4.0
    var pipeline: ScreenplayPrintPipeline

    private var pendingTask: Task<Void, Never>?
    private var noticeClearTask: Task<Void, Never>?

    init(pipeline: ScreenplayPrintPipeline? = nil) {
        self.pipeline = pipeline ?? .live
    }

    // Default MainActor isolation would make this an isolated deinit, which traps when
    // the object is released outside a Task (same fix as ClementineLatencyTelemetry).
    nonisolated deinit {}

    var isPending: Bool { pending != nil }

    func handlePrint(alternate: Bool, draft rawDraft: String) -> ScreenplayLocalStudioCommandFeedback {
        guard pipeline.isEnabled() else {
            return error("Printing isn't enabled in this build.")
        }
        _ = cancel()

        let draft = rawDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !draft.isEmpty else {
            return error("There's nothing on the page to print yet.")
        }
        if let issue = pipeline.formatIssue(draft) {
            return error(issue)
        }

        let title = pipeline.currentTitle()
        let pages = pipeline.pageCount(draft)
        let pageWord = pages == 1 ? "page" : "pages"

        guard !alternate, let printerName = pipeline.rememberedPrinterName() else {
            setNotice("Choose a printer for \(pages) \(pageWord).", autoClear: false)
            pendingTask = Task { @MainActor [weak self] in
                guard let self else { return }
                self.isSpooling = true
                let picked = await self.pipeline.pickPrinterAndPrint(draft, title)
                self.isSpooling = false
                guard !Task.isCancelled else { return }
                if let picked {
                    self.setNotice("Printing \(pages) \(pageWord) to \(picked).")
                } else {
                    self.setNotice("Printing cancelled.")
                }
            }
            return ScreenplayLocalStudioCommandFeedback(
                confirmation: "Pick a printer for \(pages) \(pageWord) — I'll remember it for next time.",
                shouldSpeakConfirmation: true,
                isError: false
            )
        }

        pending = PendingPrint(pages: pages, printerName: printerName, title: title)
        let window = confirmationWindow
        pendingTask = Task { @MainActor [weak self] in
            if window > 0 {
                try? await Task.sleep(nanoseconds: UInt64(window * 1_000_000_000))
            }
            guard let self, !Task.isCancelled, self.pending != nil else { return }
            self.pending = nil
            self.isSpooling = true
            let ok = await self.pipeline.printToRememberedPrinter(draft, title)
            self.isSpooling = false
            guard !Task.isCancelled else { return }
            if ok {
                self.setNotice("Printing \(pages) \(pageWord) to \(printerName).")
            } else {
                self.setNotice("Couldn't reach \(printerName) — say \"print somewhere else\" to pick another printer.", autoClear: false)
            }
        }
        return ScreenplayLocalStudioCommandFeedback(
            confirmation: "Printing \(pages) \(pageWord) to \(printerName) — say cancel to stop.",
            shouldSpeakConfirmation: true,
            isError: false,
            spokenText: "Printing \(pages) \(pageWord) to \(printerName). Say cancel to stop."
        )
    }

    /// Cancels a print that is still inside its confirmation window.
    /// Returns false when nothing was pending (an in-flight spool can't be recalled).
    @discardableResult
    func cancel() -> Bool {
        guard pending != nil else { return false }
        pendingTask?.cancel()
        pendingTask = nil
        pending = nil
        setNotice("Cancelled printing.")
        return true
    }

    private func error(_ message: String) -> ScreenplayLocalStudioCommandFeedback {
        ScreenplayLocalStudioCommandFeedback(
            confirmation: message,
            shouldSpeakConfirmation: true,
            isError: true
        )
    }

    private func setNotice(_ text: String, autoClear: Bool = true) {
        noticeClearTask?.cancel()
        notice = text
        guard autoClear, noticeLifetime > 0 else { return }
        let lifetime = noticeLifetime
        noticeClearTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(lifetime * 1_000_000_000))
            guard !Task.isCancelled else { return }
            if self?.notice == text { self?.notice = nil }
        }
    }
}

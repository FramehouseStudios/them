import Foundation
import ScreenplayStudio
import CoreText
import PDFKit
#if canImport(UIKit)
import UIKit
#endif
#if os(macOS)
import AppKit
#endif

#if canImport(AVFoundation)
import AVFoundation

/// Retained speech synthesizer for spoken print confirmations. A throwaway
/// `AVSpeechSynthesizer()` created inline can be deallocated before it speaks,
/// so the "say cancel" warning would silently never play.
@MainActor
enum ScreenplayPrintSpeech {
    static let synthesizer = AVSpeechSynthesizer()

    static func say(_ text: String, rate: Float? = nil) {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        if let rate { utterance.rate = rate }
        synthesizer.speak(utterance)
    }
}
#endif

// MARK: - Print feature flag
enum ScreenplayPrintFeature {
    /// On by default in every build so the demo prints without setup. Setting the
    /// "io.them.printDisabled" default to true is the kill switch (read live, so a
    /// settings toggle or `defaults write` takes effect without a relaunch).
    static var isEnabled: Bool {
        !UserDefaults.standard.bool(forKey: "io.them.printDisabled")
    }
}

// MARK: - Paper
enum ScreenplayPrintPaper: String, CaseIterable {
    case system = "system" // auto by region
    case letter = "letter"
    case a4 = "a4"

    var displayName: String {
        switch self {
        case .system: return "Automatic (Letter / A4 by region)"
        case .letter: return "US Letter (8.5 × 11\")"
        case .a4: return "A4 (210 × 297 mm)"
        }
    }

    static var regionDefault: ScreenplayPrintPaper {
        // US, CA, MX, PH, CL, CO, VE use Letter per industry; rest A4
        let region = Locale.current.region?.identifier ?? Locale.current.identifier
        let letterRegions: Set<String> = ["US","CA","MX","PH","CL","CO","VE","US_OUTLYING","PR","GU"]
        if letterRegions.contains(region.uppercased()) || Locale.current.identifier.contains("en_US") {
            return .letter
        }
        return .a4
    }
}

// MARK: - Printer persistence
enum ScreenplayPrintMemory {
    private static let printerURLKey = "io.them.print.rememberedPrinterURL"
    private static let printerNameKey = "io.them.print.rememberedPrinterName"
    private static let paperKey = "io.them.print.paperOverride"

    static var rememberedPrinterURL: URL? {
        get {
            guard let s = UserDefaults.standard.string(forKey: printerURLKey), let u = URL(string: s) else { return nil }
            return u
        }
        set {
            UserDefaults.standard.set(newValue?.absoluteString, forKey: printerURLKey)
        }
    }
    static var rememberedPrinterName: String? {
        get { UserDefaults.standard.string(forKey: printerNameKey) }
        set { UserDefaults.standard.set(newValue, forKey: printerNameKey) }
    }
    static var paperOverride: ScreenplayPrintPaper {
        get {
            guard let raw = UserDefaults.standard.string(forKey: paperKey),
                  let v = ScreenplayPrintPaper(rawValue: raw) else { return .system }
            return v
        }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: paperKey) }
    }
    static var effectivePaper: ScreenplayPrintPaper {
        paperOverride == .system ? ScreenplayPrintPaper.regionDefault : paperOverride
    }
    static func forgetPrinter() {
        rememberedPrinterURL = nil
        rememberedPrinterName = nil
    }
}

// MARK: - PDF generation (shared)
enum ScreenplayPrintService {
    static func makePDF(draft: String, title: String) throws -> Data {
        let clean = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { throw PrintError.emptyDraft }
        #if os(macOS)
        // Reuse ScreenplayLocalExport on macOS (CoreText path, already Letter)
        return try ScreenplayLocalExport.makeArtifact(draft: clean, title: title, format: "pdf").data
        #else
        // iOS: CoreText paginated PDF, same as macOS path but UIKit colors.
        let paper = ScreenplayPrintMemory.effectivePaper
        let pageRect: CGRect = (paper == .a4) ? CGRect(x: 0, y: 0, width: 595, height: 842) : CGRect(x: 0, y: 0, width: 612, height: 792)
        let contentRect = CGRect(x: 108, y: 72, width: pageRect.width - 216, height: pageRect.height - 144)
        let attributed = iOSAttributedDraft(for: clean, printableWidth: contentRect.width)
        let framesetter = CTFramesetterCreateWithAttributedString(attributed as CFAttributedString)
        let data = NSMutableData()
        guard let consumer = CGDataConsumer(data: data as CFMutableData) else { throw PrintError.emptyDraft }
        var mediaBox = pageRect
        guard let context = CGContext(consumer: consumer, mediaBox: &mediaBox, nil) else { throw PrintError.emptyDraft }
        var range = CFRange(location: 0, length: 0)
        let fullLength = attributed.length
        let elements = ScreenplayEditorElement.inferredSequence(for: clean)
        let lines = clean.components(separatedBy: .newlines)
        var pageNumber = 1
        while range.location < fullLength {
            context.beginPDFPage(nil)
            context.saveGState()
            context.textMatrix = .identity
            context.translateBy(x: 0, y: pageRect.height)
            context.scaleBy(x: 1, y: -1)
            // Page number
            let headerText = "\(pageNumber)."
            let headerAttr = NSAttributedString(string: headerText, attributes: [
                .font: UIFont(name: "Courier", size: 10) ?? UIFont.systemFont(ofSize: 10),
                .foregroundColor: UIColor.black.withAlphaComponent(0.7)
            ])
            let headerPath = CGPath(rect: CGRect(x: 108, y: 36, width: 400, height: 20), transform: nil)
            let headerFrame = CTFramesetterCreateFrame(CTFramesetterCreateWithAttributedString(headerAttr), CFRange(location: 0, length: headerAttr.length), headerPath, nil)
            CTFrameDraw(headerFrame, context)
            var path = CGPath(rect: contentRect, transform: nil)
            var frame = CTFramesetterCreateFrame(framesetter, range, path, nil)
            var visible = CTFrameGetVisibleStringRange(frame)
            // Widow: pull back last line if next page would have single line — dual-aware for MORE/CONT'D pagination orphan
            if range.location + visible.length < fullLength {
                let remaining = fullLength - (range.location + visible.length)
                let nextIdxForWidow = visible.location + visible.length
                let breakLineForWidow = (clean as NSString).substring(to: min(nextIdxForWidow, clean.count)).components(separatedBy: "\n").count - 1
                let nextElForWidow = elements.indices.contains(breakLineForWidow) ? elements[breakLineForWidow] : nil
                let prevElForWidow = breakLineForWidow > 0 && elements.indices.contains(breakLineForWidow-1) ? elements[breakLineForWidow-1] : nil
                let isDualBreak = (prevElForWidow == .dialogue || prevElForWidow == .character) && (nextElForWidow == .dialogue || nextElForWidow == .parenthetical)
                let widowThreshold = isDualBreak ? 160 : 80
                if remaining > 0 && remaining < widowThreshold {
                    let prefix = (attributed.string as NSString).substring(with: NSRange(location: range.location, length: visible.length))
                    if isDualBreak {
                        let comps = prefix.components(separatedBy: "\n")
                        if comps.count >= 3, let lastBreak = prefix.lastIndex(of: "\n"), let secondBreak = prefix[..<lastBreak].lastIndex(of: "\n") {
                            let pullBack = prefix.distance(from: secondBreak, to: prefix.endIndex)
                            if pullBack < visible.length && pullBack > 0 {
                                let adjRange = CFRange(location: range.location, length: visible.length - pullBack)
                                frame = CTFramesetterCreateFrame(framesetter, adjRange, CGPath(rect: contentRect, transform: nil), nil)
                                visible = CTFrameGetVisibleStringRange(frame)
                            }
                        } else if comps.count >= 2, let lastBreak = prefix.lastIndex(of: "\n") {
                            let pullBack = prefix.distance(from: lastBreak, to: prefix.endIndex)
                            if pullBack < visible.length && pullBack > 0 {
                                let adjRange = CFRange(location: range.location, length: visible.length - pullBack)
                                frame = CTFramesetterCreateFrame(framesetter, adjRange, CGPath(rect: contentRect, transform: nil), nil)
                                visible = CTFrameGetVisibleStringRange(frame)
                            }
                        }
                    } else if prefix.components(separatedBy: "\n").count >= 2, let lastBreak = prefix.lastIndex(of: "\n") {
                        let pullBack = prefix.distance(from: lastBreak, to: prefix.endIndex)
                        if pullBack < visible.length && pullBack > 0 {
                            let adjRange = CFRange(location: range.location, length: visible.length - pullBack)
                            frame = CTFramesetterCreateFrame(framesetter, adjRange, CGPath(rect: contentRect, transform: nil), nil)
                            visible = CTFrameGetVisibleStringRange(frame)
                        }
                    }
                }
            }
            CTFrameDraw(frame, context)
            // MORE at bottom if dialogue breaks
            if range.location + visible.length < fullLength {
                let nextIdx = visible.location + visible.length
                let breakLine = (clean as NSString).substring(to: min(nextIdx, clean.count)).components(separatedBy: "\n").count - 1
                let nextEl = elements.indices.contains(breakLine) ? elements[breakLine] : nil
                let prevEl = breakLine > 0 && elements.indices.contains(breakLine-1) ? elements[breakLine-1] : nil
                if (prevEl == .dialogue || prevEl == .character) && (nextEl == .dialogue || nextEl == .parenthetical) {
                    let moreAttr = NSAttributedString(string: "(MORE)", attributes: [.font: UIFont(name: "Courier", size: 10) ?? UIFont.systemFont(ofSize: 10), .foregroundColor: UIColor.black])
                    let morePath = CGPath(rect: CGRect(x: 250, y: 730, width: 112, height: 14), transform: nil)
                    let moreFrame = CTFramesetterCreateFrame(CTFramesetterCreateWithAttributedString(moreAttr), CFRange(location: 0, length: moreAttr.length), morePath, nil)
                    CTFrameDraw(moreFrame, context)
                }
            }
            if range.location > 0 {
                let prevIdx = max(0, range.location - 1)
                let prevLineIdx = (clean as NSString).substring(to: min(prevIdx, clean.count)).components(separatedBy: "\n").count - 1
                let prevEl = elements.indices.contains(prevLineIdx) ? elements[prevLineIdx] : nil
                if prevEl == .dialogue || prevEl == .parenthetical {
                    var charName: String?
                    var scan = prevLineIdx
                    while scan >= 0 {
                        if elements.indices.contains(scan), elements[scan] == .character {
                            charName = lines[scan].trimmingCharacters(in: .whitespacesAndNewlines)
                            break
                        }
                        scan -= 1
                    }
                    if let name = charName, !name.isEmpty {
                        let contAttr = NSAttributedString(string: "\(name) (CONT'D)", attributes: [.font: UIFont(name: "Courier", size: 12) ?? UIFont.monospacedSystemFont(ofSize: 12, weight: .regular), .foregroundColor: UIColor.black])
                        let contPath = CGPath(rect: CGRect(x: 220, y: 72, width: 200, height: 14), transform: nil)
                        let contFrame = CTFramesetterCreateFrame(CTFramesetterCreateWithAttributedString(contAttr), CFRange(location: 0, length: contAttr.length), contPath, nil)
                        CTFrameDraw(contFrame, context)
                    }
                }
            }
            context.restoreGState()
            context.endPDFPage()
            guard visible.length > 0 else { break }
            range.location += visible.length
            pageNumber += 1
            if pageNumber > 250 { break }
        }
        context.closePDF()
        return data as Data
        #endif
    }

    /// Real page count of a rendered PDF; nil if the data isn't a readable PDF.
    static func pageCount(of pdf: Data) -> Int? {
        guard let document = PDFDocument(data: pdf), document.pageCount > 0 else { return nil }
        return document.pageCount
    }

    static func pageCountEstimate(for draft: String) -> Int {
        // Industry: 1 page ≈ 55 lines at Courier 12 with 1" margins — matches CTFramesetter contentRect; orphan guard keeps real pages honest.
        let lines = draft.components(separatedBy: .newlines).count
        return max(1, Int(ceil(Double(lines) / 55.0)))
    }
    /// Keep header pagination stable: "1." top-right per Final Draft, not centered.
    static func titlePageLines(for title: String) -> [String] {
        return [title.uppercased(), "written by", "io.them — Clementine"]
    }

    #if !os(macOS)
    private static func iOSAttributedDraft(for draft: String, printableWidth: CGFloat) -> NSAttributedString {
        let fullText = draft.replacingOccurrences(of: "\r\n", with: "\n")
        let lines = fullText.components(separatedBy: .newlines)
        let inferred = ScreenplayEditorElement.inferredSequence(for: fullText)
        let font = UIFont(name: "Courier", size: 12) ?? UIFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        let result = NSMutableAttributedString()
        for (index, line) in lines.enumerated() {
            let element = inferred.indices.contains(index) ? (inferred[index] ?? .action) : .action
            let para = iOSParagraphStyle(for: element, printableWidth: printableWidth)
            let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.black, .paragraphStyle: para]
            let text = index < lines.count - 1 ? line + "\n" : line
            result.append(NSAttributedString(string: text, attributes: attrs))
        }
        return result
    }
    private static func iOSParagraphStyle(for element: ScreenplayEditorElement, printableWidth: CGFloat) -> NSParagraphStyle {
        let s = NSMutableParagraphStyle()
        s.lineBreakMode = .byWordWrapping
        let w = min(max(printableWidth, 420), 520)
        let d = min(max(w * 0.205, 96), 108)
        let p = min(max(w * 0.275, 126), 144)
        let td = min(max(w * 0.205, 96), 118)
        let tp = min(max(w * 0.265, 126), 152)
        switch element {
        case .sceneHeading, .action:
            s.alignment = .left
            s.firstLineHeadIndent = 0; s.headIndent = 0; s.tailIndent = 0
        case .character:
            // Centered printing: character cue (and lyrics/centered when mapped to .character) must be .center
            s.alignment = .center
            s.firstLineHeadIndent = 0; s.headIndent = 0; s.tailIndent = 0
        case .dialogue:
            s.alignment = .left; s.firstLineHeadIndent = d; s.headIndent = d; s.tailIndent = -td
        case .parenthetical:
            s.alignment = .left; s.firstLineHeadIndent = p; s.headIndent = p; s.tailIndent = -tp
        case .transition:
            s.alignment = .right
            s.firstLineHeadIndent = 0; s.headIndent = 0; s.tailIndent = 0
        }
        return s
    }
    #endif

    enum PrintError: LocalizedError {
        case emptyDraft
        case noDraft
        var errorDescription: String? {
            switch self {
            case .emptyDraft: return "Draft is empty."
            case .noDraft: return "No current draft to print."
            }
        }
    }
}

// MARK: - UIKit printing (iOS)
#if canImport(UIKit)
enum ScreenplayPrintUI {
    @MainActor
    static func printSilently(pdfData: Data, jobName: String, printerURL: URL) async -> Bool {
        let printer = UIPrinter(url: printerURL)
        let info = UIPrintInfo(dictionary: nil)
        info.jobName = jobName
        info.outputType = .general
        let paper = ScreenplayPrintMemory.effectivePaper
        switch paper {
        case .a4: info.orientation = .portrait
        default: info.orientation = .portrait
        }
        let controller = UIPrintInteractionController.shared
        controller.printInfo = info
        controller.showsNumberOfCopies = false
        controller.printingItem = pdfData
        // Contact printer to verify contact before claiming success
        return await withCheckedContinuation { cont in
            printer.contactPrinter { ok in
                guard ok else { cont.resume(returning: false); return }
                controller.print(to: printer) { _, completed, _ in
                    cont.resume(returning: completed)
                }
            }
        }
    }

    @MainActor
    static func pickPrinter(from viewController: UIViewController? = nil) async -> (URL, String)? {
        let picker = UIPrinterPickerController(initiallySelectedPrinter: nil)
        let ok: Bool
        if let vc = viewController {
            ok = await withCheckedContinuation { cont in
                picker.present(from: CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.midY, width: 1, height: 1), in: vc.view, animated: true) { c, completed, _ in
                    cont.resume(returning: completed && c.selectedPrinter != nil)
                }
            }
        } else if let window = presentationWindow() {
            ok = await withCheckedContinuation { cont in
                picker.present(from: CGRect(x: window.bounds.midX, y: window.bounds.midY, width: 1, height: 1), in: window, animated: true) { c, completed, _ in
                    cont.resume(returning: completed && c.selectedPrinter != nil)
                }
            }
        } else {
            return nil
        }
        guard ok, let printer = picker.selectedPrinter else { return nil }
        ScreenplayPrintMemory.rememberedPrinterURL = printer.url
        ScreenplayPrintMemory.rememberedPrinterName = printer.displayName
        return (printer.url, printer.displayName)
    }

    /// Key window of the foreground-active scene, falling back to any window.
    @MainActor
    private static func presentationWindow() -> UIWindow? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let ordered = scenes.filter { $0.activationState == .foregroundActive }
            + scenes.filter { $0.activationState != .foregroundActive }
        let windows = ordered.flatMap(\.windows)
        return windows.first(where: \.isKeyWindow) ?? windows.first
    }
}
#endif

// MARK: - Draft gate + draft source (shared by Studio voice and the Siri intent)
enum ScreenplayDraftGate {
    static func hasFormatErrors(draft: String) -> Bool {
        let t = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return true }
        // Final Draft parity — block prints that would be rejected in prod: orphan parenthetical/dialogue, slug without INT/EXT, empty character cue.
        let lines = t.components(separatedBy: .newlines)
        let els = ScreenplayEditorElement.inferredSequence(for: t)
        for (i, el) in els.enumerated() {
            let line = lines.indices.contains(i) ? lines[i].trimmingCharacters(in: .whitespacesAndNewlines) : ""
            if el == .character && line.isEmpty { return true }
            if el == .sceneHeading && !(line.hasPrefix("INT") || line.hasPrefix("EXT") || line.hasPrefix("INT./EXT") || line.hasPrefix("I/E")) { return true }
            if el == .parenthetical || el == .dialogue {
                // Orphan: a dialogue/parenthetical block whose contiguous run does not start
                // right after a character cue. Walk back over the whole block (a speech may
                // be any number of lines) rather than a fixed window.
                var back = i - 1
                while back >= 0, els.indices.contains(back), els[back] == .dialogue || els[back] == .parenthetical {
                    back -= 1
                }
                let hasCue = back >= 0 && els.indices.contains(back) && els[back] == .character
                if !hasCue && !line.contains("(CONT'D)") && line != "(MORE)" { return true }
            }
        }
        return false
    }
    static func firstErrorReason(draft: String) -> String? {
        if hasFormatErrors(draft: draft) {
            if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "Draft is empty." }
            return "Format check failed — fix orphan dialogue/parenthetical and scene headings (INT./EXT.) before final print."
        }
        return nil
    }
}

// MARK: - Shared draft store (single source; avoids ScreenplayStudioScreen coupling)
enum ScreenplayDraftStore {
    /// The live draft bridge is the single source of truth. It restores the persisted,
    /// owner-scoped draft itself, so there is no separate UserDefaults fallback here.
    static func sharedCurrentDraftText() -> String? {
        let live = ScreenplayLiveDraftBridge.shared.draftText.trimmingCharacters(in: .whitespacesAndNewlines)
        return live.isEmpty ? nil : live
    }
    /// Title of the Studio project the draft is bound to, when there is one.
    static func sharedCurrentTitle() -> String? {
        let title = ScreenplayLiveDraftBridge.shared.projectBinding.projectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        return title.isEmpty ? nil : title
    }
}

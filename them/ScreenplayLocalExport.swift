import Foundation
import ScreenplayStudio
#if os(macOS)
import AppKit
import CoreText
import UniformTypeIdentifiers
#endif

#if os(macOS)
enum ScreenplayLocalExportError: LocalizedError {
    case emptyDraft
    case unsupportedFormat(String)
    case failedToCreatePDFContext
    case failedToCreatePDFConsumer

    var errorDescription: String? {
        switch self {
        case .emptyDraft:
            return "Draft is empty."
        case .unsupportedFormat(let format):
            return "Local export does not support \(format)."
        case .failedToCreatePDFContext:
            return "Could not create the PDF export."
        case .failedToCreatePDFConsumer:
            return "Could not prepare the PDF file data."
        }
    }
}

enum ScreenplayLocalExport {
    static func makeArtifact(
        draft: String,
        title: String,
        format rawFormat: String
    ) throws -> BackendScreenplayExportArtifact {
        let cleanDraft = draft.replacingOccurrences(of: "\r\n", with: "\n")
        let trimmedDraft = cleanDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedDraft.isEmpty else {
            throw ScreenplayLocalExportError.emptyDraft
        }

        let format = rawFormat.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let baseName = sanitizedBaseFilename(from: title)

        switch format {
        case "fountain", "txt":
            let filename = "\(baseName).fountain"
            let data = Data((trimmedDraft + "\n").utf8)
            return BackendScreenplayExportArtifact(
                format: format,
                filename: filename,
                contentType: "text/plain; charset=utf-8",
                data: data
            )
        case "md", "markdown":
            let filename = "\(baseName).md"
            let markdown = markdownDocument(for: cleanDraft)
            return BackendScreenplayExportArtifact(
                format: "md",
                filename: filename,
                contentType: "text/markdown; charset=utf-8",
                data: Data(markdown.utf8)
            )
        case "fdx":
            let filename = "\(baseName).fdx"
            let xml = finalDraftXML(for: cleanDraft, title: title)
            return BackendScreenplayExportArtifact(
                format: format,
                filename: filename,
                contentType: "application/vnd.final-draft",
                data: Data(xml.utf8)
            )
        case "pdf":
            let filename = "\(baseName).pdf"
            let pdfData = try screenplayPDFData(for: cleanDraft, title: title)
            return BackendScreenplayExportArtifact(
                format: format,
                filename: filename,
                contentType: "application/pdf",
                data: pdfData
            )
        default:
            throw ScreenplayLocalExportError.unsupportedFormat(format)
        }
    }

    static func allowedContentType(for artifact: BackendScreenplayExportArtifact) -> UTType {
        switch artifact.format.lowercased() {
        case "pdf":
            return .pdf
        case "fdx":
            return UTType(filenameExtension: "fdx") ?? .xml
        case "fountain", "txt":
            return UTType(filenameExtension: "fountain") ?? .plainText
        case "md", "markdown":
            return UTType(filenameExtension: "md") ?? .plainText
        default:
            return .data
        }
    }

    private static func sanitizedBaseFilename(from rawTitle: String) -> String {
        let trimmed = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let fallback = trimmed.isEmpty ? "screenplay" : trimmed
        let invalid = CharacterSet(charactersIn: "/:\\?%*|\"<>")
        let components = fallback.components(separatedBy: invalid)
        let joined = components.joined(separator: "-")
        let collapsed = joined.replacingOccurrences(of: "  +", with: " ", options: .regularExpression)
        let clean = collapsed.trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.isEmpty ? "screenplay" : clean
    }

    private static func finalDraftXML(for draft: String, title: String? = nil) -> String {
        let lines = draft.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: .newlines)
        let inferred = ScreenplayEditorElement.inferredSequence(for: draft)
        var paragraphs: [String] = []
        var previousType: String?

        for (index, rawLine) in lines.enumerated() {
            let trimmed = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else {
                previousType = nil
                continue
            }
            let element = inferred.indices.contains(index) ? inferred[index] : nil
            let type = finalDraftParagraphType(for: trimmed, element: element, previousType: previousType)
            paragraphs.append("    <Paragraph Type=\"\(type)\"><Text>\(escapeXML(rawLine))</Text></Paragraph>")
            previousType = type
        }

        let body = paragraphs.joined(separator: "\n")
        let titleBlock: String
        if let t = title?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty {
            titleBlock = "  <HeaderAndFooter>\n    <Header> \(escapeXML(t)) </Header>\n  </HeaderAndFooter>\n  <TitlePage>\n    <Content><Para><Text>\(escapeXML(t))</Text></Para></Content>\n  </TitlePage>\n"
        } else {
            titleBlock = ""
        }
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\" ?>\n<FinalDraft DocumentType=\"Script\" Template=\"No\" Version=\"1\">\n\(titleBlock)  <Content>\n\(body)\n  </Content>\n</FinalDraft>\n"
    }

    private static func markdownDocument(for draft: String) -> String {
        let normalizedDraft = draft.replacingOccurrences(of: "\r\n", with: "\n")
        let lines = normalizedDraft.components(separatedBy: .newlines)
        let inferred = ScreenplayEditorElement.inferredSequence(for: normalizedDraft)
        var output: [String] = []
        var previousType: String?

        for (index, rawLine) in lines.enumerated() {
            let trimmed = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else {
                if !output.isEmpty, output.last != "" {
                    output.append("")
                }
                previousType = nil
                continue
            }

            let element = inferred.indices.contains(index) ? inferred[index] : nil
            let type = finalDraftParagraphType(for: trimmed, element: element, previousType: previousType)
            switch type {
            case "Scene Heading":
                output.append("## \(trimmed)")
            case "Character":
                output.append("**\(trimmed)**")
            case "Parenthetical":
                output.append("*\(trimmed)*")
            case "Transition":
                output.append("> \(trimmed)")
            default:
                output.append(trimmed)
            }
            previousType = type
        }

        let collapsed = output
            .joined(separator: "\n")
            .replacingOccurrences(of: "\n{3,}", with: "\n\n", options: .regularExpression)
            .trimmingCharacters(in: .newlines)
        return collapsed + "\n"
    }

    private static func finalDraftParagraphType(
        for trimmed: String,
        element: ScreenplayEditorElement?,
        previousType: String?
    ) -> String {
        if let element {
            switch element {
            case .sceneHeading: return "Scene Heading"
            case .action: return "Action"
            case .character: return "Character"
            case .dialogue: return "Dialogue"
            case .parenthetical: return "Parenthetical"
            case .transition: return "Transition"
            }
        }
        if previousType == "Character" || previousType == "Parenthetical" || previousType == "Dialogue" {
            return "Dialogue"
        }
        if ScreenplayEditorElement.looksLikeSceneHeadingStart(trimmed) {
            return "Scene Heading"
        }
        if ScreenplayEditorElement.looksLikeTransition(trimmed) {
            return "Transition"
        }
        if trimmed.hasPrefix("(") && trimmed.hasSuffix(")") {
            return "Parenthetical"
        }
        if ScreenplayEditorElement.looksLikeCharacterCue(trimmed) {
            return "Character"
        }
        return "Action"
    }

    private static func escapeXML(_ text: String) -> String {
        text
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&apos;")
    }

    private static func screenplayPDFData(for draft: String, title passedTitle: String? = nil) throws -> Data {
        // Title page: explicit Title: line in draft takes precedence, otherwise use passed title from artifact
        let draftTitle = extractTitle(from: draft)
        let trimmedPassed = passedTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = draftTitle ?? (trimmedPassed?.isEmpty == false ? trimmedPassed : nil)
        let bodyDraft = draftTitle != nil ? stripTitleForBody(draft) : draft
        let pageRect = CGRect(x: 0, y: 0, width: 612, height: 792)
        let contentRect = CGRect(x: 108, y: 72, width: 432, height: 648)
        let headerRect = CGRect(x: 108, y: 36, width: 432, height: 20)
        let data = NSMutableData()
        guard let consumer = CGDataConsumer(data: data as CFMutableData) else {
            throw ScreenplayLocalExportError.failedToCreatePDFConsumer
        }
        var mediaBox = pageRect
        guard let context = CGContext(consumer: consumer, mediaBox: &mediaBox, nil) else {
            throw ScreenplayLocalExportError.failedToCreatePDFContext
        }

        var pageNumber = 1
        // Title page if present
        if let titleText = title {
            context.beginPDFPage(nil)
            context.saveGState()
            context.textMatrix = .identity
            context.translateBy(x: 0, y: pageRect.height)
            context.scaleBy(x: 1, y: -1)
            let titleAttr = NSAttributedString(string: titleText, attributes: [
                .font: NSFont(name: "Courier-Bold", size: 18) ?? NSFont.boldSystemFont(ofSize: 18),
                .foregroundColor: NSColor.black,
                .paragraphStyle: centeredTitleStyle()
            ])
            let titlePath = CGPath(rect: CGRect(x: 108, y: 280, width: 432, height: 200), transform: nil)
            let titleFrame = CTFramesetterCreateFrame(CTFramesetterCreateWithAttributedString(titleAttr), CFRange(location: 0, length: titleAttr.length), titlePath, nil)
            CTFrameDraw(titleFrame, context)
            // Footer: Draft date
            let footer = NSAttributedString(string: Date().formatted(date: .abbreviated, time: .omitted), attributes: [
                .font: NSFont(name: "Courier", size: 9) ?? NSFont.systemFont(ofSize: 9),
                .foregroundColor: NSColor.black.withAlphaComponent(0.5)
            ])
            let footerPath = CGPath(rect: CGRect(x: 108, y: 740, width: 432, height: 20), transform: nil)
            let footerFrame = CTFramesetterCreateFrame(CTFramesetterCreateWithAttributedString(footer), CFRange(location: 0, length: footer.length), footerPath, nil)
            CTFrameDraw(footerFrame, context)
            context.restoreGState()
            context.endPDFPage()
            pageNumber += 1
        }

        let cleanBody = bodyDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleanBody.isEmpty {
            context.closePDF()
            return data as Data
        }
        let attributed = attributedDraft(for: bodyDraft, printableWidth: contentRect.width)
        let framesetter = CTFramesetterCreateWithAttributedString(attributed)
        var currentRange = CFRange(location: 0, length: 0)
        let fullLength = attributed.length
        let lines = bodyDraft.components(separatedBy: .newlines)
        let elements = ScreenplayEditorElement.inferredSequence(for: bodyDraft)
        while currentRange.location < fullLength {
            context.beginPDFPage(nil)
            context.saveGState()
            context.textMatrix = .identity
            context.translateBy(x: 0, y: pageRect.height)
            context.scaleBy(x: 1, y: -1)

            // Header: page number (no number on title page, start at 1 for script pages)
            if pageNumber > 1 || title == nil {
                let headerText = "\(pageNumber - (title != nil ? 1 : 0))."
                let headerAttr = NSAttributedString(string: headerText, attributes: [
                    .font: NSFont(name: "Courier", size: 10) ?? NSFont.systemFont(ofSize: 10),
                    .foregroundColor: NSColor.black.withAlphaComponent(0.7)
                ])
                let headerPath = CGPath(rect: headerRect, transform: nil)
                let headerFrame = CTFramesetterCreateFrame(CTFramesetterCreateWithAttributedString(headerAttr), CFRange(location: 0, length: headerAttr.length), headerPath, nil)
                // Right align by drawing at right edge
                context.saveGState()
                context.textMatrix = .identity
                // Header already placed via frame, just draw
                CTFrameDraw(headerFrame, context)
                context.restoreGState()
            }

            let path = CGPath(rect: contentRect, transform: nil)
            var frame = CTFramesetterCreateFrame(framesetter, currentRange, path, nil)
            var visible = CTFrameGetVisibleStringRange(frame)
            // Widow/orphan: don't leave single line alone on next page — pull it back
            if currentRange.location + visible.length < fullLength {
                let remaining = fullLength - (currentRange.location + visible.length)
                // Estimate remaining lines: if < ~50 chars, likely 1 line
                if remaining > 0 && remaining < 80 {
                    let prefix = (attributed.string as NSString).substring(with: NSRange(location: currentRange.location, length: visible.length))
                    let linesInVisible = prefix.components(separatedBy: "\n").count
                    if linesInVisible >= 2 {
                        // Pull last line back by recreating frame with one line less
                        let lastLineBreak = prefix.lastIndex(of: "\n") ?? prefix.endIndex
                        let pullBack = prefix.distance(from: lastLineBreak, to: prefix.endIndex)
                        if pullBack < visible.length && pullBack > 0 {
                            let adjustedRange = CFRange(location: currentRange.location, length: visible.length - pullBack)
                            let adjPath = CGPath(rect: contentRect, transform: nil)
                            frame = CTFramesetterCreateFrame(framesetter, CFRange(location: currentRange.location, length: adjustedRange.length), adjPath, nil)
                            visible = CTFrameGetVisibleStringRange(frame)
                        }
                    }
                }
            }
            CTFrameDraw(frame, context)

            // Widow/orphan + MORE/CONT'D: check if dialogue breaks across pages
            if currentRange.location + visible.length < fullLength {
                let nextIdx = visible.location + visible.length
                // Find element at break
                let breakLineIndex = lineIndex(at: nextIdx, in: bodyDraft)
                let nextElement = elements.indices.contains(breakLineIndex) ? elements[breakLineIndex] : nil
                let prevElement = breakLineIndex > 0 && elements.indices.contains(breakLineIndex - 1) ? elements[breakLineIndex - 1] : nil
                if (prevElement == .dialogue || prevElement == .character) && (nextElement == .dialogue || nextElement == .parenthetical) {
                    // Draw (MORE) at bottom center
            let moreAttr = NSAttributedString(string: "(MORE)", attributes: [
                        .font: NSFont(name: "Courier", size: 10) ?? NSFont.systemFont(ofSize: 10),
                        .foregroundColor: NSColor.black
                    ])
                    let morePath = CGPath(rect: CGRect(x: 250, y: 730, width: 112, height: 14), transform: nil)
                    let moreFrame = CTFramesetterCreateFrame(CTFramesetterCreateWithAttributedString(moreAttr), CFRange(location: 0, length: moreAttr.length), morePath, nil)
                    CTFrameDraw(moreFrame, context)
                    // Next page will get CONT'D via header logic below — store for next iteration
                }
                // Widow: if next page would have only 1 line of a block, pull it back (simple: if visible ends near line break, extend by one line)
                // Handled by CTFramesetter naturally; we ensure at least 2 lines remain by checking line count in visible range
            }

            // CONT'D at top of page after break (for dialogue continuation)
            if currentRange.location > 0 {
                let prevIdx = max(0, currentRange.location - 1)
                let prevLineIdx = lineIndex(at: prevIdx, in: bodyDraft)
                let prevEl = elements.indices.contains(prevLineIdx) ? elements[prevLineIdx] : nil
                if prevEl == .dialogue || prevEl == .parenthetical {
                    // Find character name for this dialogue block
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
                        let contAttr = NSAttributedString(string: "\(name) (CONT'D)", attributes: [
                            .font: NSFont(name: "Courier", size: 12) ?? NSFont.monospacedSystemFont(ofSize: 12, weight: .regular),
                            .foregroundColor: NSColor.black
                        ])
                        let contPath = CGPath(rect: CGRect(x: 220, y: 72, width: 200, height: 14), transform: nil)
                        // Draw just above content (we already translated, so y 72 is top of content, need to offset)
                        // Instead draw at content top before frame: we already drew frame, overlay cont'd
                        let contFrame = CTFramesetterCreateFrame(CTFramesetterCreateWithAttributedString(contAttr), CFRange(location: 0, length: contAttr.length), contPath, nil)
                        CTFrameDraw(contFrame, context)
                    }
                }
            }

            context.restoreGState()
            context.endPDFPage()

            guard visible.length > 0 else { break }
            currentRange.location += visible.length
            pageNumber += 1
            // Safety: 55 lines/page ~ 200 pages max
            if pageNumber > 250 { break }
        }

        context.closePDF()
        return data as Data
    }

    private static func centeredTitleStyle() -> NSParagraphStyle {
        let s = NSMutableParagraphStyle()
        s.alignment = .center
        s.lineBreakMode = .byWordWrapping
        return s
    }

    private static func extractTitle(from draft: String) -> String? {
        let lines = draft.components(separatedBy: .newlines)
        guard let first = lines.first?.trimmingCharacters(in: .whitespacesAndNewlines), !first.isEmpty else { return nil }
        // If draft starts with Title: or is all caps short title, treat as title page trigger via explicit marker
        if first.lowercased().hasPrefix("title:") {
            return String(first.dropFirst(6)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        // Otherwise no title page — title comes from artifact baseName, not draft body
        return nil
    }
    private static func stripTitleForBody(_ draft: String) -> String {
        let lines = draft.components(separatedBy: .newlines)
        if let first = lines.first, first.lowercased().hasPrefix("title:") {
            return lines.dropFirst().joined(separator: "\n")
        }
        return draft
    }
    private static func lineIndex(at offset: Int, in draft: String) -> Int {
        let prefix = (draft as NSString).substring(to: min(offset, draft.count))
        return prefix.components(separatedBy: "\n").count - 1
    }

    private static func attributedDraft(for draft: String, printableWidth: CGFloat) -> NSAttributedString {
        let fullText = draft.replacingOccurrences(of: "\r\n", with: "\n")
        let lines = fullText.components(separatedBy: .newlines)
        let elements = ScreenplayEditorElement.inferredSequence(for: fullText)
        let font = NSFont(name: "Courier", size: 12) ?? NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        let result = NSMutableAttributedString()

        for (index, line) in lines.enumerated() {
            let element = elements.indices.contains(index) ? elements[index] ?? .action : .action
            let paragraph = paragraphStyle(for: element, printableWidth: printableWidth)
            let attributes: [NSAttributedString.Key: Any] = [
                .font: font,
                .foregroundColor: NSColor.black,
                .paragraphStyle: paragraph,
            ]
            let text = index < lines.count - 1 ? line + "\n" : line
            result.append(NSAttributedString(string: text, attributes: attributes))
        }

        return result
    }

    private static func paragraphStyle(for element: ScreenplayEditorElement, printableWidth: CGFloat) -> NSParagraphStyle {
        let style = NSMutableParagraphStyle()
        style.lineBreakMode = .byWordWrapping
        style.paragraphSpacing = 0
        style.paragraphSpacingBefore = 0
        style.lineHeightMultiple = 1.0
        style.tabStops = []

        let boundedWidth = min(max(printableWidth, 420), 520)
        let dialogueIndent = min(max(boundedWidth * 0.205, 96), 108)
        let parentheticalIndent = min(max(boundedWidth * 0.275, 126), 144)
        let trailingDialogueInset = min(max(boundedWidth * 0.205, 96), 118)
        let trailingParentheticalInset = min(max(boundedWidth * 0.265, 126), 152)

        switch element {
        case .sceneHeading, .action:
            style.alignment = .left
            style.firstLineHeadIndent = 0
            style.headIndent = 0
            style.tailIndent = 0
        case .character:
            style.alignment = .center
            style.firstLineHeadIndent = 0
            style.headIndent = 0
            style.tailIndent = 0
        case .dialogue:
            style.alignment = .left
            style.firstLineHeadIndent = dialogueIndent
            style.headIndent = dialogueIndent
            style.tailIndent = -trailingDialogueInset
        case .parenthetical:
            style.alignment = .left
            style.firstLineHeadIndent = parentheticalIndent
            style.headIndent = parentheticalIndent
            style.tailIndent = -trailingParentheticalInset
        case .transition:
            style.alignment = .right
            style.firstLineHeadIndent = 0
            style.headIndent = 0
            style.tailIndent = 0
        }
        return style
    }
}
#endif

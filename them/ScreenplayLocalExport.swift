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
        case "fdx":
            let filename = "\(baseName).fdx"
            let xml = finalDraftXML(for: cleanDraft)
            return BackendScreenplayExportArtifact(
                format: format,
                filename: filename,
                contentType: "application/vnd.final-draft",
                data: Data(xml.utf8)
            )
        case "pdf":
            let filename = "\(baseName).pdf"
            let pdfData = try screenplayPDFData(for: cleanDraft)
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

    private static func finalDraftXML(for draft: String) -> String {
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
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\" ?>\n<FinalDraft DocumentType=\"Script\" Template=\"No\" Version=\"1\">\n  <Content>\n\(body)\n  </Content>\n</FinalDraft>\n"
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

    private static func screenplayPDFData(for draft: String) throws -> Data {
        let pageRect = CGRect(x: 0, y: 0, width: 612, height: 792)
        let contentRect = CGRect(x: 108, y: 72, width: 432, height: 648)
        let attributed = attributedDraft(for: draft, printableWidth: contentRect.width)
        let framesetter = CTFramesetterCreateWithAttributedString(attributed)

        let data = NSMutableData()
        guard let consumer = CGDataConsumer(data: data as CFMutableData) else {
            throw ScreenplayLocalExportError.failedToCreatePDFConsumer
        }
        var mediaBox = pageRect
        guard let context = CGContext(consumer: consumer, mediaBox: &mediaBox, nil) else {
            throw ScreenplayLocalExportError.failedToCreatePDFContext
        }

        var currentRange = CFRange(location: 0, length: 0)
        let fullLength = attributed.length
        while currentRange.location < fullLength {
            context.beginPDFPage(nil)
            context.saveGState()
            context.textMatrix = .identity
            context.translateBy(x: 0, y: pageRect.height)
            context.scaleBy(x: 1, y: -1)

            let path = CGPath(rect: contentRect, transform: nil)
            let frame = CTFramesetterCreateFrame(framesetter, currentRange, path, nil)
            CTFrameDraw(frame, context)
            let visible = CTFrameGetVisibleStringRange(frame)

            context.restoreGState()
            context.endPDFPage()

            guard visible.length > 0 else { break }
            currentRange.location += visible.length
        }

        context.closePDF()
        return data as Data
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

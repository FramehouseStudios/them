import Foundation
import PDFKit
#if os(macOS)
import AppKit
import Vision
#endif

@MainActor
enum ScreenplayStudioDraftFileImport {
    static func extract(
        from sourceURL: URL,
        owner: ScreenplayStudioAuthContext
    ) async throws -> (text: String, usedOCR: Bool, usedBackendFountainImport: Bool) {
        let ext = sourceURL.pathExtension.lowercased()
        if ext == "pdf" {
            let extracted = try extractDraftTextFromPDF(sourceURL)
            return (extracted.text, extracted.usedOCR, false)
        }
        if ScreenplayStudioScreen.draftImportTextExtensions.contains(ext) {
            let raw = try String(contentsOf: sourceURL, encoding: .utf8)
            if let imported = try? await BackendMemoryAPI.shared.importFountainDraft(text: raw, expectedOwner: owner) {
                let parsedDraft = normalizeImportedDraftText(imported.screenplay.fountainDraft)
                if !parsedDraft.isEmpty {
                    return (parsedDraft, false, true)
                }
            }
            let normalized = normalizeImportedDraftText(raw)
            guard !normalized.isEmpty else {
                throw NSError(
                    domain: "ScreenplayStudioImport",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "That file did not contain readable screenplay text."]
                )
            }
            return (normalized, false, false)
        }
        throw NSError(
            domain: "ScreenplayStudioImport",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Only screenplay PDFs and Fountain/plain-text script files can be imported into the draft."]
        )
    }

    private static func extractDraftTextFromPDF(_ sourceURL: URL) throws -> (text: String, usedOCR: Bool) {
        guard let document = PDFDocument(url: sourceURL) else {
            throw NSError(
                domain: "ScreenplayStudioImport",
                code: 3,
                userInfo: [NSLocalizedDescriptionKey: "That PDF could not be opened."]
            )
        }
        let raw = document.string ?? ""
        let normalized = normalizeImportedDraftText(raw)
        if !normalized.isEmpty {
            return (normalized, false)
        }

        let ocrText = try extractDraftTextFromScannedPDF(document)
        let normalizedOCR = normalizeImportedDraftText(ocrText)
        guard !normalizedOCR.isEmpty else {
            throw NSError(
                domain: "ScreenplayStudioImport",
                code: 4,
                userInfo: [NSLocalizedDescriptionKey: "That PDF did not contain readable screenplay text, even after OCR."]
            )
        }
        return (normalizedOCR, true)
    }

    private static func extractDraftTextFromScannedPDF(_ document: PDFDocument) throws -> String {
        guard document.pageCount > 0 else { return "" }
        var pageTexts: [String] = []
        for index in 0..<document.pageCount {
            guard let page = document.page(at: index) else { continue }
            let pageText = try recognizeText(in: page)
            let normalizedPageText = pageText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !normalizedPageText.isEmpty {
                pageTexts.append(normalizedPageText)
            }
        }
        return pageTexts.joined(separator: "\n\n")
    }

    private static func recognizeText(in page: PDFPage) throws -> String {
        #if os(macOS)
        guard let cgImage = renderedCGImage(for: page) else {
            throw NSError(
                domain: "ScreenplayStudioImport",
                code: 5,
                userInfo: [NSLocalizedDescriptionKey: "A scanned PDF page could not be rendered for OCR."]
            )
        }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.recognitionLanguages = ["en-US"]
        request.minimumTextHeight = 0.006

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        try handler.perform([request])

        let observations = (request.results ?? []).sorted { lhs, rhs in
            let left = lhs.boundingBox
            let right = rhs.boundingBox
            if abs(left.midY - right.midY) > 0.025 {
                return left.midY > right.midY
            }
            return left.minX < right.minX
        }
        let lines = observations.compactMap { observation in
            observation.topCandidates(1).first?.string
        }
        return lines.joined(separator: "\n")
        #else
        throw NSError(
            domain: "ScreenplayStudioImport",
            code: 6,
            userInfo: [NSLocalizedDescriptionKey: "OCR PDF import is currently available on macOS only."]
        )
        #endif
    }

    #if os(macOS)
    private static func renderedCGImage(for page: PDFPage) -> CGImage? {
        let bounds = page.bounds(for: .mediaBox)
        let targetSize = NSSize(
            width: max(1400, bounds.width * 2.2),
            height: max(1800, bounds.height * 2.2)
        )
        let image = page.thumbnail(of: targetSize, for: .mediaBox)
        var rect = NSRect(origin: .zero, size: image.size)
        return image.cgImage(forProposedRect: &rect, context: nil, hints: nil)
    }
    #endif

    private static func normalizeImportedDraftText(_ raw: String) -> String {
        let normalizedLineEndings = raw
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .replacingOccurrences(of: "\u{00A0}", with: " ")
        let rawLines = normalizedLineEndings.components(separatedBy: .newlines)
        var cleanedLines: [String] = []
        var previousWasBlank = false

        for rawLine in rawLines {
            let compactLine = rawLine
                .replacingOccurrences(of: "\t", with: " ")
                .trimmingCharacters(in: .whitespaces)
            let lowercase = compactLine.lowercased()
            let isPageMarker = compactLine.range(of: #"^(page\s+)?\d+[a-z]?$"#, options: .regularExpression) != nil
            if isPageMarker || lowercase == "continued:" || lowercase == "(continued)" {
                continue
            }
            if compactLine.isEmpty {
                if previousWasBlank { continue }
                cleanedLines.append("")
                previousWasBlank = true
                continue
            }
            cleanedLines.append(compactLine)
            previousWasBlank = false
        }

        return cleanedLines
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

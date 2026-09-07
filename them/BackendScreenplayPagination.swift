// Backend pagination response models; moved verbatim out of BackendMemoryAPI.swift (D009 gate compensation).
import Foundation

nonisolated struct BackendScreenplayPaginationPage: Decodable, Hashable {
    let page: Int
    let startLine: Int
    let endLine: Int
    let lineCount: Int
    let preview: String?
    let estMinutes: Double?
}

nonisolated struct BackendScreenplayPaginateResponse: Decodable {
    let stage: String?
    let mode: String?
    let title: String?
    let phase: String?
    let targetPages: Int?
    let pageCount: Int
    let lineCount: Int
    let linesPerPage: Int
    let pages: [BackendScreenplayPaginationPage]
    let lengthProfile: String?
}

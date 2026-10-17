import Foundation

/// One current-draft memo per Studio model. Never publish while reading a view,
/// and never trust delayed inspector pagination for a different draft snapshot.
struct ScreenplayPrintedPageCountCache {
    private var draft: String?
    private var pageCount = 0

    mutating func count(for currentDraft: String) -> Int {
        if draft != currentDraft {
            pageCount = ScreenplayPageLayout.pageCount(for: currentDraft)
            draft = currentDraft
        }
        return pageCount
    }
}

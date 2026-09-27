import XCTest
@testable import them

final class CreativeIntentHomeCopyTests: XCTestCase {
    func testHomeCardNeverShowsModelGuidance() {
        let kinds: [CreativeIntentKind] = [
            .screenplayPageWrite, .storyDevelopment, .mixedSupport,
            .companionSupport, .practicalSupport, .reflectiveSupport,
        ]
        for kind in kinds {
            let line = kind.homeCardLine
            XCTAssertFalse(line.isEmpty, "\(kind)")
            XCTAssertFalse(line.localizedCaseInsensitiveContains("the user"), "\(kind): \(line)")
            XCTAssertLessThanOrEqual(line.count, 60, "\(kind): \(line)")
        }
    }
}

final class CreativePresenceDetailCopyTests: XCTestCase {
    func testRailPresenceLineIsWrittenForTheWriter() {
        for kind in CreativeIntentKind.allCases {
            let state = CreativeCompanionSignalState(
                intent: CreativeIntentSnapshot(
                    kind: kind, label: kind.title, summary: "model guidance", nextMove: "",
                    confidence: 0.8, sourceText: "", updatedAt: Date()
                ),
                presence: CreativePresenceSnapshot(title: "", detail: "", updatedAt: Date()),
                proactiveSuggestion: nil
            )
            for domain in [StudioMemoryDomain.project, .companion] {
                let detail = CreativeCompanionSignalEngine.retone(state, companionMode: .coach, memoryDomain: domain).presence.detail
                XCTAssertFalse(detail.isEmpty, "\(kind)")
                for jargon in ["continuity", "lane", "the user", "Locked on"] {
                    XCTAssertFalse(detail.localizedCaseInsensitiveContains(jargon), "\(kind): \(detail)")
                }
            }
        }
    }
}

import XCTest
@testable import them

final class HomeCoreLoopPresentationTests: XCTestCase {
    func testPrimaryNavigationAlwaysProvidesFourUnambiguousDestinations() {
        let signedOut = HomeCoreLoopPresentation.primaryDestinations(accountTitle: "Sign In")

        XCTAssertEqual(signedOut.map(\.destination), [.write, .memories, .account, .more])
        XCTAssertEqual(signedOut.map(\.title), ["Write", "Memories", "Sign In", "More"])
        XCTAssertEqual(Set(signedOut.map(\.accessibilityIdentifier)).count, 4)
        XCTAssertEqual(signedOut.first?.accessibilityIdentifier, "home.open-studio")
        XCTAssertEqual(signedOut[2].accessibilityIdentifier, "home.open-account")

        let signedIn = HomeCoreLoopPresentation.primaryDestinations(accountTitle: "Account")
        XCTAssertEqual(signedIn.map(\.title), ["Write", "Memories", "Account", "More"])
    }

    func testTalkActionIsPersistentTapLanguageAndNamesClementine() {
        let standard = HomeCoreLoopPresentation.talkActionTitle(usesRealtimePreviewTransport: false)
        let realtime = HomeCoreLoopPresentation.talkActionTitle(usesRealtimePreviewTransport: true)

        XCTAssertEqual(standard, "Talk with Clementine")
        XCTAssertEqual(realtime, "Talk live with Clementine")
        XCTAssertFalse(standard.localizedCaseInsensitiveContains("hold"))
        XCTAssertFalse(realtime.localizedCaseInsensitiveContains("hold"))
    }

    func testMoreSurfaceContainsEverySecondaryDestination() {
        XCTAssertEqual(
            HomeMoreDestination.allCases,
            [
                .voiceSettings,
                .companion,
                .history,
                .notes,
                .tasks,
                .recap,
                .trust,
                .data,
                .privacy,
                .report,
            ]
        )
        XCTAssertEqual(Set(HomeMoreDestination.allCases.map(\.accessibilityIdentifier)).count, 10)
        XCTAssertTrue(HomeMoreDestination.allCases.allSatisfy { !$0.subtitle.isEmpty })
    }
}

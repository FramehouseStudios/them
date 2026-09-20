import XCTest
@testable import them

@MainActor
final class ScreenplayStudioThemRailPresentationTests: XCTestCase {
    func testOverviewAndSurfaceMixPreserveCanonicalCopyOrderAndCounts() {
        XCTAssertEqual(ScreenplayStudioThemRailOverviewPresentation.standard.title, "Clementine")
        XCTAssertEqual(
            ScreenplayStudioThemRailOverviewPresentation.standard.subtitle,
            "Keep Clementine's instincts, memory, and craft signals together."
        )

        let analytics = ScreenplayCompanionAnalyticsSnapshot(
            updatedAt: .distantPast,
            totalTurns: 38,
            homeTurns: 11,
            studioTurns: 27,
            voiceTurns: 9,
            typedTurns: 29,
            modeSwitches: 0,
            memoryClears: 0,
            threadClears: 0,
            lastSurfaceRaw: "studio",
            lastSourceRaw: "typed"
        )
        let surfaceMix = ScreenplayStudioThemRailPresentationPlanner.surfaceMix(from: analytics)

        XCTAssertEqual(surfaceMix.stats.map(\.label), ["Home", "Studio", "Voice", "Typed"])
        XCTAssertEqual(surfaceMix.stats.map(\.value), ["11", "27", "9", "29"])
        XCTAssertEqual(
            surfaceMix.detail,
            "Companion turns stay attached to the same creative lane, whether they start on the page, in voice, or in the command bar."
        )

        let emptySurfaceMix = ScreenplayStudioThemRailPresentationPlanner.surfaceMix(from: .empty)
        XCTAssertEqual(emptySurfaceMix.stats.map(\.value), ["0", "0", "0", "0"])
    }

    func testLiveIntentUsesHasContentWhilePreservingRawDisplayRules() {
        let summaryOnly = CreativeCompanionSignalState(
            intent: CreativeIntentSnapshot(
                kind: .storyDevelopment,
                label: "",
                summary: "The scene is turning toward trust.",
                nextMove: "",
                confidence: 0.8,
                sourceText: "",
                updatedAt: .distantPast
            ),
            presence: .empty,
            proactiveSuggestion: nil
        )

        let summaryPresentation = ScreenplayStudioThemRailPresentationPlanner.liveIntent(from: summaryOnly)
        XCTAssertTrue(summaryPresentation.isVisible)
        XCTAssertEqual(summaryPresentation.presenceTitle, "Creative Presence")
        XCTAssertNil(summaryPresentation.intentLabel)
        XCTAssertNil(summaryPresentation.presenceDetail)
        XCTAssertNil(summaryPresentation.proactivePrompt)

        let rawFields = CreativeCompanionSignalState(
            intent: CreativeIntentSnapshot(
                kind: .screenplayPageWrite,
                label: " Page Write ",
                summary: "",
                nextMove: "",
                confidence: 0.9,
                sourceText: "",
                updatedAt: .distantPast
            ),
            presence: CreativePresenceSnapshot(
                title: " ",
                detail: " Stay close to Mara. ",
                updatedAt: .distantPast
            ),
            proactiveSuggestion: CreativeProactiveSuggestion(
                category: "craft",
                prompt: " Add one irreversible choice. ",
                reason: "momentum",
                updatedAt: .distantPast
            )
        )

        let rawPresentation = ScreenplayStudioThemRailPresentationPlanner.liveIntent(from: rawFields)
        XCTAssertTrue(rawPresentation.isVisible)
        XCTAssertEqual(rawPresentation.presenceTitle, " ")
        XCTAssertEqual(rawPresentation.intentLabel, " Page Write ")
        XCTAssertEqual(rawPresentation.presenceDetail, " Stay close to Mara. ")
        XCTAssertEqual(rawPresentation.proactivePrompt, " Add one irreversible choice. ")

        XCTAssertFalse(
            ScreenplayStudioThemRailPresentationPlanner.liveIntent(from: .empty).isVisible
        )
    }

    func testMomentumPrecedenceIsLoadingThenErrorThenInsightThenHidden() {
        let nudge = makeNudge()
        let history = makeHistory()

        XCTAssertEqual(
            ScreenplayStudioThemRailPresentationPlanner.momentum(
                isLoading: true,
                errorText: "Backend unavailable",
                nudge: nudge,
                history: history
            ),
            .loading
        )

        XCTAssertEqual(
            ScreenplayStudioThemRailPresentationPlanner.momentum(
                isLoading: false,
                errorText: "  Backend unavailable  ",
                nudge: nudge,
                history: history
            ),
            .failure(message: "  Backend unavailable  ")
        )

        let whitespaceFallsThrough = ScreenplayStudioThemRailPresentationPlanner.momentum(
            isLoading: false,
            errorText: " \n ",
            nudge: nudge,
            history: history
        )
        guard case .insight(let projectedNudge, let projectedHistory) = whitespaceFallsThrough else {
            return XCTFail("Whitespace-only errors should fall through to available insight.")
        }
        XCTAssertEqual(projectedNudge, nudge)
        XCTAssertEqual(projectedHistory, history)

        XCTAssertEqual(
            ScreenplayStudioThemRailPresentationPlanner.momentum(
                isLoading: false,
                errorText: "",
                nudge: BackendBlockSignalNudgeState.make(signal: nil),
                history: BackendBlockSignalHistoryTrendState.make(history: nil)
            ),
            .hidden
        )
    }

    func testMomentumAllowsHistoryOnlyAndComposesNudgeWithHistory() {
        let hiddenNudge = BackendBlockSignalNudgeState.make(signal: nil)
        let nudge = makeNudge()
        let history = makeHistory()

        let historyOnly = ScreenplayStudioThemRailPresentationPlanner.momentum(
            isLoading: false,
            errorText: "",
            nudge: hiddenNudge,
            history: history
        )
        XCTAssertEqual(historyOnly, .insight(nudge: hiddenNudge, history: history))

        let combined = ScreenplayStudioThemRailPresentationPlanner.momentum(
            isLoading: false,
            errorText: "",
            nudge: nudge,
            history: history
        )
        XCTAssertEqual(combined, .insight(nudge: nudge, history: history))
    }

    private func makeNudge() -> BackendBlockSignalNudgeState {
        BackendBlockSignalNudgeState.make(signal: BackendBlockSignalResponse(
            schemaVersion: 1,
            score: 0.72,
            level: .medium,
            signals: [
                BackendBlockSignalComponent(
                    key: "scene_completion_gap",
                    value: 0.72,
                    weight: 0.5
                )
            ],
            summary: "Finish the active scene before opening another thread.",
            habitsObserved: BackendBlockSignalHabitsObserved(
                lastSceneAttemptAtMs: 1,
                lastSceneCompletionAtMs: nil,
                lastTalkTurnAtMs: 2,
                scenesAttempted: 3,
                scenesCompleted: 1,
                recentShortTurns: 2
            ),
            error: nil
        ))
    }

    private func makeHistory() -> BackendBlockSignalHistoryTrendState {
        BackendBlockSignalHistoryTrendState.make(history: BackendBlockSignalHistoryResponse(
            schemaVersion: 1,
            entries: [
                BackendBlockSignalHistoryEntry(at: 1, score: 0.3, level: .low),
                BackendBlockSignalHistoryEntry(at: 2, score: 0.6, level: .medium)
            ],
            counts: BackendBlockSignalHistoryCounts(
                total: 2,
                byLevel: BackendBlockSignalHistoryCountsByLevel(low: 1, medium: 1, high: 0)
            ),
            newestAt: 2,
            oldestAt: 1,
            error: nil
        ))
    }
}

import XCTest
@testable import them

@MainActor
final class ScreenplayStudioCreativePartnerPresentationTests: XCTestCase {
    func testCanonicalCopyModesAndMetricsPreserveExactValuesAndOrder() {
        let firstPinID = uuid("00000000-0000-0000-0000-000000000001")
        let secondPinID = uuid("00000000-0000-0000-0000-000000000002")
        let presentation = makePresentation(
            selectedModeRawValue: "co_writer",
            recentTurnCount: 12,
            queuedFixCount: 4,
            voicePinTurns: [
                makeTurn(id: firstPinID, exchangeID: firstPinID),
                makeTurn(id: secondPinID, exchangeID: secondPinID)
            ]
        )

        XCTAssertEqual(presentation.copy.title, "Creative partner")
        XCTAssertEqual(
            presentation.copy.subtitle,
            "Mode, Voice Pin, and page requests move through one calmer lane."
        )
        XCTAssertEqual(presentation.copy.modeMetaLabel, "Mode")
        XCTAssertEqual(presentation.copy.modeSectionTitle, "Companion mode")
        XCTAssertEqual(presentation.copy.modePickerLabel, "Companion Mode")
        XCTAssertEqual(presentation.copy.memoryMetaLabel, "Memory")
        XCTAssertEqual(presentation.copy.outputMetaLabel, "Output")
        XCTAssertEqual(presentation.copy.voicePinTitle, "Voice Pin")
        XCTAssertEqual(presentation.copy.emptyVoicePinTitle, "No active Voice Pin")
        XCTAssertEqual(
            presentation.copy.emptyVoicePinDetail,
            "Dictate or send a note to keep it off the page."
        )
        XCTAssertEqual(presentation.copy.contextTitle, "Context")
        XCTAssertEqual(
            presentation.copy.contextDetail,
            "Thread memory, routing, and screenplay fixes stay attached to this same partner surface."
        )
        XCTAssertEqual(presentation.copy.clearThreadButtonTitle, "Clear Thread")
        XCTAssertEqual(presentation.copy.clearMemoryButtonTitle, "Clear Memory")
        XCTAssertEqual(presentation.copy.reuseButtonTitle, "Reuse")
        XCTAssertEqual(presentation.copy.toPageButtonTitle, "To Page")

        XCTAssertEqual(presentation.modeOptions.map(\.rawValue), ["coach", "co_writer", "comfort"])
        XCTAssertEqual(presentation.modeOptions.map(\.title), ["Coach", "Co-writer", "Comfort"])
        XCTAssertEqual(presentation.modeOptions.map(\.shortTitle), ["Coach", "Co-write", "Comfort"])
        XCTAssertEqual(
            presentation.modeOptions.map(\.summary),
            [
                "Practical support with one clear next step.",
                "Warm creative partnership that still stays craft-aware.",
                "Soothing, grounding, and non-pressuring presence."
            ]
        )
        XCTAssertEqual(presentation.selectedModeRawValue, "co_writer")
        XCTAssertEqual(presentation.selectedModeShortTitle, "Co-write")
        XCTAssertEqual(
            presentation.selectedModeSummary,
            "Warm creative partnership that still stays craft-aware."
        )

        XCTAssertEqual(presentation.metrics.map(\.label), ["Turns", "Pins", "Fixes"])
        XCTAssertEqual(presentation.metrics.map(\.value), ["12", "2", "4"])
    }

    func testPageAndVoicePinRoutesProjectCanonicalBadgesAndExactlyTwoRoutePills() {
        let page = makePresentation(routesToPage: true)

        XCTAssertEqual(page.route, .page)
        XCTAssertEqual(page.route.targetLabel, "Page")
        XCTAssertEqual(page.route.targetSystemImage, "doc.text")
        XCTAssertEqual(page.route.workflowLabel, "Page Write")
        XCTAssertEqual(page.routePills.count, 2)
        XCTAssertEqual(page.routePills.map(\.label), ["Memory", "Output"])
        XCTAssertEqual(page.routePills.map(\.value), ["Project", "Page"])

        let voicePin = makePresentation(routesToPage: false)

        XCTAssertEqual(voicePin.route, .voicePin)
        XCTAssertEqual(voicePin.route.targetLabel, "Voice Pin")
        XCTAssertEqual(voicePin.route.targetSystemImage, "text.bubble")
        XCTAssertEqual(voicePin.route.workflowLabel, "Advice")
        XCTAssertEqual(voicePin.routePills.count, 2)
        XCTAssertEqual(voicePin.routePills.map(\.label), ["Memory", "Output"])
        XCTAssertEqual(voicePin.routePills.map(\.value), ["Companion", "Pin"])
    }

    func testEmptyAndOrphanedVoicePinsKeepCountIndependentFromLatestContent() {
        let empty = makePresentation()

        XCTAssertEqual(empty.voicePin.count, 0)
        XCTAssertEqual(empty.voicePin.content, .empty)

        let exchangeID = uuid("00000000-0000-0000-0000-000000000010")
        let orphaned = makePresentation(
            voicePinTurns: [makeTurn(exchangeID: exchangeID)]
        )

        XCTAssertEqual(orphaned.voicePin.count, 1)
        XCTAssertEqual(orphaned.metrics.map(\.value), ["0", "1", "0"])
        XCTAssertEqual(orphaned.voicePin.content, .empty)
    }

    func testNewestTimestampWinsRegardlessOfInputOrderAndProjectsExcerptAndStableIDs() {
        let now = Date(timeIntervalSince1970: 10_000)
        let newestTurnID = uuid("00000000-0000-0000-0000-000000000021")
        let newestExchangeID = uuid("00000000-0000-0000-0000-000000000022")
        let olderTurnID = uuid("00000000-0000-0000-0000-000000000023")
        let olderExchangeID = uuid("00000000-0000-0000-0000-000000000024")
        let rawAsk = "  Keep the pause before her answer.  "
        let rawPrompt = "  Put this beat on the page unchanged.  "
        let presentation = makePresentation(
            voicePinTurns: [
                makeTurn(
                    id: newestTurnID,
                    exchangeID: newestExchangeID,
                    userAskLabel: rawAsk,
                    fountainOutput: "\n  INT. DINER - NIGHT  \n\nMARA waits.\nThird line is hidden.",
                    timestamp: now.addingTimeInterval(-120)
                ),
                makeTurn(
                    id: olderTurnID,
                    exchangeID: olderExchangeID,
                    userAskLabel: "Older ask",
                    fountainOutput: "Older output",
                    timestamp: now.addingTimeInterval(-600)
                )
            ],
            exchanges: [
                makeExchange(id: olderExchangeID, prompt: "Older prompt"),
                makeExchange(
                    id: newestExchangeID,
                    prompt: rawPrompt,
                    source: .typed,
                    developmentText: nil
                )
            ],
            now: now
        )

        guard case .latest(let latest) = presentation.voicePin.content else {
            return XCTFail("A matched newest turn should project the latest Voice Pin.")
        }
        XCTAssertEqual(presentation.voicePin.count, 2)
        XCTAssertEqual(latest.turnID, newestTurnID)
        XCTAssertEqual(latest.exchangeID, newestExchangeID)
        XCTAssertEqual(latest.userAskLabel, rawAsk)
        XCTAssertEqual(latest.outputExcerpt, "INT. DINER - NIGHT · MARA waits.")
        XCTAssertEqual(latest.timeAgo, "2m ago")
        XCTAssertEqual(latest.accessibilityLabel, "Typed. INT. DINER - NIGHT · MARA waits.")

        let matchedExchange = [
            makeExchange(id: olderExchangeID, prompt: "Older prompt"),
            makeExchange(id: newestExchangeID, prompt: rawPrompt)
        ].first { $0.id == latest.exchangeID }
        XCTAssertEqual(matchedExchange?.prompt, rawPrompt)
    }

    func testOrphanedNewestTurnDoesNotFallBackToAnOlderMatchedExchange() {
        let now = Date(timeIntervalSince1970: 20_000)
        let olderExchangeID = uuid("00000000-0000-0000-0000-000000000031")
        let orphanedExchangeID = uuid("00000000-0000-0000-0000-000000000032")
        let presentation = makePresentation(
            voicePinTurns: [
                makeTurn(
                    exchangeID: olderExchangeID,
                    timestamp: now.addingTimeInterval(-120)
                ),
                makeTurn(
                    exchangeID: orphanedExchangeID,
                    timestamp: now.addingTimeInterval(-10)
                )
            ],
            exchanges: [makeExchange(id: olderExchangeID)],
            now: now
        )

        XCTAssertEqual(presentation.voicePin.count, 2)
        XCTAssertEqual(presentation.voicePin.content, .empty)
    }

    func testAccessibilityUsesVoiceDevelopmentTextAfterOuterTrim() {
        let now = Date(timeIntervalSince1970: 30_000)
        let exchangeID = uuid("00000000-0000-0000-0000-000000000041")
        let presentation = makePresentation(
            voicePinTurns: [
                makeTurn(
                    exchangeID: exchangeID,
                    fountainOutput: "Excerpt fallback",
                    timestamp: now
                )
            ],
            exchanges: [
                makeExchange(
                    id: exchangeID,
                    source: .voice,
                    developmentText: "  First line.\nSecond line.  "
                )
            ],
            now: now
        )

        guard case .latest(let latest) = presentation.voicePin.content else {
            return XCTFail("A matched Voice Pin should be projected.")
        }
        XCTAssertEqual(latest.outputExcerpt, "Excerpt fallback")
        XCTAssertEqual(latest.accessibilityLabel, "Voice. First line.\nSecond line.")
    }

    func testAccessibilityUsesTypedExcerptWhenDevelopmentTextIsBlank() {
        let now = Date(timeIntervalSince1970: 40_000)
        let exchangeID = uuid("00000000-0000-0000-0000-000000000051")
        let presentation = makePresentation(
            voicePinTurns: [
                makeTurn(
                    exchangeID: exchangeID,
                    fountainOutput: " First line \n\n Second line \n Third line ",
                    timestamp: now
                )
            ],
            exchanges: [
                makeExchange(
                    id: exchangeID,
                    source: .typed,
                    developmentText: " \n "
                )
            ],
            now: now
        )

        guard case .latest(let latest) = presentation.voicePin.content else {
            return XCTFail("A matched Voice Pin should be projected.")
        }
        XCTAssertEqual(latest.outputExcerpt, "First line · Second line")
        XCTAssertEqual(latest.accessibilityLabel, "Typed. First line · Second line")
    }

    func testResolvedVoicePinOutputUsesCanonicalPrecedenceTrimmingAndEmptyFallback() {
        XCTAssertEqual(
            ScreenplayStudioCreativePartnerPresentationPlanner.resolvedVoicePinOutput(
                insertedText: "  Inserted page text.\n",
                revisedBlockText: "Revised block text.",
                resolvedAnchorExcerpt: "Resolved anchor excerpt.",
                developmentText: "Development text.",
                noteBody: "Note body."
            ),
            "Inserted page text."
        )
        XCTAssertEqual(
            ScreenplayStudioCreativePartnerPresentationPlanner.resolvedVoicePinOutput(
                insertedText: " \n ",
                revisedBlockText: "  Revised block text.  ",
                resolvedAnchorExcerpt: "Resolved anchor excerpt.",
                developmentText: "Development text.",
                noteBody: "Note body."
            ),
            "Revised block text."
        )
        XCTAssertEqual(
            ScreenplayStudioCreativePartnerPresentationPlanner.resolvedVoicePinOutput(
                insertedText: nil,
                revisedBlockText: "",
                resolvedAnchorExcerpt: "  Resolved anchor excerpt.  ",
                developmentText: "Development text.",
                noteBody: "Note body."
            ),
            "Resolved anchor excerpt."
        )
        XCTAssertEqual(
            ScreenplayStudioCreativePartnerPresentationPlanner.resolvedVoicePinOutput(
                insertedText: nil,
                revisedBlockText: nil,
                resolvedAnchorExcerpt: "\n",
                developmentText: "  Development text.  ",
                noteBody: "Note body."
            ),
            "Development text."
        )
        XCTAssertEqual(
            ScreenplayStudioCreativePartnerPresentationPlanner.resolvedVoicePinOutput(
                insertedText: nil,
                revisedBlockText: nil,
                resolvedAnchorExcerpt: nil,
                developmentText: " ",
                noteBody: "  Note body.  "
            ),
            "Note body."
        )
        XCTAssertEqual(
            ScreenplayStudioCreativePartnerPresentationPlanner.resolvedVoicePinOutput(
                insertedText: nil,
                revisedBlockText: " ",
                resolvedAnchorExcerpt: nil,
                developmentText: "\n",
                noteBody: " \n "
            ),
            ""
        )
    }

    func testRelativeTimestampUsesSecondMinuteAndHourThresholdsDeterministically() {
        let now = Date(timeIntervalSince1970: 100_000)
        let cases: [(elapsed: TimeInterval, expected: String)] = [
            (-10, "0s ago"),
            (0, "0s ago"),
            (59, "59s ago"),
            (60, "1m ago"),
            (3_599, "59m ago"),
            (3_600, "1h ago"),
            (7_200, "2h ago")
        ]

        for item in cases {
            XCTAssertEqual(
                ScreenplayStudioCreativePartnerPresentationPlanner.relativeTimestamp(
                    from: now.addingTimeInterval(-item.elapsed),
                    now: now
                ),
                item.expected,
                "Unexpected projection for \(item.elapsed) elapsed seconds."
            )
        }
    }

    private func makePresentation(
        selectedModeRawValue: String = "coach",
        routesToPage: Bool = false,
        recentTurnCount: Int = 0,
        queuedFixCount: Int = 0,
        voicePinTurns: [ScreenplayStudioCreativePartnerVoicePinTurnInput] = [],
        exchanges: [ScreenplayStudioCreativePartnerVoicePinExchangeInput] = [],
        now: Date = Date(timeIntervalSince1970: 100_000)
    ) -> ScreenplayStudioCreativePartnerPresentation {
        ScreenplayStudioCreativePartnerPresentationPlanner.make(
            modes: canonicalModes,
            selectedModeRawValue: selectedModeRawValue,
            routesToPage: routesToPage,
            recentTurnCount: recentTurnCount,
            queuedFixCount: queuedFixCount,
            voicePinTurns: voicePinTurns,
            exchanges: exchanges,
            now: now
        )
    }

    private var canonicalModes: [ScreenplayStudioCreativePartnerModeInput] {
        [
            ScreenplayStudioCreativePartnerModeInput(
                rawValue: "coach",
                title: "Coach",
                shortTitle: "Coach",
                summary: "Practical support with one clear next step."
            ),
            ScreenplayStudioCreativePartnerModeInput(
                rawValue: "co_writer",
                title: "Co-writer",
                shortTitle: "Co-write",
                summary: "Warm creative partnership that still stays craft-aware."
            ),
            ScreenplayStudioCreativePartnerModeInput(
                rawValue: "comfort",
                title: "Comfort",
                shortTitle: "Comfort",
                summary: "Soothing, grounding, and non-pressuring presence."
            )
        ]
    }

    private func makeTurn(
        id: UUID = UUID(),
        exchangeID: UUID,
        userAskLabel: String = "Help with this beat",
        fountainOutput: String = "MARA crosses to the window.",
        timestamp: Date = Date(timeIntervalSince1970: 100_000)
    ) -> ScreenplayStudioCreativePartnerVoicePinTurnInput {
        ScreenplayStudioCreativePartnerVoicePinTurnInput(
            id: id,
            exchangeID: exchangeID,
            userAskLabel: userAskLabel,
            fountainOutput: fountainOutput,
            timestamp: timestamp
        )
    }

    private func makeExchange(
        id: UUID,
        prompt: String = "Help with this beat",
        source: ScreenplayStudioCreativePartnerVoicePinExchangeInput.Source = .typed,
        developmentText: String? = nil
    ) -> ScreenplayStudioCreativePartnerVoicePinExchangeInput {
        ScreenplayStudioCreativePartnerVoicePinExchangeInput(
            id: id,
            prompt: prompt,
            source: source,
            developmentText: developmentText
        )
    }

    private func uuid(_ value: String) -> UUID {
        guard let id = UUID(uuidString: value) else {
            fatalError("Invalid UUID fixture: \(value)")
        }
        return id
    }
}

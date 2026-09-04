import XCTest
@testable import them

final class VoiceSettingsPresentationTests: XCTestCase {
    func testHeaderKeepsClementineNamedAndSignalsUnambiguous() {
        XCTAssertEqual(VoiceSettingsPresentation.companionName, "Clementine")
        XCTAssertTrue(VoiceSettingsPresentation.subtitle.contains("Clementine"))

        let writerSignals = VoiceSettingsPresentation.headerSignals(isScreenwriter: true)
        XCTAssertEqual(writerSignals.count, 3)
        XCTAssertEqual(Set(writerSignals.map(\.id)).count, writerSignals.count)
        XCTAssertEqual(writerSignals[1].title, "Writer mode remembered")

        let creativeSignals = VoiceSettingsPresentation.headerSignals(isScreenwriter: false)
        XCTAssertEqual(creativeSignals[1].title, "Creative context ready")
        XCTAssertTrue(creativeSignals.allSatisfy { !$0.title.isEmpty && !$0.systemImage.isEmpty })
    }

    func testRelationshipCopyAndMetricsRemainReadable() {
        XCTAssertEqual(VoiceSettingsPresentation.relationshipStageTitle(3), "Relationship stage 3 of 5")
        XCTAssertEqual(
            VoiceSettingsPresentation.screenwriterIdentity(isScreenwriter: true),
            "Clementine remembers that you're a screenwriter"
        )

        let metrics = VoiceSettingsPresentation.relationshipMetrics(
            sessionCount: 12,
            messageCount: 47,
            depthScore: 3.24,
            romanceTension: 1.96
        )
        XCTAssertEqual(metrics.map(\.id), ["sessions", "messages", "depth", "tension"])
        XCTAssertEqual(metrics.map(\.value), ["12", "47", "3.2", "2.0"])
        XCTAssertEqual(metrics.last?.label, "Creative tension")
        XCTAssertEqual(Set(metrics.map(\.id)).count, metrics.count)
    }

    func testEveryRelationshipStageHasActionableDescription() {
        for stage in 1...5 {
            XCTAssertFalse(VoiceSettingsPresentation.stageDescription(stage).isEmpty)
        }
        XCTAssertEqual(VoiceSettingsPresentation.stageDescription(5), "Deep trust. Mature. Restrained.")
    }
}

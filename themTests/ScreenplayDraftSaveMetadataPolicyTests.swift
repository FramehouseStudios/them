import Foundation
import XCTest
@testable import them

final class ScreenplayDraftSaveMetadataPolicyTests: XCTestCase {
    func testNilAnchorAndBindingFieldsMatchCanonicalEmptyServerEcho() {
        let requestedAnchor = anchor(
            writeID: "  write-1  ",
            sceneLabel: nil,
            excerpt: nil,
            insertedText: nil,
            updatedAt: nil
        )
        let confirmedAnchor = anchor(
            writeID: "write-1",
            sceneLabel: "",
            excerpt: "",
            insertedText: "",
            updatedAt: 0
        )
        let requestedBinding = binding(
            sceneID: "  scene-1  ",
            slugline: nil,
            shortLabel: nil,
            beatIDs: nil,
            beatLabels: nil,
            updatedAt: nil
        )
        let confirmedBinding = binding(
            sceneID: "scene-1",
            slugline: "",
            shortLabel: "",
            beatIDs: [],
            beatLabels: [],
            updatedAt: 0
        )

        XCTAssertTrue(ScreenplayDraftSaveMetadataPolicy.matchesServerEcho(
            requestedAnchors: [requestedAnchor],
            confirmedAnchors: [confirmedAnchor],
            requestedBindings: [requestedBinding],
            confirmedBindings: [confirmedBinding]
        ))
    }

    func testWhitespaceListsDeduplicationAndLastRecordMatchBackendNormalization() {
        let firstAnchor = anchor(writeID: "write-1", sceneLabel: "old")
        let replacementAnchor = anchor(writeID: " write-1 ", sceneLabel: "  INT.   ROOM  ")
        let echoedAnchor = anchor(writeID: "write-1", sceneLabel: "INT. ROOM")
        let firstBinding = binding(sceneID: "scene-1", beatIDs: ["beat-a"])
        let replacementBinding = binding(sceneID: " scene-1 ", beatIDs: [" beat-a ", "beat-a", "beat-b"])
        let echoedBinding = binding(sceneID: "scene-1", beatIDs: ["beat-a", "beat-b"])

        XCTAssertTrue(ScreenplayDraftSaveMetadataPolicy.matchesServerEcho(
            requestedAnchors: [firstAnchor, replacementAnchor],
            confirmedAnchors: [echoedAnchor],
            requestedBindings: [firstBinding, replacementBinding],
            confirmedBindings: [echoedBinding]
        ))
    }

    func testMeaningfulMetadataDifferencesRemainUnequal() {
        let requestedAnchor = anchor(writeID: "write-1", insertedText: "Writer words", updatedAt: 10)
        let requestedBinding = binding(sceneID: "scene-1", beatIDs: ["beat-a"])

        XCTAssertFalse(matches(requestedAnchor, anchor(writeID: "write-2", insertedText: "Writer words", updatedAt: 10),
            requestedBinding, requestedBinding))
        XCTAssertFalse(matches(requestedAnchor, anchor(writeID: "write-1", insertedText: "Different", updatedAt: 10),
            requestedBinding, requestedBinding))
        XCTAssertFalse(matches(requestedAnchor, anchor(writeID: "write-1", insertedText: "Writer words", updatedAt: 11),
            requestedBinding, requestedBinding))
        XCTAssertFalse(matches(requestedAnchor, requestedAnchor, requestedBinding,
            binding(sceneID: "scene-1", beatIDs: ["beat-b"])))
    }

    func testMissingServerCollectionsDoNotProveEmptyMetadata() {
        XCTAssertFalse(ScreenplayDraftSaveMetadataPolicy.matchesServerEcho(
            requestedAnchors: [], confirmedAnchors: nil,
            requestedBindings: [], confirmedBindings: []
        ))
        XCTAssertFalse(ScreenplayDraftSaveMetadataPolicy.matchesServerEcho(
            requestedAnchors: [], confirmedAnchors: [],
            requestedBindings: [], confirmedBindings: nil
        ))
    }

    func testUTF16BoundaryFailsClosedWhenBackendWouldStoreLoneSurrogate() {
        let splitPair = String(repeating: "a", count: 70) + "😀z"

        XCTAssertFalse(matchesWriteID(requested: splitPair, confirmed: splitPair))
    }

    func testUTF16BoundaryKeepsWholeEmojiWhenPairEndsAtTruncationPoint() {
        let requested = String(repeating: "a", count: 69) + "😀zz"
        let confirmed = String(repeating: "a", count: 69) + "😀…"

        XCTAssertTrue(matchesWriteID(requested: requested, confirmed: confirmed))
    }

    func testUTF16BoundaryMaySplitGraphemeAtRepresentableCombiningScalar() {
        let requested = String(repeating: "a", count: 70) + "e\u{0301}z"
        let confirmed = String(repeating: "a", count: 70) + "e…"

        XCTAssertTrue(matchesWriteID(requested: requested, confirmed: confirmed))
    }

    private func matches(
        _ requestedAnchor: BackendScreenplayWriteAnchor,
        _ confirmedAnchor: BackendScreenplayWriteAnchor,
        _ requestedBinding: BackendScreenplayBindingRecord,
        _ confirmedBinding: BackendScreenplayBindingRecord
    ) -> Bool {
        ScreenplayDraftSaveMetadataPolicy.matchesServerEcho(
            requestedAnchors: [requestedAnchor], confirmedAnchors: [confirmedAnchor],
            requestedBindings: [requestedBinding], confirmedBindings: [confirmedBinding]
        )
    }

    private func matchesWriteID(requested: String, confirmed: String) -> Bool {
        ScreenplayDraftSaveMetadataPolicy.matchesServerEcho(
            requestedAnchors: [anchor(writeID: requested)],
            confirmedAnchors: [anchor(writeID: confirmed)],
            requestedBindings: [],
            confirmedBindings: []
        )
    }

    private func anchor(
        writeID: String,
        sceneLabel: String? = nil,
        excerpt: String? = nil,
        insertedText: String? = nil,
        updatedAt: TimeInterval? = nil
    ) -> BackendScreenplayWriteAnchor {
        BackendScreenplayWriteAnchor(
            writeId: writeID,
            anchorLine: nil,
            anchorEndLine: nil,
            anchorSceneLabel: sceneLabel,
            anchorExcerpt: excerpt,
            insertedText: insertedText,
            updatedAt: updatedAt
        )
    }

    private func binding(
        sceneID: String,
        slugline: String? = nil,
        shortLabel: String? = nil,
        beatIDs: [String]? = nil,
        beatLabels: [String]? = nil,
        updatedAt: TimeInterval? = nil
    ) -> BackendScreenplayBindingRecord {
        BackendScreenplayBindingRecord(
            draftSceneId: sceneID,
            draftLine: nil,
            draftEndLine: nil,
            draftSlugline: slugline,
            draftShortLabel: shortLabel,
            outlineSceneId: nil,
            outlineSceneTitle: nil,
            outlineSceneSlugline: nil,
            outlineBeatIds: beatIDs,
            outlineBeatLabels: beatLabels,
            actTitle: nil,
            matchedBy: nil,
            updatedAt: updatedAt
        )
    }
}

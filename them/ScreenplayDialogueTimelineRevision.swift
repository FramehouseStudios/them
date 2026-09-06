// D009 I4: moved verbatim out of ScreenplayLiveDraftBridge.swift (no behaviour change).
import Foundation

struct ScreenplayDialogueTimelineRevision: Codable, Equatable {
    let turnId: String
    let revisionId: String
    let audioAssetId: String
    let durationMs: Int
    let documentRevisionId: String
    let insertionAnchor: ScreenplayPageAnchor
    let segments: [ScreenplayDialogueSegment]

    var totalRevealUnitCount: Int {
        segments.reduce(into: 0) { count, segment in
            count += max(segment.revealUnits.count, 1)
        }
    }

    var compatibilityCues: [ScreenplayVoiceCue] {
        segments.enumerated().map { index, segment in
            ScreenplayVoiceCue(
                index: index,
                text: segment.text,
                elementRaw: segment.kind.rawValue,
                startMs: segment.startMs,
                endMs: segment.endMs
            )
        }
    }

    func revealSnapshot(at playbackTimeMs: Int) -> (
        visibleUTF16Length: Int,
        appliedRevealUnitCount: Int,
        activeSegment: ScreenplayDialogueSegment?
    ) {
        let safePlaybackTime = max(playbackTimeMs, 0)
        guard !segments.isEmpty else {
            return (0, 0, nil)
        }

        var visibleUTF16Length = 0
        var appliedRevealUnitCount = 0
        var activeSegment: ScreenplayDialogueSegment?

        for segment in segments {
            let segmentStart = max(segment.pageAnchor.rangeStart, 0)
            let segmentEnd = max(segment.pageAnchor.rangeEnd, segmentStart)
            let revealUnits = segment.revealUnits.isEmpty
                ? [
                    ScreenplayRevealUnit(
                        id: "\(segment.id):unit:0",
                        text: segment.text,
                        startMs: segment.startMs,
                        endMs: max(segment.endMs, segment.startMs + 1),
                        utf16Start: 0,
                        utf16End: max((segment.text as NSString).length, 0)
                    )
                ]
                : segment.revealUnits

            if safePlaybackTime < segment.startMs {
                activeSegment = activeSegment ?? segment
                break
            }

            if safePlaybackTime >= segment.endMs {
                visibleUTF16Length = max(visibleUTF16Length, segmentEnd)
                appliedRevealUnitCount += revealUnits.count
                continue
            }

            activeSegment = segment
            var segmentVisibleUTF16 = segmentStart
            for unit in revealUnits {
                if safePlaybackTime >= unit.startMs {
                    segmentVisibleUTF16 = max(segmentVisibleUTF16, segmentStart + unit.utf16End)
                    appliedRevealUnitCount += 1
                } else {
                    break
                }
            }
            visibleUTF16Length = max(visibleUTF16Length, min(segmentVisibleUTF16, segmentEnd))
            break
        }

        if activeSegment == nil && visibleUTF16Length > 0 {
            activeSegment = segments.last
        }

        return (visibleUTF16Length, appliedRevealUnitCount, activeSegment)
    }
}

import Foundation

struct ScreenplayOutlineMutationDrainCoordinator {
    struct FollowUp: Equatable {
        let shouldRun: Bool
        let force: Bool
    }

    private(set) var isInFlight = false
    private var followUpRequested = false
    private var forcedFollowUpRequested = false

    mutating func begin(force: Bool) -> Bool {
        guard !isInFlight else {
            followUpRequested = true
            forcedFollowUpRequested = forcedFollowUpRequested || force
            return false
        }
        isInFlight = true
        return true
    }

    mutating func finish(
        drainedProjectID: String,
        selectedProjectID: String
    ) -> FollowUp {
        precondition(isInFlight, "Cannot finish an outline mutation drain that is not active.")

        let drainedID = drainedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let selectedID = selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let projectChanged = !selectedID.isEmpty && selectedID != drainedID
        let followUp = FollowUp(
            shouldRun: followUpRequested || projectChanged,
            force: forcedFollowUpRequested
        )

        isInFlight = false
        followUpRequested = false
        forcedFollowUpRequested = false
        return followUp
    }
}

import Combine
import Foundation

@MainActor
final class StudioTypedSubmissionScope: ObservableObject {
    var activeID: UUID?
    var ownerContext: ScreenplayStudioAuthContext?

    func isCurrent(
        _ id: UUID,
        accountGeneration: Int,
        currentAccountGeneration: Int,
        isCancelled: Bool
    ) -> Bool {
        guard !isCancelled, activeID == id, accountGeneration == currentAccountGeneration else { return false }
        return ownerContext.map { BackendAuthClient.requestOwnerIsCurrent($0) } ?? true
    }
}

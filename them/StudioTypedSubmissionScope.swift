import Combine
import Foundation

@MainActor
final class StudioTypedSubmissionScope: ObservableObject {
    var activeID: UUID?

    func isCurrent(
        _ id: UUID,
        accountGeneration: Int,
        currentAccountGeneration: Int,
        isCancelled: Bool
    ) -> Bool {
        !isCancelled && activeID == id && accountGeneration == currentAccountGeneration
    }
}

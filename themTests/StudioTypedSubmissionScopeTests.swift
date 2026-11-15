import XCTest
@testable import them

@MainActor
final class StudioTypedSubmissionScopeTests: XCTestCase {
    func testRestartingSamePromptUsesNewOwnerAndRejectsOldResult() async {
        let scope = StudioTypedSubmissionScope()
        let firstAttempt = UUID()
        let restartedAttempt = UUID()
        scope.activeID = firstAttempt
        XCTAssertTrue(scope.isCurrent(firstAttempt, accountGeneration: 3, currentAccountGeneration: 3, isCancelled: false))

        // Two submissions of identical text still have distinct request owners.
        scope.activeID = restartedAttempt

        XCTAssertFalse(scope.isCurrent(firstAttempt, accountGeneration: 3, currentAccountGeneration: 3, isCancelled: false))
        XCTAssertTrue(scope.isCurrent(restartedAttempt, accountGeneration: 3, currentAccountGeneration: 3, isCancelled: false))
    }

    func testAccountTransitionRejectsResultEvenWhenSubmissionIDStillMatches() async {
        let scope = StudioTypedSubmissionScope()
        let attempt = UUID()
        scope.activeID = attempt

        XCTAssertFalse(scope.isCurrent(attempt, accountGeneration: 3, currentAccountGeneration: 4, isCancelled: false))
        XCTAssertEqual(scope.activeID, attempt)
        XCTAssertTrue(scope.isCurrent(attempt, accountGeneration: 4, currentAccountGeneration: 4, isCancelled: false))
    }

    func testCancellationRejectsResultWithoutChangingOwnership() async {
        let scope = StudioTypedSubmissionScope()
        let attempt = UUID()
        scope.activeID = attempt

        XCTAssertFalse(scope.isCurrent(attempt, accountGeneration: 3, currentAccountGeneration: 3, isCancelled: true))
        XCTAssertEqual(scope.activeID, attempt)
        scope.activeID = nil
        XCTAssertFalse(scope.isCurrent(attempt, accountGeneration: 3, currentAccountGeneration: 3, isCancelled: false))
    }

    func testRepeatedGuardedCleanupDoesNotRetireNewOwner() async {
        let scope = StudioTypedSubmissionScope()
        let firstAttempt = UUID()
        let restartedAttempt = UUID()
        scope.activeID = firstAttempt
        if scope.isCurrent(firstAttempt, accountGeneration: 3, currentAccountGeneration: 3, isCancelled: false) {
            scope.activeID = nil
        }
        XCTAssertNil(scope.activeID)
        if scope.isCurrent(firstAttempt, accountGeneration: 3, currentAccountGeneration: 3, isCancelled: false) {
            scope.activeID = nil
        }
        XCTAssertNil(scope.activeID)

        scope.activeID = restartedAttempt
        if scope.isCurrent(firstAttempt, accountGeneration: 3, currentAccountGeneration: 3, isCancelled: false) {
            scope.activeID = nil
        }

        XCTAssertEqual(scope.activeID, restartedAttempt)
        XCTAssertTrue(scope.isCurrent(restartedAttempt, accountGeneration: 3, currentAccountGeneration: 3, isCancelled: false))
    }
    func testCanonicalOwnerChangeRejectsResultBeforeTheUIGenerationChanges() async {
        let scope = StudioTypedSubmissionScope()
        let attempt = UUID()
        let owner = BackendAuthClient.currentRequestOwner()
        scope.activeID = attempt
        scope.ownerContext = owner
        XCTAssertTrue(scope.isCurrent(attempt, accountGeneration: 3, currentAccountGeneration: 3, isCancelled: false))
        scope.ownerContext = ScreenplayStudioAuthContext(userID: owner.userID,
            sessionIntentGeneration: owner.sessionIntentGeneration == Int.max ? 0 : owner.sessionIntentGeneration + 1)
        XCTAssertFalse(scope.isCurrent(attempt, accountGeneration: 3, currentAccountGeneration: 3, isCancelled: false),
            "The UI generation can lag the canonical authentication intent.")
        XCTAssertEqual(scope.activeID, attempt, "Rejecting content must not change invocation ownership.")
    }

}

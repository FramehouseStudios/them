import XCTest
@testable import them

final class ScreenplayOutlineMutationOwnerPartitionTests: XCTestCase {
    func testUserPartitionNormalizesWhitespaceAndFallsBackWithoutExposingEmptyIdentity() {
        XCTAssertEqual(
            ScreenplayOutlineMutationOwnerPartition.user("  writer-42  "),
            "user:writer-42"
        )
        XCTAssertEqual(
            ScreenplayOutlineMutationOwnerPartition.user("   "),
            "user:anonymous"
        )
        XCTAssertEqual(
            ScreenplayOutlineMutationOwnerPartition.user(nil),
            "user:anonymous"
        )
    }

    func testClientPartitionIsStableOpaqueAndProjectScopedWhenTokenIsUnavailable() {
        let first = ScreenplayOutlineMutationOwnerPartition.client(
            token: "  sensitive-client-token  ",
            fallbackProjectId: "project-1"
        )
        let second = ScreenplayOutlineMutationOwnerPartition.client(
            token: "sensitive-client-token",
            fallbackProjectId: "different-project"
        )
        XCTAssertEqual(first, second)
        XCTAssertTrue(first.hasPrefix("client:"))
        XCTAssertFalse(first.contains("sensitive-client-token"))

        let unresolvedOne = ScreenplayOutlineMutationOwnerPartition.client(
            token: nil,
            fallbackProjectId: " project-1 "
        )
        let unresolvedOneAgain = ScreenplayOutlineMutationOwnerPartition.client(
            token: "",
            fallbackProjectId: "project-1"
        )
        let unresolvedTwo = ScreenplayOutlineMutationOwnerPartition.client(
            token: nil,
            fallbackProjectId: "project-2"
        )
        XCTAssertEqual(unresolvedOne, unresolvedOneAgain)
        XCTAssertNotEqual(unresolvedOne, unresolvedTwo)
        XCTAssertFalse(unresolvedOne.contains("project-1"))
    }
}

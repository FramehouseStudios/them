import XCTest
@testable import them

final class ScreenplayOutlineMutationAcknowledgementTests: XCTestCase {
    func testAcceptsExactSavedAcknowledgement() throws {
        let response = try decodeResponse(
            status: "saved",
            replayed: "false",
            conflict: "false",
            committedRevision: "8"
        )

        XCTAssertEqual(
            ScreenplayOutlineMutationAcknowledgement.committedRevision(
                response: response,
                entry: makeEntry()
            ),
            8
        )
    }

    func testAcceptsExactReplayedAcknowledgement() throws {
        let response = try decodeResponse(
            status: "replayed",
            replayed: "true",
            conflict: "false",
            committedRevision: "8"
        )

        XCTAssertEqual(
            ScreenplayOutlineMutationAcknowledgement.committedRevision(
                response: response,
                entry: makeEntry()
            ),
            8
        )
    }

    func testRejectsAcknowledgementMissingRequiredBooleansOrCommittedRevision() throws {
        let missingConflict = try decodeResponse(
            status: "saved",
            replayed: "false",
            conflict: "null",
            committedRevision: "8"
        )
        let missingReplay = try decodeResponse(
            status: "saved",
            replayed: "null",
            conflict: "false",
            committedRevision: "8"
        )
        let missingCommit = try decodeResponse(
            status: "saved",
            replayed: "false",
            conflict: "false",
            committedRevision: "null"
        )

        for response in [missingConflict, missingReplay, missingCommit] {
            XCTAssertNil(
                ScreenplayOutlineMutationAcknowledgement.committedRevision(
                    response: response,
                    entry: makeEntry()
                )
            )
        }
    }

    func testRejectsMismatchedScopeRevisionAndStatus() throws {
        let wrongProject = try decodeResponse(
            status: "saved",
            replayed: "false",
            conflict: "false",
            committedRevision: "8",
            projectID: "project-b"
        )
        let wrongRevision = try decodeResponse(
            status: "saved",
            replayed: "false",
            conflict: "false",
            committedRevision: "9"
        )
        let contradictoryReplay = try decodeResponse(
            status: "saved",
            replayed: "true",
            conflict: "false",
            committedRevision: "8"
        )

        for response in [wrongProject, wrongRevision, contradictoryReplay] {
            XCTAssertNil(
                ScreenplayOutlineMutationAcknowledgement.committedRevision(
                    response: response,
                    entry: makeEntry()
                )
            )
        }
    }

    private func makeEntry() -> ScreenplayOutlineMutationOutboxEntry {
        ScreenplayOutlineMutationOutboxEntry(
            id: "request-1",
            projectId: "project-a",
            ownerUserId: "user:owner-a",
            expectedOutlineRevision: 7,
            acts: [],
            scenes: [],
            beats: [],
            source: "test",
            createdAt: 100,
            updatedAt: 100,
            status: .inflight,
            retries: 0,
            nextAttemptAt: 100,
            lastError: ""
        )
    }

    private func decodeResponse(
        status: String,
        replayed: String,
        conflict: String,
        committedRevision: String,
        projectID: String = "project-a"
    ) throws -> BackendScreenplayOutlineMutationResponse {
        let data = Data(
            """
            {
              "stage": "screenplay_outline",
              "status": "\(status)",
              "replayed": \(replayed),
              "conflict": \(conflict),
              "client_request_id": "request-1",
              "expected_outline_revision": 7,
              "outline_revision": 8,
              "committed_revision": \(committedRevision),
              "project_id": "\(projectID)",
              "project": {"id": "\(projectID)", "title": "Project", "outline_revision": 8},
              "outline": {"revision": 8, "acts": [], "scenes": [], "beats": []}
            }
            """.utf8
        )
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(BackendScreenplayOutlineMutationResponse.self, from: data)
    }
}

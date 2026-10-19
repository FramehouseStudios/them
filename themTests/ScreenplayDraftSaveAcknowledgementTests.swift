import XCTest
@testable import them

final class ScreenplayDraftSaveAcknowledgementTests: XCTestCase {
    func testAcceptsExactSavedAndReplayReceipts() throws {
        let draft = "  INT. LAB - NIGHT\r\n\r\nJOHN\r\nWe begin.  "
        let saved = try response(status: "saved", replayed: false, requestDraft: draft)
        let replayed = try response(status: "replayed", replayed: true, requestDraft: draft)

        XCTAssertEqual(
            try ScreenplayDraftSaveAcknowledgement.validate(
                saved,
                projectId: "project-1",
                clientRequestId: "request-1",
                requestedDraft: draft
            ).versionId,
            "version-2"
        )
        XCTAssertNoThrow(try ScreenplayDraftSaveAcknowledgement.validate(
            replayed,
            projectId: "project-1",
            clientRequestId: "request-1",
            requestedDraft: draft
        ))
    }

    func testRejectsContradictoryStatusScopeIdentityAndHash() throws {
        let draft = "INT. LAB - NIGHT\n\nJOHN\nWe begin."
        let cases: [[String: Any]] = [
            ["stage": "screenplay_outline"],
            ["status": "queued"],
            ["conflict": true],
            ["replayed": true],
            ["project_id": "project-2"],
            ["client_request_id": "request-2"],
            ["version_id": "version-other"],
            ["server_version_id": "version-other"],
            ["draft_hash_version": "unknown-v2"],
            ["draft_hash": String(repeating: "0", count: 64)],
        ]

        for overrides in cases {
            let candidate = try response(
                status: "saved",
                replayed: false,
                requestDraft: draft,
                overrides: overrides
            )
            XCTAssertThrowsError(try ScreenplayDraftSaveAcknowledgement.validate(
                candidate,
                projectId: "project-1",
                clientRequestId: "request-1",
                requestedDraft: draft
            ), "Expected rejection for \(overrides)")
        }
    }

    func testServerCanonicalizationAcceptsCRLFButDoesNotEraseLoneCR() throws {
        let requestDraft = "\u{FEFF}INT. LAB\r\nJOHN\r\nHello.\n"
        let exactResponse = try response(
            status: "saved",
            replayed: false,
            requestDraft: requestDraft,
            committedDraft: "INT. LAB\nJOHN\nHello."
        )
        XCTAssertNoThrow(try ScreenplayDraftSaveAcknowledgement.validate(
            exactResponse,
            projectId: "project-1",
            clientRequestId: "request-1",
            requestedDraft: requestDraft
        ))

        let loneCR = try response(
            status: "saved",
            replayed: false,
            requestDraft: "INT. LAB\rJOHN",
            committedDraft: "INT. LAB\nJOHN"
        )
        XCTAssertThrowsError(try ScreenplayDraftSaveAcknowledgement.validate(
            loneCR,
            projectId: "project-1",
            clientRequestId: "request-1",
            requestedDraft: "INT. LAB\rJOHN"
        ))
    }

    private func response(
        status: String,
        replayed: Bool,
        requestDraft: String,
        committedDraft: String? = nil,
        overrides: [String: Any] = [:]
    ) throws -> BackendScreenplayVersionMutationResponse {
        let storedDraft = committedDraft ?? ScreenplayDraftSaveCanonicalization.serverDraft(requestDraft)
        let version: [String: Any] = [
            "id": "version-2",
            "project_id": "project-1",
            "client_request_id": "request-1",
            "draft": storedDraft,
        ]
        var payload: [String: Any] = [
            "stage": "screenplay_version",
            "status": status,
            "project_id": "project-1",
            "client_request_id": "request-1",
            "draft_hash_version": ScreenplayDraftSaveCanonicalization.hashVersion,
            "draft_hash": ScreenplayDraftSaveCanonicalization.serverSHA256(requestDraft),
            "version_id": "version-2",
            "version": version,
            "server_version_id": "version-2",
            "server_version": version,
            "conflict": false,
            "replayed": replayed,
        ]
        overrides.forEach { payload[$0.key] = $0.value }
        let data = try JSONSerialization.data(withJSONObject: payload)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(BackendScreenplayVersionMutationResponse.self, from: data)
    }
}

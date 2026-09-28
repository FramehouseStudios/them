import XCTest
@testable import them

final class ScreenplayProjectsListCacheTests: XCTestCase {
    private func response(_ stateVersion: String) throws -> BackendScreenplayProjectsResponse {
        let json = #"{"state_version":"\#(stateVersion)","screenplay_projects":[]}"#
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(BackendScreenplayProjectsResponse.self, from: Data(json.utf8))
    }

    func testOnlyTheLightweightPollIsConditional() {
        XCTAssertTrue(ScreenplayProjectsListCache.isEligible(includeVersions: false, includeDrafts: false))
        XCTAssertFalse(ScreenplayProjectsListCache.isEligible(includeVersions: true, includeDrafts: false))
        XCTAssertFalse(ScreenplayProjectsListCache.isEligible(includeVersions: false, includeDrafts: true))
    }

    func testEntriesBelongToOneAccountAndOneLimit() throws {
        var cache = ScreenplayProjectsListCache()
        cache.store(owner: "user-a", limit: 24, etag: #"W/"abc""#, payload: try response("abc"))
        XCTAssertEqual(cache.etag(owner: "user-a", limit: 24), #"W/"abc""#)
        XCTAssertEqual(cache.payload(owner: "user-a", limit: 24)?.stateVersion, "abc")
        XCTAssertNil(cache.etag(owner: "user-b", limit: 24), "another account never sends this ETag")
        XCTAssertNil(cache.payload(owner: "user-b", limit: 24))
        XCTAssertNil(cache.etag(owner: "user-a", limit: 12))
        XCTAssertNil(cache.etag(owner: "", limit: 24), "no account, no cache")
    }

    func testAResponseWithoutAnETagClearsTheEntry() throws {
        var cache = ScreenplayProjectsListCache()
        cache.store(owner: "user-a", limit: 24, etag: #"W/"abc""#, payload: try response("abc"))
        cache.store(owner: "user-a", limit: 24, etag: "", payload: try response("def"))
        XCTAssertNil(cache.etag(owner: "user-a", limit: 24))
    }
}

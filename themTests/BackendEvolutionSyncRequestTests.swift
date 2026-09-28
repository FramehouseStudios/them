import Foundation
import XCTest
@testable import them

final class BackendEvolutionSyncRequestTests: XCTestCase {
    func testEvolutionSyncCarriesTheSignedInWritersBearerToken() async throws {
        let api = BackendMemoryAPI(
            baseURL: URL(string: "https://evolution-sync.test")!,
            requestIdentityProvider: { _ in
                BackendAuthRequestIdentity(sessionEpoch: 1, userID: "user-evo", clientToken: "client-evo", accessToken: "access-evo")
            }
        )

        let request = await api.makeEvolutionSyncRequest()

        XCTAssertEqual(request.httpMethod, "PATCH")
        XCTAssertEqual(request.url?.path, "/session/evolution")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-evo")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Client-Token"), "client-evo")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
    }

    func testSignedOutEvolutionSyncSendsNoBearer() async throws {
        let api = BackendMemoryAPI(
            baseURL: URL(string: "https://evolution-sync.test")!,
            requestIdentityProvider: { _ in
                BackendAuthRequestIdentity(sessionEpoch: 1, userID: "", clientToken: "client-evo", accessToken: "")
            }
        )

        let request = await api.makeEvolutionSyncRequest()

        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
    }
}

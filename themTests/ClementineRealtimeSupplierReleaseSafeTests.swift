import XCTest
@testable import them

final class ClementineRealtimeSupplierReleaseSafeTests: XCTestCase {
    func testStubFallsBackToServerDefault() {
        XCTAssertEqual(ClementineRealtimeSupplierMode.releaseSafe(rawValue: "stub"), .serverDefault)
    }

    func testRealSuppliersAreKept() {
        XCTAssertEqual(ClementineRealtimeSupplierMode.releaseSafe(rawValue: "openai"), .openAI)
        XCTAssertEqual(ClementineRealtimeSupplierMode.releaseSafe(rawValue: "server_default"), .serverDefault)
        XCTAssertEqual(ClementineRealtimeSupplierMode.releaseSafe(rawValue: "unknown"), .serverDefault)
    }
}

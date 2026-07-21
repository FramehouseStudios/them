import XCTest
@testable import them

final class IOThemRuntimeTests: XCTestCase {
    func testExplicitXCTestEnvironmentIdentifiesTestProcess() {
        XCTAssertTrue(IOThemRuntime.isTestProcessEnvironment([
            "XCTestConfigurationFilePath": "/tmp/them-tests.xctestconfiguration",
        ]))
        XCTAssertTrue(IOThemRuntime.isTestProcessEnvironment([
            "XCTestBundlePath": "/tmp/themTests.xctest",
        ]))
    }

    func testOrdinaryDebugAppEnvironmentIsNotMistakenForTestProcess() {
        XCTAssertFalse(IOThemRuntime.isTestProcessEnvironment([
            "HOME": "/Users/writer",
            "XCODE_RUNNING_FOR_PREVIEWS": "0",
        ]))
    }
}

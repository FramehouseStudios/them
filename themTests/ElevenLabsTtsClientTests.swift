import XCTest
@testable import them

final class ElevenLabsTtsClientTests: XCTestCase {
    func testSpeakRequestEncodingDoesNotPutKeyInURLOrBody() throws {
        let request = try ElevenLabsTtsClient.makeSpeakRequest(
            text: "  Hello\nworld  ",
            voiceId: "abcdefghijkl",
            apiKey: "user-secret-key-SHOULD-NOT-LEAK",
            modelId: "eleven_flash_v2_5"
        )
        XCTAssertEqual(request.httpMethod, "POST")
        let url = try XCTUnwrap(request.url?.absoluteString)
        XCTAssertTrue(url.contains("/v1/text-to-speech/abcdefghijkl/stream"))
        XCTAssertFalse(url.contains("user-secret-key"))
        XCTAssertEqual(request.value(forHTTPHeaderField: "xi-api-key"), "user-secret-key-SHOULD-NOT-LEAK")

        let body = try XCTUnwrap(request.httpBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(json["text"] as? String, "Hello world")
        XCTAssertEqual(json["model_id"] as? String, "eleven_flash_v2_5")
        let bodyText = String(data: body, encoding: .utf8) ?? ""
        XCTAssertFalse(bodyText.contains("user-secret-key"))
        XCTAssertFalse(bodyText.contains("xi-api-key"))
    }

    func testListVoicesRequestEncodingKeepsKeyInHeaderOnly() throws {
        let request = try ElevenLabsTtsClient.makeListVoicesRequest(apiKey: "user-secret-key-SHOULD-NOT-LEAK")
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(request.url, ElevenLabsTtsClient.voicesURL)
        XCTAssertEqual(request.value(forHTTPHeaderField: "xi-api-key"), "user-secret-key-SHOULD-NOT-LEAK")
        let described = ElevenLabsTtsClient.redactedRequestDescription(request)
        XCTAssertFalse(described.contains("user-secret-key"))
        XCTAssertTrue(described.contains("[redacted]"))
    }

    func testRedactSecretsRemovesKeysFromLogText() {
        let raw = "xi-api-key: user-secret-key-SHOULD-NOT-LEAK sk_live_abcdefghijklmnop"
        let redacted = ElevenLabsTtsClient.redactSecrets(raw)
        XCTAssertFalse(redacted.contains("user-secret-key-SHOULD-NOT-LEAK"))
        XCTAssertFalse(redacted.contains("sk_live_abcdefghijklmnop"))
        XCTAssertTrue(redacted.contains("[redacted]"))
    }

    func testRedactSecretsRemovesWholeKeysWithEmbeddedSeparators() {
        let keys = [
            "sk_abcdefghijklmnop",
            "sk_live_abcdefghijklmnop",
            "sk_test_abcdefgh-ijklmnop",
        ]
        for key in keys {
            XCTAssertEqual(
                ElevenLabsTtsClient.redactSecrets("provider rejected [\(key)]."),
                "provider rejected [xi-api-key=[redacted]]."
            )
        }
        XCTAssertEqual(ElevenLabsTtsClient.redactSecrets("No voices found."), "No voices found.")
    }

    func testProviderErrorDetailsRedactKeysForListAndSpeak() async throws {
        let key = "sk_live_abcdefghijklmnop"
        let client = ElevenLabsTtsClient(dependencies: .init(dataForRequest: { request in
            let body = Data("Provider rejected \(key)".utf8)
            let response = HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!
            return (body, response)
        }))

        for operation in ["list", "speak"] {
            do {
                if operation == "list" {
                    _ = try await client.listVoices(apiKey: key)
                } else {
                    _ = try await client.speak(text: "Hello", voiceId: "abcdefghijkl", apiKey: key)
                }
                XCTFail("expected provider error")
            } catch let ElevenLabsTtsClient.ClientError.http(status, detail) {
                XCTAssertEqual(status, 401)
                XCTAssertFalse(detail.contains(key))
                XCTAssertTrue(detail.contains("[redacted]"))
            }
        }
    }

    func testAbortCancelsInFlightSpeak() async throws {
        let started = expectation(description: "fetch started")
        let client = ElevenLabsTtsClient(
            dependencies: .init(
                dataForRequest: { _ in
                    started.fulfill()
                    try await Task.sleep(nanoseconds: 2_000_000_000)
                    return (Data(), URLResponse())
                }
            )
        )

        let speakTask = Task {
            try await client.speak(
                text: "hello",
                voiceId: "abcdefghijkl",
                apiKey: "user-secret-key"
            )
        }

        await fulfillment(of: [started], timeout: 1.0)
        client.abort()
        speakTask.cancel()

        do {
            _ = try await speakTask.value
            XCTFail("expected abort")
        } catch is CancellationError {
            // acceptable
        } catch let error as ElevenLabsTtsClient.ClientError {
            XCTAssertEqual(error, .aborted)
        } catch {
            // URLError cancelled also OK
            let ns = error as NSError
            XCTAssertTrue(ns.domain == NSURLErrorDomain || error is CancellationError)
        }
    }

    func testTalkByokHeadersEmptyForDefaultProvider() {
        let previous = CompanionTtsProviderSettings.provider()
        defer { CompanionTtsProviderSettings.setProvider(previous) }
        CompanionTtsProviderSettings.setProvider(.default)
        let headers = CompanionTtsProviderSettings.talkByokHeaders()
        XCTAssertTrue(headers.isEmpty)
    }

    func testProviderEnumRoundTrip() {
        XCTAssertEqual(CompanionTtsProvider(rawValue: "default"), .default)
        XCTAssertEqual(CompanionTtsProvider(rawValue: "elevenlabs"), .elevenlabs)
        XCTAssertNil(CompanionTtsProvider(rawValue: "openai"))
    }
}

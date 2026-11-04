import Foundation

let base = CommandLine.arguments[1]
Task {
    do {
        for transport in ["data", "bytes"] {
            for kind in ["cross", "same"] {
                for code in [302, 307] {
                    var request = URLRequest(url: URL(string: "\(base)/\(transport)/\(kind)/\(code)")!)
                    request.timeoutInterval = 8
                    request.httpShouldHandleCookies = false
                    request.httpMethod = code == 307 ? "POST" : "GET"
                    request.setValue("Bearer dummy", forHTTPHeaderField: "Authorization")
                    request.setValue("dummy-app", forHTTPHeaderField: "X-APP-TOKEN")
                    request.setValue("dummy-client", forHTTPHeaderField: "X-Client-Token")
                    request.setValue("dummy-byok", forHTTPHeaderField: "xi-api-key")
                    if code == 307 { request.httpBody = Data("synthetic-only".utf8) }
                    let response: URLResponse
                    if transport == "bytes" {
                        let (bytes, received) = try await URLSession.shared.bytes(for: request, delegate: BackendHTTPRedirectGuard.shared)
                        for try await _ in bytes {}
                        response = received
                    } else {
                        (_, response) = try await URLSession.shared.data(for: request, delegate: BackendHTTPRedirectGuard.shared)
                    }
                    let actual = (response as? HTTPURLResponse)?.statusCode ?? 0
                    let expected = kind == "cross" ? code : 200
                    guard actual == expected else { exit(2) }
                    print("\(transport) \(kind) \(code) -> \(actual)")
                }
            }
        }
        exit(0)
    } catch { print("probe_error=\(type(of: error))"); exit(1) }
}
dispatchMain()

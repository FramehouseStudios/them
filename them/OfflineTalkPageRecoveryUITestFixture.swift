#if DEBUG
import Foundation

/// Only the task-owned loopback UI runner may enqueue this synthetic recording.
/// The HTTP replay, response retention, metadata and save paths remain real.
@MainActor
enum OfflineTalkPageRecoveryUITestFixture {
    static func install(projectID: String) async {
        let args = ProcessInfo.processInfo.arguments
        let url = BackendAuthClient.resolvedBackendBaseURL()
        guard IOThemRuntime.isRunningUITests, args.contains("--ui-talk-page-recovery-fixture"),
              !projectID.isEmpty, url.scheme == "http", url.host == "127.0.0.1" else { return }
        let marker = "ui-talk-page-recovery-installed-\(projectID)"
        guard !UserDefaults.standard.bool(forKey: marker) else { return }
        UserDefaults.standard.set(true, forKey: marker)
        do {
            let api = BackendClient()
            try await api.prewarmTalkSession()
            let owner = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false)
            let boundary = "THEM-queued-page-proof"
            var body = Data()
            for (name, value) in [("screenplay_project_id", projectID), ("screenplay_target", "page"),
                ("screenplay_prompt_source", "voice"),
                ("screenplay_generation_transcript", "Write a story about two astronauts who discover the observatory sky is a painted set. Put HOME VOICE HANDOFF on the panel.")] {
                body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".utf8))
            }
            body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"recording.wav\"\r\nContent-Type: audio/wav\r\n\r\n".utf8))
            // 320 ms, mono 16 kHz/16-bit PCM silence: ASR is intercepted by the runner.
            body.append(Data([82,73,70,70,36,40,0,0,87,65,86,69,102,109,116,32,16,0,0,0,1,0,1,0,128,62,0,0,0,125,0,0,2,0,16,0,100,97,116,97,0,40,0,0]))
            body.append(Data(repeating: 0, count: 10_240))
            body.append(Data("\r\n--\(boundary)--\r\n".utf8))
            var request = URLRequest(url: url.appendingPathComponent("talk"))
            request.httpMethod = "POST"; request.timeoutInterval = 60
            request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            request.setValue(owner.userID, forHTTPHeaderField: "X-User-Id")
            request.setValue("them-dev", forHTTPHeaderField: "X-APP-TOKEN")
            request.setValue("ui-recovered-page-\(projectID)", forHTTPHeaderField: "X-Idempotency-Key")
            _ = try await OfflineTalkOutbox.shared.enqueue(request: request, body: body, reason: "UI queued-page proof")
            _ = await OfflineTalkOutbox.shared.drainDue(now: .distantFuture, initiatingIdentity: owner, backendURL: url)
        } catch {
            // Leave any queued bytes intact. The UI proof must fail visibly,
            // never substitute an injected success or generate a second turn.
            UserDefaults.standard.set("Queued-page fixture failed: \(error.localizedDescription)", forKey: "ui-talk-page-recovery-error")
        }
    }
}
#endif

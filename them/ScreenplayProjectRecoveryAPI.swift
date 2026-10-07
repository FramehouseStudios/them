import Foundation

nonisolated struct BackendScreenplayRecoveryMutationResponse: Decodable {
    let stage: String?
    let status: String?
    let projectId: String?
    let recoveryId: String?
    let recovery: BackendScreenplayVersion?
    let activeVersionId: String?
}

extension BackendMemoryAPI {
    func preserveScreenplayProjectRecovery(
        projectId: String,
        draft: String,
        clientRequestId: String,
        phase: String = "scene_draft",
        includeUserIdentity: Bool = true,
        includeAuthToken: Bool = true,
        clientTokenOverride: String? = nil
    ) async throws -> BackendScreenplayRecoveryMutationResponse {
        _ = try? await bootstrapSession(force: false)
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let requestID = clientRequestId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !project.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "project_id_required")
        }
        guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "draft_required")
        }
        guard !requestID.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "client_request_id_required")
        }
        let body = try JSONSerialization.data(withJSONObject: [
            "draft": draft,
            "phase": phase,
            "client_request_id": String(requestID.prefix(96)),
        ])

        var data = Data()
        var http: HTTPURLResponse?
        var didAttemptAuthRefresh = false
        while true {
            var request = try makeWriteRequest(path: "/screenplay/projects/\(project)/recovery")
            applyProjectOwnerHeaders(
                to: &request,
                includeUserIdentity: includeUserIdentity,
                includeAuthToken: includeAuthToken,
                clientTokenOverride: clientTokenOverride
            )
            request.httpBody = body
            let responsePair = try await session.data(for: request)
            guard let response = responsePair.1 as? HTTPURLResponse else {
                throw BackendMemoryAPIError.invalidResponse
            }
            data = responsePair.0
            http = response
            guard response.statusCode == 401,
                  includeAuthToken,
                  !didAttemptAuthRefresh else { break }
            didAttemptAuthRefresh = true
            do {
                if try await BackendAuthClient.refreshAuthSession(force: true).isAuthenticated { continue }
            } catch {
                // Keep the original unauthorized response when refresh cannot repair it.
            }
            break
        }
        guard let http else { throw BackendMemoryAPIError.invalidResponse }
        guard (200...299).contains(http.statusCode) else {
            throw BackendMemoryAPIError.server(
                status: http.statusCode,
                message: decodeErrorMessage(from: data)
            )
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let result = try decoder.decode(BackendScreenplayRecoveryMutationResponse.self, from: data)
        guard let recovery = result.recovery,
              recovery.source == "studio_live_sync_recovery",
              recovery.draft == draft,
              !(result.recoveryId ?? "").isEmpty else {
            throw BackendMemoryAPIError.invalidResponse
        }
        return result
    }

    func deleteScreenplayProjectRecovery(
        projectId: String,
        recoveryId: String,
        includeUserIdentity: Bool = true,
        includeAuthToken: Bool = true,
        clientTokenOverride: String? = nil
    ) async throws {
        _ = try? await bootstrapSession(force: false)
        let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let recovery = recoveryId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !project.isEmpty, !recovery.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "recovery_id_required")
        }
        var didAttemptAuthRefresh = false
        while true {
            var request = try makeWriteRequest(path: "/screenplay/projects/\(project)/recovery/\(recovery)")
            request.httpMethod = "DELETE"
            applyProjectOwnerHeaders(
                to: &request,
                includeUserIdentity: includeUserIdentity,
                includeAuthToken: includeAuthToken,
                clientTokenOverride: clientTokenOverride
            )
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw BackendMemoryAPIError.invalidResponse
            }
            guard http.statusCode == 401,
                  includeAuthToken,
                  !didAttemptAuthRefresh else {
                guard (200...299).contains(http.statusCode) else {
                    throw BackendMemoryAPIError.server(
                        status: http.statusCode,
                        message: decodeErrorMessage(from: data)
                    )
                }
                return
            }
            didAttemptAuthRefresh = true
            do {
                if try await BackendAuthClient.refreshAuthSession(force: true).isAuthenticated { continue }
            } catch {
                // Preserve the original unauthorized response.
            }
            throw BackendMemoryAPIError.server(
                status: http.statusCode,
                message: decodeErrorMessage(from: data)
            )
        }
    }
}

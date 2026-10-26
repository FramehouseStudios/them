import Foundation

// Project writes share the canonical auth/bootstrap, HTTP and sync-result helpers.
extension BackendMemoryAPI {
    func upsertScreenplayProject(
        projectId: String? = nil,
        title: String,
        phase: String = "scene_draft",
        tags: [String] = [],
        characters: [String] = [],
        setting: String = "",
        tone: String = "",
        logline: String? = nil,
        themeArgument: String? = nil,
        centralQuestion: String? = nil,
        protagonistWant: String? = nil,
        protagonistNeed: String? = nil,
        antagonisticForce: String? = nil,
        actPosition: String? = nil,
        endingImage: String? = nil,
        unresolvedSetups: [String]? = nil,
        studioThreadViewState: BackendScreenplayThreadViewState? = nil,
        studioDiffAcknowledgedKeys: [String]? = nil,
        studioDiffAcknowledgedEntries: [BackendScreenplayDiffAcknowledgementEntry]? = nil,
        studioAskNoteHistory: [BackendScreenplayStudioExchange]? = nil,
        initialDraft: ScreenplayDraftSaveOutboxEntry? = nil,
        initiatingIdentity owner: BackendAuthRequestIdentity = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: true)
    ) async throws -> BackendReadResult<BackendScreenplayProjectMutationResponse> {
        let identity = try await screenplayRequestIdentity(owner)
        var request = try makeWriteRequest(path: initialDraft == nil ? "/screenplay/projects" : "/screenplay/projects/initialize", identity: identity)
        var payload: [String: Any] = [
            "title": title,
            "phase": phase,
            "tags": tags,
            "characters": characters,
            "setting": setting,
            "tone": tone,
            "activate": true,
        ]
        if let logline {
            payload["logline"] = logline
        }
        if let themeArgument {
            payload["theme_argument"] = themeArgument
        }
        if let centralQuestion {
            payload["central_question"] = centralQuestion
        }
        if let protagonistWant {
            payload["protagonist_want"] = protagonistWant
        }
        if let protagonistNeed {
            payload["protagonist_need"] = protagonistNeed
        }
        if let antagonisticForce {
            payload["antagonistic_force"] = antagonisticForce
        }
        if let actPosition {
            payload["act_position"] = actPosition
        }
        if let endingImage {
            payload["ending_image"] = endingImage
        }
        if let unresolvedSetups {
            payload["unresolved_setups"] = unresolvedSetups
        }
        if let projectId, !projectId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["project_id"] = projectId
        }
        if let studioThreadViewState,
           let encoded = try? JSONEncoder().encode(studioThreadViewState),
           let statePayload = try? JSONSerialization.jsonObject(with: encoded) {
            payload["studio_thread_view_state"] = statePayload
        }
        if let studioDiffAcknowledgedKeys {
            payload["studio_diff_acknowledged_keys"] = studioDiffAcknowledgedKeys
        }
        if let studioDiffAcknowledgedEntries,
           let encoded = try? JSONEncoder().encode(studioDiffAcknowledgedEntries),
           let entriesPayload = try? JSONSerialization.jsonObject(with: encoded) {
            payload["studio_diff_acknowledged_entries"] = entriesPayload
        }
        if let studioAskNoteHistory,
           let encoded = try? JSONEncoder().encode(studioAskNoteHistory),
           let historyPayload = try? JSONSerialization.jsonObject(with: encoded) {
            payload["studio_ask_note_history"] = historyPayload
        }
        if let initialDraft {
            guard let metadata = initialDraft.initialization, projectId == initialDraft.projectId,
                  title == initialDraft.title, phase == initialDraft.phase,
                  !initialDraft.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                throw BackendMemoryAPIError.invalidResponse
            }
            try metadata.validate(owner: identity, entry: initialDraft, requestURL: request.url)
            payload = ["project_id": initialDraft.projectId, "title": initialDraft.title, "phase": initialDraft.phase,
                "initial_draft": ["draft": initialDraft.draft, "client_request_id": initialDraft.id,
                                  "source": initialDraft.source, "notes": initialDraft.notes]]
            request.setValue(initialDraft.id, forHTTPHeaderField: "X-Idempotency-Key")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        let (data, http) = try await screenplayHTTPResponse(for: request, owner: owner)
        if let initialDraft, let metadata = initialDraft.initialization {
            try metadata.validate(owner: identity, entry: initialDraft, requestURL: baseURL())
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        return try screenplayReadResult(BackendScreenplayProjectMutationResponse.self, data: data, response: http,
                                        owner: owner)
    }
}

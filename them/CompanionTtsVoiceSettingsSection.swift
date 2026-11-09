import SwiftUI
import ScreenplayStudio

/// D010 — Voice settings hooks for ElevenLabs BYOK (Keychain key + voice picker).
/// Kept out of RootExperienceView / god-file networking (D009).
struct CompanionTtsVoiceSettingsSection: View {
    @AppStorage(CompanionTtsProviderSettings.providerStorageKey)
    private var providerRaw: String = CompanionTtsProvider.default.rawValue

    @AppStorage(CompanionTtsProviderSettings.voiceIdStorageKey)
    private var selectedVoiceId: String = ""

    @AppStorage(CompanionTtsProviderSettings.voiceNameStorageKey)
    private var selectedVoiceName: String = ""

    @State private var apiKeyDraft: String = ""
    @State private var isKeySaved: Bool = ElevenLabsByokKeychain.hasApiKey()
    @State private var voices: [ElevenLabsTtsClient.Voice] = []
    @State private var statusMessage: String = ""
    @State private var isLoadingVoices: Bool = false
    @State private var showKeyField: Bool = false

    private var provider: CompanionTtsProvider {
        CompanionTtsProvider(rawValue: providerRaw) ?? .default
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Companion voice provider")
                .font(IOThemTypography.UI.calloutStrong)
                .foregroundStyle(.white.opacity(0.86))

            Picker("Provider", selection: $providerRaw) {
                ForEach(CompanionTtsProvider.allCases) { option in
                    Text(option.displayName).tag(option.rawValue)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("voice.tts.provider.picker")

            Text(
                provider == .elevenlabs
                    ? "Audio is synthesized with your ElevenLabs account (BYOK). io.them does not store your key on the server."
                    : "Uses the built-in companion voice path. Platform TTS may use OpenAI or platform ElevenLabs on the server."
            )
            .font(IOThemTypography.UI.labelRegular)
            .foregroundStyle(.white.opacity(0.46))

            if provider == .elevenlabs {
                elevenLabsControls
            }
        }
        .onAppear {
            isKeySaved = ElevenLabsByokKeychain.hasApiKey()
        }
    }

    @ViewBuilder
    private var elevenLabsControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: isKeySaved ? "checkmark.seal.fill" : "key.fill")
                    .foregroundStyle(isKeySaved ? Color.green.opacity(0.85) : .white.opacity(0.45))
                Text(isKeySaved ? "API key saved in Keychain" : "Connect your ElevenLabs API key")
                    .font(IOThemTypography.UI.captionMedium)
                    .foregroundStyle(.white.opacity(0.78))
                Spacer()
                Button(isKeySaved ? "Replace" : "Connect") {
                    showKeyField = true
                    apiKeyDraft = ""
                }
                .buttonStyle(.bordered)
                .tint(.white.opacity(0.22))
                .foregroundColor(.white.opacity(0.9))
                .accessibilityIdentifier("voice.tts.elevenlabs.connect")

                if isKeySaved {
                    Button("Disconnect") {
                        _ = ElevenLabsByokKeychain.deleteApiKey()
                        isKeySaved = false
                        voices = []
                        statusMessage = "Disconnected ElevenLabs key from Keychain."
                    }
                    .buttonStyle(.bordered)
                    .tint(.white.opacity(0.12))
                    .foregroundColor(.white.opacity(0.7))
                    .accessibilityIdentifier("voice.tts.elevenlabs.disconnect")
                }
            }

            if showKeyField {
                SecureField("xi-api-key", text: $apiKeyDraft)
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("voice.tts.elevenlabs.key")

                HStack {
                    Button("Save to Keychain") {
                        let ok = ElevenLabsByokKeychain.saveApiKey(apiKeyDraft)
                        isKeySaved = ok && ElevenLabsByokKeychain.hasApiKey()
                        showKeyField = !isKeySaved
                        apiKeyDraft = ""
                        statusMessage = ok
                            ? "Key saved on-device. Listing voices…"
                            : "Keychain could not save the ElevenLabs key."
                        if ok {
                            Task { await refreshVoices() }
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.white.opacity(0.28))
                    .disabled(apiKeyDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                    Button("Cancel") {
                        showKeyField = false
                        apiKeyDraft = ""
                    }
                    .buttonStyle(.bordered)
                    .tint(.white.opacity(0.12))
                }
            }

            if isKeySaved {
                HStack {
                    Button {
                        Task { await refreshVoices() }
                    } label: {
                        Label(
                            isLoadingVoices ? "Loading voices…" : "Refresh voices",
                            systemImage: "arrow.clockwise"
                        )
                    }
                    .disabled(isLoadingVoices)
                    .buttonStyle(.bordered)
                    .tint(.white.opacity(0.18))
                    .accessibilityIdentifier("voice.tts.elevenlabs.refresh")

                    if !selectedVoiceId.isEmpty {
                        Text(
                            selectedVoiceName.isEmpty
                                ? "Selected: \(selectedVoiceId)"
                                : "Selected: \(selectedVoiceName)"
                        )
                        .font(IOThemTypography.UI.labelRegular)
                        .foregroundStyle(.white.opacity(0.55))
                        .lineLimit(1)
                    }
                }

                if !voices.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(voices.prefix(40)) { voice in
                            Button {
                                selectedVoiceId = voice.voiceId
                                selectedVoiceName = voice.name
                                CompanionTtsProviderSettings.setSelectedVoiceId(voice.voiceId)
                                CompanionTtsProviderSettings.setSelectedVoiceName(voice.name)
                                statusMessage = "Using voice \(voice.name)."
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(voice.name.isEmpty ? voice.voiceId : voice.name)
                                            .font(IOThemTypography.UI.captionMedium)
                                            .foregroundStyle(.white.opacity(0.88))
                                        Text(voice.category.isEmpty ? voice.voiceId : "\(voice.category) · \(voice.voiceId)")
                                            .font(IOThemTypography.UI.microRegular)
                                            .foregroundStyle(.white.opacity(0.42))
                                    }
                                    Spacer()
                                    if selectedVoiceId == voice.voiceId {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundStyle(Color.green.opacity(0.85))
                                    }
                                }
                                .padding(.vertical, 6)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.top, 4)
                }
            }

            if !statusMessage.isEmpty {
                Text(statusMessage)
                    .font(IOThemTypography.UI.labelRegular)
                    .foregroundStyle(.white.opacity(0.5))
                    .accessibilityIdentifier("voice.tts.elevenlabs.status")
            }
        }
    }

    @MainActor
    private func refreshVoices() async {
        isLoadingVoices = true
        defer { isLoadingVoices = false }
        do {
            let listed = try await CompanionTtsRouter.shared.listVoices()
            voices = listed
            statusMessage = listed.isEmpty
                ? "No voices returned for this key."
                : "Loaded \(listed.count) voices from your ElevenLabs library."
        } catch {
            statusMessage = ElevenLabsTtsClient.redactSecrets(error.localizedDescription)
        }
    }
}

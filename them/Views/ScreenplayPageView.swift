import SwiftUI
import ScreenplayStudio

struct ScreenplayPageView: View {
    @ObservedObject var orchestrator: VoiceToPageOrchestrator

    var body: some View {
        ZStack {
            IOThemColors.Screenplay.pageBackground
                .ignoresSafeArea()

            ScrollViewReader { proxy in
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        // Partial user transcript while speaking
                        if !orchestrator.partialTranscript.isEmpty && orchestrator.isListening {
                            userTranscriptBanner
                        }

                        // The screenplay page
                        if !orchestrator.fountainDraft.isEmpty {
                            FountainRevealView(
                                formattedText: orchestrator.fountainDraft,
                                revealedWordCount: currentRevealCount,
                                isStreaming: orchestrator.isSpeaking
                            )
                        }

                        // Processing indicator
                        if orchestrator.isProcessing {
                            processingIndicator
                        }

                        // Listening indicator
                        if orchestrator.isListening && orchestrator.partialTranscript.isEmpty && orchestrator.fountainDraft.isEmpty {
                            listeningPrompt
                        }

                        Spacer(minLength: 200)
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 40)
                }
                .onChange(of: currentLineIndex) { _, newLine in
                    withAnimation(.easeOut(duration: 0.25)) {
                        proxy.scrollTo(newLine, anchor: .center)
                    }
                }
            }

            // Orb indicator overlay (bottom)
            VStack {
                Spacer()
                orbIndicator
                    .padding(.bottom, 20)
            }
        }
        .preferredColorScheme(.dark)
    }

    private var currentRevealCount: Int {
        if orchestrator.useStreamCursor {
            return orchestrator.streamCursor.revealedWordCount
        }
        return orchestrator.syncCursor.revealedWordCount
    }

    private var currentLineIndex: Int {
        if orchestrator.useStreamCursor {
            return orchestrator.streamCursor.currentLineIndex
        }
        return orchestrator.syncCursor.currentLineIndex
    }

    private var userTranscriptBanner: some View {
        HStack {
            Circle()
                .fill(Color.red.opacity(0.8))
                .frame(width: 6, height: 6)
            Text(orchestrator.partialTranscript)
                .font(IOThemTypography.UI.monoCaption)
                .foregroundColor(IOThemColors.Screenplay.text.opacity(0.5))
                .lineLimit(2)
            Spacer()
        }
        .padding(.bottom, 16)
        .transition(.opacity)
    }

    private var processingIndicator: some View {
        HStack(spacing: 8) {
            ProgressView()
                .scaleEffect(0.6)
                .tint(IOThemColors.Screenplay.cursor)
            Text("io.them is writing...")
                .font(IOThemTypography.UI.monoLabel)
                .foregroundColor(IOThemColors.Screenplay.text.opacity(0.4))
        }
        .padding(.top, 24)
    }

    private var listeningPrompt: some View {
        VStack(spacing: 12) {
            Spacer().frame(height: 120)
            Text("Start talking.")
                .font(IOThemTypography.UI.monoPrompt)
                .foregroundColor(IOThemColors.Screenplay.text.opacity(0.3))
            Text("io.them is listening.")
                .font(IOThemTypography.UI.monoCaptionLight)
                .foregroundColor(IOThemColors.Screenplay.text.opacity(0.2))
        }
        .frame(maxWidth: .infinity)
    }

    private var orbIndicator: some View {
        let orbSize: CGFloat = 36
        let level = orchestrator.orbAudio.isSpeaking
            ? orchestrator.orbAudio.level
            : orchestrator.orbAudio.userLevel

        return Circle()
            .fill(orbColor.opacity(0.6 + Double(level) * 0.4))
            .frame(width: orbSize + level * 12, height: orbSize + level * 12)
            .shadow(color: orbColor.opacity(0.3), radius: 8 + level * 8)
            .animation(.easeOut(duration: 0.1), value: level)
    }

    private var orbColor: Color {
        if orchestrator.orbAudio.isSpeaking {
            return IOThemColors.Screenplay.cursor
        }
        if orchestrator.isListening {
            return IOThemColors.Screenplay.text.opacity(0.5)
        }
        return IOThemColors.Screenplay.text.opacity(0.2)
    }
}

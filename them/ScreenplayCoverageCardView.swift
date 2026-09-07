import SwiftUI
import ScreenplayStudio

/// "Clementine's read" at the top of the Craft tab: the grade and verdict,
/// five pillar bars, what works, what's missing, the move, and a button to
/// hear it in her voice.
struct ScreenplayCoverageCardView: View {
    let report: BackendScreenplayCoverageReport?
    let isLoading: Bool
    let errorText: String
    let onRefresh: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: IOThemSpacing.Scale.md) {
            HStack(alignment: .firstTextBaseline) {
                Text("Clementine's read")
                    .font(IOThemTypography.UI.micro)
                    .foregroundStyle(Color.herText.opacity(0.9))
                Spacer(minLength: 0)
                Button(action: onRefresh) {
                    Label(report == nil ? "Read it" : "Read again", systemImage: "arrow.clockwise")
                        .font(IOThemTypography.UI.micro)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(isLoading)
                .accessibilityIdentifier("studio.craft.coverage.refresh")
            }
            if isLoading {
                HStack(spacing: IOThemSpacing.Scale.sm) {
                    ProgressView().controlSize(.small)
                    Text("Reading the pages…")
                        .font(IOThemTypography.UI.microRegular)
                        .foregroundStyle(Color.herText.opacity(0.62))
                }
            } else if !errorText.isEmpty {
                Text(errorText)
                    .font(IOThemTypography.UI.microRegular)
                    .foregroundStyle(Color.herText.opacity(0.7))
            } else if let report {
                reportBody(report)
            } else {
                Text("Import or write pages and she'll grade what you have so far: structure, pacing, dialogue, character, format.")
                    .font(IOThemTypography.UI.microRegular)
                    .foregroundStyle(Color.herText.opacity(0.62))
            }
        }
        .padding(IOThemSpacing.Scale.md)
        .background(
            RoundedRectangle(cornerRadius: IOThemSpacing.Radius.md, style: .continuous)
                .fill(Color.herShellPanelSoft.opacity(0.82))
        )
        .overlay(
            RoundedRectangle(cornerRadius: IOThemSpacing.Radius.md, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.2), lineWidth: 1)
        )
        .accessibilityIdentifier("studio.craft.coverage")
    }

    private func reportBody(_ report: BackendScreenplayCoverageReport) -> some View {
        VStack(alignment: .leading, spacing: IOThemSpacing.Scale.md) {
            HStack(alignment: .firstTextBaseline, spacing: IOThemSpacing.Scale.md) {
                Text(report.grade)
                    .font(IOThemTypography.UI.title)
                    .foregroundStyle(Color.herText)
                    .accessibilityIdentifier("studio.craft.coverage.grade")
                VStack(alignment: .leading, spacing: IOThemSpacing.Scale.xxs) {
                    Text(ScreenplayCoveragePresentation.verdictLine(report))
                        .font(IOThemTypography.UI.captionStrong)
                        .foregroundStyle(Color.herText.opacity(0.9))
                    Text("Overall \(ScreenplayCoveragePresentation.scoreText(report.overall)) of 10")
                        .font(IOThemTypography.UI.microRegular)
                        .foregroundStyle(Color.herText.opacity(0.62))
                }
            }
            VStack(spacing: IOThemSpacing.Scale.xs) {
                ForEach(ScreenplayCoveragePresentation.pillarOrder, id: \.self) { key in
                    if let pillar = report.pillars[key] {
                        pillarRow(key, pillar)
                    }
                }
            }
            if !report.works.isEmpty {
                noteBlock(title: "What works", lines: report.works)
            }
            if !report.missing.isEmpty {
                noteBlock(title: "What's missing", lines: report.missing)
            }
            noteBlock(title: "The move", lines: [report.move])
            Button {
                ScreenplayCoveragePresentation.requestSpeech(report.spoken)
            } label: {
                Label("Hear her read", systemImage: "waveform")
                    .font(IOThemTypography.UI.micro)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
            .accessibilityIdentifier("studio.craft.coverage.speak")
        }
    }

    private func pillarRow(_ key: String, _ pillar: BackendScreenplayCoveragePillar) -> some View {
        HStack(spacing: IOThemSpacing.Scale.sm) {
            Text(ScreenplayCoveragePresentation.title(for: key))
                .font(IOThemTypography.UI.micro)
                .foregroundStyle(Color.herText.opacity(0.78))
                .frame(width: 84, alignment: .leading)
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.herShellStroke.opacity(0.22))
                    Capsule()
                        .fill(Color.herStudioActiveStroke.opacity(0.85))
                        .frame(width: proxy.size.width * ScreenplayCoveragePresentation.fraction(for: pillar.score))
                }
            }
            .frame(height: 8)
            Text(ScreenplayCoveragePresentation.scoreText(pillar.score))
                .font(IOThemTypography.UI.monoMicro)
                .foregroundStyle(Color.herText.opacity(0.78))
                .frame(width: 30, alignment: .trailing)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(ScreenplayCoveragePresentation.title(for: key)) \(ScreenplayCoveragePresentation.scoreText(pillar.score)) of 10")
    }

    private func noteBlock(title: String, lines: [String]) -> some View {
        VStack(alignment: .leading, spacing: IOThemSpacing.Scale.xxs) {
            Text(title.uppercased())
                .font(IOThemTypography.UI.micro)
                .tracking(0.6)
                .foregroundStyle(Color.herText.opacity(0.5))
            ForEach(lines, id: \.self) { line in
                Text(line)
                    .font(IOThemTypography.UI.labelRegular)
                    .foregroundStyle(Color.herText.opacity(0.88))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

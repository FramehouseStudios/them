// D009 I4: moved verbatim out of ScreenplayStudioScreen.swift (no behaviour change); raw fonts predate the design-system guard, see its allowlist.
import SwiftUI
import ScreenplayStudio

extension ScreenplayStudioScreen {
    func studioActionPreviewDiffRowView(_ row: StudioActionPreviewDiffRow) -> some View {
        let tint: Color
        switch row.kind {
        case .unchanged:
            tint = Color.white.opacity(0.06)
        case .added:
            tint = Color.green.opacity(0.14)
        case .removed:
            tint = Color.orange.opacity(0.14)
        case .changed:
            tint = Color.herStudioActiveFill.opacity(0.14)
        }

        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text({
                    switch row.kind {
                    case .unchanged: return "UNCHANGED"
                    case .added: return "ADDED"
                    case .removed: return "REMOVED"
                    case .changed: return "CHANGED"
                    }
                }())
                .font(.system(size: 9, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.46))
                .textCase(.uppercase)

                Spacer(minLength: 0)

                if let beforeLineNumber = row.beforeLineNumber {
                    Text("B\(beforeLineNumber)")
                        .font(.system(size: 9, weight: .medium, design: .monospaced))
                        .foregroundStyle(Color.herText.opacity(0.42))
                }
                if let afterLineNumber = row.afterLineNumber {
                    Text("A\(afterLineNumber)")
                        .font(.system(size: 9, weight: .medium, design: .monospaced))
                        .foregroundStyle(Color.herText.opacity(0.42))
                }
            }

            switch row.kind {
            case .unchanged:
                Text(row.afterText.isEmpty ? " " : row.afterText)
                    .font(.system(size: 11, weight: .regular, design: .monospaced))
                    .foregroundStyle(Color.herText.opacity(0.60))
                    .fixedSize(horizontal: false, vertical: true)
            case .added:
                Text("+ \(row.afterText)")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(Color.green.opacity(0.90))
                    .fixedSize(horizontal: false, vertical: true)
            case .removed:
                Text("− \(row.beforeText)")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(Color.orange.opacity(0.92))
                    .fixedSize(horizontal: false, vertical: true)
            case .changed:
                Text("− \(row.beforeText)")
                    .font(.system(size: 11, weight: .regular, design: .monospaced))
                    .foregroundStyle(Color.orange.opacity(0.88))
                    .fixedSize(horizontal: false, vertical: true)
                Text("+ \(row.afterText)")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(Color.green.opacity(0.92))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(tint)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
    }
}

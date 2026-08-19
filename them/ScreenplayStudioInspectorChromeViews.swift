import SwiftUI

struct ScreenplayStudioRightPanelTabs: View {
    @Binding var selection: ScreenplayStudioScreen.DirectionOneRightPanelTab
    let textColor: Color
    let secondaryTextColor: Color
    let panelColor: Color
    let panelSoftColor: Color
    let selectionStrokeColor: Color
    let strokeColor: Color

    var body: some View {
        let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 3)

        LazyVGrid(columns: columns, spacing: 8) {
            ForEach(ScreenplayStudioScreen.DirectionOneRightPanelTab.allCases) { tab in
                let isActive = selection == tab
                Button {
                    withAnimation(.easeInOut(duration: 0.16)) {
                        selection = tab
                    }
                } label: {
                    VStack(spacing: 6) {
                        Image(systemName: tab.iconName)
                            .font(.system(size: 12, weight: isActive ? .semibold : .medium, design: .default))

                        Text(tab.title)
                            .font(.system(size: 10.5, weight: isActive ? .semibold : .medium, design: .default))
                            .lineLimit(1)
                            .minimumScaleFactor(0.82)
                            .multilineTextAlignment(.center)
                    }
                    .foregroundStyle(isActive ? textColor.opacity(0.96) : secondaryTextColor)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(isActive ? Color.white.opacity(0.96) : panelColor)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(
                                isActive ? selectionStrokeColor.opacity(0.72) : strokeColor.opacity(0.36),
                                lineWidth: 1
                            )
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(6)
        .background(panelSoftColor)
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(strokeColor.opacity(0.55), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

func directionOneMiniStat(_ label: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
        Text(value)
            .font(.system(size: 17, weight: .semibold, design: .default))
            .foregroundStyle(Color.herText.opacity(0.90))
            .lineLimit(2)
            .minimumScaleFactor(0.74)
            .multilineTextAlignment(.leading)
        Text(label)
            .font(.system(size: 10, weight: .semibold, design: .default))
            .foregroundStyle(Color.herText.opacity(0.42))
            .textCase(.uppercase)
    }
    .frame(maxWidth: .infinity)
    .padding(.horizontal, 12)
    .padding(.vertical, 12)
    .background(
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(Color.white.opacity(0.46))
    )
    .overlay(
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(Color.herShellStroke.opacity(0.14), lineWidth: 1)
    )
}

func inspectorPanelLead(title: String, detail: String) -> some View {
    VStack(alignment: .leading, spacing: 6) {
        Text(title)
            .font(.system(size: 15, weight: .medium, design: .default))
            .foregroundStyle(Color.herText.opacity(0.84))
        Text(detail)
            .font(.system(size: 12, weight: .regular, design: .default))
            .foregroundStyle(Color.herText.opacity(0.64))
            .fixedSize(horizontal: false, vertical: true)
    }
}

func inspectorMessageCard(
    icon: String,
    title: String,
    detail: String,
    chromeText: Color = Color.black.opacity(0.74)
) -> some View {
    HStack(alignment: .top, spacing: 12) {
        Image(systemName: icon)
            .font(.system(size: 16, weight: .semibold, design: .default))
            .foregroundStyle(chromeText.opacity(0.86))
            .frame(width: 38, height: 38)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.white.opacity(0.82))
            )

        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 16, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.92))
            Text(detail)
                .font(.system(size: 12, weight: .regular, design: .default))
                .foregroundStyle(Color.herText.opacity(0.68))
                .fixedSize(horizontal: false, vertical: true)
        }
    }
    .padding(16)
    .background(
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(Color.white.opacity(0.42))
    )
    .overlay(
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .stroke(Color.herShellStroke.opacity(0.20), lineWidth: 1)
    )
}

func intelligenceCollectionCard<Content: View>(
    title: String,
    icon: String,
    @ViewBuilder content: () -> Content
) -> some View {
    VStack(alignment: .leading, spacing: 12) {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.56))
            Text(title)
                .font(.system(size: 12, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.82))
        }

        content()
    }
    .padding(14)
    .background(
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(Color.white.opacity(0.36))
    )
    .overlay(
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .stroke(Color.herShellStroke.opacity(0.18), lineWidth: 1)
    )
}

func inspectorSubsectionLabel(_ title: String) -> some View {
    Text(title)
        .font(.system(size: 12, weight: .semibold, design: .default))
        .foregroundStyle(Color.herText.opacity(0.74))
        .textCase(.uppercase)
}

func sectionCard<Content: View>(
    title: String,
    @ViewBuilder content: () -> Content
) -> some View {
    VStack(alignment: .leading, spacing: 14) {
        Text(title)
            .font(.system(size: 22, weight: .semibold, design: .default))
            .foregroundStyle(Color.herText.opacity(0.90))
        content()
    }
    .padding(18)
    .background(
        RoundedRectangle(cornerRadius: 22, style: .continuous)
            .fill(Color.herShellPanelSoft)
    )
    .overlay(
        RoundedRectangle(cornerRadius: 22, style: .continuous)
            .stroke(Color.herShellStroke.opacity(0.68), lineWidth: 1)
    )
    .shadow(color: Color.herPaperShadow.opacity(0.10), radius: 12, y: 6)
}

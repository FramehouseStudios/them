// Legacy unmounted preview. The canonical editor owns live document text;
// do not mount this as a second document writer or claim it is connected.
import SwiftUI
import ScreenplayStudio

struct LivePaperStreamView: View {
    let pages: [String]
    @State private var typedPage: Int = 0
    @State private var typedText: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(typedText).font(IOThemTypography.UI.monoPrompt).lineLimit(nil)
                .animation(.easeInOut(duration: 0.15), value: typedText)
            HStack {
                Text("\(typedPage+1)/\(pages.count)").font(IOThemTypography.UI.microRegular)
                Spacer()
                Button("Next chunk") { advance() }.font(IOThemTypography.UI.microRegular)
            }
        }
        .onAppear { typedText = pages.first ?? "" }
        .onChange(of: pages) { _, new in typedText = new.first ?? ""; typedPage = 0 }
    }
    private func advance() {
        if typedPage < pages.count - 1 { typedPage += 1; typedText = pages[typedPage] }
    }
}

// LivePaperStreamView — types pages as they arrive (P1 live paper stream, not gated)
import SwiftUI

struct LivePaperStreamView: View {
    let pages: [String]
    @State private var typedPage: Int = 0
    @State private var typedText: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(typedText).font(.system(.body, design: .monospaced)).lineLimit(nil)
                .animation(.easeInOut(duration: 0.15), value: typedText)
            HStack {
                Text("\(typedPage+1)/\(pages.count)").font(.caption2)
                Spacer()
                Button("Next chunk") { advance() }.font(.caption2)
            }
        }
        .onAppear { typedText = pages.first ?? "" }
        .onChange(of: pages) { _, new in typedText = new.first ?? ""; typedPage = 0 }
    }
    private func advance() {
        if typedPage < pages.count - 1 { typedPage += 1; typedText = pages[typedPage] }
    }
}

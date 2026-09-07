// PageCurlView — curl animation for flip-through (P0, not gated)
// Uses dragged page curl effect over page_flip paginated draft.
import SwiftUI

struct PageCurlView: View {
    let pages: [String]
    @State private var current: Int = 0
    @GestureState private var drag: CGFloat = 0

    var body: some View {
        ZStack {
            if pages.isEmpty {
                Text("No pages").foregroundStyle(.secondary)
            } else {
                Text(pages[current])
                    .font(.system(.body, design: .monospaced))
                    .padding(12)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .background(Color.white)
                    .cornerRadius(8)
                    .shadow(radius: 2)
                    .offset(x: drag)
                    .gesture(
                        DragGesture().updating($drag) { v, s, _ in s = v.translation.width }
                            .onEnded { v in
                                if v.translation.width < -60 && current < pages.count-1 { current += 1 }
                                if v.translation.width > 60 && current > 0 { current -= 1 }
                            }
                    )
                HStack {
                    Button("Prev") { if current > 0 { current -= 1 } }.disabled(current==0)
                    Spacer()
                    Text("\(current+1)/\(pages.count)").font(.caption2)
                    Spacer()
                    Button("Next") { if current < pages.count-1 { current += 1 } }.disabled(current==pages.count-1)
                }.padding(.horizontal, 12).padding(.bottom, 6)
                .frame(maxHeight: .infinity, alignment: .bottom)
            }
        }.frame(height: 420)
    }
}

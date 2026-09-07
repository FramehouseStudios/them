// LiveCursorOverlay — shows live collab cursors + commentary inline (P2, not gated)
import SwiftUI

struct LiveCursorOverlay: View {
    let cursor: BackendCollabCursor?
    let commentary: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let cur = cursor {
                Label("p\(cur.page):\(cur.line) \(cur.character ?? "")", systemImage: "cursorarrow")
                    .font(.caption2).foregroundStyle(.blue)
            }
            if let note = commentary, !note.isEmpty {
                Text(note).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
            }
        }.padding(6).background(Color.blue.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
    }
}

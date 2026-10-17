#if os(iOS)
import SwiftUI
import UIKit

/// The system owns destination choice and permission; THEM never sends a file
/// to another app until the writer chooses that action in this sheet.
struct SystemActivityView: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
#endif

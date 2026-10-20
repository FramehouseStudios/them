#if os(iOS)
import UIKit

/// Reveals the native caret through both the editor and its paper viewport.
/// Plain text updates do not follow; existing navigation keeps its own policy.
@MainActor
enum ScreenplayEditorViewport {
    static func followEditingCaret(in textView: UITextView) {
        guard textView.isFirstResponder else { return }
        textView.scrollRangeToVisible(textView.selectedRange)
        revealCaret(in: textView)
    }

    static func focus(_ textView: UITextView) {
        textView.becomeFirstResponder()
        followEditingCaret(in: textView)
    }

    static func jump(to range: NSRange, in textView: UITextView) {
        textView.selectedRange = NSRange(location: range.location, length: 0)
        textView.scrollRangeToVisible(range)
    }

    private static func revealCaret(in textView: UITextView) {
        textView.layoutIfNeeded()
        guard let selection = textView.selectedTextRange else { return }
        let caret = textView.caretRect(for: selection.end)
        guard !caret.isEmpty, !caret.isNull, !caret.isInfinite else { return }
        var ancestor = textView.superview
        while let view = ancestor {
            if let scroll = view as? UIScrollView, scroll.isScrollEnabled {
                let rect = textView.convert(caret, to: scroll)
                // Follow vertically without changing the writer's horizontal position.
                let target = CGRect(x: scroll.bounds.minX, y: rect.minY - 12,
                    width: scroll.bounds.width, height: rect.height + 24)
                scroll.scrollRectToVisible(target, animated: false)
            }
            ancestor = view.superview
        }
    }
}
#endif

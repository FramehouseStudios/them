import Foundation

/// The line the home companion card shows under the mode title.
///
/// `CreativeIntentSnapshot.summary` is guidance written for the model ("Translate
/// the user's intent straight into screenplay pages…"), and the home card used
/// to print it verbatim, so writers read an instruction about "the user". This
/// is the same intent said to the writer, in Clementine's voice.
extension CreativeIntentKind {
    var homeCardLine: String {
        switch self {
        case .screenplayPageWrite:
            return "Ready to put your next beat on the page."
        case .storyDevelopment:
            return "Working out the next story choice with you."
        case .mixedSupport:
            return "Keeping you and the scene in view."
        case .companionSupport:
            return "Here with you. No pressure to write."
        case .practicalSupport:
            return "Short, direct answers."
        case .reflectiveSupport:
            return "Listening first."
        }
    }
}

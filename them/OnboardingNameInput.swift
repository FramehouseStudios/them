import SwiftUI

extension View {
    /// The writer's name field. Autocorrect offered a suggestion bubble over
    /// the scene field below it, so a first tap there landed on the bubble and
    /// the scene was typed into the name (finding #6, re-seen 2026-10-01).
    /// A name is not a misspelling either. No name content type: it raised an
    /// AutoFill callout over the same spot.
    func onboardingNameInput() -> some View {
        #if os(iOS)
        textFieldStyle(.roundedBorder)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.words)
        #else
        textFieldStyle(.roundedBorder)
            .autocorrectionDisabled()
        #endif
    }
}

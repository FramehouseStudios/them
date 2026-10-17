/// Writer text is byte-exact. Swift's canonical String equality must not
/// acknowledge, discard or skip applying a distinct screenplay revision.
public enum ScreenplayDraftTextIdentity {
    public static func matches(_ lhs: String, _ rhs: String) -> Bool {
        lhs.utf8.elementsEqual(rhs.utf8)
    }
}

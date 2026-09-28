import CryptoKit
import Foundation
import Security

nonisolated enum BackendAppleSignInNonceError: LocalizedError {
    case invalidLength
    case randomGenerationFailed(OSStatus)

    var errorDescription: String? {
        switch self {
        case .invalidLength:
            return "Apple sign in could not create a valid security nonce."
        case .randomGenerationFailed:
            return "Apple sign in could not create secure random data."
        }
    }
}

nonisolated enum BackendAppleSignInNonce {
    static func generateRawNonce(byteCount: Int = 32) throws -> String {
        guard byteCount >= 16, byteCount <= 128 else {
            throw BackendAppleSignInNonceError.invalidLength
        }
        var bytes = [UInt8](repeating: 0, count: byteCount)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard status == errSecSuccess else {
            throw BackendAppleSignInNonceError.randomGenerationFailed(status)
        }
        return base64URL(Data(bytes))
    }

    static func sha256Base64URL(_ rawNonce: String) -> String {
        base64URL(Data(SHA256.hash(data: Data(rawNonce.utf8))))
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

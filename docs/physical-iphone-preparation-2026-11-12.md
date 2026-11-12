# Physical iPhone preparation — 2026-11-12

## Verified current blockers

The physical-iPhone build is **not ready**. Three bounded signed Debug build attempts on unchanged `997d0136` failed with exit65 before a usable signed app was produced:

1. Standard project build: development team not selected.
2. Selected the single existing development team for this process only, without printing its identifier or changing project files: no matching iOS development profile for the existing bundle identifier `io.them.them`.
3. Allowed Xcode's existing automatic provisioning path: Xcode reports **No Accounts** and the same missing profile. No sign-in, account creation or credential entry was performed. No signing/provisioning success is claimed. Existing valid identities do not establish a configured Xcode developer account.

Device inventory found one paired iPhone with tunnel unavailable and last connection recorded2026-09-20. A connected/unlocked phone was not observed. The human's latest unlock confirmation enabled the earlier Mac/Simulator Files observation, not a physical-phone claim.

## Endpoint is a separate prerequisite

Tracked iOS Debug configuration sets `BACKEND_URL=http://localhost:3000`; the canonical client normalizes that to loopback. On a physical iPhone, loopback reaches the phone itself, not a backend running on the Mac. This is source configuration, not a claim about an existing phone's saved overrides.

Canonical origin precedence and server fallback remain unchanged. No user-facing backend-origin control was found by the bounded source audit. A safe phone installation must explicitly identify the build's reachable authorized backend and verify its nonsecret resolved origin; do not assume a simulator's localhost connection transfers to hardware.

A separate public unauthenticated check of `https://api.them.io/healthz` returned HTTP302 to a parking site, not app health. No deployment, DNS, auth, provider call or production secret was changed. Production remains held under the human's App Store-credentials decision. A local/development test backend would establish a different boundary and must be named as such, with authentication and network security considered explicitly.

## Exact human clearance and next execution

1. Open **Xcode → Settings → Accounts → + → Apple Account** and personally sign in with the Apple ID holding the Developer membership. Tell Jarvis when that account appears. Do not send credentials in chat; the human's account rule prohibits signing in on their behalf.
2. When the configured reachable backend and build are ready, connect the iPhone by USB, unlock it, and personally accept Trust / Developer Mode prompts if needed. Jarvis can then use the existing development account to provision/build/install without entering credentials.
3. The human signs into THEM and grants microphone/speech permissions. Fresh separate approval is required before the narrow real-model story/rewrite proof. No new paid eval or retry loop is authorized.

No App Store submission, TestFlight, production promotion or purchase-credential bypass is needed for this preparation. No physical install or live screenplay journey occurred. Signed simulator1599/0/0 and essential UI10/0/0 remain their own verified boundaries; they do not substitute for hardware proof.

Private raw build logs remain under `/private/tmp/them-t1423-iphone-*.log`; a status-only failure manifest is archived at `../_proof/T-1423-physical-iphone-preparation-20261112/proof.json`. No signing material or credentials are committed here.

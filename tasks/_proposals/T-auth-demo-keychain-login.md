# T-auth-demo-keychain-login — local demo login and remembered credentials

## User story

A developer can open the Profile screen against the local backend, create or
reuse a clearly identified fake email account, and opt in to restoring its
email and password from Apple Keychain after signing out or relaunching.

## Security boundary

- Sign in with Apple remains unchanged. It accepts only an Apple-issued
  identity token and never accepts the demo email/password.
- The demo account UI is compiled only in `DEBUG` and is available only when
  the configured backend host is loopback (`localhost`, `127.0.0.1`, or
  `::1`). Release and remote backends have no demo button or demo endpoint.
- Demo creation uses the existing `/auth/signup` route; subsequent use goes
  through `/auth/login`. There is no authentication bypass and no privileged
  demo role.
- The fake address uses the reserved `.invalid` domain and cannot be mistaken
  for a deliverable mailbox.
- Remembered credentials are opt-in. The password is stored only as a generic
  password item in Apple Keychain with when-unlocked, this-device-only
  accessibility. It is never written to UserDefaults, logs, task state, or
  backend responses.
- Existing refresh-token session restoration remains the mechanism that keeps
  a signed-in user signed in. Explicit logout, revocation, expiry, or Keychain
  removal still ends the session.

## UI contract

- Email sign-in shows `Remember me` and `Save password in Apple Keychain`.
- Saving a password implies remembering the email. Turning off remembered
  email clears both Keychain values immediately.
- A `Create or Sign In Demo` action shows the fake credentials and attempts a
  normal login, creating the account only when the local backend reports that
  the credentials do not exist.
- Apple login stays visually separate and explains that it uses the user's
  Apple ID rather than the demo password.

## Verification contract

- Pure credential-store tests cover normalize, encode/decode, opt-in writes,
  write failure, and clearing.
- Demo availability tests prove debug + loopback only.
- Focused auth tests and the existing iOS Keychain/session restore tests pass.
- iPhone and dormant macOS scaffold builds pass.
- A local backend smoke proves first-use signup, later login, refresh, logout,
  and login again with the documented demo credentials.

## Risk and review

This is a Tier-3 authentication/UI change. It must be reviewed and must not be
self-merged.

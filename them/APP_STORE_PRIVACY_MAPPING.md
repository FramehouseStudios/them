# App Store Privacy Mapping (io.them)

Last updated: 2026-05-24

## Data Collected (current manifest)
Source: `/Users/halfmutantfilms/Desktop/io.them/them/them/PrivacyInfo.xcprivacy`

1. Audio Data
- Linked to user: Yes
- Used for tracking: No
- Purpose: App Functionality

2. User Content
- Linked to user: Yes
- Used for tracking: No
- Purpose: App Functionality

3. Email Address
- Linked to user: Yes
- Used for tracking: No
- Purpose: App Functionality
- Source: selected Quick Email recipient addresses and manually entered support/contact addresses.

## Required Reason API Usage (current manifest)
1. UserDefaults
- Category: `NSPrivacyAccessedAPICategoryUserDefaults`
- Reason: `CA92.1`

## Operational Data Flow Summary
1. Mic audio is captured for voice turns.
2. Audio/text may be sent to AI providers for STT/chat/TTS to generate responses.
3. Conversation history and memory summaries are stored for continuity.
4. Quick Email can read Contacts only after the user taps Load Contacts; selected recipient email addresses are used to open or prepare an email draft.
5. User can clear history and memories in app data controls.

## AI Provider Disclosure
- OpenAI processes speech, text, realtime voice, visual-context, and writing prompts when those features are used.
- ElevenLabs may process text for speech output when ElevenLabs TTS is configured.
- Provider calls are used for app functionality, not tracking or advertising.

## App Store Connect Alignment Notes
1. Keep Privacy Nutrition Label aligned with the collected data types above unless SDK behavior changes.
2. If you add analytics/crash SDKs later, re-audit and update both manifest and App Store privacy answers.
3. Keep privacy policy text consistent with third-party AI processing and Quick Email contact-info disclosure.

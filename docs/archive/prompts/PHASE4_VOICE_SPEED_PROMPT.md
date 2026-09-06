# Phase 4: Make Clementine Talk and Write the Page Faster and in Sync

## What you have and what's broken

### Current pipeline (turn-based mode)
```
User speaks
  → audio uploaded to backend
  → STT (Whisper): ~800ms
  → GPT full response: ~1200ms  ← waits for the ENTIRE response
  → TTS full audio: ~900ms      ← waits for the ENTIRE audio file
  → audio plays + page reveals in sync
```
**Total user wait: ~3 seconds before they hear or see anything.**

### Current pipeline (streaming mode / `handleRealtimeWithStreaming`)
```
User speaks
  → text streamed from GPT via delta events
  → FountainFormatter runs on every delta (on main thread)
  → StreamingSyncCursor reveals text on wall-clock time
  → NO audio is generated in streaming mode — user only sees text, Clementine doesn't speak
```
**The streaming path has no voice. Clementine types but doesn't speak simultaneously.**

### The real goal
Text appears on the page **word-by-word in sync with Clementine's voice** as she speaks — not after. The experience should feel like watching a live transcription of what she's saying, synced to the audio.

---

## Fix 1: Sentence-level TTS pipelining (biggest latency win, ~2 weeks)

Instead of waiting for GPT to finish the entire response before starting TTS, split the response into sentences as they stream and fire TTS on each sentence immediately.

### Backend changes (`backend/index.js` or `backend/lib/talk_pipeline.js`)

#### Step 1a — Add a sentence-streaming TTS endpoint

Add a new route `POST /talk/stream` that:

1. Receives the user's transcript
2. Calls GPT with `stream: true`
3. As GPT streams tokens, accumulates them until a sentence boundary is detected (`.`, `?`, `!`, `\n\n`, or a Fountain element boundary like after a character cue line)
4. As each sentence completes, immediately fires OpenAI TTS on that sentence in parallel
5. Streams back to the client as a sequence of JSON-delimited chunks, each containing:
   - `type: "text_delta"` — the raw text chunk
   - `type: "audio_chunk"` — a base64-encoded MP3 segment for that sentence
   - `type: "done"` — signals completion

```js
// Sentence boundary detection for Fountain content
function isSentenceBoundary(buffer) {
  const trimmed = buffer.trimEnd();
  // End of dialogue or action line
  if (/[.!?]["']?\s*$/.test(trimmed)) return true;
  // Fountain element boundary (blank line after content)
  if (trimmed.endsWith("\n\n")) return true;
  // Character cue (all caps line followed by newline)
  if (/^[A-Z][A-Z\s\(\)]+\n$/.test(buffer)) return true;
  return false;
}

app.post("/talk/stream", talkUpload, async (req, res) => {
  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // 1. Transcribe audio (same as existing /talk)
    const transcript = await transcribeAudio(req);
    sendEvent({ type: "transcript", text: transcript });

    // 2. Stream GPT response
    const gptStream = await openai.chat.completions.create({
      model: CHAT_MODEL_RICH,
      stream: true,
      messages: buildMessages(transcript, sessionMemory),
      max_tokens: CHAT_MAX_TOKENS,
      temperature: CHAT_TEMPERATURE,
    });

    let sentenceBuffer = "";
    let fullText = "";
    const ttsPromises = [];

    for await (const chunk of gptStream) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (!delta) continue;

      sentenceBuffer += delta;
      fullText += delta;

      // Send text delta immediately — don't wait for TTS
      sendEvent({ type: "text_delta", text: delta });

      // Fire TTS when we hit a sentence boundary
      if (isSentenceBoundary(sentenceBuffer) && sentenceBuffer.trim().length > 8) {
        const sentence = sentenceBuffer.trim();
        sentenceBuffer = "";

        // Fire TTS in parallel — don't await
        const ttsPromise = (async () => {
          try {
            const ttsResponse = await openai.audio.speech.create({
              model: "tts-1",           // tts-1 is faster; tts-1-hd is higher quality
              voice: TTS_VOICE,
              input: sentence,
              response_format: "mp3",
              speed: TTS_SPEED,
            });
            const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
            sendEvent({
              type: "audio_chunk",
              text: sentence,
              audio: audioBuffer.toString("base64"),
              format: "mp3",
            });
          } catch (err) {
            console.error("[talk/stream] TTS chunk failed:", err.message);
          }
        })();
        ttsPromises.push(ttsPromise);
      }
    }

    // Flush any remaining buffer
    if (sentenceBuffer.trim().length > 0) {
      const sentence = sentenceBuffer.trim();
      const ttsResponse = await openai.audio.speech.create({
        model: "tts-1",
        voice: TTS_VOICE,
        input: sentence,
        response_format: "mp3",
        speed: TTS_SPEED,
      });
      const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
      sendEvent({
        type: "audio_chunk",
        text: sentence,
        audio: audioBuffer.toString("base64"),
        format: "mp3",
      });
    }

    await Promise.allSettled(ttsPromises);
    sendEvent({ type: "done", fullText });
    res.end();

  } catch (err) {
    sendEvent({ type: "error", message: err.message });
    res.end();
  }
});
```

**Important:** Use `tts-1` not `tts-1-hd` for the streaming path. It's faster with minimally noticeable quality difference for voice responses.

---

## Fix 2: Swift client — consume the streaming response and play audio chunks in order

### New file: `them/Network/StreamingTalkClient.swift`

```swift
import Foundation
import AVFoundation

/// Consumes the /talk/stream SSE endpoint and delivers text deltas + audio chunks
/// in real time. Audio chunks are queued and played in order using AVAudioEngine.
@MainActor
final class StreamingTalkClient: ObservableObject {

    // MARK: - Callbacks
    var onTextDelta: ((String) -> Void)?
    var onAudioChunkReady: ((Data, String) -> Void)? // (mp3Data, sentenceText)
    var onDone: ((String) -> Void)?
    var onError: ((Error) -> Void)?

    // MARK: - State
    @Published private(set) var isStreaming = false
    @Published private(set) var fullText = ""

    private var dataTask: URLSessionDataTask?
    private var lineBuffer = ""
    private let audioQueue = StreamingAudioQueue()

    // MARK: - Stream

    func stream(transcript: String, audioData: Data?, backendURL: URL, appToken: String) {
        isStreaming = true
        fullText = ""

        var request = URLRequest(url: backendURL.appendingPathComponent("/talk/stream"))
        request.httpMethod = "POST"
        request.setValue(appToken, forHTTPHeaderField: "X-APP-TOKEN")

        // Multipart with audio + transcript
        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = buildMultipartBody(transcript: transcript, audioData: audioData, boundary: boundary)

        let session = URLSession(configuration: .default, delegate: StreamDelegate(client: self), delegateQueue: nil)
        dataTask = session.dataTask(with: request)
        dataTask?.resume()
        audioQueue.start()
    }

    func cancel() {
        dataTask?.cancel()
        audioQueue.stop()
        isStreaming = false
    }

    // Called by the URLSessionDataDelegate as bytes arrive
    func handleData(_ data: Data) {
        guard let string = String(data: data, encoding: .utf8) else { return }
        lineBuffer += string

        // Process complete SSE lines
        while let range = lineBuffer.range(of: "\n\n") {
            let line = String(lineBuffer[lineBuffer.startIndex..<range.lowerBound])
            lineBuffer = String(lineBuffer[range.upperBound...])

            if line.hasPrefix("data: ") {
                let jsonString = String(line.dropFirst(6))
                processEvent(jsonString)
            }
        }
    }

    private func processEvent(_ jsonString: String) {
        guard let data = jsonString.data(using: .utf8),
              let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = event["type"] as? String else { return }

        Task { @MainActor in
            switch type {
            case "text_delta":
                let text = event["text"] as? String ?? ""
                fullText += text
                onTextDelta?(text)

            case "audio_chunk":
                let b64 = event["audio"] as? String ?? ""
                let sentenceText = event["text"] as? String ?? ""
                if let audioData = Data(base64Encoded: b64) {
                    audioQueue.enqueue(audioData, sentenceText: sentenceText)
                    onAudioChunkReady?(audioData, sentenceText)
                }

            case "done":
                isStreaming = false
                onDone?(fullText)
                audioQueue.flushAndFinish()

            case "error":
                isStreaming = false
                let message = event["message"] as? String ?? "Unknown error"
                onError?(NSError(domain: "StreamingTalk", code: -1,
                                 userInfo: [NSLocalizedDescriptionKey: message]))

            default:
                break
            }
        }
    }

    private func buildMultipartBody(transcript: String, audioData: Data?, boundary: String) -> Data {
        var body = Data()
        // Add transcript field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"transcript\"\r\n\r\n".data(using: .utf8)!)
        body.append(transcript.data(using: .utf8)!)
        body.append("\r\n".data(using: .utf8)!)
        // Add audio if present
        if let audio = audioData {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"audio.m4a\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: audio/m4a\r\n\r\n".data(using: .utf8)!)
            body.append(audio)
            body.append("\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        return body
    }
}

// MARK: - URLSession delegate shim

private final class StreamDelegate: NSObject, URLSessionDataDelegate {
    weak var client: StreamingTalkClient?
    init(client: StreamingTalkClient) { self.client = client }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        Task { @MainActor [weak client] in
            client?.handleData(data)
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        Task { @MainActor [weak client] in
            if let error, (error as NSError).code != NSURLErrorCancelled {
                client?.onError?(error)
            }
            client?.isStreaming = false
        }
    }
}
```

### New file: `them/Audio/StreamingAudioQueue.swift`

Plays MP3 audio chunks in order, back to back, with no gap between sentences:

```swift
import Foundation
import AVFoundation

/// Receives MP3 data chunks and plays them sequentially with no gap.
/// Uses AVAudioEngine + AVAudioPlayerNode for gapless playback.
final class StreamingAudioQueue {
    private let engine = AVAudioEngine()
    private let playerNode = AVAudioPlayerNode()
    private var queue: [(Data, String)] = []
    private var isPlaying = false
    private let lock = NSLock()

    var onSentenceStarted: ((String) -> Void)?  // fires when a sentence begins playing
    var currentPlaybackTime: TimeInterval = 0
    private var playbackStartDate: Date?

    func start() {
        engine.attach(playerNode)
        engine.connect(playerNode, to: engine.mainMixerNode, format: nil)
        try? engine.start()
    }

    func stop() {
        playerNode.stop()
        engine.stop()
        queue.removeAll()
        isPlaying = false
    }

    func enqueue(_ mp3Data: Data, sentenceText: String) {
        lock.lock()
        queue.append((mp3Data, sentenceText))
        let shouldStart = !isPlaying
        lock.unlock()

        if shouldStart {
            playNext()
        }
    }

    func flushAndFinish() {
        // Nothing extra needed — queue drains naturally
    }

    private func playNext() {
        lock.lock()
        guard !queue.isEmpty else {
            isPlaying = false
            lock.unlock()
            return
        }
        let (mp3Data, sentenceText) = queue.removeFirst()
        isPlaying = true
        lock.unlock()

        // Decode MP3 to PCM
        guard let buffer = decodeMp3(mp3Data) else {
            playNext() // skip bad chunk
            return
        }

        onSentenceStarted?(sentenceText)
        playbackStartDate = Date()

        playerNode.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.playNext()
            }
        }

        if !playerNode.isPlaying {
            playerNode.play()
        }
    }

    private func decodeMp3(_ data: Data) -> AVAudioPCMBuffer? {
        // Write to temp file and decode
        let tmpURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString + ".mp3")
        do {
            try data.write(to: tmpURL)
            let file = try AVAudioFile(forReading: tmpURL)
            let format = file.processingFormat
            let frameCount = AVAudioFrameCount(file.length)
            guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
                return nil
            }
            try file.read(into: buffer)
            try? FileManager.default.removeItem(at: tmpURL)
            return buffer
        } catch {
            try? FileManager.default.removeItem(at: tmpURL)
            return nil
        }
    }
}
```

---

## Fix 3: Wire the new streaming client into `VoiceToPageOrchestrator`

Replace the existing `handleUtterance()` (turn-based, slow) with a new streaming path that uses `StreamingTalkClient`. Update `VoiceToPageOrchestrator.swift`:

```swift
// Add at top of class
let streamingClient = StreamingTalkClient()
private var pendingWordBuffer = ""

func handleUtteranceStreaming(_ transcript: String) async {
    guard !transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

    isListening = false
    voiceCapture.stopRecording()
    isProcessing = true
    partialTranscript = ""
    pendingWordBuffer = ""

    // Start streaming cursor immediately — don't wait for audio
    useStreamCursor = true
    streamCursor.start(estimatedDuration: 10.0)

    streamingClient.onTextDelta = { [weak self] delta in
        guard let self else { return }
        Task { @MainActor in
            self.isProcessing = false
            self.isSpeaking = true

            // Accumulate and format Fountain text
            self.pendingWordBuffer += delta
            let formatted = FountainFormatter.format(
                rawText: self.pendingWordBuffer,
                existingDraft: self.fountainDraft
            )
            // Feed the stream cursor — text reveals at audio pace
            self.streamCursor.appendDelta(formatted)
        }
    }

    streamingClient.onDone = { [weak self] fullText in
        guard let self else { return }
        Task { @MainActor in
            let formatted = FountainFormatter.format(
                rawText: fullText,
                existingDraft: self.fountainDraft
            )
            let separator = self.fountainDraft.isEmpty ? "" : "\n\n"
            self.fountainDraft += separator + formatted
            self.streamCursor.finalize(totalText: formatted)
            self.recentTurns.append((role: "user", text: transcript))
            self.recentTurns.append((role: "assistant", text: fullText))
            if self.recentTurns.count > 6 { self.recentTurns.removeFirst(2) }
        }
    }

    streamingClient.onAudioChunkReady = { [weak self] _, sentenceText in
        // StreamingAudioQueue handles playback — update cursor timing from audio
        guard let self else { return }
        Task { @MainActor in
            // Each time a sentence chunk arrives, sync the cursor
            // to actual audio playback position
            self.streamCursor.currentPlaybackTime = self.orbAudio.audioQueue?.currentPlaybackTime ?? 0
        }
    }

    streamingClient.onError = { [weak self] error in
        guard let self else { return }
        Task { @MainActor in
            HerLog.talk.error("Streaming talk failed: \(error.localizedDescription)")
            self.isProcessing = false
            self.isSpeaking = false
            self.beginListening()
        }
    }

    guard let backendURL = BackendMemoryAPI.shared.resolvedBaseURL() else { return }
    let appToken = Bundle.main.object(forInfoDictionaryKey: "APP_TOKEN") as? String ?? ""

    streamingClient.stream(
        transcript: transcript,
        audioData: nil, // pass recorded audio data if available
        backendURL: backendURL,
        appToken: appToken
    )
}
```

In `setupCallbacks()`, change the `onUtteranceReady` handler for `.turnBased` mode:

```swift
// Replace:
case .turnBased:
    await self.handleUtterance(transcript)

// With:
case .turnBased:
    await self.handleUtteranceStreaming(transcript)
```

---

## Fix 4: Fix `StreamingSyncCursor` to sync with actual audio position

The current `StreamingSyncCursor` uses wall-clock time from when streaming started, not actual audio position. This causes text to drift ahead or behind what Clementine is saying.

In `StreamingSyncCursor.swift`, expose a public setter for audio position and use it in `tick()`:

The property `currentPlaybackTime` already exists. The fix is in `VoiceToPageOrchestrator` — wire `StreamingAudioQueue.currentPlaybackTime` into the cursor on every audio chunk callback (done in Fix 3 above). No changes needed in the cursor itself.

---

## Fix 5: Move `FountainFormatter` off the main thread

Currently `FountainFormatter.format()` is called synchronously on the main thread for every text delta. If the formatter does any regex or string scanning, this causes frame drops and stutters.

In `FountainFormatter.swift`, confirm the `format()` method is a pure function (no shared mutable state). Then in `VoiceToPageOrchestrator`, dispatch it to a background actor:

```swift
// Add a background formatting actor
actor FountainFormatterActor {
    func format(rawText: String, existingDraft: String) -> String {
        FountainFormatter.format(rawText: rawText, existingDraft: existingDraft)
    }
}

// In VoiceToPageOrchestrator:
private let formatterActor = FountainFormatterActor()

// Then in handleUtteranceStreaming onTextDelta callback:
let formatted = await formatterActor.format(rawText: pendingWordBuffer, existingDraft: fountainDraft)
```

---

## Fix 6: Barge-in — let the user interrupt Clementine mid-speech

Right now if Clementine is speaking and the user starts talking, nothing happens. Add interruption support:

In `VoiceCapture.swift`, expose a `forceCapture()` method that bypasses the `isBusy` guard. In `VoiceToPageOrchestrator`:

```swift
// When user starts speaking while Clementine is speaking:
voiceCapture.onSpeechDetected = { [weak self] in
    Task { @MainActor [weak self] in
        guard let self, self.isSpeaking else { return }
        // Cancel ongoing stream and audio
        self.streamingClient.cancel()
        self.orbAudio.audioQueue?.stop()
        self.isSpeaking = false
        self.streamCursor.stop()
        // Immediately start capturing
        self.beginListening()
    }
}
```

In the backend `/talk/stream` route, if the client disconnects mid-stream (barge-in), detect `req.on('close')` and abort the GPT stream and any in-flight TTS calls:

```js
req.on("close", () => {
  gptStream.controller.abort();
  ttsPromises.forEach(p => p.catch(() => {})); // allow in-flight to fail gracefully
  res.end();
});
```

---

## Fix 7: Speculative pre-warming for screenplay mode

The backend has speculative prompt pre-warming (`TALK_SPECULATIVE_ENABLED`) but it may not be wired for the screenplay studio path. This pre-computes the next GPT response while the user is still speaking, saving ~800-1200ms.

In `VoiceCapture.swift` or wherever silence detection happens, fire a speculative prepare request as soon as the user pauses (but before they stop):

```swift
// When silence is detected but recording hasn't officially ended yet:
func onSilenceDetected(partialTranscript: String) {
    guard !partialTranscript.isEmpty else { return }
    // Fire a speculative prepare — the backend will pre-warm the response
    Task {
        try? await BackendMemoryAPI.shared.speculativePrepare(
            transcript: partialTranscript,
            mode: "screenplay"
        )
    }
}
```

In `BackendMemoryAPI.swift`, add:

```swift
func speculativePrepare(transcript: String, mode: String) async throws {
    // POST /talk with action=prepare — triggers backend speculative pre-warm
    var req = try buildRequest(path: "/talk", method: "POST")
    // multipart body with transcript + action=prepare header
    req.setValue("prepare", forHTTPHeaderField: "X-Talk-Action")
    req.httpBody = buildTranscriptBody(transcript: transcript)
    _ = try await URLSession.shared.data(for: req)
}
```

---

## Expected results after these fixes

| Before | After |
|---|---|
| ~3s wait before hearing anything | ~0.8s to first audio (first sentence TTS fires immediately) |
| Text appears after audio finishes | Text appears word-by-word in sync with speech |
| No voice in streaming mode | Voice + text simultaneously in all modes |
| User can't interrupt Clementine | Barge-in cancels and re-listens instantly |
| FountainFormatter blocks main thread | Formatter runs in background, no frame drops |

## Order to implement

1. **Fix 1 + Fix 2** together — the backend SSE endpoint and the Swift streaming client. This alone cuts perceived latency by ~60%.
2. **Fix 3** — wire into VoiceToPageOrchestrator. This makes talking + writing simultaneous.
3. **Fix 6** — barge-in. Small change, huge UX improvement.
4. **Fix 4** — audio sync. Fixes the text/voice timing drift.
5. **Fix 5** — background formatting. Polish.
6. **Fix 7** — speculative pre-warming for screenplay. Final latency cut.

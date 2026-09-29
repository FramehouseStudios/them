// After a voice turn writes a page, Clementine does not read the page aloud.
// The app sends the short line she says instead ("It's on the page. Want me to
// read back what I just wrote, the whole page, or the full script?") as
// `page_audio_line`; the app owns the wording (PageWriteReadBackOffer.swift).
// Older apps send nothing and keep the page read-back with its synced reveal.

export const PAGE_AUDIO_LINE_MAX_CHARS = 240;

export function resolveTalkPageAudioLine(body) {
  const raw = body?.page_audio_line ?? body?.pageAudioLine ?? "";
  if (typeof raw !== "string") return "";
  const clean = raw
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean || clean.length > PAGE_AUDIO_LINE_MAX_CHARS) return "";
  return clean;
}

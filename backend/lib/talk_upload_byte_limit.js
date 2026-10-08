// One audio file plus bounded screenplay/context metadata and MIME overhead.
export const TALK_UPLOAD_CONTEXT_BYTES = 8 * 1024 * 1024;

export function uploadRequestSizeError() {
  const error = new Error("Upload exceeds the allowed request limits.");
  error.code = "LIMIT_REQUEST_SIZE";
  return error;
}

// Multer's streamHandler is the production parser seam. Count raw wire bytes
// before they reach Busboy; per-field limits alone multiply with field count.
export function boundedTalkUploadStream(maxBytes) {
  return (req, busboy) => {
    let bytes = 0;
    const cleanup = () => {
      req.removeListener("data", countBytes);
      req.removeListener("end", cleanup);
      req.removeListener("close", cleanup);
      busboy.removeListener("close", cleanup);
    };
    const countBytes = (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes <= maxBytes) return;
      cleanup();
      // Multer owns request-error cleanup, including active in-memory files.
      // Leave the socket available for its bounded JSON error response.
      req.emit("error", uploadRequestSizeError());
    };
    req.on("data", countBytes);
    req.once("end", cleanup);
    req.once("close", cleanup);
    busboy.once("close", cleanup);
    req.pipe(busboy);
  };
}

import multer from "multer";

export function createUploadErrorHandler(maxFileMB) {
  return function uploadErrorHandler(err, _req, res, next) {
    if (res.headersSent) return next(err);
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ stage: "upload", error: `File too large. Max is ${maxFileMB}MB.` });
    }
    if (err instanceof multer.MulterError) {
      // Never echo attacker-controlled field names or values into logs/responses.
      return res.status(400).json({ stage: "upload", error: "Invalid multipart upload.", code: err.code });
    }
    return next(err);
  };
}

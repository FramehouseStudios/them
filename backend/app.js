import express from "express";
import multer from "multer";

import { MAX_FILE_BYTES } from "./config.js";
import { applyAppMiddleware } from "./middleware/auth.js";
import { TALK_UPLOAD_CONTEXT_BYTES, boundedTalkUploadStream, uploadRequestSizeError } from "./lib/talk_upload_byte_limit.js";

const app = express();
app.disable("x-powered-by");
applyAppMiddleware(app);

const TALK_UPLOAD_LIMITS = Object.freeze({
  fileSize: MAX_FILE_BYTES,
  files: 1,
  fields: 80,
  // Multer triggers the parts limit when it reaches the configured value.
  // The native voice builder can emit 71 metadata fields. Bound the full
  // envelope at 80 fields + one file; 82 avoids rejecting the final part.
  parts: 82,
  fieldNameSize: 128,
  fieldSize: 1024 * 1024,
  fieldNestingDepth: 0,
  fieldArrayIndexLimit: 0,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: TALK_UPLOAD_LIMITS,
  streamHandler: boundedTalkUploadStream(MAX_FILE_BYTES + TALK_UPLOAD_CONTEXT_BYTES),
});

const parseTalkUpload = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "audio", maxCount: 1 },
]);

const TALK_UPLOAD_PAYLOAD_LIMIT_CODES = new Set([
  "LIMIT_REQUEST_SIZE",
  "LIMIT_FILE_SIZE",
  "LIMIT_FILE_COUNT",
  "LIMIT_FIELD_VALUE",
  "LIMIT_FIELD_COUNT",
  "LIMIT_PART_COUNT",
]);

function sendTalkUploadError(error, res) {
  if (res.headersSent) return;
  const code = String(error?.code || "").trim();
  const status = TALK_UPLOAD_PAYLOAD_LIMIT_CODES.has(code) ? 413 : 400;
  const publicCode = code === "LIMIT_FILE_SIZE"
    ? "file_too_large"
    : status === 413
      ? "upload_too_large"
      : "invalid_multipart_upload";

  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({
    stage: "upload",
    code: publicCode,
    error: code === "LIMIT_FILE_SIZE"
      ? `File too large. Max is ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))}MB.`
      : status === 413
        ? "Upload exceeds the allowed request limits."
        : "Invalid multipart upload.",
  });
}

function discardRejectedTalkUpload(req) {
  for (const file of Object.values(req.files || {}).flat()) delete file.buffer;
  req.files = Object.create(null);
  req.body = Object.create(null);
}

function talkUpload(req, res, next) {
  const declaredBytes = Number(req.headers["content-length"]);
  if (Number.isSafeInteger(declaredBytes) && declaredBytes > MAX_FILE_BYTES + TALK_UPLOAD_CONTEXT_BYTES) {
    req.resume();
    return sendTalkUploadError(uploadRequestSizeError(), res);
  }
  parseTalkUpload(req, res, (error) => {
    if (!error) return next();
    // Multer removes its storage copy, but completed memory files also have
    // buffers copied onto req.files placeholders. Do not retain rejected data.
    discardRejectedTalkUpload(req);
    return sendTalkUploadError(error, res);
  });
}

export {
  app,
  TALK_UPLOAD_LIMITS,
  talkUpload,
  upload,
};

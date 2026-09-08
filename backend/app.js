import express from "express";
import multer from "multer";

import { MAX_FILE_BYTES } from "./config.js";
import { applyAppMiddleware } from "./middleware/auth.js";

const app = express();
app.disable("x-powered-by");
applyAppMiddleware(app);

const TALK_UPLOAD_LIMITS = Object.freeze({
  fileSize: MAX_FILE_BYTES,
  files: 1,
  fields: 64,
  // Multer triggers the parts limit when it reaches the configured value.
  // 66 therefore permits the endpoint contract's 64 fields + one file.
  parts: 66,
  fieldNameSize: 128,
  fieldSize: 1024 * 1024,
  fieldNestingDepth: 0,
  fieldArrayIndexLimit: 0,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: TALK_UPLOAD_LIMITS,
});

const parseTalkUpload = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "audio", maxCount: 1 },
]);

const TALK_UPLOAD_PAYLOAD_LIMIT_CODES = new Set([
  "LIMIT_FILE_SIZE",
  "LIMIT_FILE_COUNT",
  "LIMIT_FIELD_VALUE",
  "LIMIT_FIELD_COUNT",
  "LIMIT_PART_COUNT",
]);

function sendTalkUploadError(error, res) {
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

function talkUpload(req, res, next) {
  parseTalkUpload(req, res, (error) => {
    if (!error) return next();
    return sendTalkUploadError(error, res);
  });
}

export {
  app,
  TALK_UPLOAD_LIMITS,
  talkUpload,
  upload,
};

import express from "express";
import multer from "multer";

import { MAX_FILE_BYTES } from "./config.js";
import { applyAppMiddleware } from "./middleware/auth.js";

const app = express();
app.disable("x-powered-by");
applyAppMiddleware(app);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
});

const parseTalkUpload = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "audio", maxCount: 1 },
]);

function talkUpload(req, res, next) {
  parseTalkUpload(req, res, (err) => {
    // Keep the existing global413 contract; never turn malformed client
    // fields into a generic server error or expose parser internals.
    const malformedMultipart = ["Unexpected end of form", "Unexpected end of file", "Malformed part header"]
      .includes(err?.message);
    if ((err instanceof multer.MulterError && err.code !== "LIMIT_FILE_SIZE") || malformedMultipart) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(400).json({ stage: "upload", error: "Invalid audio upload.",
        code: malformedMultipart ? "INVALID_MULTIPART" : err.code });
    }
    return next(err);
  });
}

export {
  app,
  talkUpload,
  upload,
};

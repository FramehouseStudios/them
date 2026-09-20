import express from "express";
import multer from "multer";

import { MAX_FILE_BYTES } from "./config.js";
import { applyAppMiddleware } from "./middleware/auth.js";

const app = express();
app.disable("x-powered-by");
applyAppMiddleware(app);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_BYTES, files: 2, fields: 256, parts: 258,
    fieldNameSize: 128, fieldNestingDepth: 4, fieldArrayIndexLimit: 100,
  },
});

const talkUpload = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "audio", maxCount: 1 },
]);

export {
  app,
  talkUpload,
  upload,
};

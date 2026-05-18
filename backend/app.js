import express from "express";
import multer from "multer";

import { MAX_FILE_BYTES } from "./config.js";
import { applyAppMiddleware } from "./middleware/auth.js";

const app = express();
app.disable("x-powered-by");
// Day 2: trust exactly one proxy hop (Render's load balancer) so
// `req.ip` is the real client address and X-Forwarded-For beyond that
// hop is not attacker-spoofable. The exposure rate/budget guards key
// unauthenticated requests on `req.ip`, so this must be set for the
// IP fallback to be trustworthy.
app.set("trust proxy", 1);
applyAppMiddleware(app);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
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

const SECURITY_HEADERS = Object.freeze({
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
});

function securityHeadersMiddleware(_req, res, next) {
  if (process.env.SECURITY_HEADERS_DISABLED === "1") {
    return next();
  }
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
  return next();
}

export {
  SECURITY_HEADERS,
  securityHeadersMiddleware,
};

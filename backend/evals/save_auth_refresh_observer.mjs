// Loopback proof observer only. Never imported by production. It changes no
// auth decision or response body; credentials are compared only in memory.
if (process.env.NODE_ENV !== 'test' || process.env.HOST !== '127.0.0.1'
    || process.env.THEM_SAVE_AUTH_REFRESH_PROOF !== '1') {
  throw new Error('Explicit loopback auth-refresh proof process required');
}
const { app } = await import('../app.js');
const stats = { version401: 0, refresh200: 0, freshBearerVersion201: 0 };
let refreshedBearer = '';
app.get('/__test/save-auth-refresh-stats', (_req, res) => res.json(stats));
app.use((req, res, next) => {
  const version = req.method === 'POST' && /^\/screenplay\/projects\/[^/]+\/version$/.test(req.path);
  const refresh = req.method === 'POST' && req.path === '/auth/refresh';
  if (refresh) {
    const originalJSON = res.json;
    res.json = function (body) {
      if (res.statusCode === 200 && typeof body?.access_token === 'string') {
        refreshedBearer = `Bearer ${body.access_token}`;
      }
      return originalJSON.call(this, body);
    };
  }
  res.once('finish', () => {
    if (version && res.statusCode === 401) stats.version401 += 1;
    if (refresh && res.statusCode === 200) stats.refresh200 += 1;
    if (version && res.statusCode === 201 && stats.version401 > 0 && stats.refresh200 > 0
        && refreshedBearer && req.headers.authorization === refreshedBearer) stats.freshBearerVersion201 += 1;
  });
  next();
});

// Short-lived route-test servers must not leave pooled fetch sockets pointed
// at an ephemeral port that the OS may immediately assign to another server.
import http from "node:http";

function listenEphemeral(app, port = 0) {
  const server = http.createServer((req, res) => {
    res.setHeader("Connection", "close");
    app(req, res);
  });
  const close = server.close.bind(server);
  server.close = (callback) => {
    server.closeAllConnections?.();
    return close(callback);
  };
  return server.listen(port);
}

export { listenEphemeral };

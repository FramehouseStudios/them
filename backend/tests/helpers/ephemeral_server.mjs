// Ephemeral test servers without keep-alive.
//
// Each route test starts its own express app on port 0 and closes it. The
// global fetch keeps keep-alive sockets in a pool; when the OS hands the
// next server the same port, a pooled socket to the closed server is
// reused and the peer is gone: "fetch failed / other side closed". Seen on
// memories_route_deeper (#656) and clementine_iap_packs (#662).
//
// listenEphemeral(app) is a drop-in for app.listen(0): the server sets
// "Connection: close" before Express runs so fetch never pools a socket to
// this port, and close() drains open connections before shutting down.
import http from "node:http";

function listenEphemeral(app, port = 0) {
  const server = http.createServer((req, res) => {
    res.setHeader("Connection", "close");
    app(req, res);
  });
  const close = server.close.bind(server);
  server.close = (cb) => {
    server.closeAllConnections?.();
    return close(cb);
  };
  return server.listen(port);
}

export { listenEphemeral };

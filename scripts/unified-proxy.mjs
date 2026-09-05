import http from "http";
import httpProxy from "http-proxy";

const NEXT_PORT = 3000;
const SOCKET_PORT = 4001;
const PROXY_PORT = 8080;

const proxy = httpProxy.createProxyServer({
  xfwd: true,
  ws: true,
});

proxy.on("error", (err, req, res) => {
  console.error("[proxy error]", err.message);
  if (res && !res.headersSent && typeof res.writeHead === "function") {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Bad Gateway - Upstream service temporarily unavailable.");
  }
});

const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith("/socket.io")) {
    proxy.web(req, res, { target: `http://127.0.0.1:${SOCKET_PORT}` });
  } else {
    proxy.web(req, res, { target: `http://127.0.0.1:${NEXT_PORT}` });
  }
});

server.on("upgrade", (req, socket, head) => {
  if (req.url && req.url.startsWith("/socket.io")) {
    proxy.ws(req, socket, head, { target: `http://127.0.0.1:${SOCKET_PORT}` });
  } else {
    proxy.ws(req, socket, head, { target: `http://127.0.0.1:${NEXT_PORT}` });
  }
});

server.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(`[unified-proxy] Listening on port ${PROXY_PORT}`);
  console.log(`  -> Web traffic forwarded to Next.js (port ${NEXT_PORT})`);
  console.log(`  -> /socket.io forwarded to Socket.IO (port ${SOCKET_PORT})`);
});

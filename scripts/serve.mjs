// Loopback static server. Query strings are ignored. Dot segments are rejected
// so node_modules can be served without opening hidden files.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPort = process.env.PORT;
const port = envPort == null || envPort === "" ? 8090 : Number(envPort);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff": "font/woff",
  ".png": "image/png",
  ".wasm": "application/wasm",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

function localPath(urlPath) {
  let decoded = urlPath;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const parts = decoded.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === ".." || part.startsWith("."))) return null;
  const full = path.resolve(root, ...parts);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

// The local play API (Magna features/play/bff/local_server.py). Forwarding /api/play/ to it keeps the game and its
// rooms on one origin, so plain http://127.0.0.1:8090 can host and join without ?play=.
const playPort = Number(process.env.PLAY_API_PORT || 4339);

function forwardPlay(request, response) {
  const upstream = http.request(
    { host: "127.0.0.1", port: playPort, path: request.url, method: request.method,
      headers: { ...request.headers, host: `127.0.0.1:${playPort}` } },
    (answer) => {
      response.writeHead(answer.statusCode || 502, answer.headers);
      answer.pipe(response);
    },
  );
  upstream.on("error", () => {
    if (response.headersSent) return response.end();
    response.writeHead(502, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ code: "play_unreachable", message: `The play server on port ${playPort} is not running.` }));
  });
  request.pipe(upstream);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/api/play/")) {
    forwardPlay(request, response);
    return;
  }
  const target = localPath(url.pathname);
  if (!target) {
    response.writeHead(400);
    response.end("bad path");
    return;
  }
  let file = target;
  if (url.pathname === "/") file = path.join(root, "index.html");
  fs.stat(file, (statError, stat) => {
    if (statError || !stat.isFile()) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    const type = types[path.extname(file).toLowerCase()] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    fs.createReadStream(file).pipe(response);
  });
});

server.listen(port, "127.0.0.1", () => {
  const actual = server.address().port;
  console.log(`garbage-can-race http://127.0.0.1:${actual}`);
});

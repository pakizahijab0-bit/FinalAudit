/* ============================================================
   FinalAudit — local development server
   Serves /public and routes /api/audit to the same Netlify
   Function used in production. No dependencies.
   Run: node server.js
   ============================================================ */

"use strict";

const http = require("node:http");
const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");

const auditFunction = require("./netlify/functions/audit");

const PORT = Number(process.env.PORT) || 8091;
const ROOT = path.resolve(__dirname, "public");
const FUNCTION_PATHS = new Set(["/api/audit", "/.netlify/functions/audit"]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8"
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store"
  }, headers || {}));
  res.end(body);
}

async function serveStatic(req, res, pathname) {
  let relative = decodeURIComponent(pathname);
  if (relative === "/") relative = "/index.html";

  const filePath = path.resolve(ROOT, "." + relative);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    send(res, 403, "Forbidden");
    return;
  }

  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch (err) {
    send(res, 404, "Not found");
    return;
  }

  let finalPath = filePath;
  if (stat.isDirectory()) {
    finalPath = path.join(filePath, "index.html");
    try {
      stat = await fsp.stat(finalPath);
    } catch (err) {
      send(res, 404, "Not found");
      return;
    }
  }

  const ext = path.extname(finalPath).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";
  const cacheControl = ext === ".html" ? "no-store" : "public, max-age=300";

  res.writeHead(200, {
    "content-type": contentType,
    "content-length": stat.size,
    "cache-control": cacheControl,
    "x-content-type-options": "nosniff"
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(finalPath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  } catch (err) {
    send(res, 400, "Bad request");
    return;
  }

  if (FUNCTION_PATHS.has(url.pathname)) {
    const event = {
      httpMethod: req.method,
      headers: req.headers,
      queryStringParameters: Object.fromEntries(url.searchParams.entries()),
      path: url.pathname
    };

    try {
      const result = await auditFunction.handler(event);
      res.writeHead(result.statusCode || 200, result.headers || {});
      res.end(result.body || "");
    } catch (err) {
      console.error("Audit function error:", err);
      send(res, 500, JSON.stringify({ error: "Internal audit error." }), {
        "content-type": "application/json; charset=utf-8"
      });
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method not allowed");
    return;
  }

  await serveStatic(req, res, url.pathname);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("FinalAudit running at http://127.0.0.1:" + PORT);
  console.log("Local audit API: http://127.0.0.1:" + PORT + "/api/audit?url=https://example.com");
});

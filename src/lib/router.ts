import { createReadStream, existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join } from "node:path";
import type { WiremonitorConfig } from "../types.js";
import { handleAnalyses } from "./api/analyses.js";
import { handleConnectionById, handleConnections } from "./api/connections.js";
import { handleStats } from "./api/stats.js";
import { handleStatus } from "./api/status.js";
import { addSseClient } from "./sse.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const STATIC_FILES = new Set(["/app.js", "/style.css", "/favicon.ico"]);

function serveStatic(res: ServerResponse, filePath: string): void {
  if (!existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }
  const mime = MIME[extname(filePath)] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime });
  createReadStream(filePath).pipe(res);
}

export function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: WiremonitorConfig,
  publicDir: string,
): void {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const path = url.pathname;

  if (path === "/api/events") {
    addSseClient(res);
    return;
  }

  if (path === "/api/connections") {
    handleConnections(req, res);
    return;
  }

  const connMatch = /^\/api\/connections\/(\d+)$/.exec(path);
  if (connMatch) {
    handleConnectionById(req, res, Number(connMatch[1]));
    return;
  }

  if (path === "/api/analyses") {
    handleAnalyses(req, res);
    return;
  }

  if (path === "/api/stats") {
    handleStats(req, res, config);
    return;
  }

  if (path === "/api/status") {
    handleStatus(req, res);
    return;
  }

  if (path === "/" || path === "/index.html") {
    serveStatic(res, join(publicDir, "index.html"));
    return;
  }

  if (STATIC_FILES.has(path)) {
    serveStatic(res, join(publicDir, path));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

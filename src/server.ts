#!/usr/bin/env node
import { exec } from "node:child_process";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, resolveDbPath } from "./lib/config.js";
import { closeDb, openDb } from "./lib/db.js";
import { handleRequest } from "./lib/router.js";
import { startPoller, stopPoller } from "./lib/sse.js";
import type { WiremonitorConfig } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

const args = process.argv.slice(2);

function printUsage(): void {
  console.log(
    [
      "Usage: wm [options]",
      "",
      "Options:",
      "  --port <n>     HTTP server port (default: 3311)",
      "  --host <h>     Bind address (default: 127.0.0.1)",
      "  --no-open      Do not open browser on start",
      "  --db <path>    Path to SQLite database",
      "  --config       Print current configuration and exit",
      "  --help         Show this help",
    ].join("\n"),
  );
}

function parseArgs(config: WiremonitorConfig): WiremonitorConfig {
  const c = structuredClone(config);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--port": {
        const n = Number(args[++i]);
        if (!Number.isInteger(n) || n < 1 || n > 65535) {
          console.error("--port must be an integer between 1 and 65535");
          process.exit(1);
        }
        c.server.port = n;
        break;
      }
      case "--host":
        c.server.host = args[++i];
        break;
      case "--no-open":
        c.server.openBrowser = false;
        break;
      case "--db":
        c.db.path = args[++i];
        break;
      case "--config":
        console.log(JSON.stringify(c, null, 2));
        process.exit(0);
        break;
      case "--help":
        printUsage();
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        printUsage();
        process.exit(1);
    }
  }
  return c;
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd);
}

function shutdown(): void {
  stopPoller();
  closeDb();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const config = parseArgs(loadConfig());

let dbPath: string;
try {
  dbPath = resolveDbPath(config);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

try {
  openDb(dbPath);
} catch (err) {
  console.error(`Failed to open database: ${(err as Error).message}`);
  process.exit(1);
}

startPoller(config);

const server = createServer((req, res) => {
  try {
    handleRequest(req, res, config, PUBLIC_DIR);
  } catch (err) {
    console.error("Unhandled request error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
});

const displayHost = config.server.host === "0.0.0.0" ? "localhost" : config.server.host;
const url = `http://${displayHost}:${config.server.port}`;

server.listen(config.server.port, config.server.host, () => {
  console.log(`wiremonitor running at ${url}`);
  if (config.server.openBrowser) openBrowser(url);
});

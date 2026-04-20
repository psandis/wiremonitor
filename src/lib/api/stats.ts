import type { IncomingMessage, ServerResponse } from "node:http";
import type { WiremonitorConfig } from "../../types.js";
import { resolveDbPath } from "../config.js";
import { getDbStats } from "../db.js";

export function handleStats(
  _req: IncomingMessage,
  res: ServerResponse,
  config: WiremonitorConfig,
): void {
  try {
    const dbPath = resolveDbPath(config);
    const stats = getDbStats(dbPath);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(stats));
  } catch {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to fetch stats" }));
  }
}

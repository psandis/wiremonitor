import type { IncomingMessage, ServerResponse } from "node:http";
import type { DaemonStatus } from "../../types.js";
import { getActiveSession } from "../db.js";

export function handleStatus(_req: IncomingMessage, res: ServerResponse): void {
  try {
    const session = getActiveSession();
    const status: DaemonStatus = {
      running: session !== null,
      session,
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(status));
  } catch {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to fetch daemon status" }));
  }
}

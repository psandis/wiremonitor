import type { ServerResponse } from "node:http";
import type { WiremonitorConfig } from "../types.js";
import { getConnectionsSince } from "./db.js";

const clients = new Set<ServerResponse>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastSeen = 0;

export function addSseClient(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

export function startPoller(config: WiremonitorConfig): void {
  if (pollTimer) return;
  lastSeen = Date.now();

  pollTimer = setInterval(() => {
    if (clients.size === 0) return;
    try {
      const fresh = getConnectionsSince(lastSeen);
      if (fresh.length === 0) return;
      lastSeen = fresh[fresh.length - 1].last_seen;
      const payload = fresh
        .map((c) => `event: connection\ndata: ${JSON.stringify(c)}\n\n`)
        .join("");
      for (const client of clients) {
        try {
          client.write(payload);
        } catch {
          clients.delete(client);
        }
      }
    } catch {
      // db read failed — skip tick
    }
  }, config.server.ssePollInterval);
}

export function stopPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  for (const client of clients) {
    try {
      client.end();
    } catch {
      // already closed
    }
  }
  clients.clear();
}

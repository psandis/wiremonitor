import type { IncomingMessage, ServerResponse } from "node:http";
import type { ConnectionDirection, QueryConnectionsOptions } from "../../types.js";
import { getConnectionById, queryConnections } from "../db.js";

export function handleConnections(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const params = url.searchParams;

  const opts: QueryConnectionsOptions = {};

  const limit = params.get("limit");
  if (limit !== null) {
    const n = Number(limit);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "limit must be an integer between 1 and 1000" }));
      return;
    }
    opts.limit = n;
  }

  const offset = params.get("offset");
  if (offset !== null) {
    const n = Number(offset);
    if (!Number.isInteger(n) || n < 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "offset must be a non-negative integer" }));
      return;
    }
    opts.offset = n;
  }

  const since = params.get("since");
  if (since !== null) {
    const n = Number(since);
    if (!Number.isFinite(n)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "since must be a unix timestamp in milliseconds" }));
      return;
    }
    opts.since = n;
  }

  const protocol = params.get("protocol");
  if (protocol !== null) opts.protocol = protocol;

  const direction = params.get("direction");
  if (direction !== null) {
    const valid: ConnectionDirection[] = ["inbound", "outbound", "local"];
    if (!valid.includes(direction as ConnectionDirection)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `direction must be one of: ${valid.join(", ")}` }));
      return;
    }
    opts.direction = direction as ConnectionDirection;
  }

  const process = params.get("process");
  if (process !== null) opts.process_name = process;

  const dst_ip = params.get("dst_ip");
  if (dst_ip !== null) opts.dst_ip = dst_ip;

  try {
    const connections = queryConnections(opts);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(connections));
  } catch (_err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to query connections" }));
  }
}

export function handleConnectionById(_req: IncomingMessage, res: ServerResponse, id: number): void {
  try {
    const connection = getConnectionById(id);
    if (!connection) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Connection ${id} not found` }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(connection));
  } catch (_err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to fetch connection" }));
  }
}

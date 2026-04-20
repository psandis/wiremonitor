import type { IncomingMessage, ServerResponse } from "node:http";
import { queryAnalyses } from "../db.js";

export function handleAnalyses(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const limitParam = url.searchParams.get("limit");

  let limit = 20;
  if (limitParam !== null) {
    const n = Number(limitParam);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "limit must be an integer between 1 and 100" }));
      return;
    }
    limit = n;
  }

  try {
    const analyses = queryAnalyses(limit);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(analyses));
  } catch {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to query analyses" }));
  }
}

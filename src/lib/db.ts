import { statSync } from "node:fs";
import Database from "better-sqlite3";
import type { Analysis, Connection, DbStats, QueryConnectionsOptions, Session } from "../types.js";

let db: Database.Database | null = null;

export function openDb(path: string): void {
  if (db) return;
  db = new Database(path, { readonly: true });
  db.pragma("temp_store = MEMORY");
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function getDb(): Database.Database {
  if (!db) throw new Error("Database not open.");
  return db;
}

// -- Connections --

export function queryConnections(opts: QueryConnectionsOptions = {}): Connection[] {
  const { limit = 100, offset = 0, since, protocol, dst_ip, direction, process_name } = opts;

  const conditions: string[] = [];
  const params: Record<string, unknown> = { limit, offset };

  if (since !== undefined) {
    conditions.push("last_seen >= @since");
    params.since = since;
  }
  if (protocol) {
    conditions.push("protocol = @protocol");
    params.protocol = protocol;
  }
  if (dst_ip) {
    conditions.push("dst_ip = @dst_ip");
    params.dst_ip = dst_ip;
  }
  if (direction) {
    conditions.push("direction = @direction");
    params.direction = direction;
  }
  if (process_name) {
    conditions.push("process_name = @process_name");
    params.process_name = process_name;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  return getDb()
    .prepare(
      `SELECT * FROM connections ${where}
       ORDER BY last_seen DESC
       LIMIT @limit OFFSET @offset`,
    )
    .all(params) as Connection[];
}

export function getConnectionById(id: number): Connection | null {
  return (
    (getDb().prepare(`SELECT * FROM connections WHERE id = ?`).get(id) as Connection | undefined) ??
    null
  );
}

export function getConnectionsSince(since: number): Connection[] {
  return getDb()
    .prepare(`SELECT * FROM connections WHERE last_seen > ? ORDER BY last_seen ASC`)
    .all(since) as Connection[];
}

// -- Analyses --

export function queryAnalyses(limit = 20): Analysis[] {
  return getDb()
    .prepare(`SELECT * FROM analyses ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as Analysis[];
}

// -- Sessions --

export function getActiveSession(): Session | null {
  return (
    (getDb()
      .prepare(`SELECT * FROM sessions WHERE stopped_at IS NULL ORDER BY started_at DESC LIMIT 1`)
      .get() as Session | undefined) ?? null
  );
}

// -- Stats --

export function getDbStats(dbPath: string): DbStats {
  const d = getDb();

  const totalConnections = (
    d.prepare(`SELECT COUNT(*) as n FROM connections`).get() as { n: number }
  ).n;

  const totalAnalyses = (d.prepare(`SELECT COUNT(*) as n FROM analyses`).get() as { n: number }).n;

  const totalSessions = (d.prepare(`SELECT COUNT(*) as n FROM sessions`).get() as { n: number }).n;

  const oldest = d.prepare(`SELECT MIN(first_seen) as ts FROM connections`).get() as {
    ts: number | null;
  };

  const topDestinations = d
    .prepare(
      `SELECT dst_ip, dst_hostname, COUNT(*) as count
       FROM connections
       GROUP BY dst_ip
       ORDER BY count DESC
       LIMIT 10`,
    )
    .all() as DbStats["topDestinations"];

  const byProtocol = d
    .prepare(
      `SELECT protocol, COUNT(*) as count
       FROM connections
       GROUP BY protocol
       ORDER BY count DESC`,
    )
    .all() as DbStats["byProtocol"];

  const byDirection = d
    .prepare(
      `SELECT direction, COUNT(*) as count
       FROM connections
       GROUP BY direction
       ORDER BY count DESC`,
    )
    .all() as DbStats["byDirection"];

  const topProcesses = d
    .prepare(
      `SELECT process_name, COUNT(*) as count
       FROM connections
       WHERE process_name IS NOT NULL
       GROUP BY process_name
       ORDER BY count DESC
       LIMIT 10`,
    )
    .all() as DbStats["topProcesses"];

  const topCountries = d
    .prepare(
      `SELECT country_code, COUNT(*) as count
       FROM connections
       WHERE country_code IS NOT NULL
       GROUP BY country_code
       ORDER BY count DESC
       LIMIT 10`,
    )
    .all() as DbStats["topCountries"];

  let dbSizeBytes = 0;
  try {
    dbSizeBytes = statSync(dbPath).size;
  } catch {
    dbSizeBytes = 0;
  }

  return {
    totalConnections,
    totalAnalyses,
    totalSessions,
    oldestConnection: oldest.ts,
    dbSizeBytes,
    topDestinations,
    topProcesses,
    topCountries,
    byProtocol,
    byDirection,
  };
}

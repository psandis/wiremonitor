import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeDb,
  getActiveSession,
  getConnectionById,
  getConnectionsSince,
  getDbStats,
  openDb,
  queryAnalyses,
  queryConnections,
} from "../src/lib/db.js";

// Fixed base timestamp — deterministic, not relative to wall clock
const T = 1700000000000;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS connections (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    protocol     TEXT    NOT NULL,
    src_ip       TEXT    NOT NULL,
    src_port     INTEGER,
    dst_ip       TEXT    NOT NULL,
    dst_port     INTEGER,
    dst_hostname TEXT,
    country_code TEXT,
    direction    TEXT    NOT NULL,
    state        TEXT,
    process_name TEXT,
    process_pid  INTEGER,
    bytes_sent   INTEGER,
    bytes_recv   INTEGER,
    interface    TEXT,
    capture_mode TEXT    NOT NULL,
    first_seen   INTEGER NOT NULL,
    last_seen    INTEGER NOT NULL,
    UNIQUE (protocol, src_ip, src_port, dst_ip, dst_port)
  );
  CREATE TABLE IF NOT EXISTS analyses (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at       INTEGER NOT NULL,
    provider         TEXT    NOT NULL,
    model            TEXT    NOT NULL,
    connection_count INTEGER NOT NULL,
    summary          TEXT    NOT NULL,
    flags            TEXT    NOT NULL,
    risk_level       TEXT    NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at       INTEGER NOT NULL,
    stopped_at       INTEGER,
    capture_mode     TEXT    NOT NULL,
    connection_count INTEGER NOT NULL DEFAULT 0
  );
`;

let tmpDir: string;
let dbPath: string;

function buildDb(): void {
  const w = new Database(dbPath);
  w.exec(SCHEMA);

  const insConn = w.prepare(`
    INSERT INTO connections
      (protocol, src_ip, src_port, dst_ip, dst_port, dst_hostname, country_code,
       direction, state, process_name, process_pid, bytes_sent, bytes_recv,
       interface, capture_mode, first_seen, last_seen)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  // id=1  TCP outbound  T+0 → T+100
  insConn.run(
    "TCP",
    "10.0.0.1",
    52000,
    "8.8.8.8",
    443,
    "dns.google",
    "US",
    "outbound",
    "ESTABLISHED",
    "node",
    1001,
    2048,
    512,
    "en0",
    "passive",
    T,
    T + 100,
  );

  // id=2  UDP outbound  T+200 → T+300
  insConn.run(
    "UDP",
    "10.0.0.1",
    53001,
    "1.1.1.1",
    53,
    null,
    "US",
    "outbound",
    null,
    "Chrome",
    2002,
    null,
    null,
    "en0",
    "passive",
    T + 200,
    T + 300,
  );

  // id=3  TCP inbound   T+400 → T+500
  insConn.run(
    "TCP",
    "10.0.0.1",
    80,
    "192.168.1.50",
    12345,
    null,
    "FI",
    "inbound",
    "ESTABLISHED",
    "nginx",
    3003,
    null,
    null,
    "en0",
    "passive",
    T + 400,
    T + 500,
  );

  w.prepare(`
    INSERT INTO analyses (created_at, provider, model, connection_count, summary, flags, risk_level)
    VALUES (?,?,?,?,?,?,?)
  `).run(
    T + 600,
    "anthropic",
    "claude-haiku-4-5-20251001",
    3,
    "Traffic looks normal.",
    '[{"id":1,"dst_ip":"8.8.8.8"}]',
    "low",
  );

  // closed session
  w.prepare(
    `INSERT INTO sessions (started_at, stopped_at, capture_mode, connection_count) VALUES (?,?,?,?)`,
  ).run(T - 5000, T - 1000, "passive", 3);

  // active session
  w.prepare(
    `INSERT INTO sessions (started_at, stopped_at, capture_mode, connection_count) VALUES (?,?,?,?)`,
  ).run(T + 700, null, "passive", 0);

  w.close();
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "wm-db-"));
  dbPath = join(tmpDir, "test.db");
  buildDb();
  openDb(dbPath);
});

afterEach(() => {
  closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("queryConnections", () => {
  it("returns all connections ordered by last_seen DESC", () => {
    const rows = queryConnections();
    expect(rows).toHaveLength(3);
    expect(rows[0].last_seen).toBeGreaterThanOrEqual(rows[1].last_seen);
    expect(rows[1].last_seen).toBeGreaterThanOrEqual(rows[2].last_seen);
  });

  it("filters by protocol TCP", () => {
    const rows = queryConnections({ protocol: "TCP" });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.protocol === "TCP")).toBe(true);
  });

  it("filters by protocol UDP", () => {
    const rows = queryConnections({ protocol: "UDP" });
    expect(rows).toHaveLength(1);
    expect(rows[0].dst_ip).toBe("1.1.1.1");
  });

  it("filters by direction outbound", () => {
    const rows = queryConnections({ direction: "outbound" });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.direction === "outbound")).toBe(true);
  });

  it("filters by direction inbound", () => {
    const rows = queryConnections({ direction: "inbound" });
    expect(rows).toHaveLength(1);
    expect(rows[0].process_name).toBe("nginx");
  });

  it("filters by process_name", () => {
    const rows = queryConnections({ process_name: "Chrome" });
    expect(rows).toHaveLength(1);
    expect(rows[0].dst_ip).toBe("1.1.1.1");
  });

  it("filters by dst_ip", () => {
    const rows = queryConnections({ dst_ip: "8.8.8.8" });
    expect(rows).toHaveLength(1);
    expect(rows[0].dst_hostname).toBe("dns.google");
  });

  it("filters by since — returns only connections with last_seen >= since", () => {
    const rows = queryConnections({ since: T + 250 });
    expect(rows.every((r) => r.last_seen >= T + 250)).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it("returns empty array when since is after all records", () => {
    expect(queryConnections({ since: T + 9999 })).toHaveLength(0);
  });

  it("respects limit", () => {
    expect(queryConnections({ limit: 1 })).toHaveLength(1);
  });

  it("respects offset — pages without overlap", () => {
    const page1 = queryConnections({ limit: 2, offset: 0 });
    const page2 = queryConnections({ limit: 2, offset: 2 });
    const ids1 = page1.map((r) => r.id);
    const ids2 = page2.map((r) => r.id);
    expect(ids1.every((id) => !ids2.includes(id))).toBe(true);
  });
});

describe("getConnectionById", () => {
  it("returns the correct connection", () => {
    const all = queryConnections();
    const target = all[0];
    const found = getConnectionById(target.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(target.id);
    expect(found?.dst_ip).toBe(target.dst_ip);
  });

  it("returns null for a nonexistent id", () => {
    expect(getConnectionById(999999)).toBeNull();
  });
});

describe("getConnectionsSince", () => {
  it("returns only connections with last_seen strictly greater than the given timestamp", () => {
    const rows = getConnectionsSince(T + 100);
    expect(rows.every((r) => r.last_seen > T + 100)).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it("returns empty array when timestamp is after all records", () => {
    expect(getConnectionsSince(T + 9999)).toHaveLength(0);
  });

  it("returns results ordered by last_seen ASC for SSE streaming", () => {
    const rows = getConnectionsSince(T - 1);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].last_seen).toBeGreaterThanOrEqual(rows[i - 1].last_seen);
    }
  });
});

describe("queryAnalyses", () => {
  it("returns analyses ordered by created_at DESC", () => {
    const rows = queryAnalyses();
    expect(rows).toHaveLength(1);
    expect(rows[0].risk_level).toBe("low");
    expect(rows[0].provider).toBe("anthropic");
    expect(rows[0].connection_count).toBe(3);
  });

  it("respects the limit parameter", () => {
    expect(queryAnalyses(1)).toHaveLength(1);
  });
});

describe("getActiveSession", () => {
  it("returns the session where stopped_at is NULL", () => {
    const s = getActiveSession();
    expect(s).not.toBeNull();
    expect(s?.stopped_at).toBeNull();
    expect(s?.capture_mode).toBe("passive");
    expect(s?.started_at).toBe(T + 700);
  });

  it("returns null when all sessions are closed", () => {
    // Close the active session directly via a separate writable connection
    const w = new Database(dbPath);
    w.prepare(`UPDATE sessions SET stopped_at = ? WHERE stopped_at IS NULL`).run(T + 999);
    w.close();
    // Reopen our readonly connection to pick up the change
    closeDb();
    openDb(dbPath);
    expect(getActiveSession()).toBeNull();
  });
});

describe("getDbStats", () => {
  it("returns correct totals", () => {
    const s = getDbStats(dbPath);
    expect(s.totalConnections).toBe(3);
    expect(s.totalAnalyses).toBe(1);
    expect(s.totalSessions).toBe(2);
  });

  it("reports the oldest first_seen timestamp", () => {
    expect(getDbStats(dbPath).oldestConnection).toBe(T);
  });

  it("groups by protocol correctly", () => {
    const s = getDbStats(dbPath);
    const tcp = s.byProtocol.find((r) => r.protocol === "TCP");
    const udp = s.byProtocol.find((r) => r.protocol === "UDP");
    expect(tcp?.count).toBe(2);
    expect(udp?.count).toBe(1);
  });

  it("groups by direction correctly", () => {
    const s = getDbStats(dbPath);
    const out = s.byDirection.find((r) => r.direction === "outbound");
    const inn = s.byDirection.find((r) => r.direction === "inbound");
    expect(out?.count).toBe(2);
    expect(inn?.count).toBe(1);
  });

  it("returns top destinations with correct counts", () => {
    const s = getDbStats(dbPath);
    expect(s.topDestinations.length).toBeGreaterThan(0);
    const google = s.topDestinations.find((r) => r.dst_ip === "8.8.8.8");
    expect(google).toBeDefined();
    expect(google?.dst_hostname).toBe("dns.google");
  });

  it("returns actual db file size in bytes", () => {
    expect(getDbStats(dbPath).dbSizeBytes).toBeGreaterThan(0);
  });

  it("returns 0 dbSizeBytes when file does not exist", () => {
    expect(getDbStats("/nonexistent/path.db").dbSizeBytes).toBe(0);
  });
});

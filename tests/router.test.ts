import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, openDb } from "../src/lib/db.js";
import { handleRequest } from "../src/lib/router.js";
import type { WiremonitorConfig } from "../src/types.js";

// Fixed base timestamp
const T = 1700000000000;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT, protocol TEXT NOT NULL,
    src_ip TEXT NOT NULL, src_port INTEGER, dst_ip TEXT NOT NULL, dst_port INTEGER,
    dst_hostname TEXT, country_code TEXT, direction TEXT NOT NULL, state TEXT,
    process_name TEXT, process_pid INTEGER, bytes_sent INTEGER, bytes_recv INTEGER,
    interface TEXT, capture_mode TEXT NOT NULL, first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    UNIQUE (protocol, src_ip, src_port, dst_ip, dst_port)
  );
  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL,
    provider TEXT NOT NULL, model TEXT NOT NULL, connection_count INTEGER NOT NULL,
    summary TEXT NOT NULL, flags TEXT NOT NULL, risk_level TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, started_at INTEGER NOT NULL,
    stopped_at INTEGER, capture_mode TEXT NOT NULL,
    connection_count INTEGER NOT NULL DEFAULT 0
  );
`;

let tmpDir: string;
let dbPath: string;
let publicDir: string;
let serverPort: number;
let stopServer: () => Promise<void>;

const config: WiremonitorConfig = {
  server: { port: 0, host: "127.0.0.1", openBrowser: false, ssePollInterval: 2000 },
  db: { path: "" },
};

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`http://127.0.0.1:${serverPort}${path}`);
  const body = await res.json();
  return { status: res.status, body };
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "wm-router-"));
  dbPath = join(tmpDir, "test.db");
  publicDir = join(tmpDir, "public");

  // Seed database
  const w = new Database(dbPath);
  w.exec(SCHEMA);
  w.prepare(`
    INSERT INTO connections
      (protocol,src_ip,src_port,dst_ip,dst_port,dst_hostname,country_code,
       direction,state,process_name,process_pid,bytes_sent,bytes_recv,
       interface,capture_mode,first_seen,last_seen)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
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
  w.prepare(`
    INSERT INTO analyses (created_at,provider,model,connection_count,summary,flags,risk_level)
    VALUES (?,?,?,?,?,?,?)
  `).run(T + 200, "anthropic", "claude-haiku-4-5-20251001", 1, "All clear.", "[]", "low");
  w.prepare(`INSERT INTO sessions (started_at,capture_mode,connection_count) VALUES (?,?,?)`).run(
    T + 300,
    "passive",
    1,
  );
  w.close();

  // Minimal public dir for static file tests
  mkdirSync(publicDir);
  writeFileSync(join(publicDir, "index.html"), "<html><body>wiremonitor</body></html>");
  writeFileSync(join(publicDir, "app.js"), "// app");
  writeFileSync(join(publicDir, "style.css"), "body{}");

  // Open db and start server
  config.db.path = dbPath;
  openDb(dbPath);

  const server = createServer((req, res) => handleRequest(req, res, config, publicDir));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverPort = (server.address() as AddressInfo).port;

  stopServer = () =>
    new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

afterAll(async () => {
  await stopServer();
  closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("method guard", () => {
  it("returns 405 for POST", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/connections`, { method: "POST" });
    expect(res.status).toBe(405);
  });

  it("returns 405 for DELETE", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/connections`, { method: "DELETE" });
    expect(res.status).toBe(405);
  });
});

describe("GET /api/connections", () => {
  it("returns 200 with array of connections", async () => {
    const { status, body } = await get("/api/connections");
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect((body as unknown[]).length).toBe(1);
  });

  it("filters by protocol", async () => {
    const { body } = await get("/api/connections?protocol=TCP");
    expect((body as unknown[]).length).toBe(1);

    const { body: none } = await get("/api/connections?protocol=UDP");
    expect((none as unknown[]).length).toBe(0);
  });

  it("rejects invalid limit with 400", async () => {
    const { status } = await get("/api/connections?limit=0");
    expect(status).toBe(400);
  });

  it("rejects invalid offset with 400", async () => {
    const { status } = await get("/api/connections?offset=-1");
    expect(status).toBe(400);
  });
});

describe("GET /api/connections/:id", () => {
  it("returns 200 with full connection detail", async () => {
    const { body } = (await get("/api/connections/1")) as { body: Record<string, unknown> };
    expect(body.id).toBe(1);
    expect(body.dst_hostname).toBe("dns.google");
    expect(body.protocol).toBe("TCP");
  });

  it("returns 404 for unknown id", async () => {
    const { status } = await get("/api/connections/999999");
    expect(status).toBe(404);
  });
});

describe("GET /api/analyses", () => {
  it("returns 200 with array of analyses", async () => {
    const { status, body } = await get("/api/analyses");
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    const rows = body as Array<Record<string, unknown>>;
    expect(rows[0].risk_level).toBe("low");
    expect(rows[0].provider).toBe("anthropic");
  });

  it("rejects invalid limit with 400", async () => {
    const { status } = await get("/api/analyses?limit=0");
    expect(status).toBe(400);
  });
});

describe("GET /api/stats", () => {
  it("returns 200 with correct aggregate counts", async () => {
    const { status, body } = (await get("/api/stats")) as {
      status: number;
      body: Record<string, unknown>;
    };
    expect(status).toBe(200);
    expect(body.totalConnections).toBe(1);
    expect(body.totalAnalyses).toBe(1);
    expect(body.totalSessions).toBe(1);
    expect(typeof body.dbSizeBytes).toBe("number");
    expect(Array.isArray(body.byProtocol)).toBe(true);
    expect(Array.isArray(body.byDirection)).toBe(true);
    expect(Array.isArray(body.topDestinations)).toBe(true);
  });
});

describe("GET /api/status", () => {
  it("returns running=true when an active session exists", async () => {
    const { status, body } = (await get("/api/status")) as {
      status: number;
      body: Record<string, unknown>;
    };
    expect(status).toBe(200);
    expect(body.running).toBe(true);
    expect(body.session).not.toBeNull();
  });
});

describe("static files", () => {
  it("serves index.html for GET /", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("serves app.js with correct content-type", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/app.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
  });

  it("serves style.css with correct content-type", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/style.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
  });

  it("returns 404 for unknown paths", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/not-here`);
    expect(res.status).toBe(404);
  });
});

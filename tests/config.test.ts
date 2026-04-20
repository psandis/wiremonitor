import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getConfigPath,
  getHome,
  loadConfig,
  resolveDbPath,
  saveConfig,
} from "../src/lib/config.js";

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "wm-config-"));
  process.env.WIREMONITOR_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.WIREMONITOR_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe("getHome / getConfigPath", () => {
  it("getHome returns WIREMONITOR_HOME", () => {
    expect(getHome()).toBe(tmpHome);
  });

  it("getConfigPath is config.json inside home", () => {
    expect(getConfigPath()).toBe(join(tmpHome, "config.json"));
  });
});

describe("loadConfig", () => {
  it("returns full defaults when no file exists", () => {
    const c = loadConfig();
    expect(c.server.port).toBe(3311);
    expect(c.server.host).toBe("127.0.0.1");
    expect(c.server.openBrowser).toBe(true);
    expect(c.server.ssePollInterval).toBe(2000);
    expect(c.db.path).toBe("");
  });

  it("merges partial file over defaults — other keys stay default", () => {
    writeFileSync(join(tmpHome, "config.json"), JSON.stringify({ server: { port: 4000 } }));
    const c = loadConfig();
    expect(c.server.port).toBe(4000);
    expect(c.server.host).toBe("127.0.0.1");
    expect(c.server.openBrowser).toBe(true);
  });

  it("merges db.path from file", () => {
    writeFileSync(join(tmpHome, "config.json"), JSON.stringify({ db: { path: "/data/wire.db" } }));
    expect(loadConfig().db.path).toBe("/data/wire.db");
  });

  it("falls back to defaults on malformed JSON", () => {
    writeFileSync(join(tmpHome, "config.json"), "{ not: json }");
    expect(loadConfig().server.port).toBe(3311);
  });

  it("does not mutate defaults across calls", () => {
    const a = loadConfig();
    const b = loadConfig();
    a.server.port = 9999;
    expect(b.server.port).toBe(3311);
  });
});

describe("saveConfig / loadConfig round-trip", () => {
  it("persists all fields and reloads them correctly", () => {
    const c = loadConfig();
    c.server.port = 5000;
    c.server.host = "0.0.0.0";
    c.server.openBrowser = false;
    c.server.ssePollInterval = 5000;
    c.db.path = "/data/wire.db";
    saveConfig(c);

    const r = loadConfig();
    expect(r.server.port).toBe(5000);
    expect(r.server.host).toBe("0.0.0.0");
    expect(r.server.openBrowser).toBe(false);
    expect(r.server.ssePollInterval).toBe(5000);
    expect(r.db.path).toBe("/data/wire.db");
  });
});

describe("resolveDbPath", () => {
  it("returns db.path when set", () => {
    const c = loadConfig();
    c.db.path = "/data/wire.db";
    expect(resolveDbPath(c)).toBe("/data/wire.db");
  });

  it("throws with actionable message when db.path is empty", () => {
    const c = loadConfig();
    expect(() => resolveDbPath(c)).toThrow(/db\.path is not set/);
  });
});

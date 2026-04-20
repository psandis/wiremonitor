import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addSseClient, startPoller, stopPoller } from "../src/lib/sse.js";
import type { WiremonitorConfig } from "../src/types.js";

vi.mock("../src/lib/db.js", () => ({
  getConnectionsSince: vi.fn(() => []),
}));

import { getConnectionsSince } from "../src/lib/db.js";

const mockGetConnectionsSince = getConnectionsSince as ReturnType<typeof vi.fn>;

const config: WiremonitorConfig = {
  server: { port: 3311, host: "127.0.0.1", openBrowser: false, ssePollInterval: 1000 },
  db: { path: "/data/test.db" },
};

const CONN = {
  id: 1,
  protocol: "TCP",
  src_ip: "10.0.0.1",
  src_port: 52000,
  dst_ip: "8.8.8.8",
  dst_port: 443,
  dst_hostname: "dns.google",
  country_code: "US",
  direction: "outbound",
  state: "ESTABLISHED",
  process_name: "node",
  process_pid: 1001,
  bytes_sent: 512,
  bytes_recv: 256,
  interface: "en0",
  capture_mode: "passive",
  first_seen: 1700000000000,
  last_seen: 1700000001000,
};

class MockRes extends EventEmitter {
  _written: string[] = [];
  _headers: Record<string, string> = {};
  _ended = false;

  writeHead(_code: number, hdrs?: Record<string, string>) {
    if (hdrs) Object.assign(this._headers, hdrs);
  }
  flushHeaders() {}
  write(data: string) {
    this._written.push(data);
  }
  end() {
    this._ended = true;
  }
}

function makeMockRes() {
  return new MockRes() as unknown as MockRes & ServerResponse;
}

beforeEach(() => {
  vi.useFakeTimers();
  mockGetConnectionsSince.mockReturnValue([]);
  stopPoller();
  vi.clearAllMocks();
});

afterEach(() => {
  stopPoller();
  vi.useRealTimers();
});

describe("addSseClient", () => {
  it("writes correct SSE response headers", () => {
    const res = makeMockRes();
    addSseClient(res);
    expect(res._headers["Content-Type"]).toBe("text/event-stream");
    expect(res._headers["Cache-Control"]).toBe("no-cache");
    expect(res._headers.Connection).toBe("keep-alive");
    expect(res._headers["X-Accel-Buffering"]).toBe("no");
  });

  it("calls end on the client when stopPoller is called", () => {
    const res = makeMockRes();
    addSseClient(res);
    startPoller(config);
    stopPoller();
    expect(res._ended).toBe(true);
  });

  it("removes the client on close event so it is not written to after disconnect", () => {
    const res = makeMockRes();
    addSseClient(res);
    res.emit("close");

    mockGetConnectionsSince.mockReturnValue([CONN]);
    startPoller(config);
    vi.advanceTimersByTime(config.server.ssePollInterval);

    expect(res._written).toHaveLength(0);
  });
});

describe("startPoller", () => {
  it("does not start a second interval if already running", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    startPoller(config);
    startPoller(config);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not write to clients when db returns no new connections", () => {
    const res = makeMockRes();
    addSseClient(res);
    mockGetConnectionsSince.mockReturnValue([]);

    startPoller(config);
    vi.advanceTimersByTime(config.server.ssePollInterval * 3);

    expect(res._written).toHaveLength(0);
  });

  it("broadcasts a connection event for each new connection", () => {
    const res = makeMockRes();
    addSseClient(res);
    mockGetConnectionsSince.mockReturnValue([CONN]);

    startPoller(config);
    vi.advanceTimersByTime(config.server.ssePollInterval);

    expect(res._written).toHaveLength(1);
    expect(res._written[0]).toContain("event: connection");
    expect(res._written[0]).toContain('"id":1');
  });

  it("broadcasts multiple connections in a single write", () => {
    const second = { ...CONN, id: 2, last_seen: CONN.last_seen + 100 };
    const res = makeMockRes();
    addSseClient(res);
    mockGetConnectionsSince.mockReturnValue([CONN, second]);

    startPoller(config);
    vi.advanceTimersByTime(config.server.ssePollInterval);

    expect(res._written).toHaveLength(1);
    const payload = res._written[0];
    expect(payload.match(/event: connection/g)?.length).toBe(2);
  });

  it("advances lastSeen so already-broadcast connections are not re-sent", () => {
    const res = makeMockRes();
    addSseClient(res);
    mockGetConnectionsSince.mockReturnValueOnce([CONN]).mockReturnValue([]);

    startPoller(config);
    vi.advanceTimersByTime(config.server.ssePollInterval);
    vi.advanceTimersByTime(config.server.ssePollInterval);

    expect(res._written).toHaveLength(1);
  });

  it("removes a client that throws on write", () => {
    const res = makeMockRes();
    (res as unknown as { write: () => void }).write = () => {
      throw new Error("broken pipe");
    };
    addSseClient(res);
    mockGetConnectionsSince.mockReturnValue([CONN]);

    startPoller(config);
    expect(() => vi.advanceTimersByTime(config.server.ssePollInterval)).not.toThrow();
  });
});

describe("stopPoller", () => {
  it("stops broadcasting after stopPoller is called", () => {
    const res = makeMockRes();
    addSseClient(res);
    mockGetConnectionsSince.mockReturnValue([CONN]);

    startPoller(config);
    stopPoller();
    vi.advanceTimersByTime(config.server.ssePollInterval * 5);

    expect(res._written).toHaveLength(0);
  });

  it("is safe to call multiple times without throwing", () => {
    expect(() => {
      stopPoller();
      stopPoller();
    }).not.toThrow();
  });
});

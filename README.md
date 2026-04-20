# wiremonitor

[![npm](https://img.shields.io/npm/v/wiremonitor?style=flat-square)](https://www.npmjs.com/package/wiremonitor)

Network traffic web dashboard. Displays live connections, AI analyses, and session statistics in a browser. Reads a local SQLite database. No cloud, no telemetry.

## What It Does

- serves a local web dashboard at `http://localhost:PORT`
- streams live connections via Server-Sent Events as new records arrive
- displays connection table with filtering by protocol, direction, process, and country
- shows connection detail on click
- lists AI analyses with risk level, summary, and flagged connections
- displays database and session statistics
- shows daemon status (running / stopped)
- opens the browser automatically on start

## Requirements

- Node.js 22+
- pnpm (for development)
- A local SQLite database produced by a network capture daemon

## Install

```bash
npm install -g wiremonitor
```

Or with pnpm:

```bash
pnpm add -g wiremonitor
```

After installation, the `wm` command is available globally.

### From source

```bash
git clone https://github.com/psandis/wiremonitor.git
cd wiremonitor
pnpm install
pnpm build
npm link
```

## Quick Start

```bash
wm
```

Starts the HTTP server and opens `http://localhost:3311` in your default browser. The dashboard updates automatically as new connections arrive. Stop with `Ctrl+C`.

## Storage

| Path | Description |
|------|-------------|
| `~/.wiremonitor/config.json` | wiremonitor configuration |

Override the config directory:

```bash
export WIREMONITOR_HOME=/path/to/custom/root
```

## Dashboard

### Header

A fixed header shows the daemon status pill — green when capturing, red when stopped — updated live. Navigation links switch between the three views: Connections, Analyses, and Stats.

### Connections

A live table of captured connections, newest first.

| Column | Description |
|--------|-------------|
| ID | Connection ID |
| Proto | TCP or UDP |
| Source | Source IP and port |
| Destination | Destination hostname or IP and port |
| Dir | Direction: outbound / inbound / local |
| State | Connection state (ESTABLISHED, TIME_WAIT, etc.) |
| Process | Process name that opened the connection |
| CC | Country code of the destination |
| Last Seen | Timestamp of last activity |

A filter bar above the table lets you narrow by protocol, direction, process name, or country code. Filters apply instantly without a page reload.

New rows animate in at the top of the table as the SSE stream delivers them — no manual refresh needed.

Clicking a row opens a detail panel that slides in from the right. The panel shows the full connection record: all addresses and ports, resolved hostname, country, state, process with PID, capture mode, byte counts, interface, first seen, last seen, and duration.

### Analyses

A scrollable list of analysis cards. Each card shows a large risk badge (low / medium / high, color-coded green / yellow / red), the timestamp, AI provider and model, and connection count. Below that is the plain-language summary. If the analysis flagged suspicious connections, they are listed inside the card as clickable links that open the connection detail panel.

### Stats

Stat tiles across the top show key numbers: total connections, analyses, sessions, oldest record, and database size.

Below the tiles, two visual breakdowns use CSS bar charts — protocol distribution and direction distribution — with relative bar widths driven by the actual counts.

A ranked top-destinations list shows the ten most-seen destination IPs or hostnames with their connection count and a relative bar.

## Configuration

```bash
wm --config
```

Prints current configuration and exits.

### Configuration Reference

| Key | Default | Description |
|-----|---------|-------------|
| `server.port` | `3311` | HTTP server port |
| `server.host` | `127.0.0.1` | HTTP server bind address |
| `server.openBrowser` | `true` | Open browser automatically on start |
| `server.ssePollInterval` | `2000` | SSE poll interval in milliseconds |
| `db.path` | | Absolute path to the SQLite database file |

Set values in `~/.wiremonitor/config.json`:

```json
{
  "server": {
    "port": 3311,
    "host": "127.0.0.1",
    "openBrowser": true,
    "ssePollInterval": 2000
  },
  "db": {
    "path": "/path/to/your/database.db"
  }
}
```

Or pass flags at startup:

```bash
wm --port 4000 --no-open --db /path/to/database.db
```

## Tech Stack

- [TypeScript](https://www.typescriptlang.org/) on Node.js 22+
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) for direct SQLite access (read-only)
- `node:http` — no framework
- Plain HTML, CSS, and JavaScript — no frontend framework, no build step
- Server-Sent Events for real-time connection streaming
- [Vitest](https://vitest.dev/) for testing
- [Biome](https://biomejs.dev/) for linting and formatting
- [tsup](https://tsup.egoist.dev/) for building

## Project Structure

```
src/
  server.ts              entry point — starts HTTP server, opens browser
  types.ts               shared TypeScript types
  lib/
    config.ts            configuration load, save, and validation
    db.ts                read-only SQLite queries
    router.ts            HTTP request routing
    sse.ts               Server-Sent Events connection manager
    api/
      connections.ts     GET /api/connections, GET /api/connections/:id
      analyses.ts        GET /api/analyses
      stats.ts           GET /api/stats
      status.ts          GET /api/status
public/
  index.html             dashboard shell
  app.js                 dashboard logic (vanilla JS)
  style.css              styles
tests/
  config.test.ts
  db.test.ts
  router.test.ts
  sse.test.ts
```

## API

wiremonitor exposes a local REST API on the same port as the dashboard.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/connections` | List connections. Query params: `limit`, `offset`, `since`, `protocol`, `direction`, `process`, `dst_ip` |
| GET | `/api/connections/:id` | Single connection detail |
| GET | `/api/analyses` | List analyses. Query param: `limit` |
| GET | `/api/stats` | Database statistics |
| GET | `/api/status` | Daemon status (running / stopped, session info) |
| GET | `/api/events` | SSE stream — emits `connection` events as new records arrive |

All endpoints return JSON.

## Development

```bash
git clone https://github.com/psandis/wiremonitor.git
cd wiremonitor
pnpm install
pnpm build
npm link
```

After `npm link`, run `wm` to start the dashboard.

```bash
pnpm test        # run tests
pnpm typecheck
pnpm lint
```

## Related

- 🦀 [Feedclaw](https://github.com/psandis/feedclaw) — RSS/Atom feed reader and AI digest builder
- 🦀 [Dustclaw](https://github.com/psandis/dustclaw) — Find out what is eating your disk space
- 🦀 [Driftclaw](https://github.com/psandis/driftclaw) — Deployment drift detection across environments
- 🦀 [Dietclaw](https://github.com/psandis/dietclaw) — Codebase health monitor
- 🦀 [OpenClaw](https://github.com/openclaw/openclaw) — The open source AI assistant

## License

See [MIT](LICENSE)

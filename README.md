# wiremonitor

[![npm](https://img.shields.io/npm/v/wiremonitor?style=flat-square)](https://www.npmjs.com/package/wiremonitor)

Network traffic web dashboard. Reads a local SQLite database produced by [wirewatch](https://github.com/psandis/wirewatch) and displays live connections, AI analyses, and session statistics in a browser. No cloud, no telemetry.

wiremonitor serves a local HTTP dashboard and streams new connections to the browser in real time via Server-Sent Events. It reads the database in read-only mode — it never writes, never interferes with the capture daemon.

## What It Does

- serves a local web dashboard at `http://localhost:PORT`
- streams live connections via Server-Sent Events as new records arrive
- displays connection table with filtering by protocol, direction, process, country, and destination IP
- shows connection detail on click with full metadata
- lists AI analyses with risk level, summary, and flagged connections grouped by process and destination
- identifies known processes by name (VS Code, Chrome, Slack, node, etc.)
- displays database and session statistics with visual breakdowns including top processes and top countries
- shows daemon status (running / stopped) updated live
- live SSE status pill shows whether the browser stream is connected
- dark and light theme toggle, persisted across sessions
- opens the browser automatically on start

## Requirements

- Node.js 22+
- A local SQLite database produced by wirewatch or a compatible capture daemon

For development or building from source:

- pnpm 10.33.0+

## Install

```bash
npm install -g wiremonitor
```

Verify the installation:

```bash
wm --help
```

The `wm` command is now available globally.

### From source

```bash
git clone https://github.com/psandis/wiremonitor.git
cd wiremonitor
pnpm install
pnpm build
npm link
```

Verify:

```bash
wm --help
```

The `wm` command is now available globally.

## Quick Start

Start the dashboard:

```bash
wm --db ~/.wirewatch/wirewatch.db
```

```
wiremonitor running at http://localhost:3311
```

Opens in your default browser. Updates automatically as new connections arrive. Stop with `Ctrl+C`.

## Dashboard

### Header

A fixed header shows:

- **WM logo** — brand mark on the left
- **Status pill** — green and pulsing when the capture daemon is running, red when stopped, polled every 5 seconds
- **Live pill** — shows the state of the SSE stream: `connecting`, `connected` (green pulse), or `offline` (red). Flashes briefly on each new event received
- **Theme toggle** — switches between dark and light mode, persisted to localStorage
- **Navigation** — Connections / Analyses / Stats

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

Filter bar above the table:

| Filter | Description |
|--------|-------------|
| Protocol | TCP or UDP |
| Direction | outbound / inbound / local |
| Process | Exact match on process name |
| Country | Two-letter country code |
| IP chip | Active when clicking a destination in Analyses — shows destination IP and clears on ✕ |

Direction is shown as an arrow badge: `→` outbound, `←` inbound, `⇄` local.

New rows animate in at the top as the SSE stream delivers them. Clicking a row opens a detail panel that slides in from the right showing the full connection record.

### Analyses

A scrollable list of analysis cards. Each card shows a risk badge (low / medium / high, color-coded), timestamp, AI provider and model, connection count, and a plain-language summary. Destination IPs mentioned in the summary text are clickable — clicking one filters the Connections view to that IP.

Flagged connections are grouped by process, then by destination. Each process entry shows the raw process name and, where known, a resolved full name in parentheses (e.g. `Code H (VS Code Helper)`). Each destination row shows the hostname or IP, port with a protocol label (e.g. `443 HTTPS`), and a connection count badge. Clicking a destination with a single connection opens the detail panel; clicking one with multiple connections filters the Connections view by that destination IP.

Process names are resolved via `public/process-labels.json` — a plain JSON file you can extend without rebuilding.

### Stats

Stat tiles show key numbers: total connections, analyses, sessions, oldest record, and database size. CSS bar charts show:

- Protocol distribution (TCP / UDP)
- Direction distribution (outbound / inbound / local)
- Top 10 processes by connection count
- Top 10 countries by connection count
- Top 10 destinations by connection count

## Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `server.port` | `3311` | HTTP server port |
| `server.host` | `127.0.0.1` | Bind address. Set to `0.0.0.0` to listen on all interfaces |
| `server.openBrowser` | `true` | Open browser automatically on start |
| `server.ssePollInterval` | `2000` | SSE poll interval in milliseconds |
| `db.path` | | Absolute path to the SQLite database file |

Edit `~/.wiremonitor/config.json` to set values:

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

| Flag | Description |
|------|-------------|
| `--port <n>` | HTTP server port |
| `--host <host>` | Bind address |
| `--no-open` | Do not open the browser on start |
| `--db <path>` | Path to the SQLite database file |
| `--config` | Print current configuration and exit |

## Storage

Default root:

```
~/.wiremonitor/
```

| Path | Description |
|------|-------------|
| `~/.wiremonitor/config.json` | wiremonitor configuration |

Override the root:

```bash
export WIREMONITOR_HOME=/path/to/custom/root
```

## API

wiremonitor exposes a local REST API on the same port as the dashboard.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/connections` | List connections |
| GET | `/api/connections/:id` | Single connection detail |
| GET | `/api/analyses` | List analyses |
| GET | `/api/stats` | Database statistics |
| GET | `/api/status` | Daemon status |
| GET | `/api/events` | SSE stream — emits `connection` events as new records arrive |

All endpoints return JSON.

### Query Parameters

`GET /api/connections` accepts:

| Parameter | Description |
|-----------|-------------|
| `limit` | Number of results (default: 100, max: 1000) |
| `offset` | Pagination offset |
| `since` | Unix timestamp in milliseconds — return connections after this time |
| `protocol` | Filter by protocol: `TCP` or `UDP` |
| `direction` | Filter by direction: `inbound`, `outbound`, or `local` |
| `process` | Filter by process name (exact match) |
| `dst_ip` | Filter by destination IP |

## Agent Integration

### OpenClaw Skill

Once installed globally (`npm install -g wiremonitor`), add a `SKILL.md` to your workspace:

```markdown
---
name: wiremonitor
description: View live network connections, AI analyses, and traffic statistics in a browser dashboard
version: 1.0.0
requires_binaries:
  - wm
---

When the user asks about network traffic or wants to view connections visually, use the wiremonitor API:

- To fetch recent connections: GET http://localhost:3311/api/connections
- To get connection detail: GET http://localhost:3311/api/connections/:id
- To list AI analyses: GET http://localhost:3311/api/analyses
- To get database stats: GET http://localhost:3311/api/stats
- To check daemon status: GET http://localhost:3311/api/status
```

## Tech Stack

| Tool | Purpose |
|------|---------|
| TypeScript | Language |
| Node.js 22+ | Runtime |
| better-sqlite3 | Read-only SQLite access |
| node:http | HTTP server, no framework |
| Vanilla JS / HTML / CSS | Dashboard, no frontend framework, no build step |
| Server-Sent Events | Real-time connection streaming |
| Vitest | Testing |
| Biome | Lint and format |
| tsup | Build |

## File Structure

```
wiremonitor/
├── src/
│   ├── server.ts              entry point — starts HTTP server, opens browser
│   ├── types.ts               shared TypeScript types
│   └── lib/
│       ├── config.ts          configuration load, save, and validation
│       ├── db.ts              read-only SQLite queries
│       ├── router.ts          HTTP request routing
│       ├── sse.ts             Server-Sent Events connection manager
│       └── api/
│           ├── connections.ts GET /api/connections, GET /api/connections/:id
│           ├── analyses.ts    GET /api/analyses
│           ├── stats.ts       GET /api/stats
│           └── status.ts      GET /api/status
├── public/
│   ├── index.html             dashboard shell
│   ├── app.js                 dashboard logic (vanilla JS)
│   ├── style.css              styles
│   └── process-labels.json    process name resolution map (extend without rebuilding)
├── tests/
│   ├── config.test.ts
│   ├── db.test.ts
│   ├── router.test.ts
│   └── sse.test.ts
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── biome.json
├── LICENSE
└── README.md
```

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
pnpm test
pnpm typecheck
pnpm lint
```

## Testing

```bash
pnpm test
```

Current bar:

- 64 tests across config, db, router, and sse modules
- integration tests use a real HTTP server on port 0 and a real seeded SQLite database
- SSE tests use fake timers to verify poller behavior without real delays

## Related

- 🦀 [Wirewatch](https://github.com/psandis/wirewatch) — Network traffic capture daemon with AI anomaly detection
- 🦀 [Psclawmcp](https://github.com/psandis/psclawmcp) — MCP server for the OpenClaw CLI ecosystem
- 🦀 [Feedclaw](https://github.com/psandis/feedclaw) — RSS/Atom feed reader and AI digest builder
- 🦀 [Dustclaw](https://github.com/psandis/dustclaw) — Find out what is eating your disk space
- 🦀 [Driftclaw](https://github.com/psandis/driftclaw) — Deployment drift detection across environments
- 🦀 [Dietclaw](https://github.com/psandis/dietclaw) — Codebase health monitor
- 🦀 [Mymailclaw](https://github.com/psandis/mymailclaw) — Email scanner, categorizer, and cleaner
- 🦀 [OpenClaw](https://github.com/openclaw/openclaw) — The open source AI assistant

## License

See [MIT](LICENSE)

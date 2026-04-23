// ── State ────────────────────────────────────────────────────────────────
const state = {
  connections: [],
  filters: { protocol: "", direction: "", process: "", country: "", dst_ip: "" },
  activeView: "connections",
};

// ── DOM refs ─────────────────────────────────────────────────────────────
const el = {
  themeToggle: document.getElementById("theme-toggle"),
  statusPill: document.getElementById("status-pill"),
  livePill: document.getElementById("live-pill"),
  connBody: document.getElementById("connections-body"),
  connCount: document.getElementById("conn-count"),
  filterProtocol: document.getElementById("filter-protocol"),
  filterDirection: document.getElementById("filter-direction"),
  filterProcess: document.getElementById("filter-process"),
  filterCountry: document.getElementById("filter-country"),
  filterIpChip: document.getElementById("filter-ip-chip"),
  filterIpLabel: document.getElementById("filter-ip-label"),
  filterIpClear: document.getElementById("filter-ip-clear"),
  analysesList: document.getElementById("analyses-list"),
  statsTiles: document.getElementById("stats-tiles"),
  chartProtocol: document.getElementById("chart-protocol"),
  chartDirection: document.getElementById("chart-direction"),
  chartProcesses: document.getElementById("chart-processes"),
  chartCountries: document.getElementById("chart-countries"),
  chartDest: document.getElementById("chart-destinations"),
  detailPanel: document.getElementById("detail-panel"),
  detailOverlay: document.getElementById("detail-overlay"),
  detailBody: document.getElementById("detail-body"),
  detailClose: document.getElementById("detail-close"),
};

// ── Utilities ────────────────────────────────────────────────────────────
function fmtTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtBytes(n) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function fmtDuration(firstMs, lastMs) {
  const s = Math.round((lastMs - firstMs) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

function fmtDbSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ── API ──────────────────────────────────────────────────────────────────
async function apiFetch(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

let processLabels = null;
async function getProcessLabels() {
  if (processLabels) return processLabels;
  try {
    const res = await fetch("/process-labels.json");
    processLabels = res.ok ? await res.json() : {};
  } catch {
    processLabels = {};
  }
  return processLabels;
}

// ── Status ───────────────────────────────────────────────────────────────
async function refreshStatus() {
  try {
    const status = await apiFetch("/api/status");
    const running = status.running;
    el.statusPill.className = `status-pill ${running ? "status-running" : "status-stopped"}`;
    el.statusPill.textContent = running ? "running" : "stopped";
  } catch {
    el.statusPill.className = "status-pill status-checking";
    el.statusPill.textContent = "unavailable";
  }
}

// ── Connections ──────────────────────────────────────────────────────────
function applyFilters(list) {
  const { protocol, direction, process: proc, country, dst_ip } = state.filters;
  return list.filter((c) => {
    if (protocol && c.protocol !== protocol) return false;
    if (direction && c.direction !== direction) return false;
    if (proc && !(c.process_name ?? "").toLowerCase().includes(proc.toLowerCase())) return false;
    if (country && (c.country_code ?? "").toUpperCase() !== country.toUpperCase()) return false;
    if (dst_ip && c.dst_ip !== dst_ip) return false;
    return true;
  });
}

function linkifySummary(text) {
  const IP_RE = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g;
  return esc(text).replace(IP_RE, (_, ip) =>
    `<span class="summary-ip" data-ip="${ip}">${ip}</span>`,
  );
}

function filterByIp(ip) {
  state.filters.dst_ip = ip;
  el.filterIpLabel.textContent = `ip: ${ip}`;
  el.filterIpChip.style.display = "inline-flex";
  switchView("connections");
}

function clearIpFilter() {
  state.filters.dst_ip = "";
  el.filterIpChip.style.display = "none";
  el.filterIpLabel.textContent = "";
  loadConnections();
}

const DIR_LABEL = { outbound: "↑ out", inbound: "↓ in", local: "⟷ local" };
function dirBadge(dir) {
  return `<span class="dir-badge dir-${esc(dir)}">${DIR_LABEL[dir] ?? esc(dir)}</span>`;
}

function renderConnectionRow(conn, animate = false) {
  const dst = conn.dst_hostname
    ? `${esc(conn.dst_hostname)}:${conn.dst_port ?? "?"}`
    : `${esc(conn.dst_ip)}:${conn.dst_port ?? "?"}`;

  const tr = document.createElement("tr");
  if (animate) tr.classList.add("row-new");
  tr.dataset.id = String(conn.id);
  tr.innerHTML = `
    <td class="td-id">${conn.id}</td>
    <td class="td-mono">${esc(conn.protocol)}</td>
    <td class="td-mono">${esc(conn.src_ip)}:${conn.src_port ?? "?"}</td>
    <td class="td-mono">${dst}</td>
    <td>${dirBadge(conn.direction)}</td>
    <td>${esc(conn.state ?? "—")}</td>
    <td>${esc(conn.process_name ?? "—")}</td>
    <td>${esc(conn.country_code ?? "—")}</td>
    <td class="td-mono">${fmtTime(conn.last_seen)}</td>
  `;
  tr.addEventListener("click", () => openDetail(conn.id));
  return tr;
}

function renderConnections() {
  const filtered = applyFilters(state.connections);
  el.connCount.textContent = `${filtered.length} connection${filtered.length !== 1 ? "s" : ""}`;

  const frag = document.createDocumentFragment();
  for (const conn of filtered) {
    frag.appendChild(renderConnectionRow(conn));
  }
  el.connBody.replaceChildren(frag);
}

async function loadConnections() {
  try {
    const params = new URLSearchParams({ limit: "200" });
    if (state.filters.dst_ip) params.set("dst_ip", state.filters.dst_ip);
    const data = await apiFetch(`/api/connections?${params}`);
    state.connections = data;
    renderConnections();
  } catch {
    el.connBody.innerHTML = `<tr><td colspan="9" class="empty-state">Failed to load connections.</td></tr>`;
  }
}

// ── SSE ──────────────────────────────────────────────────────────────────
function setLivePill(state) {
  el.livePill.className = `live-pill live-${state}`;
  el.livePill.textContent = state === "connected" ? "live" : state === "offline" ? "offline" : "connecting";
}

function flashLivePill() {
  el.livePill.classList.remove("flash");
  void el.livePill.offsetWidth;
  el.livePill.classList.add("flash");
}

function initSSE() {
  const source = new EventSource("/api/events");

  source.addEventListener("connection", (e) => {
    const conn = JSON.parse(e.data);
    state.connections.unshift(conn);
    flashLivePill();

    if (state.activeView !== "connections") return;
    const filtered = applyFilters([conn]);
    if (filtered.length === 0) return;

    const row = renderConnectionRow(conn, true);
    el.connBody.insertBefore(row, el.connBody.firstChild);
    el.connCount.textContent = `${applyFilters(state.connections).length} connection${applyFilters(state.connections).length !== 1 ? "s" : ""}`;
  });

  source.addEventListener("open", () => {
    setLivePill("connected");
    loadConnections();
  });

  source.addEventListener("error", () => {
    setLivePill("offline");
  });
}

// ── Analyses ─────────────────────────────────────────────────────────────
const PORT_LABELS = {
  21: "FTP", 22: "SSH", 25: "SMTP", 53: "DNS", 80: "HTTP",
  443: "HTTPS", 587: "SMTP", 993: "IMAPS", 8080: "HTTP", 8443: "HTTPS",
};

async function renderAnalysisCard(a) {
  let flagsHtml = "";
  try {
    const flags = JSON.parse(a.flags);
    if (Array.isArray(flags) && flags.length > 0) {
      const ids = flags.map((f) => (typeof f === "object" ? f.id : f));
      const [conns, labels] = await Promise.all([
        Promise.all(ids.map((id) => apiFetch(`/api/connections/${id}`).catch(() => null))),
        getProcessLabels(),
      ]);

      // Group by process → destination
      const byProcess = new Map();
      conns.forEach((conn, i) => {
        if (!conn) return;
        const proc = conn.process_name ?? "unknown";
        if (!byProcess.has(proc)) byProcess.set(proc, new Map());
        const destKey = `${conn.dst_ip}|${conn.dst_port}`;
        const dest = byProcess.get(proc);
        if (!dest.has(destKey)) dest.set(destKey, { conn, id: ids[i], count: 0 });
        dest.get(destKey).count++;
      });

      const blocks = [...byProcess.entries()].map(([proc, destinations]) => {
        const label = labels[proc];
        const procName = label ? `${esc(proc)} <span class="flag-proc-label">(${esc(label.name)})</span>` : esc(proc);
        const procDesc = label?.description ? `<span class="flag-proc-desc">${esc(label.description)}</span>` : "";
        const hasUnencrypted = [...destinations.values()].some(({ conn }) => conn.dst_port === 80);
        const warnTag = hasUnencrypted ? `<span class="flag-warn-tag">⚠ unencrypted traffic</span>` : "";

        const destRows = [...destinations.values()].map(({ conn, id, count }) => {
          const dest = conn.dst_hostname ?? conn.dst_ip ?? "?";
          const port = conn.dst_port;
          const portService = PORT_LABELS[port] ?? "";
          const portStr = port ? `${port}${portService ? ` (${portService})` : ""}` : "—";
          const countStr = count > 1 ? `${count} connections` : "1 connection";
          const warn = port === 80 ? " flag-dest-warn" : "";
          return `<div class="flag-dest${warn}" data-id="${esc(id)}" data-ip="${esc(conn.dst_ip)}" data-count="${count}">${esc(dest)}<span class="flag-dest-port">${portStr}</span><span class="flag-dest-count">${countStr}</span></div>`;
        }).join("");

        return `<div class="flag-group">
          <div class="flag-proc-header">${procName}${warnTag}${procDesc}</div>
          <div class="flag-dest-list">${destRows}</div>
        </div>`;
      }).join("");

      flagsHtml = `<div class="analysis-flags">${blocks}</div>`;
    }
  } catch {
    // flags not parseable — skip
  }

  const div = document.createElement("div");
  div.className = "analysis-card";
  div.innerHTML = `
    <div class="analysis-card-header">
      <span class="risk-badge risk-${esc(a.risk_level)}">${esc(a.risk_level)}</span>
      <span class="analysis-meta">${fmtTime(a.created_at)} &nbsp;·&nbsp; ${esc(a.provider)}/${esc(a.model)} &nbsp;·&nbsp; ${a.connection_count} connections</span>
    </div>
    <p class="analysis-summary">${linkifySummary(a.summary)}</p>
    ${flagsHtml}
  `;

  div.querySelectorAll(".flag-dest[data-id]").forEach((item) => {
    item.addEventListener("click", () => {
      if (Number(item.dataset.count) > 1) {
        filterByIp(item.dataset.ip);
      } else {
        openDetail(Number(item.dataset.id));
      }
    });
  });

  div.querySelectorAll(".summary-ip[data-ip]").forEach((item) => {
    item.addEventListener("click", () => filterByIp(item.dataset.ip));
  });

  return div;
}

async function loadAnalyses() {
  try {
    const data = await apiFetch("/api/analyses?limit=50");
    if (data.length === 0) {
      el.analysesList.innerHTML = `<div class="empty-state">No analyses yet. Run <code>ww analyze</code> to generate one.</div>`;
      return;
    }
    const frag = document.createDocumentFragment();
    for (const a of data) frag.appendChild(await renderAnalysisCard(a));
    el.analysesList.replaceChildren(frag);
  } catch {
    el.analysesList.innerHTML = `<div class="empty-state">Failed to load analyses.</div>`;
  }
}

// ── Stats ────────────────────────────────────────────────────────────────
function renderBarChart(container, rows, getLabel, valueKey) {
  const max = Math.max(...rows.map((r) => r[valueKey]), 1);
  const frag = document.createDocumentFragment();
  for (const row of rows) {
    const label = typeof getLabel === "function" ? getLabel(row) : row[getLabel];
    const pct = Math.round((row[valueKey] / max) * 100);
    const div = document.createElement("div");
    div.className = "bar-row";
    div.innerHTML = `
      <span class="bar-label" title="${esc(label)}">${esc(label ?? "—")}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <span class="bar-value">${row[valueKey]}</span>
    `;
    frag.appendChild(div);
  }
  container.replaceChildren(frag);
}

async function loadStats() {
  try {
    const s = await apiFetch("/api/stats");

    el.statsTiles.innerHTML = `
      <div class="stat-tile">
        <div class="stat-tile-label">Connections</div>
        <div class="stat-tile-value">${s.totalConnections.toLocaleString()}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile-label">Analyses</div>
        <div class="stat-tile-value">${s.totalAnalyses.toLocaleString()}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile-label">Sessions</div>
        <div class="stat-tile-value">${s.totalSessions.toLocaleString()}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile-label">Oldest Record</div>
        <div class="stat-tile-value" style="font-size:13px">${s.oldestConnection ? fmtTime(s.oldestConnection) : "—"}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile-label">DB Size</div>
        <div class="stat-tile-value" style="font-size:16px">${fmtDbSize(s.dbSizeBytes)}</div>
      </div>
    `;

    renderBarChart(el.chartProtocol, s.byProtocol, "protocol", "count");
    renderBarChart(el.chartDirection, s.byDirection, "direction", "count");
    renderBarChart(el.chartProcesses, s.topProcesses, "process_name", "count");
    renderBarChart(el.chartCountries, s.topCountries, "country_code", "count");
    renderBarChart(el.chartDest, s.topDestinations, (r) => r.dst_hostname ?? r.dst_ip, "count");
  } catch {
    el.statsTiles.innerHTML = `<div class="empty-state">Failed to load stats.</div>`;
  }
}

// ── Detail Panel ─────────────────────────────────────────────────────────
async function openDetail(id) {
  try {
    const c = await apiFetch(`/api/connections/${id}`);

    const rows = [
      ["Protocol", c.protocol],
      ["Direction", c.direction],
      ["Source", `${c.src_ip}:${c.src_port ?? "?"}`],
      ["Dest IP", `${c.dst_ip}:${c.dst_port ?? "?"}`],
      ["Hostname", c.dst_hostname ?? null],
      ["Country", c.country_code ?? null],
      ["State", c.state ?? null],
      ["Process", c.process_name ? `${c.process_name} (PID ${c.process_pid ?? "?"})` : null],
      ["Capture", c.capture_mode],
      ["Interface", c.interface ?? null],
      ["Bytes Sent", c.bytes_sent != null ? fmtBytes(c.bytes_sent) : null],
      ["Bytes Recv", c.bytes_recv != null ? fmtBytes(c.bytes_recv) : null],
      ["First Seen", fmtTime(c.first_seen)],
      ["Last Seen", fmtTime(c.last_seen)],
      ["Duration", fmtDuration(c.first_seen, c.last_seen)],
    ].filter(([, v]) => v !== null);

    el.detailBody.innerHTML = rows
      .map(
        ([k, v]) => `
        <div class="detail-row">
          <span class="detail-key">${esc(k)}</span>
          <span class="detail-val">${esc(String(v))}</span>
        </div>
      `,
      )
      .join("");

    el.detailPanel.classList.add("open");
    el.detailPanel.setAttribute("aria-hidden", "false");
    el.detailOverlay.classList.add("visible");
  } catch {
    // silently ignore — connection may have been pruned
  }
}

function closeDetail() {
  el.detailPanel.classList.remove("open");
  el.detailPanel.setAttribute("aria-hidden", "true");
  el.detailOverlay.classList.remove("visible");
}

// ── Navigation ───────────────────────────────────────────────────────────
const viewLoaders = {
  connections: loadConnections,
  analyses: loadAnalyses,
  stats: loadStats,
};

function switchView(name) {
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.remove("active");
  });
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.remove("active");
  });

  document.getElementById(`view-${name}`).classList.add("active");
  document.querySelector(`.nav-btn[data-view="${name}"]`).classList.add("active");

  state.activeView = name;
  viewLoaders[name]?.();
}

// ── Init ─────────────────────────────────────────────────────────────────
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

el.filterProtocol.addEventListener("change", () => {
  state.filters.protocol = el.filterProtocol.value;
  renderConnections();
});

el.filterDirection.addEventListener("change", () => {
  state.filters.direction = el.filterDirection.value;
  renderConnections();
});

el.filterProcess.addEventListener(
  "input",
  debounce(() => {
    state.filters.process = el.filterProcess.value.trim();
    renderConnections();
  }, 200),
);

el.filterCountry.addEventListener(
  "input",
  debounce(() => {
    state.filters.country = el.filterCountry.value.trim();
    renderConnections();
  }, 200),
);

el.filterIpClear.addEventListener("click", clearIpFilter);
el.detailClose.addEventListener("click", closeDetail);
el.detailOverlay.addEventListener("click", closeDetail);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDetail();
});

// ── Theme ─────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  el.themeToggle.textContent = theme === "light" ? "☾" : "☀";
  localStorage.setItem("wm-theme", theme);
}

const savedTheme = localStorage.getItem("wm-theme") ?? "dark";
applyTheme(savedTheme);

el.themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "light" ? "dark" : "light");
});

refreshStatus();
setInterval(refreshStatus, 5000);

initSSE();

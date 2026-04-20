import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { WiremonitorConfig } from "../types.js";

const DEFAULT_CONFIG: WiremonitorConfig = {
  server: {
    port: 3311,
    host: "127.0.0.1",
    openBrowser: true,
    ssePollInterval: 2000,
  },
  db: {
    path: "",
  },
};

export function getHome(): string {
  return process.env.WIREMONITOR_HOME ?? join(homedir(), ".wiremonitor");
}

export function getConfigPath(): string {
  return join(getHome(), "config.json");
}

export function resolveDbPath(config: WiremonitorConfig): string {
  if (!config.db.path) {
    throw new Error(
      "db.path is not set. Add it to ~/.wiremonitor/config.json or pass --db <path>.",
    );
  }
  return config.db.path;
}

function ensureHome(): void {
  const home = getHome();
  if (!existsSync(home)) {
    mkdirSync(home, { recursive: true });
  }
}

function mergeConfig(
  defaults: WiremonitorConfig,
  partial: Partial<WiremonitorConfig>,
): WiremonitorConfig {
  return {
    server: { ...defaults.server, ...partial.server },
    db: { ...defaults.db, ...partial.db },
  };
}

export function loadConfig(): WiremonitorConfig {
  ensureHome();
  const path = getConfigPath();
  if (!existsSync(path)) {
    return structuredClone(DEFAULT_CONFIG);
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Partial<WiremonitorConfig>;
    return mergeConfig(DEFAULT_CONFIG, raw);
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(config: WiremonitorConfig): void {
  ensureHome();
  writeFileSync(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

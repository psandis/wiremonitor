export type CaptureMode = "passive" | "deep";
export type ConnectionDirection = "inbound" | "outbound" | "local";
export type RiskLevel = "low" | "medium" | "high";
export type AiProvider = "anthropic" | "openai";

export interface Connection {
  id: number;
  protocol: string;
  src_ip: string;
  src_port: number | null;
  dst_ip: string;
  dst_port: number | null;
  dst_hostname: string | null;
  country_code: string | null;
  direction: ConnectionDirection;
  state: string | null;
  process_name: string | null;
  process_pid: number | null;
  bytes_sent: number | null;
  bytes_recv: number | null;
  interface: string | null;
  capture_mode: CaptureMode;
  first_seen: number;
  last_seen: number;
}

export interface Analysis {
  id: number;
  created_at: number;
  provider: AiProvider;
  model: string;
  connection_count: number;
  summary: string;
  flags: string;
  risk_level: RiskLevel;
}

export interface Session {
  id: number;
  started_at: number;
  stopped_at: number | null;
  capture_mode: CaptureMode;
  connection_count: number;
}

export interface DbStats {
  totalConnections: number;
  totalAnalyses: number;
  totalSessions: number;
  oldestConnection: number | null;
  dbSizeBytes: number;
  topDestinations: Array<{ dst_ip: string; dst_hostname: string | null; count: number }>;
  topProcesses: Array<{ process_name: string; count: number }>;
  topCountries: Array<{ country_code: string; count: number }>;
  byProtocol: Array<{ protocol: string; count: number }>;
  byDirection: Array<{ direction: string; count: number }>;
}

export interface QueryConnectionsOptions {
  limit?: number;
  offset?: number;
  since?: number;
  protocol?: string;
  dst_ip?: string;
  direction?: ConnectionDirection;
  process_name?: string;
}

export interface WiremonitorConfig {
  server: {
    port: number;
    host: string;
    openBrowser: boolean;
    ssePollInterval: number;
  };
  db: {
    path: string;
  };
}

export interface DaemonStatus {
  running: boolean;
  session: Session | null;
}

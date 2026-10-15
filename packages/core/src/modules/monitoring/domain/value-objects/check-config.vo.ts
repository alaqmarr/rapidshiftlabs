export interface HttpCheckConfig {
  enabled: boolean;
  intervalSeconds: number; // default 60
  timeoutMs: number; // default 10,000
  method: "GET" | "HEAD" | "POST"; // default "GET"
  expectedStatusCodes: number[]; // default [200, 201, 204, 301, 302]
  keyword?: string | null;
  headers?: Record<string, string>;
  consecutiveThreshold: number; // default 3 (failures before DOWN)
}

export interface SslCheckConfig {
  enabled: boolean;
  intervalSeconds: number; // default 21,600 (6 hours)
  port: number; // default 443
  alertThresholdDays: number[]; // default [30, 14, 7, 1]
  verifyChain: boolean; // default true
}

export interface DnsCheckConfig {
  enabled: boolean;
  intervalSeconds: number; // default 900 (15 minutes)
  expectedRecords?: {
    a?: string[];
    aaaa?: string[];
    cname?: string;
    mx?: string[];
    txt?: string[];
    ns?: string[];
  } | null;
}

export interface RdapCheckConfig {
  enabled: boolean;
  intervalSeconds: number; // default 86,400 (24 hours)
  alertThresholdDays: number[]; // default [60, 30, 7]
}

export interface CheckConfigurations {
  http: HttpCheckConfig;
  ssl: SslCheckConfig;
  dns: DnsCheckConfig;
  rdap: RdapCheckConfig;
}

export function createDefaultCheckConfigurations(
  overrides?: Partial<{
    http: Partial<HttpCheckConfig>;
    ssl: Partial<SslCheckConfig>;
    dns: Partial<DnsCheckConfig>;
    rdap: Partial<RdapCheckConfig>;
  }>,
): CheckConfigurations {
  return {
    http: {
      enabled: true,
      intervalSeconds: 60,
      timeoutMs: 10_000,
      method: "GET",
      expectedStatusCodes: [200, 201, 204, 301, 302],
      keyword: null,
      consecutiveThreshold: 3,
      ...overrides?.http,
    },
    ssl: {
      enabled: true,
      intervalSeconds: 21_600,
      port: 443,
      alertThresholdDays: [30, 14, 7, 1],
      verifyChain: true,
      ...overrides?.ssl,
    },
    dns: {
      enabled: true,
      intervalSeconds: 900,
      expectedRecords: null,
      ...overrides?.dns,
    },
    rdap: {
      enabled: true,
      intervalSeconds: 86_400,
      alertThresholdDays: [60, 30, 7],
      ...overrides?.rdap,
    },
  };
}

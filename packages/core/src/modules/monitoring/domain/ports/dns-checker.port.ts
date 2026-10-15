export interface DnsRecordsSnapshot {
  a: string[];
  aaaa: string[];
  cname: string[];
  mx: Array<{ exchange: string; priority: number }>;
  txt: string[];
  ns: string[];
}

export interface DnsDriftItem {
  recordType: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS";
  added: string[];
  removed: string[];
  description: string;
}

export interface ExpectedDnsRecords {
  a?: string[];
  aaaa?: string[];
  cname?: string[] | string;
  mx?: Array<{ exchange: string; priority: number }> | string[];
  txt?: string[];
  ns?: string[];
}

export interface DnsCheckResult {
  hostname: string;
  resolved: boolean;
  records: DnsRecordsSnapshot;
  driftDetected: boolean;
  drifts: DnsDriftItem[];
  errorMessage?: string;
  timestamp: number;
}

export interface DnsCheckerPort {
  check(hostname: string, baseline?: ExpectedDnsRecords | null): Promise<DnsCheckResult>;
}
